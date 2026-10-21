import {
  VectorNotFoundError,
  VectorSubstrateError,
  VectorUnsupportedError
} from '../errors/VectorErrors.js';
import { APIError } from '../errors/APIError.js';

/**
 * A scope reference: which collection and which model/dimension a vector lives in.
 * @typedef {Object} VectorSpaceRef
 * @property {string} collection
 * @property {string|null} model_id
 * @property {number|null} dimension
 */

/**
 * One nearest-neighbour hit. `embedding_preview` (first 16 floats) is present only when
 * `includeEmbedding` was set; the full vector is never returned.
 * @typedef {Object} VectorHit
 * @property {string} item_id
 * @property {number} score - Similarity in [0, 1], higher is better.
 * @property {string|null} memory_type
 * @property {string|null} origin
 * @property {string|null} title
 * @property {string|null} snippet
 * @property {string|null} created_at
 * @property {VectorSpaceRef} space
 * @property {boolean} has_graph_node - False marks an orphan vector.
 * @property {number[]} [embedding_preview]
 */

const TYPED_ERRORS = {
  404: VectorNotFoundError,
  501: VectorUnsupportedError,
  503: VectorSubstrateError
};

/** Drop null/undefined entries so the server's own defaults apply. */
function defined(entries) {
  return Object.fromEntries(Object.entries(entries).filter(([, v]) => v !== undefined && v !== null));
}

/**
 * Read-only views of the vector index (`/memory/vector/*`, contract
 * `smart-memory-docs/docs/features/WEB-VECTOR-SEARCH-TAB-1/vector-contract.json`).
 *
 * Counts, hits and items are in the caller's scope. The server owns every clamp
 * (`topK` 50 for `query`, 20 for `inspect`; `limit` 200 for `missing`) and the opaque
 * `cursor`: this client sends what it is given and returns the body untouched.
 *
 * Errors are `APIError`s. 404, 501 and 503 are the typed subclasses
 * `VectorNotFoundError`, `VectorUnsupportedError` and `VectorSubstrateError`.
 *
 * Every method takes an optional `signal` (an `AbortSignal`) to cancel in flight; an
 * aborted call rejects with the standard `AbortError`.
 */
export class VectorAPI {
  constructor(baseAPI) {
    this.api = baseAPI;
  }

  /** @private Run a request and retype 404/501/503. */
  async _call(fn) {
    try {
      return await fn();
    } catch (error) {
      const Typed = error instanceof APIError ? TYPED_ERRORS[error.status] : undefined;
      if (Typed && !(error instanceof Typed)) {
        throw new Typed(error.message, error.status, error.detail);
      }
      throw error;
    }
  }

  /** @private */
  _opts(signal) {
    return signal ? { signal } : undefined;
  }

  /**
   * Nearest-neighbour query. Pass exactly one of `text` (embedded server-side) or
   * `embedding` (raw vector, length must match the collection's dimension); anything
   * else is a 400 from the server.
   *
   * @param {Object} params
   * @param {string} [params.text]
   * @param {number[]} [params.embedding]
   * @param {number} [params.topK] - Server max 50.
   * @param {string} [params.memoryType] - Equality filter on `hit.memory_type`.
   * @param {string} [params.originPrefix] - Prefix filter on `hit.origin`.
   * @param {string} [params.collection] - A name from `stats().collections[].name`.
   * @param {boolean} [params.includeEmbedding] - Adds `embedding_preview` (16 floats) to each hit.
   * @param {AbortSignal} [params.signal]
   * @returns {Promise<{ query: { mode: 'text'|'embedding', dimension: number, space: VectorSpaceRef },
   *   hits: VectorHit[], truncated: boolean|null, timing_ms: { embed: number|null, search: number } }>}
   */
  async query({
    text,
    embedding,
    topK,
    memoryType,
    originPrefix,
    collection,
    includeEmbedding,
    signal
  } = {}) {
    const body = defined({
      text,
      embedding,
      top_k: topK,
      memory_type: memoryType,
      origin_prefix: originPrefix,
      collection,
      include_embedding: includeEmbedding
    });
    return this._call(() => this.api.post('/memory/vector/query', body, this._opts(signal)));
  }

  /**
   * Backend, embedder, per-collection counts, capabilities and warnings.
   * `collections[].index_count` is present only when `single_tenant` is true.
   * `collections[].count` and `collections[].missing_count` are `number|null`: null when the
   * backend cannot count or the store's scope filters do not pin the caller.
   * @param {{ signal?: AbortSignal }} [options]
   */
  async stats({ signal } = {}) {
    return this._call(() => this.api.get('/memory/vector/stats', this._opts(signal)));
  }

  /**
   * One item's vector facts plus its nearest neighbours (the item itself excluded).
   * 404 means the item is not visible, the collection is unknown, or there is no vector
   * row (`error.detail.detail === 'no_vector'` when the memory exists without an embedding).
   *
   * @param {string} itemId
   * @param {Object} [params]
   * @param {number} [params.topK] - Neighbour count, server max 20.
   * @param {string} [params.collection]
   * @param {boolean} [params.includeEmbedding]
   * @param {AbortSignal} [params.signal]
   * @returns {Promise<{ item: Object, neighbours: VectorHit[], space: VectorSpaceRef }>}
   */
  async inspect(itemId, { topK, collection, includeEmbedding, signal } = {}) {
    const qs = new URLSearchParams(
      Object.entries(
        defined({ top_k: topK, collection, include_embedding: includeEmbedding })
      ).map(([k, v]) => [k, String(v)])
    ).toString();
    const path = `/memory/vector/items/${encodeURIComponent(itemId)}${qs ? '?' + qs : ''}`;
    return this._call(() => this.api.get(path, this._opts(signal)));
  }

  /**
   * One page of in-scope memories with no usable vector. Pass the previous page's
   * `next_cursor` as `cursor`. 501 means the backend has no missing list
   * (`stats().capabilities.missing_list` is false). `total` is null when the backend
   * cannot count cheaply or the store's scope filters do not pin the caller.
   *
   * @param {Object} [params]
   * @param {number} [params.limit] - Server max 200.
   * @param {string} [params.cursor] - Opaque.
   * @param {string} [params.collection]
   * @param {AbortSignal} [params.signal]
   * @returns {Promise<{ items: Object[], next_cursor: string|null, total: number|null }>}
   */
  async missing({ limit, cursor, collection, signal } = {}) {
    const qs = new URLSearchParams(
      Object.entries(defined({ limit, cursor, collection })).map(([k, v]) => [k, String(v)])
    ).toString();
    const path = `/memory/vector/missing${qs ? '?' + qs : ''}`;
    return this._call(() => this.api.get(path, this._opts(signal)));
  }

  /**
   * The caller's in-scope vectors projected to 2D/3D coordinates for the map view.
   * Points carry `item_id`, `coords`, `memory_type`, `title`, `has_graph_node` and are
   * ordered by `item_id`; no embedding is ever returned. `limit` is sent as given (server
   * clamps it to 2000 and samples larger scopes deterministically). 501 means `umap` is
   * not enabled on the server or the backend cannot sample (`stats().capabilities.projection`).
   *
   * @param {Object} [params]
   * @param {number} [params.dims] - 2 or 3 (server default 3).
   * @param {string} [params.method] - 'pca' (server default) or 'umap'.
   * @param {number} [params.limit] - Server max 2000.
   * @param {string} [params.collection]
   * @param {AbortSignal} [params.signal]
   * @returns {Promise<{ method: string, dims: number, space: VectorSpaceRef, points: Object[],
   *   total: number|null (null when withheld), sampled: boolean|null (null when total is withheld), limit: number, explained_variance: number[]|null,
   *   warnings: string[], cached: boolean }>}
   */
  async projection({ dims, method, limit, collection, signal } = {}) {
    const qs = new URLSearchParams(
      Object.entries(defined({ dims, method, limit, collection })).map(([k, v]) => [k, String(v)])
    ).toString();
    const path = `/memory/vector/projection${qs ? '?' + qs : ''}`;
    return this._call(() => this.api.get(path, this._opts(signal)));
  }
}
