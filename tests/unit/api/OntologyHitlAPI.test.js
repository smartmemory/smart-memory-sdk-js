import { describe, it, expect, vi } from 'vitest';
import { OntologyAPI } from '../../../src/api/OntologyAPI.js';

function mockBaseAPI() {
  return {
    get: vi.fn().mockResolvedValue({ items: [], count: 0, open_count: 0 }),
    post: vi.fn().mockResolvedValue({ item: { status: 'resolved' } })
  };
}

describe('OntologyAPI HITL (ONTO-HITL-CONSUMER-1)', () => {
  it('listHitl uses defaults (status=open, limit=50, no kind)', async () => {
    const api = mockBaseAPI();
    await new OntologyAPI(api).listHitl();
    expect(api.get).toHaveBeenCalledWith('/memory/ontology/hitl?status=open&limit=50');
  });

  it('listHitl includes kind when provided', async () => {
    const api = mockBaseAPI();
    await new OntologyAPI(api).listHitl({ status: 'resolved', kind: 'missing_in_graph', limit: 10 });
    expect(api.get).toHaveBeenCalledWith(
      '/memory/ontology/hitl?status=resolved&limit=10&kind=missing_in_graph'
    );
  });

  it('resolveHitl posts action + note to the item path', async () => {
    const api = mockBaseAPI();
    await new OntologyAPI(api).resolveHitl('h1', { action: 'accepted', note: 'ok' });
    expect(api.post).toHaveBeenCalledWith('/memory/ontology/hitl/h1/resolve', {
      action: 'accepted',
      note: 'ok'
    });
  });

  it('resolveHitl defaults note to null', async () => {
    const api = mockBaseAPI();
    await new OntologyAPI(api).resolveHitl('h2', { action: 'dismissed' });
    expect(api.post).toHaveBeenCalledWith('/memory/ontology/hitl/h2/resolve', {
      action: 'dismissed',
      note: null
    });
  });
});
