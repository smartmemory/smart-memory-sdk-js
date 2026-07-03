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
 * Contract reference: progress-event-contract.json v1.3.0 — ClientSDKMethod.js
 *   Signature: subscribeProgress({ runId, fromSeq, since, onEvent, onError, onReconnect }) → { close() }
 *   Scope is NEVER a client-supplied parameter — the server derives it from the JWT workspace.
 */

import { fetchEventSource } from '@microsoft/fetch-event-source';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Wire shape per ProgressEvent in progress-event-contract.json v1.3.0 */
export interface ProgressEvent {
  run_id: string;
  scope: string;
  seq: number;
  ts: number;
  kind: string;
  status: 'started' | 'progress' | 'ok' | 'warn' | 'error';
  payload: Record<string, unknown>;
  /** Optional — pipeline stage name when applicable */
  stage?: string | null;
}

export interface SubscribeProgressOptions {
  /** Base URL of the SmartMemory API. Defaults to '' (same origin). */
  baseUrl?: string;

  /** Bearer JWT token. Required unless apiKey is provided. */
  token?: string;

  /** API key. Used as X-API-Key header when no token is provided. */
  apiKey?: string;

  /**
   * Active workspace / team id. Forwarded as `X-Workspace-Id` so the server's
   * team_required scope policy resolves the tenant. Without it, the progress
   * route returns 400 "Team context is required".
   */
  workspaceId?: string;

  /**
   * Filter to a single run (run_replay mode).
   * Must accompany fromSeq; omit for live mode.
   */
  runId?: string;

  /**
   * Per-run replay starting sequence (0 = from start of stream window).
   * Requires runId. Mutually exclusive with since.
   */
  fromSeq?: number;

  /**
   * Redis stream ID (<ms>-<seq>) to resume from (scope_resume mode).
   * Used when reconnecting via Last-Event-ID.
   * Mutually exclusive with fromSeq.
   */
  since?: string;

  /** Called for every successfully parsed ProgressEvent frame. */
  onEvent: (event: ProgressEvent) => void;

  /**
   * Called when the subscription terminates without recovery. Fires on:
   *   - maxRetries (3) consecutive transient failures,
   *   - a non-retriable open status (401/403/404),
   *   - a clean server-side stream close (the library does NOT reconnect after onclose).
   * After this is called the subscription is dead and no further events arrive;
   * close() becomes a no-op. To resume, call subscribeProgress again (e.g. with
   * a fresh `since`/`runId`).
   */
  onError: (err: unknown) => void;

  /**
   * When true, sets `credentials: 'include'` on the underlying fetchEventSource
   * call so the browser forwards session cookies (SSO / cookie-auth environments).
   * Only enable this when you cannot provide a Bearer token or API key (e.g. the
   * app authenticates entirely via HttpOnly session cookies). Token/apiKey auth
   * takes precedence — useCookieAuth is ignored if token or apiKey is provided.
   * Requires the server CORS policy to allow credentials from the calling origin
   * (the SmartMemory service sets allow_credentials=true and enumerates origins).
   */
  useCookieAuth?: boolean;

  /**
   * Called before each non-fatal reconnect attempt (transient onerror, attempt
   * < maxRetries). It is ONLY fired when the library will actually retry — never
   * on a terminal path. A clean server close does NOT trigger onReconnect (the
   * library has no reconnect after onclose); that surfaces via onError instead.
   */
  onReconnect?: () => void;
}

export interface ProgressSubscription {
  /** Abort the in-flight SSE connection and cancel all scheduled retries. */
  close(): void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SSE_PATH = '/memory/progress/stream';
const MAX_RETRIES = 3;
const RETRY_INTERVAL_MS = 1000;

/**
 * Status codes that are permanent for this subscription and must NOT be retried:
 *   401 — token expired/invalid (retrying with the same header just fails again)
 *   403 — caller lacks workspace membership
 *   404 — run_id has scrolled out of the stream window (replay no longer possible)
 * A retry storm on these wastes ~3s and masks the real cause from the consumer.
 */
const NON_RETRIABLE_STATUSES = new Set([401, 403, 404]);

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * @internal
 * Subscribe to the SmartMemory progress SSE stream.
 *
 * Returns a { close() } handle. Call close() to tear down the connection.
 *
 * Auth: pass `token` for Bearer JWT or `apiKey` for X-API-Key.
 * Reconnect: automatically retries up to MAX_RETRIES (3) consecutive transient
 * failures with linear backoff (1s, 2s, 3s), firing onReconnect before each.
 * Terminal (no retry, onError fired): a non-retriable open status (401/403/404),
 * a clean server-side stream close, or the 3rd consecutive transient failure.
 *
 * @param options - SubscribeProgressOptions
 * @returns ProgressSubscription
 */
/** @internal */
export function subscribeProgress(options: SubscribeProgressOptions): ProgressSubscription {
  const {
    baseUrl = '',
    token,
    apiKey,
    workspaceId,
    runId,
    fromSeq,
    since,
    useCookieAuth = false,
    onEvent,
    onError,
    onReconnect,
  } = options;

  // Build URL with optional query params
  const params = new URLSearchParams();
  if (runId !== undefined) params.set('run_id', runId);
  if (fromSeq !== undefined) params.set('from_seq', String(fromSeq));
  if (since !== undefined) params.set('since', since);

  const qs = params.toString();
  const url = `${baseUrl}${SSE_PATH}${qs ? '?' + qs : ''}`;

  // Build auth headers
  const headers: Record<string, string> = {
    Accept: 'text/event-stream',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  } else if (apiKey) {
    headers['X-API-Key'] = apiKey;
  }
  if (workspaceId) {
    headers['X-Workspace-Id'] = workspaceId;
  }

  // AbortController for close()
  const controller = new AbortController();
  let closed = false;

  // Consecutive failure counter — resets on each successful message
  let consecutiveFailures = 0;

  fetchEventSource(url, {
    headers,
    signal: controller.signal,
    openWhenHidden: true,
    ...(useCookieAuth && !token && !apiKey ? { credentials: 'include' as const } : {}),

    async onopen(response) {
      if (response.ok) {
        // Successful connection; reset failure counter
        consecutiveFailures = 0;
        return;
      }

      const status = response.status;
      const err = new Error(`SSE connection failed: HTTP ${status}`);

      // Terminal 4xx (401/403/404): retrying with the same headers/run_id will
      // just fail again. Tear down before throwing so fetch-event-source's catch
      // sees an aborted controller and does NOT schedule another create().
      // (onerror only stops retries via abort(); see onerror below.)
      if (NON_RETRIABLE_STATUSES.has(status)) {
        closed = true;
        onError(err);
        controller.abort();
        throw err;
      }

      // Other non-2xx (e.g. 5xx, 429): transient — throw so onerror runs the
      // normal retry/backoff path.
      throw err;
    },

    onmessage(msg) {
      if (closed) return;
      if (!msg.data) return; // keepalive or empty frame

      // Reset failure counter on each successful frame
      consecutiveFailures = 0;

      let parsed: ProgressEvent;
      try {
        parsed = JSON.parse(msg.data) as ProgressEvent;
      } catch {
        // Malformed frame — skip silently (server bug, not client bug)
        return;
      }

      onEvent(parsed);
    },

    onerror(err) {
      // A terminal path (close() or a non-retriable onopen status) already
      // aborted. fetch-event-source still routes the resulting throw here, so
      // swallow it: don't increment, don't fire onReconnect, don't reschedule.
      if (closed) return;

      consecutiveFailures += 1;

      if (consecutiveFailures >= MAX_RETRIES) {
        // Terminal: notify caller and stop retrying.
        onError(err);
        closed = true;
        // NOTE: controller.abort() is load-bearing — it is the ONLY thing that
        // stops fetch-event-source from retrying. The library computes
        // `onerror?.(err) ?? retryInterval` and ALWAYS schedules another
        // create() unless the request controller's signal is already aborted.
        // Returning undefined here does NOT stop retries (it falls back to the
        // default 1000ms interval); the abort below is what makes this terminal.
        controller.abort();
        return;
      }

      // Non-fatal: notify reconnect callback and return the retry interval so
      // fetch-event-source schedules the next create().
      onReconnect?.();
      return RETRY_INTERVAL_MS * consecutiveFailures;
    },

    onclose() {
      // A clean server-side stream close is TERMINAL, not transient.
      // fetch-event-source's onclose path is `onclose(); dispose(); resolve()`
      // with NO setTimeout(create) — unlike onerror, there is no reconnect after
      // onclose. Firing onReconnect here would lie to the consumer ("reconnecting…"
      // while the stream is permanently dead). Surface it as a terminal error so
      // the consumer can decide to re-subscribe (e.g. with a fresh run_id/since).
      if (closed) return;
      closed = true;
      onError(new Error('SSE connection closed by server'));
    },
  });

  return {
    close() {
      if (closed) return;
      closed = true;
      controller.abort();
    },
  };
}
