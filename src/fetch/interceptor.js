import { createAuthFetch } from './authFetch.js';

/**
 * Create a scoped, injectable interceptor. Does not modify global fetch.
 * Migration: use the returned function as your app/adapter fetch transport.
 * urlPatterns can narrow the trusted API bases, never broaden their origins.
 */
export function installInterceptor(authCore, { urlPatterns = [], fetchFn, apiBases = [] } = {}) {
  const transport = fetchFn || globalThis.fetch.bind(globalThis);
  const authenticated = createAuthFetch(authCore, { fetchFn: transport, apiBases });
  return (input, options) => {
    const url = input instanceof Request ? input.url : String(input);
    return !urlPatterns.length || urlPatterns.some(pattern => url.includes(pattern))
      ? authenticated(input, options) : transport(input, options);
  };
}
