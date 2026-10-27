import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AuthCore } from '../../../src/auth/AuthCore.js';
import { BaseAPI } from '../../../src/api/BaseAPI.js';
import { createAuthFetch } from '../../../src/fetch/authFetch.js';

// SDK-JS-401-KEEPS-IDENTITY-1: a rejected call clears identity only when the
// server confirms the session is gone (refresh refused AND /auth/me 401/403).
const reply = (status, data = {}) => new Response(JSON.stringify(data), { status });
const ME = { id: 'u1' };
let auth, transport, states;
beforeEach(() => {
  transport = vi.fn();
  vi.stubGlobal('fetch', transport);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  auth = new AuthCore({ mode: 'sso', storage: 'memory', apiBaseUrl: 'https://service.test' });
  auth.currentToken = 'expired';
  auth.currentUser = ME;
  states = [];
  auth.addListener(state => states.push(state.isAuthenticated));
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const api = { json: () => new BaseAPI(auth).get('/memory/job'), fetch: () => createAuthFetch(auth)('https://service.test/memory/job') };
// Replies in order: API 401, then the rest of the exchange.
const rows = [
  { name: '401, refresh 401, me 200 (valid cookie)', replies: [401, 401, 200], kept: true },
  { name: '401, refresh 403, me 200 (valid cookie)', replies: [401, 403, 200], kept: true },
  { name: '401, refresh 401, me 503 (not definitive)', replies: [401, 401, 503], kept: true },
  { name: '401, refresh 401, me network error', replies: [401, 401, 'network'], kept: true },
  { name: '401, refresh ok, retry 401, me 200', replies: [401, 'refresh', 401, 200], kept: true },
  { name: '401, refresh 401, me 401', replies: [401, 401, 401], kept: false },
  { name: '401, refresh 403, me 403', replies: [401, 403, 403], kept: false },
  { name: '401, refresh ok, retry 401, me 401', replies: [401, 'refresh', 401, 401], kept: false },
];
for (const [via, send] of Object.entries(api)) {
  it.each(rows)(`${via}: $name`, async ({ replies, kept }) => {
    for (const r of replies) {
      if (r === 'network') transport.mockRejectedValueOnce(new TypeError('offline'));
      else transport.mockResolvedValueOnce(r === 'refresh' ? reply(200, { access_token: 'new' }) : reply(r, r === 200 ? ME : {}));
    }
    await send().catch(() => {});
    const me = transport.mock.calls.filter(([url]) => String(url).endsWith('/auth/me'));
    expect(me).toHaveLength(1);
    expect(auth.getCurrentUser()).toEqual(kept ? ME : null);
    expect(auth.isAuthenticated()).toBe(kept);
    // One identified -> anonymous flip is what reloads the studio twice.
    if (kept) expect(states).not.toContain(false);
    expect(auth.connection.snapshot.status === 'signed_out').toBe(!kept);
  });
}
