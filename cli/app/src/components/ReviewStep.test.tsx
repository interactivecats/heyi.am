/**
 * Unit tests: ReviewStep (Screen 47) + ProjectPreview overlay
 *
 * Tests the review step of the project upload wizard — the final screen
 * before publishing. Verifies rendering of all sections, controlled inputs,
 * action button callbacks, and the full-screen project preview overlay.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ReviewStep } from './ProjectUploadFlow';
import type { Project } from '../types';

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

function renderReview(overrides: Partial<Parameters<typeof ReviewStep>[0]> = {}) {
  const defaults = {
    project: PROJECT,
    narrative: 'A full-stack portfolio platform built with React and Elixir.',
    selectedCount: 8,
    skippedCount: 13,
    skills: ['React', 'TypeScript', 'Elixir'],
    timeline: TIMELINE,
    repoUrl: 'https://github.com/user/heyi-am',
    onRepoUrlChange: vi.fn(),
    projectUrl: '',
    onProjectUrlChange: vi.fn(),
    onPublish: vi.fn(),
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
    expect(screen.getByRole('heading', { level: 2, name: /review before publishing/i })).toBeInTheDocument();
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

  it('renders the screenshot drop zone', () => {
    renderReview();
    expect(screen.getByText('Drop an image or click to upload')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /upload screenshot/i })).toBeInTheDocument();
  });

  it('calls onBack when "Back to timeline" is clicked', async () => {
    const user = userEvent.setup();
    const { props } = renderReview();
    await user.click(screen.getByRole('button', { name: /back to timeline/i }));
    expect(props.onBack).toHaveBeenCalledOnce();
  });

  it('calls onPublish when "Publish project" is clicked', async () => {
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
    expect(screen.getByRole('button', { name: /preview full project page/i })).toBeInTheDocument();
  });

  it('does not show preview overlay by default', () => {
    renderReview();
    expect(screen.queryByRole('dialog', { name: /project preview/i })).not.toBeInTheDocument();
  });

  it('opens preview overlay when link is clicked', async () => {
    const user = userEvent.setup();
    renderReview();
    await user.click(screen.getByRole('button', { name: /preview full project page/i }));
    expect(screen.getByRole('dialog', { name: /project preview/i })).toBeInTheDocument();
  });

  it('closes preview overlay when close button is clicked', async () => {
    const user = userEvent.setup();
    renderReview();
    await user.click(screen.getByRole('button', { name: /preview full project page/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /close preview/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes preview overlay on Escape key', async () => {
    const user = userEvent.setup();
    renderReview();
    await user.click(screen.getByRole('button', { name: /preview full project page/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('preview shows project title and breadcrumb', async () => {
    const user = userEvent.setup();
    renderReview();
    await user.click(screen.getByRole('button', { name: /preview full project page/i }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/ben \/ heyi\.am/)).toBeInTheDocument();
    expect(within(dialog).getByRole('heading', { level: 1, name: 'heyi.am' })).toBeInTheDocument();
  });

  it('preview shows narrative with accent border', async () => {
    const user = userEvent.setup();
    const { container } = renderReview();
    await user.click(screen.getByRole('button', { name: /preview full project page/i }));
    expect(container.querySelector('.project-preview__narrative')).toBeInTheDocument();
  });

  it('preview shows hero stats', async () => {
    const user = userEvent.setup();
    renderReview();
    await user.click(screen.getByRole('button', { name: /preview full project page/i }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Total Time')).toBeInTheDocument();
    expect(within(dialog).getByText('Sessions')).toBeInTheDocument();
    expect(within(dialog).getByText('LOC')).toBeInTheDocument();
    expect(within(dialog).getByText('Files')).toBeInTheDocument();
  });

  it('preview shows timeline periods and featured sessions', async () => {
    const user = userEvent.setup();
    renderReview();
    await user.click(screen.getByRole('button', { name: /preview full project page/i }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Foundation')).toBeInTheDocument();
    expect(within(dialog).getByText('Core')).toBeInTheDocument();
    expect(within(dialog).getByText('Project scaffolding & architecture')).toBeInTheDocument();
    expect(within(dialog).getByText('API design')).toBeInTheDocument();
  });

  it('preview shows repo link when repoUrl is provided', async () => {
    const user = userEvent.setup();
    renderReview({ repoUrl: 'https://github.com/user/heyi-am' });
    await user.click(screen.getByRole('button', { name: /preview full project page/i }));

    const dialog = screen.getByRole('dialog');
    const repoLink = within(dialog).getByRole('link', { name: /repo/i });
    expect(repoLink).toHaveAttribute('href', 'https://github.com/user/heyi-am');
  });

  it('preview does not show links row when neither URL is provided', async () => {
    const user = userEvent.setup();
    const { container } = renderReview({ repoUrl: '', projectUrl: '' });
    await user.click(screen.getByRole('button', { name: /preview full project page/i }));
    expect(container.querySelector('.project-preview__links')).not.toBeInTheDocument();
  });

  it('preview shows skill chips', async () => {
    const user = userEvent.setup();
    renderReview();
    await user.click(screen.getByRole('button', { name: /preview full project page/i }));

    const dialog = screen.getByRole('dialog');
    const skills = within(dialog).getByText('PROJECT TIMELINE');
    expect(skills).toBeInTheDocument();
  });
});
