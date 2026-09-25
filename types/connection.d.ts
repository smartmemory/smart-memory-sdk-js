export type ConnectionState = 'connected' | 'reconnecting' | 'signed_out';
export interface ConnectionSnapshot {
  readonly status: ConnectionState;
  readonly reason: string | null;
}
export declare class ConnectionStatus {
  readonly snapshot: ConnectionSnapshot;
  subscribe(listener: (snapshot: ConnectionSnapshot) => void): () => void;
  report(source: string | symbol, reason: string | null): void;
  signedOut(): void;
  authenticated(): void;
}
/** Structural type for client.connection / client.auth.connection. */
export interface RecoveryClient {
  connection: ConnectionStatus;
  auth: RecoveryAuth;
}
export interface RecoveryAuth {
  apiBaseUrl: string;
  connection: ConnectionStatus;
  getAuthHeaders(extra?: HeadersInit): Record<string, string>;
  getRequestOptions(extra?: RequestInit): RequestInit;
  refreshToken(): Promise<string | null>;
  clearLocalAuth(): void;
}
export declare class SessionRefreshError extends Error {
  constructor(message: string, status?: number, recoverable?: boolean);
  status: number;
  recoverable: boolean;
}
