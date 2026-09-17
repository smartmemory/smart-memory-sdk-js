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
          getWorkspaceId: vi.fn(() => authHarness.workspaceId),
          getTeamId: vi.fn(() => authHarness.workspaceId),
        },
      };
    }
  },
}));

import * as analytics from '../../src/react/analytics/index.js';
import {
  normalizeEnvironment,
  sanitizeCapturedEvent,
  stripUrlDetails,
} from '../../src/react/analytics/config.js';
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
      capture_exceptions: false,
      capture_pageview: 'history_change',
      cross_subdomain_cookie: true,
      defaults: '2025-05-24',
      disable_session_recording: false,
      mask_all_text: true,
      mask_all_element_attributes: true,
      session_recording: { maskAllInputs: true, maskTextSelector: '*' },
    }));

    // Regression guards for the three privacy defects found in adversarial
    // review (2026-07-22). Each of these is a channel that bypasses the
    // product-event allowlist entirely, so they are asserted explicitly
    // rather than left to the objectContaining above.

    // 1. Replay masking must come from session_recording. The top-level
    //    mask_all_text flag is only read by autocapture, which is disabled,
    //    so on its own it masks nothing in a replay.
    expect(config.options.session_recording.maskTextSelector).toBe('*');

    // 2. Exception autocapture ships raw messages and stacks around our
    //    sanitized captureException seam.
    expect(config.options.capture_exceptions).toBe(false);

    // 3. Every event must pass through the URL scrubber.
    expect(config.options.before_send).toBe(sanitizeCapturedEvent);

    // 4. The PostHog project enables console-log recording server-side, which
    //    pipes console output into the replay where masking does not reach it.
    //    posthog-js resolves this as (client ?? server), so false must be
    //    explicit — omitting it silently inherits the server's `true`.
    expect(config.options.enable_recording_console_log).toBe(false);

    config.options.loaded(posthogMock);

    expect(posthogMock.register).toHaveBeenCalledTimes(1);
    expect(posthogMock.register).toHaveBeenCalledWith({
      app: 'web',
      environment: 'production',
    });
  });

  it('strips query strings and fragments from every URL-bearing property', () => {
    const scrubbed = sanitizeCapturedEvent({
      event: '$pageview',
      properties: {
        $current_url: 'https://app.smartmemory.ai/Memories?id=memory-private-47#frag',
        $referrer: 'https://app.smartmemory.ai/Search?q=secret+query',
        $pathname: '/Memories',
        workspace_id: 'team_abc',
        $set: { $initial_current_url: 'https://viewer.smartmemory.ai/?run=run-private-9' },
      },
    });

    expect(scrubbed.properties.$current_url).toBe('https://app.smartmemory.ai/Memories');
    expect(scrubbed.properties.$referrer).toBe('https://app.smartmemory.ai/Search');
    expect(scrubbed.properties.$set.$initial_current_url).toBe('https://viewer.smartmemory.ai/');

    // Non-URL properties are untouched.
    expect(scrubbed.properties.$pathname).toBe('/Memories');
    expect(scrubbed.properties.workspace_id).toBe('team_abc');

    // No identifier survives anywhere in the serialized event.
    const serialized = JSON.stringify(scrubbed);
    for (const secret of ['memory-private-47', 'secret+query', 'run-private-9']) {
      expect(serialized).not.toContain(secret);
    }
  });

  it('drops an unparseable URL rather than forwarding it, and tolerates odd shapes', () => {
    expect(stripUrlDetails('http://[not a url')).toBeNull();
    expect(stripUrlDetails('/relative/path')).toBe('/relative/path');
    expect(stripUrlDetails(undefined)).toBeUndefined();
    expect(sanitizeCapturedEvent(null)).toBeNull();
    expect(sanitizeCapturedEvent({ event: '$pageview' }).properties).toBeUndefined();
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
      mask_all_text: true,
      mask_all_element_attributes: true,
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
    expect(posthogMock.register.mock.invocationCallOrder[0]).toBeLessThan(
      posthogMock.identify.mock.invocationCallOrder[0],
    );
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
