// @vitest-environment node
import { createServer } from 'node:http';
import { once } from 'node:events';
import { expect, it } from 'vitest';
import { AuthCore } from '../../../src/auth/AuthCore.js';
import { BaseAPI } from '../../../src/api/BaseAPI.js';
import { MemoryAPI } from '../../../src/api/MemoryAPI.js';
import { PipelineAPI } from '../../../src/api/PipelineAPI.js';
import { APIError } from '../../../src/errors/APIError.js';

// Each route shares the real submit -> BaseAPI -> recovery -> HTTP path.
const cases = [
  ['save workspace', 'save', 503, a => a.tokenManager.setWorkspaceId('test_retry_B')],
  ['stage workspace', 'stage', 503, a => a.tokenManager.setWorkspaceId('test_retry_B')],
  ['save tenant', 'save', 503, a => a.tokenManager.setTenantId('test_retry_other')],
  ['stage principal', 'stage', 503, a => { a.currentUser = { id: 'other' }; }],
  ['save logout', 'save', 503, a => { a.sessionRevision++; }],
  ['stage credential', 'stage', 503, a => { a.currentToken = 'other-key'; }],
  ['save 401 workspace', 'save', 401, a => a.tokenManager.setWorkspaceId('test_retry_B')],
];
it.each(cases)('%s aborts before replay', async (_name, route, status, change) => {
  localStorage.clear();
  const auth = new AuthCore({ apiBaseUrl: 'http://127.0.0.1:19085', apiKey: 'test_retry_key' });
  auth.tokenManager.setWorkspaceId('test_retry_A');
  const requests = [];
  const server = createServer(async (req, res) => {
    let body = '';
    for await (const part of req) body += part;
    requests.push({ workspace: req.headers['x-workspace-id'], body: JSON.parse(body) });
    if (requests.length === 1) change(auth);
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end('{}');
  });
  server.listen(19085, '127.0.0.1');
  await once(server, 'listening');
  try {
    const base = new BaseAPI(auth);
    const result = route === 'save'
      ? new MemoryAPI(base).ingest('test_retry note', { idempotencyKey: 'test_retry_key' })
      : new PipelineAPI(base)._stage('classify', { content: 'test_retry note', idempotencyKey: 'test_retry_key' });
    const error = await result.catch(e => e);
    expect(requests).toHaveLength(1);
    expect(requests[0].workspace).toBe('test_retry_A');
    expect(requests[0].body.idempotency_key).toBe('test_retry_key');
    expect(error).toBeInstanceOf(APIError);
    expect(error.name).toBe('SubmitScopeChangedError');
    expect(error.code).toBe('submit_scope_changed');
    expect(error.idempotencyKey).toBe('test_retry_key');
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    localStorage.clear();
  }
});
