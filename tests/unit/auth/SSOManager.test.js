import { describe, it, expect, beforeEach } from 'vitest';
import { SSOManager } from '../../../src/auth/SSOManager.js';
import { TokenManager } from '../../../src/auth/TokenManager.js';

describe('SSOManager', () => {
  let tokenManager;

  beforeEach(() => {
    tokenManager = new TokenManager({ storage: 'memory' });
    sessionStorage.clear();
  });

  function createManager(overrides = {}) {
    return new SSOManager({
      webAppUrl: 'http://localhost:5173',
      allowedHosts: ['studio.smartmemory.ai', 'insights.smartmemory.ai'],
      tokenManager,
      ...overrides
    });
  }

  describe('getLoginUrl', () => {
    it('should generate login URL with redirect param', () => {
      const sso = createManager();
      const url = sso.getLoginUrl('http://localhost:9002/auth/callback');

      expect(url).toBe(
        'http://localhost:5173/login?redirect=http%3A%2F%2Flocalhost%3A9002%2Fauth%2Fcallback'
      );
    });

    it('should use window.location.origin as default redirect', () => {
      const sso = createManager();
      const url = sso.getLoginUrl();

      expect(url).toContain('http://localhost:5173/login?redirect=');
      expect(url).toContain('%2Fauth%2Fcallback');
    });
  });

  describe('isValidRedirectUrl', () => {
    it('should accept URLs with allowed hostnames', () => {
      const sso = createManager();
      expect(sso.isValidRedirectUrl('https://studio.smartmemory.ai/dashboard')).toBe(true);
      expect(sso.isValidRedirectUrl('https://insights.smartmemory.ai/')).toBe(true);
    });

    it('should reject URLs with disallowed hostnames', () => {
      const sso = createManager();
      expect(sso.isValidRedirectUrl('https://evil.com/phish')).toBe(false);
    });

    it('should reject invalid URLs', () => {
      const sso = createManager();
      expect(sso.isValidRedirectUrl('not-a-url')).toBe(false);
    });

    it('should allow all when allowedHosts is empty', () => {
      const sso = createManager({ allowedHosts: [] });
      expect(sso.isValidRedirectUrl('https://anything.com')).toBe(true);
    });
  });

  describe('storeCallbackTokens', () => {
    it('should store token, refresh, and tenant from URL params', () => {
      const sso = createManager();
      const params = new URLSearchParams({
        token: 'access-tok',
        refresh_token: 'refresh-tok',
        team_id: 'team-123'
      });

      sso.storeCallbackTokens(params);

      expect(tokenManager.getAccessToken()).toBe('access-tok');
      expect(tokenManager.getRefreshToken()).toBe('refresh-tok');
      expect(tokenManager.getTenantId()).toBe('team-123');
    });

    it('should handle missing optional params', () => {
      const sso = createManager();
      const params = new URLSearchParams({ token: 'only-access' });

      sso.storeCallbackTokens(params);

      expect(tokenManager.getAccessToken()).toBe('only-access');
      expect(tokenManager.getRefreshToken()).toBeNull();
      expect(tokenManager.getTenantId()).toBeNull();
    });
  });

  describe('redirect storage', () => {
    it('should store and retrieve redirect URL from sessionStorage', () => {
      const sso = createManager();
      sso.storeRedirect('/dashboard');

      expect(sso.getAndClearRedirect()).toBe('/dashboard');
      expect(sso.getAndClearRedirect()).toBeNull();
    });
  });
});
