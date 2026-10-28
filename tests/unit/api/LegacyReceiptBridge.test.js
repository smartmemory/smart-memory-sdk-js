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

describe('legacy save bridge', () => {
  // One row per body: the legacy rows are red at base (unsupported_version), the rest pass at both.
  const ROWS = [
    ['1.1 receipt decodes as today', { ...RECEIPT }, { item_id: 'mem_123', legacy: undefined, status: 'received', run_id: 'run_1' }],
    ['legacy add body is stored', { id: 'i1', status: 'created', pipeline_used: true, ...CTX }, { item_id: 'i1', legacy: true, status: 'stored', run_id: null, status_url: null }],
    ['legacy ingest/dedupe body is stored', { item_id: 'i2', status: 'created', extraction_held: false }, { item_id: 'i2', legacy: true, status: 'stored' }],
    ['random object is unsupported_version', { foo: 'bar' }, { refuse: 'unsupported_version' }],
    ['status without an id is refused', { status: 'created', pipeline_used: true }, { refuse: 'unsupported_version' }],
    ['empty id is refused', { id: '', status: 'created' }, { refuse: 'unsupported_version' }],
    ['legacy keys plus a 2.x schema_version stay refused', { id: 'i3', status: 'created', schema_version: '2.0' }, { refuse: 'unsupported_version' }],
  ];
  it.each(ROWS)('%s', (_name, body, want) => {
    if (want.refuse) {
      expect(() => decodeReceipt(body)).toThrow(expect.objectContaining({ code: want.refuse }));
      return;
    }
    const receipt = decodeReceipt(body);
    expect(receipt).toBeInstanceOf(SaveReceipt);
    expect(receipt.item_id).toBe(want.item_id);
    expect(receipt.legacy).toBe(want.legacy);
    expect(receipt.status).toBe(want.status);
    if ('run_id' in want) expect(receipt.run_id).toBe(want.run_id);
    if ('status_url' in want) expect(receipt.status_url).toBe(want.status_url);
  });

  it('warns once per process, naming the shape and no values', async () => {
    vi.resetModules();
    const { decodeReceipt: fresh } = await import('../../../src/api/receipt.js');
    fresh({ id: 'secret-id-1', status: 'created' });
    fresh({ id: 'secret-id-2', status: 'created' });
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
