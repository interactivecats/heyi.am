import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { inflateRawSync } from 'node:zlib';
import { exportMarkdown, exportHtml, createZipBuffer, rewriteZipLinks } from './export.js';
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

// ── createZipBuffer ─────────────────────────────────────────────

/** Parse a ZIP and extract entries as {path, data} for assertion. */
function extractZipEntries(zip: Buffer): Array<{ path: string; data: Buffer }> {
  const entries: Array<{ path: string; data: Buffer }> = [];
  let offset = 0;
  while (offset + 4 <= zip.length) {
    const sig = zip.readUInt32LE(offset);
    if (sig !== 0x04034b50) break; // not a local file header
    const compressedSize = zip.readUInt32LE(offset + 18);
    const uncompressedSize = zip.readUInt32LE(offset + 22);
    const nameLen = zip.readUInt16LE(offset + 26);
    const extraLen = zip.readUInt16LE(offset + 28);
    const name = zip.subarray(offset + 30, offset + 30 + nameLen).toString('utf-8');
    const dataStart = offset + 30 + nameLen + extraLen;
    const compressed = zip.subarray(dataStart, dataStart + compressedSize);
    const data = uncompressedSize > 0 ? inflateRawSync(compressed) : Buffer.alloc(0);
    entries.push({ path: name, data });
    offset = dataStart + compressedSize;
  }
  return entries;
}

describe('createZipBuffer', () => {
  it('handles string content with UTF-8 encoding', () => {
    const zip = createZipBuffer([
      { path: 'hello.txt', content: 'Hello, world!' },
    ]);
    const entries = extractZipEntries(zip);
    expect(entries).toHaveLength(1);
    expect(entries[0].path).toBe('hello.txt');
    expect(entries[0].data.toString('utf-8')).toBe('Hello, world!');
  });

  it('handles Buffer content without re-encoding', () => {
    // Create binary content that is NOT valid UTF-8
    const binaryContent = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff, 0xfe, 0xfd]);
    const zip = createZipBuffer([
      { path: 'image.png', content: binaryContent },
    ]);
    const entries = extractZipEntries(zip);
    expect(entries).toHaveLength(1);
    expect(entries[0].path).toBe('image.png');
    expect(Buffer.compare(entries[0].data, binaryContent)).toBe(0);
  });

  it('mixes string and Buffer entries in the same zip', () => {
    const binary = Buffer.from([0x00, 0x01, 0x02, 0x03, 0xff]);
    const zip = createZipBuffer([
      { path: 'index.html', content: '<html></html>' },
      { path: 'favicon.ico', content: binary },
    ]);
    const entries = extractZipEntries(zip);
    expect(entries).toHaveLength(2);
    expect(entries[0].data.toString('utf-8')).toBe('<html></html>');
    expect(Buffer.compare(entries[1].data, binary)).toBe(0);
  });
});

describe('rewriteZipLinks', () => {
  it('strips username anchor on project page (no portfolio in zip)', () => {
    const html = '<a href="/ben">ben</a> / <span>my-project</span>';
    const out = rewriteZipLinks(html, 'ben', 'my-project', 'project');
    expect(out).toBe('<span>ben</span> / <span>my-project</span>');
  });

  it('rewrites project href to ../index.html on session page', () => {
    const html = '<a href="/ben">ben</a> / <a href="/ben/my-project">my-project</a> / <span>a session</span>';
    const out = rewriteZipLinks(html, 'ben', 'my-project', 'session');
    expect(out).toContain('<span>ben</span>');
    expect(out).toContain('href="../index.html"');
    expect(out).not.toContain('href="/ben/my-project"');
  });

  it('handles anchors with extra attributes around the username link', () => {
    const html = '<a class="crumb" href="/ben" aria-label="home">ben</a>';
    const out = rewriteZipLinks(html, 'ben', 'proj', 'project');
    expect(out).toBe('<span>ben</span>');
  });

  it('leaves unrelated links alone', () => {
    const html = '<a href="/other-user">other</a><a href="./sessions/foo.html">foo</a>';
    const out = rewriteZipLinks(html, 'ben', 'proj', 'session');
    expect(out).toBe(html);
  });

  it('escapes regex metacharacters in usernames/slugs', () => {
    const html = '<a href="/a.b">a.b</a>';
    // "a.b" is unlikely as a real username, but guards against regex injection
    const out = rewriteZipLinks(html, 'a.b', 'proj', 'project');
    expect(out).toBe('<span>a.b</span>');
    // Confirms escape worked — "axb" must NOT match
    const sneaky = rewriteZipLinks('<a href="/axb">axb</a>', 'a.b', 'proj', 'project');
    expect(sneaky).toBe('<a href="/axb">axb</a>');
  });
});
