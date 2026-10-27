// Error classes the recovery layer tells apart (WEB-BLANK-AFTER-IDLE-1). Order matters: a chunk error's
// message ("Failed to fetch dynamically imported module") also looks like a network error, so chunk wins.
import { isChunkLoadError } from './chunkReload.js';

const NETWORK_MESSAGES = [
  'Failed to fetch', // Chrome, Edge
  'NetworkError when attempting to fetch resource', // Firefox
  'Load failed', // Safari
  'network error',
];

/** True for an auth refresh that failed or an API answer that says the session is gone. */
export function isAuthError(err) {
  if (!err || typeof err !== 'object') return false;
  if (err.name === 'SessionRefreshError') return true;
  return err.name === 'APIError' && (err.status === 401 || err.status === 403);
}

/** True for a dropped connection: a progress stream or fetch that lost the network while the tab slept. */
export function isNetworkError(err) {
  if (!err) return false;
  if (err.name === 'AbortError') return true;
  const message = typeof err === 'string' ? err : String(err.message || '');
  return NETWORK_MESSAGES.some((m) => message.includes(m));
}

/** 'chunk' | 'auth' | 'network' | 'other' */
export function classifyError(err) {
  if (isChunkLoadError(err)) return 'chunk';
  if (isAuthError(err)) return 'auth';
  if (isNetworkError(err)) return 'network';
  return 'other';
}
