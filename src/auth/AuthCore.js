import { ConnectionStatus } from '../connection/ConnectionStatus.js';
import { TokenManager } from './TokenManager.js';
import { RefreshManager } from './RefreshManager.js';
import { SSOManager } from './SSOManager.js';

export class AuthCore {
  constructor(config) {
    this.sessionRevision = 0;
    this.connection = new ConnectionStatus();
    this.mode = config.mode;
    this.apiBaseUrl = config.apiBaseUrl;
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
        apiBaseUrl: this.apiBaseUrl,
        refreshEndpoint: this.endpoints.refresh || '/auth/refresh',
        tokenManager: this.tokenManager,
        useCookieAuth: this.useCookieAuth,
        getRequestOptions: options => this.getRequestOptions(options),
        fetchFn: config.fetchFn,
        connection: this.connection,
        getSessionKey: () => JSON.stringify([this.sessionRevision, this.currentToken, this.tokenManager.getWorkspaceId()]),
        onTokenRefreshed: (token) => {
          this.currentToken = token;
          this.notifyListeners();
          config.onTokenRefresh?.(token);
        },
        onRefreshFailed: () => {
          // Passive auth failures should not globally revoke shared cookie sessions.
          this.clearLocalAuth();
        }
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

  clearLocalAuth() {
    this.sessionRevision++;
    this.connection.signedOut();
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

  async logout() {
    // API key mode: just clear the key
    if (this.mode === 'apiKey') {
      this.clearLocalAuth();
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

    this.clearLocalAuth();
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
