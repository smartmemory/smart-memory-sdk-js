// WEB-STALE-TAB-VERSION-CHECK-1: one table for the stale-tab version check, plus LazyFallback timing.
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../../src/react/analytics/client.js', () => ({ captureException: vi.fn() }));

const recovery = await import('../../src/react/recovery/index.js');
const { installVersionCheck, parseEntrySrc, LazyFallback } = recovery;

const page = (entry) => `<!doctype html><html><head><script type="module" crossorigin src="${entry}"></script></head><body></body></html>`;
const BOOT = '/assets/index-AAA.js';
const OK = (entry) => ({ ok: true, status: 200, text: async () => page(entry) });

// fetches: one response (or error) per check. checks = how many focus events fire (60 s throttle disabled).
// expect: reload = times location.reload ran; warn = console.warn lines starting with [versionCheck]
const ROWS = [
  { name: 'same entry -> no reload', fetches: [OK(BOOT)], reload: 0, warn: 0 },
  { name: 'changed entry -> reload once', fetches: [OK('/assets/index-BBB.js')], reload: 1, warn: 0 },
  { name: 'changed again in the same session -> no second reload, prompt banner', fetches: [OK('/assets/index-BBB.js'), OK('/assets/index-CCC.js')], reload: 1, warn: 0, banner: 1 },
  { name: 'fetch error -> no reload, one warn', fetches: [new TypeError('Failed to fetch')], reload: 0, warn: 1 },
  { name: 'non-200 -> no reload, one warn', fetches: [{ ok: false, status: 503, text: async () => 'down' }], reload: 0, warn: 1 },
  { name: 'index.html without a module script -> no reload, one warn', fetches: [{ ok: true, status: 200, text: async () => '<html><script src="/x.js"></script></html>' }], reload: 0, warn: 1 },
  { name: 'page booted without a module script -> not installed', bootScript: false, fetches: [OK('/assets/index-BBB.js')], reload: 0, warn: 0, fetchCalls: 0 },
  { name: 'dev -> not installed', dev: true, fetches: [OK('/assets/index-BBB.js')], reload: 0, warn: 0, fetchCalls: 0 },
];

describe('installVersionCheck (WEB-STALE-TAB-VERSION-CHECK-1)', () => {
  let reload;
  let fetchMock;
  let bootEl;

  beforeEach(() => {
    recovery.resetChunkReloadStateForTests();
    window.sessionStorage.clear();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, pathname: '/dashboard', reload });
    bootEl = document.createElement('script');
    bootEl.type = 'module';
    bootEl.src = BOOT;
    document.head.appendChild(bootEl);
  });

  afterEach(() => {
    bootEl.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it.each(ROWS)('$name', async (row) => {
    if (row.bootScript === false) bootEl.remove();
    const queue = [...row.fetches];
    fetchMock = vi.fn(async () => {
      const next = queue.shift();
      if (next instanceof Error) throw next;
      return next;
    });
    vi.stubGlobal('fetch', fetchMock);
    const banner = vi.fn();
    window.addEventListener(recovery.NEW_VERSION_EVENT, banner);
    const uninstall = installVersionCheck({ app: 'test', dev: row.dev === true, minIntervalMs: 0 });
    for (let i = 0; i < row.fetches.length; i += 1) {
      await act(async () => { window.dispatchEvent(new Event('focus')); });
    }
    uninstall();
    window.removeEventListener(recovery.NEW_VERSION_EVENT, banner);

    expect(reload).toHaveBeenCalledTimes(row.reload);
    expect(fetchMock).toHaveBeenCalledTimes(row.fetchCalls ?? row.fetches.length);
    if (row.fetchCalls !== 0) expect(fetchMock).toHaveBeenCalledWith('/index.html', { cache: 'no-store' });
    expect(console.warn.mock.calls.filter(([m]) => String(m).startsWith('[versionCheck]')).length).toBe(row.warn);
    expect(banner).toHaveBeenCalledTimes(row.banner ?? 0);
  });

  it('visibilitychange to visible checks, hidden does not, and the 60 s throttle holds', async () => {
    fetchMock = vi.fn(async () => OK(BOOT));
    vi.stubGlobal('fetch', fetchMock);
    const uninstall = installVersionCheck({ app: 'test' });
    const setVisibility = (v) => Object.defineProperty(document, 'visibilityState', { value: v, configurable: true });
    setVisibility('hidden');
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(fetchMock).not.toHaveBeenCalled();
    setVisibility('visible');
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    uninstall();
    setVisibility('visible');
  });

  it('parseEntrySrc finds the module entry and ignores classic scripts', () => {
    expect(parseEntrySrc(page('/assets/index-X.js'))).toBe('/assets/index-X.js');
    expect(parseEntrySrc('<script src="/a.js"></script>')).toBeNull();
    expect(parseEntrySrc("<script type='module' src='/b.js'>")).toBe('/b.js');
  });
});

describe('LazyFallback timing', () => {
  let container;
  let root;
  let reload;
  beforeEach(() => {
    vi.useFakeTimers();
    reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('empty at first, spinner after 1 s, Reload button after 10 s', async () => {
    await act(async () => { root.render(<LazyFallback />); });
    expect(container.textContent).toBe('');
    await act(async () => { vi.advanceTimersByTime(1100); });
    expect(container.querySelector('.sm-lazy-fallback')).not.toBeNull();
    expect(container.querySelector('button')).toBeNull();
    await act(async () => { vi.advanceTimersByTime(9000); });
    expect(container.textContent).toContain('Still loading.');
    act(() => container.querySelector('button').click());
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
