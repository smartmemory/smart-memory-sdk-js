import { useAuth } from './useAuth.js';

export function useAuthState() {
  const { isAuthenticated, user, token, tenantId, loading, error } = useAuth();
  return { isAuthenticated, user, token, tenantId, loading, error };
}
