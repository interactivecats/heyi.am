import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { AgentTimeline } from './AgentTimeline';
import type { Session } from '../types';

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'ses-100',
    title: 'Test session',
    date: '2026-03-20T10:00:00Z',
    durationMinutes: 38,
    turns: 23,
    linesOfCode: 312,
    status: 'draft',
    projectName: 'test-project',
    rawLog: [],
    ...overrides,
  };
}

function makeChild(
  id: string,
  role: string,
  startOffset: number,
  duration: number,
): Session {
  const start = new Date('2026-03-20T10:00:00Z');
  start.setMinutes(start.getMinutes() + startOffset);
  return makeSession({
    id,
    agentRole: role,
    date: start.toISOString(),
    durationMinutes: duration,
    parentSessionId: 'ses-100',
  });
}

describe('AgentTimeline', () => {
  it('renders an SVG element', () => {
    const session = makeSession();
    const { container } = render(
      <AgentTimeline session={session} variant="full" />,
    );
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
  });

  it('single-agent: renders one horizontal line, no fork points', () => {
    const session = makeSession({ turns: 10 });
    const { container } = render(
      <AgentTimeline session={session} variant="full" />,
    );
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('aria-label')).toBe(
      'Single agent session timeline',
    );
    // Has lines but no fork circles
    const forkCircles = container.querySelectorAll(
      '[data-testid="fork-circle"]',
    );
    expect(forkCircles.length).toBe(0);
    // Has activity ticks
    const ticks = container.querySelectorAll('[data-testid="activity-tick"]');
    expect(ticks.length).toBeGreaterThan(0);
  });

  it('multi-agent (3 children): renders fork circles, agent lanes, join circles', () => {
    const session = makeSession({
      childSessions: [
        makeChild('c1', 'frontend-dev', 5, 12),
        makeChild('c2', 'backend-dev', 5, 18),
        makeChild('c3', 'qa-engineer', 5, 8),
      ],
    });
    const { container } = render(
      <AgentTimeline session={session} variant="full" />,
    );
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('aria-label')).toBe(
      'Multi-agent session timeline',
    );

    // Fork and join circles
    const forkCircles = container.querySelectorAll(
      '[data-testid="fork-circle"]',
    );
    expect(forkCircles.length).toBe(1);
    const joinCircles = container.querySelectorAll(
      '[data-testid="join-circle"]',
    );
    expect(joinCircles.length).toBe(1);

    // 3 agent lanes
    const lanes = container.querySelectorAll('[data-testid="agent-lane"]');
    expect(lanes.length).toBe(3);

    // Role labels
    const labels = container.querySelectorAll('[data-testid="role-label"]');
    expect(labels.length).toBe(3);
    const labelTexts = Array.from(labels).map((l) => l.textContent);
    expect(labelTexts).toContain('FRONTEND-DEV');
    expect(labelTexts).toContain('BACKEND-DEV');
    expect(labelTexts).toContain('QA-ENGINEER');
  });

  it('multi-wave: renders multiple fork/join pairs', () => {
    // Wave 1: frontend + backend at t=3 (overlapping)
    // Wave 2: qa at t=25 (after wave 1 ends)
    const session = makeSession({
      durationMinutes: 42,
      childSessions: [
        makeChild('c1', 'frontend-dev', 3, 15),
        makeChild('c2', 'backend-dev', 3, 18),
        makeChild('c3', 'qa-engineer', 25, 10),
      ],
    });
    const { container } = render(
      <AgentTimeline session={session} variant="full" />,
    );

    const forkCircles = container.querySelectorAll(
      '[data-testid="fork-circle"]',
    );
    expect(forkCircles.length).toBe(2);

    const joinCircles = container.querySelectorAll(
      '[data-testid="join-circle"]',
    );
    expect(joinCircles.length).toBe(2);

    const waves = container.querySelectorAll('[data-testid="wave"]');
    expect(waves.length).toBe(2);
  });

  it('compact variant: smaller viewBox, no time labels', () => {
    const session = makeSession({ turns: 5 });
    const { container } = render(
      <AgentTimeline session={session} variant="compact" />,
    );
    const svg = container.querySelector('svg')!;
    const viewBox = svg.getAttribute('viewBox')!;
    const [, , w] = viewBox.split(' ').map(Number);
    expect(w).toBe(400);

    const timeLabels = container.querySelectorAll(
      '[data-testid="time-label"]',
    );
    expect(timeLabels.length).toBe(0);
  });

  it('full variant: no time axis labels (removed)', () => {
    const session = makeSession({ turns: 5 });
    const { container } = render(
      <AgentTimeline session={session} variant="full" />,
    );
    const timeLabels = container.querySelectorAll(
      '[data-testid="time-label"]',
    );
    expect(timeLabels.length).toBe(0);
  });

  it('lane widths are proportional to duration', () => {
    const session = makeSession({
      durationMinutes: 30,
      childSessions: [
        makeChild('c1', 'frontend-dev', 0, 2),
        makeChild('c2', 'backend-dev', 0, 10),
      ],
    });
    const { container } = render(
      <AgentTimeline session={session} variant="full" />,
    );
    const lanes = container.querySelectorAll('[data-testid="agent-lane"]');
    expect(lanes.length).toBe(2);

    const rects = Array.from(lanes).map(
      (lane) => lane.querySelector('rect')!,
    );
    const widths = rects.map((r) => parseFloat(r.getAttribute('width')!));
    // The 10m lane should be wider than the 2m lane
    expect(widths[1]).toBeGreaterThan(widths[0]);
  });

  it('detail labels include start offset', () => {
    const session = makeSession({
      durationMinutes: 30,
      childSessions: [makeChild('c1', 'frontend-dev', 5, 10)],
    });
    const { container } = render(
      <AgentTimeline session={session} variant="full" />,
    );
    const lanes = container.querySelectorAll('[data-testid="agent-lane"]');
    expect(lanes.length).toBe(1);

    // Detail text should contain "+5m"
    const texts = lanes[0].querySelectorAll('text');
    const detailTexts = Array.from(texts).map((t) => t.textContent);
    const hasOffset = detailTexts.some((t) => t?.includes('+5m'));
    expect(hasOffset).toBe(true);
  });

  it('unknown agent roles get default gray color', () => {
    const session = makeSession({
      childSessions: [makeChild('c1', 'custom-agent', 5, 10)],
    });
    const { container } = render(
      <AgentTimeline session={session} variant="full" />,
    );
    // The lane line should use the default color
    const lane = container.querySelector('[data-testid="agent-lane"] line');
    expect(lane).toBeTruthy();
    expect(lane!.getAttribute('stroke')).toBe('#6b7280');
  });
});
