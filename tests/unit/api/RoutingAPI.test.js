import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SmartMemoryClient } from '../../../src/api/SmartMemoryClient.js';
import { APIError } from '../../../src/errors/APIError.js';
import { RoutingPrefsConflictError, routingErrorCode } from '../../../src/errors/RoutingErrors.js';
import { routingEcho } from '../../../src/api/RoutingAPI.js';
import * as sdk from '../../../src/index.js';

// WS-ROUTING-2b. Real SmartMemoryClient -> BaseAPI, only fetch is faked (no live calls).
// Wire shapes: smart-memory-ops/units/WS-ROUTING-2/report.md and
// smart-memory-docs docs/features/WS-ROUTING-1/ws-routing-contract.json.

const BASE = 'http://localhost:9001';
const PREFS = { account_default_workspace_id: 'ws_1', version: 3, updated_at: 't' };
const EMPTY_PREFS = { account_default_workspace_id: null, version: 0, updated_at: null };
const ECHO = {
  workspace_id: 'ws_1',
  workspace_name: 'Personal',
  routed_by: 'call',
  notices: [{ code: 'x', lever: 'call', detail: 'y' }]
};
const EXPLAIN = {
  user_id: 'u1', workspace_id: 'ws_1', workspace_name: 'Personal', routed_by: 'account_default',
  notices: [], refusal: null,
  candidates: [{ lever: 'context', workspace_id: null, status: 'inaccessible', workspace_name: null }],
  flags: { personal_floor: false, cookie_display_only: true }
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

describe('workspace routing (WS-ROUTING-2b)', () => {
  let client;
  let fetchFn;

  const respondWith = (status, body) => fetchFn.mockResolvedValue(jsonResponse(status, body));
  const lastCall = () => {
    const [url, init] = fetchFn.mock.calls.at(-1);
    return {
      url,
      method: init.method,
      headers: init.headers,
      body: init.body === undefined ? undefined : JSON.parse(init.body)
    };
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

  it('is registered as client.routing and exported', () => {
    expect(client.routing).toBeInstanceOf(sdk.RoutingAPI);
    expect(sdk.RoutingPrefsConflictError).toBe(RoutingPrefsConflictError);
    expect(sdk.routingEcho).toBe(routingEcho);
    expect(sdk.routingErrorCode).toBe(routingErrorCode);
  });

  describe('getRoutingPrefs', () => {
    it('GETs the prefs and hands back a no-row body untouched', async () => {
      respondWith(200, EMPTY_PREFS);
      expect(await client.getRoutingPrefs()).toEqual(EMPTY_PREFS);
      expect(lastCall()).toMatchObject({ url: `${BASE}/memory/routing/prefs`, method: 'GET' });
    });
  });

  describe('setRoutingPrefs', () => {
    // One row per body shape: set, clear (null), first write (version 0).
    it.each([
      ['set', 'ws_1', 2],
      ['clear', null, 5],
      ['first write', 'ws_2', 0]
    ])('PUTs the CAS body: %s', async (_name, workspaceId, version) => {
      respondWith(200, PREFS);
      expect(await client.setRoutingPrefs(workspaceId, version)).toEqual(PREFS);
      expect(lastCall()).toMatchObject({
        url: `${BASE}/memory/routing/prefs`,
        method: 'PUT',
        body: { account_default_workspace_id: workspaceId, version }
      });
    });

    it.each([[-1], [1.5], ['1'], [null], [undefined]])('rejects version %s before any request', async (bad) => {
      await expect(client.setRoutingPrefs('ws_1', bad)).rejects.toThrow(TypeError);
      expect(fetchFn).not.toHaveBeenCalled();
    });

    it('a lost CAS is a typed, catchable conflict; re-read and retry works', async () => {
      fetchFn
        .mockResolvedValueOnce(jsonResponse(409, { detail: { error: 'routing_prefs_version_conflict' } }))
        .mockResolvedValueOnce(jsonResponse(200, PREFS))
        .mockResolvedValueOnce(jsonResponse(200, PREFS));
      let out;
      try {
        await client.setRoutingPrefs('ws_1', 1);
      } catch (e) {
        expect(e).toBeInstanceOf(RoutingPrefsConflictError);
        expect(e).toBeInstanceOf(APIError); // old catch clauses still catch it
        expect(e.status).toBe(409);
        expect(e.errorCode).toBe('routing_prefs_version_conflict');
        const fresh = await client.getRoutingPrefs();
        out = await client.setRoutingPrefs('ws_1', fresh.version);
      }
      expect(out).toEqual(PREFS);
      expect(lastCall().body.version).toBe(3);
    });

    // One row per documented error shape: status, body, expected code.
    it.each([
      [403, { detail: { error: 'routing_prefs_human_only' } }, 'routing_prefs_human_only'],
      [409, { detail: { error: 'client_bound_to_workspace' } }, 'client_bound_to_workspace'],
      [403, { detail: 'insufficient_team_permissions' }, 'insufficient_team_permissions'],
      [409, { detail: { error: 'workspace_locked' } }, 'workspace_locked'],
      [422, { detail: [{ loc: ['body', 'rules'], msg: 'extra' }] }, null]
    ])('%i keeps its APIError and surfaces the code %j', async (status, body, code) => {
      respondWith(status, body);
      const err = await client.setRoutingPrefs('ws_1', 1).catch((e) => e);
      expect(err).toBeInstanceOf(APIError);
      expect(err).not.toBeInstanceOf(RoutingPrefsConflictError);
      expect(err.status).toBe(status);
      expect(err.errorCode).toBe(code);
      expect(err.detail).toEqual(body);
    });

    it('a network failure passes through without an errorCode', async () => {
      fetchFn.mockRejectedValue(new Error('boom'));
      const err = await client.setRoutingPrefs('ws_1', 1).catch((e) => e);
      expect(err).toBeInstanceOf(APIError);
      expect(err.status).toBe(0);
    });
  });

  describe('explainRouting', () => {
    it('sends no query without options', async () => {
      respondWith(200, EXPLAIN);
      expect(await client.explainRouting()).toEqual(EXPLAIN);
      expect(lastCall()).toMatchObject({ url: `${BASE}/memory/routing/explain`, method: 'GET' });
    });

    it('sends every option on the query', async () => {
      respondWith(200, EXPLAIN);
      await client.explainRouting({ clientKey: 'mcp:cursor', contextKey: 'repo:x', fileWorkspaceId: 'ws_9' });
      const url = new URL(lastCall().url);
      expect(url.pathname).toBe('/memory/routing/explain');
      expect(Object.fromEntries(url.searchParams)).toEqual({
        client_key: 'mcp:cursor', context_key: 'repo:x', file_workspace_id: 'ws_9'
      });
    });

    it('sends only the options given', async () => {
      respondWith(200, EXPLAIN);
      await client.explainRouting({ contextKey: 'a b&c' });
      expect(Object.fromEntries(new URL(lastCall().url).searchParams)).toEqual({ context_key: 'a b&c' });
    });

    it('sends no X-SM-Client header while the SDK has no hint value (WS-ROUTING-3)', async () => {
      respondWith(200, EXPLAIN);
      await client.explainRouting();
      const names = Object.keys(lastCall().headers).map((h) => h.toLowerCase());
      expect(names).not.toContain('x-sm-client');
    });
  });

  describe('write echo', () => {
    // One row per write path that gains the echo in the service.
    it.each([
      ['memories.create', (c) => c.memories.create({ content: 'x' }), '/memory/add'],
      ['memories.ingest', (c) => c.memories.ingest('x'), '/memory/ingest'],
      [
        'memories.ingestConversation',
        (c) => c.memories.ingestConversation([{ role: 'user', content: 'x' }]),
        '/memory/ingest/conversation'
      ]
    ])('%s result carries the echo untouched', async (_name, call, path) => {
      respondWith(200, { id: 'i', item_id: 'i', ...ECHO });
      const out = await call(client);
      expect(lastCall().url).toBe(`${BASE}${path}`);
      expect(out.id).toBe('i'); // existing keys untouched
      expect(routingEcho(out)).toEqual(ECHO);
    });

    it('an old server reads as null / []', async () => {
      respondWith(200, { id: 'i' });
      expect(routingEcho(await client.memories.create({ content: 'x' }))).toEqual({
        workspace_id: null, workspace_name: null, routed_by: null, notices: []
      });
    });

    it.each([[null], [undefined], [[]], ['s'], [{ notices: 'bad' }]])('routingEcho(%j) never throws', (body) => {
      const echo = routingEcho(body);
      expect(echo.notices).toEqual([]);
      expect(echo.workspace_id).toBeNull();
    });
  });

  describe('routingErrorCode', () => {
    it.each([
      [{ detail: { error: 'a' } }, 'a'],
      [{ detail: 'b' }, 'b'],
      [{ error: 'c' }, 'c'],
      [{ detail: [{ msg: 'm' }] }, null],
      [{ message: 'plain' }, null],
      [null, null],
      ['text', null]
    ])('%j -> %s', (detail, code) => {
      expect(routingErrorCode(detail)).toBe(code);
    });
  });
});
