import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { SessionList } from './SessionList';

function renderSessionList(props: Parameters<typeof SessionList>[0] = {}) {
  return render(
    <MemoryRouter>
      <SessionList {...props} />
    </MemoryRouter>,
  );
}

describe('SessionList — empty state', () => {
  it('renders "No sessions found" when sessions array is empty', () => {
    renderSessionList({ sessions: [] });
    expect(screen.getByText('No sessions found')).toBeInTheDocument();
  });

  it('renders setup banner in empty state', () => {
    renderSessionList({ sessions: [] });
    expect(screen.getByTestId('setup-banner')).toBeInTheDocument();
    expect(
      screen.getByText('Add your Anthropic API key to enable AI summaries'),
    ).toBeInTheDocument();
  });

  it('renders Settings button that links to settings', () => {
    renderSessionList({ sessions: [] });
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('shows ~/.claude/projects path hint', () => {
    renderSessionList({ sessions: [] });
    expect(screen.getByText('~/.claude/projects')).toBeInTheDocument();
  });

  it('shows claude command hint', () => {
    renderSessionList({ sessions: [] });
    expect(screen.getByText(/\$ claude/)).toBeInTheDocument();
  });

  it('does not render sidebar in empty state', () => {
    renderSessionList({ sessions: [] });
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

  it('renders sidebar stats section', () => {
    renderSessionList();
    expect(screen.getByText('Stats')).toBeInTheDocument();
    expect(screen.getByText(/Sessions:/)).toBeInTheDocument();
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

  it('renders "Requires API key" subtitle under enhance button', () => {
    renderSessionList();
    expect(screen.getByText('Requires API key')).toBeInTheDocument();
  });

  it('renders preview panel header', () => {
    renderSessionList();
    expect(screen.getByText('Raw Session Log Preview')).toBeInTheDocument();
  });

  it('shows project description in subtitle when project is selected', () => {
    renderSessionList();
    expect(screen.getByText(/JWT auth and OAuth provider layer/)).toBeInTheDocument();
  });
});
