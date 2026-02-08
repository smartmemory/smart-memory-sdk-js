const DEFAULT_KEYS = {
  access: 'smart_memory_auth_token',
  refresh: 'smart_memory_refresh_token',
  user: 'smart_memory_user',
  tenant: 'smart_memory_tenant_id',
  team: 'smart_memory_team_id'
};

export class TokenManager {
  /**
   * @param {Object} options
   * @param {'localStorage' | 'sessionStorage' | 'memory'} [options.storage='localStorage']
   * @param {Object} [options.keys] - Custom storage key names
   */
  constructor({ storage = 'localStorage', keys = {} } = {}) {
    this.storageType = storage;
    this.keys = { ...DEFAULT_KEYS, ...keys };
    this._memory = { access: null, refresh: null, user: null, tenant: null, team: null };
  }

  getAccessToken() {
    if (this.storageType === 'memory') return this._memory.access;
    return this._getFromStorage(this.keys.access);
  }

  setAccessToken(token) {
    if (this.storageType === 'memory') {
      this._memory.access = token;
      return;
    }
    this._setInStorage(this.keys.access, token);
  }

  getRefreshToken() {
    if (this.storageType === 'memory') return this._memory.refresh;
    return this._getFromStorage(this.keys.refresh);
  }

  setRefreshToken(token) {
    if (this.storageType === 'memory') {
      this._memory.refresh = token;
      return;
    }
    this._setInStorage(this.keys.refresh, token);
  }

  getUser() {
    if (this.storageType === 'memory') return this._memory.user;
    const raw = this._getFromStorage(this.keys.user);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  setUser(user) {
    if (this.storageType === 'memory') {
      this._memory.user = user;
      return;
    }
    this._setInStorage(this.keys.user, user ? JSON.stringify(user) : null);
  }

  getTenantId() {
    if (this.storageType === 'memory') return this._memory.tenant;
    return this._getFromStorage(this.keys.tenant);
  }

  setTenantId(tenantId) {
    if (this.storageType === 'memory') {
      this._memory.tenant = tenantId;
      return;
    }
    this._setInStorage(this.keys.tenant, tenantId);
  }

  getTeamId() {
    if (this.storageType === 'memory') return this._memory.team;
    return this._getFromStorage(this.keys.team);
  }

  setTeamId(teamId) {
    if (this.storageType === 'memory') {
      this._memory.team = teamId;
      return;
    }
    this._setInStorage(this.keys.team, teamId);
  }

  clearAll() {
    if (this.storageType === 'memory') {
      this._memory = { access: null, refresh: null, user: null, tenant: null, team: null };
      return;
    }
    for (const key of Object.values(this.keys)) {
      try {
        localStorage.removeItem(key);
        sessionStorage.removeItem(key);
      } catch { /* ignore */ }
    }
  }

  /** @private */
  _getFromStorage(key) {
    try {
      const primary = this.storageType === 'localStorage' ? localStorage : sessionStorage;
      const fallback = this.storageType === 'localStorage' ? sessionStorage : localStorage;
      return primary.getItem(key) || fallback.getItem(key) || null;
    } catch {
      return null;
    }
  }

  /** @private */
  _setInStorage(key, value) {
    try {
      const primary = this.storageType === 'localStorage' ? localStorage : sessionStorage;
      const other = this.storageType === 'localStorage' ? sessionStorage : localStorage;
      if (value != null) {
        primary.setItem(key, value);
        other.removeItem(key);
      } else {
        primary.removeItem(key);
        other.removeItem(key);
      }
    } catch (e) {
      console.error('Failed to write to storage:', e);
    }
  }
}
