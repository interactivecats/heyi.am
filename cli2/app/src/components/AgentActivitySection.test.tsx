import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AgentActivitySection } from './ProjectUploadFlow';
import type { Session } from '../types';

// Mock fetchSession from api module
vi.mock('../api', async () => {
  const actual = await vi.importActual('../api');
  return {
    ...actual,
    fetchSession: vi.fn(),
  };
});

import { fetchSession } from '../api';
const mockFetchSession = vi.mocked(fetchSession);

beforeEach(() => {
  mockFetchSession.mockReset();
});

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'ses-1',
    title: 'Test session',
    date: '2026-03-20T10:00:00Z',
    durationMinutes: 30,
    turns: 15,
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
  loc: number = 50,
): { sessionId: string; role: string; date: string; durationMinutes: number; linesOfCode: number } {
  const start = new Date('2026-03-20T10:00:00Z');
  start.setMinutes(start.getMinutes() + startOffset);
  return {
    sessionId: id,
    role,
    date: start.toISOString(),
    durationMinutes: duration,
    linesOfCode: loc,
  };
}

describe('AgentActivitySection', () => {
  it('returns null when sessions array is empty', () => {
    const { container } = render(<AgentActivitySection sessions={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders the AGENT ACTIVITY heading', () => {
    const sessions = [makeSession()];
    render(<AgentActivitySection sessions={sessions} />);
    expect(screen.getByText('AGENT ACTIVITY')).toBeTruthy();
  });

  it('renders a color legend with at least one entry', () => {
    const sessions = [makeSession()];
    const { container } = render(
      <AgentActivitySection sessions={sessions} />,
    );
    const legendItems = container.querySelectorAll(
      '.agent-activity__legend-item',
    );
    expect(legendItems.length).toBeGreaterThanOrEqual(1);
  });

  it('shows simplified fallback SVG for non-orchestrated sessions', () => {
    const sessions = [makeSession({ title: 'Solo work' })];
    const { container } = render(
      <AgentActivitySection sessions={sessions} />,
    );
    const svgs = container.querySelectorAll('svg');
    expect(svgs.length).toBe(1);
    expect(svgs[0].getAttribute('aria-label')).toBe(
      'Session timeline: Solo work',
    );
  });

  it('uses AgentTimeline for orchestrated sessions with children', () => {
    const sessions = [
      makeSession({
        isOrchestrated: true,
        children: [
          makeChild('c1', 'frontend-dev', 0, 10),
          makeChild('c2', 'backend-dev', 0, 15),
        ],
      }),
    ];
    const { container } = render(
      <AgentActivitySection sessions={sessions} />,
    );
    // AgentTimeline renders fork circles for multi-agent sessions
    const forkCircles = container.querySelectorAll(
      '[data-testid="fork-circle"]',
    );
    expect(forkCircles.length).toBeGreaterThan(0);
  });

  it('shows summary stats: orchestrated count and unique roles', () => {
    const sessions = [
      makeSession({
        id: 'ses-1',
        isOrchestrated: true,
        children: [
          makeChild('c1', 'frontend-dev', 0, 10),
          makeChild('c2', 'backend-dev', 0, 15),
        ],
      }),
      makeSession({ id: 'ses-2', isOrchestrated: false }),
    ];
    render(<AgentActivitySection sessions={sessions} />);

    // "1 of 2" orchestrated
    expect(screen.getByText('1 of 2')).toBeTruthy();
    expect(screen.getByText('Orchestrated')).toBeTruthy();
    expect(screen.getByText('Unique Roles')).toBeTruthy();
  });

  it('computes agent LOC from children', () => {
    const sessions = [
      makeSession({
        linesOfCode: 300,
        isOrchestrated: true,
        children: [
          makeChild('c1', 'frontend-dev', 0, 10, 120),
          makeChild('c2', 'backend-dev', 0, 15, 80),
        ],
      }),
    ];
    render(<AgentActivitySection sessions={sessions} />);

    // Agent LOC = 120 + 80 = 200
    expect(screen.getByText('200')).toBeTruthy();
    expect(screen.getByText('Agent LOC')).toBeTruthy();
    // Total LOC = 300
    expect(screen.getByText('300')).toBeTruthy();
    expect(screen.getByText('Total LOC')).toBeTruthy();
  });

  it('shows childCount badge in fallback SVG when available', () => {
    const sessions = [
      makeSession({ childCount: 3, durationMinutes: 20, linesOfCode: 100 }),
    ];
    const { container } = render(
      <AgentActivitySection sessions={sessions} />,
    );
    const svg = container.querySelector('svg')!;
    const text = svg.querySelector('text');
    expect(text?.textContent).toContain('(3 agents)');
  });

  it('collects roles from children summaries', () => {
    const sessions = [
      makeSession({
        children: [
          { sessionId: 'c1', role: 'frontend', durationMinutes: 10, linesOfCode: 50 },
          { sessionId: 'c2', role: 'backend', durationMinutes: 15, linesOfCode: 70 },
        ],
      }),
    ];
    const { container } = render(
      <AgentActivitySection sessions={sessions} />,
    );
    const legendItems = container.querySelectorAll(
      '.agent-activity__legend-item',
    );
    const labels = Array.from(legendItems).map((el) => el.textContent);
    expect(labels).toContain('Frontend');
    expect(labels).toContain('Backend');
  });

  it('renders session labels for each session', () => {
    const sessions = [
      makeSession({ id: 'a', title: 'Setup auth' }),
      makeSession({ id: 'b', title: 'Build API' }),
    ];
    render(<AgentActivitySection sessions={sessions} />);
    expect(screen.getByText('Setup auth')).toBeTruthy();
    expect(screen.getByText('Build API')).toBeTruthy();
  });

  it('lazy-loads full session when childCount > 0 and projectDirName provided', async () => {
    const fullSession = makeSession({
      id: 'ses-1',
      title: 'Orchestrated work',
      isOrchestrated: true,
      childCount: 2,
      children: [
        makeChild('c1', 'frontend-dev', 0, 10),
        makeChild('c2', 'backend-dev', 0, 15),
      ],
    });
    mockFetchSession.mockResolvedValueOnce(fullSession);

    const sessions = [
      makeSession({
        id: 'ses-1',
        title: 'Orchestrated work',
        childCount: 2,
      }),
    ];
    const { container } = render(
      <AgentActivitySection sessions={sessions} projectDirName="test-project" />,
    );

    // Initially shows loading
    expect(screen.getByText('Loading agent activity...')).toBeTruthy();

    // After fetch resolves, should show fork circles from AgentTimeline
    await waitFor(() => {
      const forkCircles = container.querySelectorAll('[data-testid="fork-circle"]');
      expect(forkCircles.length).toBeGreaterThan(0);
    });

    expect(mockFetchSession).toHaveBeenCalledWith('test-project', 'ses-1');
  });

  it('does not fetch when childCount is 0', () => {
    mockFetchSession.mockClear();
    const sessions = [makeSession({ childCount: 0 })];
    render(<AgentActivitySection sessions={sessions} projectDirName="test-project" />);
    expect(mockFetchSession).not.toHaveBeenCalled();
  });

  it('does not fetch when projectDirName is not provided', () => {
    mockFetchSession.mockClear();
    const sessions = [makeSession({ childCount: 3 })];
    render(<AgentActivitySection sessions={sessions} />);
    expect(mockFetchSession).not.toHaveBeenCalled();
  });

  it('handles fetch error gracefully by showing fallback SVG', async () => {
    mockFetchSession.mockRejectedValueOnce(new Error('Network error'));

    const sessions = [
      makeSession({
        id: 'ses-fail',
        title: 'Failing fetch',
        childCount: 2,
        durationMinutes: 20,
        linesOfCode: 100,
      }),
    ];
    render(
      <AgentActivitySection sessions={sessions} projectDirName="test-project" />,
    );

    // After fetch fails, should show the fallback SVG (no fork circles)
    await waitFor(() => {
      expect(screen.queryByText('Loading agent activity...')).toBeNull();
    });

    // Should still render the session label
    expect(screen.getByText('Failing fetch')).toBeTruthy();
  });
});
