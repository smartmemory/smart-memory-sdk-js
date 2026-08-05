// @smartmemory/sdk-js — main entry point

// Client
export { SmartMemoryClient } from './api/SmartMemoryClient.js';

// Auth
export { AuthCore } from './auth/AuthCore.js';
export { TokenManager } from './auth/TokenManager.js';
export { CLERK_APPEARANCE, exchangeClerkSession, getClerkTokenWithRetry } from './auth/clerkWeb.js';

// Domain APIs
export { MemoryAPI } from './api/MemoryAPI.js';
export { DecisionAPI } from './api/DecisionAPI.js';
export { OpinionAPI } from './api/OpinionAPI.js';
export { GraphAPI } from './api/GraphAPI.js';
export { TeamAPI } from './api/TeamAPI.js';
export { ProfileAPI } from './api/ProfileAPI.js';
export { SubscriptionAPI } from './api/SubscriptionAPI.js';
export { AuthAPI } from './api/AuthAPI.js';
export { AgentAPI } from './api/AgentAPI.js';
export { UsageAPI } from './api/UsageAPI.js';
export { InsightsAPI } from './api/InsightsAPI.js';
export { TokenUsageAPI } from './api/TokenUsageAPI.js';
export { TemporalAPI } from './api/TemporalAPI.js';
export { GovernanceAPI } from './api/GovernanceAPI.js';
export { EvolutionAPI } from './api/EvolutionAPI.js';
export { ReasoningAPI } from './api/ReasoningAPI.js';
export { ReasoningTracesAPI } from './api/ReasoningTracesAPI.js';
export { OntologyAPI } from './api/OntologyAPI.js';
export { AnalyticsAPI } from './api/AnalyticsAPI.js';
export { ValidationAPI } from './api/ValidationAPI.js';
export { PipelineAPI } from './api/PipelineAPI.js';
export { ArchiveAPI } from './api/ArchiveAPI.js';
export { ZettelkastenAPI } from './api/ZettelkastenAPI.js';
export { ProcedureMatchAPI } from './api/ProcedureMatchAPI.js';
export { ProcedureCandidateAPI } from './api/ProcedureCandidateAPI.js';
export { LockAPI } from './api/LockAPI.js';
export { SequenceAPI } from './api/SequenceAPI.js';

// Errors
export { APIError } from './errors/APIError.js';
