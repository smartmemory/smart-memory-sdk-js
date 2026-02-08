import React from 'react';
import { useAuth } from './useAuth.js';

export function AuthWrapper({ children, fallback = null, redirectToLogin = false }) {
  const { isAuthenticated, loading, getLoginUrl } = useAuth();

  if (loading) return fallback;

  if (!isAuthenticated) {
    if (redirectToLogin) {
      try {
        const loginUrl = getLoginUrl();
        window.location.href = loginUrl;
      } catch {
        // getLoginUrl only works in SSO mode, fall through to fallback
      }
    }
    return fallback;
  }

  return children;
}
