// Built-dist proof for DRY-FRONTEND-1: import the SDK exactly the way the apps
// consume it (dist/index.js) and resolve two different env inputs. If the SDK
// read `import.meta.env` internally, the env would be frozen at SDK build time
// and both resolutions would be identical/wrong.
import { describe, expect, it, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const distEntry = resolve(import.meta.dirname, '../../dist/index.js');

describe('createApiBaseUrl from built dist/', () => {
  it('dist/index.js exists — run `npm run build` before `npm test`', () => {
    expect(existsSync(distEntry)).toBe(true);
  });

  it('resolves two different env inputs correctly (no build-time env freezing)', async () => {
    const { createApiBaseUrl } = await import(distEntry);
    const origin = () => 'https://app.example.com';

    const dev = createApiBaseUrl({ env: { DEV: true }, origin, warn: vi.fn() });
    expect(dev.apiBaseUrl()).toBe('http://localhost:9001');

    const prod = createApiBaseUrl({
      env: { DEV: false, VITE_API_URL: 'https://api.example.com' },
      origin,
      warn: vi.fn(),
    });
    expect(prod.apiBaseUrl()).toBe('https://api.example.com');

    prod.setRuntimeApiBase('same-origin');
    expect(prod.apiBaseUrl()).toBe('https://app.example.com');
  });

  it('dist/apiBaseUrl.js exists — the dedicated subpath the app adapters import', async () => {
    const subpathEntry = resolve(import.meta.dirname, '../../dist/apiBaseUrl.js');
    expect(existsSync(subpathEntry)).toBe(true);
    const { createApiBaseUrl } = await import(subpathEntry);
    const dev = createApiBaseUrl({ env: { DEV: true }, origin: () => 'https://o.test', warn: vi.fn() });
    expect(dev.apiBaseUrl()).toBe('http://localhost:9001');
  });
});
