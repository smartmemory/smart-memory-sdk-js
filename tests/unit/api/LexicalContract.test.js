import { it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { MemoryAPI } from '../../../src/api/MemoryAPI.js';

const contract = JSON.parse(readFileSync('../smart-memory-docs/docs/features/CORE-LEXICAL-INDEX-1/lexical-contract.json', 'utf8'));

it.each(['omitted', 'empty', 'zero', 'accepted', 'contains', 'keyword-bm25', 'unknown', 'validation', 'unavailable'])('search follows lexical contract: %s', async (scenario) => {
  const transport = { post: vi.fn().mockResolvedValue({ results: [] }) };
  const api = new MemoryAPI(transport);
  const options = {};
  if (['empty', 'zero', 'accepted', 'contains', 'keyword-bm25', 'unknown'].includes(scenario)) {
    options.channelWeights = scenario === 'empty' ? {} : scenario === 'zero' ? { lexical: 0 } : scenario === 'accepted' ? Object.fromEntries(contract.channels.accepted.map(key => [key, 0.8])) : { [scenario]: 0 };
  }
  if (contract.channels.removed.includes(scenario) || scenario === 'unknown') {
    const message = scenario === 'unknown' ? 'Unknown search channel' : contract.errors.validation.removed_channel_message.replace('{channel}', scenario);
    await expect(api.search('quartz', options)).rejects.toThrow(message);
    expect(transport.post).not.toHaveBeenCalled();
  } else if (['validation', 'unavailable'].includes(scenario)) {
    const failure = Object.assign(new Error(scenario === 'validation' ? contract.errors.validation.unmatched_quote_message : 'LexicalIndexUnavailableError: sm rebuild --lexical'), { status: scenario === 'validation' ? 400 : 503 });
    transport.post.mockRejectedValue(failure);
    await expect(api.search('quartz', options)).rejects.toBe(failure);
  } else {
    await expect(api.search('quartz', options)).resolves.toEqual({ results: [] });
    const body = transport.post.mock.calls[0][1];
    if (scenario === 'omitted') expect(body).not.toHaveProperty('channel_weights');
    else expect(body.channel_weights).toEqual(options.channelWeights);
  }
});
