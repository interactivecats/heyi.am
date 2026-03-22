/**
 * Integration tests for ProjectDashboard.
 *
 * Tests the dashboard rendering against real API data shapes:
 * Published badge, "Update Project" vs "Upload" button text,
 * enhanced state, and empty state.
 *
 * The SessionsProvider fetches from the real api module (spied here),
 * so the data flows through the real context -> component pipeline.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SessionsProvider } from '../SessionsContext';
import { ProjectDashboard } from './ProjectDashboard';
import * as api from '../api';
import type { ApiProject } from '../api';

// ── Fixtures ─────────────────────────────────────────────────────

const BASE_PROJECT: ApiProject = {
  name: 'heyi.am',
  dirName: '-Users-test-Dev-heyi-am',
  sessionCount: 12,
  description: 'Portfolio platform',
  totalLoc: 8400,
  totalDuration: 620,
  totalFiles: 54,
  skills: ['TypeScript', 'React', 'Elixir'],
  dateRange: '2026-03-01|2026-03-20',
  lastSessionDate: '2026-03-20T14:00:00Z',
};

function publishedProject(overrides: Partial<ApiProject> = {}): ApiProject {
  return {
    ...BASE_PROJECT,
    isPublished: true,
    publishedSessionCount: 8,
    publishedSessions: ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'],
    enhancedAt: '2026-03-20T12:00:00Z',
    ...overrides,
  };
}

function freshProject(overrides: Partial<ApiProject> = {}): ApiProject {
  return {
    ...BASE_PROJECT,
    isPublished: false,
    publishedSessionCount: 0,
    publishedSessions: [],
    enhancedAt: null,
    ...overrides,
  };
}

function enhancedProject(overrides: Partial<ApiProject> = {}): ApiProject {
  return {
    ...BASE_PROJECT,
    isPublished: false,
    publishedSessionCount: 0,
    publishedSessions: [],
    enhancedAt: '2026-03-19T10:00:00Z',
    ...overrides,
  };
}

// ── Helpers ──────────────────────────────────────────────────────

function renderDashboard() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <SessionsProvider>
        <ProjectDashboard />
      </SessionsProvider>
    </MemoryRouter>,
  );
}

/** Find the primary action <button> inside a project card (not the card itself). */
function findPrimaryButton(container: HTMLElement): HTMLButtonElement | null {
  return container.querySelector('button.btn--primary');
}

// ── Tests ────────────────────────────────────────────────────────

describe('ProjectDashboard', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api, 'fetchSessions').mockResolvedValue([]);
  });

  describe('published project', () => {
    it('renders "Published" badge for published projects', async () => {
      vi.spyOn(api, 'fetchProjects').mockResolvedValue([publishedProject()]);
      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText('Published')).toBeInTheDocument();
      });
    });

    it('renders "Update Project" as the primary action button', async () => {
      vi.spyOn(api, 'fetchProjects').mockResolvedValue([publishedProject()]);
      const { container } = renderDashboard();

      await waitFor(() => {
        const btn = findPrimaryButton(container);
        expect(btn).not.toBeNull();
        expect(btn!.textContent).toContain('Update Project');
      });
    });
  });

  describe('new project (never published, never enhanced)', () => {
    it('renders "Upload" as the primary action button', async () => {
      vi.spyOn(api, 'fetchProjects').mockResolvedValue([freshProject()]);
      const { container } = renderDashboard();

      await waitFor(() => {
        const btn = findPrimaryButton(container);
        expect(btn).not.toBeNull();
        expect(btn!.textContent).toContain('Upload');
        expect(btn!.textContent).not.toContain('Update Project');
        expect(btn!.textContent).not.toContain('Re-enhance');
      });
    });

    it('does not show "Published" badge', async () => {
      vi.spyOn(api, 'fetchProjects').mockResolvedValue([freshProject()]);
      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText('Your Projects')).toBeInTheDocument();
      });
      expect(screen.queryByText('Published')).not.toBeInTheDocument();
    });

    it('does not show "Enhanced" badge', async () => {
      vi.spyOn(api, 'fetchProjects').mockResolvedValue([freshProject()]);
      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText('Your Projects')).toBeInTheDocument();
      });
      expect(screen.queryByText('Enhanced')).not.toBeInTheDocument();
    });
  });

  describe('enhanced but not published project', () => {
    it('renders "Enhanced" badge', async () => {
      vi.spyOn(api, 'fetchProjects').mockResolvedValue([enhancedProject()]);
      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText('Enhanced')).toBeInTheDocument();
      });
    });

    it('renders "Re-enhance" as the primary action button', async () => {
      vi.spyOn(api, 'fetchProjects').mockResolvedValue([enhancedProject()]);
      const { container } = renderDashboard();

      await waitFor(() => {
        const btn = findPrimaryButton(container);
        expect(btn).not.toBeNull();
        expect(btn!.textContent).toContain('Re-enhance');
      });
    });

    it('does not show "Published" badge', async () => {
      vi.spyOn(api, 'fetchProjects').mockResolvedValue([enhancedProject()]);
      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText('Enhanced')).toBeInTheDocument();
      });
      expect(screen.queryByText('Published')).not.toBeInTheDocument();
    });
  });

  describe('both published AND enhanced project', () => {
    it('shows both badges', async () => {
      vi.spyOn(api, 'fetchProjects').mockResolvedValue([publishedProject()]);
      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText('Published')).toBeInTheDocument();
        expect(screen.getByText('Enhanced')).toBeInTheDocument();
      });
    });

    it('shows "Update Project" button (published takes precedence)', async () => {
      vi.spyOn(api, 'fetchProjects').mockResolvedValue([publishedProject()]);
      const { container } = renderDashboard();

      await waitFor(() => {
        const btn = findPrimaryButton(container);
        expect(btn!.textContent).toContain('Update Project');
      });
    });
  });

  describe('empty state', () => {
    it('shows empty state when no projects exist', async () => {
      vi.spyOn(api, 'fetchProjects').mockResolvedValue([]);
      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText('No sessions found')).toBeInTheDocument();
      });
    });
  });

  describe('project stats', () => {
    it('shows session count and file count', async () => {
      vi.spyOn(api, 'fetchProjects').mockResolvedValue([freshProject()]);
      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText('12')).toBeInTheDocument();
        expect(screen.getByText('54')).toBeInTheDocument();
      });
    });

    it('shows skill chips', async () => {
      vi.spyOn(api, 'fetchProjects').mockResolvedValue([freshProject()]);
      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText('TypeScript')).toBeInTheDocument();
        expect(screen.getByText('React')).toBeInTheDocument();
        expect(screen.getByText('Elixir')).toBeInTheDocument();
      });
    });
  });

  describe('multiple projects with different states', () => {
    it('renders correct badge and button for each', async () => {
      vi.spyOn(api, 'fetchProjects').mockResolvedValue([
        publishedProject({ name: 'Published App', dirName: 'pub-app' }),
        freshProject({ name: 'New App', dirName: 'new-app' }),
      ]);
      const { container } = renderDashboard();

      await waitFor(() => {
        expect(screen.getByText('Published App')).toBeInTheDocument();
        expect(screen.getByText('New App')).toBeInTheDocument();
      });

      // Only the published project should have the "Published" badge
      const badges = screen.getAllByText('Published');
      expect(badges).toHaveLength(1);

      // Two primary buttons with different text
      const buttons = container.querySelectorAll('button.btn--primary');
      expect(buttons).toHaveLength(2);
      const texts = Array.from(buttons).map((b) => b.textContent);
      expect(texts.some((t) => t?.includes('Update Project'))).toBe(true);
      expect(texts.some((t) => t?.includes('Upload'))).toBe(true);
    });
  });
});
