import { APIError } from '../errors/APIError.js';

export class BaseAPI {
  /**
   * @param {import('../auth/AuthCore.js').AuthCore} authCore
   */
  constructor(authCore) {
    this.auth = authCore;
    this.baseURL = authCore.apiBaseUrl;
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...this.auth.getAuthHeaders(options.headers)
    };

    const config = { ...options, headers };

    try {
      let response = await fetch(url, config);

      if (response.status === 401 && !options.__isRetry) {
        try {
          await this.auth.refreshToken();

          const retryHeaders = {
            'Content-Type': 'application/json',
            ...this.auth.getAuthHeaders(options.headers)
          };
          response = await fetch(url, { ...config, headers: retryHeaders, __isRetry: true });
        } catch {
          // Refresh failed — fall through to 401 handling below
        }
      }

      if (response.status === 401) {
        await this.auth.logout();
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
