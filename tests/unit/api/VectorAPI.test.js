import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SmartMemoryClient } from '../../../src/api/SmartMemoryClient.js';
import { APIError } from '../../../src/errors/APIError.js';
import {
  VectorNotFoundError,
  VectorSubstrateError,
  VectorUnsupportedError
} from '../../../src/errors/VectorErrors.js';
import * as sdk from '../../../src/index.js';

// WEB-VECTOR-SEARCH-TAB-1 (VEC-TAB-U4). Real SmartMemoryClient -> BaseAPI, only fetch is
// faked. Routes, parameters and statuses are the contract's
// (smart-memory-docs docs/features/WEB-VECTOR-SEARCH-TAB-1/vector-contract.json).

const BASE = 'http://localhost:9001';
const SPACE = { collection: 'memory', model_id: 'm', dimension: 4 };
const PREVIEW = Array(16).fill(0.1);
const HIT = {
  item_id: 'a', score: 0.9, memory_type: 'semantic', origin: 'chat', title: 't', snippet: 's',
  created_at: '2026-10-21T00:00:00Z', space: SPACE, has_graph_node: true, embedding_preview: PREVIEW
};
// Deliberately unsorted: the SDK must hand the body back untouched.
const QUERY_BODY = {
  query: { mode: 'text', dimension: 4, space: SPACE },
  hits: [{ ...HIT, item_id: 'b', score: 0.2 }, HIT],
  truncated: true,
  timing_ms: { embed: null, search: 1.5 }
};
const STATS_BODY = {
  backend: 'falkordb', single_tenant: false,
  capabilities: { scope_pushdown: true, scoped_exact: false, missing_list: true },
  embedder: { model_id: 'm', dimension: 4 },
  collections: [{ name: 'memory', count: 2, space: SPACE, missing_count: null }],
  scope: { workspace_id: 'ws', user_id: null, isolation: 'WORKSPACE' },
  warnings: []
};
const INSPECT_BODY = { item: { item_id: 'a', vector: { present: true } }, neighbours: [HIT], space: SPACE };
const PROJECTION_BODY = {
  method: 'pca', dims: 3, space: SPACE, total: 1, sampled: false, limit: 2000,
  points: [{ item_id: 'a', coords: [0.1, -0.2, 0.3], memory_type: 'semantic', title: null, has_graph_node: true }],
  explained_variance: [0.6, 0.3, 0.1], warnings: [], cached: false
};
const MISSING_BODY = { items: [{ item_id: 'z', reason: 'no_row' }], next_cursor: 'opaque-2', total: null };

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body))
  };
}

describe('client.vector', () => {
  let client;
  let fetchFn;

  const respondWith = (status, body) => fetchFn.mockResolvedValue(jsonResponse(status, body));
  const lastCall = () => {
    const [url, init] = fetchFn.mock.calls.at(-1);
    return { url, method: init.method, body: init.body === undefined ? undefined : JSON.parse(init.body) };
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

  it('is registered as client.vector and exported', () => {
    expect(client.vector).toBeInstanceOf(sdk.VectorAPI);
    expect(sdk.VectorNotFoundError).toBe(VectorNotFoundError);
    expect(sdk.VectorUnsupportedError).toBe(VectorUnsupportedError);
    expect(sdk.VectorSubstrateError).toBe(VectorSubstrateError);
  });

  // One row per parameter shape. The *_clamp rows send values over the server maximum and
  // expect them forwarded unchanged (the server clamps, the client never does).
  const requestRows = [
    ['query_text_only', c => c.vector.query({ text: 'hello' }), 'POST', '/memory/vector/query', { text: 'hello' }, QUERY_BODY],
    ['query_all_params',
      c => c.vector.query({
        embedding: [0.1, 0.2], topK: 5, memoryType: 'semantic', originPrefix: 'chat:',
        collection: 'structure', includeEmbedding: true
      }),
      'POST', '/memory/vector/query',
      {
        embedding: [0.1, 0.2], top_k: 5, memory_type: 'semantic', origin_prefix: 'chat:',
        collection: 'structure', include_embedding: true
      }, QUERY_BODY],
    ['query_include_embedding_false_is_sent', c => c.vector.query({ text: 'x', includeEmbedding: false }),
      'POST', '/memory/vector/query', { text: 'x', include_embedding: false }, QUERY_BODY],
    ['query_top_k_clamp', c => c.vector.query({ text: 'x', topK: 500 }),
      'POST', '/memory/vector/query', { text: 'x', top_k: 500 }, QUERY_BODY],
    ['query_neither_forwarded_for_server_400', c => c.vector.query(),
      'POST', '/memory/vector/query', {}, QUERY_BODY],
    ['stats', c => c.vector.stats(), 'GET', '/memory/vector/stats', undefined, STATS_BODY],
    ['inspect_defaults', c => c.vector.inspect('a'), 'GET', '/memory/vector/items/a', undefined, INSPECT_BODY],
    ['inspect_all_params_and_encoded_id',
      c => c.vector.inspect('a/b c', { topK: 3, collection: 'structure', includeEmbedding: true }),
      'GET', '/memory/vector/items/a%2Fb%20c?top_k=3&collection=structure&include_embedding=true',
      undefined, INSPECT_BODY],
    ['inspect_top_k_clamp', c => c.vector.inspect('a', { topK: 99 }),
      'GET', '/memory/vector/items/a?top_k=99', undefined, INSPECT_BODY],
    ['missing_defaults_no_trailing_slash', c => c.vector.missing(),
      'GET', '/memory/vector/missing', undefined, MISSING_BODY],
    ['missing_all_params', c => c.vector.missing({ limit: 10, cursor: 'opaque-2', collection: 'structure' }),
      'GET', '/memory/vector/missing?limit=10&cursor=opaque-2&collection=structure', undefined, MISSING_BODY],
    ['missing_limit_clamp', c => c.vector.missing({ limit: 1000 }),
      'GET', '/memory/vector/missing?limit=1000', undefined, MISSING_BODY],
    ['projection_defaults_no_query', c => c.vector.projection(),
      'GET', '/memory/vector/projection', undefined, PROJECTION_BODY],
    ['projection_all_params_limit_clamp_not_reimplemented',
      c => c.vector.projection({ dims: 2, method: 'umap', limit: 5000, collection: 'structure' }),
      'GET', '/memory/vector/projection?dims=2&method=umap&limit=5000&collection=structure', undefined, PROJECTION_BODY]
  ];

  it.each(requestRows)('%s: sends the contract request and returns the body untouched',
    async (_id, call, method, path, body, response) => {
      respondWith(200, response);
      await expect(call(client)).resolves.toEqual(response);
      const sent = lastCall();
      expect(sent.method).toBe(method);
      expect(sent.url).toBe(`${BASE}${path}`);
      expect(sent.body).toEqual(body);
      expect(sent.url).not.toMatch(/\/\?/);
    });

  it('keeps preview-only embeddings, the null total and the opaque cursor as sent', async () => {
    respondWith(200, QUERY_BODY);
    const { hits } = await client.vector.query({ text: 'x', includeEmbedding: true });
    expect(hits.map(h => h.item_id)).toEqual(['b', 'a']);
    expect(hits.every(h => h.embedding_preview.length === 16)).toBe(true);
    respondWith(200, MISSING_BODY);
    const page = await client.vector.missing();
    expect(page.total).toBeNull();
    expect(page.next_cursor).toBe('opaque-2');
  });

  // Core returns null for these figures when the store's scope filters do not pin the caller
  // (VEC-CONTRACT-NULLABLE-COUNTS-1). One row per figure: the null arrives as null, never coerced or rejected.
  const nullFigureRows = [
    ['query_truncated', c => c.vector.query({ text: 'x' }), { ...QUERY_BODY, truncated: null }, b => b.truncated],
    ['stats_count', c => c.vector.stats(),
      { ...STATS_BODY, collections: [{ ...STATS_BODY.collections[0], count: null }] }, b => b.collections[0].count],
    ['stats_missing_count', c => c.vector.stats(),
      { ...STATS_BODY, collections: [{ ...STATS_BODY.collections[0], missing_count: null }] },
      b => b.collections[0].missing_count],
    ['missing_total', c => c.vector.missing(), { ...MISSING_BODY, total: null }, b => b.total],
    ['projection_total', c => c.vector.projection(), { ...PROJECTION_BODY, total: null }, b => b.total],
    ['projection_sampled', c => c.vector.projection(), { ...PROJECTION_BODY, total: null, sampled: null }, b => b.sampled]
  ];

  it.each(nullFigureRows)('%s: a null figure round-trips as null', async (_id, call, response, pick) => {
    respondWith(200, response);
    const body = await call(client);
    expect(pick(body)).toBeNull();
    expect(body).toEqual(response);
  });

  it('forwards an AbortSignal to fetch on every method', async () => {
    const signal = new AbortController().signal;
    respondWith(200, {});
    await client.vector.query({ text: 'x', signal });
    expect(fetchFn.mock.calls.at(-1)[1].signal).toBe(signal);
    await client.vector.stats({ signal });
    expect(fetchFn.mock.calls.at(-1)[1].signal).toBe(signal);
    await client.vector.inspect('a', { signal });
    expect(fetchFn.mock.calls.at(-1)[1].signal).toBe(signal);
    await client.vector.missing({ signal });
    expect(fetchFn.mock.calls.at(-1)[1].signal).toBe(signal);
    await client.vector.projection({ signal });
    expect(fetchFn.mock.calls.at(-1)[1].signal).toBe(signal);
  });

  // One row per (method, status) the contract lists, plus 500 for every method. `Typed`
  // is the exact class; null means a plain APIError (never one of the three typed ones).
  const calls = {
    query: c => c.vector.query({ text: 'x' }),
    stats: c => c.vector.stats(),
    inspect: c => c.vector.inspect('a'),
    missing: c => c.vector.missing(),
    projection: c => c.vector.projection()
  };
  const errorRows = [
    ['query', 400, null], ['query', 403, null], ['query', 404, VectorNotFoundError],
    ['query', 501, VectorUnsupportedError], ['query', 503, VectorSubstrateError], ['query', 500, null],
    ['stats', 403, null], ['stats', 501, VectorUnsupportedError], ['stats', 503, VectorSubstrateError],
    ['stats', 500, null],
    ['inspect', 400, null], ['inspect', 403, null], ['inspect', 404, VectorNotFoundError],
    ['inspect', 501, VectorUnsupportedError], ['inspect', 503, VectorSubstrateError], ['inspect', 500, null],
    ['missing', 400, null], ['missing', 403, null], ['missing', 404, VectorNotFoundError],
    ['missing', 501, VectorUnsupportedError], ['missing', 503, VectorSubstrateError], ['missing', 500, null],
    ['projection', 400, null], ['projection', 403, null], ['projection', 404, VectorNotFoundError],
    ['projection', 501, VectorUnsupportedError], ['projection', 503, VectorSubstrateError], ['projection', 500, null]
  ];

  it.each(errorRows.map(([m, st, T]) => [m, st, T ? T.name : 'a plain APIError', T]))(
    '%s on HTTP %i rejects with %s', async (method, status, _name, Typed) => {
    respondWith(status, { detail: `boom ${status}` });
    const err = await calls[method](client).catch(e => e);
    expect(err).toBeInstanceOf(APIError);
    expect(err.status).toBe(status);
    expect(err.message).toBe(`boom ${status}`);
    expect(err.detail).toEqual({ detail: `boom ${status}` });
    for (const T of [VectorNotFoundError, VectorUnsupportedError, VectorSubstrateError]) {
      expect(err instanceof T).toBe(T === Typed);
    }
  });

  it('keeps the no_vector marker on the inspect 404', async () => {
    respondWith(404, { detail: 'no_vector' });
    const err = await client.vector.inspect('a').catch(e => e);
    expect(err).toBeInstanceOf(VectorNotFoundError);
    expect(err.detail.detail).toBe('no_vector');
  });

  it('lets a network failure through as the base APIError, not a typed one', async () => {
    fetchFn.mockRejectedValue(new Error('offline'));
    const err = await client.vector.stats().catch(e => e);
    expect(err).toBeInstanceOf(APIError);
    expect(err.status).toBe(0);
    expect(err).not.toBeInstanceOf(VectorUnsupportedError);
  });
});
