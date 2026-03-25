import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SessionDetailOverlay } from './SessionDetailOverlay';
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

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'ses-200',
    title: 'Implement auth flow',
    date: '2026-03-20T10:00:00Z',
    durationMinutes: 45,
    turns: 30,
    linesOfCode: 520,
    status: 'enhanced',
    projectName: 'heyi-am',
    rawLog: ['$ claude code', '> Reading files...', '> Writing auth.ts', '> Tests passing', '> Done'],
    ...overrides,
  };
}

describe('SessionDetailOverlay', () => {
  it('renders title and breadcrumb', () => {
    render(
      <SessionDetailOverlay
        session={makeSession()}
        projectName="heyi-am"
        projectDirName="heyi-am"
        onClose={() => {}}
      />,
    );
    expect(screen.getByText('Implement auth flow')).toBeTruthy();
    expect(screen.getByText('heyi-am / Implement auth flow')).toBeTruthy();
  });

  it('renders stats grid values', () => {
    render(
      <SessionDetailOverlay
        session={makeSession()}
        projectName="heyi-am"
        projectDirName="heyi-am"
        onClose={() => {}}
      />,
    );
    expect(screen.getByText('45m')).toBeTruthy();
    expect(screen.getByText('30')).toBeTruthy();
    expect(screen.getByText('520')).toBeTruthy();
  });

  it('renders developer take when present', () => {
    render(
      <SessionDetailOverlay
        session={makeSession({ developerTake: 'This was a pivotal session.' })}
        projectName="heyi-am"
        projectDirName="heyi-am"
        onClose={() => {}}
      />,
    );
    expect(screen.getByText('This was a pivotal session.')).toBeTruthy();
    expect(screen.getByText('DEVELOPER TAKE')).toBeTruthy();
  });

  it('does not render developer take when absent', () => {
    render(
      <SessionDetailOverlay
        session={makeSession({ developerTake: undefined })}
        projectName="heyi-am"
        projectDirName="heyi-am"
        onClose={() => {}}
      />,
    );
    expect(screen.queryByText('DEVELOPER TAKE')).toBeNull();
  });

  it('renders skill chips', () => {
    render(
      <SessionDetailOverlay
        session={makeSession({ skills: ['TypeScript', 'React'] })}
        projectName="heyi-am"
        projectDirName="heyi-am"
        onClose={() => {}}
      />,
    );
    expect(screen.getByText('TypeScript')).toBeTruthy();
    expect(screen.getByText('React')).toBeTruthy();
  });

  it('renders Q&A pairs when present', () => {
    render(
      <SessionDetailOverlay
        session={makeSession({
          qaPairs: [{ question: 'Why this approach?', answer: 'It was simpler.' }],
        })}
        projectName="heyi-am"
        projectDirName="heyi-am"
        onClose={() => {}}
      />,
    );
    expect(screen.getByText('Why this approach?')).toBeTruthy();
    expect(screen.getByText('It was simpler.')).toBeTruthy();
  });

  it('renders execution path timeline', () => {
    render(
      <SessionDetailOverlay
        session={makeSession({
          executionPath: [
            { stepNumber: 1, title: 'Analyze codebase', description: 'Read existing auth code' },
            { stepNumber: 2, title: 'Write unit tests', description: 'Added coverage for auth module' },
          ],
        })}
        projectName="heyi-am"
        projectDirName="heyi-am"
        onClose={() => {}}
      />,
    );
    expect(screen.getByText('EXECUTION PATH')).toBeTruthy();
    expect(screen.getByText('Analyze codebase')).toBeTruthy();
    expect(screen.getByText('Write unit tests')).toBeTruthy();
  });

  it('renders tool breakdown in collapsible details', () => {
    render(
      <SessionDetailOverlay
        session={makeSession({
          toolBreakdown: [
            { tool: 'Read', count: 15 },
            { tool: 'Edit', count: 8 },
          ],
        })}
        projectName="heyi-am"
        projectDirName="heyi-am"
        onClose={() => {}}
      />,
    );
    expect(screen.getByText('Tool Breakdown (2 tools)')).toBeTruthy();
    expect(screen.getByText('Read')).toBeTruthy();
    expect(screen.getByText('15')).toBeTruthy();
  });

  it('renders files changed in collapsible details', () => {
    render(
      <SessionDetailOverlay
        session={makeSession({
          filesChanged: [
            { path: 'src/auth.ts', additions: 120, deletions: 5 },
          ],
        })}
        projectName="heyi-am"
        projectDirName="heyi-am"
        onClose={() => {}}
      />,
    );
    expect(screen.getByText('Files Changed (1 files)')).toBeTruthy();
    expect(screen.getByText('src/auth.ts')).toBeTruthy();
    expect(screen.getByText('+120')).toBeTruthy();
    expect(screen.getByText('-5')).toBeTruthy();
  });

  it('renders raw log preview with truncation', () => {
    render(
      <SessionDetailOverlay
        session={makeSession()}
        projectName="heyi-am"
        projectDirName="heyi-am"
        onClose={() => {}}
      />,
    );
    // Shows first 4 lines
    expect(screen.getByText('$ claude code')).toBeTruthy();
    expect(screen.getByText('> Tests passing')).toBeTruthy();
    // The 5th line should not be directly visible
    expect(screen.queryByText('> Done')).toBeNull();
    // Shows "view full" link
    expect(screen.getByText(/View full transcript/)).toBeTruthy();
  });

  it('renders source info section', () => {
    render(
      <SessionDetailOverlay
        session={makeSession()}
        projectName="heyi-am"
        projectDirName="heyi-am"
        onClose={() => {}}
      />,
    );
    expect(screen.getByText('Claude Code')).toBeTruthy();
    expect(screen.getByText('heyi-am')).toBeTruthy();
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(
      <SessionDetailOverlay
        session={makeSession()}
        projectName="heyi-am"
        projectDirName="heyi-am"
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByLabelText('Close session detail'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when back button is clicked', () => {
    const onClose = vi.fn();
    render(
      <SessionDetailOverlay
        session={makeSession()}
        projectName="heyi-am"
        projectDirName="heyi-am"
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByText(/Back to project/));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose on Escape key', () => {
    const onClose = vi.fn();
    render(
      <SessionDetailOverlay
        session={makeSession()}
        projectName="heyi-am"
        projectDirName="heyi-am"
        onClose={onClose}
      />,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('has dialog role with accessible label', () => {
    render(
      <SessionDetailOverlay
        session={makeSession()}
        projectName="heyi-am"
        projectDirName="heyi-am"
        onClose={() => {}}
      />,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-label')).toBe('Session detail: Implement auth flow');
  });

  it('handles missing optional data gracefully', () => {
    render(
      <SessionDetailOverlay
        session={makeSession({
          developerTake: undefined,
          context: undefined,
          skills: undefined,
          executionPath: undefined,
          toolBreakdown: undefined,
          filesChanged: undefined,
          qaPairs: undefined,
          rawLog: [],
        })}
        projectName="heyi-am"
        projectDirName="heyi-am"
        onClose={() => {}}
      />,
    );
    // Should render without crashing
    expect(screen.getByText('Implement auth flow')).toBeTruthy();
    // Optional sections should not appear
    expect(screen.queryByText('DEVELOPER TAKE')).toBeNull();
    expect(screen.queryByText('APPLIED SKILLS')).toBeNull();
    expect(screen.queryByText('EXECUTION PATH')).toBeNull();
    expect(screen.queryByText(/Tool Breakdown/)).toBeNull();
    expect(screen.queryByText(/Files Changed/)).toBeNull();
  });

  it('highlights execution steps with key words', () => {
    render(
      <SessionDetailOverlay
        session={makeSession({
          executionPath: [
            { stepNumber: 1, title: 'Setup', description: 'Basic setup' },
            { stepNumber: 2, title: 'Key decision', description: 'Chose architecture' },
            { stepNumber: 3, title: 'Implement', description: 'A critical pivot in approach' },
          ],
        })}
        projectName="heyi-am"
        projectDirName="heyi-am"
        onClose={() => {}}
      />,
    );
    // Highlights section should show steps with key/decision/pivot/critical words
    expect(screen.getByText('HIGHLIGHTS')).toBeTruthy();
    // "Key decision" appears in both exec path and highlights, so use getAllByText
    const matches = screen.getAllByText('Key decision');
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('shows loading state then AgentTimeline for session with childCount > 0', async () => {
    const childStart = new Date('2026-03-20T10:00:00Z');
    const fullSession = makeSession({
      id: 'ses-orch',
      isOrchestrated: true,
      childCount: 2,
      children: [
        {
          sessionId: 'c1',
          role: 'frontend-dev',
          date: childStart.toISOString(),
          durationMinutes: 10,
          linesOfCode: 50,
        },
        {
          sessionId: 'c2',
          role: 'backend-dev',
          date: childStart.toISOString(),
          durationMinutes: 15,
          linesOfCode: 70,
        },
      ],
    });
    mockFetchSession.mockResolvedValueOnce(fullSession);

    const { container } = render(
      <SessionDetailOverlay
        session={makeSession({ id: 'ses-orch', childCount: 2 })}
        projectName="heyi-am"
        projectDirName="heyi-am"
        onClose={() => {}}
      />,
    );

    // Initially shows loading
    expect(screen.getByText('Loading agent activity...')).toBeTruthy();

    // After fetch resolves, should show the AGENT ACTIVITY section with fork circles
    await waitFor(() => {
      expect(screen.getByText('AGENT ACTIVITY')).toBeTruthy();
      const forkCircles = container.querySelectorAll('[data-testid="fork-circle"]');
      expect(forkCircles.length).toBeGreaterThan(0);
    });

    expect(mockFetchSession).toHaveBeenCalledWith('heyi-am', 'ses-orch');
  });

  it('does not fetch or show timeline when childCount is 0', () => {
    mockFetchSession.mockClear();
    render(
      <SessionDetailOverlay
        session={makeSession({ childCount: 0 })}
        projectName="heyi-am"
        projectDirName="heyi-am"
        onClose={() => {}}
      />,
    );
    expect(mockFetchSession).not.toHaveBeenCalled();
    expect(screen.queryByText('Loading agent activity...')).toBeNull();
    expect(screen.queryByText('AGENT ACTIVITY')).toBeNull();
  });

  it('renders AgentTimeline directly when children already present', () => {
    mockFetchSession.mockClear();
    const childStart = new Date('2026-03-20T10:00:00Z');
    const { container } = render(
      <SessionDetailOverlay
        session={makeSession({
          childCount: 2,
          isOrchestrated: true,
          children: [
            {
              sessionId: 'c1',
              role: 'frontend-dev',
              date: childStart.toISOString(),
              durationMinutes: 10,
              linesOfCode: 50,
            },
            {
              sessionId: 'c2',
              role: 'backend-dev',
              date: childStart.toISOString(),
              durationMinutes: 15,
              linesOfCode: 70,
            },
          ],
        })}
        projectName="heyi-am"
        projectDirName="heyi-am"
        onClose={() => {}}
      />,
    );
    // Should not fetch since children already present
    expect(mockFetchSession).not.toHaveBeenCalled();
    // Should show timeline immediately
    expect(screen.getByText('AGENT ACTIVITY')).toBeTruthy();
    const forkCircles = container.querySelectorAll('[data-testid="fork-circle"]');
    expect(forkCircles.length).toBeGreaterThan(0);
  });

  it('handles fetch error gracefully without showing timeline', async () => {
    mockFetchSession.mockRejectedValueOnce(new Error('Network error'));

    render(
      <SessionDetailOverlay
        session={makeSession({ id: 'ses-fail', childCount: 3 })}
        projectName="heyi-am"
        projectDirName="heyi-am"
        onClose={() => {}}
      />,
    );

    // After fetch fails, loading disappears and no AGENT ACTIVITY section shows
    await waitFor(() => {
      expect(screen.queryByText('Loading agent activity...')).toBeNull();
    });
    expect(screen.queryByText('AGENT ACTIVITY')).toBeNull();
  });
});
