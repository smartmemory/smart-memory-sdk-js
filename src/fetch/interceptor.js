/**
 * Install a global fetch interceptor that adds auth headers.
 * Opt-in only — call installInterceptor() to activate.
 *
 * @param {import('../auth/AuthCore.js').AuthCore} authCore
 * @param {Object} [options]
 * @param {string[]} [options.urlPatterns] - Only intercept URLs matching these patterns
 * @returns {function} uninstall function to restore original fetch
 */
export function installInterceptor(authCore, { urlPatterns = [] } = {}) {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async function interceptedFetch(url, options = {}) {
    const urlStr = typeof url === 'string' ? url : url.toString();

    const shouldIntercept = urlPatterns.length === 0 ||
      urlPatterns.some(pattern => urlStr.includes(pattern));

    if (!shouldIntercept) {
      return originalFetch(url, options);
    }

    const headers = {
      ...options.headers,
      ...authCore.getAuthHeaders()
    };

    return originalFetch(url, { ...options, headers });
  };

  return function uninstall() {
    globalThis.fetch = originalFetch;
  };
}
