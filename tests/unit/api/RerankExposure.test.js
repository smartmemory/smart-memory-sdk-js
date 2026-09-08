import { readFileSync } from 'node:fs';
import { describe, it, expect, vi } from 'vitest';
import { MemoryAPI } from '../../../src/api/MemoryAPI.js';

const contract = JSON.parse(readFileSync(
  '../smart-memory-docs/docs/features/CORE-RERANK-EXPOSE-1/rerank-exposure-contract.json', 'utf8',
));

const statuses = contract.properties.rerank_status.enum;

function evidence(status, score = -11.4) {
  return {
    item_id: status, content: 'Python frameworks', score: 0.8,
    rerank_score: status === 'scored' ? score : null,
    rerank_status: status,
    rerank_model: { name: 'actual-model', revision: 'revision', activation: 'Identity' },
    rerank_pool_size: 30, rerank_candidate_count: 25, rerank_scored_count: 25,
    rerank_pool_capped: true, rerank_max_doc_chars: 512,
  };
}

describe('CORE-RERANK-EXPOSE-1', () => {
  it('documents the exact contract enum and field names', () => {
    const source = readFileSync('src/api/MemoryAPI.js', 'utf8');
    const declaration = source.match(/@typedef \{([^}]+)\} RerankStatus/)[1];
    expect(declaration.split('|').map(s => s.replaceAll("'", ''))).toEqual(statuses);
    const fields = [...source.matchAll(/@property .*? (rerank_\w+)/g)].map(match => match[1]);
    expect(fields.sort()).toEqual([...contract.required].sort());
  });

  it.each([[false, false], [false, true], [true, false], [true, true]])(
    'preserves all statuses, nulls and original order expertise=%s cite=%s',
    async (expertise, cite) => {
      const rows = statuses.map(status => evidence(status));
      const body = { results: expertise ? { semantic: rows } : rows, citations: [] };
      const transport = { post: vi.fn().mockResolvedValue(body) };
      const result = await new MemoryAPI(transport).search('Python', { expertise, cite });
      expect(result).toBe(body);
      const received = expertise ? result.results.semantic : result.results;
      expect(received.map(row => row.item_id)).toEqual(statuses);
      for (let i = 0; i < received.length; i++) {
        for (const field of contract.required) expect(received[i][field]).toEqual(rows[i][field]);
      }
    },
  );

  it.each([-11.4, 0, 6.5])('preserves raw score %s', async (score) => {
    const api = new MemoryAPI({ post: vi.fn().mockResolvedValue({ results: [evidence('scored', score)] }) });
    expect((await api.search('Python')).results[0].rerank_score).toBe(score);
  });
});
