// @vitest-environment node
// BUG-FAIL-IF-CONFLICTED-SOURCE-DATE-1: the service's 409 `conflict_check_undecided` reaches the caller as a typed
// error, and the `mark` marker is passed through. The bodies are the service's real answers for frozen pair 4
// (units/BUG-FAIL-IF-CONFLICTED-SOURCE-DATE-1/wire-bodies.log). Real AuthCore, real fetch, real loopback HTTP server
// on an ephemeral port: status handling and JSON decoding are the SDK's own.
import { createServer } from 'node:http';
import { once } from 'node:events';
import { afterEach, describe, expect, it } from 'vitest';
import { AuthCore } from '../../../src/auth/AuthCore.js';
import { BaseAPI } from '../../../src/api/BaseAPI.js';
import { MemoryAPI } from '../../../src/api/MemoryAPI.js';
import { RecallAPI } from '../../../src/api/RecallAPI.js';
import { APIError, ConflictCheckUndecidedError } from '../../../src/index.js';

const REASON = 'two different values for one attribute of a shared identifier; the aligned-text check could not compare them';
const UNDECIDED_409 = {
  detail: {
    error: 'conflict_check_undecided',
    message: `Recall conflict check could not decide 1 pair(s): ${REASON}`,
    pairs: [['test_ccu_a', 'test_ccu_b']],
    reason: REASON,
  },
};
const MARKER = { method: 'aligned_text', undecided_pairs: [{ item_ids: ['test_ccu_a', 'test_ccu_b'], reason: REASON }] };
const ITEMS = [
  { item_id: 'test_ccu_a', content: 'KX-410 costs 1,200 EUR.', conflict: null },
  { item_id: 'test_ccu_b', content: 'KX-410 price is 1,450 EUR.', conflict: null },
];

let server;
afterEach(() => new Promise(resolve => (server ? server.close(resolve) : resolve())));

async function serve(status, body) {
  localStorage?.clear?.();
  server = createServer((req, res) => {
    req.resume();
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const auth = new AuthCore({ apiBaseUrl: `http://127.0.0.1:${server.address().port}`, apiKey: 'test_ccu_key' });
  return new BaseAPI(auth);
}

describe('conflict_check_undecided', () => {
  it('search throws the typed error, still an APIError, with pairs and reason', async () => {
    const base = await serve(409, UNDECIDED_409);
    const error = await new MemoryAPI(base).search('KX-410', { failIfConflicted: true }).catch(e => e);
    expect(error).toBeInstanceOf(ConflictCheckUndecidedError);
    expect(error).toBeInstanceOf(APIError);
    expect(error.status).toBe(409);
    expect(error.code).toBe('conflict_check_undecided');
    expect(error.pairs).toEqual([['test_ccu_a', 'test_ccu_b']]);
    expect(error.reason).toBe(REASON);
    expect(error.detail).toEqual(UNDECIDED_409);
  });

  it('pack throws the same typed error', async () => {
    const base = await serve(409, UNDECIDED_409);
    const error = await new RecallAPI(base).pack({ budgetTokens: 2000, failIfConflicted: true }).catch(e => e);
    expect(error).toBeInstanceOf(ConflictCheckUndecidedError);
    expect(error.pairs).toEqual([['test_ccu_a', 'test_ccu_b']]);
  });

  it('leaves recall_conflict and other 409s as a plain APIError', async () => {
    const recall = await new MemoryAPI(await serve(409, { detail: { error: 'recall_conflict', pairs: [['a', 'b']] } }))
      .search('x', { failIfConflicted: true }).catch(e => e);
    expect(recall).toBeInstanceOf(APIError);
    expect(recall).not.toBeInstanceOf(ConflictCheckUndecidedError);
    await new Promise(resolve => server.close(resolve));
    const other = await new MemoryAPI(await serve(409, { detail: { error_code: 'version_mismatch' } }))
      .search('x').catch(e => e);
    expect(other).not.toBeInstanceOf(ConflictCheckUndecidedError);
    await new Promise(resolve => server.close(resolve));
    const wrongStatus = await new MemoryAPI(await serve(422, UNDECIDED_409)).search('x').catch(e => e);
    expect(wrongStatus).not.toBeInstanceOf(ConflictCheckUndecidedError);
  });

  it('passes method, hint and the not-checked count through unchanged, null when absent', async () => {
    const sent = { detail: { ...UNDECIDED_409.detail, method: 'jev', hint: 'set a key', pairs_not_checked: 4 } };
    const full = await new MemoryAPI(await serve(409, sent)).search('KX-410', { failIfConflicted: true }).catch(e => e);
    expect([full.method, full.hint, full.pairsNotChecked]).toEqual(['jev', 'set a key', 4]);
    await new Promise(resolve => server.close(resolve));
    const old = await new MemoryAPI(await serve(409, UNDECIDED_409)).search('KX-410', { failIfConflicted: true }).catch(e => e);
    expect([old.method, old.hint, old.pairsNotChecked]).toEqual([null, null, null]);
    await new Promise(resolve => server.close(resolve));
    const conflict = { detail: { error: 'recall_conflict', pairs: [['a', 'b']], method: 'jev' } };
    const refused = await new MemoryAPI(await serve(409, conflict)).search('x', { failIfConflicted: true }).catch(e => e);
    expect(refused.detail.detail.method).toBe('jev');
  });

  it('passes the mark marker through search and pack unchanged', async () => {
    const search = await new MemoryAPI(await serve(200, { results: ITEMS, group_roots: {}, conflict_check: MARKER }))
      .search('KX-410', { failIfConflicted: true });
    expect(search.conflict_check).toEqual(MARKER);
    expect(search.results.every(item => item.conflict === null)).toBe(true);
    await new Promise(resolve => server.close(resolve));
    const pack = await new RecallAPI(await serve(200, { block: 'b', conflict: false, manifest: { conflict_check: MARKER } }))
      .pack({ budgetTokens: 2000, failIfConflicted: true });
    expect(pack.manifest.conflict_check).toEqual(MARKER);
    expect(pack.conflict).toBe(false);
  });
});
