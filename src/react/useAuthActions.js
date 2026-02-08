import { useAuth } from './useAuth.js';

export function useAuthActions() {
  const { login, logout, storeCallbackTokens, hasRole, getLoginUrl } = useAuth();
  return { login, logout, storeCallbackTokens, hasRole, getLoginUrl };
}
