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

// Keys whose values may carry a full URL. PostHog attaches several of these
// automatically ($current_url, $referrer, and their $initial_* / $session_entry_*
// variants), so they bypass the product-event allowlist entirely.
const URL_BEARING_KEY = /(url|referrer|href)/i;

/**
 * Strip the query string and fragment from a URL, keeping origin + path.
 *
 * Our routes put record identifiers in the query, not the path — `/Memories?id=<item_id>`
 * (web) and `/?run=<run_id>` (viewer) — and the canonical contract forbids sending
 * memory/run IDs. Path templates are stable and carry no identifiers today; a route
 * that later embeds an ID in the path would need normalizing here too.
 */
export function stripUrlDetails(value) {
  if (typeof value !== 'string' || !/^https?:\/\//i.test(value)) {
    return value;
  }
  try {
    const parsed = new URL(value);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    // Unparseable: drop it rather than forward something we cannot inspect.
    return null;
  }
}

/** Recursively scrub URL-bearing properties, including $set / $set_once payloads. */
export function sanitizeEventProperties(properties) {
  if (!properties || typeof properties !== 'object') {
    return properties;
  }
  const scrubbed = Array.isArray(properties) ? [...properties] : { ...properties };
  for (const [key, value] of Object.entries(scrubbed)) {
    if (value && typeof value === 'object') {
      scrubbed[key] = sanitizeEventProperties(value);
    } else if (URL_BEARING_KEY.test(key)) {
      scrubbed[key] = stripUrlDetails(value);
    }
  }
  return scrubbed;
}

export function sanitizeCapturedEvent(event) {
  if (!event || typeof event !== 'object') {
    return event;
  }
  return { ...event, properties: sanitizeEventProperties(event.properties) };
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
      // PostHog's exception autocapture hooks window.onerror / unhandledrejection
      // and ships the raw message, stack, and filenames — it never passes through
      // our sanitized captureException seam, so an error string built from a search
      // query or memory content would be sent verbatim. Explicit capture only.
      capture_exceptions: false,
      capture_pageview: 'history_change',
      cross_subdomain_cookie: true,
      defaults: '2025-05-24',
      // Session replay is ON but fully masked (D3 revision 2026-07-22):
      // layout/navigation are visible, memory content, search queries, and
      // chat text are not.
      //
      // maskTextSelector: '*' is the load-bearing flag. The top-level
      // mask_all_text / mask_all_element_attributes options do NOT reach the
      // recorder — posthog-js reads them only in autocapture.js and
      // dead-clicks-autocapture.js (see their `maskAllText:` usage). The replay
      // recorder resolves masking solely from session_recording.{maskAllInputs,
      // maskTextSelector, blockSelector}. They are kept here as defense in depth
      // for the autocapture surfaces, which remote config can switch on.
      disable_session_recording: false,
      mask_all_text: true,
      mask_all_element_attributes: true,
      session_recording: {
        maskAllInputs: true,
        maskTextSelector: '*',
      },
      // $current_url / $referrer and their $initial_* variants are attached by
      // PostHog to every event, replay snapshot, and identify — outside the
      // product-event allowlist. Strip query strings and fragments so record
      // identifiers cannot ride along.
      before_send: sanitizeCapturedEvent,
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
