import { TokenManager } from './TokenManager.js';
import { RefreshManager } from './RefreshManager.js';
import { SSOManager } from './SSOManager.js';

export class AuthCore {
  constructor(config) {
    this.mode = config.mode;
    this.apiBaseUrl = config.apiBaseUrl;
    this.endpoints = config.endpoints || {};
    this.listeners = new Set();

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
        onTokenRefreshed: (token) => {
          this.currentToken = token;
          this.notifyListeners();
          config.onTokenRefresh?.(token);
        },
        onRefreshFailed: () => {
          this.logout();
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
    return !!this.currentToken;
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

  async login(credentials) {
    if (this.mode === 'apiKey') {
      throw new Error('login() not available in apiKey mode');
    }
    if (this.mode !== 'custom') {
      throw new Error('login() only available in custom mode');
    }

    const response = await fetch(`${this.apiBaseUrl}${this.endpoints.login}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials)
    });

    if (!response.ok) {
      let detail = `Login failed: ${response.status}`;
      try {
        const errBody = await response.json();
        if (errBody.detail) detail = errBody.detail;
      } catch { /* ignore parse errors */ }
      throw new Error(detail);
    }

    const data = await response.json();

    const accessToken = data.tokens?.access_token || data.access_token;
    const refreshToken = data.tokens?.refresh_token || data.refresh_token;

    this.tokenManager.setAccessToken(accessToken);
    if (refreshToken) {
      this.tokenManager.setRefreshToken(refreshToken);
    }

    const user = data.user;
    this.tokenManager.setUser(user);
    this.currentUser = user;
    this.currentToken = accessToken;

    const teamId = user?.default_team_id || data.team_id;
    if (teamId) {
      this.tokenManager.setTenantId(teamId);
      this.tokenManager.setTeamId(teamId);
    }

    this.notifyListeners();
    return { token: this.currentToken, user, isNewAccount: !!data.is_new_account };
  }

  getLoginUrl(currentUrl) {
    if (this.mode !== 'sso') {
      throw new Error('getLoginUrl() only available in sso mode');
    }
    return this.ssoManager.getLoginUrl(currentUrl);
  }

  storeCallbackTokens(params) {
    if (this.mode !== 'sso') {
      throw new Error('storeCallbackTokens() only available in sso mode');
    }
    this.ssoManager.storeCallbackTokens(params);
    this.currentUser = this.tokenManager.getUser();
    this.currentToken = this.tokenManager.getAccessToken();
    this.notifyListeners();
  }

  async logout() {
    // API key mode: just clear the key
    if (this.mode === 'apiKey') {
      this.apiKey = null;
      this.currentToken = null;
      this.notifyListeners();
      return;
    }

    if (this.endpoints.logout) {
      try {
        await fetch(`${this.apiBaseUrl}${this.endpoints.logout}`, {
          method: 'POST',
          headers: this.getAuthHeaders()
        });
      } catch (e) {
        console.warn('Logout request failed:', e);
      }
    }

    this.tokenManager.clearAll();
    this.currentUser = null;
    this.currentToken = null;
    this.notifyListeners();
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

  setTenantId(tenantId) {
    this.tokenManager.setTenantId(tenantId);
    this.notifyListeners();
  }
}
