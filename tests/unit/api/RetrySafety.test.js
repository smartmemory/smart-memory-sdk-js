// @vitest-environment node
// SDKJS-2.0-STAGE-RETRY-NO-REPLAY-1: real auth/BaseAPI, deterministic wire transport.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AuthCore } from '../../../src/auth/AuthCore.js';
import { BaseAPI } from '../../../src/api/BaseAPI.js';
import { MemoryAPI } from '../../../src/api/MemoryAPI.js';
import { PipelineAPI } from '../../../src/api/PipelineAPI.js';
import { APIError } from '../../../src/errors/APIError.js';
import { RECEIPT, STAGE_PENDING } from './receiptFixtures.js';

beforeEach(() => {
  vi.spyOn(Math, 'random').mockReturnValue(0);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });
const routes = [
  ['add', m => m.create({ content: 'test_retry note', idempotencyKey: 'test_retry_key' })],
  ['ingest', m => m.ingest('test_retry note', { idempotencyKey: 'test_retry_key' })],
  ['document', m => m.ingestDocument('https://example.test/a.pdf', { idempotencyKey: 'test_retry_key' })],
  ['conversation', m => m.ingestConversation([{ role: 'user', content: 'test_retry note' }], { idempotencyKey: 'test_retry_key' })],
  ['edit', m => m.update('m', { content: 'test_retry note' }, { expectedRevision: 1, idempotencyKey: 'test_retry_key' })],
  ...['Extraction', 'Storage', 'Linking', 'Enrichment', 'Grounding'].map(stage =>
    [stage, (_m, p) => p[`run${stage}`]({ content: 'test_retry note', idempotencyKey: 'test_retry_key' })]),
];
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
function setup(send) {
  const auth = new AuthCore({ apiBaseUrl: 'https://service.test', apiKey: 'test_retry_key', storage: 'memory' });
  auth.tokenManager.setWorkspaceId('test_retry_A');
  const fetchFn = vi.fn(send);
  const api = new BaseAPI(auth, { fetchFn });
  return { auth, fetchFn, memory: new MemoryAPI(api), pipeline: new PipelineAPI(api) };
}
for (const failure of ['response lost after commit', 408, 500, 502, 503, 504]) {
  it.each(routes)(`%s: ${failure} surfaces once with key and attempts`, async (_name, call) => {
    const committed = [];
    const { fetchFn, memory, pipeline } = setup(async (_url, options) => {
      committed.push(options.body);
      if (typeof failure === 'string') throw new TypeError('response lost after commit');
      return json(failure, {});
    });
    const error = await call(memory, pipeline).catch(e => e);
    expect(error).toBeInstanceOf(APIError);
    expect(error.status).toBe(typeof failure === 'string' ? 0 : failure);
    expect(error.idempotencyKey).toBe('test_retry_key');
    expect(error.attempts).toBe(1);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(committed).toHaveLength(1);
  });
}
it.each(routes)('%s: 429 retries identical bytes and key once', async (_name, call) => {
  const { fetchFn, memory, pipeline } = setup(async () => fetchFn.mock.calls.length === 1
    ? json(429, {}) : json(200, _name[0] === _name[0].toUpperCase() ? STAGE_PENDING : RECEIPT));
  await call(memory, pipeline);
  expect(fetchFn).toHaveBeenCalledTimes(2);
  expect(fetchFn.mock.calls[1][1].body).toBe(fetchFn.mock.calls[0][1].body);
  expect(JSON.parse(fetchFn.mock.calls[1][1].body).idempotency_key).toBe('test_retry_key');
});
const changes = [
  ['workspace', a => a.tokenManager.setWorkspaceId('test_retry_B')],
  ['tenant', a => a.tokenManager.setTenantId('test_retry_other')],
  ['principal', a => { a.currentUser = { id: 'other' }; }],
  ['logout', a => { a.sessionRevision++; }],
  ['credential', a => { a.currentToken = 'other-key'; }],
  ['base URL', a => { a._apiBaseUrl = 'https://other.test'; }],
];
for (const [kind, change] of changes) {
  it.each([routes[1], routes[5]])(`%s: ${kind} change refuses retry before send`, async (_name, call) => {
    const { auth, fetchFn, memory, pipeline } = setup(async () => { change(auth); return json(429, {}); });
    const error = await call(memory, pipeline).catch(e => e);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(error).toMatchObject({ name: 'SubmitScopeChangedError', code: 'submit_scope_changed', idempotencyKey: 'test_retry_key', attempts: 1 });
  });
}
it('same principal token renewal allows a safe retry', async () => {
  const { auth, fetchFn, memory } = setup(async () => {
    if (fetchFn.mock.calls.length === 1) { auth.currentToken = 'renewed'; return json(429, {}); }
    return json(200, RECEIPT);
  });
  auth.mode = 'sso';
  auth.currentUser = { id: 'test_retry_user' };
  await memory.ingest('x');
  expect(fetchFn).toHaveBeenCalledTimes(2);
});
