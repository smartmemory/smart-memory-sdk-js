import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthCore } from '../../../src/auth/AuthCore.js';
import { BaseAPI } from '../../../src/api/BaseAPI.js';
import { createAuthFetch } from '../../../src/fetch/authFetch.js';

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return { ok, status, json: () => Promise.resolve(body) };
}

// A function-valued apiBaseUrl lets apps whose base is resolved at runtime
// (e.g. admin's app-config apiBase, set after module load) keep refresh,
// trust checks and API calls on the live value instead of freezing the base
// that happened to be current at construction time.
describe('AuthCore function-valued apiBaseUrl', () => {
  let base;
  let auth;

  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    base = 'https://one.example.test';
    auth = new AuthCore({
      mode: 'custom',
      useCookieAuth: true,
      apiBaseUrl: () => base,
      endpoints: { refresh: '/auth/refresh' },
      storage: 'memory',
    });
  });

  it('resolves the function on every access', () => {
    expect(auth.apiBaseUrl).toBe('https://one.example.test');
    base = 'https://two.example.test';
    expect(auth.apiBaseUrl).toBe('https://two.example.test');
  });

  it('routes refresh through the base current at refresh time', async () => {
    const calls = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      calls.push(String(url));
      return Promise.resolve(jsonResponse({ access_token: 'fresh-token' }));
    });

    base = 'https://two.example.test';
    await auth.refreshToken();

    expect(calls).toEqual(['https://two.example.test/auth/refresh']);
    expect(auth.getCurrentToken()).toBe('fresh-token');
  });

  it('trusts the resolved base for authFetch requests and injects credentials', async () => {
    base = 'https://two.example.test';
    auth.currentToken = 'tok';
    const transport = vi.fn().mockResolvedValue(jsonResponse({}));
    const apiFetch = createAuthFetch(auth, { fetchFn: transport });

    await apiFetch('https://two.example.test/memory/list');

    const [, init] = transport.mock.calls[0];
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(init.credentials).toBe('include');
  });

  it('no longer injects credentials for a base that is no longer current', async () => {
    base = 'https://two.example.test';
    auth.currentToken = 'tok';
    const transport = vi.fn().mockResolvedValue(jsonResponse({}));
    const apiFetch = createAuthFetch(auth, { fetchFn: transport });

    // The previous base is untrusted now: raw transport, no injected headers.
    await apiFetch('https://one.example.test/memory/list');

    const [, init] = transport.mock.calls[0];
    expect(init?.headers?.Authorization).toBeUndefined();
  });

  it('resolves the function per request through BaseAPI', async () => {
    const calls = [];
    const transport = vi.fn().mockImplementation((url) => {
      calls.push(String(url));
      return Promise.resolve(jsonResponse({ ok: true }));
    });
    const api = new BaseAPI(auth, { fetchFn: transport });

    await api.get('/memory/list');
    base = 'https://two.example.test';
    await api.get('/memory/list');

    expect(calls).toEqual([
      'https://one.example.test/memory/list',
      'https://two.example.test/memory/list',
    ]);
  });
});
