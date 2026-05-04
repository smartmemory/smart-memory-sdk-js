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
  // Capture the original reference so uninstall() can restore it identically.
  const originalFetch = globalThis.fetch;
  // Native fetch requires `this` to be Window/WorkerGlobalScope — calling a
  // bare reference throws "Illegal invocation". Use a bound copy internally
  // for calls; keep the unbound reference for uninstall identity.
  const boundFetch = originalFetch.bind(globalThis);

  globalThis.fetch = async function interceptedFetch(url, options = {}) {
    const urlStr = typeof url === 'string' ? url : url.toString();

    const shouldIntercept = urlPatterns.length === 0 ||
      urlPatterns.some(pattern => urlStr.includes(pattern));

    if (!shouldIntercept) {
      return boundFetch(url, options);
    }

    const headers = {
      ...options.headers,
      ...authCore.getAuthHeaders()
    };

    return boundFetch(url, { ...options, headers });
  };

  return function uninstall() {
    globalThis.fetch = originalFetch;
  };
}
