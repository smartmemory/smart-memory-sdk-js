# @smartmemory/sdk-js

Unified JavaScript SDK for [SmartMemory](https://smartmemory.ai) — consolidates authentication and API client logic across all SmartMemory frontend applications.

## Features

- **Dual-mode auth**: Custom (email/password) and SSO (redirect-based) authentication
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

### Custom Mode (Web App with Login Form)

```javascript
import { SmartMemoryClient } from '@smartmemory/sdk-js';

const client = new SmartMemoryClient({
  mode: 'custom',
  apiBaseUrl: 'http://localhost:9001',
  endpoints: {
    login: '/auth/login',
    refresh: '/auth/refresh',
    logout: '/auth/logout'
  }
});

// Login
const { user, token } = await client.auth.login({
  email: 'user@example.com',
  password: 'password'
});

// Use the API
const memories = await client.memories.list({ limit: 10 });
const results = await client.memories.search('machine learning', { topK: 5 });
```

### SSO Mode (Studio/Insights Apps)

```javascript
import { SmartMemoryClient } from '@smartmemory/sdk-js';

const client = new SmartMemoryClient({
  mode: 'sso',
  apiBaseUrl: 'http://localhost:9001',
  webAppUrl: 'http://localhost:5173',
  endpoints: { refresh: '/auth/refresh' }
});

// Redirect to login
window.location.href = client.auth.getLoginUrl();

// On callback page, store tokens from URL params
const params = new URLSearchParams(window.location.search);
client.auth.storeCallbackTokens(params);
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
    login: '/auth/login',       // custom mode only
    refresh: '/auth/refresh',   // both modes
    logout: '/auth/logout'      // both modes
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
