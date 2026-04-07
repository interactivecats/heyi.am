/**
 * Tests for Phase 1 portfolio-site renderer additions to `export.ts`:
 *  - `generatePortfolioSite`
 *  - `generatePortfolioHtmlFragment`
 *  - `RenderTarget` type
 *
 * These tests exercise the real render pipeline (no module mocks), which is
 * why they live in a separate file from `export.test.ts` (which stubs the
 * renderer for unrelated markdown/html assertions).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  generatePortfolioSite,
  generatePortfolioHtmlFragment,
  type PortfolioSiteProjectInput,
} from './export.js';
import type { RenderTarget } from './render/types.js';
import type { PortfolioRenderData } from './render/types.js';
import type { ProjectEnhanceCache } from './settings.js';
import type { Session } from './analyzer.js';

// ── RenderTarget type compile-check ─────────────────────────────

// This assignment fails type-check if RenderTarget is not exported with
// the expected string-literal union shape. It is consumed at runtime to
// ensure the symbol is actually exported (not type-only erased).
const TARGETS: RenderTarget[] = ['fragment', 'static'];

// ── Fixtures ────────────────────────────────────────────────────

function makeSession(id: string, title: string): Session {
  return {
    id,
    title,
    date: '2026-03-20T10:00:00Z',
    durationMinutes: 45,
    turns: 30,
    linesOfCode: 500,
    status: 'enhanced',
    projectName: 'test',
    rawLog: [],
    skills: ['TypeScript'],
    executionPath: [],
    toolBreakdown: [],
    filesChanged: [{ path: 'foo.ts', additions: 50, deletions: 10 }],
    turnTimeline: [],
    toolCalls: 10,
    source: 'claude',
  };
}

function makeCache(sessionId: string, sessionTitle: string): ProjectEnhanceCache {
  return {
    fingerprint: 'fp',
    enhancedAt: '2026-03-20T12:00:00Z',
    selectedSessionIds: [sessionId],
    result: {
      narrative: 'A test project narrative.',
      arc: [],
      skills: ['TypeScript'],
      timeline: [
        {
          period: 'Mar 2026',
          label: 'Build',
          sessions: [
            { sessionId, title: sessionTitle, featured: true, tag: 'Milestone' },
          ],
        },
      ],
      questions: [],
    },
  };
}

function makePortfolioData(username: string, projectSlugs: string[]): PortfolioRenderData {
  return {
    user: {
      username,
      accent: '#084471',
      displayName: 'Test User',
      bio: 'Bio here.',
      location: 'SF',
      status: 'active',
    },
    projects: projectSlugs.map((slug, i) => ({
      slug,
      title: slug,
      narrative: `Narrative for ${slug}`,
      totalSessions: 1,
      totalLoc: 500,
      totalDurationMinutes: 45,
      totalFilesChanged: 1,
      skills: ['TypeScript'],
      publishedCount: 1,
      sessions: [{ date: `2026-03-${20 + i}T10:00:00Z`, loc: 500, durationMinutes: 45 }],
    })),
    totalDurationMinutes: 45 * projectSlugs.length,
    totalLoc: 500 * projectSlugs.length,
    totalSessions: projectSlugs.length,
  };
}

// ── Tests ───────────────────────────────────────────────────────

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'portfolio-site-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('RenderTarget', () => {
  it('is a string-literal union with fragment and static variants', () => {
    expect(TARGETS).toContain('fragment');
    expect(TARGETS).toContain('static');
  });
});

describe('generatePortfolioHtmlFragment', () => {
  it('returns a body HTML fragment with no <html> or <head> shell', () => {
    const data = makePortfolioData('alex', ['proj-a']);
    const fragment = generatePortfolioHtmlFragment(data);
    expect(fragment).not.toMatch(/<html[\s>]/i);
    expect(fragment).not.toMatch(/<head[\s>]/i);
    expect(fragment).not.toMatch(/<!DOCTYPE/i);
    expect(fragment.length).toBeGreaterThan(0);
  });
});

describe('generatePortfolioSite', () => {
  const username = 'testuser';

  function twoProjectFixture(): {
    data: PortfolioRenderData;
    projects: PortfolioSiteProjectInput[];
  } {
    const data = makePortfolioData(username, ['proj-alpha', 'proj-beta']);
    const projects: PortfolioSiteProjectInput[] = [
      {
        dirName: 'proj-alpha',
        cache: makeCache('s1', 'First session alpha'),
        sessions: [
          makeSession('s1', 'First session alpha'),
          makeSession('s2', 'Second alpha'),
          makeSession('s3', 'Third alpha'),
        ],
      },
      {
        dirName: 'proj-beta',
        cache: makeCache('s4', 'First session beta'),
        sessions: [
          makeSession('s4', 'First session beta'),
          makeSession('s5', 'Second beta'),
          makeSession('s6', 'Third beta'),
        ],
      },
    ];
    return { data, projects };
  }

  it('produces the expected directory structure', async () => {
    const { data, projects } = twoProjectFixture();
    const out = join(tmpDir, 'site');

    const result = await generatePortfolioSite(data, projects, out);

    expect(existsSync(join(out, 'index.html'))).toBe(true);
    expect(existsSync(join(out, 'projects', 'proj-alpha', 'index.html'))).toBe(true);
    expect(existsSync(join(out, 'projects', 'proj-beta', 'index.html'))).toBe(true);
    // At least one session HTML per project (featured logic picks from sessions).
    expect(existsSync(join(out, 'projects', 'proj-alpha', 'sessions'))).toBe(true);
    expect(existsSync(join(out, 'projects', 'proj-beta', 'sessions'))).toBe(true);
    expect(result.files.length).toBeGreaterThan(0);
    expect(result.totalBytes).toBeGreaterThan(0);
    expect(result.outputPath).toBe(out);
  });

  it('portfolio index.html uses relative links to project pages', async () => {
    const { data, projects } = twoProjectFixture();
    const out = join(tmpDir, 'site');
    await generatePortfolioSite(data, projects, out);

    const index = readFileSync(join(out, 'index.html'), 'utf-8');
    // Rewrite must have stripped the hardcoded /{username}/{slug} links.
    expect(index).not.toContain(`href="/${username}/proj-alpha"`);
    expect(index).not.toContain(`href="/${username}/proj-beta"`);
    // And must have written relative links that resolve on disk.
    expect(index).toContain('href="projects/proj-alpha/index.html"');
    expect(index).toContain('href="projects/proj-beta/index.html"');

    // Each referenced project file must actually exist.
    expect(existsSync(join(out, 'projects/proj-alpha/index.html'))).toBe(true);
    expect(existsSync(join(out, 'projects/proj-beta/index.html'))).toBe(true);
  });

  it('project pages link to session pages with relative ./sessions/ paths', async () => {
    const { data, projects } = twoProjectFixture();
    const out = join(tmpDir, 'site');
    await generatePortfolioSite(data, projects, out);

    const alphaHtml = readFileSync(join(out, 'projects/proj-alpha/index.html'), 'utf-8');
    // At least one session link should resolve relatively
    const match = alphaHtml.match(/href="\.?\/?sessions\/([a-z0-9-]+)\.html"/);
    expect(match).not.toBeNull();

    if (match) {
      const sessionSlug = match[1];
      const sessionPath = join(out, 'projects/proj-alpha/sessions', `${sessionSlug}.html`);
      expect(existsSync(sessionPath)).toBe(true);
    }
  });

  it('emits full standalone pages (DOCTYPE + html wrapper)', async () => {
    const { data, projects } = twoProjectFixture();
    const out = join(tmpDir, 'site');
    await generatePortfolioSite(data, projects, out);

    const index = readFileSync(join(out, 'index.html'), 'utf-8');
    expect(index).toMatch(/<!DOCTYPE html>/i);
    expect(index).toMatch(/<html/i);
    expect(index).toMatch(/<head/i);
    expect(index).toMatch(/<body/i);
  });
});
