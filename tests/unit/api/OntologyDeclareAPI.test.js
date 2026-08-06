// CORE-MEMTYPE-DECLARE-1 T8 — declareType / declareRelation wire shapes,
// the kind list filter, and the dual-export check (index + core entries).
import { describe, it, expect, vi } from 'vitest';
import { OntologyAPI } from '../../../src/api/OntologyAPI.js';

const SCHEMA = {
  title: { type: 'string', indexed: true },
  attendees: { type: 'list', of: 'string' }
};

function mockBaseAPI() {
  return {
    get: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
    post: vi.fn().mockResolvedValue({ name: 'fluid_event', kind: 'record' })
  };
}

describe('OntologyAPI declare surface (CORE-MEMTYPE-DECLARE-1)', () => {
  it('declareType maps camelCase options onto the contract body', async () => {
    const api = mockBaseAPI();
    await new OntologyAPI(api).declareType('fluid_event', {
      kind: 'record',
      propertiesSchema: SCHEMA,
      requiredProperties: ['title'],
      storageStrategy: 'append',
      storageSearchable: false
    });
    expect(api.post).toHaveBeenCalledWith('/memory/ontology/types', {
      name: 'fluid_event',
      kind: 'record',
      tier: 'confirmed',
      properties_schema: SCHEMA,
      required_properties: ['title'],
      storage_strategy: 'append',
      storage_searchable: false
    });
  });

  it('declareType defaults to an entity-kind declaration with no facet', async () => {
    const api = mockBaseAPI();
    await new OntologyAPI(api).declareType('Instrument');
    expect(api.post).toHaveBeenCalledWith('/memory/ontology/types', {
      name: 'Instrument',
      kind: 'entity',
      tier: 'confirmed'
    });
  });

  it('declareRelation maps domain/range/cardinality', async () => {
    const api = mockBaseAPI();
    await new OntologyAPI(api).declareRelation('informs', {
      domain: ['fluid_idea'],
      range: ['fluid_decision'],
      cardinality: 'N:N'
    });
    expect(api.post).toHaveBeenCalledWith('/memory/ontology/relations', {
      name: 'informs',
      tier: 'confirmed',
      domain: ['fluid_idea'],
      range: ['fluid_decision'],
      cardinality: 'N:N'
    });
  });

  it('listTypes threads the kind filter', async () => {
    const api = mockBaseAPI();
    await new OntologyAPI(api).listTypes({ kind: 'record' });
    expect(api.get).toHaveBeenCalledWith('/memory/ontology/types?limit=100&kind=record');
  });

  it('OntologyAPI is exported from BOTH entry points (dual-export rule)', async () => {
    const index = await import('../../../src/index.js');
    const core = await import('../../../src/core.js');
    expect(index.OntologyAPI).toBe(OntologyAPI);
    expect(core.OntologyAPI).toBe(OntologyAPI);
  });
});
