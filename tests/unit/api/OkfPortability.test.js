import { describe, expect, it, vi } from 'vitest';
import { SmartMemoryClient } from '../../../src/api/SmartMemoryClient.js';

const BASE_URL = 'http://localhost:9001';
const ARCHIVE = new Uint8Array([0x1f, 0x8b, 0x4f, 0x4b, 0x46]);

function clientWith(fetchFn) {
  const client = new SmartMemoryClient({
    mode: 'apiKey',
    apiKey: 'test-token',
    apiBaseUrl: BASE_URL,
    storage: 'memory',
    fetchFn
  });
  client.setTeamId('workspace-1');
  return client;
}

function readAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

describe('OKF portability', () => {
  it('exports archive bytes with workspace auth', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: () => Promise.resolve(ARCHIVE.buffer)
    });
    const client = clientWith(fetchFn);

    await expect(client.exportOkf()).resolves.toEqual(ARCHIVE.buffer);
    expect(fetchFn).toHaveBeenCalledWith(
      `${BASE_URL}/memory/okf/export`,
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
          'X-Workspace-Id': 'workspace-1'
        })
      })
    );
  });

  it('imports archive bytes as multipart with workspace auth', async () => {
    const result = { imported: 3, failed: 1, workspace_id: 'workspace-1' };
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(result)
    });
    const client = clientWith(fetchFn);

    await expect(client.importOkf(ARCHIVE)).resolves.toEqual(result);

    const [url, request] = fetchFn.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/memory/okf/import`);
    expect(request.method).toBe('POST');
    expect(request.headers).toEqual(expect.objectContaining({
      Authorization: 'Bearer test-token',
      'X-Workspace-Id': 'workspace-1'
    }));
    expect(request.headers).not.toHaveProperty('Content-Type');
    expect(request.body).toBeInstanceOf(FormData);

    const uploaded = request.body.get('file');
    expect(uploaded.name).toBe('smartmemory-okf-import.tar.gz');
    await expect(readAsArrayBuffer(uploaded)).resolves.toEqual(ARCHIVE.buffer);
  });

  it('exports without vectors when asked (BUG-OKF-IMPORT-SLOW-1)', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: () => Promise.resolve(ARCHIVE.buffer)
    });
    const client = clientWith(fetchFn);

    await client.exportOkf({ vectors: false });
    expect(fetchFn.mock.calls[0][0]).toBe(`${BASE_URL}/memory/okf/export?vectors=false`);
  });

  it('starts a background import and reads its job (BUG-OKF-IMPORT-SLOW-1)', async () => {
    const started = { run_id: 'okf-import-1', status: 'queued', total: 240, deadline_at: 1 };
    const state = { run_id: 'okf-import-1', status: 'running', done: 30, total: 240 };
    const fetchFn = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 202, json: () => Promise.resolve(started) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(state) });
    const client = clientWith(fetchFn);

    await expect(client.importOkf(ARCHIVE, { background: true })).resolves.toEqual(started);
    expect(fetchFn.mock.calls[0][0]).toBe(`${BASE_URL}/memory/okf/import?background=true`);
    await expect(client.okfImportJob('okf-import-1')).resolves.toEqual(state);
    const [url, request] = fetchFn.mock.calls[1];
    expect(url).toBe(`${BASE_URL}/memory/okf/jobs/okf-import-1`);
    expect(request.method).toBe('GET');
    expect(request.headers).toEqual(expect.objectContaining({ 'X-Workspace-Id': 'workspace-1' }));
  });
});
