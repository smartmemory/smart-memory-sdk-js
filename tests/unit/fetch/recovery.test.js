import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthCore } from '../../../src/auth/AuthCore.js';
import { BaseAPI } from '../../../src/api/BaseAPI.js';
import { createAuthFetch } from '../../../src/fetch/authFetch.js';
import { installInterceptor } from '../../../src/fetch/interceptor.js';
import { SmartMemoryClient } from '../../../src/api/SmartMemoryClient.js';

let auth, transport;
const response = (status, data = {}) => new Response(JSON.stringify(data), { status });
beforeEach(() => {
  transport = vi.fn();
  vi.stubGlobal('fetch', transport);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  auth = new AuthCore({ mode: 'sso', storage: 'memory', apiBaseUrl: 'https://service.test' });
  auth.currentToken = 'expired';
  auth.tokenManager.setWorkspaceId('ws');
  document.cookie = 'sm_csrf=nonce; path=/';
});
afterEach(() => {
  document.cookie = 'sm_csrf=; Max-Age=0; path=/';
  vi.unstubAllGlobals(); vi.restoreAllMocks();
});
const paths = {
  json: () => new BaseAPI(auth).post('/memory/job', { job: 1 }),
  binary: () => new BaseAPI(auth).requestBinary('/memory/job', { method: 'POST', body: 'body' }),
  fetch: () => createAuthFetch(auth)('https://service.test/memory/job', { method: 'POST', body: 'body' }),
  interceptor: () => installInterceptor(auth)('https://service.test/memory/job', { method: 'POST', body: 'body' }),
};
describe.each(Object.entries(paths))('%s recovery', (_name, send) => {
  it('refreshes with CSRF through request options and retries with new token/body/workspace', async () => {
    const requestOptions = vi.spyOn(auth, 'getRequestOptions');
    transport.mockResolvedValueOnce(response(401))
      .mockResolvedValueOnce(response(200, { access_token: 'new' }))
      .mockResolvedValueOnce(response(200));
    await send();
    expect(transport).toHaveBeenCalledTimes(3);
    const refresh = transport.mock.calls[1];
    expect(refresh[0]).toBe('https://service.test/auth/refresh');
    expect(new Headers(refresh[1].headers).get('x-csrf-token')).toBe('nonce');
    expect(refresh[1].credentials).toBe('include');
    expect(requestOptions).toHaveBeenCalledWith(expect.objectContaining({ method: 'POST', body: '{}' }));
    const first = transport.mock.calls[0][1], retry = transport.mock.calls[2][1];
    expect(new Headers(first.headers).get('Authorization')).toBe('Bearer expired');
    expect(new Headers(retry.headers).get('Authorization')).toBe('Bearer new');
    expect(new Headers(retry.headers).get('X-Workspace-Id')).toBe('ws');
    expect(retry.body).toBe(first.body);
    expect(auth.connection.snapshot.status).toBe('connected');
  });
  it.each([429, 500, 503, 'network'])('preserves auth on transient refresh %s', async status => {
    transport.mockResolvedValueOnce(response(401));
    if (status === 'network') transport.mockRejectedValueOnce(new TypeError('offline'));
    else transport.mockResolvedValueOnce(response(status));
    await expect(send()).rejects.toMatchObject({ recoverable: true });
    expect(auth.currentToken).toBe('expired');
    expect(auth.tokenManager.getWorkspaceId()).toBe('ws');
    expect(auth.connection.snapshot.status).toBe('reconnecting');
    expect(transport).toHaveBeenCalledTimes(2);
    expect(console.warn).toHaveBeenCalled();
  });
  it.each([401, 403])('clears auth on refresh %s', async status => {
    transport.mockResolvedValueOnce(response(401)).mockResolvedValueOnce(response(status));
    await expect(send()).rejects.toThrow();
    expect(auth.currentToken).toBeNull();
    expect(auth.connection.snapshot.status).toBe('signed_out');
  });
  it('clears auth on second 401 without a third request', async () => {
    transport.mockResolvedValueOnce(response(401)).mockResolvedValueOnce(response(200, { access_token: 'new' }))
      .mockResolvedValueOnce(response(401));
    await send().catch(() => {});
    expect(transport).toHaveBeenCalledTimes(3);
    expect(auth.currentToken).toBeNull();
  });
  it('does not refresh or sign out on ordinary permission denial', async () => {
    transport.mockResolvedValueOnce(response(403));
    await send().catch(() => {});
    expect(transport).toHaveBeenCalledTimes(1);
    expect(auth.currentToken).toBe('expired');
  });
});
it('preserves Request body, Headers, CSRF and abort signal across retry', async () => {
  const controller = new AbortController();
  const bodies = [];
  transport.mockImplementation(async (input, init) => {
    if (typeof input === 'string') return response(200, { access_token: 'new' });
    bodies.push(await input.text());
    expect(input.method).toBe('POST');
    expect(new Headers(init.headers).get('x-extra')).toBe('value');
    expect(new Headers(init.headers).get('x-csrf-token')).toBe('nonce');
    return response(bodies.length === 1 ? 401 : 200);
  });
  await createAuthFetch(auth)(new Request('https://service.test/memory/job', {
    method: 'POST', body: 'payload', signal: controller.signal,
    headers: new Headers({ Authorization: 'stale', 'x-extra': 'value' }),
  }));
  expect(bodies).toEqual(['payload', 'payload']);
});
it('does not retry after cancellation during a shared refresh', async () => {
  const controller = new AbortController();
  transport.mockResolvedValueOnce(response(401)).mockImplementationOnce(async () => {
    controller.abort(); return response(200, { access_token: 'new' });
  });
  await expect(createAuthFetch(auth)('https://service.test/memory/job', { signal: controller.signal }))
    .rejects.toMatchObject({ name: 'AbortError' });
  expect(transport).toHaveBeenCalledTimes(2);
  expect(auth.currentToken).toBe('new');
});
it('shares concurrent refreshes across transports', async () => {
  let release;
  transport.mockImplementation(async (url, init) => {
    if (url.endsWith('/auth/refresh')) return new Promise(resolve => { release = resolve; });
    return response(new Headers(init.headers).get('Authorization') === 'Bearer expired' ? 401 : 200);
  });
  const pending = [paths.json(), paths.fetch(), paths.interceptor()];
  await vi.waitFor(() => expect(release).toBeTypeOf('function'));
  expect(transport.mock.calls.filter(([url]) => url.endsWith('/auth/refresh'))).toHaveLength(1);
  release(response(200, { access_token: 'new' }));
  await Promise.all(pending);
});
it('bypasses auth endpoints and untrusted origins without recovery', async () => {
  transport.mockResolvedValue(response(401));
  const fetch = createAuthFetch(auth);
  await fetch('https://service.test/auth/refresh');
  await fetch('https://evil.test/memory/job');
  expect(transport).toHaveBeenCalledTimes(2);
  for (const [, options] of transport.mock.calls) expect(options.headers).toBeUndefined();
});
it('never restores a session cleared while refresh was pending', async () => {
  let release;
  transport.mockImplementation(() => new Promise(resolve => { release = resolve; }));
  const pending = auth.refreshToken();
  auth.clearLocalAuth();
  release(response(200, { access_token: 'obsolete' }));
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  expect(auth.currentToken).toBeNull();
});
it('exposes one observable and retains failures until the affected source recovers', () => {
  const client = new SmartMemoryClient({ mode: 'sso', storage: 'memory', apiBaseUrl: '' });
  expect(client.connection).toBe(client.auth.connection);
  const listener = vi.fn();
  const unsubscribe = client.connection.subscribe(listener);
  client.connection.report('/one', 'offline');
  client.connection.report('/two', null);
  expect(client.connection.snapshot).toEqual({ status: 'reconnecting', reason: 'offline' });
  client.connection.report('/one', null);
  expect(client.connection.snapshot.status).toBe('connected');
  unsubscribe();
  const count = listener.mock.calls.length;
  client.connection.signedOut();
  expect(listener).toHaveBeenCalledTimes(count);
});
it('does not replay a mutation on a network error', async () => {
  transport.mockRejectedValueOnce(new Error('network down'));
  await expect(paths.fetch()).rejects.toThrow('network down');
  expect(transport).toHaveBeenCalledOnce();
  expect(auth.currentToken).toBe('expired');
});
it('does not replay an unauthorized mutation into a changed workspace', async () => {
  transport.mockImplementationOnce(async () => {
    auth.tokenManager.setWorkspaceId('other');
    return response(401);
  });
  await expect(paths.fetch()).rejects.toMatchObject({ name: 'AbortError' });
  expect(transport).toHaveBeenCalledOnce();
});
it('recovers cookie-only sessions and replaces captured Authorization after refresh', async () => {
  auth.currentToken = null;
  transport.mockResolvedValueOnce(response(401)).mockResolvedValueOnce(response(200, { access_token: 'cookie-new' }))
    .mockResolvedValueOnce(response(200));
  await createAuthFetch(auth)('https://service.test/memory/list', { headers: { authorization: 'Bearer captured' } });
  expect(new Headers(transport.mock.calls[0][1].headers).has('authorization')).toBe(false);
  expect(new Headers(transport.mock.calls[2][1].headers).get('authorization')).toBe('Bearer cookie-new');
});
it('replaces differently cased captured workspace and CSRF headers without duplicates', async () => {
  transport.mockResolvedValueOnce(response(200));
  await createAuthFetch(auth)('https://service.test/memory/job', {
    method: 'POST', headers: new Headers({ 'x-workspace-id': 'stale', 'X-CSRF-Token': 'stale' }),
  });
  const headers = new Headers(transport.mock.calls[0][1].headers);
  expect(headers.get('x-workspace-id')).toBe('ws');
  expect(headers.get('x-csrf-token')).toBe('nonce');
});
