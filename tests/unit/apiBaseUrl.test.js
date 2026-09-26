import { describe, expect, it, vi } from 'vitest';
import { createApiBaseUrl } from '../../src/apiBaseUrl.js';

const ORIGIN = 'https://app.example.com';
const origin = () => ORIGIN;

// Table-driven matrix over the resolver's precedence chain. `origin` is
// injected so cases never depend on the jsdom location.
const cases = [
  {
    name: 'env unset, dev -> localhost dev default',
    env: { DEV: true },
    expected: 'http://localhost:9001',
    warning: 'API base configuration missing; falling back to the local development API.',
  },
  {
    name: 'env unset, prod -> current origin',
    env: { DEV: false },
    expected: ORIGIN,
    warning: 'API base configuration missing in production; using the current origin.',
  },
  {
    name: 'env unset entirely (no DEV flag) -> treated as production',
    env: {},
    expected: ORIGIN,
    warning: 'API base configuration missing in production; using the current origin.',
  },
  {
    name: 'VITE_API_URL set in dev -> used verbatim',
    env: { DEV: true, VITE_API_URL: 'https://api.dev.test' },
    expected: 'https://api.dev.test',
  },
  {
    name: 'VITE_API_URL set in prod -> used verbatim',
    env: { DEV: false, VITE_API_URL: 'https://api.prod.test' },
    expected: 'https://api.prod.test',
  },
  {
    name: 'VITE_API_URL is trimmed but inner/trailing characters survive',
    env: { DEV: true, VITE_API_URL: '  https://api.prod.test/v1  ' },
    expected: 'https://api.prod.test/v1',
  },
  {
    name: 'VITE_API_URL trailing slash is preserved verbatim',
    env: { DEV: false, VITE_API_URL: 'https://api.prod.test/' },
    expected: 'https://api.prod.test/',
  },
  {
    name: 'blank VITE_API_URL falls through to dev default',
    env: { DEV: true, VITE_API_URL: '   ' },
    expected: 'http://localhost:9001',
    warning: 'API base configuration missing; falling back to the local development API.',
  },
  {
    name: 'VITE_API_BASE same-origin beats VITE_API_URL -> origin on a prod hostname',
    env: { DEV: true, VITE_API_BASE: 'same-origin', VITE_API_URL: 'https://ignored.test' },
    expected: ORIGIN,
  },
  {
    name: 'non-string VITE_API_URL is ignored',
    env: { DEV: true, VITE_API_URL: 42 },
    expected: 'http://localhost:9001',
    warning: 'API base configuration missing; falling back to the local development API.',
  },
];

describe('createApiBaseUrl resolution matrix', () => {
  for (const { name, env, expected, warning } of cases) {
    it(name, () => {
      const warn = vi.fn();
      const { apiBaseUrl } = createApiBaseUrl({ env, origin, warn });
      expect(apiBaseUrl()).toBe(expected);
      if (warning) {
        expect(warn).toHaveBeenCalledWith(warning);
      } else {
        expect(warn).not.toHaveBeenCalled();
      }
    });
  }
});

describe('createApiBaseUrl runtime override', () => {
  it('honours set, read-after-import, same-origin, and reset back to env resolution', () => {
    const env = { DEV: true };
    const { apiBaseUrl, setRuntimeApiBase } = createApiBaseUrl({ env, origin, warn: vi.fn() });

    setRuntimeApiBase('https://runtime.test');
    expect(apiBaseUrl()).toBe('https://runtime.test');

    setRuntimeApiBase('same-origin');
    expect(apiBaseUrl()).toBe(ORIGIN);

    setRuntimeApiBase('   ');
    expect(apiBaseUrl()).toBe('http://localhost:9001');

    setRuntimeApiBase('https://runtime.test');
    setRuntimeApiBase(undefined);
    expect(apiBaseUrl()).toBe('http://localhost:9001');
  });

  it('trims the runtime override and applies the suffix', () => {
    const { apiBaseUrl, setRuntimeApiBase } = createApiBaseUrl({
      env: { DEV: false },
      origin,
      suffix: '/insights/api',
      warn: vi.fn(),
    });
    setRuntimeApiBase('  https://rt.test  ');
    expect(apiBaseUrl()).toBe('https://rt.test/insights/api');
  });
});

describe('createApiBaseUrl derived resolver (the Insights app option)', () => {
  const makeInsights = (env) =>
    createApiBaseUrl({ env, origin, warn: vi.fn() }).deriveApiBaseUrl({
      urlEnvVar: 'VITE_INSIGHTS_API_URL',
      devDefault: 'http://localhost:9003',
      suffix: '/insights/api',
      label: 'Insights API',
    });

  it('dev env unset -> localhost:9003', () => {
    expect(makeInsights({ DEV: true })()).toBe('http://localhost:9003');
  });

  it('prod env unset -> origin + /insights/api', () => {
    expect(makeInsights({ DEV: false })()).toBe(`${ORIGIN}/insights/api`);
  });

  it('VITE_INSIGHTS_API_URL set -> verbatim, no suffix', () => {
    expect(makeInsights({ DEV: true, VITE_INSIGHTS_API_URL: ' https://insights.test/ ' })()).toBe(
      'https://insights.test/',
    );
  });

  it('VITE_API_URL does NOT leak into the derived resolver', () => {
    expect(makeInsights({ DEV: true, VITE_API_URL: 'https://wrong.test' })()).toBe('http://localhost:9003');
  });

  it('same-origin env -> origin + /insights/api', () => {
    expect(makeInsights({ DEV: true, VITE_API_BASE: 'same-origin' })()).toBe(`${ORIGIN}/insights/api`);
  });

  it('derived resolver shares the runtime override with the base resolver', () => {
    const base = createApiBaseUrl({ env: { DEV: true }, origin, warn: vi.fn() });
    const insights = base.deriveApiBaseUrl({
      urlEnvVar: 'VITE_INSIGHTS_API_URL',
      devDefault: 'http://localhost:9003',
      suffix: '/insights/api',
      label: 'Insights API',
    });
    base.setRuntimeApiBase('https://rt.test');
    expect(base.apiBaseUrl()).toBe('https://rt.test');
    expect(insights()).toBe('https://rt.test/insights/api');
    base.setRuntimeApiBase('same-origin');
    expect(insights()).toBe(`${ORIGIN}/insights/api`);
  });

  it('uses the derived label in warnings', () => {
    const warn = vi.fn();
    createApiBaseUrl({ env: { DEV: true }, origin, warn })
      .deriveApiBaseUrl({ devDefault: 'http://localhost:9003', label: 'Insights API' })();
    expect(warn).toHaveBeenCalledWith(
      'Insights API base configuration missing; falling back to the local development API.',
    );
  });
});

describe('createApiBaseUrl defaults', () => {
  it('reads window.location.origin when no origin is injected', () => {
    const { apiBaseUrl } = createApiBaseUrl({ env: { DEV: false }, warn: vi.fn() });
    expect(apiBaseUrl()).toBe(window.location.origin);
  });

  it('defaults to console.warn', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { apiBaseUrl } = createApiBaseUrl({ env: { DEV: true }, origin });
      apiBaseUrl();
      expect(spy).toHaveBeenCalledWith(
        'API base configuration missing; falling back to the local development API.',
      );
    } finally {
      spy.mockRestore();
    }
  });
});
