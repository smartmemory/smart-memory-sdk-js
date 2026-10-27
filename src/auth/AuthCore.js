import { ConnectionStatus } from '../connection/ConnectionStatus.js';
import { TokenManager } from './TokenManager.js';
import { RefreshManager } from './RefreshManager.js';
import { SSOManager } from './SSOManager.js';

// `/auth/me` 404 details that mean the identity itself is gone (smart-memory-service
// routes/auth.py get_me: user, tenant or org default team missing). Any other 404
// (a missing route behind a proxy) is not treated as a sign-out.
const IDENTITY_GONE_404 = new Set(['User not found', 'Tenant not found', 'Default team not found']);
const SESSION_CHECK_TIMEOUT_MS = 10000;

export class AuthCore {
  constructor(config) {
    this.sessionRevision = 0;
    // Bumped on every successful refresh so a session check started before it is discarded.
    this.tokenEpoch = 0;
    this.config = config;
    this.connection = new ConnectionStatus();
    this.mode = config.mode;
    // apiBaseUrl may be a string or a zero-arg function returning the current
    // base. The function form lets apps whose base is resolved at runtime
    // (e.g. admin's app-config apiBase, set after module load) keep every
    // consumer — refresh, logout, trust checks — on the live value.
    this._apiBaseUrl = config.apiBaseUrl;
    this.endpoints = config.endpoints || {};
    this.listeners = new Set();
    this.useCookieAuth = config.useCookieAuth ?? (this.mode === 'sso');

    // API key mode: simple static auth, no token management
    this.apiKey = config.apiKey || null;
    if (this.apiKey) {
      this.mode = 'apiKey';
    }

    this.tokenManager = new TokenManager({
      storage: config.storage || 'localStorage',
      keys: config.tokenKeys
    });

    // Only set up refresh manager for non-apiKey modes
    if (this.mode !== 'apiKey') {
      this.refreshManager = new RefreshManager({
        // Forward the raw config so a function form keeps resolving per refresh.
        apiBaseUrl: config.apiBaseUrl,
        refreshEndpoint: this.endpoints.refresh || '/auth/refresh',
        tokenManager: this.tokenManager,
        useCookieAuth: this.useCookieAuth,
        getRequestOptions: options => this.getRequestOptions(options),
        fetchFn: config.fetchFn,
        connection: this.connection,
        getSessionKey: () => JSON.stringify([this.sessionRevision, this.currentToken, this.tokenManager.getWorkspaceId()]),
        onTokenRefreshed: (token) => {
          this.tokenEpoch++;
          this.currentToken = token;
          this.notifyListeners();
          config.onTokenRefresh?.(token);
        },
        // A rejected refresh alone does not end the session: /auth/me decides.
        onRefreshFailed: () => this.clearIfSessionLost()
      });
    } else {
      this.refreshManager = null;
    }

    if (this.mode === 'sso') {
      this.ssoManager = new SSOManager({
        webAppUrl: config.webAppUrl,
        allowedHosts: config.allowedRedirectHosts || [],
        tokenManager: this.tokenManager
      });
    }

    // For API key mode, token is the API key itself
    if (this.mode === 'apiKey') {
      this.currentUser = null;
      this.currentToken = this.apiKey;
    } else {
      this.currentUser = this.tokenManager.getUser();
      this.currentToken = this.tokenManager.getAccessToken();
    }
  }

  /**
   * Current API base URL. When constructed with a function it is invoked on
   * every access so runtime-resolved bases stay live for the session.
   * @returns {string}
   */
  get apiBaseUrl() {
    return typeof this._apiBaseUrl === 'function' ? this._apiBaseUrl() : this._apiBaseUrl;
  }

  isAuthenticated() {
    return !!this.currentToken || (this.useCookieAuth && !!this.currentUser);
  }

  getCurrentUser() {
    return this.currentUser;
  }

  getCurrentToken() {
    return this.currentToken;
  }

  getTenantId() {
    return this.tokenManager.getTenantId();
  }

  hasRole(role) {
    return this.currentUser?.roles?.includes(role) || false;
  }

  getAuthHeaders(extraHeaders = {}) {
    const headers = typeof extraHeaders?.entries === 'function' || Array.isArray(extraHeaders)
      ? Object.fromEntries(new Headers(extraHeaders)) : { ...extraHeaders };
    const workspaceId = this.tokenManager.getWorkspaceId();
    for (const key of Object.keys(headers)) {
      if (key.toLowerCase() === 'authorization' ||
          (workspaceId && key.toLowerCase() === 'x-workspace-id')) delete headers[key];
    }

    if (this.currentToken) {
      headers['Authorization'] = this.currentToken.startsWith('Bearer ')
        ? this.currentToken
        : `Bearer ${this.currentToken}`;
    }

    if (workspaceId) {
      headers['X-Workspace-Id'] = workspaceId;
    }

    return headers;
  }

  getRequestOptions(extra = {}) {
    if (!this.useCookieAuth) return { ...extra };
    const headers = typeof extra.headers?.entries === 'function' || Array.isArray(extra.headers)
      ? Object.fromEntries(new Headers(extra.headers)) : { ...extra.headers };
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes((extra.method || 'GET').toUpperCase()) && typeof document !== 'undefined') {
      const cookie = document.cookie.split(/;\s*/).find(value => value.startsWith('sm_csrf='));
      if (cookie) {
        for (const key of Object.keys(headers)) {
          if (key.toLowerCase() === 'x-csrf-token') delete headers[key];
        }
        headers['x-csrf-token'] = decodeURIComponent(cookie.slice(8));
      }
    }
    return { credentials: 'include', ...extra, headers };
  }

  addListener(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notifyListeners() {
    if (this.isAuthenticated()) this.connection.authenticated();
    const state = {
      isAuthenticated: this.isAuthenticated(),
      user: this.currentUser,
      token: this.currentToken,
      tenantId: this.tokenManager.getTenantId(),
      workspaceId: this.tokenManager.getWorkspaceId()
    };

    this.listeners.forEach(listener => {
      try {
        listener(state);
      } catch (e) {
        console.error('Auth listener error:', e);
      }
    });
  }

  getLoginUrl(currentUrl) {
    if (this.mode !== 'sso') {
      throw new Error('getLoginUrl() only available in sso mode');
    }
    return this.ssoManager.getLoginUrl(currentUrl);
  }

  /** `reason: 'user'` marks an intentional sign-out (logout, account switch); default 'expired'. */
  clearLocalAuth(options = {}) {
    this.sessionRevision++;
    this.connection.signedOut({ reason: options.reason });
    // API key mode: just clear the key
    if (this.mode === 'apiKey') {
      this.apiKey = null;
      this.currentToken = null;
      this.notifyListeners();
      return;
    }
    this.tokenManager.clearAll();
    this.currentUser = null;
    this.currentToken = null;
    this.notifyListeners();
  }

  /**
   * Clear local identity only when the server does not confirm it: the refresh
   * was refused AND `/auth/me` answers 401/403, a documented identity-gone 404,
   * or a 2xx for a different user or tenant (org). Only the same user in the
   * same tenant keeps its identity (a stale bearer is dropped). A transient
   * `/auth/me` failure (network, timeout, 429, 5xx) keeps it too. One check runs
   * per session snapshot, bounded by `config.sessionCheckTimeoutMs` (10 s).
   */
  clearIfSessionLost() {
    if (this.mode === 'apiKey') { this.clearLocalAuth(); return Promise.resolve(); }
    const key = this._sessionSnapshot();
    let entry = this._sessionProbe;
    if (entry?.key !== key) {
      entry = { key };
      entry.promise = this._probeSession(key).finally(() => { if (this._sessionProbe === entry) this._sessionProbe = null; });
      this._sessionProbe = entry;
    }
    return entry.promise;
  }

  /** Everything a session check result depends on; any change supersedes it. */
  _sessionSnapshot() {
    return JSON.stringify([this.sessionRevision, this.tokenEpoch, this.currentToken, this.currentUser?.id ?? null,
      this.tokenManager.getTenantId(), this.tokenManager.getWorkspaceId()]);
  }

  /**
   * Same principal and same tenant (org) as the cached identity. The workspace
   * is the user's own pick and is deliberately not compared with the server's
   * default workspace. No cached user means nothing to bind: not the same.
   */
  _isSameIdentity(me) {
    const user = this.currentUser;
    if (user?.id == null || me?.id == null || String(me.id) !== String(user.id)) return false;
    const tenants = [user.tenant_id, this.tokenManager.getTenantId()].filter(t => t != null && t !== '');
    return tenants.every(tenant => me.tenant_id != null && String(me.tenant_id) === String(tenant));
  }

  async _probeSession(key) {
    const controller = new AbortController();
    const timeoutMs = this.config.sessionCheckTimeoutMs ?? SESSION_CHECK_TIMEOUT_MS;
    const check = (async () => {
      const response = await (this.config.fetchFn || globalThis.fetch.bind(globalThis))(
        `${this.apiBaseUrl}/auth/me`,
        this.getRequestOptions({ method: 'GET', headers: this.useCookieAuth ? {} : this.getAuthHeaders(), signal: controller.signal })
      );
      const body = response?.ok || response?.status === 404 ? await response.json().catch(() => null) : null;
      return { response, body };
    })();
    check.catch(() => {});
    let timer;
    let result;
    try {
      result = await Promise.race([check, new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new DOMException('Session check timed out', 'TimeoutError'));
        }, timeoutMs);
      })]);
    } catch (error) {
      console.warn('[auth] Session check failed; keeping local identity', error);
      return;
    } finally {
      clearTimeout(timer);
    }
    // Superseded by a refresh, bootstrap, logout or tenant/workspace change meanwhile.
    if (this._sessionSnapshot() !== key) return;
    const { response, body } = result;
    const status = response?.status;
    if (status === 401 || status === 403 || (status === 404 && IDENTITY_GONE_404.has(body?.detail))) {
      this.clearLocalAuth();
      return;
    }
    if (!response?.ok) return;
    if (!this._isSameIdentity(body)) {
      // Another principal or org now owns the session: never carry the old
      // user, roles, tenant, workspace or refresh token over to it.
      console.warn('[auth] Session belongs to a different user or tenant; signing out');
      this.clearLocalAuth();
      return;
    }
    if (this.useCookieAuth && this.currentToken) {
      // The cookie session is valid: stop sending the rejected bearer.
      this.tokenManager.setAccessToken(null);
      this.currentToken = null;
      this.notifyListeners();
    }
  }

  async logout() {
    // API key mode: just clear the key
    if (this.mode === 'apiKey') {
      this.clearLocalAuth({ reason: 'user' });
      return;
    }

    if (this.endpoints.logout) {
      try {
        await fetch(`${this.apiBaseUrl}${this.endpoints.logout}`, {
          ...this.getRequestOptions(),
          method: 'POST',
          headers: this.getAuthHeaders()
        });
      } catch (e) {
        console.warn('Logout request failed:', e);
      }
    }

    this.clearLocalAuth({ reason: 'user' });
  }

  async refreshToken() {
    // API key mode doesn't need token refresh
    if (this.mode === 'apiKey') {
      return this.apiKey;
    }
    if (!this.refreshManager) {
      throw new Error('Token refresh not available in this mode');
    }
    const token = await this.refreshManager.refresh();
    return token;
  }

  async bootstrapSession() {
    if (this.mode === 'apiKey' || !this.useCookieAuth) {
      return false;
    }
    try {
      const meUrl = `${this.apiBaseUrl}/auth/me`;
      let response = await fetch(
        meUrl,
        this.getRequestOptions({ method: 'GET', headers: this.getAuthHeaders() })
      );

      // If a stale bearer token is present, middleware may reject before cookie fallback.
      // Retry once with cookie-only auth (no Authorization/X-Workspace-Id headers).
      let usedCookieOnlyFallback = false;
      if (!response.ok && (this.currentToken || this.tokenManager.getWorkspaceId())) {
        response = await fetch(
          meUrl,
          this.getRequestOptions({ method: 'GET', headers: {} })
        );
        usedCookieOnlyFallback = response.ok;
      }

      // If still unauthorized, the sm_access_token cookie may have expired while
      // sm_refresh_token is still valid. Attempt one cookie-based refresh and retry.
      // RefreshManager with useCookieAuth sends an empty body with credentials:'include',
      // so the server reads sm_refresh_token from the cookie jar.
      if (!response.ok && response.status === 401 && this.refreshManager) {
        try {
          await this.refreshManager.refresh();
          response = await fetch(
            meUrl,
            this.getRequestOptions({ method: 'GET', headers: this.getAuthHeaders() })
          );
        } catch {
          // Refresh failed (missing/invalid sm_refresh_token). Fall through to
          // return false below; onRefreshFailed has already cleared local state.
        }
      }

      if (!response.ok) return false;

      const user = await response.json();
      this.currentUser = user;
      this.tokenManager.setUser(user);
      const defaultWorkspaceId = user?.default_workspace_id || user?.default_team_id || null;
      const workspaceId = defaultWorkspaceId || this.tokenManager.getWorkspaceId() || null;
      if (workspaceId) {
        this.tokenManager.setWorkspaceId(workspaceId);
        this.tokenManager.setTenantId(user?.tenant_id || workspaceId);
      }

      if (usedCookieOnlyFallback) {
        // Prevent future requests from sending known-bad bearer/workspace headers.
        this.tokenManager.setAccessToken(null);
        this.currentToken = null;
        if (defaultWorkspaceId) {
          this.tokenManager.setWorkspaceId(defaultWorkspaceId);
        }
      }

      this.notifyListeners();
      return true;
    } catch {
      return false;
    }
  }

  setTenantId(tenantId) {
    this.tokenManager.setTenantId(tenantId);
    this.notifyListeners();
  }
}
