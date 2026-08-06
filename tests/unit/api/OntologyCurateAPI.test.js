import { describe, it, expect, vi } from 'vitest';
import { OntologyAPI } from '../../../src/api/OntologyAPI.js';

function mockBaseAPI() {
  return {
    get: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
    post: vi.fn().mockResolvedValue({ ok: true })
  };
}

describe('OntologyAPI curation queue (ONTO-HITL-CURATE-1)', () => {
  it('listReviewQueue uses defaults (limit=100, no filters)', async () => {
    const api = mockBaseAPI();
    await new OntologyAPI(api).listReviewQueue();
    expect(api.get).toHaveBeenCalledWith('/memory/ontology/queue?limit=100');
  });

  it('listReviewQueue includes all filters when provided', async () => {
    const api = mockBaseAPI();
    await new OntologyAPI(api).listReviewQueue({
      tier: 'working',
      assignee: 'alice',
      source: 'llm',
      limit: 25,
      cursor: 'cursor-1'
    });
    expect(api.get).toHaveBeenCalledWith(
      '/memory/ontology/queue?limit=25&tier=working&assignee=alice&source=llm&cursor=cursor-1'
    );
  });

  it('approveReviewType posts expected_tier when provided', async () => {
    const api = mockBaseAPI();
    await new OntologyAPI(api).approveReviewType('Needs/Review', { expectedTier: 'working' });
    expect(api.post).toHaveBeenCalledWith('/memory/ontology/queue/Needs%2FReview/approve', {
      expected_tier: 'working'
    });
  });

  it('rejectReviewType omits expected_tier when not provided', async () => {
    const api = mockBaseAPI();
    await new OntologyAPI(api).rejectReviewType('Needs Review');
    expect(api.post).toHaveBeenCalledWith('/memory/ontology/queue/Needs%20Review/reject', {});
  });

  it('retireType retires a confirmed private record class', async () => {
    const api = mockBaseAPI();
    await new OntologyAPI(api).retireType('confirmed/private', 'superseded');
    expect(api.post).toHaveBeenCalledWith('/memory/ontology/types/confirmed%2Fprivate/retire', {
      reason: 'superseded'
    });
  });

  it('mergeReviewType posts into_id and expected_tier', async () => {
    const api = mockBaseAPI();
    await new OntologyAPI(api).mergeReviewType('Candidate', 'Canonical', {
      expectedTier: 'proposed'
    });
    expect(api.post).toHaveBeenCalledWith('/memory/ontology/queue/Candidate/merge', {
      into_id: 'Canonical',
      expected_tier: 'proposed'
    });
  });

  it('editPromoteReviewType posts edits and omits expected_tier', async () => {
    const api = mockBaseAPI();
    await new OntologyAPI(api).editPromoteReviewType('Candidate', { name: 'Canonical' });
    expect(api.post).toHaveBeenCalledWith('/memory/ontology/queue/Candidate/edit-promote', {
      edits: { name: 'Canonical' }
    });
  });

  it('assignReviewer posts null to clear assignment', async () => {
    const api = mockBaseAPI();
    await new OntologyAPI(api).assignReviewer('Candidate', null);
    expect(api.post).toHaveBeenCalledWith('/memory/ontology/queue/Candidate/assign', {
      assignee: null
    });
  });

  it('bulkReviewAction posts action, ids, params, and expected_tier', async () => {
    const api = mockBaseAPI();
    api.post = vi.fn().mockResolvedValue({
      results: [
        { id: 'Candidate', ok: true, error: null },
        { id: 'Missing', ok: false, error: 'not found' }
      ]
    });

    const result = await new OntologyAPI(api).bulkReviewAction(
      'merge',
      ['Candidate', 'Missing'],
      {
        params: { into_id: 'Canonical' },
        expectedTier: 'working'
      }
    );

    expect(result.results[0].ok).toBe(true);
    expect(result.results[1].error).toBe('not found');
    expect(api.post).toHaveBeenCalledWith('/memory/ontology/queue/bulk', {
      action: 'merge',
      ids: ['Candidate', 'Missing'],
      params: { into_id: 'Canonical' },
      expected_tier: 'working'
    });
  });
});
