/** Wait for shared recovery work, but let an aborted caller stop waiting without cancelling it. */
function untilAborted(work, signal) {
  const promise = Promise.resolve(work);
  if (!signal) return promise;
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(new DOMException('Request aborted', 'AbortError'));
    if (signal.aborted) onAbort();
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      value => { signal.removeEventListener('abort', onAbort); resolve(value); },
      error => { signal.removeEventListener('abort', onAbort); reject(error); }
    );
  });
}

/** Shared retry policy. Only a definitive HTTP 401 is replayed, never a network error. */
export async function fetchWithRecovery(auth, send, { source, signal, retry = true } = {}) {
  const workspace = () => new Headers(auth.getAuthHeaders()).get('X-Workspace-Id');
  const initialWorkspace = workspace();
  const initialToken = new Headers(auth.getAuthHeaders()).get('Authorization');
  const checkScope = () => {
    if (workspace() !== initialWorkspace) throw new DOMException('Workspace changed during request', 'AbortError');
  };
  try {
    let response = await send(false);
    if (response.status === 401 && retry) {
      console.warn('[session] Unauthorized; refreshing and retrying once');
      auth.connection?.report(source, 'Refreshing session');
      checkScope();
      if (signal?.aborted) throw new DOMException('Request aborted', 'AbortError');
      // Another concurrent request may already have renewed this credential.
      if (new Headers(auth.getAuthHeaders()).get('Authorization') === initialToken) await untilAborted(auth.refreshToken(), signal);
      checkScope();
      if (signal?.aborted) throw new DOMException('Request aborted', 'AbortError');
      response = await send(true);
    }
    if (response.status === 401) {
      console.warn('[session] Authentication required after recovery');
      await untilAborted(auth.clearIfSessionLost ? auth.clearIfSessionLost() : auth.clearLocalAuth?.(), signal);
    } else if (response.status === 429 || response.status >= 500) {
      console.warn(`[session] Service unavailable: HTTP ${response.status}`);
      auth.connection?.report(source, `HTTP ${response.status}`);
    } else {
      auth.connection?.report(source, null);
    }
    return response;
  } catch (error) {
    if (error.name === 'AbortError') auth.connection?.report(source, null);
    if (error.name !== 'AbortError' && error.recoverable !== false) {
      console.warn('[session] Connection interrupted', error);
      auth.connection?.report(source, error.message);
    }
    throw error;
  }
}

export function resolveURL(input) {
  return new URL(input instanceof Request ? input.url : String(input),
    typeof location !== 'undefined' ? location.href : 'http://localhost');
}

export function isTrusted(auth, url, apiBases = []) {
  return [auth.apiBaseUrl || '/', ...apiBases].some(value => {
    const base = resolveURL(value);
    const path = base.pathname.replace(/\/$/, '');
    return url.origin === base.origin && (!path || url.pathname === path || url.pathname.startsWith(`${path}/`));
  });
}
