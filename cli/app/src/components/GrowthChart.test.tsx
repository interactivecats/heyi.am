/**
 * Unit tests: GrowthChart component and its helper functions
 *
 * Tests the cumulative LOC area chart used in the ProjectPreview overlay,
 * including intra-session time series, gap compression, smooth path generation,
 * axis tick computation, formatting helpers, and edge cases.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Session, TurnEvent } from '../types';
import {
  GrowthChart,
  formatLocAxis,
  formatLocDelta,
  computeAxisTicks,
  buildGrowthTimeSeries,
  buildSmoothPath,
} from './ProjectUploadFlow';

// ---------------------------------------------------------------------------
// Test data helpers
// ---------------------------------------------------------------------------

/** Create a minimal Session with sensible defaults */
function makeSession(overrides: Partial<Session> & { title: string; date: string; linesOfCode: number }): Session {
  return {
    id: overrides.id ?? overrides.title.toLowerCase().replace(/\s+/g, '-'),
    title: overrides.title,
    date: overrides.date,
    durationMinutes: overrides.durationMinutes ?? 30,
    turns: overrides.turns ?? 10,
    linesOfCode: overrides.linesOfCode,
    status: overrides.status ?? 'draft',
    projectName: overrides.projectName ?? 'test-project',
    rawLog: overrides.rawLog ?? [],
    turnTimeline: overrides.turnTimeline,
    endTime: overrides.endTime,
    ...overrides,
  };
}

/** Create turn events at regular intervals within a time window */
function makeTurnTimeline(
  startIso: string,
  count: number,
  intervalMinutes: number = 3,
  options?: { editTools?: boolean },
): TurnEvent[] {
  const start = new Date(startIso).getTime();
  const events: TurnEvent[] = [];
  for (let i = 0; i < count; i++) {
    const time = new Date(start + i * intervalMinutes * 60 * 1000).toISOString();
    events.push({
      timestamp: time,
      type: 'tool',
      content: `action ${i}`,
      tools: options?.editTools !== false ? ['Edit', 'Read'] : ['Read'],
    });
  }
  return events;
}

// ---------------------------------------------------------------------------
// Helper function tests
// ---------------------------------------------------------------------------

describe('formatLocAxis', () => {
  it('returns "0" for zero', () => {
    expect(formatLocAxis(0)).toBe('0');
  });

  it('returns raw number below 1000', () => {
    expect(formatLocAxis(500)).toBe('500');
  });

  it('formats thousands with k suffix', () => {
    expect(formatLocAxis(2000)).toBe('2k');
    expect(formatLocAxis(5000)).toBe('5k');
  });

  it('formats non-round thousands with one decimal', () => {
    expect(formatLocAxis(2500)).toBe('2.5k');
    expect(formatLocAxis(1200)).toBe('1.2k');
  });
});

describe('formatLocDelta', () => {
  it('formats small values with plus sign', () => {
    expect(formatLocDelta(890)).toBe('+890');
    expect(formatLocDelta(50)).toBe('+50');
  });

  it('formats thousands with k suffix and one decimal', () => {
    expect(formatLocDelta(2400)).toBe('+2.4k');
    expect(formatLocDelta(1000)).toBe('+1.0k');
  });

  it('formats large values without decimal', () => {
    expect(formatLocDelta(12000)).toBe('+12k');
  });
});

describe('computeAxisTicks', () => {
  it('returns [0] for zero or negative max', () => {
    expect(computeAxisTicks(0)).toEqual([0]);
    expect(computeAxisTicks(-5)).toEqual([0]);
  });

  it('produces ticks that cover the max value', () => {
    const ticks = computeAxisTicks(8000);
    expect(ticks[0]).toBe(0);
    expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(8000);
  });

  it('produces evenly spaced ticks', () => {
    const ticks = computeAxisTicks(5000);
    const steps = ticks.slice(1).map((t, i) => t - ticks[i]);
    const uniqueSteps = [...new Set(steps)];
    expect(uniqueSteps.length).toBe(1);
  });

  it('handles small values', () => {
    const ticks = computeAxisTicks(10);
    expect(ticks[0]).toBe(0);
    expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(10);
    expect(ticks.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// buildSmoothPath tests
// ---------------------------------------------------------------------------

describe('buildSmoothPath', () => {
  it('returns empty string for empty array', () => {
    expect(buildSmoothPath([])).toBe('');
  });

  it('returns M command for single point', () => {
    const path = buildSmoothPath([{ x: 10, y: 20 }]);
    expect(path).toBe('M10.0,20.0');
  });

  it('returns M + L for two points', () => {
    const path = buildSmoothPath([{ x: 10, y: 20 }, { x: 30, y: 40 }]);
    expect(path).toContain('M10.0,20.0');
    expect(path).toContain('L30.0,40.0');
  });

  it('uses cubic bezier C commands for 3+ points', () => {
    const path = buildSmoothPath([
      { x: 0, y: 100 },
      { x: 50, y: 80 },
      { x: 100, y: 20 },
    ]);
    expect(path).toContain('C');
    expect(path.startsWith('M')).toBe(true);
  });

  it('produces valid numeric coordinates', () => {
    const path = buildSmoothPath([
      { x: 0, y: 100 },
      { x: 50, y: 80 },
      { x: 100, y: 20 },
      { x: 150, y: 10 },
    ]);
    // Should not contain NaN or undefined
    expect(path).not.toContain('NaN');
    expect(path).not.toContain('undefined');
  });
});

// ---------------------------------------------------------------------------
// buildGrowthTimeSeries tests
// ---------------------------------------------------------------------------

describe('buildGrowthTimeSeries', () => {
  it('returns empty for no sessions', () => {
    const { points, boundaries } = buildGrowthTimeSeries([]);
    expect(points).toEqual([]);
    expect(boundaries).toEqual([]);
  });

  it('returns empty for sessions without dates', () => {
    const { points } = buildGrowthTimeSeries([
      makeSession({ title: 'No date', date: '', linesOfCode: 100 }),
    ]);
    expect(points).toEqual([]);
  });

  it('creates points from turnTimeline edit turns', () => {
    const timeline = makeTurnTimeline('2026-03-01T10:00:00Z', 6, 5);
    const session = makeSession({
      title: 'Session A',
      date: '2026-03-01T10:00:00Z',
      endTime: '2026-03-01T10:30:00Z',
      durationMinutes: 30,
      linesOfCode: 600,
      turnTimeline: timeline,
    });

    const { points, boundaries } = buildGrowthTimeSeries([session]);
    // Should have the start point + bucketed points
    expect(points.length).toBeGreaterThanOrEqual(2);
    // All points belong to session 0
    expect(points.every((p) => p.sessionIndex === 0)).toBe(true);
    // Cumulative LOC should reach 600
    const lastPoint = points[points.length - 1];
    expect(lastPoint.cumulativeLoc).toBe(600);
    // Should have 1 boundary
    expect(boundaries.length).toBe(1);
    expect(boundaries[0].title).toBe('Session A');
  });

  it('handles session with no turnTimeline as single jump', () => {
    const session = makeSession({
      title: 'No timeline',
      date: '2026-03-01T10:00:00Z',
      endTime: '2026-03-01T10:30:00Z',
      durationMinutes: 30,
      linesOfCode: 500,
    });

    const { points } = buildGrowthTimeSeries([session]);
    expect(points.length).toBe(2); // start + end
    expect(points[0].cumulativeLoc).toBe(0);
    expect(points[1].cumulativeLoc).toBe(500);
  });

  it('handles session with 0 LOC as flat segment', () => {
    const timeline = makeTurnTimeline('2026-03-01T10:00:00Z', 4, 5);
    const session = makeSession({
      title: 'Config only',
      date: '2026-03-01T10:00:00Z',
      endTime: '2026-03-01T10:20:00Z',
      durationMinutes: 20,
      linesOfCode: 0,
      turnTimeline: timeline,
    });

    const { points } = buildGrowthTimeSeries([session]);
    // All points should have 0 cumulative LOC
    expect(points.every((p) => p.cumulativeLoc === 0)).toBe(true);
  });

  it('accumulates LOC across multiple sessions', () => {
    const s1 = makeSession({
      title: 'Setup',
      date: '2026-03-01T10:00:00Z',
      endTime: '2026-03-01T10:30:00Z',
      durationMinutes: 30,
      linesOfCode: 200,
      turnTimeline: makeTurnTimeline('2026-03-01T10:00:00Z', 4, 5),
    });
    const s2 = makeSession({
      title: 'Core',
      date: '2026-03-01T11:00:00Z',
      endTime: '2026-03-01T11:30:00Z',
      durationMinutes: 30,
      linesOfCode: 300,
      turnTimeline: makeTurnTimeline('2026-03-01T11:00:00Z', 6, 5),
    });

    const { points, boundaries } = buildGrowthTimeSeries([s1, s2]);
    const lastPoint = points[points.length - 1];
    expect(lastPoint.cumulativeLoc).toBe(500);
    expect(boundaries.length).toBe(2);
  });

  it('compresses gaps > 1 hour between sessions', () => {
    const s1 = makeSession({
      title: 'Day 1',
      date: '2026-03-01T10:00:00Z',
      endTime: '2026-03-01T10:30:00Z',
      durationMinutes: 30,
      linesOfCode: 100,
    });
    const s2 = makeSession({
      title: 'Day 2',
      date: '2026-03-02T10:00:00Z',
      endTime: '2026-03-02T10:30:00Z',
      durationMinutes: 30,
      linesOfCode: 200,
    });

    const { totalVisualTime } = buildGrowthTimeSeries([s1, s2]);
    // 24 hours gap should be compressed — total visual time much less than real gap
    const realGapMs = 24 * 60 * 60 * 1000;
    expect(totalVisualTime).toBeLessThan(realGapMs / 10);
  });

  it('sorts sessions by date regardless of input order', () => {
    const later = makeSession({
      title: 'Later',
      date: '2026-03-05T10:00:00Z',
      durationMinutes: 30,
      linesOfCode: 300,
    });
    const earlier = makeSession({
      title: 'Earlier',
      date: '2026-03-01T10:00:00Z',
      durationMinutes: 30,
      linesOfCode: 200,
    });

    const { boundaries } = buildGrowthTimeSeries([later, earlier]);
    expect(boundaries[0].title).toBe('Earlier');
    expect(boundaries[1].title).toBe('Later');
  });

  it('falls back to all tool turns when no Edit/Write tools found', () => {
    const timeline = makeTurnTimeline('2026-03-01T10:00:00Z', 4, 5, { editTools: false });
    const session = makeSession({
      title: 'Read only tools',
      date: '2026-03-01T10:00:00Z',
      endTime: '2026-03-01T10:20:00Z',
      durationMinutes: 20,
      linesOfCode: 400,
      turnTimeline: timeline,
    });

    const { points } = buildGrowthTimeSeries([session]);
    const lastPoint = points[points.length - 1];
    expect(lastPoint.cumulativeLoc).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// GrowthChart component tests
// ---------------------------------------------------------------------------

describe('GrowthChart', () => {
  it('renders empty state when no sessions provided', () => {
    render(<GrowthChart sessions={[]} totalLoc={0} totalFiles={0} />);
    expect(screen.getByText('No session data available for growth chart.')).toBeTruthy();
    expect(screen.getByText('0')).toBeTruthy();
  });

  it('renders fallback when sessions have no dates', () => {
    const sessions = [
      makeSession({ title: 'Session A', linesOfCode: 500, date: '' }),
    ];
    render(<GrowthChart sessions={sessions} totalLoc={500} totalFiles={3} />);
    expect(screen.getByText('No dated sessions available for growth chart.')).toBeTruthy();
  });

  it('renders an SVG chart with smooth curve for valid sessions', () => {
    const sessions = [
      makeSession({
        title: 'Setup',
        linesOfCode: 2400,
        date: '2026-03-01T10:00:00Z',
        endTime: '2026-03-01T10:30:00Z',
        durationMinutes: 30,
        turnTimeline: makeTurnTimeline('2026-03-01T10:00:00Z', 6, 5),
      }),
      makeSession({
        title: 'Core API',
        linesOfCode: 1800,
        date: '2026-03-05T10:00:00Z',
        endTime: '2026-03-05T10:30:00Z',
        durationMinutes: 30,
        turnTimeline: makeTurnTimeline('2026-03-05T10:00:00Z', 6, 5),
      }),
      makeSession({
        title: 'UI polish',
        linesOfCode: 890,
        date: '2026-03-10T10:00:00Z',
        endTime: '2026-03-10T10:30:00Z',
        durationMinutes: 30,
        turnTimeline: makeTurnTimeline('2026-03-10T10:00:00Z', 4, 5),
      }),
    ];
    const { container } = render(
      <GrowthChart sessions={sessions} totalLoc={5090} totalFiles={42} />,
    );

    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();

    // Should have correct aria-label mentioning 3 sessions
    expect(svg?.getAttribute('aria-label')).toContain('3 sessions');

    // Should show summary stats
    expect(screen.getByText('5.1k')).toBeTruthy();
    expect(screen.getByText('LINES OF CODE')).toBeTruthy();
    expect(screen.getByText('42')).toBeTruthy();
    expect(screen.getByText('FILES TOUCHED')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('SESSIONS')).toBeTruthy();
  });

  it('renders a single session without crashing', () => {
    const sessions = [
      makeSession({
        title: 'Only one',
        linesOfCode: 1000,
        date: '2026-03-01T10:00:00Z',
        endTime: '2026-03-01T10:30:00Z',
        durationMinutes: 30,
        turnTimeline: makeTurnTimeline('2026-03-01T10:00:00Z', 4, 5),
      }),
    ];
    const { container } = render(
      <GrowthChart sessions={sessions} totalLoc={1000} totalFiles={10} />,
    );

    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();

    // Should have session endpoint dots
    const circles = svg?.querySelectorAll('circle');
    expect(circles?.length).toBeGreaterThanOrEqual(1);
  });

  it('handles sessions with 0 LOC gracefully', () => {
    const sessions = [
      makeSession({
        title: 'Config only',
        linesOfCode: 0,
        date: '2026-03-01T10:00:00Z',
        durationMinutes: 10,
      }),
      makeSession({
        title: 'Real work',
        linesOfCode: 500,
        date: '2026-03-02T10:00:00Z',
        durationMinutes: 20,
      }),
    ];
    const { container } = render(
      <GrowthChart sessions={sessions} totalLoc={500} totalFiles={5} />,
    );

    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
  });

  it('filters out sessions without dates and renders the rest', () => {
    const sessions = [
      makeSession({ title: 'No date', linesOfCode: 100, date: '' }),
      makeSession({
        title: 'Has date',
        linesOfCode: 500,
        date: '2026-03-01T10:00:00Z',
        durationMinutes: 30,
      }),
    ];
    const { container } = render(
      <GrowthChart sessions={sessions} totalLoc={600} totalFiles={8} />,
    );

    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    // aria-label should mention 1 session (only the dated one)
    expect(svg?.getAttribute('aria-label')).toContain('1 sessions');
  });

  it('has area fill and smooth line paths in the SVG', () => {
    const sessions = [
      makeSession({
        title: 'A',
        linesOfCode: 1000,
        date: '2026-03-01T10:00:00Z',
        durationMinutes: 30,
        turnTimeline: makeTurnTimeline('2026-03-01T10:00:00Z', 6, 5),
      }),
      makeSession({
        title: 'B',
        linesOfCode: 2000,
        date: '2026-03-02T10:00:00Z',
        durationMinutes: 30,
        turnTimeline: makeTurnTimeline('2026-03-02T10:00:00Z', 8, 3),
      }),
    ];
    const { container } = render(
      <GrowthChart sessions={sessions} totalLoc={3000} totalFiles={15} />,
    );

    const paths = container.querySelectorAll('svg path');
    // Should have at least 2 paths: area fill + line
    expect(paths.length).toBeGreaterThanOrEqual(2);

    // Area fill path should close (end with Z)
    const areaPath = Array.from(paths).find((p) =>
      p.getAttribute('fill')?.includes('rgba'),
    );
    expect(areaPath?.getAttribute('d')).toContain('Z');

    // Line path should have stroke and use cubic bezier
    const linePath = Array.from(paths).find(
      (p) => p.getAttribute('stroke') === 'var(--primary)',
    );
    expect(linePath).not.toBeNull();
    expect(linePath?.getAttribute('stroke-width')).toBe('2');
    // With enough points, the path should contain C (cubic bezier) commands
    const d = linePath?.getAttribute('d') ?? '';
    expect(d).toContain('C');
  });

  it('renders session boundary dashed lines', () => {
    const sessions = [
      makeSession({
        title: 'First',
        linesOfCode: 500,
        date: '2026-03-01T10:00:00Z',
        durationMinutes: 30,
      }),
      makeSession({
        title: 'Second',
        linesOfCode: 800,
        date: '2026-03-02T10:00:00Z',
        durationMinutes: 30,
      }),
    ];
    const { container } = render(
      <GrowthChart sessions={sessions} totalLoc={1300} totalFiles={10} />,
    );

    const svg = container.querySelector('svg');
    // Should have dashed boundary lines (stroke-dasharray="3,3")
    const dashedLines = svg?.querySelectorAll('line[stroke-dasharray="3,3"]');
    expect(dashedLines?.length).toBeGreaterThanOrEqual(2);
  });
});
