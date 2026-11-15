// Review fix M3 (DECISION-RESTORE-ONE-ACTION-1): a decision id can never send a request to another route.
// Every DecisionAPI method that puts a decision id in the path refuses an id that could leave its route
// before any request is made, and encodes every other id as one segment (checked through Node's URL parser,
// which drops a fragment and splits a query exactly as the request would).
import { describe, it, expect, vi } from 'vitest';
import { DecisionAPI } from '../../../src/api/DecisionAPI.js';

const CALLS = {
  get: (d, id) => d.get(id),
  supersede: (d, id) => d.supersede(id, { new_content: 'n', reason: 'r' }),
  retract: (d, id) => d.retract(id, 'r'),
  restore: (d, id) => d.restore(id, 'r'),
  reinforce: (d, id) => d.reinforce(id, 'e'),
  linkDecisionEvidence: (d, id) => d.linkDecisionEvidence(id, 'e'),
  contradict: (d, id) => d.contradict(id, 'e'),
  getProvenance: (d, id) => d.getProvenance(id),
  getCausalChain: (d, id) => d.getCausalChain(id),
  findConflicts: (d, id) => d.findConflicts(id),
  resolveRequirement: (d, id) => d.resolveRequirement(id, { requirementId: 'q', memoryId: 'm' }),
  tryActivate: (d, id) => d.tryActivate(id),
};

function recording() {
  const seen = [];
  const record = (path) => { seen.push(path); return Promise.resolve({}); };
  return { seen, api: { get: vi.fn(record), post: vi.fn(record), put: vi.fn(record), patch: vi.fn(record) } };
}

describe('DecisionAPI decision id path guard', () => {
  it('refuses, before any request, every id that could leave its route', async () => {
    const { seen, api } = recording();
    const decisions = new DecisionAPI(api);
    for (const [name, call] of Object.entries(CALLS)) {
      const pending = name === 'resolveRequirement' || name === 'tryActivate';
      const bad = ['victim/retract#', '..', '.', '', 'a\\b', 'a\nb', 'create', ...(pending ? [] : ['search', 'pending'])];
      for (const id of bad) {
        await expect(call(decisions, id), `${name} ${JSON.stringify(id)}`).rejects.toThrow(/Invalid id/);
      }
    }
    expect(seen).toEqual([]);
  });

  it('keeps a normal or odd id as one segment of its own route', async () => {
    const { seen, api } = recording();
    const decisions = new DecisionAPI(api);
    for (const [name, call] of Object.entries(CALLS)) {
      seen.length = 0;
      await call(decisions, 'dec_1?x=1#frag %2F');
      const url = new URL(seen[0], 'http://127.0.0.1');
      expect(url.pathname, name).toContain('/dec_1%3Fx%3D1%23frag%20%252F');
      expect(url.hash, name).toBe('');
      expect(url.searchParams.get('x'), name).toBeNull();
    }
  });
});
