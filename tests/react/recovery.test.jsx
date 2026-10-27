// WEB-BLANK-AFTER-IDLE-1: one table for the shared recovery module. Each row is an error that reached the app
// after idle, and the action the module must take. Nothing may leave a blank root.
import React, { Suspense, lazy } from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({ captureException: vi.fn() }));
vi.mock('../../src/react/analytics/client.js', () => ({ captureException: mocks.captureException }));

const recovery = await import('../../src/react/recovery/index.js');
const { RecoveryBoundary, handleEscapedError, CHUNK_RELOAD_FLAG } = recovery;

const CHUNK = 'Failed to fetch dynamically imported module: https://studio.smartmemory.ai/assets/Search-D2xlT62F.js';

class SessionRefreshError extends Error {
  constructor(message, status) { super(message); this.name = 'SessionRefreshError'; this.status = status; }
}

function Thrower({ error }) { throw error; }

function boundaryTree(error) {
  const Page = error === 'lazy-chunk'
    ? lazy(() => Promise.reject(new TypeError(CHUNK)))
    : () => <Thrower error={error} />;
  return (
    <RecoveryBoundary app="test">
      <Suspense fallback={null}><Page /></Suspense>
    </RecoveryBoundary>
  );
}

// via: 'boundary' (thrown during render) | 'rejection' (escaped promise, e.g. a stream or a bare import())
// expect: reload = location.reload called; action = handleEscapedError result; text = what the root shows
const ROWS = [
  { name: 'stale chunk, first time -> reload, render nothing', via: 'boundary', error: 'lazy-chunk', reloadedBefore: false, reload: true, text: '' },
  { name: 'stale chunk inside guard window -> prompt, not reload', via: 'boundary', error: 'lazy-chunk', reloadedBefore: true, reload: false, text: 'A new version of SmartMemory is available.' },
  { name: 'non-chunk render error -> crash card, not blank', via: 'boundary', error: new TypeError("Cannot read properties of undefined (reading 'toLocaleString')"), reloadedBefore: false, reload: false, text: 'Something went wrong on this page.' },
  { name: 'auth refresh failure thrown in render -> one reload (re-bootstrap)', via: 'boundary', error: new SessionRefreshError('Refresh failed: 401', 401), reloadedBefore: false, reload: true, text: '' },
  { name: 'auth refresh failure as rejection -> handled', via: 'rejection', error: new SessionRefreshError('Refresh failed: 401', 401), reloadedBefore: false, reload: false, action: 'handled', authCallback: true },
  { name: 'SSE stream dropped after sleep -> handled', via: 'rejection', error: new TypeError('Failed to fetch'), reloadedBefore: false, reload: false, action: 'handled' },
  { name: 'bare import() chunk rejection -> reload', via: 'rejection', error: new TypeError(CHUNK), reloadedBefore: false, reload: true, action: 'reload' },
  { name: 'bare import() chunk rejection inside guard -> prompt banner event', via: 'rejection', error: new TypeError(CHUNK), reloadedBefore: true, reload: false, action: 'prompt', bannerEvent: true },
  { name: 'unrelated rejection -> ignored', via: 'rejection', error: new Error('boom'), reloadedBefore: false, reload: false, action: 'ignored' },
];

describe('shared recovery module (WEB-BLANK-AFTER-IDLE-1)', () => {
  let container;
  let root;
  let reload;

  beforeEach(() => {
    vi.clearAllMocks();
    recovery.resetChunkReloadStateForTests();
    recovery.resetRecoveryForTests();
    window.sessionStorage.clear();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, pathname: '/Search', reload });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it.each(ROWS)('$name', async (row) => {
    if (row.reloadedBefore) window.sessionStorage.setItem(CHUNK_RELOAD_FLAG, `/Search|${Date.now() - 1000}`);

    if (row.via === 'boundary') {
      await act(async () => { root.render(boundaryTree(row.error)); });
      await act(async () => {});
      expect(reload).toHaveBeenCalledTimes(row.reload ? 1 : 0);
      expect(container.textContent.trim().startsWith(row.text)).toBe(true);
      if (row.text === '') expect(container.textContent).toBe('');
      else expect(container.querySelector('button').textContent).toBe('Reload');
      return;
    }

    const onAuthFailure = vi.fn();
    const banner = vi.fn();
    window.addEventListener(recovery.NEW_VERSION_EVENT, banner);
    const action = handleEscapedError(row.error, { app: 'test', onAuthFailure });
    window.removeEventListener(recovery.NEW_VERSION_EVENT, banner);
    expect(action).toBe(row.action);
    expect(reload).toHaveBeenCalledTimes(row.reload ? 1 : 0);
    expect(onAuthFailure).toHaveBeenCalledTimes(row.authCallback ? 1 : 0);
    expect(banner).toHaveBeenCalledTimes(row.bannerEvent ? 1 : 0);
    if (action === 'handled') expect(mocks.captureException).toHaveBeenCalledTimes(1);
  });

  it('window hooks: a prompt event shows the banner over a live app, and unhandledrejection is wired', async () => {
    await act(async () => { root.render(<RecoveryBoundary app="test"><p>live app</p></RecoveryBoundary>); });
    window.sessionStorage.setItem(CHUNK_RELOAD_FLAG, `/Search|${Date.now() - 1000}`);
    const event = new Event('unhandledrejection', { cancelable: true });
    event.reason = new TypeError(CHUNK);
    await act(async () => { window.dispatchEvent(event); });
    expect(reload).not.toHaveBeenCalled();
    expect(container.textContent).toContain('live app');
    expect(container.textContent).toContain('A new version of SmartMemory is available.');
  });
});
