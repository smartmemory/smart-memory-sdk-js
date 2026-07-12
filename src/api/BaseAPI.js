import { APIError } from '../errors/APIError.js';

function isFormData(body) {
  return typeof FormData !== 'undefined' && body instanceof FormData;
}

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
    // Native fetch requires `this` to be Window/WorkerGlobalScope. Returning
    // a bare reference and calling it as `this.fetchFn(...)` loses that
    // binding and throws "Illegal invocation". Bind to globalThis so callers
    // can invoke the result as a free function.
    return this._customFetchFn || globalThis.fetch.bind(globalThis);
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const headers = {
      ...(isFormData(options.body) ? {} : { 'Content-Type': 'application/json' }),
      ...this.auth.getAuthHeaders(options.headers)
    };

    const config = this.auth.getRequestOptions({ ...options, headers });

    try {
      let response = await this.fetchFn(url, config);

      if (response.status === 401 && !options.__isRetry) {
        try {
          await this.auth.refreshToken();

          const retryHeaders = {
            ...(isFormData(options.body) ? {} : { 'Content-Type': 'application/json' }),
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

  async requestBinary(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const headers = {
      ...(isFormData(options.body) ? {} : { 'Content-Type': 'application/json' }),
      ...this.auth.getAuthHeaders(options.headers)
    };
    const config = this.auth.getRequestOptions({ ...options, headers });

    try {
      let response = await this.fetchFn(url, config);

      if (response.status === 401 && !options.__isRetry) {
        try {
          await this.auth.refreshToken();
          const retryHeaders = {
            ...(isFormData(options.body) ? {} : { 'Content-Type': 'application/json' }),
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
        this.auth.clearLocalAuth?.();
        throw new APIError('Authentication required', 401, 'auth_expired');
      }

      if (!response.ok) {
        throw await this._handleError(response);
      }

      return await response.arrayBuffer();
    } catch (error) {
      if (error instanceof APIError) throw error;
      throw new APIError(error.message, 0, 'network_error');
    }
  }

  async postForm(endpoint, formData, options = {}) {
    return this.request(endpoint, {
      ...options,
      method: 'POST',
      body: formData
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
      this._extractMessage(errorData, response.status),
      response.status,
      errorData
    );
  }

  /**
   * Coerce a FastAPI/JSON error body into a human-readable string.
   *
   * FastAPI's `detail` may be a plain string, a structured object
   * (e.g. `{code, current_version}`), or an array of 422 validation errors.
   * Passing a non-string straight to `new APIError(message)` makes the Error
   * base coerce it to the literal `"[object Object]"` — which the BETA-NDA-1
   * gate rendered to the user on a 409 version_mismatch. Always return a string;
   * the full body is still preserved on `error.detail` (3rd APIError arg) so
   * callers like ndaGate.js can read `error.detail.detail.code`.
   * @private
   */
  _extractMessage(errorData, status) {
    const detail = errorData?.detail;
    if (typeof detail === 'string') return detail;
    if (detail && typeof detail === 'object') {
      if (typeof detail.message === 'string') return detail.message;
      if (typeof detail.code === 'string') return detail.code;
      if (Array.isArray(detail) && typeof detail[0]?.msg === 'string') return detail[0].msg;
    }
    if (typeof errorData?.message === 'string') return errorData.message;
    return `HTTP ${status}`;
  }
}
