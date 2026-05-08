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

## Entry Points

| Import | Contents |
|--------|----------|
| `@smartmemory/sdk-js` | SmartMemoryClient, AuthCore, TokenManager, all domain APIs, APIError |
| `@smartmemory/sdk-js/core` | Everything above + BaseAPI, RefreshManager, SSOManager (internal access) |
| `@smartmemory/sdk-js/react` | SmartMemoryProvider, useAuth, useAuthState, useAuthActions, useSmartMemory, AuthWrapper |
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
client.profiles.updateLLMKeys({ openai: 'sk-...' });

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

## Fetch Utilities

```javascript
import { createAuthFetch, installInterceptor } from '@smartmemory/sdk-js/fetch';

// Wrap individual fetch calls
const authFetch = createAuthFetch(client.auth);
const response = await authFetch('http://api.example.com/data');

// Or intercept all fetch calls globally
const uninstall = installInterceptor(client.auth, {
  urlPatterns: ['localhost:9001']
});
// ... all matching fetch calls now include auth headers
uninstall(); // restore original fetch
```

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
