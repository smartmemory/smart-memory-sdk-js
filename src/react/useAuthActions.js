import { useAuth } from './useAuth.js';

export function useAuthActions() {
  const { login, logout, hasRole, getLoginUrl } = useAuth();
  return { login, logout, hasRole, getLoginUrl };
}
