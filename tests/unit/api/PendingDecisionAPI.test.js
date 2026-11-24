import { describe, it, expect, vi } from 'vitest';
import { DecisionAPI } from '../../../src/api/DecisionAPI.js';

function mockBaseAPI() {
  return { post: vi.fn().mockResolvedValue({}), get: vi.fn().mockResolvedValue({}) };
}

describe('DecisionAPI pending lifecycle', () => {
  it('createPending posts snake_case payload', async () => {
    const api = mockBaseAPI();
    const decisions = new DecisionAPI(api);
    await decisions.createPending({
      content: 'case',
      requirements: [{ description: 'x', requirement_type: 'proof' }],
      domain: 'gtm',
      tags: ['acceptance']
    });
    expect(api.post).toHaveBeenCalledWith('/memory/decisions/pending/create', {
      content: 'case',
      requirements: [{ description: 'x', requirement_type: 'proof' }],
      domain: 'gtm',
      tags: ['acceptance'],
      agent_id: null
    });
  });

  it('resolveRequirement posts to the decision path', async () => {
    const api = mockBaseAPI();
    const decisions = new DecisionAPI(api);
    await decisions.resolveRequirement('dec_1', { requirementId: 'req_1', memoryId: 'mem_1' });
    expect(api.post).toHaveBeenCalledWith('/memory/decisions/pending/dec_1/resolve', {
      requirement_id: 'req_1',
      memory_id: 'mem_1'
    });
  });

  it('tryActivate posts to the activate path', async () => {
    const api = mockBaseAPI();
    const decisions = new DecisionAPI(api);
    await decisions.tryActivate('dec_1');
    expect(api.post).toHaveBeenCalledWith('/memory/decisions/pending/dec_1/activate', {});
  });

  // BUG-MCP-ACTIVATE-STAGED-REASON-1 J1: the optional reason is returned as the server sent it, never added.
  it('tryActivate returns the staged reason unchanged and adds none when absent', async () => {
    const api = mockBaseAPI();
    const decisions = new DecisionAPI(api);
    api.post.mockResolvedValueOnce({ activated: false, decision: null, reason: 'staged' });
    expect(await decisions.tryActivate('dec_s')).toEqual({ activated: false, decision: null, reason: 'staged' });
    api.post.mockResolvedValueOnce({ activated: false, decision: null });
    const missing = await decisions.tryActivate('dec_m');
    expect(missing).toEqual({ activated: false, decision: null });
    expect('reason' in missing).toBe(false);
  });
});
