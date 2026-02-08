# Implementation Blueprint

**Updated:** 2026-02-08 after source code review
**Status:** Ready for implementation

---

## Source Code Review: Critical Patterns

### Web App API Client (`smart-memory-web/src/lib/api.js`)

**File:** smart-memory-web/src/lib/api.js (lines 1-891)

**Pattern: Singleton class export**
```javascript
class SmartMemoryAPI {
  constructor() {
    this.baseURL = API_BASE_URL;
    this.token = localStorage.getItem('access_token');
  }
}
export const api = new SmartMemoryAPI();
export default api;
```

**Pattern: Token refresh in request() method**
Lines 67-101: 401 handling with inline refresh logic
- NOT a separate `refreshToken()` method call
- Inline `fetch('/auth/refresh', { body: JSON.stringify({ refresh_token }) })`
- Retry with `__isRetry` flag to prevent loops
- Token storage: `access_token` and `refresh_token` in localStorage (NOT `smart_memory_auth_token`)

**Pattern: Error tracking integration**
Lines 107-141: Every error calls `errorTracker.captureException()`

**Pattern: Method signatures**
- `async createMemory(content, memoryType = 'semantic', metadata = null, usePipeline = true, profileName = null)`
- `async listMemories(limit = 50, offset = 0)`
- `async searchMemory(query, topK = 5, memoryType = null, enableHybrid = true)`
- **camelCase** method names, **snake_case** API params

**Pattern: Header injection**
Lines 44-56: Tenant header is `X-Team-Id` for web (NOT `X-Workspace-Id`)

### Web App Auth Context (`smart-memory-web/src/context/AuthContext.jsx`)

**File:** smart-memory-web/src/context/AuthContext.jsx (lines 1-116)

**Pattern: Simple context, no singleton AuthService**
- No AuthService class, directly uses `api` methods
- `const [user, setUser] = useState(null)` in provider
- `const [loading, setLoading] = useState(true)`
- `const [error, setError] = useState(null)`

**Pattern: Team ID storage**
Lines 33-35, 52-54, 68-71: Stores `team_id` from `userData.default_team_id`
```javascript
if (userData?.default_team_id) {
  localStorage.setItem('team_id', userData.default_team_id);
}
```

### Studio/Insights Auth (`AuthService.js`)

**File:** smart-memory-studio/web/src/services/AuthService.js (lines 1-324)

**Pattern: Singleton AuthService class**
```javascript
export class AuthService {
  constructor() {
    this.listeners = new Set();
    this.currentUser = this.getStoredUser();
    this.currentToken = this.getStoredToken();
  }
}
export const authService = new AuthService();
```

**Pattern: Storage keys**
Lines 8-11:
```javascript
const TOKEN_KEY = 'smart_memory_auth_token';
const REFRESH_TOKEN_KEY = 'smart_memory_refresh_token';
const USER_KEY = 'smart_memory_user';
const TENANT_KEY = 'smart_memory_tenant_id';
```

**Pattern: Storage fallback**
Lines 29-36: Try localStorage THEN sessionStorage
```javascript
getStoredToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
  } catch (e) {
    console.warn('Failed to access token storage:', e);
    return null;
  }
}
```

**Pattern: Listener system**
Lines 254-286: Set-based listeners with error-safe notify
```javascript
notifyListeners() {
  const authState = {
    isAuthenticated: this.isAuthenticated(),
    user: this.currentUser,
    token: this.currentToken,
    tenantId: this.getTenantId()
  };
  this.listeners.forEach(listener => {
    try {
      listener(authState);
    } catch (e) {
      console.error('Auth listener error:', e);
    }
  });
}
```

**Pattern: Header generation**
Lines 202-221: Returns plain object (NOT Headers instance)
```javascript
getAuthHeaders(extraHeaders = {}) {
  const headers = { ...extraHeaders };
  if (this.currentToken) {
    const token = this.currentToken.startsWith('Bearer ')
      ? this.currentToken
      : `Bearer ${this.currentToken}`;
    headers['Authorization'] = token;
  }
  const tenantId = this.getTenantId();
  if (tenantId) {
    headers['X-Workspace-Id'] = tenantId;
  }
  return headers;
}
```

**Pattern: SSO methods**
Lines 292-308:
```javascript
storeCallbackTokens(token, refreshToken, teamId) {
  this.setToken(token, true);
  if (refreshToken) {
    try { localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken); } catch (e) { /* ignore */ }
  }
  if (teamId) {
    this.setTenantId(teamId);
  }
}

getLoginUrl() {
  const callbackUrl = `${window.location.origin}/auth/callback`;
  return `${WEB_APP_URL}/login?redirect=${encodeURIComponent(callbackUrl)}`;
}
```

### React Hooks (`useAuth.jsx`)

**File:** smart-memory-studio/web/src/hooks/useAuth.jsx (lines 1-150)

**Pattern: Context + hooks**
- `AuthContext = createContext(null)`
- `AuthProvider` wraps children, subscribes to authService
- `useAuth()` throws if outside provider
- `useAuthState()` for read-only state
- `useAuthActions()` for actions only

**Pattern: State initialization**
Lines 19-26:
```javascript
const [authState, setAuthState] = useState({
  isAuthenticated: authService.isAuthenticated(),
  user: authService.getCurrentUser(),
  token: authService.getCurrentToken(),
  tenantId: authService.getTenantId(),
  loading: false,
  error: null
});
```

**Pattern: Listener subscription**
Lines 29-40:
```javascript
useEffect(() => {
  const unsubscribe = authService.addListener((newAuthState) => {
    setAuthState(prev => ({
      ...prev,
      ...newAuthState,
      loading: false,
      error: null
    }));
  });

  return unsubscribe;
}, []);
```

---

## Corrections Table

| Spec Assumption | Actual Code | Correction |
|-----------------|-------------|------------|
| Web uses `X-Workspace-Id` header | Web uses `X-Team-Id` (line 55 api.js) | SDK should support BOTH headers. Default to `X-Workspace-Id` but allow override. |
| Token keys are `smart_memory_auth_token` | Web uses `access_token`, studio/insights use `smart_memory_auth_token` | SDK should use `smart_memory_auth_token` (studio/insights pattern) for consistency. |
| `refreshToken()` is separate method | Web has inline refresh in `request()` (lines 67-101) | SDK should follow studio pattern (separate method) NOT web's inline pattern. |
| Headers are `Headers` instance | Studio returns plain object (lines 202-221) | SDK should return plain object, NOT Headers instance. |
| Error tracking integrated | Web has `errorTracker.captureException()` everywhere | SDK should provide error callback hooks, NOT built-in tracking. |
| Web has AuthService singleton | Web has NO AuthService, just React context | SDK should follow studio/insights AuthService singleton pattern. |
| Team ID from user object | Web stores `userData.default_team_id` as `team_id` | SDK should accept tenant ID from config OR user object. |
| Storage is simple get/set | Studio has fallback: localStorage → sessionStorage (line 31) | SDK should match studio's fallback pattern. |
| User object stored as-is | Studio/insights store JSON.stringify'd user | SDK should JSON.stringify when storing user objects. |

---

## Implementation Blueprint

### Phase 1: Auth Core

#### File: `src/auth/TokenManager.js` (NEW)
**Pattern:** Follow studio `AuthService.js` storage methods (lines 25-68, 72-116)
```javascript
export class TokenManager {
  constructor({ storage = 'localStorage', keys = DEFAULT_KEYS }) {
    this.storage = storage;
    this.keys = keys;
  }

  getAccessToken() {
    // Pattern from studio lines 29-36: try localStorage, then sessionStorage
    try {
      if (this.storage === 'memory') return this.memoryStore.access;
      const primary = this.storage === 'localStorage' ? localStorage : sessionStorage;
      const fallback = this.storage === 'localStorage' ? sessionStorage : localStorage;
      return primary.getItem(this.keys.access) || fallback.getItem(this.keys.access);
    } catch (e) {
      console.warn('Failed to access token storage:', e);
      return null;
    }
  }

  setAccessToken(token) {
    // Pattern from studio lines 43-60: clear from other storage
    try {
      if (this.storage === 'memory') {
        this.memoryStore.access = token;
        return;
      }
      const primary = this.storage === 'localStorage' ? localStorage : sessionStorage;
      const other = this.storage === 'localStorage' ? sessionStorage : localStorage;
      if (token) {
        primary.setItem(this.keys.access, token);
        other.removeItem(this.keys.access);
      } else {
        primary.removeItem(this.keys.access);
        other.removeItem(this.keys.access);
      }
    } catch (e) {
      console.error('Failed to store token:', e);
    }
  }

  // Similar for getRefreshToken, setRefreshToken, getUser, setUser, getTenantId, setTenantId
  // User storage: JSON.stringify when storing, JSON.parse when retrieving (studio lines 78-84)
}
```

**Default keys:**
```javascript
const DEFAULT_KEYS = {
  access: 'smart_memory_auth_token',      // NOT 'access_token' (studio pattern)
  refresh: 'smart_memory_refresh_token',
  user: 'smart_memory_user',
  tenant: 'smart_memory_tenant_id'
};
```

#### File: `src/auth/RefreshManager.js` (NEW)
**Pattern:** Follow web's inline refresh (api.js lines 67-101) but as separate class
```javascript
export class RefreshManager {
  #refreshPromise = null;  // Prevent concurrent refreshes

  constructor({ apiBaseUrl, refreshEndpoint, tokenManager, onTokenRefreshed, onRefreshFailed }) {
    this.apiBaseUrl = apiBaseUrl;
    this.refreshEndpoint = refreshEndpoint;
    this.tokenManager = tokenManager;
    this.onTokenRefreshed = onTokenRefreshed;
    this.onRefreshFailed = onRefreshFailed;
  }

  async refresh() {
    // Single-flight pattern
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

  async #doRefresh() {
    const refreshToken = this.tokenManager.getRefreshToken();
    if (!refreshToken) {
      this.onRefreshFailed();
      throw new Error('No refresh token');
    }

    // Pattern from web api.js lines 73-87
    const response = await fetch(`${this.apiBaseUrl}${this.refreshEndpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken })
    });

    if (!response.ok) {
      this.onRefreshFailed();
      throw new Error(`Refresh failed: ${response.status}`);
    }

    const data = await response.json();
    this.tokenManager.setAccessToken(data.access_token);
    if (data.refresh_token) {
      this.tokenManager.setRefreshToken(data.refresh_token);
    }

    this.onTokenRefreshed(data.access_token);
    return data.access_token;
  }
}
```

#### File: `src/auth/SSOManager.js` (NEW)
**Pattern:** Follow studio `AuthService.js` SSO methods (lines 292-308)
```javascript
export class SSOManager {
  constructor({ webAppUrl, allowedHosts = [], tokenManager }) {
    this.webAppUrl = webAppUrl;
    this.allowedHosts = allowedHosts;
    this.tokenManager = tokenManager;
  }

  getLoginUrl(redirectUrl) {
    // Pattern from studio lines 305-308
    const callbackUrl = redirectUrl || `${window.location.origin}/auth/callback`;
    return `${this.webAppUrl}/login?redirect=${encodeURIComponent(callbackUrl)}`;
  }

  isValidRedirectUrl(url) {
    if (!this.allowedHosts.length) return true;  // No allowlist = allow all
    try {
      const parsed = new URL(url);
      return this.allowedHosts.includes(parsed.hostname);
    } catch {
      return false;
    }
  }

  storeCallbackTokens(params) {
    // Pattern from studio lines 292-300
    const token = params.get('token');
    const refreshToken = params.get('refresh_token');
    const teamId = params.get('team_id');

    if (token) {
      this.tokenManager.setAccessToken(token);
    }
    if (refreshToken) {
      this.tokenManager.setRefreshToken(refreshToken);
    }
    if (teamId) {
      this.tokenManager.setTenantId(teamId);
    }
  }

  // sessionStorage helpers for redirect URL
  storeRedirect(url) {
    try {
      sessionStorage.setItem('smart_memory_sso_redirect', url);
    } catch (e) {
      console.warn('Failed to store redirect URL:', e);
    }
  }

  getAndClearRedirect() {
    try {
      const url = sessionStorage.getItem('smart_memory_sso_redirect');
      sessionStorage.removeItem('smart_memory_sso_redirect');
      return url;
    } catch (e) {
      return null;
    }
  }
}
```

#### File: `src/auth/AuthCore.js` (NEW)
**Pattern:** Follow studio `AuthService.js` (lines 15-312)
```javascript
export class AuthCore {
  constructor(config) {
    this.mode = config.mode;
    this.apiBaseUrl = config.apiBaseUrl;
    this.endpoints = config.endpoints || {};
    this.listeners = new Set();  // Pattern from studio line 17

    // Initialize managers
    this.tokenManager = new TokenManager({
      storage: config.storage || 'localStorage',
      keys: config.tokenKeys || DEFAULT_KEYS
    });

    this.refreshManager = new RefreshManager({
      apiBaseUrl: this.apiBaseUrl,
      refreshEndpoint: this.endpoints.refresh || '/auth/refresh',
      tokenManager: this.tokenManager,
      onTokenRefreshed: (token) => {
        this.notifyListeners({ token, isAuthenticated: true });
        config.onTokenRefresh?.(token);
      },
      onRefreshFailed: () => {
        this.logout();
      }
    });

    if (this.mode === 'sso') {
      this.ssoManager = new SSOManager({
        webAppUrl: config.webAppUrl,
        allowedHosts: config.allowedRedirectHosts || [],
        tokenManager: this.tokenManager
      });
    }

    // Initialize current state from storage (pattern from studio lines 18-19)
    this.currentUser = this.tokenManager.getUser();
    this.currentToken = this.tokenManager.getAccessToken();
  }

  // State methods (pattern from studio lines 159-193)
  isAuthenticated() {
    return !!this.currentToken;
  }

  getCurrentUser() {
    return this.currentUser;
  }

  getCurrentToken() {
    return this.currentToken;
  }

  hasRole(role) {
    return this.currentUser?.roles?.includes(role) || false;
  }

  // Headers (pattern from studio lines 202-221) - return plain object NOT Headers
  getAuthHeaders(extraHeaders = {}) {
    const headers = { ...extraHeaders };

    if (this.currentToken) {
      const token = this.currentToken.startsWith('Bearer ')
        ? this.currentToken
        : `Bearer ${this.currentToken}`;
      headers['Authorization'] = token;
    }

    const tenantId = this.tokenManager.getTenantId();
    if (tenantId) {
      headers['X-Workspace-Id'] = tenantId;  // Use X-Workspace-Id (most common)
    }

    return headers;
  }

  // Listener system (pattern from studio lines 254-286)
  addListener(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notifyListeners(partial = {}) {
    const authState = {
      isAuthenticated: this.isAuthenticated(),
      user: this.currentUser,
      token: this.currentToken,
      tenantId: this.tokenManager.getTenantId(),
      ...partial
    };

    this.listeners.forEach(listener => {
      try {
        listener(authState);
      } catch (e) {
        console.error('Auth listener error:', e);
      }
    });
  }

  // Custom mode: login
  async login(credentials) {
    if (this.mode !== 'custom') {
      throw new Error('login() only available in custom mode');
    }

    const response = await fetch(`${this.apiBaseUrl}${this.endpoints.login}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials)
    });

    if (!response.ok) {
      throw new Error(`Login failed: ${response.status}`);
    }

    const data = await response.json();
    this.tokenManager.setAccessToken(data.tokens?.access_token || data.access_token);
    if (data.tokens?.refresh_token || data.refresh_token) {
      this.tokenManager.setRefreshToken(data.tokens?.refresh_token || data.refresh_token);
    }

    const user = data.user;
    this.tokenManager.setUser(user);
    this.currentUser = user;
    this.currentToken = this.tokenManager.getAccessToken();

    // Store tenant ID if provided
    if (user.default_team_id || data.team_id) {
      this.tokenManager.setTenantId(user.default_team_id || data.team_id);
    }

    this.notifyListeners();
    return { token: this.currentToken, user };
  }

  // SSO mode: redirect helpers
  getLoginUrl(currentUrl) {
    if (this.mode !== 'sso') {
      throw new Error('getLoginUrl() only available in sso mode');
    }
    return this.ssoManager.getLoginUrl(currentUrl);
  }

  storeCallbackTokens(params) {
    if (this.mode !== 'sso') {
      throw new Error('storeCallbackTokens() only available in sso mode');
    }
    this.ssoManager.storeCallbackTokens(params);
    this.currentUser = this.tokenManager.getUser();
    this.currentToken = this.tokenManager.getAccessToken();
    this.notifyListeners();
  }

  // Both modes
  async logout() {
    // Optional: call logout endpoint
    if (this.endpoints.logout) {
      try {
        await fetch(`${this.apiBaseUrl}${this.endpoints.logout}`, {
          method: 'POST',
          headers: this.getAuthHeaders()
        });
      } catch (e) {
        console.warn('Logout request failed:', e);
      }
    }

    this.tokenManager.clearAll();
    this.currentUser = null;
    this.currentToken = null;
    this.notifyListeners();
  }

  async refreshToken() {
    return this.refreshManager.refresh();
  }

  setTenantId(tenantId) {
    this.tokenManager.setTenantId(tenantId);
    this.notifyListeners();
  }

  getTenantId() {
    return this.tokenManager.getTenantId();
  }
}
```

### Phase 2: API Client Core

#### File: `src/api/BaseAPI.js` (NEW)
**Pattern:** Follow web `api.js` request method (lines 39-143) but with refresh delegation
```javascript
export class BaseAPI {
  constructor(authCore) {
    this.auth = authCore;
    this.baseURL = authCore.apiBaseUrl;
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const headers = this.auth.getAuthHeaders(options.headers);

    const config = {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    try {
      let response = await fetch(url, config);

      // 401 handling with refresh+retry (pattern from web api.js lines 67-101)
      if (response.status === 401 && !options.__isRetry && endpoint !== this.auth.endpoints.refresh) {
        console.log('[SDK] 401 received, attempting token refresh...');

        try {
          await this.auth.refreshToken();

          // Retry with new token
          const retryHeaders = this.auth.getAuthHeaders(options.headers);
          const retryConfig = {
            ...config,
            headers: {
              'Content-Type': 'application/json',
              ...retryHeaders
            },
            __isRetry: true
          };
          response = await fetch(url, retryConfig);
        } catch (refreshErr) {
          console.error('[SDK] Token refresh failed:', refreshErr);
        }
      }

      // If still 401 after refresh, logout (pattern from web api.js lines 103-113)
      if (response.status === 401) {
        await this.auth.logout();
        throw new APIError('Authentication required', 401, 'auth_expired');
      }

      // Handle 204 No Content
      if (response.status === 204) {
        return null;
      }

      if (!response.ok) {
        throw await this.handleError(response);
      }

      return await response.json();
    } catch (error) {
      if (error instanceof APIError) {
        throw error;
      }
      throw new APIError(error.message, 0, 'network_error');
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
    let errorData;
    const contentType = response.headers.get('content-type');

    if (contentType?.includes('application/json')) {
      errorData = await response.json();
    } else {
      errorData = { message: await response.text() };
    }

    return new APIError(
      errorData.detail || errorData.message || `HTTP ${response.status}`,
      response.status,
      errorData
    );
  }
}
```

#### File: `src/api/MemoryAPI.js` (NEW)
**Pattern:** Follow web `api.js` method signatures (lines 233-297, 504-676)
```javascript
export class MemoryAPI {
  constructor(baseAPI) {
    this.base = baseAPI;
  }

  // Pattern from web api.js lines 235-246
  async create(params) {
    const { content, memoryType = 'semantic', metadata = null, usePipeline = true, profileName = null } = params;
    return this.base.post('/memory/add', {
      content,
      memory_type: memoryType,     // snake_case for API
      metadata,
      use_pipeline: usePipeline,
      profile_name: profileName || null
    });
  }

  // Pattern from web api.js lines 251-258
  async get(id) {
    const response = await this.base.get(`/memory/${id}`);
    // Normalize item_id to id (pattern from web)
    return {
      ...response,
      id: response.item_id || response.id
    };
  }

  // Pattern from web api.js lines 293-295
  async list({ limit = 50, offset = 0, type = null } = {}) {
    const params = new URLSearchParams({ limit, offset });
    if (type) params.set('memory_type', type);
    return this.base.get(`/memory/list?${params}`);
  }

  // Pattern from web api.js lines 272-281
  async update(id, { content, metadata } = {}) {
    const body = {};
    if (typeof content !== 'undefined') body.content = content;
    if (typeof metadata !== 'undefined') body.metadata = metadata;
    return this.base.put(`/memory/${id}`, body);
  }

  // Pattern from web api.js lines 263-267
  async delete(id) {
    return this.base.delete(`/memory/${id}`);
  }

  // Pattern from web api.js lines 508-516
  async search(query, { topK = 5, memoryType = null, enableHybrid = true } = {}) {
    const body = { query, top_k: topK, enable_hybrid: enableHybrid };
    if (memoryType) body.memory_type = memoryType;
    return this.base.post('/memory/search', body);
  }

  // Pattern from web api.js lines 521-531
  async ingest(content, { extractorName = 'llm', context = null, profileName = null } = {}) {
    return this.base.post('/memory/ingest', {
      content,
      profile_name: profileName || null,
      extractor_name: extractorName,
      context: context || {}
    });
  }

  // Additional methods: getNeighbors, enrichMemory, groundMemory, etc. (follow same pattern)
}
```

#### File: `src/api/SmartMemoryClient.js` (NEW)
**Pattern:** Main entry point aggregating all domain APIs
```javascript
import { AuthCore } from '../auth/AuthCore.js';
import { BaseAPI } from './BaseAPI.js';
import { MemoryAPI } from './MemoryAPI.js';
import { DecisionAPI } from './DecisionAPI.js';
// ... other API imports

export class SmartMemoryClient {
  constructor(config) {
    // Initialize auth core
    this.auth = new AuthCore(config);

    // Initialize base API
    const baseAPI = new BaseAPI(this.auth);

    // Initialize domain APIs
    this.memories = new MemoryAPI(baseAPI);
    this.decisions = new DecisionAPI(baseAPI);
    this.graph = new GraphAPI(baseAPI);
    this.teams = new TeamAPI(baseAPI);
    this.profiles = new ProfileAPI(baseAPI);
    this.subscriptions = new SubscriptionAPI(baseAPI);
  }
}
```

### Phase 3: React Bindings

#### File: `src/react/AuthProvider.jsx` (NEW)
**Pattern:** Follow studio `useAuth.jsx` AuthProvider (lines 18-83)
```javascript
import { createContext, useState, useEffect } from 'react';

export const AuthContext = createContext(null);

export function AuthProvider({ children, ...authConfig }) {
  // Initialize AuthCore from config
  const [authCore] = useState(() => new AuthCore(authConfig));

  // State pattern from studio lines 19-26
  const [authState, setAuthState] = useState({
    isAuthenticated: authCore.isAuthenticated(),
    user: authCore.getCurrentUser(),
    token: authCore.getCurrentToken(),
    tenantId: authCore.getTenantId(),
    loading: false,
    error: null
  });

  // Listener subscription pattern from studio lines 29-40
  useEffect(() => {
    const unsubscribe = authCore.addListener((newAuthState) => {
      setAuthState(prev => ({
        ...prev,
        ...newAuthState,
        loading: false,
        error: null
      }));
    });

    return unsubscribe;
  }, [authCore]);

  // ... rest of provider implementation
}
```

---

## Key Takeaways for Implementation

1. **Storage Keys:** Use `smart_memory_auth_token` (studio pattern), NOT `access_token` (web pattern)
2. **Headers:** Return plain objects, NOT `Headers` instances
3. **Refresh Logic:** Separate `RefreshManager` class with single-flight pattern
4. **Listener System:** Set-based with error-safe notify
5. **Storage Fallback:** Try primary storage, then fallback (localStorage → sessionStorage)
6. **User Storage:** JSON.stringify when storing, JSON.parse when retrieving
7. **401 Handling:** Inline in BaseAPI.request(), NOT as separate middleware
8. **Tenant Header:** Default to `X-Workspace-Id`, but allow configuration
9. **SSO Flow:** Store redirect URL in sessionStorage, validate redirect URLs against allowlist
10. **Error Handling:** Custom `APIError` class, never expose stack traces

---

**Next Step:** Begin Phase 1 implementation with TokenManager
