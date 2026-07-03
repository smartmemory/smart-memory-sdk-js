/**
 * Unit tests for subscribeProgress — focusing on the useCookieAuth option
 * that sets credentials: 'include' on the fetchEventSource call.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Must mock BEFORE importing the module under test (Vitest hoists vi.mock).
vi.mock('@microsoft/fetch-event-source', () => ({
  fetchEventSource: vi.fn(() => new Promise(() => {})), // never resolves (long-lived stream)
}));

import { fetchEventSource } from '@microsoft/fetch-event-source';
import { subscribeProgress } from '../../../src/progress.ts';

const noop = () => {};

describe('subscribeProgress — useCookieAuth option', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset to a fresh never-resolving mock for each test
    fetchEventSource.mockImplementation(() => new Promise(() => {}));
  });

  it('passes credentials: include when useCookieAuth is true and no token/apiKey', () => {
    subscribeProgress({
      baseUrl: 'http://localhost:9001',
      workspaceId: 'ws-1',
      useCookieAuth: true,
      onEvent: noop,
      onError: noop,
    });

    expect(fetchEventSource).toHaveBeenCalledOnce();
    const [, opts] = fetchEventSource.mock.calls[0];
    expect(opts.credentials).toBe('include');
  });

  it('does NOT pass credentials: include when useCookieAuth is false (default)', () => {
    subscribeProgress({
      baseUrl: 'http://localhost:9001',
      workspaceId: 'ws-1',
      onEvent: noop,
      onError: noop,
    });

    expect(fetchEventSource).toHaveBeenCalledOnce();
    const [, opts] = fetchEventSource.mock.calls[0];
    expect(opts.credentials).toBeUndefined();
  });

  it('does NOT pass credentials: include when token is provided even if useCookieAuth is true', () => {
    // Token takes precedence; cookie-auth is a fallback for no-token environments.
    subscribeProgress({
      baseUrl: 'http://localhost:9001',
      token: 'my-jwt-token',
      useCookieAuth: true,
      onEvent: noop,
      onError: noop,
    });

    expect(fetchEventSource).toHaveBeenCalledOnce();
    const [, opts] = fetchEventSource.mock.calls[0];
    expect(opts.credentials).toBeUndefined();
    // Bearer header is still set
    expect(opts.headers['Authorization']).toBe('Bearer my-jwt-token');
  });

  it('does NOT pass credentials: include when apiKey is provided even if useCookieAuth is true', () => {
    subscribeProgress({
      baseUrl: 'http://localhost:9001',
      apiKey: 'my-api-key',
      useCookieAuth: true,
      onEvent: noop,
      onError: noop,
    });

    expect(fetchEventSource).toHaveBeenCalledOnce();
    const [, opts] = fetchEventSource.mock.calls[0];
    expect(opts.credentials).toBeUndefined();
    expect(opts.headers['X-API-Key']).toBe('my-api-key');
  });

  it('still forwards X-Workspace-Id when using cookie auth', () => {
    subscribeProgress({
      baseUrl: 'http://localhost:9001',
      workspaceId: 'team-abc',
      useCookieAuth: true,
      onEvent: noop,
      onError: noop,
    });

    expect(fetchEventSource).toHaveBeenCalledOnce();
    const [, opts] = fetchEventSource.mock.calls[0];
    expect(opts.headers['X-Workspace-Id']).toBe('team-abc');
    expect(opts.credentials).toBe('include');
  });

  it('uses the correct SSE URL with query params', () => {
    subscribeProgress({
      baseUrl: 'http://localhost:9001',
      runId: 'run-xyz',
      fromSeq: 0,
      useCookieAuth: true,
      onEvent: noop,
      onError: noop,
    });

    const [url] = fetchEventSource.mock.calls[0];
    expect(url).toBe(
      'http://localhost:9001/memory/progress/stream?run_id=run-xyz&from_seq=0',
    );
  });

  it('close() aborts the in-flight connection', () => {
    const sub = subscribeProgress({
      baseUrl: 'http://localhost:9001',
      useCookieAuth: true,
      onEvent: noop,
      onError: noop,
    });

    const [, opts] = fetchEventSource.mock.calls[0];
    expect(opts.signal.aborted).toBe(false);
    sub.close();
    expect(opts.signal.aborted).toBe(true);
  });
});
