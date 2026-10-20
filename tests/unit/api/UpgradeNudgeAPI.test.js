import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SmartMemoryClient } from '../../../src/api/SmartMemoryClient.js';
import { APIError } from '../../../src/errors/APIError.js';
import * as sdk from '../../../src/index.js';

// UPGRADE-NUDGES-9. Real SmartMemoryClient -> BaseAPI, only fetch is faked. Routes, query and
// bodies are the `endpoint` section of smart-memory-docs
// docs/features/UPGRADE-NUDGES-1/upgrade-nudges-contract.json (service 11c04b30).

const BASE = 'http://localhost:9001';
const NUDGE = {
  nudge_key: 'banner-sso',
  kind: 'banner',
  surface: 'web',
  target_tier: 'enterprise',
  audience: 'billing_manager',
  anchor: 'cap-sso',
  copy: 'Your organization has 5 members.',
  actions: { compare: 'Compare plans', dismiss: 'Not now' }
};

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body))
  };
}

describe('client.upgradeNudges', () => {
  let client;
  let fetchFn;

  const respondWith = (status, body) => fetchFn.mockResolvedValue(jsonResponse(status, body));
  const lastCall = () => {
    const [url, init] = fetchFn.mock.calls.at(-1);
    return { url, method: init.method, body: init.body, signal: init.signal };
  };

  beforeEach(() => {
    fetchFn = vi.fn();
    client = new SmartMemoryClient({
      mode: 'sso',
      apiBaseUrl: BASE,
      webAppUrl: 'http://localhost:5173',
      endpoints: { refresh: '/auth/refresh' },
      storage: 'memory',
      fetchFn
    });
    client.auth.currentToken = 'test-token';
  });

  it('is registered as client.upgradeNudges and exported', () => {
    expect(client.upgradeNudges).toBeInstanceOf(sdk.UpgradeNudgeAPI);
  });

  // One row per route and parameter shape. Record routes send no body.
  const requestRows = [
    ['next_default_surface', c => c.upgradeNudges.next(), 'GET', '/upgrade-nudges/next?surface=web', { nudge: NUDGE }],
    ['next_explicit_surface', c => c.upgradeNudges.next({ surface: 'web' }), 'GET',
      '/upgrade-nudges/next?surface=web', { nudge: NUDGE }],
    ['next_null_nudge_untouched', c => c.upgradeNudges.next(), 'GET', '/upgrade-nudges/next?surface=web', { nudge: null }],
    ['shown', c => c.upgradeNudges.shown('banner-sso'), 'POST', '/upgrade-nudges/banner-sso/shown', { recorded: true }],
    ['clicked', c => c.upgradeNudges.clicked('banner-sso'), 'POST', '/upgrade-nudges/banner-sso/clicked',
      { recorded: true }],
    ['dismissed', c => c.upgradeNudges.dismissed('banner-sso'), 'POST', '/upgrade-nudges/banner-sso/dismissed',
      { recorded: true }],
    ['shown_not_recorded_is_a_200', c => c.upgradeNudges.shown('banner-sso'), 'POST',
      '/upgrade-nudges/banner-sso/shown', { recorded: false }],
    ['key_is_url_encoded', c => c.upgradeNudges.clicked('a/b c'), 'POST', '/upgrade-nudges/a%2Fb%20c/clicked',
      { recorded: true }]
  ];

  it.each(requestRows)('%s: sends the contract request and returns the body untouched',
    async (_id, call, method, path, response) => {
      respondWith(200, response);
      await expect(call(client)).resolves.toEqual(response);
      const sent = lastCall();
      expect(sent.method).toBe(method);
      expect(sent.url).toBe(`${BASE}${path}`);
      expect(sent.body).toBeUndefined();
    });

  it('forwards an AbortSignal to fetch on every method', async () => {
    const signal = new AbortController().signal;
    respondWith(200, {});
    await client.upgradeNudges.next({ signal });
    expect(lastCall().signal).toBe(signal);
    await client.upgradeNudges.shown('k', { signal });
    expect(lastCall().signal).toBe(signal);
    await client.upgradeNudges.clicked('k', { signal });
    expect(lastCall().signal).toBe(signal);
    await client.upgradeNudges.dismissed('k', { signal });
    expect(lastCall().signal).toBe(signal);
  });

  it.each([['shown'], ['clicked'], ['dismissed']])('%s throws before any request on a missing or empty key', async method => {
    for (const bad of [undefined, null, '', 7]) {
      await expect(client.upgradeNudges[method](bad)).rejects.toThrow(TypeError);
    }
    expect(fetchFn).not.toHaveBeenCalled();
  });

  // One row per status the contract lists (404 unknown_nudge_key, 422 validation_error) plus 500.
  const errorRows = [
    ['next', 422, { detail: { code: 'validation_error', message: "surface is required and must be 'web'" } },
      c => c.upgradeNudges.next({ surface: 'studio' })],
    ['shown', 404, { detail: { code: 'unknown_nudge_key', message: 'Unknown nudge key' } },
      c => c.upgradeNudges.shown('nope')],
    ['clicked', 404, { detail: { code: 'unknown_nudge_key', message: 'Unknown nudge key' } },
      c => c.upgradeNudges.clicked('nope')],
    ['dismissed', 404, { detail: { code: 'unknown_nudge_key', message: 'Unknown nudge key' } },
      c => c.upgradeNudges.dismissed('nope')],
    ['next', 500, { detail: 'boom' }, c => c.upgradeNudges.next()],
    ['shown', 500, { detail: 'boom' }, c => c.upgradeNudges.shown('k')]
  ];

  it.each(errorRows.map(r => [r[0], r[1], r[2], r[3]]))('%s on HTTP %i rejects with an APIError',
    async (_method, status, body, call) => {
      respondWith(status, body);
      const err = await call(client).catch(e => e);
      expect(err).toBeInstanceOf(APIError);
      expect(err.status).toBe(status);
      expect(err.detail).toEqual(body);
    });

  it('sends the surface it is given and leaves the 422 to the server', async () => {
    respondWith(422, { detail: { code: 'validation_error' } });
    await client.upgradeNudges.next({ surface: 'studio' }).catch(() => {});
    expect(lastCall().url).toBe(`${BASE}/upgrade-nudges/next?surface=studio`);
  });

  it('lets a network failure through as the base APIError', async () => {
    fetchFn.mockRejectedValue(new Error('offline'));
    const err = await client.upgradeNudges.next().catch(e => e);
    expect(err).toBeInstanceOf(APIError);
    expect(err.status).toBe(0);
  });
});
