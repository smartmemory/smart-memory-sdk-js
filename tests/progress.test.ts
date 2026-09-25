import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchEventSource } from '@microsoft/fetch-event-source';
import { subscribeProgress, type SubscribeProgressOptions, type ProgressEvent } from '../src/progress';
import { AuthCore } from '../src/auth/AuthCore.js';
vi.mock('@microsoft/fetch-event-source', () => ({ fetchEventSource: vi.fn() }));
const mock = vi.mocked(fetchEventSource);
let handles: { close(): void }[];
const event: ProgressEvent = { run_id: 'r', scope: 'ws', seq: 4, ts: 123, kind: 'stage', status: 'skipped', payload: {} };
const latest = () => mock.mock.calls.at(-1)![1];
const start = (options: Partial<SubscribeProgressOptions> = {}) => {
  const onEvent = vi.fn(), onError = vi.fn(), onReconnect = vi.fn();
  const handle = subscribeProgress({ onEvent, onError, onReconnect, ...options });
  handles.push(handle);
  return { ...handle, onEvent, onError, onReconnect };
};
const message = (id = '123000-42') => latest().onmessage!({ id, data: JSON.stringify(event), event: '' });
const fail = (error = new Error('offline')) => { expect(() => latest().onerror!(error)).toThrow(error); };
beforeEach(() => {
  vi.useFakeTimers(); handles = [];
  mock.mockReset().mockImplementation(() => new Promise(() => {}));
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { handles.forEach(handle => handle.close()); vi.useRealTimers(); vi.restoreAllMocks(); });
describe('resumable progress', () => {
  it('delivers typed skipped events unchanged', () => {
    const sub = start(); message(); expect(sub.onEvent).toHaveBeenCalledWith(event);
  });
  it('keeps the progress API on its dedicated subpath', async () => {
    expect((await import('../src/index.js'))).not.toHaveProperty('subscribeProgress');
  });
  it('reopens EOF with a live credential and exact scope cursor in URL and header', async () => {
    let token = 'old';
    const sub = start({ getHeaders: () => ({ Authorization: `Bearer ${token}` }) });
    message(); token = 'new'; const old = latest(); old.onclose!();
    expect(sub.onReconnect).toHaveBeenCalledOnce();
    expect(old.signal!.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(mock).toHaveBeenCalledTimes(2);
    expect(mock.mock.calls[1][0]).toContain('since=123000-42');
    expect(latest().headers).toMatchObject({ Authorization: 'Bearer new', 'Last-Event-ID': '123000-42' });
    expect(sub.onError).not.toHaveBeenCalled();
  });
  it('resumes inclusive run replay at the next sequence, without a scope cursor', async () => {
    start({ runId: 'r', fromSeq: 0 }); message(); latest().onclose!();
    await vi.advanceTimersByTimeAsync(1000);
    expect(mock.mock.calls[1][0]).toContain('run_id=r&from_seq=5');
    expect(latest().headers).not.toHaveProperty('Last-Event-ID');
  });
  it('uses bounded exponential backoff with no finite retry budget', async () => {
    const sub = start();
    for (const delay of [1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000]) {
      const count = mock.mock.calls.length;
      fail();
      await vi.advanceTimersByTimeAsync(delay - 1);
      expect(mock).toHaveBeenCalledTimes(count);
      await vi.advanceTimersByTimeAsync(1);
      expect(mock).toHaveBeenCalledTimes(count + 1);
    }
    expect(sub.onError).not.toHaveBeenCalled();
    expect(sub.onReconnect).toHaveBeenCalledTimes(8);
  });
  it('does not reset backoff on open-and-immediate-EOF loops', async () => {
    start();
    await latest().onopen!(new Response(null)); latest().onclose!();
    await vi.advanceTimersByTimeAsync(1000);
    await latest().onopen!(new Response(null)); latest().onclose!();
    await vi.advanceTimersByTimeAsync(1000); expect(mock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1000); expect(mock).toHaveBeenCalledTimes(3);
  });
  it('resets backoff after delivery', async () => {
    start(); fail(); await vi.advanceTimersByTimeAsync(1000);
    fail(); await vi.advanceTimersByTimeAsync(2000);
    message(); fail(); await vi.advanceTimersByTimeAsync(1000);
    expect(mock).toHaveBeenCalledTimes(4);
  });
  it.each([400, 401, 403, 404, 422])('stops unaided terminal HTTP %i', async status => {
    const sub = start();
    await expect(latest().onopen!(new Response(null, { status }))).rejects.toThrow(String(status));
    expect(latest().signal!.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(60000);
    expect(mock).toHaveBeenCalledOnce(); expect(sub.onError).toHaveBeenCalledOnce();
  });
  it.each([408, 429, 500, 503])('retries transient HTTP %i', async status => {
    const sub = start();
    const error = await latest().onopen!(new Response(null, { status })).catch(e => e);
    fail(error); await vi.advanceTimersByTimeAsync(1000);
    expect(mock).toHaveBeenCalledTimes(2); expect(sub.onError).not.toHaveBeenCalled();
  });
  it('refreshes a 401 once and rebuilds auth headers; second 401 signs out', async () => {
    const auth = new AuthCore({ mode: 'sso', apiBaseUrl: '', storage: 'memory' });
    auth.currentToken = 'old';
    vi.spyOn(auth, 'refreshToken').mockImplementation(async () => { auth.currentToken = 'new'; return 'new'; });
    const sub = start({ auth });
    await expect(latest().onopen!(new Response(null, { status: 401 }))).rejects.toThrow('401');
    await vi.advanceTimersByTimeAsync(0);
    expect(latest().headers).toMatchObject({ Authorization: 'Bearer new' });
    await expect(latest().onopen!(new Response(null, { status: 401 }))).rejects.toThrow('401');
    expect(auth.refreshToken).toHaveBeenCalledOnce();
    expect(auth.currentToken).toBeNull(); expect(sub.onError).toHaveBeenCalledOnce();
  });
  it('keeps auth and retries after a transient refresh failure', async () => {
    const auth = new AuthCore({ mode: 'sso', apiBaseUrl: '', storage: 'memory' });
    auth.currentToken = 'old';
    vi.spyOn(auth, 'refreshToken').mockRejectedValue(Object.assign(new Error('offline'), { recoverable: true }));
    const sub = start({ auth });
    await expect(latest().onopen!(new Response(null, { status: 401 }))).rejects.toThrow();
    expect(auth.currentToken).toBe('old'); expect(auth.connection.snapshot.status).toBe('reconnecting');
    await vi.advanceTimersByTimeAsync(1000);
    expect(mock).toHaveBeenCalledTimes(2); expect(sub.onError).not.toHaveBeenCalled();
  });
  it('visible/online replace transport immediately, hide does not, and close removes listeners', async () => {
    const sub = start(); const old = latest();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0); expect(mock).toHaveBeenCalledOnce();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0); expect(mock).toHaveBeenCalledTimes(2);
    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(0); expect(mock).toHaveBeenCalledTimes(3);
    old.onmessage!({ id: '1-0', data: JSON.stringify(event), event: '' });
    expect(sub.onEvent).not.toHaveBeenCalled();
    sub.close(); sub.close();
    expect(latest().signal!.aborted).toBe(true);
    window.dispatchEvent(new Event('online')); document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(60000); expect(mock).toHaveBeenCalledTimes(3);
  });
  it('close cancels a scheduled reconnect and removes its connection warning', async () => {
    const auth = new AuthCore({ mode: 'sso', storage: 'memory', apiBaseUrl: '' });
    const sub = start({ auth }); fail(); sub.close();
    await vi.advanceTimersByTimeAsync(60000);
    expect(mock).toHaveBeenCalledOnce(); expect(auth.connection.snapshot.status).toBe('connected');
  });
  it('close during refresh suppresses late reopen and callbacks', async () => {
    const auth = new AuthCore({ mode: 'sso', apiBaseUrl: '', storage: 'memory' });
    let release!: () => void;
    vi.spyOn(auth, 'refreshToken').mockImplementation(() => new Promise(resolve => { release = () => resolve('new'); }));
    const sub = start({ auth });
    const opening = latest().onopen!(new Response(null, { status: 401 })).catch(() => {});
    sub.close(); release(); await opening; await vi.advanceTimersByTimeAsync(60000);
    expect(mock).toHaveBeenCalledOnce(); expect(sub.onReconnect).not.toHaveBeenCalled();
  });
  it('logs malformed frames without delivering or advancing cursor', async () => {
    const sub = start();
    latest().onmessage!({ id: '100-0', data: '{bad', event: '' });
    latest().onclose!(); await vi.advanceTimersByTimeAsync(1000);
    expect(sub.onEvent).not.toHaveBeenCalled(); expect(console.warn).toHaveBeenCalled();
    expect(mock.mock.calls[1][0]).not.toContain('since=');
  });
  it('completes deliberate finite replay on EOF', async () => {
    const onComplete = vi.fn(); const sub = start({ reconnect: false, onComplete });
    latest().onclose!(); await vi.advanceTimersByTimeAsync(60000);
    expect(onComplete).toHaveBeenCalledOnce(); expect(sub.onError).not.toHaveBeenCalled();
    expect(sub.onReconnect).not.toHaveBeenCalled(); expect(mock).toHaveBeenCalledOnce();
  });
});
it('stops on workspace change rather than reusing another scope cursor', async () => {
  let workspace = 'one';
  const sub = start({ getHeaders: () => ({ 'X-Workspace-Id': workspace }) });
  message(); latest().onclose!(); workspace = 'two';
  await vi.advanceTimersByTimeAsync(1000);
  expect(mock).toHaveBeenCalledOnce();
  expect(sub.onError).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('workspace changed') }));
});
