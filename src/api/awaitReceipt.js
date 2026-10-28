/**
 * Receipt await (G53 / G98 / G173). Reads status immediately, returns at once on terminal fate, and
 * otherwise polls `GET <status_url>` (held with `wait_ms`, then backoff 250 ms to 5 s with bounded
 * jitter) until one monotonic deadline (30 s default). A timeout RESOLVES with the last pending
 * receipt flagged `client_timed_out: true`: it is client-only, never a server transition.
 */
import { APIError } from '../errors/APIError.js';
import { decodeReceipt, legacyNoStatus, timedOut } from './receipt.js';
import { isRetryable } from './submit.js';

export const DEFAULT_TIMEOUT_MS = 30000;
export const MAX_HOLD_MS = 10000;
const BACKOFF_MIN_MS = 250;
const BACKOFF_MAX_MS = 5000;

const abortReason = signal => signal.reason ?? new DOMException('This operation was aborted', 'AbortError');

/** Sleep that a caller abort ends at once (the timer is always cleared). */
const defaultSleep = (ms, signal) => new Promise((resolve, reject) => {
  const onAbort = () => { clearTimeout(timer); reject(abortReason(signal)); };
  const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, ms);
  signal?.addEventListener('abort', onAbort, { once: true });
});

const DEADLINE = Symbol('await-deadline');

/**
 * Run `start(signal)` under the await deadline and the caller's signal. The internal signal aborts
 * the in-flight request when either fires, and the race also settles for a transport that ignores
 * it. Resolves `DEADLINE` when the deadline wins, rejects with the caller's AbortError when the
 * caller cancels; timer and listeners are released on every exit.
 */
async function boundedBy(remainingMs, callerSignal, start) {
  if (callerSignal?.aborted) throw abortReason(callerSignal);
  const ctl = new AbortController();
  let timer;
  let onCaller;
  const gate = new Promise((resolve, reject) => {
    timer = setTimeout(() => { ctl.abort(); resolve(DEADLINE); }, Math.max(0, remainingMs));
    onCaller = () => { ctl.abort(abortReason(callerSignal)); reject(abortReason(callerSignal)); };
    callerSignal?.addEventListener('abort', onCaller, { once: true });
  });
  const work = Promise.resolve().then(() => start(ctl.signal));
  work.catch(() => {}); // a late rejection after the gate won is not an unhandled one
  try {
    return await Promise.race([work, gate]);
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener('abort', onCaller);
  }
}

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
  if (receipt?.legacy) throw legacyNoStatus();
  if (!receipt || typeof receipt.status_url !== 'string' || !receipt.status_url) {
    throw new TypeError('awaitReceipt needs a receipt with a status_url');
  }
  // A committed terminal receipt is immutable (ST8): nothing to wait for.
  if (receipt.terminal) return receipt;

  if (signal?.aborted) throw abortReason(signal);
  const deadline = now() + timeoutMs;
  let current = receipt;
  let failures = 0; // consecutive failed reads
  let idle = 0; // consecutive successful reads that showed no progress
  for (;;) {
    const remaining = deadline - now();
    if (remaining <= 0) return timedOut(current);
    const wait = Math.max(0, Math.min(holdMs, MAX_HOLD_MS, Math.floor(remaining)));
    const sentAt = now();
    let minDelay = 0;
    let progressed = false;
    try {
      // One deadline bounds connection, read and the held GET, not only the gaps between them.
      const raw = await boundedBy(remaining, signal, bound => api.get(statusPath(current, wait), { signal: bound }));
      if (raw === DEADLINE) return timedOut(current);
      const next = decodeReceipt(raw);
      progressed = (next.status_version ?? 0) > (current.status_version ?? 0)
        || (wait > 0 && now() - sentAt >= wait);
      current = next;
      failures = 0;
      idle = progressed ? 0 : idle + 1;
      if (current.terminal) return current;
      if (Number.isFinite(current.retry_after_ms)) minDelay = current.retry_after_ms;
    } catch (error) {
      // A cancelled read is the caller's answer. If the deadline fired during the read, the last pending receipt is.
      if (signal?.aborted) throw error;
      // Transient read failures back off until the deadline; anything else (404, a typed refusal) is the answer.
      if (!(error instanceof APIError) || !isRetryable(error)) throw error;
      failures += 1;
      if (Number.isFinite(error.retryAfterMs)) minDelay = error.retryAfterMs;
      console.warn(`[await] status read failed (${error.status || 'transport loss'}); backing off, run_id=${current.run_id}`);
    }
    if (progressed && minDelay === 0) continue; // a successful held poll is reissued without ordinary backoff
    // Failed reads and unchanged short polls each step the 250 ms to 5 s window: the first unchanged poll waits 250 ms.
    const step = failures + Math.max(0, idle - 1);
    const ceiling = Math.min(BACKOFF_MAX_MS, BACKOFF_MIN_MS * 2 ** step);
    const delay = Math.max(minDelay, BACKOFF_MIN_MS, ceiling * (0.5 + random() * 0.5));
    const left = deadline - now();
    // A server minimum that cannot fit returns the pending receipt without another request.
    if (minDelay > left) return timedOut(current);
    const pause = Math.min(delay, left);
    await boundedBy(pause, signal, bound => sleep(pause, bound));
  }
}
