import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { WorkTimeline, computeSegments } from './WorkTimeline';
import type { Session } from '../types';

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'ses-1',
    title: 'Test session',
    date: '2026-03-20T10:00:00Z',
    durationMinutes: 30,
    turns: 10,
    linesOfCode: 200,
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
    linesOfCode: 50,
    parentSessionId: 'ses-1',
  });
}

describe('WorkTimeline', () => {
  it('renders empty state when no sessions provided', () => {
    const { getByTestId } = render(<WorkTimeline sessions={[]} />);
    expect(getByTestId('work-timeline-empty')).toBeTruthy();
  });

  it('renders an SVG for a single session', () => {
    const { container, getByTestId } = render(
      <WorkTimeline sessions={[makeSession()]} />,
    );
    expect(getByTestId('work-timeline')).toBeTruthy();
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(svg!.getAttribute('aria-label')).toBe('Work timeline showing 1 sessions');
  });

  it('renders session segment with title and subtitle', () => {
    const { container } = render(
      <WorkTimeline sessions={[makeSession({ title: 'Add auth flow' })]} />,
    );
    const title = container.querySelector('[data-testid="session-title"]');
    expect(title).toBeTruthy();
    expect(title!.textContent).toBe('Add auth flow');

    const subtitle = container.querySelector('[data-testid="session-subtitle"]');
    expect(subtitle).toBeTruthy();
    expect(subtitle!.textContent).toContain('30m');
    expect(subtitle!.textContent).toContain('200 LOC');
  });

  it('renders a single-bar for non-multi-agent session', () => {
    const { container } = render(
      <WorkTimeline sessions={[makeSession()]} />,
    );
    expect(container.querySelector('[data-testid="single-bar"]')).toBeTruthy();
  });

  it('renders gap segments between distant sessions', () => {
    const sessions = [
      makeSession({ id: 's1', date: '2026-03-20T10:00:00Z', durationMinutes: 30 }),
      makeSession({ id: 's2', date: '2026-03-21T10:00:00Z', durationMinutes: 45 }),
    ];
    const { container } = render(<WorkTimeline sessions={sessions} />);
    const gaps = container.querySelectorAll('[data-testid="gap-segment"]');
    expect(gaps.length).toBe(1);

    const gapLabel = container.querySelector('[data-testid="gap-label"]');
    expect(gapLabel).toBeTruthy();
    expect(gapLabel!.textContent).toBe('1 day');
  });

  it('does not render gap for sessions less than 1 hour apart', () => {
    const sessions = [
      makeSession({ id: 's1', date: '2026-03-20T10:00:00Z', durationMinutes: 20 }),
      makeSession({ id: 's2', date: '2026-03-20T10:30:00Z', durationMinutes: 20 }),
    ];
    const { container } = render(<WorkTimeline sessions={sessions} />);
    const gaps = container.querySelectorAll('[data-testid="gap-segment"]');
    expect(gaps.length).toBe(0);
  });

  it('renders fork/join for multi-agent session with children summaries (no full childSessions)', () => {
    const session = makeSession({
      childCount: 3,
      children: [
        { sessionId: 'c1', role: 'frontend-dev', durationMinutes: 10 },
        { sessionId: 'c2', role: 'backend-dev', durationMinutes: 15 },
        { sessionId: 'c3', role: 'qa-engineer', durationMinutes: 8 },
      ],
    });
    const { container } = render(<WorkTimeline sessions={[session]} />);
    // Should render fork/join, not thick bar — children summaries have enough data
    expect(container.querySelector('[data-testid="multi-agent-bar"]')).toBeTruthy();
    const forkDot = container.querySelector('[data-testid="fork-dot"]');
    expect(forkDot).toBeTruthy();
    const childLanes = container.querySelectorAll('[data-testid="child-lane"]');
    expect(childLanes.length).toBe(3);
    const labels = container.querySelectorAll('[data-testid="child-role-label"]');
    const labelTexts = Array.from(labels).map((l) => l.textContent);
    expect(labelTexts).toContain('FRONTEND-DEV');
    expect(labelTexts).toContain('BACKEND-DEV');
    expect(labelTexts).toContain('QA-ENGINEER');
  });

  it('renders thick bar when only childCount is available (no children array)', () => {
    const session = makeSession({
      childCount: 3,
    });
    const { container } = render(<WorkTimeline sessions={[session]} />);
    expect(container.querySelector('[data-testid="thick-bar"]')).toBeTruthy();
    const badge = container.querySelector('[data-testid="agent-count-badge"]');
    expect(badge).toBeTruthy();
    expect(badge!.textContent).toBe('(3 agents)');
  });

  it('renders fork/join for multi-agent session with loaded childSessions', () => {
    const session = makeSession({
      childSessions: [
        makeChild('c1', 'frontend-dev', 2, 10),
        makeChild('c2', 'backend-dev', 2, 15),
      ],
    });
    const { container } = render(<WorkTimeline sessions={[session]} />);
    expect(container.querySelector('[data-testid="multi-agent-bar"]')).toBeTruthy();
    const forkDot = container.querySelector('[data-testid="fork-dot"]');
    expect(forkDot).toBeTruthy();
    const joinDot = container.querySelector('[data-testid="join-dot"]');
    expect(joinDot).toBeTruthy();

    const childLanes = container.querySelectorAll('[data-testid="child-lane"]');
    expect(childLanes.length).toBe(2);

    const labels = container.querySelectorAll('[data-testid="child-role-label"]');
    const labelTexts = Array.from(labels).map((l) => l.textContent);
    expect(labelTexts).toContain('FRONTEND-DEV');
    expect(labelTexts).toContain('BACKEND-DEV');
  });

  it('renders axis ticks', () => {
    const { container } = render(
      <WorkTimeline sessions={[makeSession()]} />,
    );
    expect(container.querySelector('[data-testid="axis-tick"]')).toBeTruthy();
  });

  it('sorts sessions by date regardless of input order', () => {
    const sessions = [
      makeSession({ id: 's2', title: 'Second', date: '2026-03-20T14:00:00Z' }),
      makeSession({ id: 's1', title: 'First', date: '2026-03-20T10:00:00Z' }),
    ];
    const { container } = render(<WorkTimeline sessions={sessions} />);
    const titles = container.querySelectorAll('[data-testid="session-title"]');
    expect(titles[0].textContent).toBe('First');
    expect(titles[1].textContent).toBe('Second');
  });

  it('handles session with no endTime by deriving from durationMinutes', () => {
    const session = makeSession({ endTime: undefined, durationMinutes: 45 });
    const { container } = render(<WorkTimeline sessions={[session]} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
  });

  it('uses date labels for multi-day sessions', () => {
    const sessions = [
      makeSession({ id: 's1', date: '2026-03-20T10:00:00Z', durationMinutes: 30 }),
      makeSession({ id: 's2', date: '2026-03-22T10:00:00Z', durationMinutes: 30 }),
    ];
    const { container } = render(<WorkTimeline sessions={sessions} />);
    const ticks = container.querySelectorAll('[data-testid="axis-tick"] text');
    const labels = Array.from(ticks).map((t) => t.textContent);
    expect(labels.some((l) => l?.includes('Mar'))).toBe(true);
  });

  it('uses time labels for same-day sessions', () => {
    const sessions = [
      makeSession({ id: 's1', date: '2026-03-20T10:00:00Z', durationMinutes: 30 }),
      makeSession({ id: 's2', date: '2026-03-20T10:40:00Z', durationMinutes: 30 }),
    ];
    const { container } = render(<WorkTimeline sessions={sessions} />);
    const ticks = container.querySelectorAll('[data-testid="axis-tick"] text');
    const labels = Array.from(ticks).map((t) => t.textContent);
    expect(labels.some((l) => l?.includes(':'))).toBe(true);
  });
});

describe('computeSegments', () => {
  it('returns empty array for no sessions', () => {
    expect(computeSegments([])).toEqual([]);
  });

  it('returns single session segment for one session', () => {
    const segments = computeSegments([makeSession()]);
    expect(segments.length).toBe(1);
    expect(segments[0].type).toBe('session');
  });

  it('inserts gap segment when sessions are far apart', () => {
    const sessions = [
      makeSession({ id: 's1', date: '2026-03-20T10:00:00Z', durationMinutes: 30 }),
      makeSession({ id: 's2', date: '2026-03-21T10:00:00Z', durationMinutes: 30 }),
    ];
    const segments = computeSegments(sessions);
    expect(segments.length).toBe(3);
    expect(segments[0].type).toBe('session');
    expect(segments[1].type).toBe('gap');
    expect(segments[2].type).toBe('session');
  });

  it('does not insert gap when sessions are close together', () => {
    const sessions = [
      makeSession({ id: 's1', date: '2026-03-20T10:00:00Z', durationMinutes: 20 }),
      makeSession({ id: 's2', date: '2026-03-20T10:30:00Z', durationMinutes: 20 }),
    ];
    const segments = computeSegments(sessions);
    expect(segments.length).toBe(2);
    expect(segments.every((s) => s.type === 'session')).toBe(true);
  });

  it('sorts sessions regardless of input order', () => {
    const sessions = [
      makeSession({ id: 's2', date: '2026-03-20T14:00:00Z' }),
      makeSession({ id: 's1', date: '2026-03-20T10:00:00Z' }),
    ];
    const segments = computeSegments(sessions);
    const sessionSegs = segments.filter((s) => s.type === 'session') as Array<{ type: 'session'; session: Session }>;
    expect(sessionSegs[0].session.id).toBe('s1');
    expect(sessionSegs[1].session.id).toBe('s2');
  });

  it('clusters overlapping sessions into a concurrent segment', () => {
    const sessions = [
      makeSession({ id: 's1', date: '2026-03-20T10:00:00Z', durationMinutes: 60 }),
      makeSession({ id: 's2', date: '2026-03-20T10:30:00Z', durationMinutes: 60 }),
    ];
    const segments = computeSegments(sessions);
    expect(segments.length).toBe(1);
    expect(segments[0].type).toBe('concurrent');
    if (segments[0].type === 'concurrent') {
      expect(segments[0].sessions.length).toBe(2);
    }
  });

  it('keeps non-overlapping sessions as separate segments', () => {
    const sessions = [
      makeSession({ id: 's1', date: '2026-03-20T10:00:00Z', durationMinutes: 20 }),
      makeSession({ id: 's2', date: '2026-03-20T10:30:00Z', durationMinutes: 20 }),
    ];
    const segments = computeSegments(sessions);
    expect(segments.length).toBe(2);
    expect(segments.every((s) => s.type === 'session')).toBe(true);
  });

  it('clusters three overlapping sessions together', () => {
    const sessions = [
      makeSession({ id: 's1', date: '2026-03-20T10:00:00Z', durationMinutes: 60 }),
      makeSession({ id: 's2', date: '2026-03-20T10:20:00Z', durationMinutes: 60 }),
      makeSession({ id: 's3', date: '2026-03-20T10:40:00Z', durationMinutes: 60 }),
    ];
    const segments = computeSegments(sessions);
    expect(segments.length).toBe(1);
    expect(segments[0].type).toBe('concurrent');
    if (segments[0].type === 'concurrent') {
      expect(segments[0].sessions.length).toBe(3);
    }
  });

  it('creates separate clusters for non-overlapping groups', () => {
    const sessions = [
      makeSession({ id: 's1', date: '2026-03-20T10:00:00Z', durationMinutes: 30 }),
      makeSession({ id: 's2', date: '2026-03-20T10:10:00Z', durationMinutes: 30 }),
      // gap
      makeSession({ id: 's3', date: '2026-03-21T14:00:00Z', durationMinutes: 30 }),
      makeSession({ id: 's4', date: '2026-03-21T14:10:00Z', durationMinutes: 30 }),
    ];
    const segments = computeSegments(sessions);
    // concurrent, gap, concurrent
    expect(segments.length).toBe(3);
    expect(segments[0].type).toBe('concurrent');
    expect(segments[1].type).toBe('gap');
    expect(segments[2].type).toBe('concurrent');
  });
});
