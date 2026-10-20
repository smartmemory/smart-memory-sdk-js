// UPGRADE-NUDGES-2: the three upgrade_prompt_* events go through the real generated allowlist
// (no mock of productEvents.generated.js, unlike analytics.test.js) and the real key filter.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { posthogMock } = vi.hoisted(() => ({
  posthogMock: { __loaded: true, capture: vi.fn(), captureException: vi.fn(), reset: vi.fn() },
}));

vi.mock('posthog-js', () => ({ default: posthogMock }));

import { PRODUCT_EVENT_PROPERTIES } from '../../src/react/analytics/productEvents.generated.js';
import { captureProductEvent } from '../../src/react/analytics/client.js';

const EVENTS = ['upgrade_prompt_shown', 'upgrade_prompt_clicked', 'upgrade_prompt_dismissed'];
const PROPS = ['audience', 'nudge_key', 'surface', 'target_tier'];
const PAYLOAD = {
  nudge_key: 'banner_workspaces',
  surface: 'web',
  target_tier: 'enterprise',
  audience: 'billing_manager',
};

// One row per case: label, input payload, expected captured payload. The negative controls
// are keys the filter must drop even if a payload carries them: nudge_id (the unit's named
// control), one per forbidden suffix, and an unlisted key.
const STUDIO_402 = { nudge_key: 'screen_studio_402', surface: 'studio', target_tier: 'enterprise' };
const CASES = [
  ['all four properties survive', PAYLOAD, PAYLOAD],
  ['nudge_id is dropped', { ...PAYLOAD, nudge_id: 'abc' }, PAYLOAD],
  ['nudge_name is dropped', { ...PAYLOAD, nudge_name: 'Workspaces' }, PAYLOAD],
  ['nudge_tag is dropped', { ...PAYLOAD, nudge_tag: 'banner' }, PAYLOAD],
  ['an unlisted key is dropped', { ...PAYLOAD, price: 'x' }, PAYLOAD],
  ['audience is omitted when the surface does not know it', STUDIO_402, STUDIO_402],
];

describe('upgrade_prompt_* product events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    posthogMock.__loaded = true;
  });

  it.each(EVENTS)('%s has exactly the four contract properties in the generated allowlist', (eventName) => {
    expect([...PRODUCT_EVENT_PROPERTIES[eventName]].sort()).toEqual(PROPS);
  });

  for (const [label, input, expected] of CASES) {
    for (const eventName of EVENTS) {
      it(`${eventName}: ${label}`, () => {
        expect(captureProductEvent(eventName, { ...input })).toBe(true);

        expect(posthogMock.capture).toHaveBeenCalledTimes(1);
        const [capturedName, captured] = posthogMock.capture.mock.calls[0];
        expect(capturedName).toBe(eventName);
        expect(captured).toEqual(expected);
        expect(Object.keys(captured)).not.toContain('nudge_id');
      });
    }
  }
});
