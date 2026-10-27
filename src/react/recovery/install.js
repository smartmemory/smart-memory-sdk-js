// Window-level recovery hooks, installed once per page (WEB-BLANK-AFTER-IDLE-1).
// - vite:preloadError: a stale chunk after a deploy reloads the page once (chunkReload.js).
// - unhandledrejection: a stale chunk from a bare import() reloads once; an auth refresh failure or a dropped
//   stream after idle is logged as handled (the SDK's AuthCore and subscribeProgress already recover; this
//   only stops it reading as a crash). Nothing here unmounts the app.
import { captureException } from '../analytics/client.js';
import { reloadOnceForChunkError, scheduleChunkReloadReset } from './chunkReload.js';
import { classifyError } from './classify.js';

/** Window event that asks RecoveryBoundary to show the "new version available" banner. */
export const NEW_VERSION_EVENT = 'sm:new-version-available';

let installed = null;

/** One log line per recovery: console.warn plus PostHog exception capture when the app has a client. */
export function logRecovery(app, operation, err) {
  const message = err && err.message ? err.message : String(err);
  console.warn(`[recovery] ${app}: ${operation}: ${message}`);
  captureException(err instanceof Error ? err : new Error(message), {
    source: app,
    component: 'RecoveryBoundary',
    operation,
  });
}

/**
 * Decide and act on an error that escaped the app. Returns the action taken:
 * 'reload' (first stale chunk), 'prompt' (stale chunk again inside the guard window),
 * 'handled' (auth refresh failure or dropped connection), 'ignored' (anything else).
 */
export function handleEscapedError(err, { app = 'app', source = 'unhandledrejection', onAuthFailure } = {}) {
  const kind = classifyError(err);
  if (kind === 'chunk') {
    if (reloadOnceForChunkError(`${app} ${source}`, err)) return 'reload';
    // Reloaded once already inside the guard window: ask instead of looping (RecoveryBoundary shows the banner).
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(NEW_VERSION_EVENT));
    return 'prompt';
  }
  if (kind === 'auth') {
    logRecovery(app, 'auth-refresh', err);
    if (typeof onAuthFailure === 'function') onAuthFailure(err);
    return 'handled';
  }
  if (kind === 'network') {
    logRecovery(app, 'network', err);
    return 'handled';
  }
  return 'ignored';
}

/**
 * Install the window hooks once. Safe to call from every render (idempotent) and on the server (no-op).
 * Returns an uninstall function.
 */
export function installRecovery({ app = 'app', onAuthFailure } = {}) {
  if (typeof window === 'undefined') return () => {};
  if (installed) {
    installed.options = { app, onAuthFailure };
    return installed.uninstall;
  }
  const state = { options: { app, onAuthFailure } };
  const onPreloadError = (event) => {
    const action = handleEscapedError(event && event.payload, { ...state.options, source: 'vite:preloadError' });
    if (action === 'reload') event.preventDefault();
  };
  const onRejection = (event) => {
    const action = handleEscapedError(event && event.reason, { ...state.options, source: 'unhandledrejection' });
    if (action === 'handled' || action === 'reload') event.preventDefault();
  };
  window.addEventListener('vite:preloadError', onPreloadError);
  window.addEventListener('unhandledrejection', onRejection);
  scheduleChunkReloadReset();
  state.uninstall = () => {
    window.removeEventListener('vite:preloadError', onPreloadError);
    window.removeEventListener('unhandledrejection', onRejection);
    installed = null;
  };
  installed = state;
  return state.uninstall;
}

/** Tests only: forget the installed hooks. */
export function resetRecoveryForTests() {
  if (installed) installed.uninstall();
  installed = null;
}
