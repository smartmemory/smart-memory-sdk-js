# Changelog

## 0.1.1 (2026-02-08)

### Added
- **X-Team-Id header**: TokenManager stores team ID separately from tenant ID; AuthCore emits both `X-Workspace-Id` and `X-Team-Id` headers
- **DecisionAPI**: `reinforce()`, `supersede()`, `retract()`, `getProvenance()` methods
- **SmartMemoryClient**: `setTeamId()` / `getTeamId()` convenience methods
- 9 new tests (110 total)

### Fixed
- **SSOManager.storeCallbackTokens()**: accepts both param conventions (`refresh_token`/`refresh`, `team_id`/`team`) for cross-app SSO compatibility

## 0.1.0 (2026-02-08)

### Added
- **AuthCore** with dual-mode authentication: `custom` (email/password login) and `sso` (redirect-based)
- **TokenManager** with localStorage, sessionStorage, and in-memory storage backends, plus storage fallback and custom key support
- **RefreshManager** with single-flight deduplication for concurrent token refreshes
- **SSOManager** for redirect-based authentication with URL validation and callback token storage
- **BaseAPI** with automatic auth headers, 401 refresh-retry logic, and structured error handling
- **SmartMemoryClient** as unified entry point aggregating auth + all 10 domain APIs
- **Domain APIs**: MemoryAPI (23 methods), DecisionAPI (4), GraphAPI (5), TeamAPI (9), ProfileAPI (4), SubscriptionAPI (5), AuthAPI (7), AgentAPI (4), UsageAPI (3), InsightsAPI (4)
- **React bindings**: SmartMemoryProvider, useAuth, useAuthState, useAuthActions, useSmartMemory, AuthWrapper
- **Fetch utilities**: createAuthFetch wrapper and installInterceptor for global fetch interception
- **APIError** class for structured error handling with status codes and detail payloads
- JSDoc types for all public APIs
- 101 unit tests across 13 test files
- Multi-entry build: `@smartmemory/sdk-js`, `@smartmemory/sdk-js/core`, `@smartmemory/sdk-js/react`, `@smartmemory/sdk-js/fetch`
- Bundle size: 5.63 KB gzipped (main entry)
