/**
 * Retry identity and bounded same-key submission retry (ST14 / G55 / G178).
 *
 * One `idempotency_key` is minted per logical save or public stage submission and sent in the
 * request body, byte-identical on every attempt. The retry sits at this save/stage layer, never in
 * `fetch/recovery.js` (which replays only a 401 after token refresh, with the same serialized request).
 */
import { APIError } from '../errors/APIError.js';
import { AdmissionConflictError } from '../errors/ReceiptErrors.js';
import { admissionErrorOf } from './receipt.js';

export const MAX_ATTEMPTS = 4;
export const BACKOFF_WINDOWS_MS = Object.freeze([200, 400, 800]);
export const RETRYABLE_STATUS = Object.freeze([408, 429, 500, 502, 503, 504]);
export const GENERATED_KEY_RE = /^sm2_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CALLER_KEY_RE = /^[A-Za-z0-9._:-]{1,128}$/;

function uuidV4() {
  const c = globalThis.crypto;
  if (typeof c?.randomUUID === 'function') return c.randomUUID().toLowerCase();
  if (typeof c?.getRandomValues === 'function') {
    const b = c.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }
  // A weak PRNG key would break the never-duplicate guarantee, so refuse instead of degrading.
  throw new Error('No secure random source (crypto.randomUUID / getRandomValues) to mint an idempotency_key');
}

/** `sm2_` + lowercase UUID v4: the exact generated format the service requires of SDK-minted keys. */
export function newIdempotencyKey() {
  return `sm2_${uuidV4()}`;
}

/** The caller's key when given (1-128 chars of `[A-Za-z0-9._:-]`), else a fresh generated one. */
export function resolveIdempotencyKey(provided) {
  if (provided === undefined || provided === null) return newIdempotencyKey();
  if (typeof provided !== 'string' || !CALLER_KEY_RE.test(provided)) {
    throw new TypeError('idempotencyKey must be 1-128 characters from [A-Za-z0-9._:-]');
  }
  return provided;
}

/** True for transport loss (BaseAPI's `network_error`) and the six retryable statuses. */
export function isRetryable(error) {
  if (!(error instanceof APIError)) return false; // AbortError and programming errors pass through
  if (error.status === 0) return error.detail === 'network_error';
  return RETRYABLE_STATUS.includes(error.status);
}

const defaultSleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Run `send` (one POST/PATCH of an already-built body) with at most four attempts. Retries only
 * transport loss and 408/429/500/502/503/504, after full jitter within 0-200/0-400/0-800 ms, honoring
 * `Retry-After` (`error.retryAfterMs`) as a minimum on 429/503. When that minimum cannot fit the
 * caller's `deadlineMs`, or attempts run out, the last error is thrown with `idempotencyKey`
 * attached so a later explicit retry reuses the same key. 400/401/403/404/409/422 and a
 * typed `retry_key_expired` are never retried.
 *
 * @param {() => Promise<any>} send
 * @param {{idempotencyKey: string, deadlineMs?: number, sleep?: (ms:number)=>Promise<void>, random?: ()=>number, now?: ()=>number}} options
 */
export async function submitWithRetry(send, { idempotencyKey, deadlineMs = Infinity, sleep = defaultSleep, random = Math.random, now = () => globalThis.performance.now() } = {}) {
  const start = now();
  let attempt = 1;
  for (;;) {
    try {
      return await send();
    } catch (error) {
      const fail = (reason) => {
        if (error && typeof error === 'object') error.idempotencyKey = idempotencyKey;
        console.warn(`[save] giving up after ${attempt} attempt(s) with key ${idempotencyKey}: ${reason}; reuse the key for an explicit retry`);
        throw error;
      };
      if (!isRetryable(error)) {
        if (error && typeof error === 'object') error.idempotencyKey = idempotencyKey;
        throw error;
      }
      if (attempt >= MAX_ATTEMPTS) fail(`attempts exhausted (${error.message})`);
      let delay = random() * BACKOFF_WINDOWS_MS[attempt - 1];
      if ((error.status === 429 || error.status === 503) && Number.isFinite(error.retryAfterMs)) {
        delay = Math.max(delay, error.retryAfterMs);
      }
      if (now() - start + delay > deadlineMs) fail('the retry delay does not fit the caller deadline');
      console.warn(`[save] attempt ${attempt} failed (${error.status || 'transport loss'}); retrying with the same key in ${Math.round(delay)} ms`);
      await sleep(delay);
      attempt += 1;
    }
  }
}

/**
 * Map a 409 pre-admission rejection to `AdmissionConflictError` (scoped code from the contract's
 * `admission_error`). Any other error, including a 409 with no scoped code, is returned untouched.
 */
export function mapAdmissionError(error, { expectedRevision = null } = {}) {
  if (!(error instanceof APIError) || error.status !== 409) return error;
  const found = admissionErrorOf(error.detail);
  if (!found) return error;
  const mapped = new AdmissionConflictError(found.found.message || found.found.code, found.found.code, {
    status: 409,
    detail: error.detail,
    expectedRevision: found.body.expected_revision ?? expectedRevision,
    currentRevision: found.body.current_revision ?? null,
  });
  if (error.idempotencyKey) mapped.idempotencyKey = error.idempotencyKey;
  return mapped;
}
