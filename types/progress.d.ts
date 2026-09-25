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

export declare function subscribeProgress(options: SubscribeProgressOptions): ProgressSubscription;
