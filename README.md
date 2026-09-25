# @smartmemory/sdk-js

**Version:** 0.6.0

Unified JavaScript SDK for [SmartMemory](https://smartmemory.ai) — consolidates authentication and API client logic across all SmartMemory frontend applications.

## Features

- **SSO auth (Clerk)**: Cookie-based session bootstrap via `/auth/me`; redirect to Clerk IdP for login
- **Automatic token refresh**: Single-flight deduplication prevents race conditions
- **80+ API methods**: Full coverage of SmartMemory's REST API across 10 domain modules
- **React bindings**: Provider, hooks, and route protection components
- **Zero runtime dependencies**: Framework-agnostic core with optional React layer
- **Tiny bundle**: 5.6 KB gzipped (main entry)

## Installation

```bash
npm install @smartmemory/sdk-js
```

## Quick Start

### SSO Mode (All Apps — Clerk-backed)

```javascript
import { SmartMemoryClient } from '@smartmemory/sdk-js';

const client = new SmartMemoryClient({
  mode: 'sso',
  apiBaseUrl: 'http://localhost:9001',
  webAppUrl: 'http://localhost:5173',
  endpoints: { refresh: '/auth/refresh' }
});

// In SSO mode, auth is bootstrapped via /auth/me using the sm_access_token cookie
// set by the Clerk-hosted login flow. No local login form or token URL params.
await client.auth.bootstrapSession();   // calls GET /auth/me, credentials: 'include'

// If unauthenticated, redirect to the Clerk IdP:
if (!client.auth.isAuthenticated()) {
  window.location.href = client.auth.getLoginUrl(window.location.href);
}

// Use the API (cookie auth is automatic)
const memories = await client.memories.list({ limit: 10 });
```

### React

```jsx
import { SmartMemoryProvider, useAuth, useSmartMemory } from '@smartmemory/sdk-js/react';

function App() {
  return (
    <SmartMemoryProvider
      mode="sso"
      apiBaseUrl="http://localhost:9001"
      webAppUrl="http://localhost:5173"
      endpoints={{ refresh: '/auth/refresh' }}
    >
      <Dashboard />
    </SmartMemoryProvider>
  );
}

function Dashboard() {
  const { isAuthenticated, user, logout } = useAuth();
  const client = useSmartMemory();

  if (!isAuthenticated) return <LoginRedirect />;

  return (
    <div>
      <p>Welcome, {user.name}</p>
      <button onClick={logout}>Logout</button>
    </div>
  );
}
```

### Browser analytics (optional)

The analytics entry point is browser-only and intentionally separate from the core and React bindings. Install its optional `posthog-js` peer only in apps that use analytics:

```bash
npm install posthog-js
```

```jsx
import { PostHogProvider } from 'posthog-js/react';
import {
  AnalyticsIdentity,
  createAnalyticsConfig,
} from '@smartmemory/sdk-js/react/analytics';

const analytics = createAnalyticsConfig({
  app: 'web',
  apiKey: import.meta.env.VITE_PUBLIC_POSTHOG_KEY,
  apiHost: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
});

// Keep the existing child passthrough when analytics.apiKey is null.
const root = analytics.apiKey
  ? <PostHogProvider apiKey={analytics.apiKey} options={analytics.options}><App /></PostHogProvider>
  : <App />;

function IdentityAdapter() {
  const { user, isAuthenticated, workspaceId } = useAuth();
  return <AnalyticsIdentity {...{ user, isAuthenticated, workspaceId }} />;
}
```

This subpath also exports `captureProductEvent`, `captureException`, and `resetAnalytics`. It is not re-exported from `@smartmemory/sdk-js/react`, so non-browser consumers never load PostHog.

## Entry Points

| Import | Contents |
|--------|----------|
| `@smartmemory/sdk-js` | SmartMemoryClient, AuthCore, TokenManager, all domain APIs, APIError |
| `@smartmemory/sdk-js/core` | Everything above + BaseAPI, RefreshManager, SSOManager (internal access) |
| `@smartmemory/sdk-js/react` | SmartMemoryProvider, useAuth, useAuthState, useAuthActions, useSmartMemory, AuthWrapper |
| `@smartmemory/sdk-js/react/analytics` | Browser-only strict PostHog config, identity, product-event, exception, and reset helpers (optional `posthog-js` peer) |
| `@smartmemory/sdk-js/fetch` | createAuthFetch, installInterceptor |

## Configuration

```javascript
const client = new SmartMemoryClient({
  // Required
  mode: 'custom' | 'sso',
  apiBaseUrl: 'http://localhost:9001',

  // SSO mode only
  webAppUrl: 'http://localhost:5173',
  allowedRedirectHosts: ['studio.smartmemory.ai'],

  // Optional
  endpoints: {
    refresh: '/auth/refresh',   // token refresh
    logout: '/auth/logout'      // optional override
  },
  storage: 'localStorage',      // 'localStorage' | 'sessionStorage' | 'memory'
  tokenKeys: {                   // custom storage key names
    access: 'smart_memory_auth_token',
    refresh: 'smart_memory_refresh_token',
    user: 'smart_memory_user',
    tenant: 'smart_memory_tenant_id',
    team: 'smart_memory_team_id'
  },
  onTokenRefresh: (newToken) => {}  // callback after successful refresh
});
```

## Domain APIs

### Expertise Layer

SmartMemory's [expertise layer](https://docs.smartmemory.ai/smartmemory/concepts/expertise-vs-knowledge) — `decision`, `constraint`, `learned`, `opinion`, `reasoning`, `observation` — surfaces in this SDK via `client.decisions.create()` (with structured `rejectedAlternatives` / `rationale` / `constraints`) for capture and via `client.memories.search(query, { expertise: true })` for partitioned recall.

```javascript
// Capture
await client.decisions.create({
  title: 'Adopt FalkorDB',
  rejectedAlternatives: ['Neo4j', 'Memgraph'],
  rationale: 'Smallest ops surface; vector-native; permissive license.',
  constraints: ['Must support Cypher subset'],
});

// Recall — typed-dict, partitioned by expertise type
const results = await client.memories.search('graph db choice', { expertise: true });
// { decision: [...], constraint: [...], learned: [...],
//   opinion: [...], reasoning: [...], observation: [...] }
```

Default `client.memories.search(query)` returns the flat list — no breaking change. The `{ expertise: true }` option switches the response shape; the SDK passes it through verbatim.

### Memories

```javascript
client.memories.create({ content: 'text', memoryType: 'semantic' });
client.memories.get(id);
client.memories.update(id, { content: 'updated' });
client.memories.delete(id);
client.memories.list({ limit: 50, offset: 0, type: 'semantic' });
client.memories.search('query', { topK: 5, enableHybrid: true });
client.memories.searchAdvanced('query', { algorithm: 'query_traversal' });
// Time travel and provenance (auditable memory)
client.memories.search('query', { asOfDate: '2026-06-01T00:00:00Z', includeSuperseded: true });
client.memories.explain(memoryId); // origin, version audit, supersession lineage, chain verification
client.memories.ingest('content', { extractorName: 'llm' });
client.memories.getSummary();
client.memories.link(sourceId, targetId, 'RELATED');
client.memories.enrich(itemId, ['routine1']);
client.memories.getHistory(itemId);
client.memories.timeTravel(timestamp);
client.memories.rollback(itemId, { toVersion: 3 });
client.memories.runClustering(0.1, false);
```

### Decisions

```javascript
client.decisions.list({ status: 'pending' });
client.decisions.listPending(50);
client.decisions.getProofTree(decisionId, 5);
client.decisions.getFuzzyConfidence(decisionId);
```

### Graph

```javascript
client.graph.getNeighbors(itemId);
client.graph.addEdge(sourceId, targetId, 'RELATED', { weight: 0.5 });
client.graph.getHealth();
client.graph.getInferenceRules();
client.graph.runInference(['transitivity']);
```

### Teams

```javascript
client.teams.list();
client.teams.create({ name: 'Engineering' });
client.teams.get(teamId);
client.teams.update(teamId, { name: 'New Name' });
client.teams.delete(teamId);
client.teams.getMembers(teamId);
client.teams.addMember(teamId, userId, 'admin');
client.teams.updateMember(teamId, userId, 'member');
client.teams.removeMember(teamId, userId);
```

### Other APIs

```javascript
// Profiles & LLM Keys
client.profiles.list();
client.profiles.get('default');
client.profiles.getLLMKeys();
client.profiles.updateLLMKeys({ openai_key: 'sk-...', gemini_key: 'AIza...' });

// Subscriptions
client.subscriptions.getCurrent();
client.subscriptions.upgrade('pro');
client.subscriptions.createCheckoutSession('pro', 'monthly');

// Usage
client.usage.getDashboard();
client.usage.getCurrent();
client.usage.getTiers();

// Agents
client.agents.list();
client.agents.create({ name: 'Researcher' });

// Insights
client.insights.getHealth();
client.insights.getReflection();
client.insights.getMaintenanceStatus();
client.insights.getPlugins();

// Auth API (signup, password reset, API keys)
client.authAPI.signup({ email, password, fullName });
client.authAPI.getCurrentUser();
client.authAPI.requestPasswordReset(email);
client.authAPI.createAPIKey(name, scopes);
client.authAPI.listAPIKeys();
client.authAPI.revokeAPIKey(keyId);
```

## Session and connection recovery

```javascript
import { createAuthFetch, installInterceptor } from '@smartmemory/sdk-js/fetch';
import { subscribeProgress } from '@smartmemory/sdk-js/progress';

// Inject into app services/adapters. Neither helper changes globalThis.fetch.
const apiFetch = createAuthFetch(client.auth);
const scopedFetch = installInterceptor(client.auth, {
  apiBases: ['https://studio-api.example.com'], // explicitly trusted extra API base
  urlPatterns: ['/api/', '/memory/'],          // optional additional restriction
});
const response = await apiFetch(`${client.auth.apiBaseUrl}/memory/list`);

const unsubscribe = client.connection.subscribe(({ status, reason }) => {
  // Render connected | reconnecting | signed_out and the reason (string or null).
  renderConnectionStatus(status, reason);
});
const stream = subscribeProgress({
  baseUrl: client.auth.apiBaseUrl,
  auth: client.auth, // current headers on EVERY connection, including cookie sessions
  onEvent: event => renderProgress(event),
  onReconnect: () => console.warn('Progress reconnecting'),
  onError: error => showTerminalError(error),
});
// On unmount, logout, or workspace change:
stream.close();
unsubscribe();
```

`BaseAPI` JSON/binary requests and the fetch helpers share one policy: a 401
refreshes the session and retries once with current headers. Refresh is
single-flight per AuthCore, includes cookies when configured, and echoes the
`sm_csrf` cookie as `x-csrf-token` through `getRequestOptions`. A refresh 401/403
or a second request 401 clears local auth. Ordinary request 403 does not refresh
or sign out. A network/429/5xx refresh failure throws `SessionRefreshError` with
`recoverable: true`, retains auth, and reports `reconnecting`. No mutation is
replayed after an ambiguous network failure. Request bodies, cancellation, and
workspace scope are preserved; a workspace change cancels recovery.

`client.connection` and `client.auth.connection` are the same observable.
`subscribe(listener)` immediately emits `{ status, reason }` and returns an
unsubscribe function; `snapshot` reads current state. Failures are tracked per
request URL and per stream, so unrelated successes cannot hide them. `connected`
means no currently recorded connection failure, not a proactive health probe.
Requests are retried only on 401; apps retain ownership of ordinary polling and
retrying failed reads. Streams reconnect automatically with exponential delay
from 1 second to a 30-second cap, indefinitely for transient failures and EOF.
Online/visible events resume immediately. Auth recovery retries once on 401;
other 4xx except 408/429 terminate through `onError`.

Scope streams resume using the exact SSE `id` in `since` and `Last-Event-ID`.
Run streams use `runId` and the next inclusive `fromSeq` boundary. Server scope
replay may repeat the boundary event: consumers should deduplicate event IDs or
`(run_id, seq)`. `close()` cancels timers, aborts transport, removes listeners,
and suppresses stale callbacks. Recreate a subscription on workspace change;
the SDK refuses to carry a cursor across workspaces. For deliberate finite
replay, set `reconnect: false` and optionally `onComplete`; EOF then completes.
Static `token`/`apiKey` remain supported, but automatic session refresh requires
`auth`. `getHeaders()` can provide live synchronous headers. `fetchFn` injects
a transport for either fetch helpers or progress; passing a raw transport avoids
stacking recovery wrappers.

**Interceptor migration:** `installInterceptor(auth, options)` now returns an
injectable fetch function, **not an uninstaller**. Replace old global-install
call sites and route their API calls through that function (or
`createAuthFetch`). No global fetch mutation is performed. Credentials/recovery
are restricted to `auth.apiBaseUrl` plus explicitly configured `apiBases`, with
origin and path-boundary matching. `/auth/*` requests bypass the wrapper to avoid
recursive refresh; auth bootstrap remains owned by AuthCore/app code. Pass the
actual method/headers to `getRequestOptions` for custom cookie-auth mutations.

TypeScript declarations ship for `/fetch`, `/progress`, and `/connection`.
The latter exports `ConnectionStatus`, `SessionRefreshError`, and the structural
`RecoveryClient`, `RecoveryAuth`, `ConnectionSnapshot`, and `ConnectionState`
types. Existing JavaScript client/domain APIs retain their prior typing surface.

## Migration from AuthService.js

Replace the per-app AuthService pattern:

```diff
- import { authService } from '../services/AuthService';
- import { authFetch } from '../services/AuthService';
+ import { SmartMemoryClient } from '@smartmemory/sdk-js';
+
+ const client = new SmartMemoryClient({
+   mode: 'sso',
+   apiBaseUrl: import.meta.env.VITE_API_URL,
+   webAppUrl: import.meta.env.VITE_WEB_APP_URL,
+   endpoints: { refresh: '/auth/refresh' }
+ });

- authService.getLoginUrl()
+ client.auth.getLoginUrl()

- authService.storeCallbackTokens(searchParams)
+ client.auth.storeCallbackTokens(searchParams)

- authFetch('/memory/list')
+ client.memories.list()
```

## Development

```bash
npm install
npm test              # run tests
npm run test:watch    # watch mode
npm run test:coverage # with coverage
npm run build         # production build
```

## License

MIT

## Documentation

Full SmartMemory documentation: https://docs.smartmemory.ai

## Lexical search migration

Search uses `lexical` with default weight 0.8. Replace removed `contains` and `keyword-bm25` channel weights explicitly. A zero weight disables lexical, and omission preserves the existing default/profile behavior. Required lexical unavailability fails the whole search. Service callers receive 400 for query/name validation and 503 for unavailable indexes.

Use `memory.search(query, {channelWeights: {lexical: 0}})`. The optional JS property forwards `channel_weights` without a REST signature change.

Quiesce old writers before first-open indexing. Verify the engine capability pin and use `sm rebuild --lexical` for recovery. [Migration, targets and measured limitations](https://github.com/smart-memory/smart-memory-docs/blob/main/docs/features/CORE-LEXICAL-INDEX-1/migration.md).
