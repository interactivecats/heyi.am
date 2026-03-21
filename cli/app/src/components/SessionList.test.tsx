import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { SessionList } from './SessionList';
import { MOCK_SESSIONS, MOCK_PROJECTS } from '../mock-data';
import type { Session, Project } from '../types';

function renderSessionList(props: Parameters<typeof SessionList>[0] = {}) {
  // When no sessions prop is provided, default to mock data so tests
  // don't depend on the SessionsContext provider / API fetch.
  const defaulted = {
    sessions: MOCK_SESSIONS,
    projects: MOCK_PROJECTS,
    ...props,
  };
  return render(
    <MemoryRouter>
      <SessionList {...defaulted} />
    </MemoryRouter>,
  );
}

describe('SessionList — empty state', () => {
  it('renders "No sessions found" when sessions and projects are empty', () => {
    renderSessionList({ sessions: [], projects: [] });
    expect(screen.getByText('No sessions found')).toBeInTheDocument();
  });

  it('renders setup banner in empty state', () => {
    renderSessionList({ sessions: [], projects: [] });
    expect(screen.getByTestId('setup-banner')).toBeInTheDocument();
    expect(
      screen.getByText('Add your Anthropic API key to enable AI summaries'),
    ).toBeInTheDocument();
  });

  it('renders Settings button that links to settings', () => {
    renderSessionList({ sessions: [], projects: [] });
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('shows ~/.claude/projects path hint', () => {
    renderSessionList({ sessions: [], projects: [] });
    expect(screen.getByText('~/.claude/projects')).toBeInTheDocument();
  });

  it('shows claude command hint', () => {
    renderSessionList({ sessions: [], projects: [] });
    expect(screen.getByText(/\$ claude/)).toBeInTheDocument();
  });

  it('does not render sidebar in empty state', () => {
    renderSessionList({ sessions: [], projects: [] });
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });
});

describe('SessionList — populated state', () => {
  it('renders the selected project name as heading', () => {
    renderSessionList();
    // First project is selected by default — appears in both sidebar and heading
    const matches = screen.getAllByText('auth-service');
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it('renders project list in sidebar', () => {
    renderSessionList();
    expect(screen.getByText('Projects')).toBeInTheDocument();
    expect(screen.getByText('data-pipeline')).toBeInTheDocument();
    expect(screen.getByText('ui-components')).toBeInTheDocument();
    expect(screen.getByText('api-gateway')).toBeInTheDocument();
  });

  it('renders sidebar stats section with Enhanced count', () => {
    renderSessionList();
    expect(screen.getByText('Stats')).toBeInTheDocument();
    expect(screen.getByText(/Sessions:/)).toBeInTheDocument();
    expect(screen.getByText(/Enhanced:/)).toBeInTheDocument();
    expect(screen.getByText(/Published:/)).toBeInTheDocument();
  });

  it('renders session rows with titles', () => {
    renderSessionList();
    expect(
      screen.getByText('Refactor JWT middleware to support refresh tokens'),
    ).toBeInTheDocument();
  });

  it('renders table column headers', () => {
    renderSessionList();
    expect(screen.getByText('Session')).toBeInTheDocument();
    expect(screen.getByText('Duration')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
  });

  it('renders session duration in "X min" format', () => {
    renderSessionList();
    expect(screen.getByText('47 min')).toBeInTheDocument();
  });

  it('renders status chips', () => {
    renderSessionList();
    expect(screen.getByText('PUBLISHED')).toBeInTheDocument();
    expect(screen.getByText('DRAFT')).toBeInTheDocument();
  });

  it('renders search input', () => {
    renderSessionList();
    expect(screen.getByPlaceholderText('Search sessions...')).toBeInTheDocument();
  });

  it('clicking a project filters sessions to that project', async () => {
    const user = userEvent.setup();
    renderSessionList();

    await user.click(screen.getByText('ui-components'));

    expect(
      screen.getByText('Implement accessible dropdown component'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Refactor JWT middleware to support refresh tokens'),
    ).not.toBeInTheDocument();
  });

  it('clicking a session shows its raw log in preview', async () => {
    const user = userEvent.setup();
    renderSessionList();

    await user.click(
      screen.getByText('Refactor JWT middleware to support refresh tokens'),
    );

    expect(
      screen.getByText(/The existing auth was frankencode/),
    ).toBeInTheDocument();
  });

  it('renders "Enhance with AI" button in preview panel', () => {
    renderSessionList();
    expect(screen.getByText('Enhance with AI')).toBeInTheDocument();
  });

  it('renders "Enhancement requires API key" subtitle under enhance button', () => {
    renderSessionList();
    expect(screen.getByText('Enhancement requires API key')).toBeInTheDocument();
  });

  it('renders preview panel header', () => {
    renderSessionList();
    expect(screen.getByText('Raw Session Log Preview')).toBeInTheDocument();
  });

  it('shows session count in subtitle', () => {
    renderSessionList();
    expect(screen.getByText(/sessions/)).toBeInTheDocument();
  });
});

/* ==========================================================================
   Agent hierarchy tests
   ========================================================================== */

const HIERARCHY_DIR = '-Users-test-Dev-myapp';

const PARENT_SESSION: Session = {
  id: 'parent-1',
  title: 'Build the auth system',
  date: '2026-03-20T10:00:00Z',
  durationMinutes: 38,
  turns: 12,
  linesOfCode: 792,
  status: 'draft',
  projectName: HIERARCHY_DIR,
  rawLog: ['> Build the auth system', 'Starting orchestration...'],
  childCount: 3,
  children: [
    { sessionId: 'child-1', role: 'frontend-dev', title: 'Built login UI', durationMinutes: 12, linesOfCode: 247 },
    { sessionId: 'child-2', role: 'backend-dev', title: 'Built API endpoints', durationMinutes: 18, linesOfCode: 389 },
    { sessionId: 'child-3', role: 'qa-engineer', title: 'Wrote test suite', durationMinutes: 8, linesOfCode: 156 },
  ],
};

const SOLO_SESSION: Session = {
  id: 'solo-1',
  title: 'Fix a small bug',
  date: '2026-03-19T10:00:00Z',
  durationMinutes: 5,
  turns: 3,
  linesOfCode: 10,
  status: 'draft',
  projectName: HIERARCHY_DIR,
  rawLog: ['> Fix the bug'],
};

const HIERARCHY_PROJECTS: Project[] = [
  { name: 'myapp', dirName: HIERARCHY_DIR, sessionCount: 2, description: '' },
];

function renderHierarchy() {
  return renderSessionList({
    sessions: [PARENT_SESSION, SOLO_SESSION],
    projects: HIERARCHY_PROJECTS,
  });
}

describe('SessionList — agent hierarchy', () => {
  it('renders agent count badge on parent row', () => {
    renderHierarchy();
    expect(screen.getByTestId('agent-count')).toHaveTextContent('3 agents');
  });

  it('shows disclosure triangle on parent row', () => {
    renderHierarchy();
    expect(screen.getByTestId('disclosure-toggle')).toBeInTheDocument();
  });

  it('children are collapsed by default', () => {
    renderHierarchy();
    expect(screen.queryByTestId('child-row')).not.toBeInTheDocument();
  });

  it('clicking disclosure triangle expands children', async () => {
    const user = userEvent.setup();
    renderHierarchy();
    await user.click(screen.getByTestId('disclosure-toggle'));
    const childRows = screen.getAllByTestId('child-row');
    expect(childRows).toHaveLength(3);
  });

  it('child rows show role label', async () => {
    const user = userEvent.setup();
    renderHierarchy();
    await user.click(screen.getByTestId('disclosure-toggle'));
    const roles = screen.getAllByTestId('child-role');
    expect(roles[0]).toHaveTextContent('frontend-dev');
    expect(roles[1]).toHaveTextContent('backend-dev');
    expect(roles[2]).toHaveTextContent('qa-engineer');
  });

  it('child rows do not show status chip', async () => {
    const user = userEvent.setup();
    renderHierarchy();
    await user.click(screen.getByTestId('disclosure-toggle'));
    const container = screen.getByTestId('children-container');
    expect(container.querySelector('.chip')).toBeNull();
  });

  it('solo session has no disclosure triangle', () => {
    renderHierarchy();
    expect(screen.getByText('Fix a small bug')).toBeInTheDocument();
    // Only one disclosure toggle (for the parent)
    expect(screen.getAllByTestId('disclosure-toggle')).toHaveLength(1);
  });

  it('selecting parent with children shows orchestration preview', async () => {
    const user = userEvent.setup();
    renderHierarchy();
    await user.click(screen.getByText('Build the auth system'));
    expect(screen.getByText('Orchestration Summary')).toBeInTheDocument();
    expect(screen.getByTestId('orchestration-preview')).toBeInTheDocument();
  });
});

describe('SessionList — 5+ children truncation', () => {
  const MANY_CHILDREN_SESSION: Session = {
    ...PARENT_SESSION,
    id: 'parent-many',
    childCount: 7,
    children: Array.from({ length: 7 }, (_, i) => ({
      sessionId: `child-${i}`,
      role: `agent-${i}`,
      title: `Task ${i}`,
    })),
  };

  function renderManyChildren() {
    return renderSessionList({
      sessions: [MANY_CHILDREN_SESSION],
      projects: HIERARCHY_PROJECTS,
    });
  }

  it('shows first 5 children and expand-more link', async () => {
    const user = userEvent.setup();
    renderManyChildren();
    await user.click(screen.getByTestId('disclosure-toggle'));
    const childRows = screen.getAllByTestId('child-row');
    expect(childRows).toHaveLength(5);
    expect(screen.getByTestId('expand-more')).toHaveTextContent('2 more agents');
  });

  it('clicking expand-more shows all children', async () => {
    const user = userEvent.setup();
    renderManyChildren();
    await user.click(screen.getByTestId('disclosure-toggle'));
    await user.click(screen.getByTestId('expand-more'));
    const childRows = screen.getAllByTestId('child-row');
    expect(childRows).toHaveLength(7);
    expect(screen.queryByTestId('expand-more')).not.toBeInTheDocument();
  });
});
