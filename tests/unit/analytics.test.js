import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { generatedAllowlist, generatedEnums, posthogMock } = vi.hoisted(() => {
  const forbiddenDrift = [
    'query',
    'content',
    'tags',
    'profile_name',
    'workspace_name',
    'collection_name',
    'memory_id',
    'run_id',
  ];

  return {
    generatedAllowlist: {
      memory_created: ['source', 'created_count', 'memory_type', 'use_pipeline', 'profile_present', 'tag_count', 'has_collection', 'failed_count', ...forbiddenDrift],
      memory_edited: ['memory_type', 'changed_fields', 'tag_count', 'has_collection', 'write_mode', ...forbiddenDrift],
      memory_deleted: ['operation', 'memory_type', 'source', ...forbiddenDrift],
      memories_cleared: ['deleted_count', 'nuclear', ...forbiddenDrift],
      search_performed: ['surface', 'result_count', 'top_k', 'memory_type', 'hybrid', 'decompose', 'multi_hop', 'max_hops', 'semantic_hops', 'budget_bucket', 'min_score_bucket', 'cite', ...forbiddenDrift],
      evolution_triggered: ['evolver_count', 'evolver_keys', 'executed_count', 'skipped_count', 'error_count', 'stop_on_error', 'profile_present', ...forbiddenDrift],
      studio_pipeline_saved: ['save_surface', 'storage', 'stage_count', 'enricher_count', 'grounder_count', 'evolver_count', 'override_key_count', ...forbiddenDrift],
    },
    generatedEnums: {
      memory_deleted: {
        source: ['user', 'cli', 'api', 'import', 'signup', 'managed', 'mcp', 'pipeline', 'hook', 'lifecycle', 'observe', 'evolver', 'code', 'enricher', 'conversation', 'structured', 'version', 'snapshot', 'unknown'],
      },
      search_performed: {
        min_score_bucket: ['lt50', 'lt80', 'gte80'],
      },
    },
    posthogMock: {
      __loaded: true,
      capture: vi.fn(),
      captureException: vi.fn(),
      reset: vi.fn(),
    },
  };
});

vi.mock('posthog-js', () => ({ default: posthogMock }));
vi.mock('../../src/react/analytics/productEvents.generated.js', () => ({
  PRODUCT_EVENT_ENUM_VALUES: generatedEnums,
  PRODUCT_EVENT_PROPERTIES: generatedAllowlist,
}));

import { AuthCore } from '../../src/auth/AuthCore.js';
import {
  captureException,
  captureProductEvent,
} from '../../src/react/analytics/client.js';
import { generateProductEvents } from '../../scripts/generate-product-events.mjs';

const EXACT_EVENT_NAMES = [
  'evolution_triggered',
  'memories_cleared',
  'memory_created',
  'memory_deleted',
  'memory_edited',
  'search_performed',
  'studio_pipeline_saved',
];

describe('analytics client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    posthogMock.__loaded = true;
  });

  it('captures all seven exact canonical event names', () => {
    for (const eventName of EXACT_EVENT_NAMES) {
      expect(captureProductEvent(eventName, {})).toBe(true);
    }

    expect(posthogMock.capture.mock.calls.map(([eventName]) => eventName).sort())
      .toEqual(EXACT_EVENT_NAMES);
  });

  it('returns false without throwing for unknown events', () => {
    expect(() => captureProductEvent('dream_phase_run', {})).not.toThrow();
    expect(captureProductEvent('dream_phase_run', {})).toBe(false);
    expect(posthogMock.capture).not.toHaveBeenCalled();
  });

  it('constructs a fresh allowlist-filtered object and drops undefined and unknown keys', () => {
    const properties = {
      source: 'manual',
      created_count: 1,
      memory_type: undefined,
      surprise: 'drop me',
    };

    expect(captureProductEvent('memory_created', properties)).toBe(true);

    const captured = posthogMock.capture.mock.calls[0][1];
    expect(captured).toEqual({ source: 'manual', created_count: 1 });
    expect(captured).not.toBe(properties);
  });

  it('denies content, query, tag values, names, and IDs even if a generated contract drifts', () => {
    const forbidden = {
      query: 'private search',
      content: 'private memory',
      tags: ['secret'],
      profile_name: 'Private profile',
      workspace_name: 'Private workspace',
      collection_name: 'Private collection',
      memory_id: 'memory-secret',
      run_id: 'run-secret',
    };

    for (const eventName of EXACT_EVENT_NAMES) {
      captureProductEvent(eventName, { ...forbidden });
    }

    for (const [, captured] of posthogMock.capture.mock.calls) {
      expect(captured).toEqual({});
    }
  });

  it('enforces the generated bounded delete-source and score-bucket enums', () => {
    captureProductEvent('memory_deleted', {
      operation: 'single',
      source: 'raw-private-prefix',
    });
    captureProductEvent('search_performed', {
      surface: 'studio',
      min_score_bucket: '0.73',
    });

    expect(posthogMock.capture).toHaveBeenNthCalledWith(1, 'memory_deleted', {
      operation: 'single',
    });
    expect(posthogMock.capture).toHaveBeenNthCalledWith(2, 'search_performed', {
      surface: 'studio',
    });

    posthogMock.capture.mockClear();
    captureProductEvent('memory_deleted', { source: 'unknown' });
    captureProductEvent('search_performed', { min_score_bucket: 'lt80' });
    expect(posthogMock.capture).toHaveBeenNthCalledWith(1, 'memory_deleted', {
      source: 'unknown',
    });
    expect(posthogMock.capture).toHaveBeenNthCalledWith(2, 'search_performed', {
      min_score_bucket: 'lt80',
    });
  });

  it('is a non-throwing no-op without an initialized client and catches capture failures', () => {
    posthogMock.__loaded = false;
    expect(captureProductEvent('memory_created', { created_count: 1 })).toBe(false);
    expect(posthogMock.capture).not.toHaveBeenCalled();

    posthogMock.__loaded = true;
    posthogMock.capture.mockImplementationOnce(() => {
      throw new Error('client failure');
    });
    expect(captureProductEvent('memory_created', { created_count: 1 })).toBe(false);
    expect(captureProductEvent('memory_created', { created_count: 1 })).toBe(true);
  });

  it('captures a sanitized Error and only bounded context keys and types', () => {
    const original = new TypeError('secret response message');
    original.stack = 'TypeError: secret response message\n at https://example.test/path?query=secret';

    expect(captureException(original, {
      source: 'api',
      component: 'MemoryEditor',
      operation: 'save',
      method: 'PATCH',
      status: 503,
      url: 'https://example.test/path?query=secret',
      query: 'secret',
      body: { content: 'secret' },
      response: { message: 'secret' },
      message: 'secret',
      context: { content: 'secret' },
      extra: 'drop me',
    })).toBe(true);

    const [sanitizedError, context] = posthogMock.captureException.mock.calls[0];
    expect(sanitizedError).toBeInstanceOf(Error);
    expect(sanitizedError).not.toBe(original);
    expect(sanitizedError.name).toBe('TypeError');
    expect(sanitizedError.message).toBe('');
    expect(sanitizedError.stack).toBeUndefined();
    expect(context).toEqual({
      source: 'api',
      component: 'MemoryEditor',
      operation: 'save',
      method: 'PATCH',
      status: 503,
    });
  });

  it('drops invalid context values, normalizes unknown error names, and catches client failures', () => {
    const original = new Error('secret');
    original.name = 'Server said: private content';
    posthogMock.captureException.mockImplementationOnce(() => {
      throw new Error('client failure');
    });

    expect(captureException(original, {
      source: { raw: 'private' },
      component: null,
      operation: ['private'],
      method: 42,
      status: '500',
    })).toBe(false);
    expect(captureException(original, {})).toBe(true);

    const [sanitizedError, context] = posthogMock.captureException.mock.calls[0];
    expect(sanitizedError.name).toBe('Error');
    expect(context).toEqual({});
  });

  it('includes active workspaceId in AuthCore listener snapshots', () => {
    const auth = new AuthCore({
      mode: 'custom',
      apiBaseUrl: 'http://localhost:9001',
      storage: 'memory',
    });
    const listener = vi.fn();
    auth.tokenManager.setTeamId('workspace-active');
    auth.addListener(listener);

    auth.setTenantId('tenant-1');

    expect(listener).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant-1',
      workspaceId: 'workspace-active',
    }));
  });
});

describe('product event generator', () => {
  const temporaryDirectories = [];

  afterEach(async () => {
    for (const directory of temporaryDirectories.splice(0)) {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('deterministically generates property keys and only the two bounded enum catalogs', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'smartmemory-analytics-generator-'));
    temporaryDirectories.push(directory);
    const contractPath = join(directory, 'contract.json');
    const outputPath = join(directory, 'productEvents.generated.js');
    const fixture = {
      events: {
        search_performed: {
          surface: 'enum: web|studio',
          min_score_bucket: 'enum: lt50|lt80|gte80 (studio)',
        },
        memory_deleted: {
          source: 'enum: user|api|unknown — fixed-prefix bucket',
          operation: 'const: single',
        },
        memory_created: {
          created_count: 'integer >= 1',
          source: 'enum: manual|import',
        },
      },
    };
    await writeFile(contractPath, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');

    await generateProductEvents({ contractPath, outputPath });
    const first = await readFile(outputPath, 'utf8');
    await generateProductEvents({ contractPath, outputPath });
    const second = await readFile(outputPath, 'utf8');

    expect(second).toBe(first);
    expect(first).toContain('"memory_created": Object.freeze(["created_count", "source"])');
    expect(first).toContain('"memory_deleted": Object.freeze(["operation", "source"])');
    expect(first).toContain('"source": Object.freeze(["user", "api", "unknown"])');
    expect(first).toContain('"min_score_bucket": Object.freeze(["lt50", "lt80", "gte80"])');
    expect(first).not.toContain('"surface": Object.freeze(["web", "studio"])');

    await expect(generateProductEvents({ contractPath, outputPath, check: true }))
      .resolves.toBe(true);
    await writeFile(outputPath, '// drift\n', 'utf8');
    await expect(generateProductEvents({ contractPath, outputPath, check: true }))
      .rejects.toThrow('out of date');
  });
});
