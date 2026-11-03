/**
 * INSIGHTS-2.0-LOGOUT-REVOKE-1: logout really ends the cookie session, and
 * cookie auth keeps access/refresh tokens out of Web Storage.
 *
 * The service is faked at the HTTP boundary (global fetch): an HttpOnly cookie
 * jar the page cannot read, the double-submit CSRF check of service_common
 * require_csrf (a cookie-authenticated POST without a matching x-csrf-token is
 * 403), and the revocation /auth/logout performs (later /auth/me is 401).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthCore, LogoutError } from '../../../src/auth/AuthCore.js';

const BASE = 'https://service.test';
const CSRF = 'csrf-echo';
// Every key TokenManager.js reads or writes an access or refresh token under.
const CREDENTIAL_KEYS = ['smart_memory_auth_token', 'smart_memory_refresh_token', 'access_token', 'sm_token', 'refresh_token', 'sm_refresh_token'];
const USER = { id: 'u1', tenant_id: 't1', default_workspace_id: 'w1' };

const json = (status, body) => new Response(body == null ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function fakeService() {
  // forced: path -> statuses answered in order before the normal behaviour (scripted sequences).
  const server = { revoked: false, calls: [], forced: {}, jar: { sm_access_token: 'cookie-access', sm_refresh_token: 'cookie-refresh' } };
  server.fetch = vi.fn(async (url, init = {}) => {
    const response = respond(url, init);
    server.calls.at(-1).status = response.status;
    return response;
  });
  function respond(url, init = {}) {
    const path = new URL(url).pathname;
    const method = (init.method || 'GET').toUpperCase();
    const headers = new Headers(init.headers);
    const cookieSession = init.credentials === 'include' && !!server.jar.sm_access_token;
    const bearer = headers.get('authorization')?.startsWith('Bearer ');
    server.calls.push({ path, method, headers, body: init.body });
    const forced = server.forced[path]?.shift();
    if (forced) return forced === 204 ? new Response(null, { status: 204 }) : json(forced, { detail: `forced ${forced}` });
    if (method === 'POST' && cookieSession && !bearer && headers.get('x-csrf-token') !== CSRF) {
      return json(403, { detail: 'CSRF token missing' });
    }
    const live = cookieSession && !server.revoked;
    if (path === '/auth/refresh') {
      if (!live) return json(401, { detail: 'Refresh token required' });
      server.accessExpired = false;
      return json(200, { access_token: 'new-access', refresh_token: 'new-refresh' });
    }
    // An expired access cookie beside a live refresh cookie: 401 until a refresh.
    if (server.accessExpired) return json(401, { detail: 'Token expired' });
    if (path === '/auth/me') return live ? json(200, USER) : json(401, { detail: 'Not authenticated' });
    if (path === '/auth/logout') {
      if (!live) return json(401, { detail: 'Not authenticated' });
      server.revoked = true;
      return new Response(null, { status: 204 });
    }
    return json(404, { detail: 'Not found' });
  }
  return server;
}

const cookieAuth = (extra = {}) => new AuthCore({
  mode: 'sso', useCookieAuth: true, apiBaseUrl: BASE, webAppUrl: 'https://app.test',
  endpoints: { refresh: '/auth/refresh', logout: '/auth/logout' }, ...extra,
});

function storedCredentialKeys() {
  return CREDENTIAL_KEYS.filter(key => localStorage.getItem(key) != null || sessionStorage.getItem(key) != null);
}

describe('logout revokes the server session', () => {
  let server;
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    document.cookie = `sm_csrf=${CSRF}; path=/`;
    server = fakeService();
    vi.stubGlobal('fetch', server.fetch);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    document.cookie = 'sm_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('posts the CSRF echo, and a reload with the old cookie gets 401 on /auth/me', async () => {
    const auth = cookieAuth();
    expect(await auth.bootstrapSession()).toBe(true);

    await auth.logout();

    const logout = server.calls.find(call => call.path === '/auth/logout');
    expect(logout.headers.get('x-csrf-token')).toBe(CSRF);
    expect(server.revoked).toBe(true);
    expect(auth.isAuthenticated()).toBe(false);

    // Reload: a fresh AuthCore, the same (old) cookie jar.
    server.calls.length = 0;
    const reloaded = cookieAuth();
    expect(await reloaded.bootstrapSession()).toBe(false);
    expect(server.calls.find(call => call.path === '/auth/me').status).toBe(401);
    expect(reloaded.isAuthenticated()).toBe(false);
  });

  it('a refused logout throws LogoutError and keeps the session visible', async () => {
    document.cookie = 'sm_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
    const auth = cookieAuth();
    await auth.bootstrapSession();

    const error = await auth.logout().catch(e => e);

    expect(error).toBeInstanceOf(LogoutError);
    expect(error.status).toBe(403);
    expect(server.revoked).toBe(false);
    expect(auth.isAuthenticated()).toBe(true);
  });

  it('an unreachable logout throws LogoutError with status 0', async () => {
    const auth = cookieAuth();
    await auth.bootstrapSession();
    server.fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const error = await auth.logout().catch(e => e);

    expect(error).toBeInstanceOf(LogoutError);
    expect(error.status).toBe(0);
    expect(auth.isAuthenticated()).toBe(true);
  });

  it('a 401 logout whose refresh is also 401 (session already ended) completes', async () => {
    const auth = cookieAuth();
    await auth.bootstrapSession();
    server.revoked = true;

    await expect(auth.logout()).resolves.toBeUndefined();
    expect(auth.isAuthenticated()).toBe(false);
  });

  it('a 401 logout with a live refresh cookie refreshes, retries and revokes', async () => {
    const auth = cookieAuth();
    await auth.bootstrapSession();
    server.accessExpired = true;

    await auth.logout();

    expect(server.calls.filter(call => call.path === '/auth/logout').map(call => call.status)).toEqual([401, 204]);
    expect(server.revoked).toBe(true);
    expect(auth.isAuthenticated()).toBe(false);
  });

  it('a second logout 401 after a successful refresh is a LogoutError, identity kept', async () => {
    const auth = cookieAuth();
    await auth.bootstrapSession();
    const states = [];
    auth.addListener(state => states.push(state.isAuthenticated));
    server.calls.length = 0;
    // The org-context case: refresh succeeds, the access check still answers 401.
    server.forced['/auth/logout'] = [401, 401];

    const error = await auth.logout().catch(e => e);

    expect(server.calls.map(call => `${call.path} ${call.status}`)).toEqual([
      '/auth/logout 401', '/auth/refresh 200', '/auth/logout 401',
    ]);
    expect(error).toBeInstanceOf(LogoutError);
    expect(error.status).toBe(401);
    expect(server.revoked).toBe(false);
    expect(auth.isAuthenticated()).toBe(true);
    expect(auth.getCurrentUser()).toEqual(USER);
    expect(states).not.toContain(false);
  });

  it('a refresh 403 during logout throws before any identity clear, and never probes /auth/me', async () => {
    const auth = cookieAuth();
    await auth.bootstrapSession();
    const states = [];
    auth.addListener(state => states.push(state.isAuthenticated));
    server.calls.length = 0;
    // Expired access cookie, live refresh cookie, CSRF mismatch on refresh: the probe
    // /auth/me (cookie only) would say 401 and clear identity if it ran.
    server.forced['/auth/logout'] = [401];
    server.forced['/auth/refresh'] = [403];
    server.forced['/auth/me'] = [401];

    const error = await auth.logout().catch(e => e);

    expect(server.calls.map(call => `${call.path} ${call.status}`)).toEqual([
      '/auth/logout 401', '/auth/refresh 403',
    ]);
    expect(error).toBeInstanceOf(LogoutError);
    expect(error.status).toBe(403);
    expect(auth.isAuthenticated()).toBe(true);
    expect(auth.getCurrentUser()).toEqual(USER);
    expect(states).not.toContain(false);
    // Outside a logout the same refused refresh still lets /auth/me decide.
    server.forced['/auth/refresh'] = [403];
    await auth.refreshToken().catch(() => {});
    await vi.waitFor(() => expect(auth.isAuthenticated()).toBe(false));
    expect(server.calls.map(call => call.path).slice(-2)).toEqual(['/auth/refresh', '/auth/me']);
  });

  it('without endpoints.logout only local auth is cleared (no request)', async () => {
    const auth = cookieAuth({ endpoints: { refresh: '/auth/refresh' } });
    await auth.bootstrapSession();
    server.calls.length = 0;

    await auth.logout();

    expect(server.calls).toEqual([]);
    expect(auth.isAuthenticated()).toBe(false);
  });
});

describe('cookie auth keeps credentials out of Web Storage', () => {
  let server;
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    document.cookie = `sm_csrf=${CSRF}; path=/`;
    server = fakeService();
    vi.stubGlobal('fetch', server.fetch);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    document.cookie = 'sm_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('a refresh sends the cookie only and never writes a token key to localStorage or sessionStorage', async () => {
    const auth = cookieAuth();
    auth.tokenManager.setRefreshToken('held-in-memory');

    await expect(auth.refreshToken()).resolves.toBe('new-access');

    // A body token would win over the refresh cookie server-side.
    expect(JSON.parse(server.calls.find(call => call.path === '/auth/refresh').body)).toEqual({});

    expect(storedCredentialKeys()).toEqual([]);
    expect(auth.tokenManager.getRefreshToken()).toBe('held-in-memory');
    expect(auth.getCurrentToken()).toBe('new-access');
  });

  it('legacy and current token keys left by an older build are cleared on load', () => {
    for (const key of CREDENTIAL_KEYS) {
      localStorage.setItem(key, `old-${key}`);
      sessionStorage.setItem(key, `old-${key}`);
    }
    localStorage.setItem('smart_memory_user', JSON.stringify(USER));

    const auth = cookieAuth();

    expect(storedCredentialKeys()).toEqual([]);
    expect(auth.getCurrentToken()).toBeNull();
    // Non-credential identity (user, workspace) keeps its storage.
    expect(auth.getCurrentUser()).toEqual(USER);
  });

  it('bearer mode (no cookie auth) still persists the refresh token', async () => {
    const auth = new AuthCore({ mode: 'custom', apiBaseUrl: BASE, endpoints: { refresh: '/auth/refresh' } });
    auth.tokenManager.setRefreshToken('body-refresh');
    server.fetch.mockResolvedValueOnce(json(200, { access_token: 'a2', refresh_token: 'r2' }));

    await auth.refreshToken();

    expect(localStorage.getItem('smart_memory_refresh_token')).toBe('r2');
    expect(localStorage.getItem('smart_memory_auth_token')).toBe('a2');
  });
});
