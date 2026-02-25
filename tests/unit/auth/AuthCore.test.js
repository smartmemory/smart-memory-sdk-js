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
      endpoints: { refresh: '/auth/refresh' },
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

    it('should enable cookie auth by default in sso mode', () => {
      const auth = createSSOAuth();
      expect(auth.useCookieAuth).toBe(true);
      expect(auth.getRequestOptions()).toEqual(expect.objectContaining({ credentials: 'include' }));
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

    it('should include X-Workspace-Id header when team is set', () => {
      const auth = createCustomAuth();
      auth.tokenManager.setTeamId('team-123');

      const headers = auth.getAuthHeaders();
      expect(headers['X-Workspace-Id']).toBe('team-123');
    });

    it('should not include X-Workspace-Id header when only tenant is set (no team)', () => {
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

    it('should include X-Workspace-Id when both tenant and team are set', () => {
      const auth = createCustomAuth();
      auth.setTenantId('ws-123');
      auth.tokenManager.setTeamId('team-456');

      const headers = auth.getAuthHeaders();
      expect(headers['X-Workspace-Id']).toBe('team-456');
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

    it('should bootstrap cookie session via /auth/me', async () => {
      const auth = createSSOAuth();
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'u1', default_team_id: 'team-1', tenant_id: 'tenant-1' })
      });

      const ok = await auth.bootstrapSession();

      expect(ok).toBe(true);
      expect(auth.isAuthenticated()).toBe(true);
      expect(auth.tokenManager.getTeamId()).toBe('team-1');
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
