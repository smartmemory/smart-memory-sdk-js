import React, { createContext, useState, useEffect, useCallback, useRef } from 'react';
import { SmartMemoryClient } from '../api/SmartMemoryClient.js';

export const AuthContext = createContext(null);
export const ClientContext = createContext(null);

export function SmartMemoryProvider({ children, ...config }) {
  const clientRef = useRef(null);
  if (!clientRef.current) {
    clientRef.current = new SmartMemoryClient(config);
  }
  const client = clientRef.current;

  const [authState, setAuthState] = useState({
    isAuthenticated: client.auth.isAuthenticated(),
    user: client.auth.getCurrentUser(),
    token: client.auth.getCurrentToken(),
    tenantId: client.auth.getTenantId(),
    loading: false,
    error: null
  });

  useEffect(() => {
    const unsubscribe = client.auth.addListener((state) => {
      setAuthState(prev => ({
        ...prev,
        isAuthenticated: state.isAuthenticated,
        user: state.user,
        token: state.token,
        tenantId: state.tenantId
      }));
    });
    return unsubscribe;
  }, [client]);

  const logout = useCallback(async () => {
    await client.auth.logout();
  }, [client]);

  const storeCallbackTokens = useCallback((params) => {
    client.auth.storeCallbackTokens(params);
  }, [client]);

  const hasRole = useCallback((role) => {
    return client.auth.hasRole(role);
  }, [client]);

  const getLoginUrl = useCallback((currentUrl) => {
    return client.auth.getLoginUrl(currentUrl);
  }, [client]);

  const authValue = {
    ...authState,
    logout,
    storeCallbackTokens,
    hasRole,
    getLoginUrl
  };

  return (
    <AuthContext.Provider value={authValue}>
      <ClientContext.Provider value={client}>
        {children}
      </ClientContext.Provider>
    </AuthContext.Provider>
  );
}
