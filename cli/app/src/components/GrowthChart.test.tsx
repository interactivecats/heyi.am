/**
 * Unit tests: GrowthChart component and its helper functions
 *
 * Tests the cumulative LOC area chart used in the ProjectPreview overlay,
 * including axis tick computation, formatting helpers, and edge cases
 * (0 sessions, 1 session, sessions with 0 LOC, missing dates).
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  GrowthChart,
  formatLocAxis,
  formatLocDelta,
  computeAxisTicks,
} from './ProjectUploadFlow';

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
    // All steps should be equal
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
// GrowthChart component tests
// ---------------------------------------------------------------------------

const makeSessions = (
  items: Array<{ title: string; linesOfCode: number; date: string }>,
) => items;

describe('GrowthChart', () => {
  it('renders empty state when no sessions provided', () => {
    render(<GrowthChart sessions={[]} totalLoc={0} totalFiles={0} />);
    expect(screen.getByText('No session data available for growth chart.')).toBeTruthy();
    expect(screen.getByText('0')).toBeTruthy();
  });

  it('renders fallback when sessions have no dates', () => {
    const sessions = makeSessions([
      { title: 'Session A', linesOfCode: 500, date: '' },
    ]);
    render(<GrowthChart sessions={sessions} totalLoc={500} totalFiles={3} />);
    expect(screen.getByText('No dated sessions available for growth chart.')).toBeTruthy();
  });

  it('renders an SVG chart with data points for valid sessions', () => {
    const sessions = makeSessions([
      { title: 'Setup', linesOfCode: 2400, date: '2026-03-01' },
      { title: 'Core API', linesOfCode: 1800, date: '2026-03-05' },
      { title: 'UI polish', linesOfCode: 890, date: '2026-03-10' },
    ]);
    const { container } = render(
      <GrowthChart sessions={sessions} totalLoc={5090} totalFiles={42} />,
    );

    // Should render an SVG
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();

    // Should have correct aria-label
    expect(svg?.getAttribute('aria-label')).toContain('3 sessions');

    // Should render 3 data point circles
    const circles = svg?.querySelectorAll('circle');
    expect(circles?.length).toBe(3);

    // Should show summary stats
    expect(screen.getByText('5.1k')).toBeTruthy(); // totalLoc formatted
    expect(screen.getByText('LINES OF CODE')).toBeTruthy();
    expect(screen.getByText('42')).toBeTruthy(); // totalFiles
    expect(screen.getByText('FILES TOUCHED')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy(); // session count
    expect(screen.getByText('SESSIONS')).toBeTruthy();
  });

  it('renders a single session without crashing', () => {
    const sessions = makeSessions([
      { title: 'Only one', linesOfCode: 1000, date: '2026-03-01' },
    ]);
    const { container } = render(
      <GrowthChart sessions={sessions} totalLoc={1000} totalFiles={10} />,
    );

    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();

    const circles = svg?.querySelectorAll('circle');
    expect(circles?.length).toBe(1);
  });

  it('handles sessions with 0 LOC gracefully', () => {
    const sessions = makeSessions([
      { title: 'Config only', linesOfCode: 0, date: '2026-03-01' },
      { title: 'Real work', linesOfCode: 500, date: '2026-03-02' },
    ]);
    const { container } = render(
      <GrowthChart sessions={sessions} totalLoc={500} totalFiles={5} />,
    );

    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();

    // Should still render 2 data points
    const circles = svg?.querySelectorAll('circle');
    expect(circles?.length).toBe(2);
  });

  it('sorts sessions by date regardless of input order', () => {
    const sessions = makeSessions([
      { title: 'Later', linesOfCode: 300, date: '2026-03-10' },
      { title: 'Earlier', linesOfCode: 200, date: '2026-03-01' },
    ]);
    const { container } = render(
      <GrowthChart sessions={sessions} totalLoc={500} totalFiles={5} />,
    );

    const svg = container.querySelector('svg');
    // The x-axis labels should appear — check "Earlier" appears as a label
    const texts = svg?.querySelectorAll('text');
    const labels = Array.from(texts ?? []).map((t) => t.textContent);
    // "Earlier" should come before "Later" in the DOM (rendered left to right)
    const earlierIdx = labels.indexOf('Earlier');
    const laterIdx = labels.indexOf('Later');
    expect(earlierIdx).toBeLessThan(laterIdx);
  });

  it('filters out sessions without dates and renders the rest', () => {
    const sessions = makeSessions([
      { title: 'No date', linesOfCode: 100, date: '' },
      { title: 'Has date', linesOfCode: 500, date: '2026-03-01' },
    ]);
    const { container } = render(
      <GrowthChart sessions={sessions} totalLoc={600} totalFiles={8} />,
    );

    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();

    // Only 1 circle for the dated session
    const circles = svg?.querySelectorAll('circle');
    expect(circles?.length).toBe(1);
  });

  it('renders delta labels above data points', () => {
    const sessions = makeSessions([
      { title: 'Setup', linesOfCode: 2400, date: '2026-03-01' },
      { title: 'More', linesOfCode: 890, date: '2026-03-05' },
    ]);
    const { container } = render(
      <GrowthChart sessions={sessions} totalLoc={3290} totalFiles={20} />,
    );

    const svg = container.querySelector('svg');
    const texts = Array.from(svg?.querySelectorAll('text') ?? []).map(
      (t) => t.textContent,
    );
    // Should contain delta labels
    expect(texts).toContain('+2.4k');
    expect(texts).toContain('+890');
  });

  it('has area fill and line paths in the SVG', () => {
    const sessions = makeSessions([
      { title: 'A', linesOfCode: 1000, date: '2026-03-01' },
      { title: 'B', linesOfCode: 2000, date: '2026-03-02' },
    ]);
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

    // Line path should have stroke
    const linePath = Array.from(paths).find(
      (p) => p.getAttribute('stroke') === 'var(--primary)',
    );
    expect(linePath).not.toBeNull();
    expect(linePath?.getAttribute('stroke-width')).toBe('2');
  });
});
