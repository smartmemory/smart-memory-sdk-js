# Architecture Document: JavaScript SDK

**Feature:** @smartmemory/sdk-js
**Status:** Implemented
**Date:** 2026-02-08 (updated 2026-02-21)
**Related:** `PRD.md`, `DESIGN.md`

> **⚠ Auth model superseded (PLAT-SSO-IDP-1, 2026-02-21):**
> The `custom` mode login flow (`AuthCore.login()`, `POST /auth/login`,
> `POST /auth/signup`) has been removed. All applications now use `mode: 'sso'`
> with Clerk-backed authentication. Session bootstrap is cookie-based
> (`GET /auth/me` with `credentials: 'include'`), not token-URL-param-based.
> The `SSOManager.redirectWithTokens()` and `storeCallbackTokens()` patterns
> described in §2.2.3 and §3.1 are deleted. Sections §7.1 (localStorage), §7.5
> (CORS token params), and §8.5 (token encryption) describe the old model.
> See `PLAT-SSO-IDP-1` feature docs for the current auth architecture.

---

## 1. System Context

### 1.1 Current SmartMemory Ecosystem

```
┌─────────────────────────────────────────────────────────────┐
│  Frontend Applications (4 separate codebases)               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │   Web    │  │  Studio  │  │ Insights │  │   Maya   │   │
│  │ (custom) │  │  (SSO)   │  │  (SSO)   │  │ (custom) │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
│       │              │              │              │        │
│       └──────────────┴──────────────┴──────────────┘        │
│                          │                                  │
│                  Each has duplicate:                        │
│                  - AuthService (~300 lines)                 │
│                  - useAuth hook (~150 lines)                │
│                  - API client (partial or full)             │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  SmartMemory API Service (port 9001)                        │
│  - /auth/login (custom apps only)                           │
│  - /auth/refresh (ALL apps)                                 │
│  - /auth/logout                                              │
│  - /memory/* (80+ endpoints)                                │
│  - /decisions/*                                              │
│  - /graph/*                                                  │
│  - /teams/*                                                  │
└─────────────────────────────────────────────────────────────┘
```

**Current Pain Points:**
- ~2500 lines of duplicated auth + API code across 4 projects
- Inconsistent token refresh (web works, studio/insights broken)
- Partial API coverage (only web has full 80+ methods)
- Bug fixes require 4x PRs

### 1.2 SDK Integration

```
┌─────────────────────────────────────────────────────────────┐
│  Frontend Applications (4 separate codebases)               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │   Web    │  │  Studio  │  │ Insights │  │   Maya   │   │
│  │ (custom) │  │  (SSO)   │  │  (SSO)   │  │ (custom) │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
│       │              │              │              │        │
│       └──────────────┴──────────────┴──────────────┘        │
│                          │                                  │
│                  All import:                                │
│            @smartmemory/sdk-js (~25KB)                      │
│                          │                                  │
│  ┌───────────────────────────────────────────────────────┐ │
│  │  SDK (Framework-Agnostic Core + React Bindings)       │ │
│  │  - AuthCore (both modes: custom + SSO)                │ │
│  │  - TokenManager (storage abstraction)                 │ │
│  │  - RefreshManager (auto-refresh for both modes)       │ │
│  │  - SmartMemoryClient (80+ API methods)                │ │
│  │  - React: AuthProvider, useAuth, useSmartMemory       │ │
│  └───────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  SmartMemory API Service (port 9001)                        │
│  [Same as before, but now consumed via SDK]                 │
└─────────────────────────────────────────────────────────────┘
```

**Benefits:**
- Single source of truth for auth + API logic
- Consistent behavior across all apps
- Bug fixes in one place
- Complete API coverage for all apps

---

## 2. Component Design

### 2.1 Architecture Layers

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 3: Framework Bindings (React 18+)                    │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  AuthProvider  │  useAuth  │  useSmartMemory        │   │
│  │  AuthWrapper   │  useAuthState  │  useAuthActions   │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  Layer 2: Client Facades (Domain-Specific APIs)             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  SmartMemoryClient (main entry point)               │   │
│  │    ├─ auth: AuthCore                                │   │
│  │    ├─ memories: MemoryAPI                           │   │
│  │    ├─ decisions: DecisionAPI                        │   │
│  │    ├─ graph: GraphAPI                               │   │
│  │    ├─ teams: TeamAPI                                │   │
│  │    ├─ profiles: ProfileAPI                          │   │
│  │    └─ subscriptions: SubscriptionAPI                │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  Layer 1: Core Services (Framework-Agnostic)                │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  AuthCore (mode: custom | sso)                      │   │
│  │    ├─ TokenManager (storage abstraction)            │   │
│  │    ├─ RefreshManager (auto-refresh both modes)      │   │
│  │    └─ SSOManager (redirect helpers, sso only)       │   │
│  │                                                       │   │
│  │  BaseAPI (shared request logic)                     │   │
│  │    ├─ authFetch (401 handling with refresh)         │   │
│  │    └─ error handling                                │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  Layer 0: Browser APIs                                      │
│  fetch, localStorage, sessionStorage, URL, URLSearchParams  │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Core Components

#### 2.2.1 TokenManager
**Responsibility:** Abstract token storage across localStorage, sessionStorage, and in-memory

**Interface:**
```javascript
class TokenManager {
  constructor(options: {
    storage: 'localStorage' | 'sessionStorage' | 'memory',
    keys: {
      access: string,
      refresh: string,
      user: string,
      tenant: string
    }
  })

  getAccessToken(): string | null
  setAccessToken(token: string): void
  getRefreshToken(): string | null
  setRefreshToken(token: string): void
  getUser(): User | null
  setUser(user: User): void
  getTenantId(): string | null
  setTenantId(tenantId: string): void
  clearAll(): void
}
```

**Storage Strategy:**
- `localStorage`: Persistent across sessions (default)
- `sessionStorage`: Cleared on tab close (higher security)
- `memory`: No persistence (testing, SSR)

**Error Handling:**
- Gracefully handle storage quota exceeded
- Fallback to memory if storage unavailable
- Log warnings but never crash

#### 2.2.2 RefreshManager
**Responsibility:** Automatic token refresh for both custom and SSO modes

**Interface:**
```javascript
class RefreshManager {
  constructor(options: {
    apiBaseUrl: string,
    refreshEndpoint: string,
    tokenManager: TokenManager,
    onTokenRefreshed: (token: string) => void,
    onRefreshFailed: () => void
  })

  refresh(): Promise<string>
  scheduleRefresh(token: string): void  // Parse exp, schedule 5min before
  cancelRefresh(): void
}
```

**Behavior:**
- Parse JWT `exp` claim to determine expiration
- Schedule refresh 5 minutes before expiration
- On refresh failure, call `onRefreshFailed()` (triggers logout)
- Only one refresh in flight at a time (queue concurrent requests)

**Critical for SSO Mode:**
- SSO apps (studio, insights) configure `apiBaseUrl: 'http://localhost:9001'`
- This ensures refresh calls go to main service, NOT local server (9002)
- Both modes use identical refresh logic, only login differs

#### 2.2.3 SSOManager (SSO Mode Only)
**Responsibility:** SSO redirect URL generation and validation

**Interface:**
```javascript
class SSOManager {
  constructor(options: {
    webAppUrl: string,
    allowedHosts: string[],
    tokenManager: TokenManager
  })

  getLoginUrl(redirectUrl: string): string
  isValidRedirectUrl(url: string): boolean
  storeRedirect(url: string): void  // sessionStorage
  getAndClearRedirect(): string | null
  redirectWithTokens(url: string): void  // Append tokens to URL
  storeCallbackTokens(params: URLSearchParams): void
}
```

**Security:**
- `allowedHosts` is an allowlist (e.g., `['studio.smartmemory.ai', 'insights.smartmemory.ai']`)
- `isValidRedirectUrl()` prevents open redirect attacks
- Tokens passed via URL params (since cross-origin localStorage isolated)
- Callback flow: web login → redirect with tokens → app stores locally

#### 2.2.4 AuthCore
**Responsibility:** Unified auth API for both custom and SSO modes

**Interface:**
```javascript
class AuthCore {
  constructor(config: AuthConfig)

  // Common methods (both modes)
  getToken(): string | null
  getUser(): User | null
  getTenantId(): string | null
  isAuthenticated(): boolean
  hasRole(role: string): boolean
  logout(): Promise<void>
  refreshToken(): Promise<string>  // Both modes!
  setTenantId(tenantId: string): void
  getAuthHeaders(extraHeaders?: object): Headers
  addEventListener(listener: (state: AuthState) => void): () => void

  // Custom mode only
  login(credentials: {email: string, password: string}): Promise<AuthResult>

  // SSO mode only
  getLoginUrl(currentUrl: string): string
  storeCallbackTokens(params: URLSearchParams): void
  isValidRedirectUrl(url: string): boolean
}
```

**Mode Differences:**
| Feature | Custom Mode | SSO Mode |
|---------|-------------|----------|
| Login | `login()` calls API | `getLoginUrl()` redirects to web app |
| Refresh | ✅ Via main API | ✅ Via main API (same code) |
| Logout | ✅ Same | ✅ Same |
| Config | `endpoints.login` required | `webAppUrl` required |

**Listener Pattern:**
- Singleton emits events on state change (login, logout, token refresh)
- React bindings subscribe to sync component state
- Returns unsubscribe function for cleanup

#### 2.2.5 BaseAPI
**Responsibility:** Shared request logic with automatic auth + retry

**Interface:**
```javascript
class BaseAPI {
  constructor(authCore: AuthCore)

  request(endpoint: string, options?: RequestOptions): Promise<Response>
  get(endpoint: string, options?: RequestOptions): Promise<any>
  post(endpoint: string, data: any, options?: RequestOptions): Promise<any>
  put(endpoint: string, data: any, options?: RequestOptions): Promise<any>
  delete(endpoint: string, options?: RequestOptions): Promise<any>
  handleError(response: Response): Promise<APIError>
}
```

**401 Handling Flow:**
```
1. Request with auth headers
2. Receive 401 Unauthorized
3. Call authCore.refreshToken()
   ├─ Success: Retry original request with new token
   └─ Failure: Call authCore.logout(), throw error
4. If retry also 401: Logout (token invalid/expired)
```

**Key Implementation Details:**
- Prevent infinite retry loops with `__isRetry` flag
- Auto-add `Authorization` and `X-Team-Id` headers
- Parse error responses (JSON or text)
- Throw `APIError` with status code and detail

#### 2.2.6 Domain API Modules
**Responsibility:** Group related endpoints, delegate to BaseAPI

**Structure:**
```javascript
class MemoryAPI {
  constructor(baseAPI: BaseAPI)
  async create(params): Promise<Memory>
  async list(options): Promise<Memory[]>
  async get(id): Promise<Memory>
  async update(id, params): Promise<Memory>
  async delete(id): Promise<void>
  async search(query, options): Promise<Memory[]>
  async ingest(content, params): Promise<Memory>
}

class DecisionAPI {
  constructor(baseAPI: BaseAPI)
  async list(options): Promise<Decision[]>
  async get(id): Promise<Decision>
  async getProofTree(id): Promise<ProofTree>
  async getFuzzyConfidence(id): Promise<number>
}

class GraphAPI {
  constructor(baseAPI: BaseAPI)
  async getNeighbors(itemId): Promise<GraphNode[]>
  async addEdge(sourceId, targetId, relation): Promise<Edge>
  async getGraphHealth(): Promise<HealthMetrics>
  async runInference(): Promise<InferenceResult>
}

// TeamAPI, ProfileAPI, SubscriptionAPI follow same pattern
```

**Why Domain Modules?**
- Tree-shakeable: Import only `MemoryAPI` if you don't use decisions/graph
- Logical grouping: Easier to find methods (`client.memories.list()` vs flat API)
- Consistent patterns: All follow same CRUD conventions

#### 2.2.7 SmartMemoryClient
**Responsibility:** Main entry point, aggregates all domain APIs

**Interface:**
```javascript
class SmartMemoryClient {
  constructor(config: ClientConfig)

  // Auth API (AuthCore instance)
  auth: AuthCore

  // Domain APIs
  memories: MemoryAPI
  decisions: DecisionAPI
  graph: GraphAPI
  teams: TeamAPI
  profiles: ProfileAPI
  subscriptions: SubscriptionAPI
}
```

**Initialization:**
```javascript
const client = new SmartMemoryClient({
  mode: 'sso',
  apiBaseUrl: 'http://localhost:9001',
  webAppUrl: 'http://localhost:5173',
  storage: 'localStorage',
  onTokenRefresh: (token) => console.log('Token refreshed'),
  onAuthStateChange: (state) => console.log('Auth state:', state)
});
```

**Usage:**
```javascript
// Auth
await client.auth.logout();
const isAuthed = client.auth.isAuthenticated();

// API
const memories = await client.memories.list({ limit: 50 });
const memory = await client.memories.create({ content: 'test', type: 'semantic' });
```

---

## 3. Data Flow

### 3.1 Initial Login Flow

#### Custom Mode (Web, Maya)
```
User submits login form
  ↓
Component calls client.auth.login({email, password})
  ↓
AuthCore.login() → POST /auth/login
  ↓
API responds: {token, refresh_token, user, team_id}
  ↓
AuthCore stores tokens via TokenManager
  ↓
AuthCore emits 'login' event
  ↓
React AuthProvider receives event, updates state
  ↓
Components re-render with isAuthenticated=true
```

#### SSO Mode (Studio, Insights)
```
User visits app without tokens
  ↓
AuthWrapper detects !isAuthenticated
  ↓
Calls client.auth.getLoginUrl(window.location.href)
  ↓
SSOManager generates: http://localhost:5173/login?redirect=http://localhost:9002/
  ↓
AuthWrapper sets window.location.href = loginUrl (redirect)
  ↓
[User logs in on web app at localhost:5173]
  ↓
Web app redirects to: http://localhost:9002/auth/callback?token=...&refresh_token=...
  ↓
AuthCallback component calls client.auth.storeCallbackTokens(urlParams)
  ↓
SSOManager validates redirect URL against allowlist
  ↓
SSOManager stores tokens via TokenManager
  ↓
AuthCore emits 'login' event
  ↓
AuthCallback redirects to original page (from sessionStorage)
  ↓
AuthWrapper now sees isAuthenticated=true, renders app
```

### 3.2 Token Refresh Flow (Both Modes)

```
Component calls client.memories.list()
  ↓
MemoryAPI.list() → BaseAPI.get('/memory')
  ↓
BaseAPI.request() adds Authorization header
  ↓
fetch() → API responds 401 Unauthorized
  ↓
BaseAPI detects 401, calls authCore.refreshToken()
  ↓
RefreshManager.refresh() → POST http://localhost:9001/auth/refresh
  │                          (Note: Main API, NOT local server)
  ├─ Success: API responds {token, refresh_token}
  │   ↓
  │   TokenManager updates stored tokens
  │   ↓
  │   AuthCore emits 'tokenRefresh' event
  │   ↓
  │   BaseAPI retries original request with new token
  │   ↓
  │   Success: Returns data to component
  │
  └─ Failure: API responds 401 (refresh token invalid)
      ↓
      RefreshManager calls onRefreshFailed()
      ↓
      AuthCore.logout() clears tokens
      ↓
      AuthCore emits 'logout' event
      ↓
      React AuthProvider updates isAuthenticated=false
      ↓
      AuthWrapper redirects to login (custom) or web app (SSO)
```

**Critical Detail for SSO Apps:**
- Studio/insights configure `apiBaseUrl: 'http://localhost:9001'` (main service)
- Refresh calls go to main API, NOT local server (which has no auth endpoints)
- This is the ONLY difference from custom mode — login vs redirect

### 3.3 Multi-Tab Sync (Optional)

```
Tab A: User logs in
  ↓
TokenManager.setAccessToken() writes to localStorage
  ↓
Browser fires 'storage' event on ALL other tabs
  ↓
Tab B: AuthCore's storage listener receives event
  ↓
AuthCore reads updated token from storage
  ↓
AuthCore emits 'login' event in Tab B
  ↓
Tab B's AuthProvider updates state
  ↓
Tab B's components re-render with new auth state
```

**Implementation:**
```javascript
// In AuthCore constructor
window.addEventListener('storage', (e) => {
  if (e.key === this.tokenKeys.access && e.newValue !== e.oldValue) {
    const newToken = e.newValue;
    const newUser = this.tokenManager.getUser();
    this.notifyListeners({ isAuthenticated: !!newToken, user: newUser, token: newToken });
  }
});
```

---

## 4. Interfaces & Contracts

### 4.1 TypeScript Declarations (JSDoc)

```javascript
/**
 * @typedef {Object} AuthConfig
 * @property {'custom' | 'sso'} mode - Authentication mode
 * @property {string} apiBaseUrl - API base URL for all requests
 * @property {Object} [endpoints] - API endpoints (custom mode)
 * @property {string} [endpoints.login] - Login endpoint (custom only)
 * @property {string} [endpoints.refresh] - Refresh endpoint (both modes)
 * @property {string} [endpoints.logout] - Logout endpoint (both modes)
 * @property {string} [webAppUrl] - Web app URL (sso mode)
 * @property {string[]} [allowedRedirectHosts] - Allowed redirect hosts (sso mode)
 * @property {'localStorage' | 'sessionStorage' | 'memory'} [storage='localStorage'] - Storage type
 * @property {Object} [tokenKeys] - Custom storage keys
 * @property {function(string): void} [onTokenRefresh] - Token refresh callback
 * @property {function(AuthState): void} [onAuthStateChange] - Auth state change callback
 * @property {function(Error): void} [onError] - Error callback
 */

/**
 * @typedef {Object} User
 * @property {string} id - User ID
 * @property {string} name - User name
 * @property {string} email - User email
 * @property {string[]} roles - User roles
 * @property {boolean} is_active - Active status
 * @property {Object} [metadata] - Additional user metadata
 */

/**
 * @typedef {Object} AuthState
 * @property {boolean} isAuthenticated - Is user authenticated
 * @property {User | null} user - Current user
 * @property {string | null} token - Access token
 * @property {string | null} tenantId - Tenant/workspace ID
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

/**
 * @typedef {Object} Memory
 * @property {string} id - Memory ID
 * @property {string} content - Memory content
 * @property {string} type - Memory type (working, semantic, episodic, etc.)
 * @property {Object} [metadata] - Memory metadata
 * @property {string} created_at - Creation timestamp
 * @property {string} updated_at - Last update timestamp
 */

/**
 * @typedef {Object} Decision
 * @property {string} id - Decision ID
 * @property {string} question - Decision question
 * @property {string} status - Decision status (pending, active, superseded, etc.)
 * @property {Object} proof_tree - Proof tree structure
 * @property {number} confidence - Confidence score
 */

/**
 * @typedef {Object} GraphNode
 * @property {string} id - Node ID
 * @property {string} type - Node type
 * @property {Object} properties - Node properties
 * @property {Edge[]} edges - Outgoing edges
 */

/**
 * @typedef {Object} Edge
 * @property {string} source - Source node ID
 * @property {string} target - Target node ID
 * @property {string} relation - Edge relation type
 * @property {Object} [properties] - Edge properties
 */

/**
 * @typedef {Object} APIError
 * @property {string} message - Error message
 * @property {number} status - HTTP status code
 * @property {string} [code] - Error code
 * @property {Object} [detail] - Error details
 */
```

### 4.2 Configuration Schemas

#### Custom Mode Config
```javascript
{
  mode: 'custom',
  apiBaseUrl: 'http://localhost:9001',  // Required
  endpoints: {
    login: '/auth/login',     // Required for custom
    refresh: '/auth/refresh', // Required for both
    logout: '/auth/logout'    // Optional
  },
  storage: 'localStorage',    // Optional, default: localStorage
  tokenKeys: {                // Optional, defaults shown
    access: 'smart_memory_auth_token',
    refresh: 'smart_memory_refresh_token',
    user: 'smart_memory_user',
    tenant: 'smart_memory_tenant_id'
  }
}
```

#### SSO Mode Config
```javascript
{
  mode: 'sso',
  apiBaseUrl: 'http://localhost:9001',  // Required (main API for refresh)
  webAppUrl: 'http://localhost:5173',   // Required for SSO
  allowedRedirectHosts: [               // Required for SSO
    'studio.smartmemory.ai',
    'insights.smartmemory.ai'
  ],
  endpoints: {
    refresh: '/auth/refresh', // Required for both
    logout: '/auth/logout'    // Optional
  },
  storage: 'localStorage'     // Optional
}
```

---

## 5. Storage & State

### 5.1 Token Storage Keys

| Key | Value | Lifetime |
|-----|-------|----------|
| `smart_memory_auth_token` | JWT access token | Until expiration or logout |
| `smart_memory_refresh_token` | JWT refresh token | Until expiration or logout |
| `smart_memory_user` | JSON user object | Until logout |
| `smart_memory_tenant_id` | Workspace/team ID | Until logout or changed |

**Storage Locations:**
- `localStorage`: Persists across sessions (default, most common)
- `sessionStorage`: Cleared on tab close (higher security, less UX friction)
- `memory`: No persistence (testing, SSR environments)

### 5.2 State Management

**Singleton Pattern:**
- `AuthCore` is instantiated once per application
- React `AuthProvider` wraps this singleton
- All components access same auth instance via context

**Reactive State:**
```javascript
// AuthCore maintains internal state
{
  currentToken: string | null,
  currentUser: User | null,
  currentTenantId: string | null,
  listeners: Set<Function>
}

// On state change, notify all listeners
notifyListeners(newState: Partial<AuthState>) {
  this.listeners.forEach(listener => listener(newState));
}

// React AuthProvider subscribes
useEffect(() => {
  const unsubscribe = authCore.addEventListener((newState) => {
    setAuthState(prev => ({ ...prev, ...newState }));
  });
  return unsubscribe;
}, []);
```

### 5.3 Session Storage (SSO Redirect Flow)

| Key | Value | Lifetime |
|-----|-------|----------|
| `smart_memory_sso_redirect` | Original URL before login redirect | Until callback processed |

**Flow:**
1. User visits `/dashboard` (not authenticated)
2. Store `/dashboard` in sessionStorage
3. Redirect to web app login
4. After login, callback receives tokens
5. Read `/dashboard` from sessionStorage, redirect there
6. Clear sessionStorage key

---

## 6. Dependencies

### 6.1 Runtime Dependencies

**Browser APIs (ES2020+):**
- `fetch` - HTTP requests
- `localStorage` / `sessionStorage` - Token storage
- `URL` / `URLSearchParams` - URL manipulation
- `JSON` - Serialization
- `Promise` - Async operations
- `Set` - Listener tracking
- `window.location` - Redirects (SSO mode)

**React (Peer Dependency):**
- `react` >= 18.0.0
- `react-dom` >= 18.0.0

**No Other Dependencies:**
- No axios, no lodash, no external libs
- Pure ES2020 JavaScript
- Tree-shakeable exports

### 6.2 Development Dependencies

- `vitest` - Unit testing
- `@testing-library/react` - React component testing
- `@testing-library/react-hooks` - Hook testing
- `jsdom` - Browser environment simulation
- `vite` - Build tool
- `eslint` - Linting
- `prettier` - Formatting

---

## 7. Security Considerations

### 7.1 Token Storage

**XSS Vulnerability:**
- `localStorage` and `sessionStorage` are vulnerable to XSS
- If attacker can inject script, they can steal tokens
- Mitigation: CSP headers, input sanitization (app responsibility)
- Future: Migrate to httpOnly cookies (out of scope for v1)

**Decision:** Use localStorage for v1 (pragmatic choice)
- All existing apps use localStorage today
- Migration to cookies requires backend changes
- SDK v1 matches current security model

### 7.2 Open Redirect Prevention

**Threat:** Attacker crafts malicious redirect URL
```
https://studio.smartmemory.ai/auth/callback?redirect=https://evil.com/phish
```

**Mitigation:** Allowlist validation
```javascript
isValidRedirectUrl(url) {
  try {
    const parsed = new URL(url);
    return this.allowedHosts.includes(parsed.hostname);
  } catch {
    return false;
  }
}
```

**Enforcement Points:**
- `SSOManager.getLoginUrl()` validates redirect param
- `SSOManager.storeCallbackTokens()` validates redirect URL
- Reject any URL not on allowlist

### 7.3 Token Refresh Race Conditions

**Problem:** Multiple concurrent requests trigger refresh
```
Request A → 401
Request B → 401
Request C → 401
All three call refreshToken() simultaneously
```

**Mitigation:** Single-flight refresh
```javascript
class RefreshManager {
  #refreshPromise = null;

  async refresh() {
    // If refresh already in flight, return same promise
    if (this.#refreshPromise) {
      return this.#refreshPromise;
    }

    this.#refreshPromise = this.#doRefresh();
    try {
      return await this.#refreshPromise;
    } finally {
      this.#refreshPromise = null;
    }
  }
}
```

### 7.4 Infinite Retry Loops

**Problem:** 401 → refresh → retry → 401 → refresh → ...

**Mitigation:** Single retry flag
```javascript
async request(endpoint, options = {}) {
  let response = await fetch(url, { ...options, headers });

  if (response.status === 401 && !options.__isRetry) {
    await this.auth.refreshToken();
    response = await fetch(url, {
      ...options,
      headers: this.auth.getAuthHeaders(options.headers),
      __isRetry: true  // Prevent infinite loop
    });
  }

  // If still 401 after retry, logout and throw
  if (response.status === 401) {
    await this.auth.logout();
    throw new APIError('Authentication failed', 401);
  }
}
```

### 7.5 CORS & Credentials

**SSO Cross-Origin Flow:**
- Web app (localhost:5173) redirects to studio (localhost:9002)
- Tokens passed via URL params (localStorage isolated by origin)
- No cookies shared between origins

**API Requests:**
- All API calls to same origin (localhost:9001 or production API)
- CORS not an issue for same-origin
- If cross-origin needed, backend must set CORS headers

---

## 8. Trade-offs & Alternatives

### 8.1 Framework-Agnostic Core vs. React-Only

**Chosen:** Framework-agnostic core + React bindings layer

**Alternatives Considered:**
1. **React-only SDK** (no vanilla core)
   - ❌ Can't use in vanilla JS apps
   - ❌ Harder to test (requires React environment)
   - ✅ Simpler implementation

2. **Framework-agnostic only** (no React bindings)
   - ❌ Poor DX for React apps (boilerplate)
   - ✅ Maximum flexibility
   - ✅ Smaller bundle

**Rationale for Chosen Approach:**
- All our apps use React, so React bindings are essential
- But core logic (auth, fetch, storage) is pure JavaScript
- This enables testing without React, future Vue/Svelte support
- Consumers can import only what they need (tree-shakeable)

### 8.2 Two-Mode vs. Separate Packages

**Chosen:** Single SDK with mode switch

**Alternatives Considered:**
1. **Separate packages:** `@smartmemory/sdk-custom` + `@smartmemory/sdk-sso`
   - ❌ Duplicate code (refresh logic, API client, React bindings)
   - ❌ Harder to maintain (2x test suites)
   - ✅ Clearer separation

2. **Custom only, SSO apps use redirect hack**
   - ❌ SSO apps still can't refresh tokens
   - ❌ No official solution for studio/insights pattern

**Rationale for Chosen Approach:**
- Both modes share 90% of code (refresh, API client, React bindings)
- Only login flow differs (form vs redirect)
- Single package reduces maintenance burden
- Mode switch is simple config option

### 8.3 Global Fetch Interceptor vs. Wrapper Function

**Chosen:** Provide both as options

**Alternatives Considered:**
1. **Global interceptor only**
   - ❌ Can interfere with other libraries
   - ❌ Harder to debug (magic behavior)
   - ✅ Zero boilerplate in app code

2. **Wrapper function only** (`authFetch()`)
   - ❌ Requires changing all fetch calls
   - ✅ Explicit and predictable
   - ✅ No interference

**Rationale for Chosen Approach:**
- SmartMemoryClient uses BaseAPI internally (wrapper pattern)
- Global interceptor available as opt-in for custom fetch calls
- Apps choose based on preference:
  - `client.memories.list()` - no interceptor needed (BaseAPI handles it)
  - `fetch('/custom/endpoint')` - use interceptor for auto-auth

### 8.4 JSDoc vs. TypeScript Source

**Chosen:** JSDoc types, no TypeScript compilation

**Alternatives Considered:**
1. **TypeScript source**
   - ❌ Build complexity (tsc, declaration files)
   - ❌ Consumers must configure TypeScript
   - ✅ Better type safety during development

2. **No types at all**
   - ❌ No IDE autocomplete
   - ❌ Poor DX
   - ✅ Simplest implementation

**Rationale for Chosen Approach:**
- JSDoc provides IDE autocomplete without build step
- Consumers get types in VSCode/WebStorm
- No compilation needed (publish raw .js files)
- Can add `.d.ts` files later if needed (P2 requirement)
- Matches existing codebase pattern (web, studio, insights use JS + JSDoc)

### 8.5 Token Encryption

**Chosen:** No encryption in localStorage

**Alternatives Considered:**
1. **Encrypt tokens with Web Crypto API**
   - ❌ False security (XSS can steal encryption key)
   - ❌ Adds complexity
   - ❌ Slight performance overhead

2. **httpOnly cookies** (true security)
   - ✅ XSS-safe
   - ❌ Requires backend changes (out of scope for v1)
   - ❌ CSRF protection needed

**Rationale for Chosen Approach:**
- Encryption in localStorage is security theater (XSS can read anything)
- True solution is httpOnly cookies (future work)
- For v1, match current security model (localStorage, no encryption)
- Document as known limitation in README

### 8.6 Bundle Size vs. Features

**Chosen:** Full API client in SDK (<25KB gzipped)

**Alternatives Considered:**
1. **Auth-only SDK** (smaller, ~8KB)
   - ❌ Apps still duplicate API client code
   - ❌ Doesn't solve original problem (2500 lines duplicated)

2. **Separate auth + API packages**
   - ❌ Harder to maintain
   - ❌ Users must install 2 packages

**Rationale for Chosen Approach:**
- Full API client is core requirement (PRD #8)
- 25KB is acceptable (web app is 1.3MB today)
- Tree-shaking allows consumers to import only needed modules
- Example: Auth-only import is ~10KB, full client is ~25KB

---

## 9. File Structure (Final)

```
smart-memory-sdk-js/
├── src/
│   ├── auth/
│   │   ├── AuthCore.js           # Main auth class (both modes)
│   │   ├── TokenManager.js       # Storage abstraction
│   │   ├── RefreshManager.js     # Token refresh logic
│   │   └── SSOManager.js         # SSO redirect helpers
│   ├── api/
│   │   ├── SmartMemoryClient.js  # Main entry point
│   │   ├── BaseAPI.js            # Shared request logic
│   │   ├── MemoryAPI.js          # Memory operations
│   │   ├── DecisionAPI.js        # Decision operations
│   │   ├── GraphAPI.js           # Graph operations
│   │   ├── TeamAPI.js            # Team management
│   │   ├── ProfileAPI.js         # Profile/config operations
│   │   └── SubscriptionAPI.js    # Billing/subscription
│   ├── react/
│   │   ├── SmartMemoryProvider.jsx  # Combined auth + API provider
│   │   ├── AuthProvider.jsx         # Auth context provider
│   │   ├── useAuth.js               # Primary auth hook
│   │   ├── useAuthState.js          # State-only hook
│   │   ├── useAuthActions.js        # Actions-only hook
│   │   ├── useSmartMemory.js        # API client hook
│   │   └── AuthWrapper.jsx          # Route protection component
│   ├── fetch/
│   │   ├── authFetch.js          # Authenticated fetch wrapper
│   │   └── interceptor.js        # Global fetch interceptor
│   ├── types/
│   │   ├── auth.js               # Auth types (JSDoc)
│   │   ├── memory.js             # Memory types (JSDoc)
│   │   ├── decision.js           # Decision types (JSDoc)
│   │   ├── graph.js              # Graph types (JSDoc)
│   │   ├── team.js               # Team types (JSDoc)
│   │   └── common.js             # Common types (JSDoc)
│   ├── errors/
│   │   └── APIError.js           # Custom error class
│   └── index.js                  # Public API exports
├── tests/
│   ├── unit/
│   │   ├── auth/
│   │   │   ├── TokenManager.test.js
│   │   │   ├── RefreshManager.test.js
│   │   │   ├── SSOManager.test.js
│   │   │   └── AuthCore.test.js
│   │   └── api/
│   │       ├── BaseAPI.test.js
│   │       ├── MemoryAPI.test.js
│   │       └── ...
│   ├── integration/
│   │   ├── auth-flow.test.js     # End-to-end auth flows
│   │   ├── refresh-retry.test.js # 401 handling
│   │   └── multi-tab.test.js     # Storage sync
│   └── react/
│       ├── AuthProvider.test.jsx
│       ├── useAuth.test.js
│       └── AuthWrapper.test.jsx
├── package.json
├── vite.config.js
├── .eslintrc.js
├── .prettierrc
├── README.md
├── CHANGELOG.md
├── PRD.md                        # Product requirements
├── DESIGN.md                     # Design spec
└── ARCHITECTURE.md               # This document
```

---

## 10. Success Metrics

**Code Reduction:**
- Web: Remove 1190 lines (890 api.js + 300 auth)
- Studio: Remove 300 lines (auth)
- Insights: Remove 300 lines (auth)
- Maya: Remove 300 lines (auth) + partial API duplication
- **Total: ~2500+ lines → single tested SDK**

**Bundle Size:**
- Auth module: ~8KB gzipped
- API client: ~15KB gzipped
- React bindings: ~2KB gzipped
- **Total: <25KB gzipped** ✅

**Test Coverage:**
- Core modules: >90% line coverage
- React bindings: >80% line coverage
- Integration tests: All critical flows covered

**Migration Time:**
- Each frontend: <4 hours (tested with web first)
- Zero regressions: All existing tests pass post-migration

**Developer Experience:**
- JSDoc provides autocomplete in VSCode/WebStorm
- README with examples for both modes
- Migration guide for each app type

**Adoption:**
- All 4 projects migrate and delete legacy auth code
- SDK published to npm as `@smartmemory/sdk-js`

---

## 11. Implementation Phases

Detailed implementation plan in `DESIGN.md` Phase 1-8. This architecture document serves as the bridge between requirements (PRD) and implementation (blueprint).

**Next Step:** Phase 2 - Implementation Blueprint (verify file paths, patterns, existing code)

---

**Document Status:** ✅ Ready for Phase 1c Gate (Architecture approval)
