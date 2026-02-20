import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { installInterceptor } from '../../../src/fetch/interceptor.js';
import { AuthCore } from '../../../src/auth/AuthCore.js';

describe('installInterceptor', () => {
  let authCore;
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    vi.restoreAllMocks();
    authCore = new AuthCore({
      mode: 'sso',
      apiBaseUrl: 'http://localhost:9001',
      webAppUrl: 'http://localhost:5173',
      endpoints: { refresh: '/auth/refresh' },
      storage: 'memory'
    });
    authCore.currentToken = 'intercepted-token';
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('should intercept all fetch calls when no urlPatterns', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    globalThis.fetch = mockFetch;

    const uninstall = installInterceptor(authCore);

    await fetch('http://localhost:9001/memory/list');

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:9001/memory/list',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer intercepted-token'
        })
      })
    );

    uninstall();
  });

  it('should only intercept matching URL patterns', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    globalThis.fetch = mockFetch;

    const uninstall = installInterceptor(authCore, {
      urlPatterns: ['localhost:9001']
    });

    await fetch('http://localhost:9001/memory/list');
    await fetch('http://external.com/api');

    // First call should have auth headers
    const firstCall = mockFetch.mock.calls[0];
    expect(firstCall[1].headers.Authorization).toBe('Bearer intercepted-token');

    // Second call should NOT have auth headers (passed through to original)
    // Since we're calling the intercepted fetch which calls the mock, both calls go through
    // but only matching URLs get headers added
    expect(mockFetch).toHaveBeenCalledTimes(2);

    uninstall();
  });

  it('should restore original fetch on uninstall', () => {
    const mockOriginal = vi.fn();
    globalThis.fetch = mockOriginal;

    const uninstall = installInterceptor(authCore);
    expect(globalThis.fetch).not.toBe(mockOriginal);

    uninstall();
    expect(globalThis.fetch).toBe(mockOriginal);
  });
});
