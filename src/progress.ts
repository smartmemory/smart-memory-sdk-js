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
 *   All SmartMemory API endpoints require header-based auth (no cookie auth).
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
   * Called after maxRetries consecutive failures, or on a fatal (non-retriable) error.
   * After this is called the subscription is dead — call close() is a no-op.
   */
  onError: (err: unknown) => void;

  /** Called each time a non-fatal reconnect attempt is made (before maxRetries). */
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
 * Reconnect: automatically retries up to MAX_RETRIES (3) consecutive failures
 * with exponential-ish backoff. onError is called and retries stop after 3.
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

    async onopen(response) {
      if (response.ok) {
        // Successful connection; reset failure counter
        consecutiveFailures = 0;
        return;
      }
      // Non-2xx: fatal — throw to trigger onerror with non-retriable path
      throw new Error(`SSE connection failed: HTTP ${response.status}`);
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
      if (closed) return;

      consecutiveFailures += 1;

      if (consecutiveFailures >= MAX_RETRIES) {
        // Fatal: stop retrying, notify caller
        onError(err);
        controller.abort();
        closed = true;
        // Returning null/undefined stops fetch-event-source from retrying
        return;
      }

      // Non-fatal: notify reconnect callback and return retry interval
      onReconnect?.();
      return RETRY_INTERVAL_MS * consecutiveFailures;
    },

    onclose() {
      // Server closed the connection cleanly — treat as transient for now
      if (!closed) {
        consecutiveFailures += 1;
        if (consecutiveFailures >= MAX_RETRIES) {
          onError(new Error('SSE connection closed by server'));
          closed = true;
        } else {
          onReconnect?.();
        }
      }
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
