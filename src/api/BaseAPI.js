import { APIError } from '../errors/APIError.js';

export class BaseAPI {
  /**
   * @param {import('../auth/AuthCore.js').AuthCore} authCore
   * @param {{ fetchFn?: typeof globalThis.fetch }} [options]
   */
  constructor(authCore, { fetchFn } = {}) {
    this.auth = authCore;
    this.baseURL = authCore.apiBaseUrl;
    this._customFetchFn = fetchFn || null;
  }

  get fetchFn() {
    return this._customFetchFn || globalThis.fetch;
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...this.auth.getAuthHeaders(options.headers)
    };

    const config = this.auth.getRequestOptions({ ...options, headers });

    try {
      let response = await this.fetchFn(url, config);

      if (response.status === 401 && !options.__isRetry) {
        try {
          await this.auth.refreshToken();

          const retryHeaders = {
            'Content-Type': 'application/json',
            ...this.auth.getAuthHeaders(options.headers)
          };
          response = await this.fetchFn(
            url,
            this.auth.getRequestOptions({ ...config, headers: retryHeaders, __isRetry: true })
          );
        } catch {
          // Refresh failed — fall through to 401 handling below
        }
      }

      if (response.status === 401) {
        // Do not globally revoke cookie sessions from passive request failures.
        this.auth.clearLocalAuth?.();
        throw new APIError('Authentication required', 401, 'auth_expired');
      }

      if (response.status === 204) {
        return null;
      }

      if (!response.ok) {
        throw await this._handleError(response);
      }

      return await response.json();
    } catch (error) {
      if (error instanceof APIError) throw error;
      throw new APIError(error.message, 0, 'network_error');
    }
  }

  async get(endpoint, options = {}) {
    return this.request(endpoint, { ...options, method: 'GET' });
  }

  async post(endpoint, data, options = {}) {
    return this.request(endpoint, {
      ...options,
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async put(endpoint, data, options = {}) {
    return this.request(endpoint, {
      ...options,
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  async patch(endpoint, data, options = {}) {
    return this.request(endpoint, {
      ...options,
      method: 'PATCH',
      body: JSON.stringify(data)
    });
  }

  async delete(endpoint, options = {}) {
    return this.request(endpoint, { ...options, method: 'DELETE' });
  }

  /** @private */
  async _handleError(response) {
    let errorData;
    const contentType = response.headers?.get?.('content-type');

    try {
      if (contentType?.includes('application/json')) {
        errorData = await response.json();
      } else {
        errorData = { message: await response.text() };
      }
    } catch {
      errorData = { message: `HTTP ${response.status}` };
    }

    return new APIError(
      errorData.detail || errorData.message || `HTTP ${response.status}`,
      response.status,
      errorData
    );
  }
}
