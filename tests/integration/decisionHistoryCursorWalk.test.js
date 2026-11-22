// BUG-DECISION-HISTORY-PAGE-TIE-1 note H2 (sdk-js): the limit-2 cursor walk over a real service.
// The service, its stores and the 6-entry history (three entries at one instant) are prepared by the unit's
// service-side driver, which writes a seed file; SM_DV_HISTORY_SEED names it. Without it the test skips.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SmartMemoryClient } from '../../src/api/SmartMemoryClient.js';

const seedPath = process.env.SM_DV_HISTORY_SEED;
const seed = seedPath && existsSync(seedPath) ? JSON.parse(readFileSync(seedPath, 'utf8')) : null;

describe.skipIf(!seed)('decision history cursor walk over the test service (H2)', () => {
  it('limit 2 with next_cursor returns all six entries once, in the one-read order', async () => {
    const client = new SmartMemoryClient({ apiKey: seed.token, apiBaseUrl: seed.base_url });
    client.auth.tokenManager.setWorkspaceId(seed.workspace_id);
    const whole = (await client.decisions.getHistory(seed.decision_id, { limit: 500 })).entries;
    expect(whole).toEqual(seed.entries);
    expect(whole).toHaveLength(6);
    const walked = [];
    let cursor;
    for (let i = 0; i < 10; i += 1) {
      const page = await client.decisions.getHistory(seed.decision_id, { limit: 2, cursor });
      walked.push(...page.entries);
      if (!page.truncated) {
        expect(page.next_cursor ?? null).toBeNull();
        break;
      }
      cursor = page.next_cursor;
    }
    expect(walked).toEqual(whole);
    await expect(client.decisions.getHistory(seed.decision_id, { cursor: 'garbage' })).rejects.toMatchObject({ code: 'invalid_cursor' });
  });
});
