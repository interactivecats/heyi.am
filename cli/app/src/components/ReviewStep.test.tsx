/**
 * Unit tests: ReviewStep (Screen 47) + ProjectPreview overlay
 *
 * Tests the review step of the project upload wizard — the final screen
 * before publishing. Verifies rendering of all sections, controlled inputs,
 * action button callbacks, and the full-screen project preview overlay.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ReviewStep } from './ProjectUploadFlow';
import type { Project, Session } from '../types';

// Mock the render preview API — returns HTML matching the server-rendered body
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    fetchRenderPreview: vi.fn().mockResolvedValue({
      html: `<div class="project-preview__content" data-render-version="1" data-template="editorial">
        <div class="project-preview__breadcrumb"><a href="/preview">preview</a> / heyi.am</div>
        <h1 class="project-preview__title">heyi.am</h1>
        <div class="project-preview__narrative">A full-stack portfolio platform built with React and Elixir.</div>
        <div class="project-preview__skills"><span class="chip">React</span></div>
        <div class="project-preview__hero-stats">
          <div class="project-preview__hero-stat"><div class="project-preview__hero-value">16.3h</div><div class="project-preview__hero-label">Total Time</div></div>
          <div class="project-preview__hero-stat"><div class="project-preview__hero-value">21 (2)</div><div class="project-preview__hero-label">Sessions</div></div>
          <div class="project-preview__hero-stat"><div class="project-preview__hero-value">14.2k</div><div class="project-preview__hero-label">LOC</div></div>
          <div class="project-preview__hero-stat"><div class="project-preview__hero-value">87</div><div class="project-preview__hero-label">Files</div></div>
        </div>
        <div class="project-preview__timeline-heading">WORK TIMELINE</div>
        <div data-work-timeline></div>
        <div class="project-preview__timeline-heading">PROJECT TIMELINE</div>
        <div class="timeline"><div class="timeline__line"></div>
          <div class="timeline__period"><div class="timeline__period-header"><span class="timeline__period-date">Mar 3–7</span><span class="timeline__period-sep">—</span><span class="timeline__period-label">Foundation</span></div></div>
          <div class="timeline__period"><div class="timeline__period-header"><span class="timeline__period-date">Mar 10–14</span><span class="timeline__period-sep">—</span><span class="timeline__period-label">Core</span></div></div>
        </div>
        <div class="project-preview__timeline-heading">PROJECT GROWTH</div>
        <div data-growth-chart></div>
        <div data-directory-heatmap></div>
        <div class="project-preview__sessions-heading">SESSIONS</div>
        <div class="project-preview__sessions-grid">
          <div class="project-preview__session-card"><h3 class="project-preview__session-title">Project scaffolding &amp; architecture</h3></div>
          <div class="project-preview__session-card"><h3 class="project-preview__session-title">API design</h3></div>
        </div>
      </div>`,
    }),
  };
});

// Mock AuthContext
vi.mock('../AuthContext', () => ({
  useAuth: () => ({ authenticated: true, username: 'preview', loading: false, login: vi.fn(), refresh: vi.fn() }),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PROJECT: Project = {
  name: 'heyi.am',
  dirName: 'heyi-am',
  sessionCount: 21,
  description: 'Portfolio platform for developers',
  totalLoc: 14200,
  totalDuration: 980,
  totalFiles: 87,
  skills: ['React', 'TypeScript', 'Elixir'],
  dateRange: '2026-03-01|2026-03-21',
  lastSessionDate: '2026-03-21',
};

const TIMELINE = [
  {
    period: 'Mar 3\u20137',
    label: 'Foundation',
    sessions: [
      {
        sessionId: 'sess-1',
        title: 'Project scaffolding & architecture',
        description: 'Set up the monorepo structure.',
        duration: 145,
        featured: true,
        tag: 'KEY DECISION',
        skills: ['Architecture'],
        date: '2026-03-03',
      },
      {
        sessionId: 'sess-2',
        title: 'Dependency setup',
        duration: 30,
        featured: false,
        date: '2026-03-04',
      },
    ],
  },
  {
    period: 'Mar 10\u201314',
    label: 'Core',
    sessions: [
      {
        sessionId: 'sess-3',
        title: 'API design',
        description: 'Designed endpoints.',
        duration: 210,
        featured: true,
        skills: ['API Design'],
        date: '2026-03-10',
      },
    ],
  },
];

const SESSIONS: Session[] = [
  {
    id: 'sess-1',
    title: 'Project scaffolding & architecture',
    date: '2026-03-03',
    durationMinutes: 145,
    turns: 77,
    linesOfCode: 2400,
    status: 'enhanced',
    projectName: 'heyi.am',
    rawLog: [],
    skills: ['Architecture', 'React'],
    filesChanged: Array.from({ length: 34 }, (_, i) => ({
      path: `file${i}.ts`,
      additions: 10,
      deletions: 2,
    })) as any,
  },
  {
    id: 'sess-3',
    title: 'API design',
    date: '2026-03-10',
    durationMinutes: 210,
    turns: 45,
    linesOfCode: 1800,
    status: 'enhanced',
    projectName: 'heyi.am',
    rawLog: [],
    skills: ['API Design', 'TypeScript'],
  },
];

function renderReview(overrides: Partial<Parameters<typeof ReviewStep>[0]> = {}) {
  const defaults = {
    project: PROJECT,
    narrative: 'A full-stack portfolio platform built with React and Elixir.',
    selectedCount: 8,
    skippedCount: 13,
    skills: ['React', 'TypeScript', 'Elixir'],
    timeline: TIMELINE,
    sessions: SESSIONS,
    repoUrl: 'https://github.com/user/heyi-am',
    onRepoUrlChange: vi.fn(),
    projectUrl: '',
    onProjectUrlChange: vi.fn(),
    onPublish: vi.fn(),
    onSaveLocal: vi.fn(),
    onBack: vi.fn(),
  };

  const props = { ...defaults, ...overrides };

  return {
    props,
    ...render(
      <MemoryRouter>
        <ReviewStep {...props} />
      </MemoryRouter>,
    ),
  };
}

// ===========================================================================
// Tests
// ===========================================================================

describe('ReviewStep', () => {
  it('renders the status line with selected count', () => {
    renderReview();
    expect(screen.getByText(/8 sessions enhanced/)).toBeInTheDocument();
    expect(screen.getByText(/Project narrative generated/)).toBeInTheDocument();
    expect(screen.getByText(/Timeline built/)).toBeInTheDocument();
  });

  it('renders the title', () => {
    renderReview();
    expect(screen.getByRole('heading', { level: 2, name: /review your project/i })).toBeInTheDocument();
  });

  it('renders the project card with name and narrative', () => {
    renderReview();
    expect(screen.getByRole('heading', { level: 3, name: 'heyi.am' })).toBeInTheDocument();
    expect(screen.getByText(/full-stack portfolio platform/)).toBeInTheDocument();
  });

  it('renders stat cards with correct values', () => {
    renderReview();
    expect(screen.getByText('21 (8 published)')).toBeInTheDocument();
    expect(screen.getByText('16h')).toBeInTheDocument(); // 980 min, rounds at >= 10h
    expect(screen.getByText('14.2k')).toBeInTheDocument(); // 14200 LOC
    expect(screen.getByText('87')).toBeInTheDocument();     // files
  });

  it('renders skill chips', () => {
    renderReview();
    expect(screen.getByText('React')).toBeInTheDocument();
    expect(screen.getByText('TypeScript')).toBeInTheDocument();
    expect(screen.getByText('Elixir')).toBeInTheDocument();
  });

  it('renders the "What gets published" checklist', () => {
    renderReview();
    expect(screen.getByText('Project narrative and timeline')).toBeInTheDocument();
    expect(screen.getByText('8 enhanced session case studies')).toBeInTheDocument();
    expect(screen.getByText('Aggregate stats from all sessions')).toBeInTheDocument();
    expect(screen.getByText('Growth chart, heatmap, and top files')).toBeInTheDocument();
  });

  it('renders skipped sessions count when > 0', () => {
    renderReview({ skippedCount: 5 });
    expect(screen.getByText('5 skipped sessions (metadata only)')).toBeInTheDocument();
  });

  it('does not render skipped line when skippedCount is 0', () => {
    renderReview({ skippedCount: 0 });
    expect(screen.queryByText(/skipped sessions/)).not.toBeInTheDocument();
  });

  it('renders the repo URL input pre-filled with auto-detected badge', () => {
    renderReview({ repoUrl: 'https://github.com/user/heyi-am' });
    const input = screen.getByLabelText(/Repository URL/i) as HTMLInputElement;
    expect(input.value).toBe('https://github.com/user/heyi-am');
    expect(screen.getByText(/auto-detected/)).toBeInTheDocument();
  });

  it('does not show auto-detected badge when repoUrl is empty', () => {
    renderReview({ repoUrl: '' });
    expect(screen.queryByText(/auto-detected/)).not.toBeInTheDocument();
  });

  it('calls onRepoUrlChange when typing in repo input', async () => {
    const user = userEvent.setup();
    const { props } = renderReview({ repoUrl: '' });
    const input = screen.getByLabelText(/Repository URL/i);
    await user.type(input, 'h');
    expect(props.onRepoUrlChange).toHaveBeenCalledWith('h');
  });

  it('calls onProjectUrlChange when typing in project URL input', async () => {
    const user = userEvent.setup();
    const { props } = renderReview({ projectUrl: '' });
    const input = screen.getByLabelText(/Project URL/i);
    await user.type(input, 'h');
    expect(props.onProjectUrlChange).toHaveBeenCalledWith('h');
  });

  it('shows auto-capture hint when project URL is set', () => {
    renderReview({ projectUrl: 'https://example.com' });
    expect(screen.getByText(/auto-capture from url/i)).toBeInTheDocument();
  });

  it('hides screenshot hint when project URL is empty', () => {
    renderReview({ projectUrl: '' });
    expect(screen.queryByText('Auto-captured from project URL on publish')).not.toBeInTheDocument();
  });

  it('calls onBack when "Back to timeline" is clicked', async () => {
    const user = userEvent.setup();
    const { props } = renderReview();
    await user.click(screen.getByRole('button', { name: /back to timeline/i }));
    expect(props.onBack).toHaveBeenCalledOnce();
  });

  // Publish flow test requires full SSE stream mock — covered in integration tests
  it.skip('calls onPublish when "Publish project" is clicked', async () => {
    const user = userEvent.setup();
    const { props } = renderReview();
    await user.click(screen.getByRole('button', { name: /publish project/i }));
    expect(props.onPublish).toHaveBeenCalledOnce();
  });

  it('hides narrative paragraph when narrative is empty', () => {
    const { container } = renderReview({ narrative: '' });
    expect(container.querySelector('.review-card__narrative')).not.toBeInTheDocument();
  });

  // =========================================================================
  // Preview link and overlay
  // =========================================================================

  it('renders the "Preview full project page" link', () => {
    renderReview();
    const link = screen.getByRole('link', { name: /preview full project page/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/preview/project/heyi-am');
    expect(link).toHaveAttribute('target', '_blank');
  });

  // Detailed HTML structure tests (stats, bar widths, skill chips, etc.) are covered
  // in cli/src/render/index.test.tsx where renderProjectHtml() is tested directly.
  // The preview overlay tests only verify the fetch + display integration.

  // Timeline card interactions are now handled by the standalone preview page
  // at /preview/project/:dirName — tested via E2E tests, not unit tests
});
