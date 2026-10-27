export type SignOutReason = 'user' | 'expired';
export type ConnectionState = 'connected' | 'reconnecting' | 'signed_out';
export interface ConnectionSnapshot {
  readonly status: ConnectionState;
  readonly reason: string | null;
  /** Set only while signed_out: 'user' = intentional (logout, account switch), 'expired' = unexpected. */
  readonly signOutReason?: SignOutReason;
}
export declare class ConnectionStatus {
  readonly snapshot: ConnectionSnapshot;
  subscribe(listener: (snapshot: ConnectionSnapshot) => void): () => void;
  report(source: string | symbol, reason: string | null): void;
  signedOut(options?: { reason?: SignOutReason }): void;
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
  clearLocalAuth(options?: { reason?: "user" | "expired" }): void;
}
export declare class SessionRefreshError extends Error {
  constructor(message: string, status?: number, recoverable?: boolean);
  status: number;
  recoverable: boolean;
}
