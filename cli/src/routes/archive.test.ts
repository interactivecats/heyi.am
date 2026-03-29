import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

// Mock settings to return our temp archive dir
let archiveDir: string;

vi.mock('../settings.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../settings.js')>();
  return {
    ...actual,
    getArchiveDir: () => archiveDir,
    isArchiveEnabled: () => true,
  };
});

vi.mock('../source-audit.js', () => ({
  getSourceAudit: vi.fn().mockResolvedValue({
    sources: [
      { name: 'claude', health: 'healthy', archivedCount: 2, retentionRisk: null },
    ],
  }),
  getArchiveStats: vi.fn().mockResolvedValue({
    total: 2,
    oldest: '2026-03-01',
    sourcesCount: 1,
    lastSync: '2026-03-29',
  }),
}));

import { createArchiveRouter } from './archive.js';
import type { RouteContext } from './context.js';

let tmpDir: string;

function makeApp(): express.Express {
  const app = express();
  const ctx: RouteContext = {
    getProjects: vi.fn().mockResolvedValue([]),
    sessionsDir: tmpDir,
  } as unknown as RouteContext;
  app.use(createArchiveRouter(ctx));
  return app;
}

beforeAll(async () => {
  tmpDir = join(tmpdir(), `archive-route-test-${Date.now()}`);
  archiveDir = join(tmpDir, 'sessions');

  // Create archive dir with some test files
  const projectDir = join(archiveDir, '-Users-test-Dev-myapp');
  await mkdir(projectDir, { recursive: true });
  await writeFile(join(projectDir, 'session1.jsonl'), '{"type":"user"}\n');
  await writeFile(join(projectDir, 'session2.jsonl'), '{"type":"user"}\n');
});

afterAll(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe('GET /api/archive/export', () => {
  it('returns a tar.gz with correct headers', async () => {
    const app = makeApp();
    const res = await request(app)
      .get('/api/archive/export')
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/gzip');
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename="heyiam-archive-\d{4}-\d{2}-\d{2}\.tar\.gz"$/);

    // Verify it's a valid gzip (magic bytes: 1f 8b)
    const body = res.body as Buffer;
    expect(body[0]).toBe(0x1f);
    expect(body[1]).toBe(0x8b);
    expect(body.length).toBeGreaterThan(0);
  });

  it('contains the archived session files', async () => {
    const app = makeApp();
    const res = await request(app)
      .get('/api/archive/export')
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });

    // Write tar.gz to a temp file and list contents
    const tarPath = join(tmpDir, 'test-export.tar.gz');
    await writeFile(tarPath, res.body as Buffer);
    const listing = execFileSync('tar', ['-tzf', tarPath]).toString();

    expect(listing).toContain('-Users-test-Dev-myapp/session1.jsonl');
    expect(listing).toContain('-Users-test-Dev-myapp/session2.jsonl');
  });

  it('returns 404 when archive dir does not exist', async () => {
    // Point to a non-existent dir
    const originalDir = archiveDir;
    archiveDir = join(tmpDir, 'nonexistent');

    const app = makeApp();
    const res = await request(app).get('/api/archive/export');

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/no archive directory/i);

    archiveDir = originalDir;
  });

  it('includes today\'s date in the filename', async () => {
    const app = makeApp();
    const res = await request(app)
      .get('/api/archive/export')
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });

    const today = new Date().toISOString().slice(0, 10);
    expect(res.headers['content-disposition']).toContain(today);
  });
});

describe('GET /api/archive/verify', () => {
  it('returns verification results for existing archive', async () => {
    const app = makeApp();
    const res = await request(app).get('/api/archive/verify');

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.verified).toBe(2);
    expect(res.body.missing).toBe(0);
    expect(res.body.errors).toEqual([]);
  });

  it('returns zeros when archive dir does not exist', async () => {
    const originalDir = archiveDir;
    archiveDir = join(tmpDir, 'nonexistent');

    const app = makeApp();
    const res = await request(app).get('/api/archive/verify');

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
    expect(res.body.verified).toBe(0);

    archiveDir = originalDir;
  });
});
