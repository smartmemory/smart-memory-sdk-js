import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RefreshManager } from '../../../src/auth/RefreshManager.js';
import { TokenManager } from '../../../src/auth/TokenManager.js';

describe('RefreshManager', () => {
  let tokenManager;
  let onTokenRefreshed;
  let onRefreshFailed;

  beforeEach(() => {
    tokenManager = new TokenManager({ storage: 'memory' });
    onTokenRefreshed = vi.fn();
    onRefreshFailed = vi.fn();
    vi.restoreAllMocks();
  });

  function createManager(overrides = {}) {
    return new RefreshManager({
      apiBaseUrl: 'http://localhost:9001',
      refreshEndpoint: '/auth/refresh',
      tokenManager,
      onTokenRefreshed,
      onRefreshFailed,
      ...overrides
    });
  }

  it('should call refresh endpoint and update tokens on success', async () => {
    tokenManager.setRefreshToken('old-refresh');

    const mockResponse = {
      ok: true,
      json: () => Promise.resolve({ access_token: 'new-access', refresh_token: 'new-refresh' })
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

    const rm = createManager();
    const result = await rm.refresh();

    expect(result).toBe('new-access');
    expect(tokenManager.getAccessToken()).toBe('new-access');
    expect(tokenManager.getRefreshToken()).toBe('new-refresh');
    expect(onTokenRefreshed).toHaveBeenCalledWith('new-access');
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:9001/auth/refresh',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ refresh_token: 'old-refresh' })
      })
    );
  });

  it('should call onRefreshFailed when no refresh token exists', async () => {
    const rm = createManager();

    await expect(rm.refresh()).rejects.toThrow('No refresh token');
    expect(onRefreshFailed).toHaveBeenCalled();
  });

  it('should allow cookie-mode refresh without stored refresh token', async () => {
    const mockResponse = {
      ok: true,
      json: () => Promise.resolve({ access_token: 'cookie-access' })
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

    const rm = createManager({ useCookieAuth: true });
    const result = await rm.refresh();

    expect(result).toBe('cookie-access');
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:9001/auth/refresh',
      expect.objectContaining({
        credentials: 'include',
        body: JSON.stringify({})
      })
    );
    expect(onRefreshFailed).not.toHaveBeenCalled();
  });

  it('should call onRefreshFailed when refresh endpoint returns non-ok', async () => {
    tokenManager.setRefreshToken('expired-refresh');

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 401 });

    const rm = createManager();

    await expect(rm.refresh()).rejects.toThrow('Refresh failed: 401');
    expect(onRefreshFailed).toHaveBeenCalled();
  });

  it('should deduplicate concurrent refresh calls (single-flight)', async () => {
    tokenManager.setRefreshToken('ref-tok');

    let resolveRefresh;
    const fetchPromise = new Promise(r => { resolveRefresh = r; });
    vi.spyOn(globalThis, 'fetch').mockReturnValue(fetchPromise);

    const rm = createManager();

    const p1 = rm.refresh();
    const p2 = rm.refresh();
    const p3 = rm.refresh();

    expect(fetch).toHaveBeenCalledTimes(1);

    resolveRefresh({
      ok: true,
      json: () => Promise.resolve({ access_token: 'shared-token' })
    });

    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
    expect(r1).toBe('shared-token');
    expect(r2).toBe('shared-token');
    expect(r3).toBe('shared-token');
  });
});
