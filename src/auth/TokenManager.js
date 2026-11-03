const DEFAULT_KEYS = {
  access: 'smart_memory_auth_token',
  refresh: 'smart_memory_refresh_token',
  user: 'smart_memory_user',
  tenant: 'smart_memory_tenant_id',
  workspace: 'smart_memory_workspace_id'
};

const LEGACY_KEYS = {
  access: ['access_token', 'sm_token'],
  refresh: ['refresh_token', 'sm_refresh_token'],
  user: ['sm_user'],
  tenant: ['tenant_id', 'workspace_id', 'sm_workspace_id'],
  workspace: ['smart_memory_team_id', 'team_id', 'sm_team_id']
};

export class TokenManager {
  /**
   * @param {Object} options
   * @param {'localStorage' | 'sessionStorage' | 'memory'} [options.storage='localStorage']
   * @param {Object} [options.keys] - Custom storage key names
   * @param {boolean} [options.persistCredentials=true] - false keeps the access and
   *   refresh tokens in memory only (cookie auth: the HttpOnly cookies are the durable
   *   credential) and removes any copies a previous version left in Web Storage.
   */
  constructor({ storage = 'localStorage', keys = {}, persistCredentials = true } = {}) {
    this.storageType = storage;
    this.persistCredentials = persistCredentials;
    const workspaceKey = keys.workspace || keys.team || DEFAULT_KEYS.workspace;
    this.keys = { ...DEFAULT_KEYS, ...keys, workspace: workspaceKey };
    // Keep the custom-key alias observable for callers that inspect ``keys``.
    this.keys.team ??= workspaceKey;
    this.workspaceAliases = [
      ...LEGACY_KEYS.workspace,
      ...(keys.team && keys.team !== workspaceKey ? [keys.team] : [])
    ];
    this._memory = { access: null, refresh: null, user: null, tenant: null, workspace: null };
    if (!persistCredentials && storage !== 'memory') this._removeStoredCredentials();
  }

  /** True when the access and refresh tokens live in `_memory`, never in Web Storage. */
  get _credentialsInMemory() {
    return this.storageType === 'memory' || !this.persistCredentials;
  }

  getAccessToken() {
    if (this._credentialsInMemory) return this._memory.access;
    return this._getFromStorage(this.keys.access, LEGACY_KEYS.access);
  }

  setAccessToken(token) {
    if (this._credentialsInMemory) {
      this._memory.access = token;
      return;
    }
    this._setInStorage(this.keys.access, token);
  }

  getRefreshToken() {
    if (this._credentialsInMemory) return this._memory.refresh;
    return this._getFromStorage(this.keys.refresh, LEGACY_KEYS.refresh);
  }

  setRefreshToken(token) {
    if (this._credentialsInMemory) {
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

  getWorkspaceId() {
    if (this.storageType === 'memory') return this._memory.workspace;
    return this._normalizeId(this._getFromStorage(this.keys.workspace, this.workspaceAliases));
  }

  setWorkspaceId(workspaceId) {
    const normalized = this._normalizeId(workspaceId);
    if (this.storageType === 'memory') {
      this._memory.workspace = normalized;
      return;
    }
    this._setInStorage(this.keys.workspace, normalized);
  }

  getTeamId() {
    return this.getWorkspaceId();
  }

  setTeamId(teamId) {
    this.setWorkspaceId(teamId);
  }

  clearAll() {
    this._memory = { access: null, refresh: null, user: null, tenant: null, workspace: null };
    if (this.storageType === 'memory') return;
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

  /** @private Remove stored access/refresh tokens under the current and legacy key names. */
  _removeStoredCredentials() {
    for (const key of [this.keys.access, this.keys.refresh, ...LEGACY_KEYS.access, ...LEGACY_KEYS.refresh]) {
      try {
        localStorage.removeItem(key);
        sessionStorage.removeItem(key);
      } catch { /* storage unavailable */ }
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
