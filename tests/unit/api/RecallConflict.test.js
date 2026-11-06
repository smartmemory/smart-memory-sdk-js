import { describe, it, expect } from 'vitest';
import { MemoryAPI } from '../../../src/api/MemoryAPI.js';
import { RecallAPI } from '../../../src/api/RecallAPI.js';

describe('recall conflict options and evidence', () => {
  it('forwards strict options through both APIs and preserves returned evidence', async () => {
    const calls = [];
    const evidence = { with_item_ids: ['test_rcf_b'], types: ['numeric_mismatch'], ordering: 'created_at_desc_item_id_asc' };
    const transport = { post: async (url, body) => {
      calls.push({ url, body });
      return url.endsWith('/pack') ? { block: '', conflict: true, manifest: { conflicts: [{ item_ids: ['test_rcf_a', 'test_rcf_b'], type: 'numeric_mismatch' }] } } : { results: [{ item_id: 'test_rcf_a', conflict: evidence }], group_roots: {} };
    } };
    const search = await new MemoryAPI(transport).search('Acme', { failIfConflicted: true });
    expect(calls[0].body.fail_if_conflicted).toBe(true);
    expect(search.results[0].conflict).toEqual(evidence);
    const pack = await new RecallAPI(transport).pack({ budgetTokens: 1000, failIfConflicted: true });
    expect(calls[1].body.fail_if_conflicted).toBe(true);
    expect(pack.conflict).toBe(true);
    expect(pack.manifest.conflicts[0].item_ids).toEqual(['test_rcf_a', 'test_rcf_b']);
    await new RecallAPI(transport).pack({ budgetTokens: 1000 });
    expect(calls[2].body).not.toHaveProperty('fail_if_conflicted');
  });
});
