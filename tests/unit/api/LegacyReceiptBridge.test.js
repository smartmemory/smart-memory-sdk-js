import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryAPI } from '../../../src/api/MemoryAPI.js';
import { SaveReceipt, decodeReceipt } from '../../../src/api/receipt.js';
import { UnsupportedReceiptError } from '../../../src/errors/ReceiptErrors.js';
import { RECEIPT } from './receiptFixtures.js';

// SDKJS-2.0-RECEIPT-LEGACY-BRIDGE-1: the service still answers add/ingest with the pre-receipt body.
const CTX = { user_id: 'u', tenant_id: 't', workspace_id: 'w', team_id: null, isolation_level: 'workspace' };

let warn;
beforeEach(() => { warn = vi.spyOn(console, 'warn').mockImplementation(() => {}); });
afterEach(() => vi.restoreAllMocks());

// Bodies copied from service origin/2.0: ingest.py:462-476 (sync success), :268-280 (content-hash duplicate),
// :333 (held, `{**result, run_id, ...}` with held.py:25 `item_id: None`), :233 (async `submit_async_ingest` receipt
// `{run_id, status, stages, deadline_at}` plus `user_id`/`served`), crud.py:817 (add) and :1542 (PATCH update).
const INGEST_COMMON = { user_id: 'u', tenant_id: 't', queued: false, procedure_match: null, drift_detected: false, ontology_version: '', ontology_registry_id: '', unresolved_entities: [], constraint_violations: [] };
const INGEST_SYNC = { item_id: 'i2', status: 'created', run_id: 'run_9', ...INGEST_COMMON };
const INGEST_DUP = { item_id: 'i2', run_id: null, ...INGEST_COMMON };
const INGEST_HELD = { item_id: null, status: 'held', run_id: 'run_9', user_id: 'u', tenant_id: 't' };
const INGEST_ASYNC = { run_id: 'run_9', status: 'queued', stages: ['classify'], deadline_at: '2026-10-28T00:00:00Z', user_id: 'u', served: 'async' };
const ADD_CREATED = { id: 'i1', status: 'created', pipeline_used: true, ...CTX };
const ADD_HELD = { id: null, item_id: null, status: 'held', pipeline_used: true, extraction_held: true, ...CTX };
const PATCH_BODY = { status: 'success', message: 'updated', item_id: 'i1', ...CTX };

// Route to the MemoryAPI call that reaches decodeReceipt (or the raw PATCH).
const CALLS = {
  create: (m) => m.create({ content: 'x' }),
  ingest: (m) => m.ingest('x'),
  'update+rev': (m) => m.update('i1', { content: 'x' }, { expectedRevision: 3 }),
  'update plain': (m) => m.update('i1', { content: 'x' }),
};

describe('legacy save bridge', () => {
  // One row per body: [name, route, wire body, want]. `item_id` decodes as a stored legacy receipt, `refuse` is
  // the typed code, `raw` is the untouched response (the legacy PATCH without expectedRevision).
  const ROWS = [
    ['1.1 receipt decodes as today (create)', 'create', { ...RECEIPT }, { item_id: 'mem_123', status: 'received', run_id: 'run_1' }],
    ['add created is stored', 'create', ADD_CREATED, { item_id: 'i1', status: 'stored', run_id: null, status_url: null }],
    ['add held is refused', 'create', ADD_HELD, { refuse: 'unsupported_version' }],
    ['ingest sync success (run_id kept off the handle)', 'ingest', INGEST_SYNC, { item_id: 'i2', status: 'stored', run_id: null, status_url: null }],
    ['ingest content-hash duplicate (run_id null, no status)', 'ingest', INGEST_DUP, { item_id: 'i2', status: 'stored', run_id: null }],
    ['ingest held is refused', 'ingest', INGEST_HELD, { refuse: 'unsupported_version' }],
    ['ingest async receipt is refused (queued, no item_id)', 'ingest', INGEST_ASYNC, { refuse: 'unsupported_version' }],
    ['ingest status without run_id key and without status is refused', 'ingest', { item_id: 'i2' }, { refuse: 'unsupported_version' }],
    ['ingest status absent with a string run_id is refused', 'ingest', { item_id: 'i2', run_id: 'run_9' }, { refuse: 'unsupported_version' }],
    ['ingest status=error is refused', 'ingest', { ...INGEST_SYNC, status: 'error' }, { refuse: 'unsupported_version' }],
    ['ingest status=failed is refused', 'ingest', { ...INGEST_SYNC, status: 'failed' }, { refuse: 'unsupported_version' }],
    ['create status=success is refused', 'create', { ...ADD_CREATED, status: 'success' }, { refuse: 'unsupported_version' }],
    ['ingest with a status_url is refused', 'ingest', { ...INGEST_SYNC, status_url: '/memory/status/run_9' }, { refuse: 'unsupported_version' }],
    ['PATCH update body with expectedRevision is refused', 'update+rev', PATCH_BODY, { refuse: 'unsupported_version' }],
    ['PATCH update body without expectedRevision stays the raw response', 'update plain', PATCH_BODY, { raw: true }],
    ['random object is unsupported_version', 'create', { foo: 'bar' }, { refuse: 'unsupported_version' }],
    ['empty id is refused', 'create', { id: '', status: 'created' }, { refuse: 'unsupported_version' }],
    ['legacy keys plus a 2.x schema_version stay refused', 'create', { id: 'i3', status: 'created', schema_version: '2.0' }, { refuse: 'unsupported_version' }],
  ];
  it.each(ROWS)('%s', async (_name, route, body, want) => {
    const api = { post: vi.fn(async () => body), patch: vi.fn(async () => body), get: vi.fn() };
    const call = CALLS[route](new MemoryAPI(api));
    if (want.refuse) {
      await expect(call).rejects.toThrow(expect.objectContaining({ code: want.refuse }));
      return;
    }
    const receipt = await call;
    if (want.raw) {
      expect(receipt).toBe(body);
      return;
    }
    expect(receipt).toBeInstanceOf(SaveReceipt);
    expect(receipt.item_id).toBe(want.item_id);
    expect(receipt.legacy).toBe(want.status === 'stored' ? true : undefined);
    expect(receipt.status).toBe(want.status);
    if (receipt.legacy) {
      // W1: a legacy receipt is not terminal, so it never reads as a completed run.
      expect(receipt.terminal).toBe(false);
      expect(receipt.execution_state).not.toBe('completed');
    }
    if ('run_id' in want) expect(receipt.run_id).toBe(want.run_id);
    if ('status_url' in want) expect(receipt.status_url).toBe(want.status_url);
  });

  it('the bare decoder refuses every legacy body unless the caller opts in', () => {
    expect(() => decodeReceipt(ADD_CREATED)).toThrow(expect.objectContaining({ code: 'unsupported_version' }));
    expect(decodeReceipt(ADD_CREATED, { legacyBridge: true }).legacy).toBe(true);
  });

  it('warns once per process, naming the shape and no values', async () => {
    vi.resetModules();
    const { decodeReceipt: fresh } = await import('../../../src/api/receipt.js');
    fresh({ id: 'secret-id-1', status: 'created' }, { legacyBridge: true });
    fresh({ id: 'secret-id-2', status: 'created' }, { legacyBridge: true });
    const lines = warn.mock.calls.map(c => String(c[0])).filter(l => l.includes('legacy save shape'));
    expect(lines).toHaveLength(1);
    expect(lines[0]).not.toContain('secret-id');
  });

  it('create() resolves a legacy receipt; awaitReceipt and getStatus refuse with legacy_receipt_no_status', async () => {
    const api = { post: vi.fn(async () => ({ id: 'i1', status: 'created', pipeline_used: true, ...CTX })), get: vi.fn() };
    const memory = new MemoryAPI(api);
    const receipt = await memory.create({ content: 'x' });
    expect(String(receipt)).toBe('i1 (stored)');
    const refusal = expect.objectContaining({ code: 'legacy_receipt_no_status' });
    await expect(memory.awaitReceipt(receipt)).rejects.toThrow(refusal);
    await expect(memory.getStatus(receipt)).rejects.toBeInstanceOf(UnsupportedReceiptError);
    expect(api.get).not.toHaveBeenCalled();
  });
});
