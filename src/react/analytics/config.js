function currentMode() {
  if (typeof import.meta !== 'undefined' && import.meta.env?.MODE) {
    return import.meta.env.MODE;
  }
  if (typeof process !== 'undefined') {
    return process.env?.NODE_ENV;
  }
  return undefined;
}

export function normalizeEnvironment(mode) {
  if (mode === 'production' || mode === 'test') {
    return mode;
  }
  return 'development';
}

export function createAnalyticsConfig({ app, apiKey, apiHost }) {
  const normalizedApiKey = typeof apiKey === 'string' && apiKey.trim()
    ? apiKey.trim()
    : null;
  const environment = normalizeEnvironment(currentMode());

  return {
    apiKey: normalizedApiKey,
    options: {
      api_host: apiHost,
      autocapture: false,
      capture_exceptions: true,
      capture_pageview: 'history_change',
      cross_subdomain_cookie: true,
      defaults: '2025-05-24',
      // Session replay is ON but fully masked (D3 revision 2026-07-22):
      // layout/navigation are visible, memory content, search queries, and
      // chat text are not. mask_all_text is the load-bearing flag — replays
      // must never contain user-authored text.
      disable_session_recording: false,
      mask_all_text: true,
      mask_all_element_attributes: true,
      session_recording: {
        maskAllInputs: true,
      },
      loaded: (client) => {
        if (!normalizedApiKey || typeof client?.register !== 'function') {
          return;
        }
        try {
          client.register({ app, environment });
        } catch {
          // Analytics must never interfere with application startup.
        }
      },
    },
  };
}
