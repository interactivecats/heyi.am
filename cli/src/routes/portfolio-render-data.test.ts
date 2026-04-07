import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

vi.mock('../db.js', () => ({
  getSessionsByProject: vi.fn(() => [
    { start_time: '2026-01-01', loc_added: 10, loc_removed: 2, duration_minutes: 15, is_subagent: 0 },
    { start_time: '2026-01-02', loc_added: 5, loc_removed: 0, duration_minutes: 10, is_subagent: 1 },
  ]),
}));

vi.mock('../sync.js', () => ({
  displayNameFromDir: (d: string) => d,
}));

import { buildPortfolioRenderData, applyPortfolioProjectFilter } from './portfolio-render-data.js';
import type { RouteContext } from './context.js';

let configDir: string;
const originalDataDir = process.env.HEYIAM_DATA_DIR;

describe('buildPortfolioRenderData', () => {
  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), 'heyiam-prd-helper-'));
    process.env.HEYIAM_DATA_DIR = configDir;
    process.env.HEYIAM_CONFIG_DIR = configDir;
  });

  afterEach(() => {
    rmSync(configDir, { recursive: true, force: true });
    if (originalDataDir) process.env.HEYIAM_DATA_DIR = originalDataDir;
    else delete process.env.HEYIAM_DATA_DIR;
    delete process.env.HEYIAM_CONFIG_DIR;
  });

  it('assembles per-project totals and filters out subagent sessions', async () => {
    const ctx = {
      db: {} as RouteContext['db'],
      getProjects: vi.fn().mockResolvedValue([
        { dirName: 'proj-a', name: 'Proj A', sessionCount: 2, sessions: [] },
      ]),
      getProjectWithStats: vi.fn().mockResolvedValue({
        name: 'Proj A',
        totalDuration: 25,
        totalAgentDuration: 30,
        totalLoc: 17,
        sessionCount: 2,
        totalFiles: 4,
        skills: ['typescript'],
      }),
    } as unknown as RouteContext;

    const { renderData, projectCaches } = await buildPortfolioRenderData(ctx, { username: 'ada' });

    expect(renderData.user.username).toBe('ada');
    expect(renderData.projects).toHaveLength(1);
    const p = renderData.projects[0];
    expect(p.title).toBe('Proj A');
    expect(p.totalSessions).toBe(2);
    expect(p.totalLoc).toBe(17);
    expect(p.totalFilesChanged).toBe(4);
    // Only non-subagent session makes it into the activity list.
    expect(p.sessions).toHaveLength(1);
    expect(p.sessions![0].loc).toBe(12);

    expect(renderData.totalDurationMinutes).toBe(25);
    expect(renderData.totalLoc).toBe(17);
    expect(renderData.totalSessions).toBe(2);

    expect(projectCaches.has('proj-a')).toBe(true);
  });

  describe('applyPortfolioProjectFilter', () => {
    const a = { dirName: 'a' };
    const b = { dirName: 'b' };
    const c = { dirName: 'c' };
    const d = { dirName: 'd' };

    it('returns projects untouched when curated list is undefined', () => {
      expect(applyPortfolioProjectFilter([a, b, c], undefined)).toEqual([a, b, c]);
    });

    it('returns projects untouched when curated list is empty', () => {
      expect(applyPortfolioProjectFilter([a, b, c], [])).toEqual([a, b, c]);
    });

    it('drops projects marked included=false', () => {
      const result = applyPortfolioProjectFilter([a, b, c], [
        { projectId: 'a', included: true, order: 0 },
        { projectId: 'b', included: false, order: 1 },
        { projectId: 'c', included: true, order: 2 },
      ]);
      expect(result.map((p) => p.dirName)).toEqual(['a', 'c']);
    });

    it('respects the curated order field', () => {
      const result = applyPortfolioProjectFilter([a, b, c], [
        { projectId: 'a', included: true, order: 2 },
        { projectId: 'b', included: true, order: 0 },
        { projectId: 'c', included: true, order: 1 },
      ]);
      expect(result.map((p) => p.dirName)).toEqual(['b', 'c', 'a']);
    });

    it('appends projects missing from the curated list at the end', () => {
      const result = applyPortfolioProjectFilter([a, b, c, d], [
        { projectId: 'b', included: true, order: 0 },
        { projectId: 'a', included: true, order: 1 },
      ]);
      // a, b match the curated order; c, d are appended at the end.
      expect(result.map((p) => p.dirName)).toEqual(['b', 'a', 'c', 'd']);
    });

    it('applies all three behaviors at once: filter + reorder + append', () => {
      const result = applyPortfolioProjectFilter([a, b, c, d], [
        { projectId: 'c', included: true, order: 0 },
        { projectId: 'a', included: false, order: 1 },
        { projectId: 'b', included: true, order: 2 },
      ]);
      // c first, b second (a excluded), d appended.
      expect(result.map((p) => p.dirName)).toEqual(['c', 'b', 'd']);
    });
  });

  it('skips projects whose stats call throws', async () => {
    const ctx = {
      db: {} as RouteContext['db'],
      getProjects: vi.fn().mockResolvedValue([
        { dirName: 'good', name: 'Good', sessionCount: 1, sessions: [] },
        { dirName: 'bad', name: 'Bad', sessionCount: 1, sessions: [] },
      ]),
      getProjectWithStats: vi.fn()
        .mockResolvedValueOnce({ name: 'Good', totalDuration: 1, totalLoc: 1, sessionCount: 1 })
        .mockRejectedValueOnce(new Error('boom')),
    } as unknown as RouteContext;

    const { renderData } = await buildPortfolioRenderData(ctx, { username: 'ada' });
    expect(renderData.projects).toHaveLength(1);
    expect(renderData.projects[0].title).toBe('Good');
  });
});
