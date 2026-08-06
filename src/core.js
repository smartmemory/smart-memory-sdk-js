// @smartmemory/sdk-js/core — framework-agnostic auth + API only

// Client
export { SmartMemoryClient } from './api/SmartMemoryClient.js';

// Auth (all internals)
export { AuthCore } from './auth/AuthCore.js';
export { TokenManager } from './auth/TokenManager.js';
export { RefreshManager } from './auth/RefreshManager.js';
export { SSOManager } from './auth/SSOManager.js';

// API (all internals)
export { BaseAPI } from './api/BaseAPI.js';
export { MemoryAPI } from './api/MemoryAPI.js';
export { DecisionAPI } from './api/DecisionAPI.js';
export { GraphAPI } from './api/GraphAPI.js';
export { TeamAPI } from './api/TeamAPI.js';
export { ProfileAPI } from './api/ProfileAPI.js';
export { SubscriptionAPI } from './api/SubscriptionAPI.js';
export { AuthAPI } from './api/AuthAPI.js';
export { AgentAPI } from './api/AgentAPI.js';
export { UsageAPI } from './api/UsageAPI.js';
export { InsightsAPI } from './api/InsightsAPI.js';
// CORE-MEMTYPE-DECLARE-1: declare surface (declareType/declareRelation) must be
// reachable from the core entry too (SequenceAPI/LockAPI dual-export precedent).
export { OntologyAPI } from './api/OntologyAPI.js';

// Errors
export { APIError } from './errors/APIError.js';
