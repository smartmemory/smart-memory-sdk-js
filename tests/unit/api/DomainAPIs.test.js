import { describe, it, expect, beforeEach, vi } from 'vitest';
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

  it('should supersede a decision', async () => {
    const api = mockBaseAPI();
    const decisions = new DecisionAPI(api);
    await decisions.supersede('d-1', { reason: 'outdated' });

    expect(api.post).toHaveBeenCalledWith('/memory/decisions/d-1/supersede', { reason: 'outdated' });
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

    expect(api.get).toHaveBeenCalledWith('/memory/item-1/neighbors');
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

  it('should run inference', async () => {
    const api = mockBaseAPI();
    const graph = new GraphAPI(api);
    await graph.runInference(['transitivity']);

    expect(api.post).toHaveBeenCalledWith('/memory/validation/inference', {
      rule_names: ['transitivity']
    });
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

    expect(api.put).toHaveBeenCalledWith('/auth/llm-keys', { openai: 'sk-...' });
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
