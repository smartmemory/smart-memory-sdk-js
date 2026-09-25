import type { RecoveryAuth } from './connection.js';
export type { RecoveryAuth, RecoveryClient, ConnectionSnapshot, ConnectionState } from './connection.js';
export interface AuthFetchOptions {
  fetchFn?: typeof fetch;
  apiBases?: string[];
}
export interface InterceptorOptions extends AuthFetchOptions {
  urlPatterns?: string[];
}
export declare function createAuthFetch(authCore: RecoveryAuth, options?: AuthFetchOptions): typeof fetch;
/** Returns an injectable fetch; does not mutate global fetch or return an uninstaller. */
export declare function installInterceptor(authCore: RecoveryAuth, options?: InterceptorOptions): typeof fetch;
