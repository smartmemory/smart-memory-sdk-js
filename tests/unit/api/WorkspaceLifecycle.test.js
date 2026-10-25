import { describe, it, expect, vi } from 'vitest';
import { BaseAPI } from '../../../src/api/BaseAPI.js';
import { AuthCore } from '../../../src/auth/AuthCore.js';
import { APIError } from '../../../src/errors/APIError.js';
import { WorkspaceAPI } from '../../../src/api/WorkspaceAPI.js';

// WS-MGMT-12: client-side contract test over a real BaseAPI with a mocked fetch (no backend).
const BASE = 'http://localhost:9001';
const LIST_URL = `${BASE}/memory/workspaces`;
const HIDDEN = { workspace_id: 'ws_1', state: 'hidden', restore_until: '2026-11-23T00:00:00Z' };
const DETAIL = { workspace_id: 'ws_1', name: 'N', state: 'active', restore_until: null };

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    json: () => Promise.resolve(body)
  };
}

/** `capabilities`: array for the list body, or undefined to omit the key. `answer`: response for non-list URLs. */
function makeApi({ capabilities, answer = jsonResponse(200, DETAIL) } = {}) {
  const authCore = new AuthCore({
    mode: 'sso', apiBaseUrl: BASE, webAppUrl: 'http://localhost:5173',
    endpoints: { refresh: '/auth/refresh' }, storage: 'memory'
  });
  authCore.currentToken = 'test-token';
  const fetchFn = vi.fn(async (url) => {
    if (url.startsWith(LIST_URL) && !url.slice(LIST_URL.length).startsWith('/')) {
      return jsonResponse(200, capabilities === undefined ? { workspaces: [] } : { workspaces: [], capabilities });
    }
    return answer;
  });
  return { ws: new WorkspaceAPI(new BaseAPI(authCore, { fetchFn })), fetchFn };
}

const calls = (fetchFn) => fetchFn.mock.calls.map(([url, init]) => [init.method, url, init.body]);

const REQUEST_ROWS = [
  ['get', ws => ws.get('ws_1'), 'GET', `${LIST_URL}/ws_1`, undefined, jsonResponse(200, DETAIL), DETAIL],
  ['update name', ws => ws.update('ws_1', { name: 'N' }), 'PATCH', `${LIST_URL}/ws_1`, '{"name":"N"}', jsonResponse(200, DETAIL), DETAIL],
  ['update description', ws => ws.update('ws_1', { description: 'd' }), 'PATCH', `${LIST_URL}/ws_1`, '{"description":"d"}', jsonResponse(200, DETAIL), DETAIL],
  ['update both', ws => ws.update('ws_1', { name: 'N', description: 'd' }), 'PATCH', `${LIST_URL}/ws_1`, '{"name":"N","description":"d"}', jsonResponse(200, DETAIL), DETAIL],
  ['delete', ws => ws.delete('ws_1'), 'DELETE', `${LIST_URL}/ws_1`, undefined, jsonResponse(202, HIDDEN), HIDDEN],
  ['restore', ws => ws.restore('ws_1'), 'POST', `${LIST_URL}/ws_1/restore`, undefined, jsonResponse(200, DETAIL), DETAIL],
  ['id is encoded', ws => ws.restore('a/b'), 'POST', `${LIST_URL}/a%2Fb/restore`, undefined, jsonResponse(200, DETAIL), DETAIL]
];

const LIFECYCLE_CALLS = [
  ['get', ws => ws.get('ws_1')],
  ['update', ws => ws.update('ws_1', { name: 'N' })],
  ['delete', ws => ws.delete('ws_1')],
  ['restore', ws => ws.restore('ws_1')]
];

const ERROR_ROWS = LIFECYCLE_CALLS.flatMap(([name, call]) =>
  [403, 404, 409, 503].map(status => [`${name} ${status}`, call, status])
);

describe('WorkspaceAPI lifecycle (WS-MGMT-12)', () => {
  it.each(REQUEST_ROWS)('%s: one request with the contract verb, path and body', async (_n, call, verb, url, body, answer, result) => {
    const { ws, fetchFn } = makeApi({ capabilities: ['lifecycle.v1'], answer });
    await ws.list();

    expect(await call(ws)).toEqual(result);

    expect(calls(fetchFn)).toHaveLength(2);
    expect(calls(fetchFn)[1]).toEqual([verb, url, body]);
  });

  it.each(ERROR_ROWS)('%s rejects with an APIError carrying the status', async (_n, call, status) => {
    const answer = jsonResponse(status, { detail: { code: 'x', message: 'refused' } });
    const { ws } = makeApi({ capabilities: ['lifecycle.v1'], answer });
    await ws.list();

    const error = await call(ws).catch(e => e);

    expect(error).toBeInstanceOf(APIError);
    expect(error.status).toBe(status);
  });

  it.each([
    ['default', undefined, LIST_URL],
    ['includeHidden false', { includeHidden: false }, LIST_URL],
    ['includeHidden true', { includeHidden: true }, `${LIST_URL}?include=hidden`]
  ])('list (%s) requests %s', async (_n, args, url) => {
    const { ws, fetchFn } = makeApi({ capabilities: ['lifecycle.v1'] });

    await ws.list(args);

    expect(calls(fetchFn)).toEqual([['GET', url, undefined]]);
  });

  it.each([
    ['capabilities missing', undefined],
    ['capabilities empty', []],
    ['other capability only', ['other.v1']]
  ])('after a list with %s, lifecycle calls are a no-op with zero requests', async (_n, capabilities) => {
    const { ws, fetchFn } = makeApi({ capabilities });
    await ws.list();

    const results = await Promise.all(LIFECYCLE_CALLS.map(([, call]) => call(ws)));

    expect(results).toEqual(LIFECYCLE_CALLS.map(() => ({ supported: false })));
    expect(calls(fetchFn)).toHaveLength(1);
  });

  it('with no list fetched, restore fetches the list once, then sends the POST; later calls reuse the answer', async () => {
    const { ws, fetchFn } = makeApi({ capabilities: ['lifecycle.v1'] });

    await ws.restore('ws_1');
    await ws.restore('ws_1');

    expect(calls(fetchFn).map(([m, u]) => `${m} ${u}`)).toEqual([
      `GET ${LIST_URL}`, `POST ${LIST_URL}/ws_1/restore`, `POST ${LIST_URL}/ws_1/restore`
    ]);
  });

  it('with no list fetched and no capability advertised, restore resolves to the no-op after one GET', async () => {
    const { ws, fetchFn } = makeApi({ capabilities: undefined });

    expect(await ws.restore('ws_1')).toEqual({ supported: false });
    expect(await ws.delete('ws_1')).toEqual({ supported: false });

    expect(calls(fetchFn)).toEqual([['GET', LIST_URL, undefined]]);
  });

  it('concurrent first calls share one capability fetch', async () => {
    const { ws, fetchFn } = makeApi({ capabilities: ['lifecycle.v1'] });

    await Promise.all([ws.get('ws_1'), ws.restore('ws_1')]);

    expect(calls(fetchFn).filter(([m, u]) => m === 'GET' && u === LIST_URL)).toHaveLength(1);
  });

  it('a later list refreshes the remembered capability', async () => {
    const { ws, fetchFn } = makeApi({ capabilities: ['lifecycle.v1'] });
    await ws.list();
    fetchFn.mockImplementationOnce(async () => jsonResponse(200, { workspaces: [] }));
    await ws.list();

    expect(await ws.restore('ws_1')).toEqual({ supported: false });
  });

  it('update with neither field rejects with a TypeError and sends nothing', async () => {
    const { ws, fetchFn } = makeApi({ capabilities: ['lifecycle.v1'] });

    await expect(ws.update('ws_1')).rejects.toBeInstanceOf(TypeError);
    await expect(ws.update('ws_1', {})).rejects.toBeInstanceOf(TypeError);

    expect(fetchFn).not.toHaveBeenCalled();
  });
});
