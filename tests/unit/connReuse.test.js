/**
 * CLIENT-CONN-REUSE-1: no SDK request path may defeat HTTP connection reuse.
 *
 * Node's global fetch (undici) and the browser both pool connections per origin, so the SDK
 * keeps reuse by never doing three things on a request: sending `Connection: close` (or any
 * `Connection` header), passing a per-call `dispatcher`/`agent`/`keepalive: false`, or sending
 * the request to a host other than the configured `apiBaseUrl`. One table row per call-site
 * class asserts that on the `(url, init)` pair each class hands to `fetch`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('@microsoft/fetch-event-source', () => ({
  fetchEventSource: vi.fn(() => new Promise(() => {})),
}));

import { fetchEventSource } from '@microsoft/fetch-event-source';
import { AuthCore } from '../../src/auth/AuthCore.js';
import { BaseAPI } from '../../src/api/BaseAPI.js';
import { RefreshManager } from '../../src/auth/RefreshManager.js';
import { exchangeClerkSession } from '../../src/auth/clerkWeb.js';
import { createAuthFetch } from '../../src/fetch/authFetch.js';
import { subscribeProgress } from '../../src/progress.ts';

const BASE = 'https://api.example.test';
const ORIGIN = new URL(BASE).origin;

/** Minimal Response stand-in: enough for every call site below to run to completion. */
function okResponse(body = {}) {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'application/json', 'x-sm-access-token': 'tok', 'x-sm-workspace-id': 'ws' }),
    json: async () => body,
    text: async () => JSON.stringify(body),
    arrayBuffer: async () => new ArrayBuffer(0),
  };
}

function recorder() {
  const calls = [];
  const fn = vi.fn(async (input, init = {}) => {
    calls.push({ url: String(input), init });
    return okResponse({ access_token: 'new-access', id: 'u1' });
  });
  return { calls, fn };
}

const headerNames = init => Object.keys(init.headers instanceof Headers ? Object.fromEntries(init.headers) : init.headers || {})
  .map(name => name.toLowerCase());

const FORBIDDEN_INIT_KEYS = ['dispatcher', 'agent', 'connection'];

function assertReusable(calls, expectedCount) {
  expect(calls).toHaveLength(expectedCount);
  for (const { url, init } of calls) {
    expect(new URL(url).origin).toBe(ORIGIN);
    expect(headerNames(init)).not.toContain('connection');
    for (const key of FORBIDDEN_INIT_KEYS) expect(init).not.toHaveProperty(key);
    expect(init.keepalive).not.toBe(false);
  }
}

function customAuth(extra = {}) {
  return new AuthCore({ mode: 'custom', apiBaseUrl: BASE, endpoints: { refresh: '/auth/refresh', logout: '/auth/logout' }, storage: 'memory', ...extra });
}

// One row per call-site class. `run` performs the request(s) against a recording fetch and
// returns the recorded calls; `expected` is how many requests that class must make.
const CALL_SITES = [
  ['BaseAPI.request GET', 1, async ({ fn }) => { await new BaseAPI(customAuth(), { fetchFn: fn }).get('/memory/list'); }],
  ['BaseAPI.request POST', 1, async ({ fn }) => { await new BaseAPI(customAuth(), { fetchFn: fn }).post('/memory/add', { content: 'x', idempotency_key: 'sm2_3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b' }); }],
  ['BaseAPI.requestBinary', 1, async ({ fn }) => { await new BaseAPI(customAuth(), { fetchFn: fn }).requestBinary('/memory/okf/export'); }],
  ['BaseAPI.postForm', 1, async ({ fn }) => { await new BaseAPI(customAuth(), { fetchFn: fn }).postForm('/memory/ingest/document', new FormData()); }],
  ['AuthCore.logout', 1, async ({ fn }) => { vi.stubGlobal('fetch', fn); await customAuth().logout(); }],
  ['AuthCore.bootstrapSession', 1, async ({ fn }) => { vi.stubGlobal('fetch', fn); await customAuth({ useCookieAuth: true }).bootstrapSession(); }],
  ['RefreshManager.refresh (injected fetchFn)', 1, async ({ fn }) => {
    const manager = new RefreshManager({
      apiBaseUrl: BASE, refreshEndpoint: '/auth/refresh', useCookieAuth: true, fetchFn: fn,
      tokenManager: { getRefreshToken: () => null, setAccessToken() {}, setRefreshToken() {} },
      onTokenRefreshed() {}, onRefreshFailed() {},
    });
    await manager.refresh();
  }],
  ['RefreshManager.refresh (global fetch)', 1, async ({ fn }) => { vi.stubGlobal('fetch', fn); await customAuth({ useCookieAuth: true }).refreshToken(); }],
  ['exchangeClerkSession', 1, async ({ fn }) => { vi.stubGlobal('fetch', fn); await exchangeClerkSession({ apiBaseUrl: BASE, getToken: async () => 'clerk-token' }); }],
  ['createAuthFetch (trusted API URL)', 1, async ({ fn }) => { await createAuthFetch(customAuth(), { fetchFn: fn })(`${BASE}/memory/list`); }],
];

describe('SDK request paths keep connections reusable', () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it.each(CALL_SITES)('%s', async (_name, expected, run) => {
    const rec = recorder();
    await run(rec);
    assertReusable(rec.calls, expected);
  });

  it('subscribeProgress (fetchEventSource) sends to the configured origin with no connection override', () => {
    fetchEventSource.mockClear();
    const handle = subscribeProgress({ baseUrl: BASE, apiKey: 'k', workspaceId: 'ws-1', onEvent() {}, onError() {} });
    try {
      expect(fetchEventSource).toHaveBeenCalledOnce();
      const [url, opts] = fetchEventSource.mock.calls[0];
      expect(new URL(url).origin).toBe(ORIGIN);
      expect(headerNames(opts)).not.toContain('connection');
      for (const key of FORBIDDEN_INIT_KEYS) expect(opts).not.toHaveProperty(key);
      expect(opts.keepalive).not.toBe(false);
    } finally { handle.close(); }
  });

  it('a second BaseAPI built for the same base URL reaches the same origin through the same fetch (no per-object transport)', async () => {
    const rec = recorder();
    await new BaseAPI(customAuth(), { fetchFn: rec.fn }).get('/health');
    await new BaseAPI(customAuth(), { fetchFn: rec.fn }).get('/health');
    assertReusable(rec.calls, 2);
  });
});

describe('src/ never builds a connection override', () => {
  const FORBIDDEN_SOURCE = [
    ['new Agent(', /new\s+\w*Agent\s*\(/],
    ['dispatcher', /dispatcher/i],
    ['Connection header string', /['"`]connection['"`]\s*:|['"`]connection['"`]\s*,\s*['"`]close/i],
    ['keepalive: false', /keepalive\s*:\s*false/i],
    ['Connection: close', /connection\s*:\s*close/i],
  ];

  function sourceFiles(dir) {
    return readdirSync(dir).flatMap(name => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return sourceFiles(path);
      return /\.(js|jsx|ts|tsx)$/.test(name) ? [path] : [];
    });
  }

  it.each(FORBIDDEN_SOURCE)('no %s under src/', (_label, pattern) => {
    const offenders = sourceFiles(join(process.cwd(), 'src'))
      .filter(path => pattern.test(readFileSync(path, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
