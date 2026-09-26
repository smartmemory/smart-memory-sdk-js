// API base URL resolution, owned by the SDK (DRY-FRONTEND-1).
//
// The factory receives the app's bundler env object (`import.meta.env`) and an
// origin accessor as arguments — the SDK never reads `import.meta.env` itself,
// because it is pre-built to `dist/` and doing so would freeze env values at
// SDK build time. Apps call `createApiBaseUrl({ env: import.meta.env })` in a
// thin `src/lib/apiBaseUrl.js` adapter and re-export their historical names.

const LOCAL_API_BASE_URL = 'http://localhost:9001';
const SAME_ORIGIN = 'same-origin';

const defaultWarn = (message) => console.warn(message);

function toOriginFn(origin) {
  if (origin === undefined) return () => window.location.origin;
  return typeof origin === 'function' ? origin : () => origin;
}

/**
 * Create an app's API base URL resolver plus its runtime override.
 *
 * @param {object}   options
 * @param {object}   options.env               the app's `import.meta.env` (read at call time)
 * @param {Function|string} [options.origin]   current-origin source; defaults to `window.location.origin`
 * @param {string}   [options.urlEnvVar]       env var holding an explicit API URL ('VITE_API_URL')
 * @param {string}   [options.sameOriginEnvVar] env var selecting same-origin mode ('VITE_API_BASE')
 * @param {string}   [options.devDefault]      dev-mode fallback URL ('http://localhost:9001')
 * @param {string}   [options.suffix]          path suffix for origin/runtime-derived bases ('')
 * @param {string}   [options.label]           service label used in warnings ('API')
 * @param {Function} [options.warn]            warning sink; defaults to `console.warn`
 * @returns {{ apiBaseUrl: Function, deriveApiBaseUrl: Function, setRuntimeApiBase: Function }}
 *
 * Resolution order, applied at every call:
 *   1. runtime override 'same-origin'      -> origin + suffix
 *   2. runtime override set                -> override + suffix
 *   3. env[sameOriginEnvVar] 'same-origin' -> origin + suffix
 *   4. env[urlEnvVar] non-blank            -> trimmed, verbatim (no suffix)
 *   5. env.DEV truthy                      -> devDefault (verbatim) + warning
 *   6. otherwise (production)              -> origin + suffix + warning
 *
 * `deriveApiBaseUrl(overrides)` returns a second resolver with different
 * env-var names/defaults that shares the same runtime override — this is how
 * the Insights app's `insightsApiBaseUrl` stays consistent with `apiBaseUrl`.
 */
export function createApiBaseUrl(options = {}) {
  const { env = {}, origin, warn = defaultWarn, ...defaults } = options;
  const resolveOrigin = toOriginFn(origin);
  let runtimeApiBase;

  function makeResolver(overrides = {}) {
    const {
      urlEnvVar = 'VITE_API_URL',
      sameOriginEnvVar = 'VITE_API_BASE',
      devDefault = LOCAL_API_BASE_URL,
      suffix = '',
      label = 'API',
    } = { ...defaults, ...overrides };

    const fromOrigin = () => `${resolveOrigin()}${suffix}`;

    return function resolveApiBaseUrl() {
      if (runtimeApiBase === SAME_ORIGIN) {
        return fromOrigin();
      }
      if (runtimeApiBase) {
        return `${runtimeApiBase}${suffix}`;
      }
      if (env[sameOriginEnvVar] === SAME_ORIGIN) {
        return fromOrigin();
      }
      const configuredApiUrl = env[urlEnvVar];
      if (typeof configuredApiUrl === 'string' && configuredApiUrl.trim()) {
        return configuredApiUrl.trim();
      }
      if (env.DEV) {
        warn(`${label} base configuration missing; falling back to the local development API.`);
        return devDefault;
      }
      warn(`${label} base configuration missing in production; using the current origin.`);
      return fromOrigin();
    };
  }

  return {
    apiBaseUrl: makeResolver(),
    deriveApiBaseUrl: makeResolver,
    setRuntimeApiBase(value) {
      runtimeApiBase = typeof value === 'string' && value.trim() ? value.trim() : undefined;
    },
  };
}
