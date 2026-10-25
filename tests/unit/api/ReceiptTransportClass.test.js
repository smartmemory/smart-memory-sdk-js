import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BaseAPI } from '../../../src/api/BaseAPI.js';
import { MemoryAPI } from '../../../src/api/MemoryAPI.js';
import { PipelineAPI } from '../../../src/api/PipelineAPI.js';
import { APIError } from '../../../src/errors/APIError.js';
import { StageChainError } from '../../../src/errors/ReceiptErrors.js';
import { awaitReceipt } from '../../../src/api/awaitReceipt.js';
import { decodeReceipt } from '../../../src/api/receipt.js';
import { RECEIPT, STAGE_PENDING, TERMINAL } from './receiptFixtures.js';

// REL-CALLERS-JSSDK-FU-BUNDLE-1: the await / retry class of the 2.0 save transport. One row per class
// member (M1 deadline, M2 request snapshot, M3 poll backoff, M4 stage error contract) and per sibling site.
// Class sweep: awaitReceipt (MemoryAPI + PipelineAPI), MemoryAPI._save (create, update, ingest,
// ingestConversation, ingestDocument), PipelineAPI._stage (five stages share it).

beforeEach(() => { vi.spyOn(console, 'warn').mockImplementation(() => {}); });
afterEach(() => vi.restoreAllMocks());

const pending = () => decodeReceipt(RECEIPT);
const stageTransport = (handler) => ({ get: vi.fn(handler) });
const never = () => new Promise(() => {});

function trackedSignal() {
  const ctl = new AbortController();
  const live = new Set();
  const add = ctl.signal.addEventListener.bind(ctl.signal);
  const remove = ctl.signal.removeEventListener.bind(ctl.signal);
  ctl.signal.addEventListener = (type, fn, opts) => { live.add(fn); return add(type, fn, opts); };
  ctl.signal.removeEventListener = (type, fn, opts) => { live.delete(fn); return remove(type, fn, opts); };
  return { ctl, live };
}

function realBase(handler) {
  const bodies = [];
  const auth = {
    apiBaseUrl: 'https://t.invalid', getAuthHeaders: h => h || {}, getRequestOptions: x => x, mode: 'api-key',
    refreshToken: vi.fn(async () => {}),
  };
  const base = new BaseAPI(auth, { fetchFn: async (_url, init) => {
    bodies.push(init.body);
    return handler(bodies.length, init);
  } });
  return { base, bodies, auth };
}
const ok = (body = RECEIPT) => ({ ok: true, status: 202, json: async () => ({ ...body }) });
const lost = () => { throw new TypeError('synthetic transport loss'); };

// ---- M1: one deadline bounds the in-flight read, held GET and sleeps; caller cancellation stays AbortError.
const M1 = [
  ['M1 stalled GET that ignores the signal resolves pending at the deadline', async () => {
    const api = { get: vi.fn(never) };
    const t0 = performance.now();
    const out = await awaitReceipt(api, pending(), { timeoutMs: 30 });
    expect(out.client_timed_out).toBe(true);
    expect(out.terminal).toBe(false);
    expect(performance.now() - t0).toBeLessThan(500);
    expect(api.get.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    expect(api.get.mock.calls[0][1].signal.aborted).toBe(true);
  }],
  ['M1 sibling: PipelineAPI.chainRequest on a stalled GET rejects stage_result_pending, not a hang', async () => {
    const pipeline = new PipelineAPI(stageTransport(never));
    const err = await pipeline.chainRequest(decodeReceipt(STAGE_PENDING), {}, { timeoutMs: 30 }).catch(e => e);
    expect(err).toBeInstanceOf(StageChainError);
    expect(err.code).toBe('stage_result_pending');
  }],
  ['M1 a response inside the deadline is still returned', async () => {
    const api = { get: vi.fn(() => new Promise(resolve => setTimeout(() => resolve({ ...TERMINAL }), 20))) };
    const out = await awaitReceipt(api, pending(), { timeoutMs: 2000 });
    expect(out.terminal).toBe(true);
    expect(out.client_timed_out).toBe(false);
  }],
  ['M1 caller abort during a stalled GET rejects AbortError and frees every listener', async () => {
    const { ctl, live } = trackedSignal();
    const api = { get: vi.fn(never) };
    const run = awaitReceipt(api, pending(), { timeoutMs: 5000, signal: ctl.signal });
    await new Promise(resolve => setTimeout(resolve, 10));
    ctl.abort();
    await expect(run).rejects.toMatchObject({ name: 'AbortError' });
    expect(live.size).toBe(0);
  }],
  ['M1 caller abort during a backoff sleep rejects AbortError (default sleep)', async () => {
    const { ctl, live } = trackedSignal();
    const api = { get: vi.fn(async () => ({ ...RECEIPT })) };
    const run = awaitReceipt(api, pending(), { timeoutMs: 5000, holdMs: 0, signal: ctl.signal, random: () => 1 });
    await new Promise(resolve => setTimeout(resolve, 20));
    ctl.abort();
    await expect(run).rejects.toMatchObject({ name: 'AbortError' });
    expect(live.size).toBe(0);
  }],
  ['M1 an already aborted signal rejects before any request', async () => {
    const api = { get: vi.fn() };
    const signal = AbortSignal.abort();
    await expect(awaitReceipt(api, pending(), { signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(api.get).not.toHaveBeenCalled();
  }],
  ['M1 a sleep that ends after the deadline is cut at the deadline, not run past it', async () => {
    const api = { get: vi.fn(async () => ({ ...RECEIPT, retry_after_ms: 0 })) };
    const t0 = performance.now();
    const out = await awaitReceipt(api, pending(), { timeoutMs: 60, holdMs: 0, random: () => 1 });
    expect(out.client_timed_out).toBe(true);
    expect(performance.now() - t0).toBeLessThan(500);
  }],
];

// ---- M2: the full logical request is frozen before the first send, on every save, edit and stage method.
const M2 = [
  ['M2 create: metadata changed while attempt 1 is in flight', async () => {
    const metadata = { count: 1, nested: { deep: 'orig' } };
    const { base, bodies } = realBase(n => { if (n === 1) { metadata.count = 2; metadata.nested.deep = 'changed'; lost(); } return ok(); });
    await new MemoryAPI(base).create({ content: 'x', metadata, idempotencyKey: 'k1' });
    expect(bodies).toHaveLength(2);
    expect(bodies[1]).toBe(bodies[0]);
    expect(JSON.parse(bodies[1]).metadata).toEqual({ count: 1, nested: { deep: 'orig' } });
  }],
  ['M2 create: conversationContext changed in flight', async () => {
    const conversationContext = { turns: ['a'] };
    const { base, bodies } = realBase(n => { if (n === 1) { conversationContext.turns.push('late'); lost(); } return ok(); });
    await new MemoryAPI(base).create({ content: 'x', conversationContext });
    expect(bodies[1]).toBe(bodies[0]);
    expect(JSON.parse(bodies[1]).conversation_context).toEqual({ turns: ['a'] });
  }],
  ['M2 update with expectedRevision (PATCH): updates.metadata changed in flight', async () => {
    const updates = { metadata: { count: 1 } };
    const { base, bodies } = realBase(n => { if (n === 1) { updates.metadata.count = 2; lost(); } return ok(); });
    await new MemoryAPI(base).update('mem_1', updates, { expectedRevision: 3, idempotencyKey: 'k2' });
    expect(bodies[1]).toBe(bodies[0]);
    expect(JSON.parse(bodies[1])).toMatchObject({ metadata: { count: 1 }, expected_revision: 3, idempotency_key: 'k2' });
  }],
  ['M2 ingest: context changed in flight', async () => {
    const context = { source: 'a' };
    const { base, bodies } = realBase(n => { if (n === 1) { context.source = 'b'; lost(); } return ok(); });
    await new MemoryAPI(base).ingest('text', { context });
    expect(bodies[1]).toBe(bodies[0]);
    expect(JSON.parse(bodies[1]).context).toEqual({ source: 'a' });
  }],
  ['M2 ingestConversation: turns changed in flight', async () => {
    const turns = [{ role: 'user', content: 'hi' }];
    const { base, bodies } = realBase(n => { if (n === 1) { turns[0].content = 'edited'; turns.push({ role: 'user', content: 'late' }); lost(); } return ok(); });
    await new MemoryAPI(base).ingestConversation(turns);
    expect(bodies[1]).toBe(bodies[0]);
    expect(JSON.parse(bodies[1]).turns).toEqual([{ role: 'user', content: 'hi' }]);
  }],
  ['M2 ingestDocument: context changed in flight', async () => {
    const context = { tag: 'a' };
    const { base, bodies } = realBase(n => { if (n === 1) { context.tag = 'b'; lost(); } return ok(); });
    await new MemoryAPI(base).ingestDocument('https://example.com/a.pdf', { context });
    expect(bodies[1]).toBe(bodies[0]);
    expect(JSON.parse(bodies[1]).context).toEqual({ tag: 'a' });
  }],
  ['M2 PipelineAPI stage: nested input changed in flight', async () => {
    const items = [{ id: 'i1', props: { n: 1 } }];
    const { base, bodies } = realBase(n => { if (n === 1) { items[0].props.n = 2; lost(); } return ok(STAGE_PENDING); });
    await new PipelineAPI(base).runExtraction({ items, idempotencyKey: 'k3' });
    expect(bodies[1]).toBe(bodies[0]);
    expect(JSON.parse(bodies[1]).items).toEqual([{ id: 'i1', props: { n: 1 } }]);
  }],
  ['M2 token-refresh replay: same bytes and key after a 401 refresh while the caller mutates', async () => {
    const metadata = { count: 1 };
    const { base, bodies, auth } = realBase(n => {
      if (n === 1) { metadata.count = 2; return { ok: false, status: 401, headers: new Headers() }; }
      return ok();
    });
    await new MemoryAPI(base).create({ content: 'x', metadata, idempotencyKey: 'k4' });
    expect(auth.refreshToken).toHaveBeenCalledTimes(1);
    expect(bodies).toHaveLength(2);
    expect(bodies[1]).toBe(bodies[0]);
    expect(JSON.parse(bodies[1])).toMatchObject({ metadata: { count: 1 }, idempotency_key: 'k4' });
  }],
  ['M2 the caller body is not rewritten by the save (no idempotency_key leaks into caller objects)', async () => {
    const metadata = { count: 1 };
    const { base } = realBase(() => ok());
    await new MemoryAPI(base).create({ content: 'x', metadata });
    expect(metadata).toEqual({ count: 1 });
  }],
];

// ---- M3: unchanged short polls back off 250 ms -> 5 s, separately from failure tracking.
function fakeClock() {
  let t = 0;
  const sleeps = [];
  return { sleeps, now: () => t, sleep: async ms => { sleeps.push(ms); t += ms; } };
}
const M3 = [
  ['M3 unchanged short polls double to the 5 s cap (jitter pinned high)', async () => {
    const c = fakeClock();
    await awaitReceipt({ get: async () => ({ ...RECEIPT }) }, pending(), { timeoutMs: 30000, holdMs: 0, now: c.now, sleep: c.sleep, random: () => 1 });
    expect(c.sleeps.slice(0, 8)).toEqual([250, 500, 1000, 2000, 4000, 5000, 5000, 5000]);
    expect(Math.max(...c.sleeps)).toBe(5000);
  }],
  ['M3 jitter pinned low halves each window but still increases', async () => {
    const c = fakeClock();
    await awaitReceipt({ get: async () => ({ ...RECEIPT }) }, pending(), { timeoutMs: 30000, holdMs: 0, now: c.now, sleep: c.sleep, random: () => 0 });
    expect(c.sleeps.slice(0, 6)).toEqual([250, 250, 500, 1000, 2000, 2500]);
  }],
  ['M3 progress (a newer status_version) resets the unchanged-poll backoff', async () => {
    const c = fakeClock();
    let n = 0;
    const get = async () => { n += 1; return { ...RECEIPT, status_version: n === 4 ? 2 : 1 }; };
    await awaitReceipt({ get }, pending(), { timeoutMs: 2000, holdMs: 0, now: c.now, sleep: c.sleep, random: () => 1 });
    // reads 1-3 unchanged (250, 500, 1000), read 4 progressed (no sleep), read 5 unchanged again (250)
    expect(c.sleeps.slice(0, 4)).toEqual([250, 500, 1000, 250]);
  }],
  ['M3 a failed read and an unchanged read step one window, not two', async () => {
    const c = fakeClock();
    let n = 0;
    const get = async () => { n += 1; if (n === 1) throw new APIError('offline', 0, 'network_error'); return { ...RECEIPT }; };
    await awaitReceipt({ get }, pending(), { timeoutMs: 3000, holdMs: 0, now: c.now, sleep: c.sleep, random: () => 1 });
    expect(c.sleeps.slice(0, 3)).toEqual([500, 250, 500]);
  }],
  ['M3 a server retry_after_ms stays a minimum on an unchanged poll', async () => {
    const c = fakeClock();
    await awaitReceipt({ get: async () => ({ ...RECEIPT, retry_after_ms: 1500 }) }, pending(), { timeoutMs: 4000, holdMs: 0, now: c.now, sleep: c.sleep, random: () => 0 });
    expect(c.sleeps.every(ms => ms >= 1500)).toBe(true);
  }],
  ['M3 a retry_after_ms beyond the remaining deadline returns pending with no further request', async () => {
    const c = fakeClock();
    const get = vi.fn(async () => ({ ...RECEIPT, retry_after_ms: 9000 }));
    const out = await awaitReceipt({ get }, pending(), { timeoutMs: 1000, holdMs: 0, now: c.now, sleep: c.sleep });
    expect(out.client_timed_out).toBe(true);
    expect(get).toHaveBeenCalledTimes(1);
  }],
];

// ---- M4: an unsupported receipt at the public stage boundary is StageChainError unsupported_receipt_version.
const M4 = [
  ['M4 chainRequest: status receipt with an unknown major', async () => {
    const pipeline = new PipelineAPI(stageTransport(async () => ({ ...STAGE_PENDING, schema_version: '2.0' })));
    const err = await pipeline.chainRequest(decodeReceipt(STAGE_PENDING)).catch(e => e);
    expect(err).toBeInstanceOf(StageChainError);
    expect(err).toMatchObject({ code: 'unsupported_receipt_version', decoder_code: 'unsupported_version', run_id: STAGE_PENDING.run_id, field: 'schema_version' });
    expect(err.cause.name).toBe('UnsupportedReceiptError');
  }],
  ['M4 chainRequest: status receipt with an unknown mandatory state', async () => {
    const pipeline = new PipelineAPI(stageTransport(async () => ({ ...STAGE_PENDING, execution_state: 'future_state' })));
    const err = await pipeline.chainRequest(decodeReceipt(STAGE_PENDING)).catch(e => e);
    expect(err).toBeInstanceOf(StageChainError);
    expect(err).toMatchObject({ code: 'unsupported_receipt_version', decoder_code: 'unsupported_state', run_id: STAGE_PENDING.run_id, field: 'execution_state', value: 'future_state' });
    expect(err.status_url).toBe(STAGE_PENDING.status_url);
  }],
  ['M4 PipelineAPI.awaitReceipt (public) maps the same way', async () => {
    const pipeline = new PipelineAPI(stageTransport(async () => ({ ...STAGE_PENDING, schema_version: '3.1' })));
    await expect(pipeline.awaitReceipt(decodeReceipt(STAGE_PENDING))).rejects.toMatchObject({ name: 'StageChainError', code: 'unsupported_receipt_version' });
  }],
  ['M4 submission decode: a stage POST answered with an unknown major', async () => {
    const pipeline = new PipelineAPI({ post: async () => ({ ...STAGE_PENDING, schema_version: '2.1' }) });
    const err = await pipeline.runStorage({ items: [] }).catch(e => e);
    expect(err).toBeInstanceOf(StageChainError);
    expect(err).toMatchObject({ code: 'unsupported_receipt_version', decoder_code: 'unsupported_version', run_id: STAGE_PENDING.run_id });
  }],
  ['M4 ordinary MemoryAPI receipt semantics are unchanged (UnsupportedReceiptError, not StageChainError)', async () => {
    const memory = new MemoryAPI({ get: async () => ({ ...RECEIPT, schema_version: '2.0' }) });
    const err = await memory.awaitReceipt(pending()).catch(e => e);
    expect(err.name).toBe('UnsupportedReceiptError');
    expect(err.code).toBe('unsupported_version');
  }],
  ['M4 a caller abort through the stage boundary stays AbortError', async () => {
    const pipeline = new PipelineAPI(stageTransport(never));
    const signal = AbortSignal.timeout(20);
    await expect(pipeline.awaitReceipt(decodeReceipt(STAGE_PENDING), { timeoutMs: 5000, signal })).rejects.toMatchObject({ name: 'TimeoutError' });
  }],
];

describe.each([['M1 await deadline', M1], ['M2 request snapshot', M2], ['M3 poll backoff', M3], ['M4 stage error contract', M4]])('%s', (_name, rows) => {
  it.each(rows)('%s', async (_title, run) => { await run(); });
});
