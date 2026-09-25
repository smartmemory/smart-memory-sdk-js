import { afterEach, expect, it, vi } from 'vitest';
import { subscribeProgress } from '../src/progress.ts';
import { AuthCore } from '../src/auth/AuthCore.js';
let subscription;
afterEach(() => { subscription?.close(); vi.restoreAllMocks(); });
it('uses the real SSE parser and real auth refresh across EOF, then closes the transport', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  let streamController;
  const encoder = new TextEncoder();
  const calls = [];
  const transport = vi.fn(async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith('/auth/refresh')) {
      return new Response(JSON.stringify({ access_token: 'new' }));
    }
    const streams = calls.filter(call => !call.url.endsWith('/auth/refresh'));
    if (streams.length === 1) return new Response(null, { status: 401 });
    if (streams.length === 2) return new Response(
      'id: 123000-99\ndata: {"run_id":"r","scope":"ws","seq":0,"ts":123,"kind":"stage","status":"ok","payload":{}}\n\n',
      { headers: { 'content-type': 'text/event-stream' } },
    );
    return new Response(new ReadableStream({ start(controller) {
      streamController = controller;
      controller.enqueue(encoder.encode('id: 123001-1\ndata: {"run_id":"r","scope":"ws","seq":1,"ts":123.001,"kind":"stage","status":"ok","payload":{}}\n\n'));
    } }), { headers: { 'content-type': 'text/event-stream' } });
  });
  const auth = new AuthCore({ mode: 'sso', storage: 'memory', apiBaseUrl: 'https://service.test', fetchFn: transport });
  auth.currentToken = 'old';
  const onEvent = vi.fn(), onError = vi.fn();
  subscription = subscribeProgress({ baseUrl: auth.apiBaseUrl, auth, fetchFn: transport, onEvent, onError });
  await vi.waitFor(() => expect(onEvent).toHaveBeenCalledTimes(2), { timeout: 2500 });
  expect(calls).toHaveLength(4);
  expect(new Headers(calls[0].init.headers).get('Authorization')).toBe('Bearer old');
  expect(new Headers(calls[2].init.headers).get('Authorization')).toBe('Bearer new');
  expect(calls[3].url).toContain('since=123000-99');
  // fetch-event-source mutates its private header copy on subsequent frames.
  expect(new Headers(calls[3].init.headers).get('Authorization')).toBe('Bearer new');
  subscription.close();
  expect(calls[3].init.signal.aborted).toBe(true);
  streamController.close();
  expect(onError).not.toHaveBeenCalled();
});
