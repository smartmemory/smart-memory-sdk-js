// @smartmemory/sdk-js/react/recovery: blank-page recovery shared by every SmartMemory UI (WEB-BLANK-AFTER-IDLE-1).
export { RecoveryBoundary, NewVersionNotice, CrashNotice } from './RecoveryBoundary.jsx';
export { installRecovery, handleEscapedError, logRecovery, NEW_VERSION_EVENT, resetRecoveryForTests } from './install.js';
export { classifyError, isAuthError, isNetworkError } from './classify.js';
export {
  CHUNK_RELOAD_FLAG,
  CHUNK_RELOAD_WINDOW_MS,
  CHUNK_RELOAD_HEALTHY_MS,
  CHUNK_RELOAD_INFLIGHT_MS,
  isChunkLoadError,
  isChunkReloadInFlight,
  reloadOnceForChunkError,
  chunkReloadedRecently,
  scheduleChunkReloadReset,
  installChunkReload,
  resetChunkReloadStateForTests,
} from './chunkReload.js';
export { useSessionDraft } from './useSessionDraft.js';
export { installVersionCheck, parseEntrySrc, VERSION_CHECK_MIN_INTERVAL_MS } from './versionCheck.js';
export { LazyFallback, LAZY_FALLBACK_SPINNER_MS, LAZY_FALLBACK_RELOAD_MS } from './LazyFallback.jsx';
