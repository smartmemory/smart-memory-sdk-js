import React, { useEffect } from 'react';
import posthog from 'posthog-js';

function activeClient() {
  if (!posthog || posthog.__loaded !== true) {
    return null;
  }
  return posthog;
}

let warnedNotLoaded = false;

// No silent degradation: identify skipped because posthog-js was not initialised yet
// (an app that inits inside PostHogProvider's effect runs this child effect first).
function warnNotLoaded() {
  if (warnedNotLoaded) {
    return;
  }
  warnedNotLoaded = true;
  console.warn(
    '[analytics] identify skipped: posthog-js client is not loaded '
    + '(init posthog at module scope before rendering, not inside PostHogProvider apiKey)',
  );
}

export function resetIdentityWarnings() {
  warnedNotLoaded = false;
}

export function AnalyticsIdentity({ user, isAuthenticated, workspaceId }) {
  const userId = user?.id;
  const email = user?.email;
  const plan = user?.subscription_tier;
  const tenantId = user?.tenant_id;

  useEffect(() => {
    const client = activeClient();
    if (!client) {
      if (isAuthenticated && userId) {
        warnNotLoaded();
      }
      return;
    }

    try {
      if (!isAuthenticated || !userId) {
        client.unregister?.('workspace_id');
        return;
      }

      if (workspaceId) {
        client.register?.({ workspace_id: workspaceId });
      } else {
        client.unregister?.('workspace_id');
      }

      // Super-properties are read when identify builds its network payload.
      // Register the active workspace first so $identify cannot carry the
      // previous/default workspace during an organization switch.
      client.identify?.(userId, {
        email,
        plan,
        tenant_id: tenantId,
      });
    } catch {
      // Identity analytics is best-effort and must never break authentication.
    }
  }, [email, isAuthenticated, plan, tenantId, userId, workspaceId]);

  return null;
}
