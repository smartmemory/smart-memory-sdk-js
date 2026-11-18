import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const root = pathToFileURL(process.cwd() + '/');
const load = p => import(new URL(p, root));
const { awaitReceipt } = await load('src/api/awaitReceipt.js');
const { decodeReceipt } = await load('src/api/receipt.js');
const { MemoryAPI } = await load('src/api/MemoryAPI.js');
const { PipelineAPI } = await load('src/api/PipelineAPI.js');
const { BaseAPI } = await load('src/api/BaseAPI.js');
const { StageChainError } = await load('src/errors/ReceiptErrors.js');
const { RECEIPT, STAGE_PENDING } = await load('tests/unit/api/receiptFixtures.js');
console.warn = () => {};

// M1: hold the actual GET past the promised client deadline, then settle it.
let release;
let getOptions;
const delayed = new Promise(resolve => { release = resolve; });
const start = performance.now();
let settled = false;
const pending = awaitReceipt({ get: (_url, options) => { getOptions = options; return delayed; } }, decodeReceipt(RECEIPT), { timeoutMs: 20 });
pending.then(() => { settled = true; });
await new Promise(resolve => setTimeout(resolve, 80));
assert.equal(settled, false);
assert.equal(getOptions.signal, undefined);
release({ ...RECEIPT });
const late = await pending;
assert.equal(late.client_timed_out, true);
console.log('M1: timeoutMs=20, still pending after 80ms, internal abort signal absent, eventually timed_out=' + late.client_timed_out + ', elapsed_ms=' + Math.round(performance.now() - start));

// M2: the caller still owns metadata during a transport retry.
const metadata = { count: 1 };
const bodies = [];
const auth = { apiBaseUrl: 'https://review.invalid', getAuthHeaders: h => h || {}, getRequestOptions: x => x, mode: 'api-key' };
const base = new BaseAPI(auth, { fetchFn: async (_url, init) => {
  bodies.push(init.body);
  if (bodies.length === 1) { metadata.count = 2; throw new TypeError('synthetic transport loss'); }
  return { ok: true, status: 202, json: async () => ({ ...RECEIPT }) };
}});
await new MemoryAPI(base).create({ content: 'x', metadata, idempotencyKey: 'review-key' });
assert.equal(bodies.length, 2);
assert.notEqual(bodies[0], bodies[1]);
assert.equal(JSON.parse(bodies[0]).idempotency_key, JSON.parse(bodies[1]).idempotency_key);
console.log('M2: retry bodies differ under same key, metadata.count=' + bodies.map(b => JSON.parse(b).metadata.count).join(' -> '));

// M3: unchanged successful reads must increase their backoff.
let time = 0;
const sleeps = [];
await awaitReceipt({ get: async () => ({ ...RECEIPT }) }, decodeReceipt(RECEIPT), {
  timeoutMs: 3000, holdMs: 0, now: () => time, random: () => 1,
  sleep: async ms => { sleeps.push(ms); time += ms; },
});
assert.equal(sleeps.length, 12);
assert(sleeps.every(ms => ms === 250));
console.log('M3: unchanged successful short polls, sleep_ms=' + JSON.stringify(sleeps));

// M4: a new major / mandatory state encountered while chaining needs ST33's typed error.
for (const mutation of [{ schema_version: '2.0' }, { execution_state: 'future_state' }]) {
  const pipeline = new PipelineAPI({ get: async () => ({ ...STAGE_PENDING, ...mutation }) });
  const error = await pipeline.chainRequest(decodeReceipt(STAGE_PENDING)).catch(e => e);
  assert.equal(error instanceof StageChainError, false);
  assert.equal(error.run_id, STAGE_PENDING.run_id);
  console.log('M4: chainRequest sees ' + Object.keys(mutation)[0] + ', got ' + error.name + '/' + error.code + ', expected StageChainError/unsupported_receipt_version');
}

// M5: an additive optional minor field collides with the local convenience getter.
let additiveError;
try { decodeReceipt({ ...RECEIPT, schema_version: '1.2', status: 'opaque-future-field' }); } catch (e) { additiveError = e; }
assert(additiveError instanceof TypeError);
console.log('M5: compatible 1.2 + optional status field throws ' + additiveError.name + ': ' + additiveError.message);
