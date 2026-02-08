# @smartmemory/sdk-js Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a unified JavaScript SDK that consolidates auth + API client logic across 4 SmartMemory frontends, removing ~2500 lines of duplicated code.

**Architecture:** Framework-agnostic core (Layer 1: TokenManager, RefreshManager, SSOManager, AuthCore, BaseAPI) with domain API facades (Layer 2: MemoryAPI, DecisionAPI, GraphAPI, etc.) and React bindings on top (Layer 3: AuthProvider, useAuth, useSmartMemory, AuthWrapper). Two auth modes: `custom` (web/maya with login form) and `sso` (studio/insights with redirect).

**Tech Stack:** ES2020 JavaScript with JSDoc types, Vite for bundling, Vitest for testing, React 18 peer dependency. Zero runtime dependencies.

**Reference files:**
- Blueprint: `BLUEPRINT.md` (corrections table, exact patterns with line refs)
- Architecture: `ARCHITECTURE.md` (component design, data flow)
- Design: `DESIGN.md` (API surface, usage examples)
- PRD: `PRD.md` (requirements, success criteria)
- Web API client: `smart-memory-web/src/lib/api.js` (source of truth for 80+ methods)
- Studio auth: `smart-memory-studio/web/src/services/AuthService.js` (SSO pattern)
- Studio hooks: `smart-memory-studio/web/src/hooks/useAuth.jsx` (React pattern)

---

## Task 0: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `vite.config.js`
- Create: `.gitignore`
- Create: `src/index.js` (empty entry point)

**Step 1: Initialize package.json**

```bash
cd /Users/ruze/reg/my/SmartMemory/smart-memory-sdk-js
```

Create `package.json`:

```json
{
  "name": "@smartmemory/sdk-js",
  "version": "0.1.0",
  "description": "Unified JavaScript SDK for SmartMemory API — auth + API client for all frontends",
  "type": "module",
  "main": "dist/index.js",
  "module": "dist/index.js",
  "exports": {
    ".": "./dist/index.js",
    "./core": "./dist/core.js",
    "./react": "./dist/react.js",
    "./fetch": "./dist/fetch.js"
  },
  "files": [
    "dist"
  ],
  "scripts": {
    "build": "vite build",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "lint": "eslint src/ tests/"
  },
  "peerDependencies": {
    "react": ">=18.0.0",
    "react-dom": ">=18.0.0"
  },
  "peerDependenciesMeta": {
    "react": { "optional": true },
    "react-dom": { "optional": true }
  },
  "devDependencies": {
    "vite": "^6.0.0",
    "vitest": "^3.0.0",
    "@testing-library/react": "^16.0.0",
    "@testing-library/jest-dom": "^6.0.0",
    "jsdom": "^25.0.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "eslint": "^9.0.0",
    "@vitest/coverage-v8": "^3.0.0"
  },
  "keywords": ["smartmemory", "sdk", "auth", "api-client"],
  "license": "MIT"
}
```

**Step 2: Create vite.config.js**

```javascript
import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.js'),
        core: resolve(__dirname, 'src/core.js'),
        react: resolve(__dirname, 'src/react/index.js'),
        fetch: resolve(__dirname, 'src/fetch/index.js')
      },
      formats: ['es']
    },
    rollupOptions: {
      external: ['react', 'react-dom']
    }
  },
  test: {
    environment: 'jsdom',
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.{js,jsx}'],
      exclude: ['src/types/**']
    }
  }
});
```

**Step 3: Create .gitignore**

```
node_modules/
dist/
coverage/
*.log
.DS_Store
package-lock.json
```

**Step 4: Create stub entry points**

Create `src/index.js`:
```javascript
// @smartmemory/sdk-js — main entry point
// Auth
export { AuthCore } from './auth/AuthCore.js';
export { TokenManager } from './auth/TokenManager.js';

// API Client
export { SmartMemoryClient } from './api/SmartMemoryClient.js';

// Errors
export { APIError } from './errors/APIError.js';
```

Create `src/core.js`:
```javascript
// @smartmemory/sdk-js/core — framework-agnostic auth + API only
export { AuthCore } from './auth/AuthCore.js';
export { TokenManager } from './auth/TokenManager.js';
export { RefreshManager } from './auth/RefreshManager.js';
export { SSOManager } from './auth/SSOManager.js';
export { BaseAPI } from './api/BaseAPI.js';
export { SmartMemoryClient } from './api/SmartMemoryClient.js';
export { APIError } from './errors/APIError.js';
```

**Step 5: Install dependencies and verify**

```bash
npm install
npx vitest run  # Should pass (no tests yet)
```

**Step 6: Commit**

```bash
git add package.json vite.config.js .gitignore src/
git commit -m "chore: scaffold project with vite, vitest, and entry points"
```

---

## Task 1: APIError Class

**Files:**
- Create: `src/errors/APIError.js`
- Create: `tests/unit/errors/APIError.test.js`

Every subsequent module depends on this error class. Build it first.

**Step 1: Write the failing test**

Create `tests/unit/errors/APIError.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import { APIError } from '../../../src/errors/APIError.js';

describe('APIError', () => {
  it('should create error with message, status, and detail', () => {
    const error = new APIError('Not found', 404, { code: 'NOT_FOUND' });

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(APIError);
    expect(error.message).toBe('Not found');
    expect(error.status).toBe(404);
    expect(error.detail).toEqual({ code: 'NOT_FOUND' });
    expect(error.name).toBe('APIError');
  });

  it('should default status to 0 and detail to null', () => {
    const error = new APIError('Network error');

    expect(error.status).toBe(0);
    expect(error.detail).toBeNull();
  });

  it('should be catchable as Error', () => {
    try {
      throw new APIError('Test', 500);
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
      expect(e.status).toBe(500);
    }
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run tests/unit/errors/APIError.test.js
```
Expected: FAIL — module not found

**Step 3: Write implementation**

Create `src/errors/APIError.js`:

```javascript
/**
 * Custom error class for API errors.
 * Extends Error so it's catchable with standard try/catch.
 */
export class APIError extends Error {
  /**
   * @param {string} message - Error message
   * @param {number} [status=0] - HTTP status code (0 for network errors)
   * @param {Object|null} [detail=null] - Error detail from API response
   */
  constructor(message, status = 0, detail = null) {
    super(message);
    this.name = 'APIError';
    this.status = status;
    this.detail = detail;
  }
}
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run tests/unit/errors/APIError.test.js
```
Expected: 3 tests PASS

**Step 5: Commit**

```bash
git add src/errors/ tests/unit/errors/
git commit -m "feat: add APIError class for structured error handling"
```

---

## Task 2: TokenManager

**Files:**
- Create: `src/auth/TokenManager.js`
- Create: `tests/unit/auth/TokenManager.test.js`

Storage abstraction. Pattern from `studio AuthService.js` lines 25-116 (see BLUEPRINT.md).

**Step 1: Write failing tests**

Create `tests/unit/auth/TokenManager.test.js`:

```javascript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TokenManager } from '../../../src/auth/TokenManager.js';

describe('TokenManager', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  describe('memory storage', () => {
    it('should store and retrieve access token in memory', () => {
      const tm = new TokenManager({ storage: 'memory' });
      expect(tm.getAccessToken()).toBeNull();

      tm.setAccessToken('test-token');
      expect(tm.getAccessToken()).toBe('test-token');
    });

    it('should clear all stored data', () => {
      const tm = new TokenManager({ storage: 'memory' });
      tm.setAccessToken('tok');
      tm.setRefreshToken('ref');
      tm.setUser({ id: '1', name: 'Test' });
      tm.setTenantId('tenant-1');

      tm.clearAll();

      expect(tm.getAccessToken()).toBeNull();
      expect(tm.getRefreshToken()).toBeNull();
      expect(tm.getUser()).toBeNull();
      expect(tm.getTenantId()).toBeNull();
    });
  });

  describe('localStorage storage', () => {
    it('should persist access token to localStorage', () => {
      const tm = new TokenManager({ storage: 'localStorage' });
      tm.setAccessToken('persisted-token');

      expect(localStorage.getItem('smart_memory_auth_token')).toBe('persisted-token');
      expect(tm.getAccessToken()).toBe('persisted-token');
    });

    it('should clear token from other storage on set', () => {
      sessionStorage.setItem('smart_memory_auth_token', 'old');
      const tm = new TokenManager({ storage: 'localStorage' });
      tm.setAccessToken('new');

      expect(sessionStorage.getItem('smart_memory_auth_token')).toBeNull();
      expect(localStorage.getItem('smart_memory_auth_token')).toBe('new');
    });

    it('should fall back to sessionStorage on get', () => {
      sessionStorage.setItem('smart_memory_auth_token', 'fallback');
      const tm = new TokenManager({ storage: 'localStorage' });

      expect(tm.getAccessToken()).toBe('fallback');
    });

    it('should remove token when set to null', () => {
      const tm = new TokenManager({ storage: 'localStorage' });
      tm.setAccessToken('tok');
      tm.setAccessToken(null);

      expect(localStorage.getItem('smart_memory_auth_token')).toBeNull();
      expect(tm.getAccessToken()).toBeNull();
    });
  });

  describe('user storage', () => {
    it('should JSON.stringify user on set and JSON.parse on get', () => {
      const tm = new TokenManager({ storage: 'localStorage' });
      const user = { id: '1', name: 'Alice', email: 'alice@test.com', roles: ['user'] };

      tm.setUser(user);

      const raw = localStorage.getItem('smart_memory_user');
      expect(raw).toBe(JSON.stringify(user));
      expect(tm.getUser()).toEqual(user);
    });

    it('should handle corrupted user JSON gracefully', () => {
      localStorage.setItem('smart_memory_user', 'not-json');
      const tm = new TokenManager({ storage: 'localStorage' });

      expect(tm.getUser()).toBeNull();
    });
  });

  describe('tenant storage', () => {
    it('should store and retrieve tenant ID', () => {
      const tm = new TokenManager({ storage: 'localStorage' });
      tm.setTenantId('workspace-123');

      expect(tm.getTenantId()).toBe('workspace-123');
      expect(localStorage.getItem('smart_memory_tenant_id')).toBe('workspace-123');
    });
  });

  describe('custom keys', () => {
    it('should use custom storage keys when provided', () => {
      const tm = new TokenManager({
        storage: 'localStorage',
        keys: {
          access: 'custom_token',
          refresh: 'custom_refresh',
          user: 'custom_user',
          tenant: 'custom_tenant'
        }
      });
      tm.setAccessToken('val');
      expect(localStorage.getItem('custom_token')).toBe('val');
    });
  });

  describe('storage errors', () => {
    it('should not throw when storage is unavailable', () => {
      const originalSetItem = localStorage.setItem;
      localStorage.setItem = () => { throw new Error('QuotaExceeded'); };

      const tm = new TokenManager({ storage: 'localStorage' });
      expect(() => tm.setAccessToken('test')).not.toThrow();

      localStorage.setItem = originalSetItem;
    });
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/unit/auth/TokenManager.test.js
```
Expected: FAIL — module not found

**Step 3: Write implementation**

Create `src/auth/TokenManager.js`:

```javascript
const DEFAULT_KEYS = {
  access: 'smart_memory_auth_token',
  refresh: 'smart_memory_refresh_token',
  user: 'smart_memory_user',
  tenant: 'smart_memory_tenant_id'
};

/**
 * Abstracts token storage across localStorage, sessionStorage, and in-memory.
 * Pattern from studio AuthService.js lines 25-116.
 */
export class TokenManager {
  /**
   * @param {Object} options
   * @param {'localStorage' | 'sessionStorage' | 'memory'} [options.storage='localStorage']
   * @param {Object} [options.keys] - Custom storage key names
   */
  constructor({ storage = 'localStorage', keys = {} } = {}) {
    this.storageType = storage;
    this.keys = { ...DEFAULT_KEYS, ...keys };
    /** @type {{ access: string|null, refresh: string|null, user: Object|null, tenant: string|null }} */
    this._memory = { access: null, refresh: null, user: null, tenant: null };
  }

  // --- Access Token ---

  getAccessToken() {
    if (this.storageType === 'memory') return this._memory.access;
    return this._getFromStorage(this.keys.access);
  }

  setAccessToken(token) {
    if (this.storageType === 'memory') {
      this._memory.access = token;
      return;
    }
    this._setInStorage(this.keys.access, token);
  }

  // --- Refresh Token ---

  getRefreshToken() {
    if (this.storageType === 'memory') return this._memory.refresh;
    return this._getFromStorage(this.keys.refresh);
  }

  setRefreshToken(token) {
    if (this.storageType === 'memory') {
      this._memory.refresh = token;
      return;
    }
    this._setInStorage(this.keys.refresh, token);
  }

  // --- User ---

  getUser() {
    if (this.storageType === 'memory') return this._memory.user;
    const raw = this._getFromStorage(this.keys.user);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      console.warn('Failed to parse stored user data');
      return null;
    }
  }

  setUser(user) {
    if (this.storageType === 'memory') {
      this._memory.user = user;
      return;
    }
    this._setInStorage(this.keys.user, user ? JSON.stringify(user) : null);
  }

  // --- Tenant ---

  getTenantId() {
    if (this.storageType === 'memory') return this._memory.tenant;
    return this._getFromStorage(this.keys.tenant);
  }

  setTenantId(tenantId) {
    if (this.storageType === 'memory') {
      this._memory.tenant = tenantId;
      return;
    }
    this._setInStorage(this.keys.tenant, tenantId);
  }

  // --- Clear ---

  clearAll() {
    if (this.storageType === 'memory') {
      this._memory = { access: null, refresh: null, user: null, tenant: null };
      return;
    }
    for (const key of Object.values(this.keys)) {
      try {
        localStorage.removeItem(key);
        sessionStorage.removeItem(key);
      } catch { /* ignore */ }
    }
  }

  // --- Internal Helpers ---

  /** @private */
  _getFromStorage(key) {
    try {
      const primary = this.storageType === 'localStorage' ? localStorage : sessionStorage;
      const fallback = this.storageType === 'localStorage' ? sessionStorage : localStorage;
      return primary.getItem(key) || fallback.getItem(key) || null;
    } catch (e) {
      console.warn('Failed to access storage:', e);
      return null;
    }
  }

  /** @private */
  _setInStorage(key, value) {
    try {
      const primary = this.storageType === 'localStorage' ? localStorage : sessionStorage;
      const other = this.storageType === 'localStorage' ? sessionStorage : localStorage;
      if (value != null) {
        primary.setItem(key, value);
        other.removeItem(key);
      } else {
        primary.removeItem(key);
        other.removeItem(key);
      }
    } catch (e) {
      console.error('Failed to write to storage:', e);
    }
  }
}
```

**Step 4: Run tests**

```bash
npx vitest run tests/unit/auth/TokenManager.test.js
```
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/auth/TokenManager.js tests/unit/auth/
git commit -m "feat: add TokenManager with localStorage/sessionStorage/memory support"
```

---

## Task 3: RefreshManager

**Files:**
- Create: `src/auth/RefreshManager.js`
- Create: `tests/unit/auth/RefreshManager.test.js`

Token refresh with single-flight pattern. Pattern from web `api.js` lines 67-101 (see BLUEPRINT.md).

**Step 1: Write failing tests**

Create `tests/unit/auth/RefreshManager.test.js`:

```javascript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RefreshManager } from '../../../src/auth/RefreshManager.js';
import { TokenManager } from '../../../src/auth/TokenManager.js';

describe('RefreshManager', () => {
  let tokenManager;
  let onTokenRefreshed;
  let onRefreshFailed;

  beforeEach(() => {
    tokenManager = new TokenManager({ storage: 'memory' });
    onTokenRefreshed = vi.fn();
    onRefreshFailed = vi.fn();
    vi.restoreAllMocks();
  });

  function createManager(overrides = {}) {
    return new RefreshManager({
      apiBaseUrl: 'http://localhost:9001',
      refreshEndpoint: '/auth/refresh',
      tokenManager,
      onTokenRefreshed,
      onRefreshFailed,
      ...overrides
    });
  }

  it('should call refresh endpoint and update tokens on success', async () => {
    tokenManager.setRefreshToken('old-refresh');

    const mockResponse = {
      ok: true,
      json: () => Promise.resolve({ access_token: 'new-access', refresh_token: 'new-refresh' })
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

    const rm = createManager();
    const result = await rm.refresh();

    expect(result).toBe('new-access');
    expect(tokenManager.getAccessToken()).toBe('new-access');
    expect(tokenManager.getRefreshToken()).toBe('new-refresh');
    expect(onTokenRefreshed).toHaveBeenCalledWith('new-access');
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:9001/auth/refresh',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ refresh_token: 'old-refresh' })
      })
    );
  });

  it('should call onRefreshFailed when no refresh token exists', async () => {
    const rm = createManager();

    await expect(rm.refresh()).rejects.toThrow('No refresh token');
    expect(onRefreshFailed).toHaveBeenCalled();
  });

  it('should call onRefreshFailed when refresh endpoint returns non-ok', async () => {
    tokenManager.setRefreshToken('expired-refresh');

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 401 });

    const rm = createManager();

    await expect(rm.refresh()).rejects.toThrow('Refresh failed: 401');
    expect(onRefreshFailed).toHaveBeenCalled();
  });

  it('should deduplicate concurrent refresh calls (single-flight)', async () => {
    tokenManager.setRefreshToken('ref-tok');

    let resolveRefresh;
    const fetchPromise = new Promise(r => { resolveRefresh = r; });
    vi.spyOn(globalThis, 'fetch').mockReturnValue(fetchPromise);

    const rm = createManager();

    // Launch 3 concurrent refreshes
    const p1 = rm.refresh();
    const p2 = rm.refresh();
    const p3 = rm.refresh();

    // Only one fetch call
    expect(fetch).toHaveBeenCalledTimes(1);

    // Resolve the single fetch
    resolveRefresh({
      ok: true,
      json: () => Promise.resolve({ access_token: 'shared-token' })
    });

    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
    expect(r1).toBe('shared-token');
    expect(r2).toBe('shared-token');
    expect(r3).toBe('shared-token');
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/unit/auth/RefreshManager.test.js
```
Expected: FAIL — module not found

**Step 3: Write implementation**

Create `src/auth/RefreshManager.js`:

```javascript
/**
 * Handles token refresh with single-flight deduplication.
 * Both custom and SSO modes use the same refresh logic — only login differs.
 * SSO apps configure apiBaseUrl to main service (port 9001) for refresh.
 */
export class RefreshManager {
  /** @type {Promise<string>|null} */
  #refreshPromise = null;

  /**
   * @param {Object} options
   * @param {string} options.apiBaseUrl - Base URL for refresh endpoint
   * @param {string} options.refreshEndpoint - Refresh endpoint path
   * @param {import('./TokenManager.js').TokenManager} options.tokenManager
   * @param {function(string): void} options.onTokenRefreshed - Called with new access token
   * @param {function(): void} options.onRefreshFailed - Called when refresh fails
   */
  constructor({ apiBaseUrl, refreshEndpoint, tokenManager, onTokenRefreshed, onRefreshFailed }) {
    this.apiBaseUrl = apiBaseUrl;
    this.refreshEndpoint = refreshEndpoint;
    this.tokenManager = tokenManager;
    this.onTokenRefreshed = onTokenRefreshed;
    this.onRefreshFailed = onRefreshFailed;
  }

  /**
   * Refresh the access token. Concurrent calls return the same promise.
   * @returns {Promise<string>} The new access token
   */
  async refresh() {
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

  /** @private */
  async #doRefresh() {
    const refreshToken = this.tokenManager.getRefreshToken();
    if (!refreshToken) {
      this.onRefreshFailed();
      throw new Error('No refresh token');
    }

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

**Step 4: Run tests**

```bash
npx vitest run tests/unit/auth/RefreshManager.test.js
```
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/auth/RefreshManager.js tests/unit/auth/RefreshManager.test.js
git commit -m "feat: add RefreshManager with single-flight deduplication"
```

---

## Task 4: SSOManager

**Files:**
- Create: `src/auth/SSOManager.js`
- Create: `tests/unit/auth/SSOManager.test.js`

SSO redirect helpers. Pattern from studio `AuthService.js` lines 292-308.

**Step 1: Write failing tests**

Create `tests/unit/auth/SSOManager.test.js`:

```javascript
import { describe, it, expect, beforeEach } from 'vitest';
import { SSOManager } from '../../../src/auth/SSOManager.js';
import { TokenManager } from '../../../src/auth/TokenManager.js';

describe('SSOManager', () => {
  let tokenManager;

  beforeEach(() => {
    tokenManager = new TokenManager({ storage: 'memory' });
    sessionStorage.clear();
  });

  function createManager(overrides = {}) {
    return new SSOManager({
      webAppUrl: 'http://localhost:5173',
      allowedHosts: ['studio.smartmemory.ai', 'insights.smartmemory.ai'],
      tokenManager,
      ...overrides
    });
  }

  describe('getLoginUrl', () => {
    it('should generate login URL with redirect param', () => {
      const sso = createManager();
      const url = sso.getLoginUrl('http://localhost:9002/auth/callback');

      expect(url).toBe(
        'http://localhost:5173/login?redirect=http%3A%2F%2Flocalhost%3A9002%2Fauth%2Fcallback'
      );
    });

    it('should use window.location.origin as default redirect', () => {
      const sso = createManager();
      const url = sso.getLoginUrl();

      expect(url).toContain('http://localhost:5173/login?redirect=');
      expect(url).toContain('%2Fauth%2Fcallback');
    });
  });

  describe('isValidRedirectUrl', () => {
    it('should accept URLs with allowed hostnames', () => {
      const sso = createManager();
      expect(sso.isValidRedirectUrl('https://studio.smartmemory.ai/dashboard')).toBe(true);
      expect(sso.isValidRedirectUrl('https://insights.smartmemory.ai/')).toBe(true);
    });

    it('should reject URLs with disallowed hostnames', () => {
      const sso = createManager();
      expect(sso.isValidRedirectUrl('https://evil.com/phish')).toBe(false);
    });

    it('should reject invalid URLs', () => {
      const sso = createManager();
      expect(sso.isValidRedirectUrl('not-a-url')).toBe(false);
    });

    it('should allow all when allowedHosts is empty', () => {
      const sso = createManager({ allowedHosts: [] });
      expect(sso.isValidRedirectUrl('https://anything.com')).toBe(true);
    });
  });

  describe('storeCallbackTokens', () => {
    it('should store token, refresh, and tenant from URL params', () => {
      const sso = createManager();
      const params = new URLSearchParams({
        token: 'access-tok',
        refresh_token: 'refresh-tok',
        team_id: 'team-123'
      });

      sso.storeCallbackTokens(params);

      expect(tokenManager.getAccessToken()).toBe('access-tok');
      expect(tokenManager.getRefreshToken()).toBe('refresh-tok');
      expect(tokenManager.getTenantId()).toBe('team-123');
    });

    it('should handle missing optional params', () => {
      const sso = createManager();
      const params = new URLSearchParams({ token: 'only-access' });

      sso.storeCallbackTokens(params);

      expect(tokenManager.getAccessToken()).toBe('only-access');
      expect(tokenManager.getRefreshToken()).toBeNull();
      expect(tokenManager.getTenantId()).toBeNull();
    });
  });

  describe('redirect storage', () => {
    it('should store and retrieve redirect URL from sessionStorage', () => {
      const sso = createManager();
      sso.storeRedirect('/dashboard');

      expect(sso.getAndClearRedirect()).toBe('/dashboard');
      expect(sso.getAndClearRedirect()).toBeNull();
    });
  });
});
```

**Step 2: Run tests — expect FAIL**

```bash
npx vitest run tests/unit/auth/SSOManager.test.js
```

**Step 3: Write implementation**

Create `src/auth/SSOManager.js`:

```javascript
const REDIRECT_KEY = 'smart_memory_sso_redirect';

/**
 * Manages SSO redirect flow for studio/insights apps.
 * Pattern from studio AuthService.js lines 292-308.
 */
export class SSOManager {
  /**
   * @param {Object} options
   * @param {string} options.webAppUrl - Web app URL for login redirect
   * @param {string[]} [options.allowedHosts=[]] - Allowed redirect hostnames
   * @param {import('./TokenManager.js').TokenManager} options.tokenManager
   */
  constructor({ webAppUrl, allowedHosts = [], tokenManager }) {
    this.webAppUrl = webAppUrl;
    this.allowedHosts = allowedHosts;
    this.tokenManager = tokenManager;
  }

  /**
   * Get login URL for SSO redirect.
   * @param {string} [redirectUrl] - URL to redirect back to after login
   * @returns {string} Full login URL with redirect param
   */
  getLoginUrl(redirectUrl) {
    const callbackUrl = redirectUrl || `${window.location.origin}/auth/callback`;
    return `${this.webAppUrl}/login?redirect=${encodeURIComponent(callbackUrl)}`;
  }

  /**
   * Validate a redirect URL against the allowlist.
   * @param {string} url - URL to validate
   * @returns {boolean} Whether URL is allowed
   */
  isValidRedirectUrl(url) {
    if (!this.allowedHosts.length) return true;
    try {
      const parsed = new URL(url);
      return this.allowedHosts.includes(parsed.hostname);
    } catch {
      return false;
    }
  }

  /**
   * Store tokens received from SSO callback URL params.
   * @param {URLSearchParams} params - URL search params from callback
   */
  storeCallbackTokens(params) {
    const token = params.get('token');
    const refreshToken = params.get('refresh_token');
    const teamId = params.get('team_id');

    if (token) this.tokenManager.setAccessToken(token);
    if (refreshToken) this.tokenManager.setRefreshToken(refreshToken);
    if (teamId) this.tokenManager.setTenantId(teamId);
  }

  /**
   * Store the current URL before redirecting to login.
   * @param {string} url - URL to return to after login
   */
  storeRedirect(url) {
    try {
      sessionStorage.setItem(REDIRECT_KEY, url);
    } catch (e) {
      console.warn('Failed to store redirect URL:', e);
    }
  }

  /**
   * Get and clear the stored redirect URL.
   * @returns {string|null} The stored redirect URL, or null
   */
  getAndClearRedirect() {
    try {
      const url = sessionStorage.getItem(REDIRECT_KEY);
      sessionStorage.removeItem(REDIRECT_KEY);
      return url;
    } catch {
      return null;
    }
  }
}
```

**Step 4: Run tests**

```bash
npx vitest run tests/unit/auth/SSOManager.test.js
```
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/auth/SSOManager.js tests/unit/auth/SSOManager.test.js
git commit -m "feat: add SSOManager for redirect-based authentication"
```

---

## Task 5: AuthCore

**Files:**
- Create: `src/auth/AuthCore.js`
- Create: `tests/unit/auth/AuthCore.test.js`

The main auth orchestrator. Delegates to TokenManager, RefreshManager, SSOManager. Pattern from studio `AuthService.js`.

**Step 1: Write failing tests**

Create `tests/unit/auth/AuthCore.test.js`:

```javascript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthCore } from '../../../src/auth/AuthCore.js';

describe('AuthCore', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  function createCustomAuth(overrides = {}) {
    return new AuthCore({
      mode: 'custom',
      apiBaseUrl: 'http://localhost:9001',
      endpoints: { login: '/auth/login', refresh: '/auth/refresh' },
      storage: 'memory',
      ...overrides
    });
  }

  function createSSOAuth(overrides = {}) {
    return new AuthCore({
      mode: 'sso',
      apiBaseUrl: 'http://localhost:9001',
      webAppUrl: 'http://localhost:5173',
      endpoints: { refresh: '/auth/refresh' },
      storage: 'memory',
      ...overrides
    });
  }

  describe('initialization', () => {
    it('should start unauthenticated with no stored tokens', () => {
      const auth = createCustomAuth();
      expect(auth.isAuthenticated()).toBe(false);
      expect(auth.getCurrentUser()).toBeNull();
      expect(auth.getCurrentToken()).toBeNull();
    });
  });

  describe('listener system', () => {
    it('should notify listeners on state change', () => {
      const auth = createCustomAuth();
      const listener = vi.fn();

      auth.addListener(listener);
      auth.setTenantId('workspace-1');

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: 'workspace-1' })
      );
    });

    it('should return unsubscribe function', () => {
      const auth = createCustomAuth();
      const listener = vi.fn();

      const unsubscribe = auth.addListener(listener);
      unsubscribe();
      auth.setTenantId('workspace-1');

      expect(listener).not.toHaveBeenCalled();
    });

    it('should catch errors in listeners without crashing', () => {
      const auth = createCustomAuth();
      const badListener = () => { throw new Error('listener crash'); };
      const goodListener = vi.fn();

      auth.addListener(badListener);
      auth.addListener(goodListener);
      auth.setTenantId('t1');

      expect(goodListener).toHaveBeenCalled();
    });
  });

  describe('getAuthHeaders', () => {
    it('should return empty object when not authenticated', () => {
      const auth = createCustomAuth();
      const headers = auth.getAuthHeaders();

      expect(headers.Authorization).toBeUndefined();
    });

    it('should add Bearer prefix to raw token', () => {
      const auth = createCustomAuth();
      auth.tokenManager.setAccessToken('raw-token');
      auth.currentToken = 'raw-token';

      const headers = auth.getAuthHeaders();
      expect(headers.Authorization).toBe('Bearer raw-token');
    });

    it('should not double-prefix Bearer tokens', () => {
      const auth = createCustomAuth();
      auth.tokenManager.setAccessToken('Bearer already-bearer');
      auth.currentToken = 'Bearer already-bearer';

      const headers = auth.getAuthHeaders();
      expect(headers.Authorization).toBe('Bearer already-bearer');
    });

    it('should include tenant header when set', () => {
      const auth = createCustomAuth();
      auth.setTenantId('ws-123');

      const headers = auth.getAuthHeaders();
      expect(headers['X-Workspace-Id']).toBe('ws-123');
    });

    it('should merge extra headers', () => {
      const auth = createCustomAuth();
      const headers = auth.getAuthHeaders({ 'X-Custom': 'value' });
      expect(headers['X-Custom']).toBe('value');
    });
  });

  describe('custom mode: login', () => {
    it('should login and store tokens from API response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          tokens: { access_token: 'at', refresh_token: 'rt' },
          user: { id: '1', name: 'Alice', roles: ['user'] }
        })
      });

      const auth = createCustomAuth();
      const result = await auth.login({ email: 'a@b.com', password: 'pass' });

      expect(auth.isAuthenticated()).toBe(true);
      expect(result.user.name).toBe('Alice');
      expect(auth.getCurrentToken()).toBe('at');
    });

    it('should throw on failed login', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 401 });

      const auth = createCustomAuth();
      await expect(auth.login({ email: 'a@b.com', password: 'wrong' }))
        .rejects.toThrow('Login failed');
    });

    it('should throw if called in sso mode', async () => {
      const auth = createSSOAuth();
      await expect(auth.login({ email: 'a', password: 'b' }))
        .rejects.toThrow('login() only available in custom mode');
    });
  });

  describe('sso mode', () => {
    it('should generate login URL', () => {
      const auth = createSSOAuth();
      const url = auth.getLoginUrl('http://localhost:9002/auth/callback');

      expect(url).toContain('http://localhost:5173/login?redirect=');
    });

    it('should throw getLoginUrl in custom mode', () => {
      const auth = createCustomAuth();
      expect(() => auth.getLoginUrl('http://example.com'))
        .toThrow('getLoginUrl() only available in sso mode');
    });

    it('should store callback tokens and update state', () => {
      const auth = createSSOAuth();
      const listener = vi.fn();
      auth.addListener(listener);

      const params = new URLSearchParams({
        token: 'sso-tok',
        refresh_token: 'sso-ref',
        team_id: 'team-1'
      });
      auth.storeCallbackTokens(params);

      expect(auth.isAuthenticated()).toBe(true);
      expect(auth.getCurrentToken()).toBe('sso-tok');
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ isAuthenticated: true, token: 'sso-tok' })
      );
    });
  });

  describe('logout', () => {
    it('should clear all tokens and notify listeners', async () => {
      const auth = createCustomAuth();
      auth.tokenManager.setAccessToken('tok');
      auth.currentToken = 'tok';

      const listener = vi.fn();
      auth.addListener(listener);

      await auth.logout();

      expect(auth.isAuthenticated()).toBe(false);
      expect(auth.getCurrentToken()).toBeNull();
      expect(auth.getCurrentUser()).toBeNull();
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ isAuthenticated: false })
      );
    });
  });

  describe('hasRole', () => {
    it('should return true when user has role', () => {
      const auth = createCustomAuth();
      auth.currentUser = { roles: ['admin', 'user'] };
      expect(auth.hasRole('admin')).toBe(true);
    });

    it('should return false when user lacks role', () => {
      const auth = createCustomAuth();
      auth.currentUser = { roles: ['user'] };
      expect(auth.hasRole('admin')).toBe(false);
    });

    it('should return false when no user', () => {
      const auth = createCustomAuth();
      expect(auth.hasRole('admin')).toBe(false);
    });
  });
});
```

**Step 2: Run tests — expect FAIL**

```bash
npx vitest run tests/unit/auth/AuthCore.test.js
```

**Step 3: Write implementation**

Create `src/auth/AuthCore.js`:

```javascript
import { TokenManager } from './TokenManager.js';
import { RefreshManager } from './RefreshManager.js';
import { SSOManager } from './SSOManager.js';

/**
 * Unified auth API for both custom and SSO modes.
 * Pattern from studio AuthService.js.
 *
 * @param {import('../types/auth.js').AuthConfig} config
 */
export class AuthCore {
  constructor(config) {
    this.mode = config.mode;
    this.apiBaseUrl = config.apiBaseUrl;
    this.endpoints = config.endpoints || {};
    /** @type {Set<function>} */
    this.listeners = new Set();

    this.tokenManager = new TokenManager({
      storage: config.storage || 'localStorage',
      keys: config.tokenKeys
    });

    this.refreshManager = new RefreshManager({
      apiBaseUrl: this.apiBaseUrl,
      refreshEndpoint: this.endpoints.refresh || '/auth/refresh',
      tokenManager: this.tokenManager,
      onTokenRefreshed: (token) => {
        this.currentToken = token;
        this.notifyListeners();
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

    this.currentUser = this.tokenManager.getUser();
    this.currentToken = this.tokenManager.getAccessToken();
  }

  // --- State ---

  isAuthenticated() {
    return !!this.currentToken;
  }

  getCurrentUser() {
    return this.currentUser;
  }

  getCurrentToken() {
    return this.currentToken;
  }

  getTenantId() {
    return this.tokenManager.getTenantId();
  }

  hasRole(role) {
    return this.currentUser?.roles?.includes(role) || false;
  }

  // --- Headers ---

  getAuthHeaders(extraHeaders = {}) {
    const headers = { ...extraHeaders };

    if (this.currentToken) {
      headers['Authorization'] = this.currentToken.startsWith('Bearer ')
        ? this.currentToken
        : `Bearer ${this.currentToken}`;
    }

    const tenantId = this.tokenManager.getTenantId();
    if (tenantId) {
      headers['X-Workspace-Id'] = tenantId;
    }

    return headers;
  }

  // --- Listener System ---

  addListener(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notifyListeners() {
    const state = {
      isAuthenticated: this.isAuthenticated(),
      user: this.currentUser,
      token: this.currentToken,
      tenantId: this.tokenManager.getTenantId()
    };

    this.listeners.forEach(listener => {
      try {
        listener(state);
      } catch (e) {
        console.error('Auth listener error:', e);
      }
    });
  }

  // --- Custom Mode: Login ---

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

    const accessToken = data.tokens?.access_token || data.access_token;
    const refreshToken = data.tokens?.refresh_token || data.refresh_token;

    this.tokenManager.setAccessToken(accessToken);
    if (refreshToken) {
      this.tokenManager.setRefreshToken(refreshToken);
    }

    const user = data.user;
    this.tokenManager.setUser(user);
    this.currentUser = user;
    this.currentToken = accessToken;

    if (user?.default_team_id || data.team_id) {
      this.tokenManager.setTenantId(user?.default_team_id || data.team_id);
    }

    this.notifyListeners();
    return { token: this.currentToken, user };
  }

  // --- SSO Mode ---

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

  // --- Both Modes ---

  async logout() {
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
    const token = await this.refreshManager.refresh();
    this.currentToken = token;
    return token;
  }

  setTenantId(tenantId) {
    this.tokenManager.setTenantId(tenantId);
    this.notifyListeners();
  }
}
```

**Step 4: Run tests**

```bash
npx vitest run tests/unit/auth/AuthCore.test.js
```
Expected: All tests PASS

**Step 5: Run all auth tests together**

```bash
npx vitest run tests/unit/auth/
```
Expected: All PASS

**Step 6: Commit**

```bash
git add src/auth/AuthCore.js tests/unit/auth/AuthCore.test.js
git commit -m "feat: add AuthCore with custom and SSO mode support"
```

---

## Task 6: BaseAPI + APIError Integration

**Files:**
- Create: `src/api/BaseAPI.js`
- Create: `tests/unit/api/BaseAPI.test.js`

Shared request logic with 401 refresh+retry. Pattern from web `api.js` lines 39-143.

**Step 1: Write failing tests**

Create `tests/unit/api/BaseAPI.test.js`:

```javascript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BaseAPI } from '../../../src/api/BaseAPI.js';
import { AuthCore } from '../../../src/auth/AuthCore.js';
import { APIError } from '../../../src/errors/APIError.js';

describe('BaseAPI', () => {
  let authCore;
  let baseAPI;

  beforeEach(() => {
    vi.restoreAllMocks();
    authCore = new AuthCore({
      mode: 'custom',
      apiBaseUrl: 'http://localhost:9001',
      endpoints: { login: '/auth/login', refresh: '/auth/refresh' },
      storage: 'memory'
    });
    baseAPI = new BaseAPI(authCore);
  });

  describe('request', () => {
    it('should make GET request with auth headers', async () => {
      authCore.currentToken = 'test-token';
      authCore.setTenantId('ws-1');

      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: 'result' })
      });

      const result = await baseAPI.get('/memory/list');

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:9001/memory/list',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-token',
            'X-Workspace-Id': 'ws-1',
            'Content-Type': 'application/json'
          })
        })
      );
      expect(result).toEqual({ data: 'result' });
    });

    it('should make POST request with JSON body', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ id: '1' })
      });

      const result = await baseAPI.post('/memory/add', { content: 'test' });

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:9001/memory/add',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ content: 'test' })
        })
      );
      expect(result).toEqual({ id: '1' });
    });

    it('should return null for 204 No Content', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 204
      });

      const result = await baseAPI.delete('/memory/123');
      expect(result).toBeNull();
    });

    it('should throw APIError for non-ok responses', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 404,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve({ detail: 'Not found' })
      });

      await expect(baseAPI.get('/memory/missing'))
        .rejects.toThrow(APIError);
    });
  });

  describe('401 refresh+retry', () => {
    it('should refresh token and retry on 401', async () => {
      authCore.currentToken = 'expired-token';
      authCore.tokenManager.setRefreshToken('valid-refresh');

      const calls = [];
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, opts) => {
        calls.push({ url, opts });

        // First call to /memory/list: 401
        if (url.includes('/memory/list') && !opts.__isRetry) {
          return { ok: false, status: 401 };
        }
        // Refresh call: success
        if (url.includes('/auth/refresh')) {
          return {
            ok: true,
            json: () => Promise.resolve({ access_token: 'fresh-token' })
          };
        }
        // Retry call to /memory/list: success
        return {
          ok: true,
          status: 200,
          json: () => Promise.resolve({ items: [] })
        };
      });

      const result = await baseAPI.get('/memory/list');

      expect(result).toEqual({ items: [] });
      expect(calls).toHaveLength(3); // original + refresh + retry
    });

    it('should logout and throw on failed refresh', async () => {
      authCore.currentToken = 'expired';

      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 401
      });

      const logoutSpy = vi.spyOn(authCore, 'logout').mockResolvedValue();

      await expect(baseAPI.get('/memory/list'))
        .rejects.toThrow('Authentication required');
      expect(logoutSpy).toHaveBeenCalled();
    });
  });

  describe('network errors', () => {
    it('should wrap fetch errors in APIError', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));

      try {
        await baseAPI.get('/memory/list');
      } catch (e) {
        expect(e).toBeInstanceOf(APIError);
        expect(e.status).toBe(0);
      }
    });
  });
});
```

**Step 2: Run tests — expect FAIL**

```bash
npx vitest run tests/unit/api/BaseAPI.test.js
```

**Step 3: Write implementation**

Create `src/api/BaseAPI.js`:

```javascript
import { APIError } from '../errors/APIError.js';

/**
 * Shared request logic with automatic auth headers and 401 refresh+retry.
 * Pattern from web api.js lines 39-143.
 */
export class BaseAPI {
  /**
   * @param {import('../auth/AuthCore.js').AuthCore} authCore
   */
  constructor(authCore) {
    this.auth = authCore;
    this.baseURL = authCore.apiBaseUrl;
  }

  /**
   * Make an authenticated API request.
   * On 401, attempts token refresh and retries once.
   */
  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...this.auth.getAuthHeaders(options.headers)
    };

    const config = { ...options, headers };

    try {
      let response = await fetch(url, config);

      // 401 with refresh+retry (once)
      if (response.status === 401 && !options.__isRetry) {
        try {
          await this.auth.refreshToken();

          const retryHeaders = {
            'Content-Type': 'application/json',
            ...this.auth.getAuthHeaders(options.headers)
          };
          response = await fetch(url, { ...config, headers: retryHeaders, __isRetry: true });
        } catch {
          // Refresh failed — fall through to 401 handling below
        }
      }

      if (response.status === 401) {
        await this.auth.logout();
        throw new APIError('Authentication required', 401, 'auth_expired');
      }

      if (response.status === 204) {
        return null;
      }

      if (!response.ok) {
        throw await this._handleError(response);
      }

      return await response.json();
    } catch (error) {
      if (error instanceof APIError) throw error;
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

  /** @private */
  async _handleError(response) {
    let errorData;
    const contentType = response.headers?.get?.('content-type');

    try {
      if (contentType?.includes('application/json')) {
        errorData = await response.json();
      } else {
        errorData = { message: await response.text() };
      }
    } catch {
      errorData = { message: `HTTP ${response.status}` };
    }

    return new APIError(
      errorData.detail || errorData.message || `HTTP ${response.status}`,
      response.status,
      errorData
    );
  }
}
```

**Step 4: Run tests**

```bash
npx vitest run tests/unit/api/BaseAPI.test.js
```
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/api/BaseAPI.js tests/unit/api/BaseAPI.test.js
git commit -m "feat: add BaseAPI with 401 refresh-retry and error handling"
```

---

## Task 7: Domain API Modules

**Files:**
- Create: `src/api/MemoryAPI.js`
- Create: `src/api/DecisionAPI.js`
- Create: `src/api/GraphAPI.js`
- Create: `src/api/TeamAPI.js`
- Create: `src/api/ProfileAPI.js`
- Create: `src/api/SubscriptionAPI.js`
- Create: `tests/unit/api/MemoryAPI.test.js`

All 80+ endpoints from `smart-memory-web/src/lib/api.js`. Each module is thin — delegates to BaseAPI.

**Step 1: Write MemoryAPI tests (most complex module)**

Create `tests/unit/api/MemoryAPI.test.js`:

```javascript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MemoryAPI } from '../../../src/api/MemoryAPI.js';

describe('MemoryAPI', () => {
  let baseAPI;
  let memoryAPI;

  beforeEach(() => {
    baseAPI = {
      get: vi.fn().mockResolvedValue({}),
      post: vi.fn().mockResolvedValue({}),
      put: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue(null)
    };
    memoryAPI = new MemoryAPI(baseAPI);
  });

  it('create should POST to /memory/add with snake_case params', async () => {
    await memoryAPI.create({ content: 'test', memoryType: 'semantic' });

    expect(baseAPI.post).toHaveBeenCalledWith('/memory/add', {
      content: 'test',
      memory_type: 'semantic',
      metadata: null,
      use_pipeline: true,
      profile_name: null
    });
  });

  it('get should normalize item_id to id', async () => {
    baseAPI.get.mockResolvedValue({ item_id: 'abc', content: 'hello' });

    const result = await memoryAPI.get('abc');

    expect(baseAPI.get).toHaveBeenCalledWith('/memory/abc');
    expect(result.id).toBe('abc');
  });

  it('list should build query string with params', async () => {
    await memoryAPI.list({ limit: 10, offset: 5, type: 'semantic' });

    const call = baseAPI.get.mock.calls[0][0];
    expect(call).toContain('/memory/list?');
    expect(call).toContain('limit=10');
    expect(call).toContain('offset=5');
    expect(call).toContain('memory_type=semantic');
  });

  it('list should use defaults when no params provided', async () => {
    await memoryAPI.list();

    const call = baseAPI.get.mock.calls[0][0];
    expect(call).toContain('limit=50');
    expect(call).toContain('offset=0');
  });

  it('update should only include defined fields', async () => {
    await memoryAPI.update('id-1', { content: 'updated' });

    expect(baseAPI.put).toHaveBeenCalledWith('/memory/id-1', { content: 'updated' });
  });

  it('delete should call DELETE /memory/:id', async () => {
    await memoryAPI.delete('id-1');
    expect(baseAPI.delete).toHaveBeenCalledWith('/memory/id-1');
  });

  it('search should POST with snake_case params', async () => {
    await memoryAPI.search('find this', { topK: 10, memoryType: 'working' });

    expect(baseAPI.post).toHaveBeenCalledWith('/memory/search', {
      query: 'find this',
      top_k: 10,
      enable_hybrid: true,
      memory_type: 'working'
    });
  });

  it('ingest should POST to /memory/ingest', async () => {
    await memoryAPI.ingest('raw content', { extractorName: 'llm' });

    expect(baseAPI.post).toHaveBeenCalledWith('/memory/ingest', {
      content: 'raw content',
      profile_name: null,
      extractor_name: 'llm',
      context: {}
    });
  });

  it('searchAdvanced should POST with algorithm params', async () => {
    await memoryAPI.searchAdvanced('query', { algorithm: 'query_traversal', maxResults: 20 });

    expect(baseAPI.post).toHaveBeenCalledWith('/memory/search/advanced', {
      query: 'query',
      algorithm: 'query_traversal',
      max_results: 20,
      use_ssg: true
    });
  });

  it('getSummary should GET /memory/summary', async () => {
    await memoryAPI.getSummary();
    expect(baseAPI.get).toHaveBeenCalledWith('/memory/summary');
  });
});
```

**Step 2: Run tests — expect FAIL**

```bash
npx vitest run tests/unit/api/MemoryAPI.test.js
```

**Step 3: Write all domain API modules**

The plan includes exact code for every module. Read `smart-memory-web/src/lib/api.js` for the exact endpoints during implementation. Each module follows the same pattern:

Create `src/api/MemoryAPI.js` — all memory, search, ingest, temporal, clustering, enrichment endpoints.
Create `src/api/DecisionAPI.js` — list, get, pending, proofTree, fuzzyConfidence.
Create `src/api/GraphAPI.js` — neighbors, addEdge, graphHealth, inferenceRules, runInference.
Create `src/api/TeamAPI.js` — list, create, get, update, delete, members CRUD.
Create `src/api/ProfileAPI.js` — listProfiles, getProfile, getLLMKeys, updateLLMKeys.
Create `src/api/SubscriptionAPI.js` — current, upgrade, cancel, portalSession, checkoutSession.

Also add: `src/api/AuthAPI.js` — signup, getCurrentUser, passwordReset (auth endpoints that go through API client).
Also add: `src/api/AgentAPI.js` — listAgents, createAgent, getAgent, deleteAgent.
Also add: `src/api/UsageAPI.js` — dashboard, current, tiers.
Also add: `src/api/InsightsAPI.js` — health, reflect, maintenance, plugins.

**Endpoint reference:** Read web `api.js` lines 150-886 for exact method signatures and URL patterns. The SDK should use **camelCase method names** with **snake_case API params** (same pattern as existing web client).

**Step 4: Run tests for each module**

```bash
npx vitest run tests/unit/api/
```

**Step 5: Commit**

```bash
git add src/api/ tests/unit/api/
git commit -m "feat: add domain API modules covering all 80+ endpoints"
```

---

## Task 8: SmartMemoryClient

**Files:**
- Create: `src/api/SmartMemoryClient.js`
- Create: `tests/unit/api/SmartMemoryClient.test.js`

Main entry point aggregating auth + all domain APIs.

**Step 1: Write failing test**

Create `tests/unit/api/SmartMemoryClient.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import { SmartMemoryClient } from '../../../src/api/SmartMemoryClient.js';

describe('SmartMemoryClient', () => {
  it('should expose auth and all domain APIs', () => {
    const client = new SmartMemoryClient({
      mode: 'custom',
      apiBaseUrl: 'http://localhost:9001',
      endpoints: { login: '/auth/login', refresh: '/auth/refresh' },
      storage: 'memory'
    });

    expect(client.auth).toBeDefined();
    expect(client.auth.isAuthenticated()).toBe(false);
    expect(client.memories).toBeDefined();
    expect(client.decisions).toBeDefined();
    expect(client.graph).toBeDefined();
    expect(client.teams).toBeDefined();
    expect(client.profiles).toBeDefined();
    expect(client.subscriptions).toBeDefined();
  });

  it('should work in SSO mode', () => {
    const client = new SmartMemoryClient({
      mode: 'sso',
      apiBaseUrl: 'http://localhost:9001',
      webAppUrl: 'http://localhost:5173',
      endpoints: { refresh: '/auth/refresh' },
      storage: 'memory'
    });

    expect(client.auth.mode).toBe('sso');
    const url = client.auth.getLoginUrl('http://localhost:9002/auth/callback');
    expect(url).toContain('localhost:5173/login');
  });
});
```

**Step 2: Run — expect FAIL**

**Step 3: Write implementation**

Create `src/api/SmartMemoryClient.js`:

```javascript
import { AuthCore } from '../auth/AuthCore.js';
import { BaseAPI } from './BaseAPI.js';
import { MemoryAPI } from './MemoryAPI.js';
import { DecisionAPI } from './DecisionAPI.js';
import { GraphAPI } from './GraphAPI.js';
import { TeamAPI } from './TeamAPI.js';
import { ProfileAPI } from './ProfileAPI.js';
import { SubscriptionAPI } from './SubscriptionAPI.js';

/**
 * Main entry point for SmartMemory SDK.
 * Aggregates auth + all domain APIs.
 *
 * @example
 * const client = new SmartMemoryClient({
 *   mode: 'sso',
 *   apiBaseUrl: 'http://localhost:9001',
 *   webAppUrl: 'http://localhost:5173'
 * });
 *
 * const memories = await client.memories.list();
 * await client.auth.logout();
 */
export class SmartMemoryClient {
  constructor(config) {
    this.auth = new AuthCore(config);
    const baseAPI = new BaseAPI(this.auth);

    this.memories = new MemoryAPI(baseAPI);
    this.decisions = new DecisionAPI(baseAPI);
    this.graph = new GraphAPI(baseAPI);
    this.teams = new TeamAPI(baseAPI);
    this.profiles = new ProfileAPI(baseAPI);
    this.subscriptions = new SubscriptionAPI(baseAPI);
  }
}
```

**Step 4: Run tests**

```bash
npx vitest run tests/unit/api/SmartMemoryClient.test.js
```

**Step 5: Commit**

```bash
git add src/api/SmartMemoryClient.js tests/unit/api/SmartMemoryClient.test.js
git commit -m "feat: add SmartMemoryClient as unified entry point"
```

---

## Task 9: React Bindings

**Files:**
- Create: `src/react/SmartMemoryProvider.jsx`
- Create: `src/react/useAuth.js`
- Create: `src/react/useAuthState.js`
- Create: `src/react/useAuthActions.js`
- Create: `src/react/useSmartMemory.js`
- Create: `src/react/AuthWrapper.jsx`
- Create: `src/react/index.js`
- Create: `tests/react/useAuth.test.jsx`
- Create: `tests/react/AuthWrapper.test.jsx`

Pattern from studio `useAuth.jsx`.

**Step 1: Write failing tests**

Create `tests/react/useAuth.test.jsx`:

```javascript
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { SmartMemoryProvider, useAuth, useSmartMemory } from '../../src/react/index.js';

function wrapper({ children }) {
  return (
    <SmartMemoryProvider
      mode="custom"
      apiBaseUrl="http://localhost:9001"
      endpoints={{ login: '/auth/login', refresh: '/auth/refresh' }}
      storage="memory"
    >
      {children}
    </SmartMemoryProvider>
  );
}

describe('useAuth', () => {
  it('should provide initial unauthenticated state', () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('should throw when used outside provider', () => {
    expect(() => {
      renderHook(() => useAuth());
    }).toThrow('useAuth must be used within');
  });

  it('should expose logout action', () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(typeof result.current.logout).toBe('function');
  });

  it('should expose hasRole', () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.hasRole('admin')).toBe(false);
  });
});

describe('useSmartMemory', () => {
  it('should provide SmartMemoryClient instance', () => {
    const { result } = renderHook(() => useSmartMemory(), { wrapper });

    expect(result.current.memories).toBeDefined();
    expect(result.current.decisions).toBeDefined();
    expect(result.current.graph).toBeDefined();
  });

  it('should throw when used outside provider', () => {
    expect(() => {
      renderHook(() => useSmartMemory());
    }).toThrow('useSmartMemory must be used within');
  });
});
```

**Step 2: Run — expect FAIL**

**Step 3: Write all React binding files**

Create `src/react/SmartMemoryProvider.jsx` — creates SmartMemoryClient, provides auth context + client context.
Create `src/react/useAuth.js` — reads auth context, throws if outside provider.
Create `src/react/useAuthState.js` — read-only subset of auth.
Create `src/react/useAuthActions.js` — actions-only subset.
Create `src/react/useSmartMemory.js` — reads client context, returns SmartMemoryClient.
Create `src/react/AuthWrapper.jsx` — route protection (custom mode: renders children if authenticated; SSO mode: redirects to login).
Create `src/react/index.js` — re-exports everything.

**Step 4: Run tests**

```bash
npx vitest run tests/react/
```

**Step 5: Commit**

```bash
git add src/react/ tests/react/
git commit -m "feat: add React bindings — SmartMemoryProvider, useAuth, useSmartMemory, AuthWrapper"
```

---

## Task 10: Fetch Utilities

**Files:**
- Create: `src/fetch/authFetch.js`
- Create: `src/fetch/interceptor.js`
- Create: `src/fetch/index.js`
- Create: `tests/unit/fetch/authFetch.test.js`

Convenience wrappers for custom fetch calls.

**Step 1: Write tests, implement, commit**

Same TDD cycle. `authFetch` wraps `fetch` with auth headers (pattern from studio line 318). `interceptor` monkey-patches global fetch (opt-in).

```bash
git commit -m "feat: add authFetch wrapper and global fetch interceptor"
```

---

## Task 11: Entry Points + Build

**Files:**
- Modify: `src/index.js` (finalize exports)
- Modify: `src/core.js` (finalize exports)
- Modify: `vite.config.js` (verify build config)

**Step 1: Update entry points with all exports**

**Step 2: Build and verify output**

```bash
npm run build
ls -la dist/
```
Expected: `index.js`, `core.js`, `react.js`, `fetch.js` in dist/

**Step 3: Check bundle size**

```bash
gzip -c dist/index.js | wc -c  # Should be <25KB
```

**Step 4: Commit**

```bash
git add src/index.js src/core.js vite.config.js
git commit -m "chore: finalize entry points and verify build"
```

---

## Task 12: Full Test Suite + Coverage

**Step 1: Run full test suite with coverage**

```bash
npx vitest run --coverage
```

**Step 2: Verify coverage thresholds**

- Core modules (auth/, api/, errors/): >90% line coverage
- React bindings (react/): >80% line coverage
- If gaps found, write additional tests for uncovered branches

**Step 3: Commit**

```bash
git commit -m "test: achieve coverage targets — core >90%, react >80%"
```

---

## Task 13: README + CHANGELOG

**Files:**
- Create: `README.md`
- Create: `CHANGELOG.md`

**Step 1: Write README**

Include:
- Quick start (install, configure for custom + SSO)
- Usage examples (auth, API client, React hooks)
- Configuration reference
- Migration guide (from AuthService.js)
- API reference (all domain modules)

**Step 2: Write CHANGELOG**

```markdown
# Changelog

## 0.1.0 (2026-02-08)

### Added
- AuthCore with custom (login form) and SSO (redirect) modes
- TokenManager with localStorage/sessionStorage/memory support
- RefreshManager with single-flight deduplication
- SSOManager for redirect-based authentication
- BaseAPI with 401 refresh-retry logic
- SmartMemoryClient aggregating all domain APIs
- Domain APIs: MemoryAPI, DecisionAPI, GraphAPI, TeamAPI, ProfileAPI, SubscriptionAPI
- React bindings: SmartMemoryProvider, useAuth, useSmartMemory, AuthWrapper
- authFetch wrapper and global fetch interceptor
- JSDoc types for all public APIs
- >90% test coverage on core, >80% on React bindings
```

**Step 3: Commit**

```bash
git add README.md CHANGELOG.md
git commit -m "docs: add README with examples and migration guide, CHANGELOG"
```

---

## Execution Checklist

| Task | Component | Tests | Status |
|------|-----------|-------|--------|
| 0 | Project scaffolding | - | |
| 1 | APIError | 3 tests | |
| 2 | TokenManager | 10 tests | |
| 3 | RefreshManager | 4 tests | |
| 4 | SSOManager | 7 tests | |
| 5 | AuthCore | 12 tests | |
| 6 | BaseAPI | 6 tests | |
| 7 | Domain APIs (all) | ~30 tests | |
| 8 | SmartMemoryClient | 2 tests | |
| 9 | React bindings | ~8 tests | |
| 10 | Fetch utilities | ~4 tests | |
| 11 | Entry points + build | - | |
| 12 | Coverage verification | - | |
| 13 | README + CHANGELOG | - | |

**Total estimated tests:** ~86
**Target coverage:** Core >90%, React >80%
**Target bundle:** <25KB gzipped

---

Plan complete and saved to `docs/plans/2026-02-08-sdk-implementation.md`. Two execution options:

**1. Subagent-Driven (this session)** — I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** — Open new session with executing-plans, batch execution with checkpoints

Which approach?
