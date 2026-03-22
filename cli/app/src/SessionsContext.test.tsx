import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { SessionsProvider, useSessionsContext } from './SessionsContext';
import * as api from './api';

function TestConsumer() {
  const { sessions, projects, loading, error } = useSessionsContext();
  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;
  return (
    <div>
      <div data-testid="session-count">{sessions.length} sessions</div>
      <div data-testid="project-count">{projects.length} projects</div>
    </div>
  );
}

describe('SessionsContext', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('shows loading state initially', () => {
    vi.spyOn(api, 'fetchProjects').mockReturnValue(new Promise(() => {}));
    render(
      <SessionsProvider>
        <TestConsumer />
      </SessionsProvider>,
    );
    expect(screen.getByText('Loading...')).toBeDefined();
  });

  it('provides projects after fetch and lazy-loads first project sessions', async () => {
    vi.spyOn(api, 'fetchProjects').mockResolvedValue([
      { name: 'test-project', dirName: 'test-dir', sessionCount: 1, description: 'A test', totalLoc: 100, totalDuration: 30, totalFiles: 5, skills: ['TypeScript'], dateRange: '2026-03-20|2026-03-20', lastSessionDate: '2026-03-20T00:00:00Z' },
    ]);
    vi.spyOn(api, 'fetchSessions').mockResolvedValue([
      {
        id: 'ses-test',
        title: 'Test Session',
        date: '2026-03-20T00:00:00Z',
        durationMinutes: 10,
        turns: 5,
        linesOfCode: 50,
        status: 'draft' as const,
        projectName: 'test-project',
        rawLog: ['> hello'],
      },
    ]);

    render(
      <SessionsProvider>
        <TestConsumer />
      </SessionsProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('project-count').textContent).toBe('1 projects');
    });

    // Sessions are lazy-loaded for the auto-selected first project
    await waitFor(() => {
      expect(screen.getByTestId('session-count').textContent).toBe('1 sessions');
    });

    // fetchSessions was called with the dirName, not the display name
    expect(api.fetchSessions).toHaveBeenCalledWith('test-dir');
  });

  it('shows error state when project fetch fails', async () => {
    vi.spyOn(api, 'fetchProjects').mockRejectedValue(new Error('Network error'));

    render(
      <SessionsProvider>
        <TestConsumer />
      </SessionsProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Error: Network error')).toBeDefined();
    });
  });
});
