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
      tm.setWorkspaceId('workspace-1');

      tm.clearAll();

      expect(tm.getAccessToken()).toBeNull();
      expect(tm.getRefreshToken()).toBeNull();
      expect(tm.getUser()).toBeNull();
      expect(tm.getTenantId()).toBeNull();
      expect(tm.getWorkspaceId()).toBeNull();
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

    it('should migrate legacy access key on read', () => {
      localStorage.setItem('access_token', 'legacy-token');
      const tm = new TokenManager({ storage: 'localStorage' });

      expect(tm.getAccessToken()).toBe('legacy-token');
      expect(localStorage.getItem('smart_memory_auth_token')).toBe('legacy-token');
      expect(localStorage.getItem('access_token')).toBeNull();
    });

    it('should migrate the previous canonical team key on workspace read', () => {
      localStorage.setItem('smart_memory_team_id', 'workspace-legacy');
      const tm = new TokenManager({ storage: 'localStorage' });

      expect(tm.getWorkspaceId()).toBe('workspace-legacy');
      expect(localStorage.getItem('smart_memory_workspace_id')).toBe('workspace-legacy');
      expect(localStorage.getItem('smart_memory_team_id')).toBeNull();
    });

    it('should keep reading older team aliases through getTeamId', () => {
      localStorage.setItem('team_id', 'workspace-older-alias');
      const tm = new TokenManager({ storage: 'localStorage' });

      expect(tm.getTeamId()).toBe('workspace-older-alias');
      expect(tm.getWorkspaceId()).toBe('workspace-older-alias');
      expect(localStorage.getItem('team_id')).toBeNull();
    });
  });

  describe('workspace compatibility aliases', () => {
    it('should expose matching workspace and team values', () => {
      const tm = new TokenManager({ storage: 'memory' });

      tm.setWorkspaceId('workspace-primary');
      expect(tm.getWorkspaceId()).toBe('workspace-primary');
      expect(tm.getTeamId()).toBe('workspace-primary');
    });

    it('should delegate legacy team methods to workspace methods', () => {
      const tm = new TokenManager({ storage: 'memory' });
      const setWorkspaceId = vi.spyOn(tm, 'setWorkspaceId');
      const getWorkspaceId = vi.spyOn(tm, 'getWorkspaceId');

      tm.setTeamId('workspace-via-team');
      const value = tm.getTeamId();

      expect(setWorkspaceId).toHaveBeenCalledWith('workspace-via-team');
      expect(getWorkspaceId).toHaveBeenCalled();
      expect(value).toBe('workspace-via-team');
    });

    it('should preserve the legacy custom team storage key', () => {
      localStorage.setItem('custom_team_key', 'workspace-custom');
      const tm = new TokenManager({
        storage: 'localStorage',
        keys: { team: 'custom_team_key' }
      });

      expect(tm.getWorkspaceId()).toBe('workspace-custom');
      tm.setWorkspaceId('workspace-updated');
      expect(localStorage.getItem('custom_team_key')).toBe('workspace-updated');
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
