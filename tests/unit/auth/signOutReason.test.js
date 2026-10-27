import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthCore } from '../../../src/auth/AuthCore.js';
import { ConnectionStatus } from '../../../src/connection/ConnectionStatus.js';

// One row per way the connection can become signed_out: what the snapshot reports as signOutReason.
const ROWS = [
  ['explicit logout() is intentional', (a) => a.logout(), 'user'],
  ['logout() in apiKey mode is intentional', (a) => a.logout(), 'user', { mode: 'apiKey', apiKey: 'k' }],
  ['clearLocalAuth({reason:user}) is intentional (account switch)', (a) => a.clearLocalAuth({ reason: 'user' }), 'user'],
  ['bare clearLocalAuth() defaults to expired', (a) => a.clearLocalAuth(), 'expired'],
  ['clearLocalAuth({reason:junk}) defaults to expired', (a) => a.clearLocalAuth({ reason: 'bogus' }), 'expired'],
  ['bare connection.signedOut() defaults to expired', (a) => a.connection.signedOut(), 'expired'],
  ['/auth/me 401 after a refused refresh is an expiry', async (a) => {
    a.currentToken = 'old';
    await a.clearIfSessionLost();
  }, 'expired', {}, 401],
];

let transport;
beforeEach(() => {
  transport = vi.fn();
  vi.stubGlobal('fetch', transport);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('ConnectionStatus signOutReason', () => {
  it.each(ROWS)('%s', async (_name, act, want, cfg = {}, meStatus = 200) => {
    transport.mockResolvedValue(new Response('{}', { status: meStatus }));
    const auth = new AuthCore({ mode: 'sso', storage: 'memory', apiBaseUrl: 'https://service.test', ...cfg });
    expect(auth.connection.snapshot.signOutReason).toBeUndefined();
    await act(auth);
    const snap = auth.connection.snapshot;
    expect(snap.status).toBe('signed_out');
    expect(snap.signOutReason).toBe(want);
  });

  it('authenticated() clears the reason', () => {
    const c = new ConnectionStatus();
    c.signedOut({ reason: 'user' });
    c.authenticated();
    expect(c.snapshot).toEqual({ status: 'connected', reason: null });
  });
});
