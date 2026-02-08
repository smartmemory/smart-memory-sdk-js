const REDIRECT_KEY = 'smart_memory_sso_redirect';

export class SSOManager {
  /**
   * @param {Object} options
   * @param {string} options.webAppUrl - Web app URL for login redirect
   * @param {string[]} [options.allowedHosts=[]] - Allowed redirect hostnames
   * @param {import('./TokenManager.js').TokenManager} options.tokenManager
   */
  constructor({ webAppUrl, allowedHosts = [], tokenManager }) {
    this.webAppUrl = webAppUrl;
    this.allowedHosts = allowedHosts;
    this.tokenManager = tokenManager;
  }

  getLoginUrl(redirectUrl) {
    const callbackUrl = redirectUrl || `${window.location.origin}/auth/callback`;
    return `${this.webAppUrl}/login?redirect=${encodeURIComponent(callbackUrl)}`;
  }

  isValidRedirectUrl(url) {
    if (!this.allowedHosts.length) return true;
    try {
      const parsed = new URL(url);
      return this.allowedHosts.includes(parsed.hostname);
    } catch {
      return false;
    }
  }

  storeCallbackTokens(params) {
    const token = params.get('token');
    const refreshToken = params.get('refresh_token');
    const teamId = params.get('team_id');

    if (token) this.tokenManager.setAccessToken(token);
    if (refreshToken) this.tokenManager.setRefreshToken(refreshToken);
    if (teamId) this.tokenManager.setTenantId(teamId);
  }

  storeRedirect(url) {
    try {
      sessionStorage.setItem(REDIRECT_KEY, url);
    } catch (e) {
      console.warn('Failed to store redirect URL:', e);
    }
  }

  getAndClearRedirect() {
    try {
      const url = sessionStorage.getItem(REDIRECT_KEY);
      sessionStorage.removeItem(REDIRECT_KEY);
      return url;
    } catch {
      return null;
    }
  }
}
