import { afterEach, describe, expect, it, vi } from 'vitest';
import { exchangeClerkSession } from '../../../src/auth/clerkWeb.js';

describe('exchangeClerkSession', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns workspaceId and the compatible teamId alias', async () => {
    const response = {
      ok: true,
      headers: new Headers({
        'x-sm-access-token': 'access-token',
        'x-sm-workspace-id': 'workspace-1'
      })
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response);

    const result = await exchangeClerkSession({
      apiBaseUrl: 'http://localhost:9001',
      getToken: vi.fn().mockResolvedValue('clerk-token')
    });

    expect(result.response).toBe(response);
    expect(result.accessToken).toBe('access-token');
    expect(result.workspaceId).toBe('workspace-1');
    expect(result.teamId).toBe(result.workspaceId);
  });
});
