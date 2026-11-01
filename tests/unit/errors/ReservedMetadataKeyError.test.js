import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BaseAPI } from '../../../src/api/BaseAPI.js';
import { MemoryAPI } from '../../../src/api/MemoryAPI.js';
import { AuthCore } from '../../../src/auth/AuthCore.js';
import { APIError, ReservedMetadataKeyError, RESERVED_METADATA_KEY } from '../../../src/index.js';

// SVC-2.0-METADATA-RESERVED-KEY-REFUSE-1: the service answers 400 with
// detail {error_type: 'reserved_metadata_key', key, message} (contract PLAT-API-CODES-1).
const reserved = key => ({
  detail: {
    error_type: RESERVED_METADATA_KEY,
    key,
    message: `metadata key '${key}' is reserved: the server sets it from your credentials.`
  }
});

const add = api => api.create({ content: 'c', metadata: { workspace_id: 'other' } });
const ingest = api => api.ingest('c', { context: { scope: 'x' } });

// row id | call | status | JSON body | expected class | expected key
const ROWS = [
  ['create-reserved', add, 400, reserved('workspace_id'), ReservedMetadataKeyError, 'workspace_id'],
  ['ingest-reserved', ingest, 400, reserved('scope'), ReservedMetadataKeyError, 'scope'],
  ['other-400-string-detail', add, 400, { detail: 'Invalid memory_type' }, APIError, undefined],
  ['other-400-error-type', add, 400, { detail: { error_type: 'scope_required' } }, APIError, undefined],
  ['422-same-body-not-mapped', add, 422, reserved('scope'), APIError, undefined],
  ['500', add, 500, { detail: 'boom' }, APIError, undefined]
];

describe('ReservedMetadataKeyError', () => {
  let original;
  let memoryAPI;

  beforeEach(() => {
    original = globalThis.fetch;
    const authCore = new AuthCore({
      mode: 'sso',
      apiBaseUrl: 'http://localhost:9001',
      webAppUrl: 'http://localhost:5173',
      endpoints: { refresh: '/auth/refresh' },
      storage: 'memory'
    });
    memoryAPI = new MemoryAPI(new BaseAPI(authCore));
  });

  afterEach(() => {
    globalThis.fetch = original;
  });

  it.each(ROWS)('%s', async (_id, call, status, body, Expected, key) => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status,
      headers: { get: name => (name === 'content-type' ? 'application/json' : null) },
      json: () => Promise.resolve(body)
    });
    const error = await call(memoryAPI).then(
      () => null,
      err => err
    );
    expect(error).toBeInstanceOf(Expected);
    expect(error).toBeInstanceOf(APIError);
    expect(error.status).toBe(status);
    expect(error.detail).toEqual(body);
    if (Expected === ReservedMetadataKeyError) {
      expect(error.name).toBe('ReservedMetadataKeyError');
      expect(error.key).toBe(key);
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    } else {
      expect(error).not.toBeInstanceOf(ReservedMetadataKeyError);
    }
  });
});
