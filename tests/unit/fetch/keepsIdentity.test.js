import { afterEach, expect, it, vi } from 'vitest';
import { AuthCore } from '../../../src/auth/AuthCore.js';
import { BaseAPI } from '../../../src/api/BaseAPI.js';
import { createAuthFetch } from '../../../src/fetch/authFetch.js';

// SDK-JS-401-KEEPS-IDENTITY-1: a rejected call clears identity unless the server
// confirms the SAME user in the SAME tenant (refresh refused, then /auth/me).
// Each row runs through both BaseAPI and createAuthFetch with a fresh AuthCore.
const BASE = 'https://service.test';
const ME = { id: 'u1', tenant_id: 't1', roles: ['admin'] };
const reply = (status, data = {}) => new Response(JSON.stringify(data), { status });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const tick = (ms = 0) => new Promise(r => setTimeout(r, ms));

// Route-based transport: per-route reply queues. A reply is a status, 'network',
// 'refresh' (200 with a token), { status, body }, or a deferred (held response).
function harness({ user = ME, tenant = 't1', workspace = 'ws-pick', token = 'expired', routes }) {
  const auth = new AuthCore({ mode: 'sso', storage: 'memory', apiBaseUrl: BASE, sessionCheckTimeoutMs: 40 });
  auth.currentToken = token;
  auth.currentUser = user;
  auth.tokenManager.setUser(user);
  auth.tokenManager.setRefreshToken('refresh-A');
  if (tenant) auth.tokenManager.setTenantId(tenant);
  if (workspace) auth.tokenManager.setWorkspaceId(workspace);
  const states = [];
  auth.addListener(state => states.push(state.isAuthenticated));
  const calls = { api: 0, refresh: 0, me: 0 };
  const transport = vi.fn(async url => {
    const route = String(url).endsWith('/auth/me') ? 'me' : String(url).endsWith('/auth/refresh') ? 'refresh' : 'api';
    calls[route]++;
    const next = routes[route].length > 1 ? routes[route].shift() : routes[route][0];
    if (next === 'network') throw new TypeError('offline');
    if (next === 'refresh') return reply(200, { access_token: `fresh-${calls.refresh}` });
    if (next?.promise) return next.promise;
    if (typeof next === 'object') return reply(next.status, next.body);
    return reply(next, route === 'me' && next === 200 ? ME : {});
  });
  vi.stubGlobal('fetch', transport);
  return { auth, states, calls };
}
const VIAS = {
  json: (auth, init) => new BaseAPI(auth).get('/memory/job', init),
  fetch: (auth, init) => createAuthFetch(auth)(`${BASE}/memory/job`, init),
};

function expectKept(h, { workspace = 'ws-pick' } = {}) {
  expect(h.auth.getCurrentUser()).toEqual(ME);
  expect(h.auth.isAuthenticated()).toBe(true);
  // One identified -> anonymous flip is what reloads the studio twice.
  expect(h.states).not.toContain(false);
  expect(h.auth.connection.snapshot.status).not.toBe('signed_out');
  expect(h.auth.tokenManager.getWorkspaceId()).toBe(workspace);
}
function expectCleared(h) {
  expect(h.auth.getCurrentUser()).toBeNull();
  expect(h.auth.tokenManager.getUser()).toBeNull();
  expect(h.auth.isAuthenticated()).toBe(false);
  expect(h.auth.hasRole('admin')).toBe(false);
  expect(h.auth.getTenantId()).toBeNull();
  expect(h.auth.tokenManager.getWorkspaceId()).toBeNull();
  expect(h.auth.tokenManager.getRefreshToken()).toBeNull();
  expect(h.auth.connection.snapshot.status).toBe('signed_out');
}
const simple = (routes, kept, opts = {}) => async via => {
  const h = harness({ ...opts, routes });
  await VIAS[via](h.auth).catch(() => {});
  expect(h.calls.me).toBe(1);
  if (kept) expectKept(h, opts); else expectCleared(h);
};
const meBody = (body, status = 200) => [{ status, body }];

const rows = [
  { name: 'refresh 401, me 200 same user+tenant (valid cookie)', run: simple({ api: [401], refresh: [401], me: [200] }, true) },
  { name: 'refresh 403, me 200 same user+tenant', run: simple({ api: [401], refresh: [403], me: [200] }, true) },
  { name: 'refresh 401, me 503 (not definitive)', run: simple({ api: [401], refresh: [401], me: [503] }, true) },
  { name: 'refresh 401, me network error', run: simple({ api: [401], refresh: [401], me: ['network'] }, true) },
  { name: 'refresh ok, retry 401, me 200 same user', run: simple({ api: [401, 401], refresh: ['refresh'], me: [200] }, true) },
  { name: 'refresh 401, me 401', run: simple({ api: [401], refresh: [401], me: [401] }, false) },
  { name: 'refresh 403, me 403', run: simple({ api: [401], refresh: [403], me: [403] }, false) },
  { name: 'refresh ok, retry 401, me 401', run: simple({ api: [401, 401], refresh: ['refresh'], me: [401] }, false) },
  // H1: a valid cookie for someone else must not inherit the cached identity.
  { name: 'H1 me 200 different user', run: simple({ api: [401], refresh: [401], me: meBody({ id: 'u2', tenant_id: 't1' }) }, false) },
  { name: 'H1 me 200 same user, different tenant than cached user', run: simple({ api: [401], refresh: [401], me: meBody({ id: 'u1', tenant_id: 't2' }) }, false) },
  { name: 'H1 me 200 same user, different tenant than active tenant',
    run: simple({ api: [401], refresh: [401], me: meBody({ id: 'u1', tenant_id: 't2' }) }, false, { user: { id: 'u1', roles: ['admin'] } }) },
  { name: 'H1 me 200 without an id cannot be bound', run: simple({ api: [401], refresh: [401], me: meBody({ tenant_id: 't1' }) }, false) },
  { name: 'H1 user-picked workspace differs from server default: kept',
    run: simple({ api: [401], refresh: [401], me: meBody({ ...ME, default_team_id: 'ws-default' }) }, true) },
  // M3: documented permanent identity loss vs an unrelated 404.
  { name: 'M3 me 404 User not found', run: simple({ api: [401], refresh: [401], me: meBody({ detail: 'User not found' }, 404) }, false) },
  { name: 'M3 me 404 Tenant not found', run: simple({ api: [401], refresh: [401], me: meBody({ detail: 'Tenant not found' }, 404) }, false) },
  { name: 'M3 me 404 Default team not found', run: simple({ api: [401], refresh: [401], me: meBody({ detail: 'Default team not found' }, 404) }, false) },
  { name: 'M3 me 404 unrelated (missing route) keeps identity', run: simple({ api: [401], refresh: [401], me: meBody({ detail: 'Not Found' }, 404) }, true) },
  // Probe: H1 full exchange, then the next request carries neither A's bearer nor A's workspace.
  { name: 'probe H1: after mismatch, next request has no bearer or old workspace', run: async via => {
    const h = harness({ routes: { api: [401, 200], refresh: [401], me: meBody({ id: 'u2', tenant_id: 't2' }) } });
    await VIAS[via](h.auth).catch(() => {});
    expectCleared(h);
    await VIAS[via](h.auth).catch(() => {});
    const last = new Headers(vi.mocked(fetch).mock.calls.at(-1)[1].headers);
    expect(last.get('Authorization')).toBeNull();
    expect(last.get('X-Workspace-Id')).toBeNull();
  } },
  // M1: a held /auth/me is bounded, an aborted caller stops waiting, and recovery works afterwards.
  { name: 'probe M1: held me, caller abort, later recovery', run: async via => {
    const held = deferred();
    const h = harness({ routes: { api: [401, 401, 200], refresh: [401, 'refresh'], me: [held] } });
    const controller = new AbortController();
    const first = VIAS[via](h.auth, { signal: controller.signal }).then(() => 'resolved', e => e.name);
    await tick(5);
    expect(h.calls.me).toBe(1);
    expect(vi.mocked(fetch).mock.calls.find(([u]) => String(u).endsWith('/auth/me'))[1].signal).toBeInstanceOf(AbortSignal);
    controller.abort();
    expect(await Promise.race([first, tick(20).then(() => 'still pending')])).toBe('AbortError');
    await tick(60); // past the 40 ms session-check deadline
    expectKept(h);
    const second = await VIAS[via](h.auth).then(r => (r.status ?? 200), e => e.name);
    expect(second).toBe(200);
    expect(h.calls.refresh).toBe(2);
    held.resolve(reply(503));
  } },
  // M2: a late probe result never touches a session renewed meanwhile.
  ...[401, 200].map(late => ({ name: `probe M2: delayed me ${late} after a successful refresh`, run: async via => {
    const held = deferred();
    const h = harness({ routes: { api: [401, 401], refresh: ['refresh', 'refresh'], me: [held] } });
    const first = VIAS[via](h.auth).catch(() => {});
    await tick(5);
    expect(h.calls.me).toBe(1);
    expect(await h.auth.refreshToken()).toBe('fresh-2');
    held.resolve(reply(late, late === 200 ? ME : {}));
    await first;
    expect(h.auth.getCurrentToken()).toBe('fresh-2');
    expectKept(h);
  } })),
  // Concurrency: six simultaneous 401s share one refresh and one probe.
  { name: 'probe concurrency: six 401s, one refresh, one probe', run: async via => {
    const h = harness({ routes: { api: [401], refresh: [401], me: [200] } });
    await Promise.all(Array.from({ length: 6 }, () => VIAS[via](h.auth).catch(() => {})));
    expect(h.calls.refresh).toBe(1);
    expect(h.calls.me).toBe(1);
    expectKept(h);
  } },
  // Logout + replacement identity during a pending probe: the late 401 is ignored.
  { name: 'probe logout: replacement identity survives a late 401', run: async via => {
    const held = deferred();
    const h = harness({ routes: { api: [401], refresh: [401], me: [held] } });
    const first = VIAS[via](h.auth).catch(() => {});
    await tick(5);
    await h.auth.logout();
    h.auth.currentUser = { id: 'u3' };
    h.auth.currentToken = 'replacement';
    held.resolve(reply(401));
    await first;
    expect(h.auth.getCurrentUser()).toEqual({ id: 'u3' });
    expect(h.auth.getCurrentToken()).toBe('replacement');
  } },
];

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it.each(rows)('$name', async ({ run }) => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  for (const via of Object.keys(VIAS)) {
    await run(via);
    vi.unstubAllGlobals();
  }
});
