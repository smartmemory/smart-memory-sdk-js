# Product Requirements Document: JavaScript SDK

**Feature:** @smartmemory/sdk-js — Unified JavaScript SDK for SmartMemory API
**Status:** Approved for Implementation
**Date:** 2026-02-08
**Owner:** Engineering
**Related:** `docs/plans/2026-02-08-js-sdk-design.md`

---

## Problem Statement

Currently, each SmartMemory frontend (web, studio, insights, maya) implements its own authentication and API client logic, resulting in:

1. **~2500 lines of duplicated code** across 4 projects
2. **Inconsistent auth behavior** — web has token refresh, studio/insights don't
3. **Partial API coverage** — only web has the full client (~80 methods), other apps duplicate subsets
4. **High maintenance cost** — bug fixes must be replicated 4 times
5. **Poor developer experience** — no shared types, no autocomplete consistency

**Who is affected:** Internal engineering teams building SmartMemory frontends.

**Current pain:** Every new frontend feature requires re-implementing or copy-pasting auth + API logic. Token refresh bugs have shipped 3 times.

---

## Goals & Non-Goals

### Goals

1. **Single source of truth** for auth logic — eliminate all duplication
2. **Complete API coverage** — all ~80 endpoints in one tested SDK
3. **Support both auth patterns** — custom UI (web/maya) and SSO redirect (studio/insights)
4. **Seamless migration** — drop-in replacement for current `AuthService.js` and `api.js`
5. **Type safety** — JSDoc for IDE autocomplete without TypeScript compilation
6. **Tree-shakeable** — consumers bundle only what they use

### Non-Goals

- Server-side rendering (SSR) support — client-only for v1
- Vue/Svelte/Angular bindings — React-only for v1
- TypeScript source code — use JSDoc instead to avoid build complexity
- OAuth provider integrations — delegated to backend

---

## Requirements

### MUST (P0)

**Auth Module**
1. MUST support two authentication modes: `custom` (direct login) and `sso` (redirect)
2. MUST handle token storage in localStorage, sessionStorage, or memory
3. MUST implement automatic token refresh in both modes via main API (port 9001)
4. MUST handle 401 responses with refresh → retry → logout flow
5. MUST provide React hooks (`useAuth`, `useAuthState`, `useAuthActions`)
6. MUST provide `AuthProvider` context and `AuthWrapper` route protection component
7. MUST match current `AuthService.js` public API for backward compatibility

**API Client Module**
8. MUST implement all ~80 API methods from `smart-memory-web/src/lib/api.js`
9. MUST organize methods into domain modules (MemoryAPI, DecisionAPI, GraphAPI, etc.)
10. MUST automatically include auth headers on all requests
11. MUST provide `SmartMemoryClient` as single entry point
12. MUST provide React hook `useSmartMemory()` for accessing client in components

**General**
13. MUST be framework-agnostic at core (vanilla JS), with React as a layer
14. MUST include JSDoc types for all public APIs
15. MUST achieve >90% test coverage on core, >80% on React bindings
16. MUST be <25KB gzipped (auth + API client + React bindings)

### SHOULD (P1)

17. SHOULD auto-refresh tokens 5min before expiration (parse JWT exp claim)
18. SHOULD sync token updates across tabs via `storage` event listener
19. SHOULD provide global fetch interceptor as opt-in utility
20. SHOULD support custom error handlers via callbacks

### MAY (P2)

21. MAY provide TypeScript `.d.ts` declarations for better IDE support
22. MAY support configurable retry logic with exponential backoff
23. MAY provide request/response interceptors for logging/analytics

---

## Success Criteria

**Code Metrics**
- Remove ≥2000 lines of duplicated code across 4 projects
- SDK bundle size ≤25KB gzipped
- Test coverage: core ≥90%, React ≥80%

**Migration Metrics**
- Each frontend migrates in ≤4 hours
- Zero regressions in auth or API behavior post-migration
- All existing test suites pass after migration

**Developer Experience**
- JSDoc provides full autocomplete in VSCode/WebStorm
- README has working examples for both auth modes
- Migration guide exists for each project type

**Adoption**
- Web, Studio, Insights, Maya all migrate to SDK by end of implementation
- All 4 projects' `AuthService.js` files deleted
- Web's `api.js` (890 lines) deleted

---

## User Stories

**As a frontend developer** building a new SmartMemory app, I want to install one package and have full auth + API support, so I don't have to copy-paste 500+ lines of boilerplate.

**As a web app developer**, I want token refresh to work automatically in all apps, so users don't get logged out every 15 minutes when SSO apps currently can't refresh.

**As a studio developer**, I want the same API client that web has, so I can call any SmartMemory endpoint without implementing my own fetch wrapper.

**As a maintenance engineer**, I want to fix auth bugs once in the SDK, so I don't have to PR the same fix to 4 repos.

**As an IDE user**, I want autocomplete for all API methods and auth properties, so I don't have to look up method signatures in docs.

---

## Constraints & Assumptions

**Technical Constraints**
- React 18+ required (all our apps are on 18, verified)
- ES2020+ JavaScript (supports optional chaining, nullish coalescing)
- Must work in browser environments (no Node.js APIs)
- Cannot use TypeScript source (increases build complexity, violates Non-Goals)

**Timeline Constraints**
- Implementation must complete before next major feature (Web v2 redesign)
- Migration of all 4 projects should happen in same sprint to avoid divergence

**Resource Constraints**
- Single developer implementing and testing
- No dedicated QA; rely on automated tests + developer testing

**Assumptions**
- Main API service (port 9001) `/auth/refresh` endpoint works reliably
- All apps will migrate; no need to maintain old `AuthService.js` files long-term
- Bundle size target (25KB) is acceptable given current app sizes (web is 1.3MB)
- JSDoc is sufficient for type safety; no need for runtime type checking

---

## Open Questions

1. **Package scope**: Publish as `@smartmemory/sdk-js` or `@smart-memory/sdk-js`?
   - **Resolution**: Use `@smartmemory/sdk-js` (matches Docker image naming, simpler)

2. **Token encryption**: Should tokens be encrypted in localStorage?
   - **Resolution**: No. XSS can steal them anyway. Use httpOnly cookies for true security (future work, out of scope for v1).

3. **Multi-tab sync**: Should token updates sync across tabs?
   - **Resolution**: Yes via `storage` event listener. Low effort, high value. (Requirement #18, SHOULD)

4. **SSR support**: Should SDK work in Next.js/Remix?
   - **Resolution**: Not for v1 (Non-Goal). Add in v2 if needed based on demand.

5. **Monorepo structure**: Should SDK live in SmartMemory monorepo or separate repo?
   - **Resolution**: Separate repo at `smartmemory/smart-memory-sdk-js`. SmartMemory is a container folder, not a monorepo. Created at https://github.com/smartmemory/smart-memory-sdk-js

6. **API method coverage**: Should SDK include all 80+ methods or just the commonly used subset?
   - **Resolution**: All methods (Requirement #8). One of the main goals is complete coverage so other apps can call any endpoint.

---

## Related Documents

- **Design Spec**: `docs/plans/2026-02-08-js-sdk-design.md`
- **Roadmap Item**: #12 in `docs/plans/2026-02-07-remaining-work-ranked.md`
- **Reference Implementation**: `smart-memory-web/src/lib/api.js` (890 lines, source of truth for API methods)
- **Current Auth Pattern**: `smart-memory-studio/web/src/services/AuthService.js` (recently cleaned, reference for SSO mode)
