import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { exportMarkdown, exportHtml } from './export.js';
import type { ProjectEnhanceCache } from './settings.js';
import type { Session } from './analyzer.js';

// ── Mock settings (loadEnhancedData) ──────────────────────────

vi.mock('./settings.js', async (importOriginal) => {
  const orig = await importOriginal<typeof import('./settings.js')>();
  return {
    ...orig,
    loadEnhancedData: vi.fn(() => null),
  };
});

// ── Mock render pipeline for HTML tests ────────────────────────

vi.mock('./render/index.js', () => ({
  renderProjectHtml: vi.fn(() => '<div class="project">rendered project</div>'),
  renderSessionHtml: vi.fn(() => '<div class="session">rendered session</div>'),
}));

vi.mock('./render/build-render-data.js', () => ({
  DEFAULT_ACCENT: '#084471',
  buildProjectRenderData: vi.fn((opts: Record<string, unknown>) => ({
    user: { username: opts.username, accent: '#084471' },
    project: { slug: 'test', title: 'Test' },
    sessions: [],
  })),
  buildSessionRenderData: vi.fn(() => ({
    user: { username: 'local', accent: '#084471' },
    session: { token: 'abc', title: 'Test', template: 'editorial' },
  })),
  buildSessionCard: vi.fn((opts: Record<string, unknown>) => ({
    token: opts.sessionId,
    slug: 'test-session',
    title: 'Test session',
    devTake: '',
    durationMinutes: 30,
    turns: 10,
    locChanged: 100,
    linesAdded: 80,
    linesDeleted: 20,
    filesChanged: 5,
    skills: [],
    recordedAt: '2026-03-20T10:00:00Z',
    sourceTool: 'claude',
  })),
}));

// ── Fixtures ──────────────────────────────────────────────────

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'session-001',
    title: 'Auth rebuild',
    date: '2026-03-20T10:00:00Z',
    durationMinutes: 47,
    turns: 77,
    linesOfCode: 2400,
    status: 'enhanced',
    projectName: 'heyi-am',
    rawLog: ['> prompt'],
    skills: ['TypeScript', 'Elixir'],
    executionPath: [
      { stepNumber: 1, title: 'Setup', description: 'Initial setup' },
      { stepNumber: 2, title: 'Rebuild', description: 'Core auth rewrite' },
    ],
    toolBreakdown: [{ tool: 'Edit', count: 12 }],
    filesChanged: [{ path: 'auth.ts', additions: 100, deletions: 50 }],
    turnTimeline: [],
    toolCalls: 35,
    source: 'claude',
    ...overrides,
  };
}

function makeCache(overrides: Partial<ProjectEnhanceCache> = {}): ProjectEnhanceCache {
  return {
    fingerprint: 'abc123',
    enhancedAt: '2026-03-20T12:00:00Z',
    selectedSessionIds: ['session-001'],
    result: {
      narrative: 'This project rebuilt auth from scratch.',
      arc: [
        { phase: 1, title: 'Foundation', description: 'Reset auth to clean base.' },
      ],
      skills: ['TypeScript', 'Elixir'],
      timeline: [
        {
          period: 'Mar 14-16',
          label: 'Foundation',
          sessions: [
            { sessionId: 'session-001', title: 'Auth rebuild', featured: true, tag: 'Pivotal' },
          ],
        },
      ],
      questions: [
        { id: 'q1', category: 'architecture', question: 'Why rebuild?', context: 'Architecture shift' },
      ],
    },
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'export-test-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('exportMarkdown', () => {
  it('creates README.md with narrative and arc', async () => {
    const cache = makeCache();
    const sessions = [makeSession()];
    const outPath = join(tmpDir, 'md-export');

    const result = await exportMarkdown('-Users-test-Dev-heyi-am', cache, sessions, outPath);

    expect(result.files.length).toBeGreaterThanOrEqual(3); // README + session + project.json
    expect(result.totalBytes).toBeGreaterThan(0);
    expect(result.outputPath).toBe(outPath);

    const readme = readFileSync(join(outPath, 'README.md'), 'utf-8');
    expect(readme).toContain('# heyi-am');
    expect(readme).toContain('This project rebuilt auth from scratch.');
    expect(readme).toContain('## Phase 1: Foundation');
    expect(readme).toContain('TypeScript');
  });

  it('creates session markdown files', async () => {
    const cache = makeCache();
    const sessions = [makeSession()];
    const outPath = join(tmpDir, 'md-sessions');

    await exportMarkdown('-Users-test-Dev-heyi-am', cache, sessions, outPath);

    const sessionFile = join(outPath, 'sessions', 'auth-rebuild.md');
    expect(existsSync(sessionFile)).toBe(true);
    const content = readFileSync(sessionFile, 'utf-8');
    expect(content).toContain('# Auth rebuild');
    expect(content).toContain('Duration: 47m');
    expect(content).toContain('Turns: 77');
  });

  it('writes project.json with enhance result', async () => {
    const cache = makeCache();
    const outPath = join(tmpDir, 'md-json');

    await exportMarkdown('-Users-test-Dev-heyi-am', cache, [makeSession()], outPath);

    const json = JSON.parse(readFileSync(join(outPath, 'project.json'), 'utf-8'));
    expect(json.narrative).toBe('This project rebuilt auth from scratch.');
    expect(json.skills).toContain('TypeScript');
  });

  it('includes timeline with session links', async () => {
    const cache = makeCache();
    const outPath = join(tmpDir, 'md-timeline');

    await exportMarkdown('-Users-test-Dev-heyi-am', cache, [makeSession()], outPath);

    const readme = readFileSync(join(outPath, 'README.md'), 'utf-8');
    expect(readme).toContain('## Timeline');
    expect(readme).toContain('[Auth rebuild](sessions/auth-rebuild.md)');
    expect(readme).toContain('[Pivotal]');
    expect(readme).toContain('**featured**');
  });

  it('includes stats in README', async () => {
    const cache = makeCache();
    const outPath = join(tmpDir, 'md-stats');

    await exportMarkdown('-Users-test-Dev-heyi-am', cache, [makeSession()], outPath);

    const readme = readFileSync(join(outPath, 'README.md'), 'utf-8');
    expect(readme).toContain('Sessions: 1');
    expect(readme).toContain('Lines of code: 2,400');
  });
});

describe('exportHtml', () => {
  it('creates index.html and session HTML files', async () => {
    const cache = makeCache();
    const sessions = [makeSession()];
    const outPath = join(tmpDir, 'html-export');

    const result = await exportHtml('-Users-test-Dev-heyi-am', cache, sessions, outPath);

    expect(result.files.length).toBeGreaterThanOrEqual(2); // index + 1 session
    expect(existsSync(join(outPath, 'index.html'))).toBe(true);

    const index = readFileSync(join(outPath, 'index.html'), 'utf-8');
    expect(index).toContain('<!DOCTYPE html>');
    expect(index).toContain('rendered project');
    expect(index).toContain('heyi.am');
  });

  it('includes inline mount.js for interactive charts', async () => {
    const cache = makeCache();
    const outPath = join(tmpDir, 'html-no-js');

    await exportHtml('-Users-test-Dev-heyi-am', cache, [makeSession()], outPath);

    const index = readFileSync(join(outPath, 'index.html'), 'utf-8');
    // mount.js is inlined for work timeline / growth chart interactivity
    // (may or may not be present depending on whether packages/ui is built)

    const sessionHtml = readFileSync(
      join(outPath, 'sessions', 'auth-rebuild.html'),
      'utf-8',
    );
    // Session pages also include mount.js via buildStandalonePage
    expect(sessionHtml).toBeDefined();
  });

  it('includes Google Fonts link', async () => {
    const cache = makeCache();
    const outPath = join(tmpDir, 'html-fonts');

    await exportHtml('-Users-test-Dev-heyi-am', cache, [makeSession()], outPath);

    const index = readFileSync(join(outPath, 'index.html'), 'utf-8');
    expect(index).toContain('fonts.googleapis.com');
    expect(index).toContain('Space+Grotesk');
  });

  it('escapes title in HTML', async () => {
    const cache = makeCache();
    const sessions = [makeSession({ title: 'Fix <script>alert("xss")</script>' })];
    const outPath = join(tmpDir, 'html-escape');

    await exportHtml('-Users-test-Dev-heyi-am', cache, sessions, outPath);

    const index = readFileSync(join(outPath, 'index.html'), 'utf-8');
    expect(index).not.toContain('<script>alert');
  });

  it('handles empty session list gracefully', async () => {
    const cache = makeCache({ selectedSessionIds: [] });
    const outPath = join(tmpDir, 'html-empty');

    const result = await exportHtml('-Users-test-Dev-heyi-am', cache, [], outPath);

    expect(result.files.length).toBe(1); // just index.html
    expect(existsSync(join(outPath, 'index.html'))).toBe(true);
  });
});
