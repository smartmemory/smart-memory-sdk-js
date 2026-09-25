/**
 * @internal
 *
 * subscribeProgress — SSE subscriber for the /memory/progress/stream endpoint.
 *
 * Marked @internal: NOT exported from the package public entry (src/index.js).
 * Consumed only by smart-memory-graph, smart-memory-studio, smart-memory-insights
 * via deep/subpath import: `smart-memory-sdk-js/progress` or relative path.
 *
 * Why @microsoft/fetch-event-source instead of native EventSource:
 *   Native EventSource cannot attach custom request headers (Authorization, X-API-Key).
 *   Most SmartMemory API endpoints use header-based auth (Bearer JWT or X-API-Key).
 *   When running under SSO/cookie auth, pass useCookieAuth: true — fetch-event-source
 *   then sends credentials: 'include' so the browser's session cookie is forwarded.
 *   fetch-event-source wraps fetch() and exposes the full options object.
 *
 * Contract reference: progress-event-contract.json v1.6.0 — ClientSDKMethod.js
 *   Signature: subscribeProgress({ runId, fromSeq, since, onEvent, onError, onReconnect }) → { close() }
 *   Scope is NEVER a client-supplied parameter — the server derives it from the JWT workspace.
 */

import { fetchEventSource } from '@microsoft/fetch-event-source';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Wire shape per ProgressEvent in progress-event-contract.json v1.6.0 */
export interface ProgressEvent {
  run_id: string;
  scope: string;
  seq: number;
  ts: number;
  kind: string;
  status: 'started' | 'progress' | 'ok' | 'warn' | 'error' | 'skipped';
  payload: Record<string, unknown>;
  /** Optional — pipeline stage name when applicable */
  stage?: string | null;
}

export interface ProgressAuth {
  getAuthHeaders(): Record<string, string>;
  getRequestOptions(options?: RequestInit): RequestInit;
  refreshToken(): Promise<unknown>;
  clearLocalAuth(): void;
  connection?: ProgressConnection;
}
export interface ProgressConnection {
  report(source: string | symbol, reason: string | null): void;
}
export interface SubscribeProgressOptions {
  baseUrl?: string;
  /** Static credentials remain supported. Prefer auth for session recovery. */
  token?: string;
  apiKey?: string;
  workspaceId?: string;
  auth?: ProgressAuth;
  /** Synchronous live headers, read on every connection; overrides static headers. */
  getHeaders?: () => Record<string, string>;
  connection?: ProgressConnection;
  fetchFn?: typeof fetch;
  runId?: string;
  fromSeq?: number;
  since?: string;
  useCookieAuth?: boolean;
  /** Default true. Set false for deliberate finite replay; EOF invokes onComplete. */
  reconnect?: boolean;
  onComplete?: () => void;
  onEvent: (event: ProgressEvent) => void;
  /** Terminal errors only; transient interruption invokes onReconnect. */
  onError: (err: unknown) => void;
  onReconnect?: () => void;
}
export interface ProgressSubscription { close(): void; }

/** Resumable SSE with a single owner for timers, credentials, and cancellation. */
export function subscribeProgress(options: SubscribeProgressOptions): ProgressSubscription {
  const { auth, onEvent, onError, onReconnect } = options;
  const connection = options.connection || auth?.connection;
  const source = Symbol('progress');
  let closed = false;
  let generation = 0;
  let controller: AbortController | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let failures = 0;
  let authRetried = false;
  let fromSeq = options.fromSeq;
  let cursor = options.since;
  let initialWorkspace: string | null | undefined;

  function stop() {
    generation++;
    clearTimeout(timer);
    controller?.abort();
  }
  function close() {
    if (closed) return;
    closed = true;
    stop();
    if (typeof window !== 'undefined') window.removeEventListener('online', resume);
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', resume);
    connection?.report(source, null);
  }
  function terminal(error: unknown) {
    console.warn('[progress] Stream cannot recover', error);
    close();
    onError(error);
  }
  function recover(error: unknown, delay?: number) {
    if (closed) return;
    stop();
    console.warn('[progress] Stream interrupted; reconnecting', error);
    connection?.report(source, error instanceof Error ? error.message : String(error));
    timer = setTimeout(open, delay ?? Math.min(1000 * 2 ** Math.min(failures++, 5), 30000));
    onReconnect?.();
  }
  function resume() {
    if (closed || (typeof document !== 'undefined' && document.visibilityState === 'hidden')) return;
    recover(new Error('Resuming after visibility/network return'), 0);
  }
  function open() {
    if (closed) return;
    const current = ++generation;
    const active = () => !closed && current === generation;
    controller = new AbortController();
    const params = new URLSearchParams();
    if (options.runId !== undefined) {
      params.set('run_id', options.runId);
      if (fromSeq !== undefined) params.set('from_seq', String(fromSeq));
    } else if (cursor !== undefined) params.set('since', cursor);
    const url = `${options.baseUrl || ''}/memory/progress/stream${params.size ? '?' + params : ''}`;
    try {
      const headers: Record<string, string> = { Accept: 'text/event-stream' };
      if (!auth && !options.getHeaders) {
        if (options.token) headers.Authorization = `Bearer ${options.token}`;
        else if (options.apiKey) headers['X-API-Key'] = options.apiKey;
        if (options.workspaceId) headers['X-Workspace-Id'] = options.workspaceId;
      }
      Object.assign(headers, auth?.getAuthHeaders(), options.getHeaders?.());
      const workspace = new Headers(headers).get('X-Workspace-Id');
      if (initialWorkspace !== undefined && workspace !== initialWorkspace) {
        terminal(new Error('Progress workspace changed; create a new subscription'));
        return;
      }
      initialWorkspace = workspace;
      if (cursor && options.runId === undefined) headers['Last-Event-ID'] = cursor;
      const requestOptions = auth?.getRequestOptions({ headers }) || {
        headers,
        ...(options.useCookieAuth ? { credentials: 'include' as const } : {}),
      };
      const pending = fetchEventSource(url, {
        ...requestOptions,
        headers: requestOptions.headers as Record<string, string>,
        fetch: options.fetchFn,
        signal: controller.signal,
        openWhenHidden: true,
        async onopen(response) {
          if (!active()) return;
          if (response.ok) {
            authRetried = false;
            connection?.report(source, null);
            return;
          }
          const error = new Error(`SSE connection failed: HTTP ${response.status}`);
          if (response.status === 401 && auth && !authRetried) {
            try {
              await auth.refreshToken();
              if (active()) { authRetried = true; recover(error, 0); }
            } catch (refreshError) {
              if (active()) {
                if ((refreshError as { recoverable?: boolean }).recoverable === false) terminal(refreshError);
                else recover(refreshError);
              }
            }
          } else if (response.status >= 400 && response.status < 500 && response.status !== 429 && response.status !== 408) {
            if (response.status === 401) auth?.clearLocalAuth();
            terminal(error);
          }
          throw error;
        },
        onmessage(message) {
          if (!active() || !message.data) return;
          let event: ProgressEvent;
          try { event = JSON.parse(message.data); }
          catch (error) { console.warn('[progress] Skipping malformed SSE frame', error); return; }
          // Advance only after consumer delivery succeeds.
          onEvent(event);
          failures = 0;
          if (options.runId !== undefined && typeof event.seq === 'number') fromSeq = Math.max(fromSeq ?? 0, event.seq + 1);
          else if (message.id) cursor = message.id;
        },
        onerror(error) {
          // Throw disables fetch-event-source's internal retry loop. We own retries.
          if (active()) recover(error);
          throw error;
        },
        onclose() {
          if (!active()) return;
          if (options.reconnect === false) { close(); options.onComplete?.(); }
          else recover(new Error('SSE connection closed by server'));
        },
      });
      pending?.catch(error => { if (active()) recover(error); });
    } catch (error) { if (active()) recover(error); }
  }
  if (typeof window !== 'undefined') window.addEventListener('online', resume);
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', resume);
  open();
  return { close };
}
