import { fetchWithRecovery, isTrusted, resolveURL } from './recovery.js';

/** Create an injectable fetch function; never changes globalThis.fetch. */
export function createAuthFetch(authCore, { fetchFn, apiBases = [] } = {}) {
  return async function authFetch(input, options = {}) {
    const transport = fetchFn || globalThis.fetch.bind(globalThis);
    const url = resolveURL(input);
    if (!isTrusted(authCore, url, apiBases) || /\/auth(?:\/|$)/.test(url.pathname)) {
      return transport(input, options);
    }
    const request = input instanceof Request ? new Request(input, options) : null;
    const originalHeaders = request?.headers || options.headers;
    const signal = request?.signal || options.signal;
    const send = retry => {
      const headers = authCore.getAuthHeaders(originalHeaders);
      const init = authCore.getRequestOptions({ ...options, method: request?.method || options.method, headers, ...(retry ? { __isRetry: true } : {}) });
      return transport(request ? request.clone() : input, init);
    };
    return fetchWithRecovery(authCore, send, { source: url.href, signal });
  };
}
