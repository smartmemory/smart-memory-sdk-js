import { describe, it, expect, vi } from 'vitest';
import { DecisionAPI } from '../../../src/api/DecisionAPI.js';
import { GraphAPI } from '../../../src/api/GraphAPI.js';
import { TeamAPI } from '../../../src/api/TeamAPI.js';
import { ProfileAPI } from '../../../src/api/ProfileAPI.js';
import { SubscriptionAPI } from '../../../src/api/SubscriptionAPI.js';
import { AuthAPI } from '../../../src/api/AuthAPI.js';
import { AgentAPI } from '../../../src/api/AgentAPI.js';
import { UsageAPI } from '../../../src/api/UsageAPI.js';
import { InsightsAPI } from '../../../src/api/InsightsAPI.js';

function mockBaseAPI() {
  return {
    get: vi.fn().mockResolvedValue({}),
    post: vi.fn().mockResolvedValue({}),
    put: vi.fn().mockResolvedValue({}),
    patch: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue(null)
  };
}

describe('DecisionAPI', () => {
  it('should list decisions with query params', async () => {
    const api = mockBaseAPI();
    const decisions = new DecisionAPI(api);
    await decisions.list({ status: 'pending' });

    expect(api.get).toHaveBeenCalledWith('/memory/decisions?status=pending');
  });

  it('should list pending decisions', async () => {
    const api = mockBaseAPI();
    const decisions = new DecisionAPI(api);
    await decisions.listPending(10);

    expect(api.get).toHaveBeenCalledWith('/memory/decisions/pending?limit=10');
  });

  it('should get proof tree', async () => {
    const api = mockBaseAPI();
    const decisions = new DecisionAPI(api);
    await decisions.getProofTree('d-1', 3);

    expect(api.post).toHaveBeenCalledWith('/memory/reasoning/proof', {
      decision_id: 'd-1',
      max_depth: 3
    });
  });

  it('should reinforce a decision', async () => {
    const api = mockBaseAPI();
    const decisions = new DecisionAPI(api);
    await decisions.reinforce('d-1', 'ev-42');

    expect(api.post).toHaveBeenCalledWith('/memory/decisions/d-1/reinforce', {
      evidence_id: 'ev-42'
    });
  });

  it('should search decisions by topic', async () => {
    const api = mockBaseAPI();
    const decisions = new DecisionAPI(api);
    await decisions.search('routing', 10);

    expect(api.get).toHaveBeenCalledWith('/memory/decisions/search?topic=routing&limit=10');
  });

  it('should contradict a decision', async () => {
    const api = mockBaseAPI();
    const decisions = new DecisionAPI(api);
    await decisions.contradict('d-1', 'ev-42');

    expect(api.post).toHaveBeenCalledWith('/memory/decisions/d-1/contradict', {
      evidence_id: 'ev-42'
    });
  });

  it('should find conflicts with the supplied contest threshold', async () => {
    const api = mockBaseAPI();
    const decisions = new DecisionAPI(api);
    await decisions.findConflicts('d-1', 0.6);

    expect(api.post).toHaveBeenCalledWith('/memory/decisions/d-1/conflicts?min_contest=0.6');
  });

  it('should supersede a decision', async () => {
    const api = mockBaseAPI();
    const decisions = new DecisionAPI(api);
    await decisions.supersede('d-1', {
      new_content: 'Use CockroachDB',
      new_confidence: 0.95,
      reason: 'outdated',
      rejected_alternatives: ['Keep Citus'],
      rationale: 'Regional failover is required',
      constraints: ['No manual operator']
    });

    expect(api.post).toHaveBeenCalledWith('/memory/decisions/d-1/supersede', {
      new_content: 'Use CockroachDB',
      new_confidence: 0.95,
      reason: 'outdated',
      rejected_alternatives: ['Keep Citus'],
      rationale: 'Regional failover is required',
      constraints: ['No manual operator']
    });
  });

  it('should retract a decision', async () => {
    const api = mockBaseAPI();
    const decisions = new DecisionAPI(api);
    await decisions.retract('d-1', 'No longer valid');

    expect(api.post).toHaveBeenCalledWith('/memory/decisions/d-1/retract', {
      reason: 'No longer valid'
    });
  });

  it('should get provenance for a decision', async () => {
    const api = mockBaseAPI();
    const decisions = new DecisionAPI(api);
    await decisions.getProvenance('d-1');

    expect(api.get).toHaveBeenCalledWith('/memory/decisions/d-1/provenance');
  });
});

describe('GraphAPI', () => {
  it('should get neighbors', async () => {
    const api = mockBaseAPI();
    const graph = new GraphAPI(api);
    await graph.getNeighbors('item-1');

    expect(api.get).toHaveBeenCalledWith('/memory/item-1/neighbors', {});
  });

  it('should encode the item id when getting neighbors', async () => {
    const api = mockBaseAPI();
    const graph = new GraphAPI(api);
    await graph.getNeighbors('item/1 a');

    expect(api.get).toHaveBeenCalledWith('/memory/item%2F1%20a/neighbors', {});
  });

  it('should add edge', async () => {
    const api = mockBaseAPI();
    const graph = new GraphAPI(api);
    await graph.addEdge('src', 'tgt', 'RELATED', { weight: 0.5 });

    expect(api.post).toHaveBeenCalledWith('/memory/edge', {
      source_id: 'src',
      target_id: 'tgt',
      relation_type: 'RELATED',
      properties: { weight: 0.5 }
    });
  });

  it('should get graph health', async () => {
    const api = mockBaseAPI();
    const graph = new GraphAPI(api);
    await graph.getHealth();

    expect(api.get).toHaveBeenCalledWith('/memory/graph/health', {});
  });

  it('should get inference rules', async () => {
    const api = mockBaseAPI();
    const graph = new GraphAPI(api);
    await graph.getInferenceRules();

    expect(api.get).toHaveBeenCalledWith('/memory/inference/rules', {});
  });

  it('should run inference', async () => {
    const api = mockBaseAPI();
    const graph = new GraphAPI(api);
    await graph.runInference({ dryRun: true });

    // Route (validation.py RunInferenceRequest) accepts only dry_run — not rule_names.
    expect(api.post).toHaveBeenCalledWith('/memory/inference', {
      dry_run: true
    });
  });

  it('should get full graph', async () => {
    const api = mockBaseAPI();
    const graph = new GraphAPI(api);
    await graph.getFullGraph();
    await graph.getFullGraph(25);

    expect(api.get).toHaveBeenCalledWith('/memory/graph/full', {});
    expect(api.get).toHaveBeenCalledWith('/memory/graph/full?limit=25', {});
  });

  it('should find a shortest graph path', async () => {
    const api = mockBaseAPI();
    const graph = new GraphAPI(api);
    await graph.findShortestPath('node 1', 'node/2', 3);

    expect(api.get).toHaveBeenCalledWith('/memory/graph/path?start_id=node%201&end_id=node%2F2&max_hops=3', {});
  });

  it('should get edges in bulk', async () => {
    const api = mockBaseAPI();
    const graph = new GraphAPI(api);
    await graph.getEdgesBulk(['node-1', 'node-2'], { includeProperties: true });

    expect(api.post).toHaveBeenCalledWith('/memory/graph/edges?include_properties=true', {
      node_ids: ['node-1', 'node-2']
    }, {});
  });

  it('should bulk upsert graph nodes and edges', async () => {
    const api = mockBaseAPI();
    const graph = new GraphAPI(api);
    await graph.bulkUpsert({
      nodes: [{ item_id: 'node-1', label: 'Person', properties: { name: 'Ada' } }],
      edges: [{ source_id: 'node-1', target_id: 'node-2', edge_type: 'KNOWS' }],
      deletePrefix: 'import:'
    });

    expect(api.post).toHaveBeenCalledWith('/memory/graph/bulk', {
      nodes: [{ item_id: 'node-1', label: 'Person', properties: { name: 'Ada' } }],
      edges: [{ source_id: 'node-1', target_id: 'node-2', edge_type: 'KNOWS' }],
      delete_prefix: 'import:'
    });
  });

  it('should get grounding status', async () => {
    const api = mockBaseAPI();
    const graph = new GraphAPI(api);
    await graph.getGroundingStatus('node 1');

    expect(api.get).toHaveBeenCalledWith('/memory/graph/nodes/node%201/grounding', {});
  });

  it('should update entity node', async () => {
    const api = mockBaseAPI();
    const graph = new GraphAPI(api);
    await graph.updateEntityNode('node 1', { label: 'Redis', entity_type: 'Technology' });

    expect(api.patch).toHaveBeenCalledWith('/memory/graph/nodes/node%201', {
      label: 'Redis',
      entity_type: 'Technology'
    });
  });

  it('should remove grounding', async () => {
    const api = mockBaseAPI();
    const graph = new GraphAPI(api);
    await graph.removeGrounding('node 1');

    expect(api.delete).toHaveBeenCalledWith('/memory/graph/nodes/node%201/grounding');
  });

  it('should delete entity node', async () => {
    const api = mockBaseAPI();
    const graph = new GraphAPI(api);
    await graph.deleteEntityNode('node 1');

    expect(api.delete).toHaveBeenCalledWith('/memory/graph/nodes/node%201');
  });

  it('should get links', async () => {
    const api = mockBaseAPI();
    const graph = new GraphAPI(api);
    await graph.getLinks('item 1');

    expect(api.get).toHaveBeenCalledWith('/memory/item%201/links', {});
  });

  // Cancellation: reads forward an AbortSignal so a caller whose results went stale can
  // cancel in flight rather than merely ignore the response.
  it('should forward an abort signal on every graph read', async () => {
    const api = mockBaseAPI();
    const graph = new GraphAPI(api);
    const { signal } = new AbortController();

    await graph.getNeighbors('item-1', { signal });
    await graph.getHealth({ signal });
    await graph.getInferenceRules({ signal });
    await graph.getFullGraph(10, { signal });
    await graph.findShortestPath('a', 'b', 2, { signal });
    await graph.getGroundingStatus('node-1', { signal });
    await graph.getLinks('item-1', { signal });

    // Every GET carried the signal — none silently dropped it.
    expect(api.get).toHaveBeenCalledTimes(7);
    for (const call of api.get.mock.calls) {
      expect(call[1]).toEqual({ signal });
    }
  });

  it('should forward an abort signal on the bulk edge read without leaking its own options', async () => {
    const api = mockBaseAPI();
    const graph = new GraphAPI(api);
    const { signal } = new AbortController();

    await graph.getEdgesBulk(['node-1'], { includeProperties: true, signal });

    // includeProperties is a URL concern and must not reach fetch as a RequestInit key.
    expect(api.post).toHaveBeenCalledWith(
      '/memory/graph/edges?include_properties=true',
      { node_ids: ['node-1'] },
      { signal }
    );
  });

  // Writes deliberately take no signal: aborting a mutation stops the client reading the
  // response, not the server applying it, so the caller could not say whether it happened.
  it('should not accept a signal on graph writes', async () => {
    const api = mockBaseAPI();
    const graph = new GraphAPI(api);
    const { signal } = new AbortController();

    await graph.addEdge('src', 'tgt', 'RELATED');
    await graph.bulkUpsert({ nodes: [{ item_id: 'n-1' }] });
    await graph.updateEntityNode('node-1', { label: 'Redis' });

    for (const call of [...api.post.mock.calls, ...api.patch.mock.calls]) {
      expect(JSON.stringify(call)).not.toContain('signal');
    }
    // The signal object exists but was never plumbed anywhere.
    expect(signal.aborted).toBe(false);
  });
});

describe('TeamAPI', () => {
  it('should create team with snake_case params', async () => {
    const api = mockBaseAPI();
    const teams = new TeamAPI(api);
    await teams.create({ name: 'Engineering', dataClassification: 'confidential' });

    expect(api.post).toHaveBeenCalledWith('/memory/teams', {
      name: 'Engineering',
      description: null,
      data_classification: 'confidential',
      cost_center: null
    });
  });

  it('should add member', async () => {
    const api = mockBaseAPI();
    const teams = new TeamAPI(api);
    await teams.addMember('t-1', 'u-1', 'admin');

    expect(api.post).toHaveBeenCalledWith('/memory/teams/t-1/members', {
      user_id: 'u-1',
      role: 'admin'
    });
  });

  it('should create and reveal system teams only when explicitly requested', async () => {
    const api = mockBaseAPI();
    const teams = new TeamAPI(api);

    await teams.create({ name: 'Maya', isSystem: true });
    expect(api.post).toHaveBeenCalledWith('/memory/teams', {
      name: 'Maya',
      description: null,
      data_classification: 'internal',
      cost_center: null,
      is_system: true
    });

    await teams.list({ includeSystem: true });
    expect(api.get).toHaveBeenCalledWith('/memory/teams?include_system=true');
  });

  it('should remove member', async () => {
    const api = mockBaseAPI();
    const teams = new TeamAPI(api);
    await teams.removeMember('t-1', 'u-1');

    expect(api.delete).toHaveBeenCalledWith('/memory/teams/t-1/members/u-1');
  });
});

describe('ProfileAPI', () => {
  it('should list profiles', async () => {
    const api = mockBaseAPI();
    const profiles = new ProfileAPI(api);
    await profiles.list();

    expect(api.get).toHaveBeenCalledWith('/memory/pipeline/profiles');
  });

  it('should update LLM keys', async () => {
    const api = mockBaseAPI();
    const profiles = new ProfileAPI(api);
    await profiles.updateLLMKeys({ openai: 'sk-...' });

    expect(api.patch).toHaveBeenCalledWith('/auth/llm-keys', { openai: 'sk-...' });
  });

  it('should pass gemini_key through to update LLM keys', async () => {
    const api = mockBaseAPI();
    const profiles = new ProfileAPI(api);
    await profiles.updateLLMKeys({ gemini_key: 'AIza...' });

    expect(api.patch).toHaveBeenCalledWith('/auth/llm-keys', { gemini_key: 'AIza...' });
  });
});

describe('SubscriptionAPI', () => {
  it('should create checkout session', async () => {
    const api = mockBaseAPI();
    const subs = new SubscriptionAPI(api);
    await subs.createCheckoutSession('pro', 'yearly');

    expect(api.post).toHaveBeenCalledWith('/subscription/checkout', {
      tier: 'pro',
      billing_period: 'yearly'
    });
  });
});

describe('AuthAPI', () => {
  it('should get current user', async () => {
    const api = mockBaseAPI();
    const auth = new AuthAPI(api);
    await auth.getCurrentUser();

    expect(api.get).toHaveBeenCalledWith('/auth/me');
  });
});

describe('AgentAPI', () => {
  it('should create agent', async () => {
    const api = mockBaseAPI();
    const agents = new AgentAPI(api);
    await agents.create({ name: 'Researcher', description: 'Research agent' });

    expect(api.post).toHaveBeenCalledWith('/memory/agents', {
      name: 'Researcher',
      description: 'Research agent',
      agent_config: {},
      roles: ['user']
    });
  });
});

describe('UsageAPI', () => {
  it('should get dashboard', async () => {
    const api = mockBaseAPI();
    const usage = new UsageAPI(api);
    await usage.getDashboard();

    expect(api.get).toHaveBeenCalledWith('/usage/dashboard');
  });
});

describe('InsightsAPI', () => {
  it('should get health', async () => {
    const api = mockBaseAPI();
    const insights = new InsightsAPI(api);
    await insights.getHealth();

    expect(api.get).toHaveBeenCalledWith('/memory/health');
  });

  it('should get plugins', async () => {
    const api = mockBaseAPI();
    const insights = new InsightsAPI(api);
    await insights.getPlugins();

    expect(api.get).toHaveBeenCalledWith('/memory/plugins');
  });
});
