export class SessionRefreshError extends Error {
  constructor(message, status = 0, recoverable = true) {
    super(message);
    this.name = 'SessionRefreshError';
    this.status = status;
    this.recoverable = recoverable;
  }
}

export class RefreshManager {
  #refreshPromise = null;

  /**
   * @param {Object} options
   * @param {string | function(): string} options.apiBaseUrl - base URL, or a
   *   zero-arg resolver invoked per refresh (runtime-resolved bases)
   * @param {string} options.refreshEndpoint
   * @param {import('./TokenManager.js').TokenManager} options.tokenManager
   * @param {boolean} [options.useCookieAuth=false]
   * @param {function(string): void} options.onTokenRefreshed
   * @param {function(): void} options.onRefreshFailed
   */
  constructor({ apiBaseUrl, refreshEndpoint, tokenManager, useCookieAuth = false, onTokenRefreshed, onRefreshFailed, getRequestOptions, fetchFn, connection, getSessionKey }) {
    this.getRequestOptions = getRequestOptions || (options => options);
    this.fetchFn = fetchFn;
    this.getSessionKey = getSessionKey;
    this.connection = connection;
    this.apiBaseUrl = apiBaseUrl;
    this.refreshEndpoint = refreshEndpoint;
    this.tokenManager = tokenManager;
    this.useCookieAuth = useCookieAuth;
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
    const sessionKey = this.getSessionKey?.();
    const checkSession = () => {
      if (this.getSessionKey?.() !== sessionKey) throw new DOMException('Session changed during refresh', 'AbortError');
    };
    const refreshToken = this.tokenManager.getRefreshToken();
    if (!refreshToken && !this.useCookieAuth) {
      console.warn('[auth] No refresh token available; authentication required');
      this.onRefreshFailed();
      throw new SessionRefreshError('No refresh token', 401, false);
    }

    const body = refreshToken ? JSON.stringify({ refresh_token: refreshToken }) : JSON.stringify({});
    try {
      const apiBase = typeof this.apiBaseUrl === 'function' ? this.apiBaseUrl() : this.apiBaseUrl;
      const response = await (this.fetchFn || globalThis.fetch.bind(globalThis))(`${apiBase}${this.refreshEndpoint}`, this.getRequestOptions({
        ...(this.useCookieAuth ? { credentials: 'include' } : {}),
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body
      }));

      checkSession();
      if (!response.ok) {
        const definitive = response.status === 401 || response.status === 403;
        if (definitive) this.onRefreshFailed();
        throw new SessionRefreshError(`Refresh failed: ${response.status}`, response.status, !definitive);
      }

      const data = await response.json();
      checkSession();
      if (typeof data.access_token !== 'string' || !data.access_token) throw new SessionRefreshError('Refresh response has no access token');
      this.tokenManager.setAccessToken(data.access_token);
      if (data.refresh_token) {
        this.tokenManager.setRefreshToken(data.refresh_token);
      }

      this.onTokenRefreshed(data.access_token);
      this.connection?.report('refresh', null);
      return data.access_token;
    } catch (cause) {
      if (cause.name === 'AbortError') throw cause;
      const error = cause instanceof SessionRefreshError ? cause : new SessionRefreshError(cause.message);
      console.warn('[auth] Session refresh failed', error);
      if (error.recoverable) this.connection?.report('refresh', error.message);
      throw error;
    }
  }
}
