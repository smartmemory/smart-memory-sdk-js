/**
 * Receipt await (G53 / G98 / G173). Reads status immediately, returns at once on terminal fate, and
 * otherwise polls `GET <status_url>` (held with `wait_ms`, then backoff 250 ms to 5 s with bounded
 * jitter) until one monotonic deadline (30 s default). A timeout RESOLVES with the last pending
 * receipt flagged `client_timed_out: true`: it is client-only, never a server transition.
 */
import { APIError } from '../errors/APIError.js';
import { decodeReceipt, timedOut } from './receipt.js';
import { isRetryable } from './submit.js';

export const DEFAULT_TIMEOUT_MS = 30000;
export const MAX_HOLD_MS = 10000;
const BACKOFF_MIN_MS = 250;
const BACKOFF_MAX_MS = 5000;

const defaultSleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function statusPath(receipt, waitMs) {
  const url = receipt.status_url;
  if (!waitMs) return url;
  return `${url}${url.includes('?') ? '&' : '?'}wait_ms=${waitMs}`;
}

/**
 * @param {import('./BaseAPI.js').BaseAPI} api
 * @param {import('./receipt.js').SaveReceipt} receipt A receipt from a save, edit or stage call.
 * @param {{timeoutMs?: number, holdMs?: number, signal?: AbortSignal, sleep?: Function, now?: ()=>number, random?: ()=>number}} [options]
 * @returns {Promise<import('./receipt.js').SaveReceipt>} terminal, or pending with `client_timed_out: true`.
 */
export async function awaitReceipt(api, receipt, { timeoutMs = DEFAULT_TIMEOUT_MS, holdMs = MAX_HOLD_MS, signal, sleep = defaultSleep, now = () => globalThis.performance.now(), random = Math.random } = {}) {
  if (!receipt || typeof receipt.status_url !== 'string' || !receipt.status_url) {
    throw new TypeError('awaitReceipt needs a receipt with a status_url');
  }
  // A committed terminal receipt is immutable (ST8): nothing to wait for.
  if (receipt.terminal) return receipt;

  const deadline = now() + timeoutMs;
  let current = receipt;
  let failures = 0;
  for (;;) {
    const remaining = deadline - now();
    if (remaining <= 0) return timedOut(current);
    const wait = Math.max(0, Math.min(holdMs, MAX_HOLD_MS, Math.floor(remaining)));
    const sentAt = now();
    let minDelay = 0;
    let progressed = false;
    try {
      const next = decodeReceipt(await api.get(statusPath(current, wait), signal ? { signal } : {}));
      progressed = (next.status_version ?? 0) > (current.status_version ?? 0)
        || (wait > 0 && now() - sentAt >= wait);
      current = next;
      failures = 0;
      if (current.terminal) return current;
      if (Number.isFinite(current.retry_after_ms)) minDelay = current.retry_after_ms;
    } catch (error) {
      // Transient read failures back off until the deadline; anything else (404, a typed refusal) is the answer.
      if (!(error instanceof APIError) || !isRetryable(error)) throw error;
      failures += 1;
      if (Number.isFinite(error.retryAfterMs)) minDelay = error.retryAfterMs;
      console.warn(`[await] status read failed (${error.status || 'transport loss'}); backing off, run_id=${current.run_id}`);
    }
    if (progressed && minDelay === 0) continue; // a successful held poll is reissued without ordinary backoff
    const ceiling = Math.min(BACKOFF_MAX_MS, BACKOFF_MIN_MS * 2 ** Math.max(0, failures));
    const delay = Math.max(minDelay, BACKOFF_MIN_MS, ceiling * (0.5 + random() * 0.5));
    const left = deadline - now();
    // A server minimum that cannot fit returns the pending receipt without another request.
    if (minDelay > left) return timedOut(current);
    await sleep(Math.min(delay, left));
  }
}
