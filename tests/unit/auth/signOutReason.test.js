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

// Sequences on a bare ConnectionStatus: [name, calls, want]. 'user' is sticky while signed out; authenticated() resets.
const SEQ = [
  ['logout then late bare 401 stays user', [['signedOut', { reason: 'user' }], ['signedOut']], 'user'],
  ['logout then late 401 with junk reason stays user', [['signedOut', { reason: 'user' }], ['signedOut', { reason: 'bogus' }]], 'user'],
  ['bare 401 while signed in is expired', [['signedOut']], 'expired'],
  ['expired then org switch upgrades to user', [['signedOut'], ['signedOut', { reason: 'user' }]], 'user'],
  ['authenticated() then 401 is expired', [['signedOut', { reason: 'user' }], ['authenticated'], ['signedOut']], 'expired'],
  ['authenticated() then logout is user', [['signedOut'], ['authenticated'], ['signedOut', { reason: 'user' }]], 'user'],
];

describe('ConnectionStatus signOutReason', () => {
  it.each(SEQ)('%s', (_name, calls, want) => {
    const c = new ConnectionStatus();
    for (const [fn, arg] of calls) c[fn](arg);
    expect(c.snapshot.signOutReason).toBe(want);
  });

  it('logout() then an in-flight 401 recovery keeps signOutReason user', async () => {
    transport.mockResolvedValue(new Response('{}', { status: 401 }));
    const auth = new AuthCore({ mode: 'sso', storage: 'memory', apiBaseUrl: 'https://service.test' });
    await auth.logout();
    auth.clearLocalAuth(); // what recovery.js / progress.ts / onRefreshFailed do on a late 401
    expect(auth.connection.snapshot.signOutReason).toBe('user');
  });

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
