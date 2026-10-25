import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthCore } from '../../../src/auth/AuthCore.js';
import { BaseAPI } from '../../../src/api/BaseAPI.js';
import { MemoryAPI } from '../../../src/api/MemoryAPI.js';
import { PipelineAPI } from '../../../src/api/PipelineAPI.js';
import { ProcedureCandidateAPI } from '../../../src/api/ProcedureCandidateAPI.js';
import { APIError } from '../../../src/errors/APIError.js';
import { AdmissionConflictError, StageChainError, UnsupportedReceiptError } from '../../../src/errors/ReceiptErrors.js';
import { SaveReceipt, decodeReceipt } from '../../../src/api/receipt.js';
import { awaitReceipt } from '../../../src/api/awaitReceipt.js';
import { GENERATED_KEY_RE, newIdempotencyKey, resolveIdempotencyKey, submitWithRetry } from '../../../src/api/submit.js';
import { KEY_RE, RECEIPT, STAGE_DONE, STAGE_PENDING, TERMINAL } from './receiptFixtures.js';

const net = () => new APIError('offline', 0, 'network_error');
const http = (status, detail = null, extra = {}) => Object.assign(new APIError(`HTTP ${status}`, status, detail), extra);
const conflictBody = (code, extra = {}) => ({ schema_version: '1.1', admission_error: { code, message: `scoped ${code}` }, ...extra });

let warn;
beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(Math, 'random').mockReturnValue(0); // zero jitter: retries sleep 0 ms
});
afterEach(() => vi.restoreAllMocks());

function memoryWith(post, extra = {}) {
  const baseAPI = { get: vi.fn(), post: vi.fn(post), patch: vi.fn(), put: vi.fn(), delete: vi.fn(), ...extra };
  return { baseAPI, memory: new MemoryAPI(baseAPI) };
}

describe('probe 1: save methods resolve to a typed receipt', () => {
  // One row per receipt-returning save route. `call` is the public method, `path` the wire route.
  const SAVES = [
    ['create', '/memory/add', m => m.create({ content: 'x' })],
    ['ingest', '/memory/ingest', m => m.ingest('x')],
    ['ingestConversation', '/memory/ingest/conversation', m => m.ingestConversation([{ role: 'user', content: 'hi' }])],
    ['ingestDocument', '/memory/ingest/document', m => m.ingestDocument('https://example.com/a.pdf')],
  ];
  it.each(SAVES)('%s -> SaveReceipt, not a bare string', async (_name, path, call) => {
    const { baseAPI, memory } = memoryWith(async () => ({ ...RECEIPT }));
    const receipt = await call(memory);
    expect(receipt).toBeInstanceOf(SaveReceipt);
    expect(typeof receipt).not.toBe('string');
    expect(receipt.run_id).toBe('run_1');
    expect(receipt.revision).toBe(1);
    expect(receipt.status_url).toBe('/memory/status/run_1');
    expect(baseAPI.post).toHaveBeenCalledTimes(1);
    expect(baseAPI.post.mock.calls[0][0]).toBe(path);
    expect(baseAPI.post.mock.calls[0][1].idempotency_key).toMatch(KEY_RE);
  });

  it('item_id delegates to subject.item_id and toString never implies completion', () => {
    const rows = [
      [{ ...RECEIPT, processing_stage: 'stored', execution_state: 'running' }, 'mem_123', 'mem_123 (stored)'],
      [RECEIPT, 'mem_123', 'mem_123 (received)'],
      [TERMINAL, 'mem_123', 'mem_123 (completed)'],
      [{ ...RECEIPT, subject: { kind: 'document_save', document_id: 'doc_9' } }, undefined, 'doc_9 (received)'],
      [STAGE_PENDING, undefined, 'occ_1 (queued)'],
    ];
    for (const [raw, itemId, text] of rows) {
      const receipt = decodeReceipt(raw);
      expect(receipt.item_id).toBe(itemId);
      expect(String(receipt)).toBe(text);
    }
    expect(decodeReceipt({ ...RECEIPT, item_id: 'shadow' }).item_id).toBe('mem_123');
  });
});

describe('probe 2: reader compatibility and typed refusals', () => {
  it('accepts a 1.x minor and retains unknown fields', () => {
    const receipt = decodeReceipt({ ...RECEIPT, schema_version: '1.2', context: { future_field: 7 }, extra_top: [1] });
    expect(receipt.context.future_field).toBe(7);
    expect(receipt.extra_top).toEqual([1]);
    expect(receipt.toJSON().schema_version).toBe('1.2');
  });

  // One row per refusal arm: input mutation -> code, field and value carried on the error.
  const REFUSALS = [
    ['unknown major', { schema_version: '2.0' }, 'unsupported_version', 'schema_version', '2.0'],
    ['missing schema_version', { schema_version: undefined }, 'unsupported_version', 'schema_version', null],
    ['malformed schema_version', { schema_version: 'one' }, 'unsupported_version', 'schema_version', 'one'],
    ['missing status_url', { status_url: undefined }, 'unsupported_version', 'run_id', null],
    ['unknown subject', { subject: { kind: 'hologram', item_id: 'x' } }, 'unsupported_subject', 'subject.kind', 'hologram'],
    ['unknown processing_stage', { processing_stage: 'teleported' }, 'unsupported_state', 'processing_stage', 'teleported'],
    ['unknown execution_state', { execution_state: 'dreaming' }, 'unsupported_state', 'execution_state', 'dreaming'],
    ['unknown outcome', { outcome: 'vibes' }, 'unsupported_state', 'outcome', 'vibes'],
    ['unknown reason', { reason: 'tuesday' }, 'unsupported_state', 'reason', 'tuesday'],
    ['unknown result_availability', { result_availability: 'maybe' }, 'unsupported_state', 'result_availability', 'maybe'],
  ];
  it.each(REFUSALS)('%s', (_name, mutation, code, field, value) => {
    let error;
    try { decodeReceipt({ ...RECEIPT, ...mutation }); } catch (e) { error = e; }
    expect(error).toBeInstanceOf(UnsupportedReceiptError);
    expect(error).toBeInstanceOf(APIError);
    expect(error.code).toBe(code);
    expect(error.field).toBe(field);
    expect(error.value).toBe(value);
    expect(error.raw.run_id).toBe('run_1');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(code));
  });

  it('keeps the handle on a refusal whose major is unknown', () => {
    let error;
    try { decodeReceipt({ ...RECEIPT, schema_version: '2.0' }); } catch (e) { error = e; }
    expect(error.run_id).toBe('run_1');
    expect(error.status_url).toBe('/memory/status/run_1');
  });

  it.each([[null], ['mem_123'], [[RECEIPT]], [{ id: 'legacy', status: 'ok' }]])('refuses a non-receipt body %j with no handle', body => {
    let error;
    try { decodeReceipt(body); } catch (e) { error = e; }
    expect(error).toBeInstanceOf(UnsupportedReceiptError);
    expect(error.code).toBe('unsupported_version');
    expect(error.run_id).toBeNull();
    expect(warn).toHaveBeenCalled();
  });

  it('create surfaces a refusal as the typed error, never a success', async () => {
    const { memory } = memoryWith(async () => ({ ...RECEIPT, schema_version: '2.0' }));
    await expect(memory.create({ content: 'x' })).rejects.toMatchObject({ code: 'unsupported_version', run_id: 'run_1' });
  });
});

describe('probe 3: awaitReceipt', () => {
  function clock() {
    let t = 0;
    const slept = [];
    return { slept, now: () => t, sleep: async ms => { slept.push(ms); t += ms; } };
  }

  it('returns a terminal input receipt without any request', async () => {
    const api = { get: vi.fn() };
    const out = await awaitReceipt(api, decodeReceipt(TERMINAL));
    expect(out.terminal).toBe(true);
    expect(api.get).not.toHaveBeenCalled();
  });

  it('terminal on the first read -> exactly one status request', async () => {
    const api = { get: vi.fn(async () => ({ ...TERMINAL })) };
    const out = await awaitReceipt(api, decodeReceipt(RECEIPT), clock());
    expect(out.terminal).toBe(true);
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.get.mock.calls[0][0]).toMatch(/^\/memory\/status\/run_1\?wait_ms=\d+$/);
  });

  it('a receipt that never terminates RESOLVES flagged client_timed_out with the same run_id', async () => {
    const c = clock();
    const api = { get: vi.fn(async () => ({ ...RECEIPT })) };
    const out = await awaitReceipt(api, decodeReceipt(RECEIPT), { ...c, timeoutMs: 500 });
    expect(out).toBeInstanceOf(SaveReceipt);
    expect(out.client_timed_out).toBe(true);
    expect(out.terminal).toBe(false);
    expect(out.run_id).toBe('run_1');
    for (const [url] of api.get.mock.calls) expect(Number(new URL(url, 'http://x').searchParams.get('wait_ms'))).toBeLessThanOrEqual(500);
  });

  it('times out for real on MemoryAPI.awaitReceipt (monotonic default clock)', async () => {
    const { memory } = memoryWith(async () => RECEIPT, { get: vi.fn(async () => ({ ...RECEIPT })) });
    const started = performance.now();
    const out = await memory.awaitReceipt(decodeReceipt(RECEIPT), { timeoutMs: 500 });
    expect(out.client_timed_out).toBe(true);
    expect(performance.now() - started).toBeGreaterThanOrEqual(450);
  });

  it('backs off 250 ms to 5 s with bounded jitter between unchanged polls', async () => {
    const c = clock();
    Math.random.mockReturnValue(1);
    const api = { get: vi.fn(async () => ({ ...RECEIPT })) };
    await awaitReceipt(api, decodeReceipt(RECEIPT), { ...c, timeoutMs: 60000 });
    expect(c.slept.length).toBeGreaterThan(3);
    for (const ms of c.slept.slice(0, -1)) {
      expect(ms).toBeGreaterThanOrEqual(250);
      expect(ms).toBeLessThanOrEqual(5000);
    }
  });

  it('reissues a poll that advanced the receipt version without ordinary backoff', async () => {
    const c = clock();
    const replies = [{ ...RECEIPT, status_version: 2, processing_stage: 'stored' }, { ...TERMINAL }];
    const api = { get: vi.fn(async () => replies.shift()) };
    const out = await awaitReceipt(api, decodeReceipt(RECEIPT), c);
    expect(out.terminal).toBe(true);
    expect(c.slept).toEqual([]);
  });

  it('honors Retry-After as a minimum delay on a failed read, then finishes', async () => {
    const c = clock();
    const replies = [http(429, null, { retryAfterMs: 3000 }), { ...TERMINAL }];
    const api = { get: vi.fn(async () => { const r = replies.shift(); if (r instanceof Error) throw r; return r; }) };
    const out = await awaitReceipt(api, decodeReceipt(RECEIPT), c);
    expect(out.terminal).toBe(true);
    expect(c.slept[0]).toBeGreaterThanOrEqual(3000);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('status read failed'));
  });

  it('a Retry-After that cannot fit the deadline returns pending without another request', async () => {
    const c = clock();
    const api = { get: vi.fn(async () => { throw http(503, null, { retryAfterMs: 60000 }); }) };
    const out = await awaitReceipt(api, decodeReceipt(RECEIPT), { ...c, timeoutMs: 1000 });
    expect(out.client_timed_out).toBe(true);
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(c.slept).toEqual([]);
  });

  it('a retry_after_ms field on a pending receipt is the same minimum', async () => {
    const c = clock();
    const replies = [{ ...RECEIPT, retry_after_ms: 2000 }, { ...TERMINAL }];
    const api = { get: vi.fn(async () => replies.shift()) };
    await awaitReceipt(api, decodeReceipt(RECEIPT), c);
    expect(c.slept[0]).toBeGreaterThanOrEqual(2000);
  });

  it('rethrows a non-transient read failure and a typed refusal instead of waiting', async () => {
    for (const failure of [http(404), () => ({ ...RECEIPT, execution_state: 'dreaming' })]) {
      const api = { get: vi.fn(async () => { if (failure instanceof Error) throw failure; return failure(); }) };
      await expect(awaitReceipt(api, decodeReceipt(RECEIPT), clock())).rejects.toBeInstanceOf(APIError);
      expect(api.get).toHaveBeenCalledTimes(1);
    }
  });

  it('needs a status_url', async () => {
    await expect(awaitReceipt({ get: vi.fn() }, { run_id: 'r' })).rejects.toThrow(TypeError);
  });

  it('getStatus reads by run_id (even run_id "links") or by receipt', async () => {
    const { baseAPI, memory } = memoryWith(async () => RECEIPT, { get: vi.fn(async () => ({ ...RECEIPT })) });
    await memory.getStatus('links');
    await memory.getStatus(decodeReceipt(RECEIPT), { waitMs: 99999 });
    expect(baseAPI.get.mock.calls.map(c => c[0])).toEqual(['/memory/status/links', '/memory/status/run_1?wait_ms=10000']);
  });
});

describe('probe 4: one idempotency key, bounded same-key retry', () => {
  it('fails 3 times (transport loss) then succeeds: 4 calls, one key, identical bodies', async () => {
    const failures = [net(), net(), net()];
    const { baseAPI, memory } = memoryWith(async () => { if (failures.length) throw failures.shift(); return { ...RECEIPT }; });
    const receipt = await memory.create({ content: 'x' });
    expect(receipt.run_id).toBe('run_1');
    expect(baseAPI.post).toHaveBeenCalledTimes(4);
    const bodies = baseAPI.post.mock.calls.map(c => JSON.stringify(c[1]));
    expect(new Set(bodies).size).toBe(1);
    expect(baseAPI.post.mock.calls[0][1].idempotency_key).toMatch(GENERATED_KEY_RE);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('retrying with the same key'));
  });

  // One row per status class the policy decides: calls made when every attempt fails that way.
  const POLICY = [
    ['transport loss', () => net(), 4],
    ...[408, 429, 500, 502, 503, 504].map(s => [`HTTP ${s}`, () => http(s), 4]),
    ...[400, 401, 403, 404, 409, 422].map(s => [`HTTP ${s}`, () => http(s), 1]),
  ];
  it.each(POLICY)('%s: calls made and the key rides on the final error', async (_name, make, calls) => {
    const { baseAPI, memory } = memoryWith(async () => { throw make(); });
    const error = await memory.create({ content: 'x' }).catch(e => e);
    expect(error).toBeInstanceOf(APIError);
    expect(baseAPI.post).toHaveBeenCalledTimes(calls);
    expect(error.idempotencyKey).toBe(baseAPI.post.mock.calls[0][1].idempotency_key);
    if (calls === 4) expect(warn).toHaveBeenCalledWith(expect.stringContaining('giving up after 4 attempt'));
  });

  it('an abort is never retried', async () => {
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
    const { baseAPI, memory } = memoryWith(async () => { throw abort; });
    await expect(memory.create({ content: 'x' })).rejects.toBe(abort);
    expect(baseAPI.post).toHaveBeenCalledTimes(1);
  });

  it('each logical save mints a new key; an explicit idempotencyKey is reused as given', async () => {
    const { baseAPI, memory } = memoryWith(async () => ({ ...RECEIPT }));
    await memory.create({ content: 'a' });
    await memory.create({ content: 'a' });
    await memory.create({ content: 'a', idempotencyKey: 'draft:7' });
    const keys = baseAPI.post.mock.calls.map(c => c[1].idempotency_key);
    expect(keys[0]).not.toBe(keys[1]);
    expect(keys[2]).toBe('draft:7');
    await expect(memory.create({ content: 'a', idempotencyKey: 'bad key!' })).rejects.toThrow(TypeError);
  });

  it('Retry-After is a minimum on 429/503 and a delay that misses the deadline throws with the key', async () => {
    const sleep = vi.fn(async () => {});
    let n = 0;
    const send = async () => { if (n++ < 1) throw http(503, null, { retryAfterMs: 2000 }); return 'ok'; };
    await expect(submitWithRetry(send, { idempotencyKey: 'k', sleep, random: () => 0 })).resolves.toBe('ok');
    expect(sleep).toHaveBeenCalledWith(2000);

    const late = vi.fn(async () => { throw http(429, null, { retryAfterMs: 5000 }); });
    const error = await submitWithRetry(late, { idempotencyKey: 'k2', sleep, deadlineMs: 1000 }).catch(e => e);
    expect(late).toHaveBeenCalledTimes(1);
    expect(error.idempotencyKey).toBe('k2');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('does not fit the caller deadline'));
  });

  it('jitter windows are 0-200, 0-400 and 0-800 ms', async () => {
    const sleep = vi.fn(async () => {});
    await submitWithRetry(async () => { throw net(); }, { idempotencyKey: 'k', sleep, random: () => 1 }).catch(() => {});
    expect(sleep.mock.calls.map(c => Math.round(c[0]))).toEqual([200, 400, 800]);
  });

  it('keys: generated format, getRandomValues arm, and no secure source is a loud error', () => {
    expect(newIdempotencyKey()).toMatch(GENERATED_KEY_RE);
    const real = globalThis.crypto;
    try {
      vi.stubGlobal('crypto', { getRandomValues: real.getRandomValues.bind(real) });
      expect(newIdempotencyKey()).toMatch(GENERATED_KEY_RE);
      vi.stubGlobal('crypto', undefined);
      expect(() => newIdempotencyKey()).toThrow(/secure random/);
    } finally {
      vi.unstubAllGlobals();
    }
    expect(resolveIdempotencyKey('a'.repeat(128))).toHaveLength(128);
    expect(() => resolveIdempotencyKey('a'.repeat(129))).toThrow(TypeError);
  });

  it('the 401 replay in recovery.js keeps the same key and body (retry stays at the save layer)', async () => {
    const transport = vi.fn();
    vi.stubGlobal('fetch', transport);
    const auth = new AuthCore({ mode: 'sso', storage: 'memory', apiBaseUrl: 'https://service.test' });
    auth.currentToken = 'expired';
    const json = (status, data = {}) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
    transport.mockResolvedValueOnce(json(401)).mockResolvedValueOnce(json(200, { access_token: 'new' })).mockResolvedValueOnce(json(202, RECEIPT));
    try {
      const receipt = await new MemoryAPI(new BaseAPI(auth)).create({ content: 'x' });
      expect(receipt.run_id).toBe('run_1');
      const first = transport.mock.calls[0][1], replay = transport.mock.calls[2][1];
      expect(replay.body).toBe(first.body);
      expect(JSON.parse(replay.body).idempotency_key).toMatch(KEY_RE);
      expect(transport).toHaveBeenCalledTimes(3);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('BaseAPI reads Retry-After seconds off an error response, ignores a missing or bad one', async () => {
    const base = new BaseAPI({});
    const reply = header => ({ status: 503, headers: new Headers(header ? { 'content-type': 'application/json', 'retry-after': header } : { 'content-type': 'application/json' }), json: async () => ({}) });
    expect((await base._handleError(reply('2'))).retryAfterMs).toBe(2000);
    expect((await base._handleError(reply('0'))).retryAfterMs).toBe(0);
    expect((await base._handleError(reply(undefined))).retryAfterMs).toBeUndefined();
    expect((await base._handleError(reply('Wed, 21 Oct 2026 07:28:00 GMT'))).retryAfterMs).toBeUndefined();
  });
});

describe('probe 5: edit precondition', () => {
  const EDIT = { ...RECEIPT, subject: { kind: 'edit', item_id: 'mem_123' }, expected_revision: 1, revision: 2 };

  it('sends expected_revision, retries under one key and resolves to a receipt', async () => {
    const failures = [net()];
    const { baseAPI, memory } = memoryWith(async () => {}, { patch: vi.fn(async () => { if (failures.length) throw failures.shift(); return { ...EDIT }; }) });
    const receipt = await memory.update('mem_123', { content: 'y' }, { expectedRevision: 1 });
    expect(receipt).toBeInstanceOf(SaveReceipt);
    expect(receipt.subject.kind).toBe('edit');
    expect(baseAPI.patch).toHaveBeenCalledTimes(2);
    const [path, body] = baseAPI.patch.mock.calls[0];
    expect(path).toBe('/memory/mem_123');
    expect(body).toEqual({ content: 'y', expected_revision: 1, idempotency_key: expect.stringMatching(KEY_RE) });
    expect(baseAPI.patch.mock.calls[1][1]).toBe(body);
  });

  it('a revision of 0 is a real precondition', async () => {
    const { baseAPI, memory } = memoryWith(async () => {}, { patch: vi.fn(async () => ({ ...EDIT })) });
    await memory.update('m', { content: 'y' }, { expectedRevision: 0 });
    expect(baseAPI.patch.mock.calls[0][1].expected_revision).toBe(0);
  });

  it('without expectedRevision the legacy PATCH is untouched: same body, raw response', async () => {
    const raw = { updated: true };
    const { baseAPI, memory } = memoryWith(async () => {}, { patch: vi.fn(async () => raw) });
    expect(await memory.update('mem_123', { content: 'y' })).toBe(raw);
    expect(baseAPI.patch).toHaveBeenCalledWith('/memory/mem_123', { content: 'y' });
  });

  // One row per scoped admission code and wire nesting. Each: 1 call, typed error, no retry.
  const CONFLICTS = [
    ['revision_conflict', conflictBody('revision_conflict', { expected_revision: 1, current_revision: 4, subject: { kind: 'edit', item_id: 'mem_123' } })],
    ['revision_conflict', { detail: conflictBody('revision_conflict', { current_revision: 4 }) }],
    ['idempotency_conflict', conflictBody('idempotency_conflict')],
    ['retry_key_expired', conflictBody('retry_key_expired')],
  ];
  it.each(CONFLICTS)('409 %s -> AdmissionConflictError, one call', async (code, body) => {
    const { baseAPI, memory } = memoryWith(async () => {}, { patch: vi.fn(async () => { throw http(409, body); }) });
    const error = await memory.update('mem_123', { content: 'y' }, { expectedRevision: 1 }).catch(e => e);
    expect(error).toBeInstanceOf(AdmissionConflictError);
    expect(error).toBeInstanceOf(APIError);
    expect(error.code).toBe(code);
    expect(error.status).toBe(409);
    expect(error.expectedRevision).toBe(1);
    if (code === 'revision_conflict') expect(error.currentRevision).toBe(4);
    expect(baseAPI.patch).toHaveBeenCalledTimes(1);
  });

  it('a 409 with no scoped code stays the original APIError', async () => {
    const original = http(409, { detail: 'legacy conflict' });
    const { memory } = memoryWith(async () => {}, { patch: vi.fn(async () => { throw original; }) });
    await expect(memory.update('m', { content: 'y' }, { expectedRevision: 1 })).rejects.toBe(original);
  });

  it('create maps a changed-key 409 the same way', async () => {
    const { baseAPI, memory } = memoryWith(async () => { throw http(409, conflictBody('idempotency_conflict')); });
    await expect(memory.create({ content: 'x' })).rejects.toMatchObject({ code: 'idempotency_conflict' });
    expect(baseAPI.post).toHaveBeenCalledTimes(1);
  });

  it('a 2xx body that is a conflict still surfaces as the typed error', async () => {
    const { memory } = memoryWith(async () => conflictBody('revision_conflict', { current_revision: 9 }));
    await expect(memory.create({ content: 'x' })).rejects.toMatchObject({ code: 'revision_conflict', currentRevision: 9 });
  });
});

describe('probe 6: G129 and stage chains', () => {
  it('promote() has no source-removal option and rejects an unknown one loudly', async () => {
    const api = { post: vi.fn(async () => ({})) };
    const candidates = new ProcedureCandidateAPI(api);
    await candidates.promote('c1', { name: 'n' });
    expect(Object.keys(api.post.mock.calls[0][1]).sort()).toEqual(['description', 'name', 'preferred_profile', 'procedure_type']);
    await expect(candidates.promote('c1', { bogus_option: true })).rejects.toThrow(/no option 'bogus_option'/);
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  function pipelineWith(post, get) {
    const api = { post: vi.fn(post), get: vi.fn(get ?? (async () => ({ ...STAGE_DONE }))) };
    return { api, pipeline: new PipelineAPI(api) };
  }

  it('extraction -> await -> chainRequest -> storage uses pipeline_state_run_id', async () => {
    const { api, pipeline } = pipelineWith(async () => ({ ...STAGE_PENDING }));
    const receipt = await pipeline.runExtraction({ content: 'x' });
    const next = await pipeline.chainRequest(receipt, { options: {} });
    expect(next).toEqual({ options: {}, run_id: 'pipeline_1' });
    await pipeline.runStorage(next);
    expect(api.post.mock.calls[1][1]).toEqual({ options: {}, run_id: 'pipeline_1', idempotency_key: expect.stringMatching(KEY_RE) });
  });

  it('chaining from receipt.run_id rejects with stage_chain_invalid and sends nothing', async () => {
    const { api, pipeline } = pipelineWith(async () => ({ ...STAGE_PENDING }));
    const receipt = await pipeline.runExtraction({ content: 'x' });
    const error = await pipeline.runStorage({ run_id: receipt.run_id }).catch(e => e);
    expect(error).toBeInstanceOf(StageChainError);
    expect(error).toBeInstanceOf(APIError);
    expect(error.code).toBe('stage_chain_invalid');
    expect(error.run_id).toBe('run_stage_1');
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('is a receipt run, not a pipeline_state_run_id'));
  });

  // One row per way a chain can fail: the awaited receipt -> code.
  const CHAINS = [
    ['still pending at the deadline', { ...STAGE_PENDING }, 'stage_result_pending', true],
    ['detail expired', { ...STAGE_DONE, result_availability: 'expired', result: undefined }, 'stage_result_expired', false],
    ['failed job', { ...STAGE_DONE, execution_state: 'failed', outcome: 'failed', result_availability: 'none', result: undefined, error: { code: 'run_failed', message: 'x', retryable: false } }, 'stage_result_unavailable', false],
    ['skipped, no state id', { ...STAGE_DONE, outcome: 'skipped', result_availability: 'none', result: undefined }, 'stage_result_unavailable', false],
    ['available but no state id', { ...STAGE_DONE, result: { stage_id: 'extraction' } }, 'stage_result_unavailable', false],
    ['not a stage job', { ...TERMINAL }, 'stage_chain_invalid', false],
  ];
  it.each(CHAINS)('chainRequest: %s -> %s', async (_name, status, code, retryable) => {
    const { pipeline } = pipelineWith(async () => ({ ...STAGE_PENDING }), async () => status);
    const receipt = await pipeline.runExtraction({ content: 'x' });
    const error = await pipeline.chainRequest(receipt, {}, { timeoutMs: 1, holdMs: 0 }).catch(e => e);
    expect(error).toBeInstanceOf(StageChainError);
    expect(error.code).toBe(code);
    expect(error.retryable).toBe(retryable);
    expect(error.receipt).toBeInstanceOf(SaveReceipt);
    if (status.error) expect(error.receipt.error.code).toBe('run_failed');
  });

  // One row per public stage_client_error code a dependent submission can return.
  const BODIES = [
    [409, 'stage_result_pending'], [410, 'stage_result_expired'], [409, 'stage_result_unavailable'],
    [409, 'stage_chain_invalid'], [403, 'stage_scope_denied'], [422, 'unsupported_receipt_version'],
  ];
  it.each(BODIES)('HTTP %i %s on submission -> StageChainError, no retry', async (status, code) => {
    const body = { kind: 'stage_client_error', code, message: 'sanitized', retryable: code === 'stage_result_pending', run_id: code === 'stage_scope_denied' ? null : 'run_stage_1' };
    const { api, pipeline } = pipelineWith(async () => { throw http(status, { detail: body }); });
    const error = await pipeline.runStorage({ run_id: 'pipeline_1' }).catch(e => e);
    expect(error).toBeInstanceOf(StageChainError);
    expect(error.code).toBe(code);
    expect(error.run_id).toBe(body.run_id);
    expect(error.status).toBe(status);
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  it('a bare 404 on a stage call is not relabelled stage_scope_denied', async () => {
    const original = http(404);
    const { pipeline } = pipelineWith(async () => { throw original; });
    await expect(pipeline.runStorage({ run_id: 'p' })).rejects.toBe(original);
  });

  it('stage submissions retry transport loss under one key', async () => {
    const failures = [net(), http(503)];
    const { api, pipeline } = pipelineWith(async () => { if (failures.length) throw failures.shift(); return { ...STAGE_PENDING }; });
    await pipeline.runExtraction({ content: 'x' });
    expect(api.post).toHaveBeenCalledTimes(3);
    expect(new Set(api.post.mock.calls.map(c => c[1].idempotency_key)).size).toBe(1);
  });

  it('a stage request with idempotencyKey reuses it and a refusal keeps the handle', async () => {
    const { api, pipeline } = pipelineWith(async () => ({ ...STAGE_PENDING, schema_version: '2.1' }));
    await expect(pipeline.runLinking({ items: [], idempotencyKey: 'stage:1' })).rejects.toMatchObject({ code: 'unsupported_version', run_id: 'run_stage_1' });
    expect(api.post.mock.calls[0][1]).toEqual({ items: [], idempotency_key: 'stage:1' });
  });
});
