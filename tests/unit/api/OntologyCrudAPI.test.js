import { describe, it, expect } from 'vitest';
import { vi } from 'vitest';
import { OntologyAPI } from '../../../src/api/OntologyAPI.js';

function mockBaseAPI() {
  return {
    get: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
    post: vi.fn().mockResolvedValue({ from_name: 'A', into_name: 'B', instances_migrated: 0 })
  };
}

describe('OntologyAPI CRUD read/audit/migration (ONTO-CRUD-1)', () => {
  it('listTypes uses defaults (limit=100, no filters)', async () => {
    const api = mockBaseAPI();
    await new OntologyAPI(api).listTypes();
    expect(api.get).toHaveBeenCalledWith('/memory/ontology/types?limit=100');
  });

  it('listTypes includes all filters when provided', async () => {
    const api = mockBaseAPI();
    await new OntologyAPI(api).listTypes({
      tier: 'confirmed',
      layer: 'public',
      packId: 'pack-1',
      hasIri: true,
      limit: 10,
      cursor: 'c1'
    });
    expect(api.get).toHaveBeenCalledWith(
      '/memory/ontology/types?limit=10&tier=confirmed&layer=public&pack_id=pack-1&has_iri=true&cursor=c1'
    );
  });

  it('listRelations uses defaults (limit=100, no filters)', async () => {
    const api = mockBaseAPI();
    await new OntologyAPI(api).listRelations();
    expect(api.get).toHaveBeenCalledWith('/memory/ontology/relations?limit=100');
  });

  it('listRelations includes filters when provided', async () => {
    const api = mockBaseAPI();
    await new OntologyAPI(api).listRelations({ tier: 'proposed', hasIri: false, limit: 25 });
    expect(api.get).toHaveBeenCalledWith(
      '/memory/ontology/relations?limit=25&tier=proposed&has_iri=false'
    );
  });

  it('getType fetches a single type by id', async () => {
    const api = mockBaseAPI();
    await new OntologyAPI(api).getType('Person');
    expect(api.get).toHaveBeenCalledWith('/memory/ontology/types/Person');
  });

  it('getType URL-encodes the type id', async () => {
    const api = mockBaseAPI();
    await new OntologyAPI(api).getType('a/b c');
    expect(api.get).toHaveBeenCalledWith('/memory/ontology/types/a%2Fb%20c');
  });

  it('getType propagates a 404 error', async () => {
    const api = mockBaseAPI();
    api.get = vi.fn().mockRejectedValue({ status: 404 });
    await expect(new OntologyAPI(api).getType('nonexistent')).rejects.toMatchObject({ status: 404 });
  });

  it('getRelation fetches a single relation by id', async () => {
    const api = mockBaseAPI();
    await new OntologyAPI(api).getRelation('WORKS_AT');
    expect(api.get).toHaveBeenCalledWith('/memory/ontology/relations/WORKS_AT');
  });

  it('listAudit uses defaults (limit=200, no filters)', async () => {
    const api = mockBaseAPI();
    await new OntologyAPI(api).listAudit();
    expect(api.get).toHaveBeenCalledWith('/memory/ontology/audit?limit=200');
  });

  it('listAudit includes all filters when provided', async () => {
    const api = mockBaseAPI();
    await new OntologyAPI(api).listAudit({
      actor: 'user-1',
      action: 'retire',
      since: '2026-01-01T00:00:00Z',
      until: '2026-02-01T00:00:00Z',
      limit: 50
    });
    expect(api.get).toHaveBeenCalledWith(
      '/memory/ontology/audit?limit=50&actor=user-1&action=retire&since=2026-01-01T00%3A00%3A00Z&until=2026-02-01T00%3A00%3A00Z'
    );
  });

  it('getTypeAudit fetches the audit trail for a type', async () => {
    const api = mockBaseAPI();
    await new OntologyAPI(api).getTypeAudit('Person');
    expect(api.get).toHaveBeenCalledWith('/memory/ontology/types/Person/audit');
  });

  it('getRelationAudit fetches the audit trail for a relation', async () => {
    const api = mockBaseAPI();
    await new OntologyAPI(api).getRelationAudit('WORKS_AT');
    expect(api.get).toHaveBeenCalledWith('/memory/ontology/relations/WORKS_AT/audit');
  });

  it('getPackAudit with no version omits the query string', async () => {
    const api = mockBaseAPI();
    await new OntologyAPI(api).getPackAudit('pack-1');
    expect(api.get).toHaveBeenCalledWith('/memory/ontology/packs/pack-1/audit');
  });

  it('getPackAudit includes pack_version when provided', async () => {
    const api = mockBaseAPI();
    await new OntologyAPI(api).getPackAudit('pack-1', { packVersion: 'v2' });
    expect(api.get).toHaveBeenCalledWith('/memory/ontology/packs/pack-1/audit?pack_version=v2');
  });

  it('migrateTypeInstances posts reason + default batch_size', async () => {
    const api = mockBaseAPI();
    await new OntologyAPI(api).migrateTypeInstances('OldType', 'NewType', { reason: 'consolidation' });
    expect(api.post).toHaveBeenCalledWith('/memory/ontology/types/OldType/migrate-to/NewType', {
      reason: 'consolidation',
      batch_size: 500
    });
  });

  it('migrateTypeInstances posts a custom batch_size', async () => {
    const api = mockBaseAPI();
    await new OntologyAPI(api).migrateTypeInstances('A', 'B', { reason: 'test', batchSize: 100 });
    expect(api.post).toHaveBeenCalledWith('/memory/ontology/types/A/migrate-to/B', {
      reason: 'test',
      batch_size: 100
    });
  });

  it('migrateTypeInstances propagates a 400 self-migration error', async () => {
    const api = mockBaseAPI();
    api.post = vi.fn().mockRejectedValue({ status: 400 });
    await expect(
      new OntologyAPI(api).migrateTypeInstances('A', 'A', { reason: 'oops' })
    ).rejects.toMatchObject({ status: 400 });
  });
});
