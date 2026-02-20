import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createAuthFetch } from '../../../src/fetch/authFetch.js';
import { AuthCore } from '../../../src/auth/AuthCore.js';

describe('authFetch', () => {
  let authCore;
  let authFetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    authCore = new AuthCore({
      mode: 'sso',
      apiBaseUrl: 'http://localhost:9001',
      webAppUrl: 'http://localhost:5173',
      endpoints: { refresh: '/auth/refresh' },
      storage: 'memory'
    });
    authFetch = createAuthFetch(authCore);
  });

  it('should add auth headers to requests', async () => {
    authCore.currentToken = 'test-token';

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 200 });

    await authFetch('http://localhost:9001/memory/list');

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:9001/memory/list',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token'
        })
      })
    );
  });

  it('should refresh and retry on 401', async () => {
    authCore.currentToken = 'expired';
    authCore.tokenManager.setRefreshToken('valid-refresh');

    const calls = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, opts) => {
      calls.push(url);
      if (url.includes('/memory/list') && !opts?.__isRetry) {
        return { ok: false, status: 401 };
      }
      if (url.includes('/auth/refresh')) {
        return { ok: true, json: () => Promise.resolve({ access_token: 'fresh' }) };
      }
      return { ok: true, status: 200 };
    });

    await authFetch('http://localhost:9001/memory/list');

    expect(calls.length).toBe(3);
  });

  it('should work without auth token', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 200 });

    const response = await authFetch('http://localhost:9001/health');

    expect(response.ok).toBe(true);
  });
});
