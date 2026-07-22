import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, renderHook } from '@testing-library/react';

const { authHarness, posthogMock } = vi.hoisted(() => {
  const harness = {
    listener: null,
    workspaceId: 'workspace-initial',
  };

  return {
    authHarness: harness,
    posthogMock: {
      __loaded: true,
      capture: vi.fn(),
      captureException: vi.fn(),
      identify: vi.fn(),
      init: vi.fn(),
      register: vi.fn(),
      reset: vi.fn(),
      unregister: vi.fn(),
    },
  };
});

vi.mock('posthog-js', () => ({ default: posthogMock }));

vi.mock('../../src/api/SmartMemoryClient.js', () => ({
  SmartMemoryClient: class SmartMemoryClient {
    constructor() {
      this.auth = {
        addListener: vi.fn((listener) => {
          authHarness.listener = listener;
          return vi.fn();
        }),
        getCurrentToken: vi.fn(() => null),
        getCurrentUser: vi.fn(() => null),
        getLoginUrl: vi.fn(),
        getTenantId: vi.fn(() => null),
        hasRole: vi.fn(() => false),
        isAuthenticated: vi.fn(() => false),
        logout: vi.fn(),
        tokenManager: {
          getTeamId: vi.fn(() => authHarness.workspaceId),
        },
      };
    }
  },
}));

import * as analytics from '../../src/react/analytics/index.js';
import { normalizeEnvironment } from '../../src/react/analytics/config.js';
import { SmartMemoryProvider } from '../../src/react/SmartMemoryProvider.jsx';
import { useAuthState } from '../../src/react/useAuthState.js';

const {
  AnalyticsIdentity,
  createAnalyticsConfig,
  resetAnalytics,
} = analytics;

describe('@smartmemory/sdk-js/react/analytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    posthogMock.__loaded = true;
    authHarness.listener = null;
    authHarness.workspaceId = 'workspace-initial';
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
  });

  it('exports exactly the five public analytics symbols', () => {
    expect(Object.keys(analytics).sort()).toEqual([
      'AnalyticsIdentity',
      'captureException',
      'captureProductEvent',
      'createAnalyticsConfig',
      'resetAnalytics',
    ]);
  });

  it('builds the explicit strict PostHog options and registers only app and environment', () => {
    vi.stubEnv('MODE', 'production');

    const config = createAnalyticsConfig({
      app: 'web',
      apiKey: 'phc_test',
      apiHost: 'https://us.i.posthog.com',
    });

    expect(config.apiKey).toBe('phc_test');
    expect(config.options).toEqual(expect.objectContaining({
      api_host: 'https://us.i.posthog.com',
      autocapture: false,
      capture_exceptions: true,
      capture_pageview: 'history_change',
      cross_subdomain_cookie: true,
      defaults: '2025-05-24',
      disable_session_recording: true,
    }));

    config.options.loaded(posthogMock);

    expect(posthogMock.register).toHaveBeenCalledTimes(1);
    expect(posthogMock.register).toHaveBeenCalledWith({
      app: 'web',
      environment: 'production',
    });
  });

  it('normalizes deployment modes to production, development, or test', () => {
    expect(normalizeEnvironment('production')).toBe('production');
    expect(normalizeEnvironment('test')).toBe('test');
    expect(normalizeEnvironment('development')).toBe('development');
    expect(normalizeEnvironment('staging')).toBe('development');
    expect(normalizeEnvironment(undefined)).toBe('development');
  });

  it('returns a disabled config for a missing key without initializing PostHog', () => {
    const config = createAnalyticsConfig({
      app: 'viewer',
      apiKey: '  ',
      apiHost: 'https://us.i.posthog.com',
    });

    expect(config.apiKey).toBeNull();
    expect(config.options).toEqual(expect.objectContaining({
      autocapture: false,
      disable_session_recording: true,
    }));
    expect(posthogMock.init).not.toHaveBeenCalled();
    expect(posthogMock.register).not.toHaveBeenCalled();
  });

  it('identifies authenticated users with exact person properties and active workspace', () => {
    const user = {
      id: 'user-1',
      email: 'person@example.com',
      subscription_tier: 'pro',
      tenant_id: 'tenant-1',
      default_team_id: 'workspace-stale',
    };

    render(
      <AnalyticsIdentity
        user={user}
        isAuthenticated
        workspaceId="workspace-active"
      />,
    );

    expect(posthogMock.identify).toHaveBeenCalledWith('user-1', {
      email: 'person@example.com',
      plan: 'pro',
      tenant_id: 'tenant-1',
    });
    expect(posthogMock.register).toHaveBeenCalledWith({
      workspace_id: 'workspace-active',
    });
    expect(posthogMock.register).not.toHaveBeenCalledWith({
      workspace_id: 'workspace-stale',
    });
  });

  it('re-identifies when any identity property or active workspace changes', () => {
    const { rerender } = render(
      <AnalyticsIdentity
        user={{
          id: 'user-1',
          email: 'first@example.com',
          subscription_tier: 'free',
          tenant_id: 'tenant-1',
        }}
        isAuthenticated
        workspaceId="workspace-1"
      />,
    );

    rerender(
      <AnalyticsIdentity
        user={{
          id: 'user-1',
          email: 'second@example.com',
          subscription_tier: 'pro',
          tenant_id: 'tenant-2',
        }}
        isAuthenticated
        workspaceId="workspace-2"
      />,
    );

    expect(posthogMock.identify).toHaveBeenCalledTimes(2);
    expect(posthogMock.identify).toHaveBeenLastCalledWith('user-1', {
      email: 'second@example.com',
      plan: 'pro',
      tenant_id: 'tenant-2',
    });
    expect(posthogMock.register).toHaveBeenLastCalledWith({
      workspace_id: 'workspace-2',
    });
  });

  it('unregisters workspace_id when the active workspace disappears and never uses the default team', () => {
    const user = {
      id: 'user-1',
      email: 'person@example.com',
      subscription_tier: 'pro',
      tenant_id: 'tenant-1',
      default_team_id: 'workspace-stale',
    };
    const { rerender } = render(
      <AnalyticsIdentity
        user={user}
        isAuthenticated
        workspaceId="workspace-active"
      />,
    );

    rerender(
      <AnalyticsIdentity
        user={user}
        isAuthenticated
        workspaceId={null}
      />,
    );

    expect(posthogMock.unregister).toHaveBeenCalledWith('workspace_id');
    expect(posthogMock.register).not.toHaveBeenCalledWith({
      workspace_id: 'workspace-stale',
    });
  });

  it('does not identify unauthenticated users and clears a stale workspace super-property', () => {
    render(
      <AnalyticsIdentity
        user={{ id: 'user-1' }}
        isAuthenticated={false}
        workspaceId="workspace-1"
      />,
    );

    expect(posthogMock.identify).not.toHaveBeenCalled();
    expect(posthogMock.unregister).toHaveBeenCalledWith('workspace_id');
  });

  it('exposes workspaceId initially and reacts to auth listener snapshots', () => {
    function wrapper({ children }) {
      return <SmartMemoryProvider mode="custom">{children}</SmartMemoryProvider>;
    }

    const { result } = renderHook(() => useAuthState(), { wrapper });
    expect(result.current.workspaceId).toBe('workspace-initial');

    act(() => {
      authHarness.listener({
        isAuthenticated: true,
        user: { id: 'user-1' },
        token: 'token-1',
        tenantId: 'tenant-1',
        workspaceId: 'workspace-next',
      });
    });

    expect(result.current.workspaceId).toBe('workspace-next');
  });

  it('resets synchronously and safely handles uninitialized and failing clients', () => {
    expect(resetAnalytics()).toBe(true);
    expect(posthogMock.reset).toHaveBeenCalledTimes(1);

    posthogMock.__loaded = false;
    expect(() => resetAnalytics()).not.toThrow();
    expect(resetAnalytics()).toBe(false);

    posthogMock.__loaded = true;
    posthogMock.reset.mockImplementationOnce(() => {
      throw new Error('client failure');
    });
    expect(resetAnalytics()).toBe(false);
  });
});
