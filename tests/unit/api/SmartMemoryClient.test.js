import { describe, it, expect } from 'vitest';
import { SmartMemoryClient } from '../../../src/api/SmartMemoryClient.js';

describe('SmartMemoryClient', () => {
  it('should expose auth and all domain APIs', () => {
    const client = new SmartMemoryClient({
      mode: 'custom',
      apiBaseUrl: 'http://localhost:9001',
      endpoints: { login: '/auth/login', refresh: '/auth/refresh' },
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
