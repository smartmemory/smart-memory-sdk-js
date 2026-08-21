import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PolicyAPI } from '../../../src/api/PolicyAPI.js';

describe('PolicyAPI', () => {
  let baseAPI;
  let api;

  beforeEach(() => {
    baseAPI = {
      get: vi.fn().mockResolvedValue({}),
      post: vi.fn().mockResolvedValue({}),
    };
    api = new PolicyAPI(baseAPI);
  });

  it('gets the default active bundle', async () => {
    await api.getBundle();
    expect(baseAPI.get).toHaveBeenCalledWith('/memory/policy/bundle?status=active');
  });

  it('encodes workflow, domain, and repeated status selectors', async () => {
    await api.getBundle({
      workflow: 'deploy',
      domain: 'security',
      statuses: ['active', 'pending'],
    });
    expect(baseAPI.get).toHaveBeenCalledWith(
      '/memory/policy/bundle?workflow=deploy&domain=security&status=active&status=pending',
    );
  });

  it('omits null optional selectors and lets the route default status', async () => {
    await api.getBundle({ workflow: null, domain: null, statuses: null });
    expect(baseAPI.get).toHaveBeenCalledWith('/memory/policy/bundle');
  });

  it('posts an enforcement event verbatim', async () => {
    const event = {
      event_id: 'run-1:ledger-1',
      kind: 'guard_transition',
      rules_evaluated: [],
    };
    const result = { event_id: event.event_id, item_id: 'event-1', created: false, edges: 0 };
    baseAPI.post.mockResolvedValue(result);

    await expect(api.recordEnforcementEvent(event)).resolves.toEqual(result);
    expect(baseAPI.post).toHaveBeenCalledWith('/memory/policy/events', event);
  });
});
