import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { SmartMemoryProvider, useAuth, useSmartMemory } from '../../src/react/index.js';

function wrapper({ children }) {
  return (
    <SmartMemoryProvider
      mode="sso"
      apiBaseUrl="http://localhost:9001"
      webAppUrl="http://localhost:5173"
      endpoints={{ refresh: '/auth/refresh' }}
      storage="memory"
    >
      {children}
    </SmartMemoryProvider>
  );
}

describe('useAuth', () => {
  it('should provide initial unauthenticated state', () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('should throw when used outside provider', () => {
    expect(() => {
      renderHook(() => useAuth());
    }).toThrow('useAuth must be used within');
  });

  it('should expose logout action', () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(typeof result.current.logout).toBe('function');
  });

  it('should expose hasRole', () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.hasRole('admin')).toBe(false);
  });
});

describe('useSmartMemory', () => {
  it('should provide SmartMemoryClient instance', () => {
    const { result } = renderHook(() => useSmartMemory(), { wrapper });

    expect(result.current.memories).toBeDefined();
    expect(result.current.decisions).toBeDefined();
    expect(result.current.graph).toBeDefined();
  });

  it('should throw when used outside provider', () => {
    expect(() => {
      renderHook(() => useSmartMemory());
    }).toThrow('useSmartMemory must be used within');
  });
});
