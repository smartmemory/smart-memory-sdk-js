// SM-ASOF-DECISIONS-1: `asOf` on the dated decision reads, the policy bundle and
// the recall pack. Sent as `as_of` (query param, or recall body key) only when set,
// so a call without it requests exactly what it requested before.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DecisionAPI } from '../../../src/api/DecisionAPI.js';
import { PolicyAPI } from '../../../src/api/PolicyAPI.js';
import { RecallAPI } from '../../../src/api/RecallAPI.js';

const T = '2026-01-02T03:04:05+00:00';
const T_Q = encodeURIComponent(T);

describe('as_of on decision, policy and recall reads', () => {
  let baseAPI;

  beforeEach(() => {
    baseAPI = {
      get: vi.fn().mockResolvedValue({}),
      post: vi.fn().mockResolvedValue({}),
    };
  });

  it('get sends as_of only when set', async () => {
    const api = new DecisionAPI(baseAPI);
    await api.get('dec_1', { asOf: T });
    expect(baseAPI.get).toHaveBeenLastCalledWith(`/memory/decisions/dec_1?as_of=${T_Q}`);
    await api.get('dec_1');
    expect(baseAPI.get).toHaveBeenLastCalledWith('/memory/decisions/dec_1');
  });

  it('getProvenance sends as_of only when set', async () => {
    const api = new DecisionAPI(baseAPI);
    await api.getProvenance('dec_1', { asOf: T });
    expect(baseAPI.get).toHaveBeenLastCalledWith(`/memory/decisions/dec_1/provenance?as_of=${T_Q}`);
    await api.getProvenance('dec_1', { asOf: null });
    expect(baseAPI.get).toHaveBeenLastCalledWith('/memory/decisions/dec_1/provenance');
  });

  it('search appends as_of after topic and limit', async () => {
    const api = new DecisionAPI(baseAPI);
    await api.search('auth', 5, { asOf: T });
    expect(baseAPI.get).toHaveBeenLastCalledWith(`/memory/decisions/search?topic=auth&limit=5&as_of=${T_Q}`);
    await api.search('auth');
    expect(baseAPI.get).toHaveBeenLastCalledWith('/memory/decisions/search?topic=auth&limit=20');
  });

  it('list maps asOf to as_of and keeps the other filters', async () => {
    const api = new DecisionAPI(baseAPI);
    await api.list({ domain: 'backend', asOf: T });
    expect(baseAPI.get).toHaveBeenLastCalledWith(`/memory/decisions?domain=backend&as_of=${T_Q}`);
    await api.list({ domain: 'backend' });
    expect(baseAPI.get).toHaveBeenLastCalledWith('/memory/decisions?domain=backend');
    await api.list();
    expect(baseAPI.get).toHaveBeenLastCalledWith('/memory/decisions');
  });

  it('policy getBundle appends as_of after the status selector', async () => {
    const api = new PolicyAPI(baseAPI);
    await api.getBundle({ workflow: 'deploy', asOf: T });
    expect(baseAPI.get).toHaveBeenLastCalledWith(
      `/memory/policy/bundle?workflow=deploy&status=active&as_of=${T_Q}`,
    );
    await api.getBundle({ asOf: undefined });
    expect(baseAPI.get).toHaveBeenLastCalledWith('/memory/policy/bundle?status=active');
  });

  it('recall pack carries as_of in the body only when set', async () => {
    const api = new RecallAPI(baseAPI);
    await api.pack({ budgetTokens: 4000, query: 'auth', asOf: T });
    expect(baseAPI.post).toHaveBeenLastCalledWith('/memory/recall/pack', {
      budget_tokens: 4000,
      query: 'auth',
      as_of: T,
    });
    await api.pack({ budgetTokens: 4000, asOf: null });
    expect(baseAPI.post).toHaveBeenLastCalledWith('/memory/recall/pack', { budget_tokens: 4000 });
  });

  it('surfaces a server 400 invalid_as_of unchanged', async () => {
    const err = Object.assign(new Error('invalid_as_of'), { status: 400 });
    baseAPI.get.mockRejectedValueOnce(err);
    const api = new DecisionAPI(baseAPI);
    await expect(api.list({ asOf: 'not-a-date' })).rejects.toBe(err);
    expect(baseAPI.get).toHaveBeenLastCalledWith('/memory/decisions?as_of=not-a-date');
  });
});
