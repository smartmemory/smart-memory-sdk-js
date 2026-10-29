// Stale-tab check (WEB-STALE-TAB-VERSION-CHECK-1). A tab that outlives a deploy keeps running the old entry
// bundle, and nothing throws until (maybe) a lazy import fails, so the reactive chunk recovery never runs.
// When the tab comes back, fetch /index.html (served no-cache), compare its entry script with the one this
// page booted from, and reload once through the shared chunk-reload guard so it can never loop.
import { reloadOnceForChunkError } from './chunkReload.js';
import { NEW_VERSION_EVENT } from './install.js';

export const VERSION_CHECK_MIN_INTERVAL_MS = 60 * 1000;

const SCRIPT_TAG = /<script\b[^>]*>/gi;

function attr(tag, name) {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return m ? (m[1] ?? m[2] ?? m[3]) : null;
}

/** The `src` of the first `<script type="module" src=...>` in an HTML string, or null. */
export function parseEntrySrc(html) {
  for (const tag of String(html || '').match(SCRIPT_TAG) || []) {
    if ((attr(tag, 'type') || '').toLowerCase() === 'module' && attr(tag, 'src')) return attr(tag, 'src');
  }
  return null;
}

function entryPath(src) {
  try {
    return new URL(src, window.location.href).pathname;
  } catch {
    return src;
  }
}

/**
 * Install the focus / visibility check once per call. `dev` is passed by the app (`import.meta.env.DEV`):
 * the SDK never reads the bundler env itself (see apiBaseUrl.js), and a dev server has no hashed entry.
 * Returns an uninstall function; a no-op on the server, in dev, or when the page has no module entry script.
 */
export function installVersionCheck({ app = 'app', dev = false, minIntervalMs = VERSION_CHECK_MIN_INTERVAL_MS } = {}) {
  if (typeof window === 'undefined' || typeof document === 'undefined' || dev) return () => {};
  const bootScript = document.querySelector('script[type=module][src]');
  const bootEntry = bootScript ? entryPath(bootScript.getAttribute('src')) : null;
  if (!bootEntry) return () => {};

  let lastCheckAt = 0;
  let inFlight = false;

  const check = async () => {
    const now = Date.now();
    if (inFlight || now - lastCheckAt < minIntervalMs) return;
    lastCheckAt = now;
    inFlight = true;
    try {
      const res = await fetch('/index.html', { cache: 'no-store' });
      if (!res.ok) {
        console.warn(`[versionCheck] ${app}: /index.html returned ${res.status}, not checking`);
        return;
      }
      const src = parseEntrySrc(await res.text());
      if (!src) {
        console.warn(`[versionCheck] ${app}: no module entry script in /index.html, not checking`);
        return;
      }
      if (entryPath(src) === bootEntry) return;
      if (!reloadOnceForChunkError(`${app} version-check`, `entry changed ${bootEntry} -> ${entryPath(src)}`)) {
        // Already reloaded once inside the guard window: ask instead of looping (RecoveryBoundary shows the banner).
        window.dispatchEvent(new CustomEvent(NEW_VERSION_EVENT));
      }
    } catch (err) {
      console.warn(`[versionCheck] ${app}: fetch failed, not checking`, err);
    } finally {
      inFlight = false;
    }
  };

  const onVisibility = () => {
    if (document.visibilityState === 'visible') check();
  };
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('focus', check);
  return () => {
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('focus', check);
  };
}
