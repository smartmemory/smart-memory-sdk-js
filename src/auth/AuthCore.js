import { TokenManager } from './TokenManager.js';
import { RefreshManager } from './RefreshManager.js';
import { SSOManager } from './SSOManager.js';

export class AuthCore {
  constructor(config) {
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
    const headers = { ...extraHeaders };

    if (this.currentToken) {
      headers['Authorization'] = this.currentToken.startsWith('Bearer ')
        ? this.currentToken
        : `Bearer ${this.currentToken}`;
    }

    const teamId = this.tokenManager.getTeamId();
    if (teamId) {
      headers['X-Team-Id'] = teamId;
    }

    return headers;
  }

  getRequestOptions(extra = {}) {
    if (!this.useCookieAuth) return { ...extra };
    return { credentials: 'include', ...extra };
  }

  addListener(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notifyListeners() {
    const state = {
      isAuthenticated: this.isAuthenticated(),
      user: this.currentUser,
      token: this.currentToken,
      tenantId: this.tokenManager.getTenantId()
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
    this.currentToken = token;
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
      // Retry once with cookie-only auth (no Authorization/X-Team-Id headers).
      let usedCookieOnlyFallback = false;
      if (!response.ok && (this.currentToken || this.tokenManager.getTeamId())) {
        response = await fetch(
          meUrl,
          this.getRequestOptions({ method: 'GET', headers: {} })
        );
        usedCookieOnlyFallback = response.ok;
      }
      if (!response.ok) return false;

      const user = await response.json();
      this.currentUser = user;
      this.tokenManager.setUser(user);
      const teamId = user?.default_team_id || this.tokenManager.getTeamId() || null;
      if (teamId) {
        this.tokenManager.setTeamId(teamId);
        this.tokenManager.setTenantId(user?.tenant_id || teamId);
      }

      if (usedCookieOnlyFallback) {
        // Prevent future requests from sending known-bad bearer/team headers.
        this.tokenManager.setAccessToken(null);
        this.currentToken = null;
        if (user?.default_team_id) {
          this.tokenManager.setTeamId(user.default_team_id);
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
