// STUDIO-DECISION-VIEW-1 U5: getHistory, getSites, listAutoChanges.
// RECORDED responses (contract and U4 report), not a live service.
import { describe, expect, it, vi } from 'vitest';
import { DecisionAPI } from '../../../src/api/DecisionAPI.js';

const SITES = {
  decision_id: 'd1',
  at: '2026-10-15T00:00:00+00:00',
  all_sites: false,
  all_sites_from: null,
  rows: [
    { scope: { site: '01' }, in_force: { decision_id: 'd1', visible: true, from: '2026-10-01T00:00:00+00:00' }, next: null },
    {
      scope: { site: '03' },
      in_force: { decision_id: 'd0', visible: true, from: '2026-09-01T00:00:00+00:00' },
      next: { decision_id: 'd1', visible: true, from: '2026-11-01T00:00:00+00:00' },
    },
  ],
};

function apiWith(answer = {}) {
  const base = { get: vi.fn().mockResolvedValue(answer) };
  return { base, decisions: new DecisionAPI(base) };
}

describe('decision history, sites and auto changes', () => {
  it('getHistory sends only what is set and encodes once', async () => {
    const { base, decisions } = apiWith({ decision_id: 'd0', entries: [], truncated: false });
    await decisions.getHistory('d0');
    expect(base.get).toHaveBeenLastCalledWith('/memory/decisions/d0/history');
    await decisions.getHistory('d0', { limit: 10, before: '2026-11-01T00:00:00+00:00', asOf: new Date('2026-10-02T00:00:00Z') });
    expect(base.get).toHaveBeenLastCalledWith(
      `/memory/decisions/d0/history?limit=10&before=${encodeURIComponent('2026-11-01T00:00:00+00:00')}&as_of=${encodeURIComponent('2026-10-02T00:00:00.000Z')}`,
    );
  });

  it('getSites is one call, scopes repeat as JSON', async () => {
    const { base, decisions } = apiWith(SITES);
    const answer = await decisions.getSites('d1', { at: '2026-10-15T00:00:00Z', scopes: [{ site: '05' }, { site: '06' }] });
    expect(base.get).toHaveBeenCalledTimes(1);
    expect(base.get).toHaveBeenLastCalledWith(
      `/memory/decisions/d1/sites?at=${encodeURIComponent('2026-10-15T00:00:00Z')}&scope=${encodeURIComponent('{"site":"05"}')}&scope=${encodeURIComponent('{"site":"06"}')}`,
    );
    const rows = Object.fromEntries(answer.rows.map(r => [r.scope.site, r]));
    expect(rows['01'].in_force.decision_id).toBe('d1');
    expect(rows['03'].in_force.decision_id).toBe('d0');
    expect(rows['03'].next.from).toBe('2026-11-01T00:00:00+00:00');
  });

  it('listAutoChanges reads the literal path', async () => {
    const { base, decisions } = apiWith({ items: [] });
    await decisions.listAutoChanges();
    expect(base.get).toHaveBeenLastCalledWith('/memory/decisions/auto-changes');
    await decisions.listAutoChanges({ status: 'all', limit: 5, offset: 10 });
    expect(base.get).toHaveBeenLastCalledWith('/memory/decisions/auto-changes?status=all&limit=5&offset=10');
  });

  it('refuses an id that could reach another route before any request', async () => {
    const { base, decisions } = apiWith();
    for (const id of ['../x', 'a/b', '', 'auto-changes']) {
      await expect(decisions.getHistory(id)).rejects.toThrow(/Invalid id/);
      await expect(decisions.getSites(id)).rejects.toThrow(/Invalid id/);
    }
    expect(base.get).not.toHaveBeenCalled();
  });

  it('lets the service refusal through unchanged', async () => {
    const error = Object.assign(new Error('Decision not found'), { status: 404 });
    const base = { get: vi.fn().mockRejectedValue(error) };
    await expect(new DecisionAPI(base).getHistory('nope')).rejects.toBe(error);
  });
});
