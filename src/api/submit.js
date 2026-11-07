/**
 * Retry identity and bounded submission retry (ST14 / G55 / G178).
 *
 * One `idempotency_key` is minted per logical save or public stage submission and sent in the
 * request body, byte-identical on every attempt. Hosted writes have no replay guarantee.
 * The retry sits at this save/stage layer, never in
 * `fetch/recovery.js` (which replays only a 401 after token refresh, with the same serialized request).
 */
import { APIError } from '../errors/APIError.js';
import { AdmissionConflictError, SubmitScopeChangedError, WriteOutcomeUnknown } from '../errors/ReceiptErrors.js';
import { admissionErrorOf } from './receipt.js';

export const MAX_ATTEMPTS = 4;
export const BACKOFF_WINDOWS_MS = Object.freeze([200, 400, 800]);
// Read polling can retry ambiguous outcomes because it does not execute a write.
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
 * The complete logical request, frozen at its first send (ST14). The copy is what the wire form
 * would carry (a JSON round trip), so a caller changing a nested object while an attempt is in
 * flight can never change a replay under the same `idempotency_key`.
 * @template T
 * @param {T} body
 * @returns {T}
 */
export function snapshotRequest(body) {
  return JSON.parse(JSON.stringify(body));
}

/**
      if (!(error instanceof APIError) || error.status !== 429) {
        if (error && typeof error === 'object') {
          error.idempotencyKey = idempotencyKey;
          error.attempts = attempt;
        }
