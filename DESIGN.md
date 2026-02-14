# JavaScript SDK Design

**Date:** 2026-02-08
**Status:** Design
**Related:** Roadmap item #12 from `2026-02-07-remaining-work-ranked.md`

## Problem Statement

Currently, each SmartMemory frontend implements its own client logic with massive duplication:

### Authentication (duplicated across 4 projects)
1. **Token storage/retrieval** — localStorage/sessionStorage management duplicated
2. **Auth state management** — AuthService singleton + listener pattern copied 3 times
3. **React integration** — useAuth hook + AuthProvider duplicated
4. **Token refresh** — Different implementations (web has working refresh, studio/insights don't)
5. **SSO redirect flow** — Callback token handling duplicated
6. **Fetch interceptors** — 401 handling + header injection duplicated

### API Client (partially duplicated)
7. **Memory operations** — createMemory, listMemories, searchMemory, etc. (~890 lines in web's api.js)
8. **Decision operations** — listDecisions, getProofTree, etc.
9. **Graph operations** — getNeighbors, addEdge, getGraphHealth, etc.
10. **Team management** — createTeam, addTeamMember, etc.
11. **Profile/config** — listProfiles, getLLMKeys, etc.

**Current state**: Web has a full API client (890 lines). Studio/Insights have partial implementations. Maya has its own version. Zero code sharing.

Additionally, we have **two authentication models** that need different UX patterns:
- **Web/Maya**: Custom login UI in the app itself
- **Studio/Insights**: SSO redirect to web app for login

However, **all apps need token refresh** — studio/insights don't have local auth endpoints, but they can call the main API service (port 9001) for refresh.

## Goals

1. **Single source of truth** for auth logic — one tested implementation
2. **Support both auth models** — custom UI vs SSO redirect
3. **Framework-agnostic core** — vanilla JS with React bindings as a layer
4. **Type safety** — JSDoc types for IDE support without TypeScript compilation
5. **Tree-shakeable** — consumers only bundle what they use
6. **Drop-in replacement** — minimal migration from current AuthService

## Non-Goals

- TypeScript compilation (use JSDoc instead)
- Support for Vue/Svelte/Angular (React-only for now)
- Server-side rendering (client-only)
- OAuth provider integrations (delegated to backend)

---

## Architecture

### Package Structure

```
@smartmemory/sdk-js/
├── src/
│   ├── auth/
│   │   ├── AuthCore.js           # Framework-agnostic auth logic
│   │   ├── TokenManager.js       # Token storage/retrieval
│   │   ├── RefreshManager.js     # Token refresh logic
│   │   └── SSOManager.js         # SSO redirect helpers
│   ├── api/
│   │   ├── SmartMemoryClient.js  # Main API client
│   │   ├── MemoryAPI.js          # Memory CRUD operations
│   │   ├── DecisionAPI.js        # Decision operations
│   │   ├── GraphAPI.js           # Graph operations
│   │   ├── TeamAPI.js            # Team management
│   │   ├── ProfileAPI.js         # Profile/config operations
│   │   ├── SubscriptionAPI.js    # Billing/subscription
│   │   └── BaseAPI.js            # Shared request logic
│   ├── react/
│   │   ├── AuthProvider.jsx      # React context provider
│   │   ├── useAuth.js            # Primary auth hook
│   │   ├── useAuthState.js       # State-only hook
│   │   ├── useAuthActions.js     # Actions-only hook
│   │   ├── useSmartMemory.js     # API client hook
│   │   └── AuthWrapper.jsx       # Route protection component
│   ├── fetch/
│   │   ├── authFetch.js          # Authenticated fetch wrapper
│   │   └── interceptor.js        # Global fetch interceptor
│   ├── types/
│   │   ├── auth.js               # Auth types
│   │   ├── memory.js             # Memory types
│   │   ├── decision.js           # Decision types
│   │   └── graph.js              # Graph types
│   └── index.js                  # Public API exports
├── package.json
└── README.md
```

### Two-Mode Architecture

The SDK supports two authentication strategies, configured at initialization:

#### Mode 1: Custom Auth UI (web, maya)
- Frontend has login form
- Calls login endpoint directly
- 401 → refresh → retry → logout on failure

#### Mode 2: SSO Redirect (studio, insights)
- Frontend has no login form
- Redirects unauthenticated users to web app login
- Receives tokens via URL callback
- 401 → refresh → retry → logout on failure (same as mode 1)

**Key difference**: Only the *initial login* flow differs. Token refresh works the same way in both modes — all apps call the main API service at `http://localhost:9001/auth/refresh` (or production equivalent).

### Token Refresh for SSO Apps

Studio and Insights don't have auth endpoints on their own servers (ports 9002), but they still need token refresh. The SDK will:

1. Configure `apiBaseUrl: 'http://localhost:9001'` (main service, not local server)
2. Call `/auth/refresh` on the main API
3. Store the new token locally
4. Retry the original request

**Example SSO config**:
```javascript
const auth = new AuthCore({
  mode: 'sso',
  apiBaseUrl: 'http://localhost:9001',  // Main API, NOT studio server!
  webAppUrl: 'http://localhost:5173',
  endpoints: {
    refresh: '/auth/refresh'  // Calls http://localhost:9001/auth/refresh
  }
});
```

This means SSO apps have **two API base URLs**:
- Local server (e.g. `http://localhost:9002`) for app-specific APIs
- Main service (`http://localhost:9001`) for auth operations

The SDK handles auth calls, app code handles everything else.

---

## API Client Design

### SmartMemoryClient (Main Entry Point)

```javascript
import { SmartMemoryClient } from '@smartmemory/sdk-js';

const client = new SmartMemoryClient({
  // Auth config (same as AuthCore)
  mode: 'custom',
  apiBaseUrl: 'http://localhost:9001',
  endpoints: {
    login: '/auth/login',
    refresh: '/auth/refresh'
  },

  // Optional
  onTokenRefresh: (token) => { /* ... */ },
  onAuthStateChange: (state) => { /* ... */ }
});

// Auth operations
await client.auth.login({ email, password });
await client.auth.logout();
client.auth.isAuthenticated();

// Memory operations
const memory = await client.memories.create({
  content: 'test',
  type: 'semantic'
});
const memories = await client.memories.list({ limit: 50, offset: 0 });
await client.memories.delete(id);

// Decision operations
const decisions = await client.decisions.list({ status: 'pending' });
const proof = await client.decisions.getProofTree(decisionId);

// Graph operations
const neighbors = await client.graph.getNeighbors(itemId);
await client.graph.addEdge(sourceId, targetId, 'RELATED');

// Team operations
const teams = await client.teams.list();
await client.teams.addMember(teamId, userId, 'member');

// Profile operations
const profiles = await client.profiles.list();
const keys = await client.profiles.getLLMKeys();
```

### Modular API Surface

Each domain has its own API class:

```javascript
// MemoryAPI.js
class MemoryAPI {
  constructor(baseAPI) {
    this.base = baseAPI;
  }

  async create(params) {
    return this.base.post('/memory', params);
  }

  async list({ limit = 50, offset = 0, type = null }) {
    const query = new URLSearchParams({ limit, offset });
    if (type) query.set('memory_type', type);
    return this.base.get(`/memory?${query}`);
  }

  async get(id) {
    return this.base.get(`/memory/${id}`);
  }

  async update(id, params) {
    return this.base.put(`/memory/${id}`, params);
  }

  async delete(id) {
    return this.base.delete(`/memory/${id}`);
  }

  async search(query, params = {}) {
    return this.base.post('/memory/search', { query, ...params });
  }

  async ingest(content, params = {}) {
    return this.base.post('/memory/ingest', { content, ...params });
  }
}
```

### BaseAPI (Shared Logic)

```javascript
class BaseAPI {
  constructor(authCore) {
    this.auth = authCore;
    this.baseURL = authCore.apiBaseUrl;
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const headers = this.auth.getAuthHeaders(options.headers);

    try {
      let response = await fetch(url, { ...options, headers });

      // Handle 401 with refresh+retry
      if (response.status === 401 && !options.__isRetry) {
        await this.auth.refreshToken();
        const retryHeaders = this.auth.getAuthHeaders(options.headers);
        response = await fetch(url, {
          ...options,
          headers: retryHeaders,
          __isRetry: true
        });
      }

      if (!response.ok) {
        throw await this.handleError(response);
      }

      return await response.json();
    } catch (error) {
      throw error;
    }
  }

  async get(endpoint, options = {}) {
    return this.request(endpoint, { ...options, method: 'GET' });
  }

  async post(endpoint, data, options = {}) {
    return this.request(endpoint, {
      ...options,
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async put(endpoint, data, options = {}) {
    return this.request(endpoint, {
      ...options,
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  async delete(endpoint, options = {}) {
    return this.request(endpoint, { ...options, method: 'DELETE' });
  }

  async handleError(response) {
    const contentType = response.headers.get('content-type');
    let error;

    if (contentType?.includes('application/json')) {
      error = await response.json();
    } else {
      error = { message: await response.text() };
    }

    return new APIError(
      error.message || error.detail || `HTTP ${response.status}`,
      response.status,
      error
    );
  }
}
```

---

## Auth Core API Design

### AuthCore (Framework-Agnostic)

```javascript
import { AuthCore } from '@smartmemory/sdk-js/core';

const auth = new AuthCore({
  mode: 'custom',  // 'custom' | 'sso'

  // Required for both modes (token refresh)
  apiBaseUrl: 'http://localhost:9001',
  endpoints: {
    refresh: '/auth/refresh',
    logout: '/auth/logout'  // optional
  },

  // Mode: custom only
  endpoints: {
    login: '/auth/login',  // only in custom mode
    refresh: '/auth/refresh',
    logout: '/auth/logout'
  },

  // Mode: sso only
  webAppUrl: 'http://localhost:5173',
  allowedRedirectHosts: [
    'www.smartmemory.ai',
    'studio.smartmemory.ai',
    'insights.smartmemory.ai',
    'maya.smartmemory.ai'
  ],

  // Common
  storage: 'localStorage',  // 'localStorage' | 'sessionStorage' | 'memory'
  tokenKeys: {
    access: 'smart_memory_auth_token',
    refresh: 'smart_memory_refresh_token',
    user: 'smart_memory_user',
    tenant: 'smart_memory_tenant_id'
  },

  // Optional
  onTokenRefresh: (newToken) => { /* ... */ },
  onAuthStateChange: (state) => { /* ... */ },
  onError: (error) => { /* ... */ }
});

// Common methods (both modes)
auth.getToken();                    // => string | null
auth.getUser();                     // => User | null
auth.getTenantId();                 // => string | null
auth.isAuthenticated();             // => boolean
auth.hasRole(role);                 // => boolean
auth.logout();                      // => Promise<void>
auth.refreshToken();                // => Promise<string> (both modes!)
auth.setTenantId(tenantId);        // => void
auth.getAuthHeaders(extraHeaders); // => Headers
auth.addEventListener(listener);   // => () => void (unsubscribe)

// Mode: custom only
auth.login(credentials);           // => Promise<AuthResult>

// Mode: sso only
auth.getLoginUrl(currentUrl);      // => string (redirect URL)
auth.storeCallbackTokens(params);  // => void
auth.isValidRedirectUrl(url);      // => boolean
```

### TokenManager

```javascript
import { TokenManager } from '@smartmemory/sdk-js/core';

const tokens = new TokenManager({
  storage: 'localStorage',
  keys: {
    access: 'smart_memory_auth_token',
    refresh: 'smart_memory_refresh_token'
  }
});

tokens.getAccessToken();           // => string | null
tokens.setAccessToken(token);      // => void
tokens.getRefreshToken();          // => string | null
tokens.setRefreshToken(token);     // => void
tokens.clearAll();                 // => void
```

### RefreshManager (Both modes)

```javascript
import { RefreshManager } from '@smartmemory/sdk-js/core';

const refresher = new RefreshManager({
  apiBaseUrl: 'http://localhost:9001',
  refreshEndpoint: '/auth/refresh',
  tokenManager: tokens,
  onTokenRefreshed: (newToken) => { /* ... */ },
  onRefreshFailed: () => { /* logout */ }
});

refresher.refresh();               // => Promise<string>
refresher.scheduleRefresh();       // => void (based on exp claim)
refresher.cancelRefresh();         // => void
```

### SSOManager (SSO mode only)

```javascript
import { SSOManager } from '@smartmemory/sdk-js/core';

const sso = new SSOManager({
  webAppUrl: 'http://localhost:5173',
  allowedHosts: ['studio.smartmemory.ai'],
  tokenManager: tokens
});

sso.getLoginUrl(redirectUrl);      // => string
sso.isValidRedirectUrl(url);       // => boolean
sso.storeRedirect(url);            // => void (sessionStorage)
sso.getAndClearRedirect();         // => string | null
sso.redirectWithTokens(url);       // => void
sso.storeCallbackTokens(params);   // => void
```

---

## React Bindings

### AuthProvider

```jsx
import { AuthProvider } from '@smartmemory/sdk-js/react';

function App() {
  return (
    <AuthProvider
      mode="custom"
      apiBaseUrl="http://localhost:9001"
      endpoints={{ login: '/auth/login', refresh: '/auth/refresh' }}
      storage="localStorage"
    >
      <AppContent />
    </AuthProvider>
  );
}
```

### useAuth Hook

```javascript
import { useAuth } from '@smartmemory/sdk-js/react';

function MyComponent() {
  const {
    // State
    isAuthenticated,
    user,
    token,
    tenantId,
    loading,
    error,

    // Computed
    hasRole,
    isAdmin,

    // Actions
    login,           // custom mode only
    logout,
    refreshToken,    // both modes
    setTenantId,
    clearError,

    // Utils
    getAuthHeaders,
    getAuthenticatedFetchOptions
  } = useAuth();

  return <div>{user?.name}</div>;
}
```

### useSmartMemory Hook (API Client)

```javascript
import { useSmartMemory } from '@smartmemory/sdk-js/react';

function MyComponent() {
  const client = useSmartMemory();

  const [memories, setMemories] = useState([]);

  useEffect(() => {
    client.memories.list().then(setMemories);
  }, []);

  const handleCreate = async () => {
    const memory = await client.memories.create({
      content: 'test',
      type: 'semantic'
    });
    setMemories(prev => [memory, ...prev]);
  };

  return (
    <div>
      <button onClick={handleCreate}>Create</button>
      {memories.map(m => <div key={m.id}>{m.content}</div>)}
    </div>
  );
}
```

### AuthWrapper (Route Protection)

```jsx
import { AuthWrapper } from '@smartmemory/sdk-js/react';

function App() {
  return (
    <AuthProvider mode="sso" webAppUrl="http://localhost:5173">
      <AuthWrapper exemptPaths={['/auth/callback']}>
        <Routes>
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/" element={<Dashboard />} />
        </Routes>
      </AuthWrapper>
    </AuthProvider>
  );
}
```

**Custom mode**: Shows loading spinner while checking auth, renders children if authenticated, shows login form if not

**SSO mode**: Redirects to `webAppUrl/login?redirect=...` if not authenticated

---

## Fetch Integration

### authFetch (Wrapper)

```javascript
import { authFetch } from '@smartmemory/sdk-js/fetch';

const response = await authFetch('/api/memories', {
  method: 'POST',
  body: JSON.stringify({ content: 'test' })
});
```

Automatically:
- Adds `Authorization` header
- Adds `X-Workspace-Id` header if tenant set
- Handles 401 → refresh → retry (both modes)
- Logs out if refresh fails

### Global Interceptor

```javascript
import { installFetchInterceptor } from '@smartmemory/sdk-js/fetch';

// In main.jsx/main.tsx
installFetchInterceptor(authCore, {
  urlPattern: /^\/api/,  // Only intercept /api calls
  onUnauthorized: () => { /* optional custom 401 handler */ }
});

// Now all fetch('/api/...') calls auto-include auth headers
const res = await fetch('/api/memories');
```

---

## Migration Guide

### Before (Current Pattern)

```javascript
// AuthService.js (duplicated in 4 projects - ~300 lines each)
class AuthService {
  constructor() { /* 100+ lines */ }
  getStoredToken() { /* ... */ }
  setToken(token) { /* ... */ }
  // ... 20 more methods
}
export const authService = new AuthService();

// useAuth.jsx (duplicated in 3 projects - ~150 lines each)
export const AuthProvider = ({ children }) => {
  const [authState, setAuthState] = useState(/* ... */);
  useEffect(() => { /* listener setup */ }, []);
  // ... 50+ lines
};

// api.js (web only - 890 lines)
class SmartMemoryAPI {
  async createMemory(content, type) { /* ... */ }
  async listMemories(limit, offset) { /* ... */ }
  // ... 80 more methods
}
```

### After (SDK)

```javascript
// main.jsx
import { SmartMemoryProvider } from '@smartmemory/sdk-js/react';

ReactDOM.createRoot(document.getElementById('root')).render(
  <SmartMemoryProvider
    mode="sso"
    apiBaseUrl="http://localhost:9001"
    webAppUrl={import.meta.env.VITE_WEB_APP_URL}
  >
    <App />
  </SmartMemoryProvider>
);

// Any component - Auth
import { useAuth } from '@smartmemory/sdk-js/react';

function UserMenu() {
  const { user, logout } = useAuth();
  return <button onClick={logout}>Sign out {user?.name}</button>;
}

// Any component - API
import { useSmartMemory } from '@smartmemory/sdk-js/react';

function MemoryList() {
  const client = useSmartMemory();
  const [memories, setMemories] = useState([]);

  useEffect(() => {
    client.memories.list().then(setMemories);
  }, []);

  return <div>{memories.map(m => <MemoryCard key={m.id} {...m} />)}</div>;
}
```

**Lines of code removed**:
- Per project: ~300-500 lines (AuthService + useAuth)
- Web project: Additional 890 lines (api.js client)
- **Total**: ~2500+ lines across all projects consolidated into one SDK

---

## Type Definitions (JSDoc)

```javascript
/**
 * @typedef {Object} AuthConfig
 * @property {'custom' | 'sso'} mode - Authentication mode
 * @property {string} [apiBaseUrl] - API base URL (custom mode)
 * @property {Object} [endpoints] - API endpoints (custom mode)
 * @property {string} [endpoints.login] - Login endpoint
 * @property {string} [endpoints.refresh] - Refresh endpoint
 * @property {string} [endpoints.logout] - Logout endpoint
 * @property {string} [webAppUrl] - Web app URL (sso mode)
 * @property {string[]} [allowedRedirectHosts] - Allowed redirect hosts (sso mode)
 * @property {'localStorage' | 'sessionStorage' | 'memory'} [storage] - Storage type
 */

/**
 * @typedef {Object} User
 * @property {string} id - User ID
 * @property {string} name - User name
 * @property {string} email - User email
 * @property {string[]} roles - User roles
 * @property {boolean} is_active - Active status
 */

/**
 * @typedef {Object} AuthState
 * @property {boolean} isAuthenticated - Is user authenticated
 * @property {User | null} user - Current user
 * @property {string | null} token - Access token
 * @property {string | null} tenantId - Tenant ID
 * @property {boolean} loading - Loading state
 * @property {Error | null} error - Error state
 */

/**
 * @typedef {Object} AuthResult
 * @property {string} token - Access token
 * @property {string} [refresh_token] - Refresh token
 * @property {User} user - User object
 * @property {string} [team_id] - Team/tenant ID
 */
```

---

## Implementation Plan

### Phase 1: Auth Core (No React, No API Client)
**Goal**: Framework-agnostic auth foundation
- [ ] Implement `TokenManager` (storage abstraction)
- [ ] Implement `AuthCore` (both modes)
- [ ] Implement `RefreshManager` (token refresh logic)
- [ ] Implement `SSOManager` (redirect helpers)
- [ ] Add JSDoc types for auth
- [ ] Unit tests (Vitest) - auth only

### Phase 2: API Client Core (No React)
**Goal**: Framework-agnostic API client
- [ ] Implement `BaseAPI` (request logic with auth)
- [ ] Implement `MemoryAPI` (create, list, get, update, delete, search, ingest)
- [ ] Implement `DecisionAPI` (list, getProofTree, getFuzzyConfidence)
- [ ] Implement `GraphAPI` (getNeighbors, addEdge, getGraphHealth, runInference)
- [ ] Implement `TeamAPI` (list, create, addMember, removeMember)
- [ ] Implement `ProfileAPI` (list, getLLMKeys, updateLLMKeys)
- [ ] Implement `SubscriptionAPI` (getCurrentSubscription, upgrade, cancel)
- [ ] Implement `SmartMemoryClient` (main entry point)
- [ ] Add JSDoc types for API
- [ ] Unit tests for each API module

### Phase 3: React Bindings
**Goal**: React hooks for auth + API client
- [ ] Implement `SmartMemoryProvider` (combines auth + client)
- [ ] Implement `useAuth`, `useAuthState`, `useAuthActions`
- [ ] Implement `useSmartMemory` (API client hook)
- [ ] Implement `AuthWrapper` (both modes)
- [ ] React component tests

### Phase 4: Fetch Integration & Utils
**Goal**: Global interceptor, convenience exports
- [ ] Implement `authFetch` wrapper
- [ ] Implement global fetch interceptor
- [ ] Handle 401 with refresh/retry
- [ ] Integration tests

### Phase 5: Migration (Web)
**Goal**: Migrate web app first (custom mode, full API)
- [ ] Migrate web to use SDK auth
- [ ] Migrate web to use SDK API client
- [ ] Remove `src/lib/api.js` (890 lines)
- [ ] Remove `src/context/AuthContext.jsx`
- [ ] Verify all features work
- [ ] Measure bundle size impact

### Phase 6: Migration (Studio/Insights)
**Goal**: Migrate SSO apps
- [ ] Migrate studio auth to SDK
- [ ] Migrate insights auth to SDK
- [ ] Add any studio/insights-specific API methods to SDK
- [ ] Remove duplicate AuthService.js files

### Phase 7: Migration (Maya)
**Goal**: Migrate maya (custom mode)
- [ ] Migrate maya auth to SDK
- [ ] Add any maya-specific API methods to SDK
- [ ] Remove duplicate auth code

### Phase 8: Documentation & Publish
- [ ] README with examples (auth + API)
- [ ] API reference docs (all endpoints)
- [ ] Migration guide (for each mode)
- [ ] TypeScript declarations (d.ts files)
- [ ] Publish to npm as `@smartmemory/sdk-js`

---

## Testing Strategy

### Unit Tests (Core)
```javascript
describe('TokenManager', () => {
  it('should store and retrieve tokens', () => {
    const manager = new TokenManager({ storage: 'memory' });
    manager.setAccessToken('test-token');
    expect(manager.getAccessToken()).toBe('test-token');
  });

  it('should handle storage failures gracefully', () => {
    // Mock localStorage.setItem to throw
    // Verify no crash, logs warning
  });
});

describe('AuthCore (custom mode)', () => {
  it('should login and store tokens', async () => {
    // Mock fetch
    const auth = new AuthCore({ mode: 'custom', apiBaseUrl: '...' });
    const result = await auth.login({ email: 'test@example.com', password: 'pass' });
    expect(result.token).toBeDefined();
    expect(auth.isAuthenticated()).toBe(true);
  });

  it('should refresh token on 401', async () => {
    // Mock 401 response, then successful refresh
    // Verify token updated
  });
});

describe('SSOManager', () => {
  it('should validate redirect URLs against allowlist', () => {
    const sso = new SSOManager({ allowedHosts: ['studio.smartmemory.ai'] });
    expect(sso.isValidRedirectUrl('https://studio.smartmemory.ai/auth/callback')).toBe(true);
    expect(sso.isValidRedirectUrl('https://evil.com/phish')).toBe(false);
  });
});
```

### Integration Tests
```javascript
describe('authFetch with refresh (both modes)', () => {
  it('should retry after successful token refresh', async () => {
    // Mock sequence: 401 → refresh success → retry success
    const auth = new AuthCore({ mode: 'custom', ... });
    const res = await authFetch('/api/test', {}, auth);
    expect(res.ok).toBe(true);
  });

  it('should logout after failed refresh', async () => {
    // Mock sequence: 401 → refresh 401 → logout
    const onLogout = vi.fn();
    auth.addEventListener('logout', onLogout);
    await authFetch('/api/test', {}, auth);
    expect(onLogout).toHaveBeenCalled();
  });

  it('should refresh tokens in SSO mode via main API', async () => {
    const auth = new AuthCore({
      mode: 'sso',
      apiBaseUrl: 'http://localhost:9001',  // Main service
      webAppUrl: 'http://localhost:5173'
    });
    // Mock 401 from studio server (9002) → refresh from main API (9001) → retry
    const res = await authFetch('http://localhost:9002/api/pipelines', {}, auth);
    expect(res.ok).toBe(true);
  });
});
```

### React Component Tests
```javascript
describe('AuthProvider', () => {
  it('should provide auth state to children', () => {
    render(
      <AuthProvider mode="custom" apiBaseUrl="http://localhost:9001">
        <TestComponent />
      </AuthProvider>
    );
    // Verify useAuth() works in TestComponent
  });
});

describe('AuthWrapper (SSO mode)', () => {
  it('should redirect unauthenticated users', () => {
    const { container } = render(
      <AuthProvider mode="sso" webAppUrl="http://localhost:5173">
        <AuthWrapper>
          <div>Protected</div>
        </AuthWrapper>
      </AuthProvider>
    );
    // Verify window.location.href set to login URL
  });
});
```

---

## Open Questions

1. **Package scope**: Publish as `@smartmemory/sdk-js` or `@smart-memory/sdk-js`?
   - Recommendation: `@smartmemory/sdk-js` (matches Docker images, simpler)

2. **React peer dependency**: Require React 18+ or support 17?
   - Recommendation: React 18+ (all our apps are on 18)

3. **Token expiration**: Should SDK auto-refresh before expiration?
   - Recommendation: Yes for both modes, parse JWT exp claim, refresh 5min before expiry

4. **Storage encryption**: Should tokens be encrypted in localStorage?
   - Recommendation: No (XSS can read anyway, adds complexity). Use httpOnly cookies for true security (future)

5. **Multi-tab sync**: Should token updates sync across tabs?
   - Recommendation: Yes via `storage` event listener (low effort, high value)

6. **SSR support**: Should SDK work in Next.js/Remix?
   - Recommendation: Not initially (client-only), add SSR in v2 if needed

---

## Success Metrics

- **Code reduction**: Remove ~2500+ lines total across all projects
  - Web: 890 lines (api.js) + 300 lines (auth) = 1190 lines
  - Studio: 300 lines (auth)
  - Insights: 300 lines (auth)
  - Maya: 300 lines (auth) + partial API duplication
- **Bundle size**: SDK < 25KB gzipped (auth + full API client)
  - Auth module: ~8KB
  - API client: ~15KB
  - React bindings: ~2KB
- **Test coverage**: > 90% for core, > 80% for React bindings
- **Migration time**: < 4 hours per project (more complex now that it includes API)
- **Zero regressions**: All existing auth + API flows continue working
- **Type safety**: Full JSDoc coverage for IDE autocomplete

---

## References

- Current implementations:
  - `smart-memory-web/src/lib/api.js` — custom mode with refresh
  - `smart-memory-studio/web/src/services/AuthService.js` — SSO mode
  - `smart-memory-insights/web/src/services/AuthService.js` — SSO mode (cleaned)
- Related roadmap item: `docs/plans/2026-02-07-remaining-work-ranked.md` #12
