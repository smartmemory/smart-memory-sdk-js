import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TokenManager } from '../../../src/auth/TokenManager.js';

describe('TokenManager', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  describe('memory storage', () => {
    it('should store and retrieve access token in memory', () => {
      const tm = new TokenManager({ storage: 'memory' });
      expect(tm.getAccessToken()).toBeNull();

      tm.setAccessToken('test-token');
      expect(tm.getAccessToken()).toBe('test-token');
    });

    it('should clear all stored data', () => {
      const tm = new TokenManager({ storage: 'memory' });
      tm.setAccessToken('tok');
      tm.setRefreshToken('ref');
      tm.setUser({ id: '1', name: 'Test' });
      tm.setTenantId('tenant-1');

      tm.clearAll();

      expect(tm.getAccessToken()).toBeNull();
      expect(tm.getRefreshToken()).toBeNull();
      expect(tm.getUser()).toBeNull();
      expect(tm.getTenantId()).toBeNull();
    });
  });

  describe('localStorage storage', () => {
    it('should persist access token to localStorage', () => {
      const tm = new TokenManager({ storage: 'localStorage' });
      tm.setAccessToken('persisted-token');

      expect(localStorage.getItem('smart_memory_auth_token')).toBe('persisted-token');
      expect(tm.getAccessToken()).toBe('persisted-token');
    });

    it('should clear token from other storage on set', () => {
      sessionStorage.setItem('smart_memory_auth_token', 'old');
      const tm = new TokenManager({ storage: 'localStorage' });
      tm.setAccessToken('new');

      expect(sessionStorage.getItem('smart_memory_auth_token')).toBeNull();
      expect(localStorage.getItem('smart_memory_auth_token')).toBe('new');
    });

    it('should fall back to sessionStorage on get', () => {
      sessionStorage.setItem('smart_memory_auth_token', 'fallback');
      const tm = new TokenManager({ storage: 'localStorage' });

      expect(tm.getAccessToken()).toBe('fallback');
    });

    it('should remove token when set to null', () => {
      const tm = new TokenManager({ storage: 'localStorage' });
      tm.setAccessToken('tok');
      tm.setAccessToken(null);

      expect(localStorage.getItem('smart_memory_auth_token')).toBeNull();
      expect(tm.getAccessToken()).toBeNull();
    });
  });

  describe('user storage', () => {
    it('should JSON.stringify user on set and JSON.parse on get', () => {
      const tm = new TokenManager({ storage: 'localStorage' });
      const user = { id: '1', name: 'Alice', email: 'alice@test.com', roles: ['user'] };

      tm.setUser(user);

      const raw = localStorage.getItem('smart_memory_user');
      expect(raw).toBe(JSON.stringify(user));
      expect(tm.getUser()).toEqual(user);
    });

    it('should handle corrupted user JSON gracefully', () => {
      localStorage.setItem('smart_memory_user', 'not-json');
      const tm = new TokenManager({ storage: 'localStorage' });

      expect(tm.getUser()).toBeNull();
    });
  });

  describe('tenant storage', () => {
    it('should store and retrieve tenant ID', () => {
      const tm = new TokenManager({ storage: 'localStorage' });
      tm.setTenantId('workspace-123');

      expect(tm.getTenantId()).toBe('workspace-123');
      expect(localStorage.getItem('smart_memory_tenant_id')).toBe('workspace-123');
    });
  });

  describe('custom keys', () => {
    it('should use custom storage keys when provided', () => {
      const tm = new TokenManager({
        storage: 'localStorage',
        keys: {
          access: 'custom_token',
          refresh: 'custom_refresh',
          user: 'custom_user',
          tenant: 'custom_tenant'
        }
      });
      tm.setAccessToken('val');
      expect(localStorage.getItem('custom_token')).toBe('val');
    });
  });

  describe('storage errors', () => {
    it('should not throw when storage is unavailable', () => {
      const originalSetItem = localStorage.setItem;
      localStorage.setItem = () => { throw new Error('QuotaExceeded'); };

      const tm = new TokenManager({ storage: 'localStorage' });
      expect(() => tm.setAccessToken('test')).not.toThrow();

      localStorage.setItem = originalSetItem;
    });
  });
});
