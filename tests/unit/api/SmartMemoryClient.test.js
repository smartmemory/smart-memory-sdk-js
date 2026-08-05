import { describe, it, expect } from 'vitest';
import { SmartMemoryClient } from '../../../src/api/SmartMemoryClient.js';

describe('SmartMemoryClient', () => {
  it('should expose auth and all domain APIs', () => {
    const client = new SmartMemoryClient({
      mode: 'sso',
      apiBaseUrl: 'http://localhost:9001',
      webAppUrl: 'http://localhost:5173',
      endpoints: { refresh: '/auth/refresh' },
      storage: 'memory'
    });

    expect(client.auth).toBeDefined();
    expect(client.auth.isAuthenticated()).toBe(false);
    expect(client.memories).toBeDefined();
    expect(client.decisions).toBeDefined();
    expect(client.graph).toBeDefined();
    expect(client.teams).toBeDefined();
    expect(client.profiles).toBeDefined();
    expect(client.subscriptions).toBeDefined();
    expect(client.authAPI).toBeDefined();
    expect(client.agents).toBeDefined();
    expect(client.usage).toBeDefined();
    expect(client.insights).toBeDefined();
    expect(client.tokenUsage).toBeDefined();
    expect(client.temporal).toBeDefined();
    expect(client.governance).toBeDefined();
    expect(client.evolution).toBeDefined();
    expect(client.reasoning).toBeDefined();
    expect(client.reasoningTraces).toBeDefined();
    expect(client.ontology).toBeDefined();
    expect(client.analytics).toBeDefined();
    expect(client.validation).toBeDefined();
    expect(client.pipeline).toBeDefined();
    expect(client.archive).toBeDefined();
    expect(client.zettelkasten).toBeDefined();
    expect(client.procedureMatches).toBeDefined();
    expect(client.procedureCandidates).toBeDefined();
    expect(client.procedureDrift).toBeDefined();
    expect(client.locks).toBeDefined();
  });

  it('should work in SSO mode', () => {
    const client = new SmartMemoryClient({
      mode: 'sso',
      apiBaseUrl: 'http://localhost:9001',
      webAppUrl: 'http://localhost:5173',
      endpoints: { refresh: '/auth/refresh' },
      storage: 'memory'
    });

    expect(client.auth.mode).toBe('sso');
    const url = client.auth.getLoginUrl('http://localhost:9002/auth/callback');
    expect(url).toContain('localhost:5173/login');
  });
});
