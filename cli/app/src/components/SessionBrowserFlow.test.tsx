/**
 * Integration tests: Session Browser -> Detail -> Enhance -> Edit -> Publish
 *
 * Tests the full user flow across the session browsing experience,
 * verifying component rendering, navigation triggers, and user interactions.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SessionList } from './SessionList';
import { SessionDetail } from './SessionDetail';
import { EnhanceFlow } from './EnhanceFlow';
import { SessionEditorPage } from './SessionEditorPage';
import { MOCK_SESSIONS, MOCK_PROJECTS } from '../mock-data';
import * as api from '../api';
import type { EnhancementResult } from '../api';
import type { Session, Project } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MOCK_ENHANCEMENT: EnhancementResult = {
  title: 'Refactor JWT middleware to support refresh tokens',
  context: 'Legacy auth used symmetric HS256.',
  developerTake: 'Token rotation was the tricky part.',
  skills: ['Node.js', 'JWT Security', 'Ed25519'],
  questions: [
    { text: 'Why this approach?', suggestedAnswer: 'Simplest path.' },
    { text: 'What problem?', suggestedAnswer: 'Maintainability.' },
    { text: 'What differently?', suggestedAnswer: 'Tests first.' },
  ],
  executionSteps: [
    { stepNumber: 1, title: 'Audit middleware', body: 'Found HS256.' },
    { stepNumber: 2, title: 'Switch signing', body: 'Implemented EdDSA.' },
  ],
};

function renderSessionList(props: Partial<Parameters<typeof SessionList>[0]> = {}) {
  return render(
    <MemoryRouter>
      <SessionList sessions={MOCK_SESSIONS} projects={MOCK_PROJECTS} {...props} />
    </MemoryRouter>,
  );
}

function renderDetail(sessionId: string, hasApiKey = true) {
  return render(
    <MemoryRouter initialEntries={[`/session/${sessionId}`]}>
      <Routes>
        <Route path="/session/:id" element={<SessionDetail hasApiKey={hasApiKey} sessions={MOCK_SESSIONS} />} />
        <Route path="/session/:id/enhance" element={<div data-testid="enhance-page">Enhance Page</div>} />
        <Route path="/session/:id/edit" element={<div data-testid="editor-page">Editor Page</div>} />
        <Route path="/settings" element={<div>Settings Page</div>} />
        <Route path="/" element={<div>Home</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function renderEnhance(sessionId: string) {
  return render(
    <MemoryRouter initialEntries={[`/session/${sessionId}/enhance`]}>
      <Routes>
        <Route path="/session/:id/enhance" element={<EnhanceFlow sessions={MOCK_SESSIONS} />} />
        <Route path="/session/:id" element={<div>Detail Page</div>} />
        <Route path="/session/:id/edit" element={<div data-testid="editor-page">Editor Page</div>} />
        <Route path="/" element={<div>Home</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function renderEditor(sessionId: string, isAuthenticated = true) {
  return render(
    <MemoryRouter initialEntries={[`/session/${sessionId}/edit`]}>
      <Routes>
        <Route path="/session/:id/edit" element={<SessionEditorPage sessions={MOCK_SESSIONS} isAuthenticated={isAuthenticated} />} />
        <Route path="/" element={<div>Home</div>} />
        <Route path="/session/:id" element={<div>Detail Page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

// ===========================================================================
// Flow 1a: Session Browser
// ===========================================================================

describe('Session Browser — empty state', () => {
  it('renders "No sessions found" when sessions and projects are empty', () => {
    renderSessionList({ sessions: [], projects: [] });
    expect(screen.getByText('No sessions found')).toBeInTheDocument();
  });

  it('renders setup banner with API key prompt', () => {
    renderSessionList({ sessions: [], projects: [] });
    expect(screen.getByTestId('setup-banner')).toBeInTheDocument();
    expect(screen.getByText('Add your Anthropic API key to enable AI summaries')).toBeInTheDocument();
  });

  it('does not render sidebar when empty', () => {
    renderSessionList({ sessions: [], projects: [] });
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });
});

describe('Session Browser — populated state', () => {
  it('renders project list in sidebar', () => {
    renderSessionList();
    expect(screen.getByText('Projects')).toBeInTheDocument();
    for (const p of MOCK_PROJECTS) {
      // Active project name appears in both sidebar and heading
      expect(screen.getAllByText(p.name).length).toBeGreaterThanOrEqual(1);
    }
  });

  it('renders session cards with titles, durations, and status chips', () => {
    renderSessionList();
    expect(screen.getByText('Refactor JWT middleware to support refresh tokens')).toBeInTheDocument();
    expect(screen.getByText('47 min')).toBeInTheDocument();
    expect(screen.getByText('PUBLISHED')).toBeInTheDocument();
    expect(screen.getByText('DRAFT')).toBeInTheDocument();
  });

  it('renders preview panel with "Raw Session Log Preview" header', () => {
    renderSessionList();
    expect(screen.getByText('Raw Session Log Preview')).toBeInTheDocument();
  });

  it('renders table column headers', () => {
    renderSessionList();
    expect(screen.getByText('Session')).toBeInTheDocument();
    expect(screen.getByText('Duration')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
  });

  it('renders search input', () => {
    renderSessionList();
    expect(screen.getByPlaceholderText('Search sessions...')).toBeInTheDocument();
  });

  it('renders Stats section in sidebar', () => {
    renderSessionList();
    expect(screen.getByText('Stats')).toBeInTheDocument();
    expect(screen.getByText(/Sessions:/)).toBeInTheDocument();
    expect(screen.getByText(/Published:/)).toBeInTheDocument();
  });

  it('clicking a session row shows raw log in preview panel', async () => {
    const user = userEvent.setup();
    renderSessionList();
    await user.click(screen.getByText('Refactor JWT middleware to support refresh tokens'));
    expect(screen.getByText(/The existing auth was frankencode/)).toBeInTheDocument();
  });

  it('clicking a different project filters sessions', async () => {
    const user = userEvent.setup();
    renderSessionList();
    await user.click(screen.getByText('ui-components'));
    expect(screen.getByText('Implement accessible dropdown component')).toBeInTheDocument();
    expect(screen.queryByText('Refactor JWT middleware to support refresh tokens')).not.toBeInTheDocument();
  });

  it('renders Enhance with AI button in preview panel', () => {
    renderSessionList();
    expect(screen.getByText('Enhance with AI')).toBeInTheDocument();
  });

  it('renders "Enhancement requires API key" subtitle', () => {
    renderSessionList();
    expect(screen.getByText('Enhancement requires API key')).toBeInTheDocument();
  });
});

// ===========================================================================
// Flow 1b: Session Detail
// ===========================================================================

describe('Session Detail', () => {
  it('renders stats grid: Duration, Turns, Files Changed, LOC', () => {
    renderDetail('ses-001');
    expect(screen.getByText('47m')).toBeInTheDocument();
    expect(screen.getByText('23')).toBeInTheDocument();
    // Files Changed count
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('312')).toBeInTheDocument();
    expect(screen.getByText('Active Time')).toBeInTheDocument();
    expect(screen.getByText('Turns')).toBeInTheDocument();
    expect(screen.getByText('Files Changed')).toBeInTheDocument();
    expect(screen.getByText('LOC')).toBeInTheDocument();
  });

  it('renders skills chips', () => {
    renderDetail('ses-001');
    expect(screen.getByText('Node.js')).toBeInTheDocument();
    expect(screen.getByText('JWT Security')).toBeInTheDocument();
    expect(screen.getByText('Ed25519')).toBeInTheDocument();
  });

  it('renders execution path steps', () => {
    renderDetail('ses-001');
    expect(screen.getByText('Audit existing middleware')).toBeInTheDocument();
    expect(screen.getByText('Production Rollout')).toBeInTheDocument();
  });

  it('renders collapsible Tool Breakdown section', () => {
    renderDetail('ses-001');
    expect(screen.getByText('Tool Breakdown')).toBeInTheDocument();
  });

  it('renders collapsible Turn Timeline section', () => {
    renderDetail('ses-001');
    expect(screen.getByText('Turn Timeline')).toBeInTheDocument();
  });

  it('renders collapsible Files Changed section with count', () => {
    renderDetail('ses-001');
    expect(screen.getByText(/Files Changed \(5\)/)).toBeInTheDocument();
  });

  it('renders Enhance with AI and Edit & Publish buttons', () => {
    renderDetail('ses-001');
    expect(screen.getByText('Enhance with AI')).toBeInTheDocument();
    expect(screen.getByText('Edit & Publish')).toBeInTheDocument();
  });

  it('shows API key error when Enhance clicked without key', () => {
    renderDetail('ses-001', false);
    fireEvent.click(screen.getByText('Enhance with AI'));
    expect(screen.getByText(/API key required/)).toBeInTheDocument();
    expect(screen.getByText('Go to Settings')).toBeInTheDocument();
    expect(screen.getByText('publish without enhancement')).toBeInTheDocument();
  });

  it('navigates to enhance when API key is present', () => {
    renderDetail('ses-001', true);
    fireEvent.click(screen.getByText('Enhance with AI'));
    // Should navigate away — no error shown
    expect(screen.queryByText(/API key required/)).toBeNull();
  });

  it('shows 404 for unknown session', () => {
    renderDetail('nonexistent');
    expect(screen.getByText('Session not found')).toBeInTheDocument();
  });

  it('renders context section', () => {
    renderDetail('ses-001');
    expect(screen.getByText('Context')).toBeInTheDocument();
    expect(screen.getByText(/Legacy auth used symmetric/)).toBeInTheDocument();
  });
});

// ===========================================================================
// Flow 1c: Enhance Flow (all 4 phases)
// ===========================================================================

describe('Enhance Flow — full phase progression', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(api, 'enhanceSession').mockResolvedValue(MOCK_ENHANCEMENT);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders breadcrumb with Browse > ENHANCE > Edit > Publish', () => {
    renderEnhance('ses-001');
    expect(screen.getByText('Browse')).toBeInTheDocument();
    expect(screen.getByText('ENHANCE')).toBeInTheDocument();
    expect(screen.getByText('Edit')).toBeInTheDocument();
    expect(screen.getByText('Publish')).toBeInTheDocument();
  });

  it('renders raw log panel with turn count', () => {
    renderEnhance('ses-001');
    expect(screen.getByText('Raw session log')).toBeInTheDocument();
    expect(screen.getByText('23 turns')).toBeInTheDocument();
  });

  it('Phase 1 (analyzing): shows "Reading your session..."', () => {
    renderEnhance('ses-001');
    expect(screen.getByText(/Reading your session/)).toBeInTheDocument();
  });

  it('Phase 1: shows AI feed lines progressively', () => {
    renderEnhance('ses-001');
    expect(screen.queryByText('AI Logic Feed')).toBeNull();
    act(() => { vi.advanceTimersByTime(300); });
    expect(screen.getByText('AI Logic Feed')).toBeInTheDocument();
  });

  it('Phase 2 (questions): advances after API returns', async () => {
    renderEnhance('ses-001');
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });
    expect(screen.getByText(/A few questions/)).toBeInTheDocument();
  });

  it('Phase 2: renders 3 question textareas', async () => {
    renderEnhance('ses-001');
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });
    expect(screen.getAllByRole('textbox')).toHaveLength(3);
  });

  it('Phase 2: allows typing answers in textareas', async () => {
    renderEnhance('ses-001');
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });
    const textareas = screen.getAllByRole('textbox');
    fireEvent.change(textareas[0], { target: { value: 'My custom answer' } });
    expect((textareas[0] as HTMLTextAreaElement).value).toBe('My custom answer');
  });

  it('Phase 2: skip toggles to "Unskip"', async () => {
    renderEnhance('ses-001');
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });
    const skipBtns = screen.getAllByText('Skip');
    fireEvent.click(skipBtns[0]);
    expect(screen.getByText('Unskip')).toBeInTheDocument();
  });

  it('Phase 3 (streaming): Continue button advances to streaming', async () => {
    renderEnhance('ses-001');
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });
    fireEvent.click(screen.getByText('Continue'));
    expect(screen.getByText(/Generating case study/)).toBeInTheDocument();
  });

  it('Phase 3: streams items progressively', async () => {
    renderEnhance('ses-001');
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });
    fireEvent.click(screen.getByText('Continue'));
    act(() => { vi.advanceTimersByTime(400); });
    const visible = document.querySelectorAll('.enhance-streaming__item--visible');
    expect(visible.length).toBe(1);
  });

  it('Phase 4 (done): shows "Case study ready" with Edit & Publish and Discard', async () => {
    renderEnhance('ses-001');
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });
    fireEvent.click(screen.getByText('Continue'));
    // 6 items * 400ms + 500ms = 2900ms
    act(() => { vi.advanceTimersByTime(3000); });
    expect(screen.getByText(/Case study ready/)).toBeInTheDocument();
    expect(screen.getByText('Edit & Publish')).toBeInTheDocument();
    expect(screen.getByText('Discard')).toBeInTheDocument();
  });

  it('shows error state when enhancement API fails', async () => {
    vi.spyOn(api, 'enhanceSession').mockRejectedValue(new Error('Network error'));
    renderEnhance('ses-001');
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });
    expect(screen.getByText('Enhancement failed')).toBeInTheDocument();
    expect(screen.getByText('Network error')).toBeInTheDocument();
  });
});

// ===========================================================================
// Flow 1d: Editor — two-column layout and publish trigger
// ===========================================================================

describe('Session Editor — layout and publish', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders editor with session title in input', () => {
    renderEditor('ses-001');
    expect(screen.getByDisplayValue(MOCK_SESSIONS[0].title)).toBeInTheDocument();
  });

  it('renders Raw Session Digest panel', () => {
    renderEditor('ses-001');
    expect(screen.getByText('Raw Session Digest')).toBeInTheDocument();
  });

  it('renders Your Take textarea', () => {
    renderEditor('ses-001');
    expect(screen.getByLabelText('Your Take')).toBeInTheDocument();
  });

  it('renders Context textarea', () => {
    renderEditor('ses-001');
    expect(screen.getByLabelText('Context')).toBeInTheDocument();
  });

  it('renders Execution Path section', () => {
    renderEditor('ses-001');
    expect(screen.getByText('Execution Path')).toBeInTheDocument();
  });

  it('renders Skills chips section with add button', () => {
    renderEditor('ses-001');
    expect(screen.getByText('Skills')).toBeInTheDocument();
    expect(screen.getByText('+ Add')).toBeInTheDocument();
  });

  it('renders Publish button', () => {
    renderEditor('ses-001');
    expect(screen.getByRole('button', { name: /Publish/ })).toBeInTheDocument();
  });

  it('Publish triggers auth check — shows auth modal when not authenticated', () => {
    renderEditor('ses-001', false);
    fireEvent.click(screen.getByRole('button', { name: /Publish/ }));
    expect(screen.getByText('Connect your account?')).toBeInTheDocument();
  });

  it('Publish skips auth modal when authenticated', () => {
    renderEditor('ses-001', true);
    fireEvent.click(screen.getByRole('button', { name: /Publish/ }));
    expect(screen.queryByText('Connect your account?')).toBeNull();
    act(() => { vi.advanceTimersByTime(500); });
    expect(screen.getByText('$ heyiam publish')).toBeInTheDocument();
  });

  it('shows 404 for unknown session', () => {
    renderEditor('nonexistent');
    expect(screen.getByText('Session not found')).toBeInTheDocument();
  });

  it('renders breadcrumb with pipeline steps', () => {
    renderEditor('ses-001');
    expect(screen.getByText('Your Input')).toBeInTheDocument();
    expect(screen.getByText('AI Enhancement')).toBeInTheDocument();
    expect(screen.getByText('Review & Publish')).toBeInTheDocument();
  });
});
