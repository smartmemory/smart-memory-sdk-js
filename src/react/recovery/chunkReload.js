// Lifted from smart-memory-web src/lib/chunkReload.js (WEB-STALE-CHUNK-AFTER-DEPLOY-1,
// WEB-STALE-CHUNK-PREVENTED-IMPORT-1) into the SDK so every app shares it (WEB-BLANK-AFTER-IDLE-1).
//
// Recovery for a tab that outlived a deploy. The tab still runs the old index
// bundle, so a lazy route asks for a hashed chunk the deploy removed. Reload
// once to pick up the new index, and never loop.
//
// Vite wraps dynamic imports in `__vitePreload` and, when the import or a CSS
// preload fails, dispatches a cancelable `vite:preloadError` window event with
// the error in `event.payload` (node_modules/vite/dist/node/chunks/dep-*.js,
// `handlePreloadError`; the CSS message is `Unable to preload CSS for <dep>`).

export const CHUNK_RELOAD_FLAG = 'sm:chunk-reload';
export const CHUNK_RELOAD_WINDOW_MS = 5 * 60 * 1000;
export const CHUNK_RELOAD_HEALTHY_MS = 10 * 1000;
// How long a started reload counts as "in flight". A reload that never
// navigates must not hide a real crash behind a blank page for ever.
export const CHUNK_RELOAD_INFLIGHT_MS = 10 * 1000;

const CHUNK_MESSAGES = [
  'Failed to fetch dynamically imported module', // Chrome, Edge
  'error loading dynamically imported module', // Firefox
  'Importing a module script failed', // Safari
  'Unable to preload CSS', // vite
];

let chunkErrorSeen = false;
let reloadInFlightUntil = 0;

/**
 * True while a reload started for a chunk error is on its way. `preventDefault`
 * on `vite:preloadError` makes the dynamic import resolve with `undefined`, so
 * React `lazy()` (and any `.then((m) => m.x)`) throws a follow-on TypeError
 * that is not a chunk error. Callers that would capture or show that error
 * use this to stay quiet until the page reloads.
 */
export function isChunkReloadInFlight() {
  return Date.now() < reloadInFlightUntil;
}

export function isChunkLoadError(err) {
  if (!err) return false;
  if (err.name === 'ChunkLoadError') return true;
  const message = typeof err === 'string' ? err : String(err.message || '');
  return CHUNK_MESSAGES.some((m) => message.includes(m));
}

function failedUrl(err) {
  const message = typeof err === 'string' ? err : String((err && err.message) || '');
  const match = message.match(/https?:\/\/\S+|\/assets\/\S+/);
  return match ? match[0] : 'unknown';
}

/**
 * Reload the page once for a chunk error. Returns true when a reload was
 * started, false when one already happened in the last 5 minutes or the flag
 * cannot be stored (the caller then shows the manual "new version" notice).
 */
export function reloadOnceForChunkError(reason, err) {
  chunkErrorSeen = true;
  const url = failedUrl(err);
  let storage;
  try {
    storage = window.sessionStorage;
    const raw = storage.getItem(CHUNK_RELOAD_FLAG);
    if (raw) {
      const at = Number(raw.slice(raw.lastIndexOf('|') + 1));
      if (Number.isFinite(at) && Date.now() - at < CHUNK_RELOAD_WINDOW_MS) {
        console.warn(`chunkReload: ${reason} failed again after a reload (${url}), not reloading`);
        return false;
      }
    }
    storage.setItem(CHUNK_RELOAD_FLAG, `${window.location.pathname}|${Date.now()}`);
  } catch {
    console.warn(`chunkReload: ${reason} (${url}) but sessionStorage is unavailable, not reloading to avoid a loop`);
    return false;
  }
  console.warn(`chunkReload: ${reason} (${url}), reloading once to pick up the new version`);
  reloadInFlightUntil = Date.now() + CHUNK_RELOAD_INFLIGHT_MS;
  try {
    window.location.reload();
  } catch (e) {
    reloadInFlightUntil = 0;
    console.warn(`chunkReload: reload failed (${url}), not hiding errors`, e);
    return false;
  }
  return true;
}

/** True when a chunk reload was stamped less than the guard window ago (the next chunk error prompts instead). */
export function chunkReloadedRecently(now = Date.now()) {
  try {
    const raw = window.sessionStorage.getItem(CHUNK_RELOAD_FLAG);
    if (!raw) return false;
    const at = Number(raw.slice(raw.lastIndexOf('|') + 1));
    return Number.isFinite(at) && now - at < CHUNK_RELOAD_WINDOW_MS;
  } catch {
    return true;
  }
}

/** Forget the reload once the app has run 10 s with no chunk error, so a later deploy can reload again. */
export function scheduleChunkReloadReset() {
  setTimeout(() => {
    if (chunkErrorSeen) return;
    try {
      window.sessionStorage.removeItem(CHUNK_RELOAD_FLAG);
    } catch {
      // storage unavailable: nothing was stored
    }
  }, CHUNK_RELOAD_HEALTHY_MS);
}

/** Install the vite preload listener. Returns an uninstall function. */
export function installChunkReload() {
  const onPreloadError = (event) => {
    if (reloadOnceForChunkError('vite:preloadError', event && event.payload)) {
      event.preventDefault();
    }
  };
  window.addEventListener('vite:preloadError', onPreloadError);
  scheduleChunkReloadReset();
  return () => window.removeEventListener('vite:preloadError', onPreloadError);
}

export function resetChunkReloadStateForTests() {
  chunkErrorSeen = false;
  reloadInFlightUntil = 0;
}
