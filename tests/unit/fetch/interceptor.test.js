import { describe, it, expect, vi } from 'vitest';
import { installInterceptor } from '../../../src/fetch/interceptor.js';
import { AuthCore } from '../../../src/auth/AuthCore.js';

describe('injectable interceptor', () => {
  it('never mutates global fetch and restricts credentials to trusted origins and paths', async () => {
    const original = globalThis.fetch;
    const auth = new AuthCore({ mode: 'sso', storage: 'memory', apiBaseUrl: 'https://service.test/api' });
    auth.currentToken = 'token';
    const fetchFn = vi.fn().mockResolvedValue({ status: 200 });
    const wrapped = installInterceptor(auth, { fetchFn, urlPatterns: ['/memory'] });
    await wrapped('https://service.test/api/memory');
    await wrapped('https://evil.test/api/memory');
    await wrapped('https://service.test/apievil/memory');
    await wrapped('https://service.test/api/other');
    expect(fetchFn.mock.calls[0][1].headers.Authorization).toBe('Bearer token');
    for (const call of fetchFn.mock.calls.slice(1)) expect(call[1]?.headers).toBeUndefined();
    expect(globalThis.fetch).toBe(original);
  });
});
