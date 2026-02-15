import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthCore } from '../../../src/auth/AuthCore.js';

describe('AuthCore', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  function createCustomAuth(overrides = {}) {
    return new AuthCore({
      mode: 'custom',
      apiBaseUrl: 'http://localhost:9001',
      endpoints: { login: '/auth/login', refresh: '/auth/refresh' },
      storage: 'memory',
      ...overrides
    });
  }

  function createSSOAuth(overrides = {}) {
    return new AuthCore({
      mode: 'sso',
      apiBaseUrl: 'http://localhost:9001',
      webAppUrl: 'http://localhost:5173',
      endpoints: { refresh: '/auth/refresh' },
      storage: 'memory',
      ...overrides
    });
  }

  describe('initialization', () => {
    it('should start unauthenticated with no stored tokens', () => {
      const auth = createCustomAuth();
      expect(auth.isAuthenticated()).toBe(false);
      expect(auth.getCurrentUser()).toBeNull();
      expect(auth.getCurrentToken()).toBeNull();
    });
  });

  describe('listener system', () => {
    it('should notify listeners on state change', () => {
      const auth = createCustomAuth();
      const listener = vi.fn();

      auth.addListener(listener);
      auth.setTenantId('workspace-1');

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: 'workspace-1' })
      );
    });

    it('should return unsubscribe function', () => {
      const auth = createCustomAuth();
      const listener = vi.fn();

      const unsubscribe = auth.addListener(listener);
      unsubscribe();
      auth.setTenantId('workspace-1');

      expect(listener).not.toHaveBeenCalled();
    });

    it('should catch errors in listeners without crashing', () => {
      const auth = createCustomAuth();
      const badListener = () => { throw new Error('listener crash'); };
      const goodListener = vi.fn();

      auth.addListener(badListener);
      auth.addListener(goodListener);
      auth.setTenantId('t1');

      expect(goodListener).toHaveBeenCalled();
    });
  });

  describe('getAuthHeaders', () => {
    it('should return empty object when not authenticated', () => {
      const auth = createCustomAuth();
      const headers = auth.getAuthHeaders();

      expect(headers.Authorization).toBeUndefined();
    });

    it('should add Bearer prefix to raw token', () => {
      const auth = createCustomAuth();
      auth.tokenManager.setAccessToken('raw-token');
      auth.currentToken = 'raw-token';

      const headers = auth.getAuthHeaders();
      expect(headers.Authorization).toBe('Bearer raw-token');
    });

    it('should not double-prefix Bearer tokens', () => {
      const auth = createCustomAuth();
      auth.tokenManager.setAccessToken('Bearer already-bearer');
      auth.currentToken = 'Bearer already-bearer';

      const headers = auth.getAuthHeaders();
      expect(headers.Authorization).toBe('Bearer already-bearer');
    });

    it('should include X-Team-Id header when team is set', () => {
      const auth = createCustomAuth();
      auth.tokenManager.setTeamId('team-123');

      const headers = auth.getAuthHeaders();
      expect(headers['X-Team-Id']).toBe('team-123');
    });

    it('should not include X-Workspace-Id header', () => {
      const auth = createCustomAuth();
      auth.setTenantId('ws-123');

      const headers = auth.getAuthHeaders();
      expect(headers['X-Workspace-Id']).toBeUndefined();
    });

    it('should merge extra headers', () => {
      const auth = createCustomAuth();
      const headers = auth.getAuthHeaders({ 'X-Custom': 'value' });
      expect(headers['X-Custom']).toBe('value');
    });

    it('should only include X-Team-Id (not X-Workspace-Id) when both tenant and team are set', () => {
      const auth = createCustomAuth();
      auth.setTenantId('ws-123');
      auth.tokenManager.setTeamId('team-456');

      const headers = auth.getAuthHeaders();
      expect(headers['X-Team-Id']).toBe('team-456');
      expect(headers['X-Workspace-Id']).toBeUndefined();
    });
  });

  describe('custom mode: login', () => {
    it('should login and store tokens from API response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          tokens: { access_token: 'at', refresh_token: 'rt' },
          user: { id: '1', name: 'Alice', roles: ['user'] }
        })
      });

      const auth = createCustomAuth();
      const result = await auth.login({ email: 'a@b.com', password: 'pass' });

      expect(auth.isAuthenticated()).toBe(true);
      expect(result.user.name).toBe('Alice');
      expect(auth.getCurrentToken()).toBe('at');
    });

    it('should store team_id from login response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          tokens: { access_token: 'at', refresh_token: 'rt' },
          user: { id: '1', name: 'Alice', default_team_id: 'team-99' }
        })
      });

      const auth = createCustomAuth();
      await auth.login({ email: 'a@b.com', password: 'pass' });

      expect(auth.tokenManager.getTeamId()).toBe('team-99');
      expect(auth.getAuthHeaders()['X-Team-Id']).toBe('team-99');
    });

    it('should throw on failed login', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 401 });

      const auth = createCustomAuth();
      await expect(auth.login({ email: 'a@b.com', password: 'wrong' }))
        .rejects.toThrow('Login failed');
    });

    it('should throw if called in sso mode', async () => {
      const auth = createSSOAuth();
      await expect(auth.login({ email: 'a', password: 'b' }))
        .rejects.toThrow('login() only available in custom mode');
    });
  });

  describe('sso mode', () => {
    it('should generate login URL', () => {
      const auth = createSSOAuth();
      const url = auth.getLoginUrl('http://localhost:9002/auth/callback');

      expect(url).toContain('http://localhost:5173/login?redirect=');
    });

    it('should throw getLoginUrl in custom mode', () => {
      const auth = createCustomAuth();
      expect(() => auth.getLoginUrl('http://example.com'))
        .toThrow('getLoginUrl() only available in sso mode');
    });

    it('should store callback tokens and update state', () => {
      const auth = createSSOAuth();
      const listener = vi.fn();
      auth.addListener(listener);

      const params = new URLSearchParams({
        token: 'sso-tok',
        refresh_token: 'sso-ref',
        team_id: 'team-1'
      });
      auth.storeCallbackTokens(params);

      expect(auth.isAuthenticated()).toBe(true);
      expect(auth.getCurrentToken()).toBe('sso-tok');
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ isAuthenticated: true, token: 'sso-tok' })
      );
    });
  });

  describe('logout', () => {
    it('should clear all tokens and notify listeners', async () => {
      const auth = createCustomAuth();
      auth.tokenManager.setAccessToken('tok');
      auth.currentToken = 'tok';

      const listener = vi.fn();
      auth.addListener(listener);

      await auth.logout();

      expect(auth.isAuthenticated()).toBe(false);
      expect(auth.getCurrentToken()).toBeNull();
      expect(auth.getCurrentUser()).toBeNull();
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ isAuthenticated: false })
      );
    });
  });

  describe('hasRole', () => {
    it('should return true when user has role', () => {
      const auth = createCustomAuth();
      auth.currentUser = { roles: ['admin', 'user'] };
      expect(auth.hasRole('admin')).toBe(true);
    });

    it('should return false when user lacks role', () => {
      const auth = createCustomAuth();
      auth.currentUser = { roles: ['user'] };
      expect(auth.hasRole('admin')).toBe(false);
    });

    it('should return false when no user', () => {
      const auth = createCustomAuth();
      expect(auth.hasRole('admin')).toBe(false);
    });
  });
});
