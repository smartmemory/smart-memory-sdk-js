export class RefreshManager {
  #refreshPromise = null;

  /**
   * @param {Object} options
   * @param {string} options.apiBaseUrl
   * @param {string} options.refreshEndpoint
   * @param {import('./TokenManager.js').TokenManager} options.tokenManager
   * @param {function(string): void} options.onTokenRefreshed
   * @param {function(): void} options.onRefreshFailed
   */
  constructor({ apiBaseUrl, refreshEndpoint, tokenManager, onTokenRefreshed, onRefreshFailed }) {
    this.apiBaseUrl = apiBaseUrl;
    this.refreshEndpoint = refreshEndpoint;
    this.tokenManager = tokenManager;
    this.onTokenRefreshed = onTokenRefreshed;
    this.onRefreshFailed = onRefreshFailed;
  }

  async refresh() {
    if (this.#refreshPromise) {
      return this.#refreshPromise;
    }

    this.#refreshPromise = this.#doRefresh();
    try {
      return await this.#refreshPromise;
    } finally {
      this.#refreshPromise = null;
    }
  }

  async #doRefresh() {
    const refreshToken = this.tokenManager.getRefreshToken();
    if (!refreshToken) {
      this.onRefreshFailed();
      throw new Error('No refresh token');
    }

    const response = await fetch(`${this.apiBaseUrl}${this.refreshEndpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken })
    });

    if (!response.ok) {
      this.onRefreshFailed();
      throw new Error(`Refresh failed: ${response.status}`);
    }

    const data = await response.json();
    this.tokenManager.setAccessToken(data.access_token);
    if (data.refresh_token) {
      this.tokenManager.setRefreshToken(data.refresh_token);
    }

    this.onTokenRefreshed(data.access_token);
    return data.access_token;
  }
}
