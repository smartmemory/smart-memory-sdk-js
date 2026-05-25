const DEFAULT_KEYS = {
  access: 'smart_memory_auth_token',
  refresh: 'smart_memory_refresh_token',
  user: 'smart_memory_user',
  tenant: 'smart_memory_tenant_id',
  team: 'smart_memory_team_id'
};

const LEGACY_KEYS = {
  access: ['access_token', 'sm_token'],
  refresh: ['refresh_token', 'sm_refresh_token'],
  user: ['sm_user'],
  tenant: ['tenant_id', 'workspace_id', 'sm_workspace_id'],
  team: ['team_id', 'sm_team_id']
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
    return this._getFromStorage(this.keys.access, LEGACY_KEYS.access);
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
    return this._getFromStorage(this.keys.refresh, LEGACY_KEYS.refresh);
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
    const raw = this._getFromStorage(this.keys.user, LEGACY_KEYS.user);
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
    return this._normalizeId(this._getFromStorage(this.keys.tenant, LEGACY_KEYS.tenant));
  }

  setTenantId(tenantId) {
    const normalized = this._normalizeId(tenantId);
    if (this.storageType === 'memory') {
      this._memory.tenant = normalized;
      return;
    }
    this._setInStorage(this.keys.tenant, normalized);
  }

  getTeamId() {
    if (this.storageType === 'memory') return this._memory.team;
    return this._normalizeId(this._getFromStorage(this.keys.team, LEGACY_KEYS.team));
  }

  setTeamId(teamId) {
    const normalized = this._normalizeId(teamId);
    if (this.storageType === 'memory') {
      this._memory.team = normalized;
      return;
    }
    this._setInStorage(this.keys.team, normalized);
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
    for (const aliases of Object.values(LEGACY_KEYS)) {
      for (const alias of aliases) {
        try {
          localStorage.removeItem(alias);
          sessionStorage.removeItem(alias);
        } catch { /* ignore */ }
      }
    }
  }

  getImpersonationState() {
    if (this.storageType === 'memory') return null;
    // Impersonation is tab-scoped in sessionStorage so it dies with the tab.
    const email = sessionStorage.getItem('sm_impersonate_email');
    if (!email) return null;
    return { email };
  }

  clearImpersonation() {
    if (this.storageType === 'memory') return;
    sessionStorage.removeItem('sm_impersonate_token');
    sessionStorage.removeItem('sm_impersonate_team');
    sessionStorage.removeItem('sm_impersonate_tenant');
    sessionStorage.removeItem('sm_impersonate_email');
  }

  /** @private */
  _getFromStorage(key, aliases = []) {
    try {
      const primary = this.storageType === 'localStorage' ? localStorage : sessionStorage;
      const fallback = this.storageType === 'localStorage' ? sessionStorage : localStorage;
      const current = primary.getItem(key) || fallback.getItem(key);
      if (current != null) return current;

      for (const alias of aliases) {
        const legacy = primary.getItem(alias) || fallback.getItem(alias);
        if (legacy != null) {
          // Migrate legacy key to canonical key lazily on first read.
          this._setInStorage(key, legacy);
          try {
            primary.removeItem(alias);
            fallback.removeItem(alias);
          } catch { /* ignore */ }
          return legacy;
        }
      }
      return null;
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

  /** @private */
  _normalizeId(value) {
    if (value == null) return null;
    const str = String(value).trim();
    if (!str) return null;
    const lower = str.toLowerCase();
    if (lower === 'none' || lower === 'null' || lower === 'undefined') {
      return null;
    }
    return str;
  }
}
