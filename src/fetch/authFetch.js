/**
 * Create an authenticated fetch wrapper.
 * Pattern from studio AuthService.js line 318.
 *
 * @param {import('../auth/AuthCore.js').AuthCore} authCore
 * @returns {function} fetch-like function with auth headers
 */
export function createAuthFetch(authCore) {
  return async function authFetch(url, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...authCore.getAuthHeaders(options.headers)
    };

    const response = await fetch(url, authCore.getRequestOptions({ ...options, headers }));

    if (response.status === 401 && !options.__isRetry) {
      try {
        await authCore.refreshToken();
        const retryHeaders = {
          'Content-Type': 'application/json',
          ...authCore.getAuthHeaders(options.headers)
        };
        return fetch(
          url,
          authCore.getRequestOptions({ ...options, headers: retryHeaders, __isRetry: true })
        );
      } catch {
        // Do not globally revoke cookie sessions from passive request failures.
        authCore.clearLocalAuth?.();
        throw new Error('Authentication required');
      }
    }

    return response;
  };
}
