/**
 * Integration tests: Auth States
 *
 * Tests Settings page rendering (API key, account status, machine token),
 * unauthenticated publish flow auth prompt, and connection states.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Settings } from './Settings';
import { SessionEditorPage } from './SessionEditorPage';
import { MOCK_SESSIONS } from '../mock-data';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderSettings() {
  return render(
    <MemoryRouter initialEntries={['/settings']}>
      <Settings />
    </MemoryRouter>,
  );
}

function renderEditor(sessionId: string, isAuthenticated = false) {
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
// Settings page — API key, account status, machine token
// ===========================================================================

describe('Settings page — sections', () => {
  it('renders all three settings sections', () => {
    renderSettings();
    expect(screen.getByText('API Configuration')).toBeInTheDocument();
    expect(screen.getByText('Authentication')).toBeInTheDocument();
    expect(screen.getByText('Machine Identity')).toBeInTheDocument();
  });

  it('renders API key input as password field with placeholder', () => {
    renderSettings();
    const input = screen.getByLabelText('Anthropic API Key');
    expect(input).toHaveAttribute('type', 'password');
    expect(input).toHaveAttribute('placeholder', 'sk-ant-...');
  });

  it('renders API key help text', () => {
    renderSettings();
    expect(screen.getByText('Used for AI enhancement. Stored locally, never sent to our servers.')).toBeInTheDocument();
  });

  it('toggles API key visibility', async () => {
    const user = userEvent.setup();
    renderSettings();
    const input = screen.getByLabelText('Anthropic API Key');
    expect(input).toHaveAttribute('type', 'password');

    await user.click(screen.getByRole('button', { name: /show api key/i }));
    expect(input).toHaveAttribute('type', 'text');

    await user.click(screen.getByRole('button', { name: /hide api key/i }));
    expect(input).toHaveAttribute('type', 'password');
  });

  it('shows "Not connected" badge by default', () => {
    renderSettings();
    const badge = screen.getByText('Not connected');
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain('badge--draft');
  });

  it('shows "heyiam login" command when not connected', () => {
    renderSettings();
    expect(screen.getByText(/heyiam login/)).toBeInTheDocument();
  });

  it('shows em dash for username when not connected', () => {
    renderSettings();
    expect(screen.getByText('\u2014')).toBeInTheDocument();
  });

  it('renders machine token value', () => {
    renderSettings();
    expect(screen.getByText('Machine Token')).toBeInTheDocument();
    expect(screen.getByText('ed25519:a4f2...8b3c')).toBeInTheDocument();
  });

  it('renders token fingerprint', () => {
    renderSettings();
    expect(screen.getByText('SHA256:kR7x...Qm4w')).toBeInTheDocument();
  });

  it('renders signing explanation', () => {
    renderSettings();
    expect(screen.getByText('Used for cryptographic signing of published sessions')).toBeInTheDocument();
  });

  it('renders back button', () => {
    renderSettings();
    expect(screen.getByRole('button', { name: /go back/i })).toBeInTheDocument();
  });
});

// ===========================================================================
// Auth prompt modal on publish (unauthenticated)
// ===========================================================================

describe('Auth prompt modal — unauthenticated publish', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows auth prompt modal when Publish clicked without auth', () => {
    renderEditor('ses-001', false);
    fireEvent.click(screen.getByRole('button', { name: /Publish/ }));
    expect(screen.getByText('Connect your account?')).toBeInTheDocument();
  });

  it('modal has device code', () => {
    renderEditor('ses-001', false);
    fireEvent.click(screen.getByRole('button', { name: /Publish/ }));
    expect(screen.getByText('RXKF-7Y2M')).toBeInTheDocument();
  });

  it('modal has "heyi.am/device" instructions', () => {
    renderEditor('ses-001', false);
    fireEvent.click(screen.getByRole('button', { name: /Publish/ }));
    expect(screen.getByText(/heyi\.am\/device/)).toBeInTheDocument();
  });

  it('modal has Connect now button', () => {
    renderEditor('ses-001', false);
    fireEvent.click(screen.getByRole('button', { name: /Publish/ }));
    expect(screen.getByText('Connect now')).toBeInTheDocument();
  });

  it('modal has Publish anonymously button', () => {
    renderEditor('ses-001', false);
    fireEvent.click(screen.getByRole('button', { name: /Publish/ }));
    expect(screen.getByText('Publish anonymously instead')).toBeInTheDocument();
  });

  it('Connect now transitions to terminal animation', () => {
    renderEditor('ses-001', false);
    fireEvent.click(screen.getByRole('button', { name: /Publish/ }));
    fireEvent.click(screen.getByText('Connect now'));
    act(() => { vi.advanceTimersByTime(500); });
    expect(screen.getByText('$ heyiam publish')).toBeInTheDocument();
  });

  it('Publish anonymously transitions to terminal animation', () => {
    renderEditor('ses-001', false);
    fireEvent.click(screen.getByRole('button', { name: /Publish/ }));
    fireEvent.click(screen.getByText('Publish anonymously instead'));
    act(() => { vi.advanceTimersByTime(500); });
    expect(screen.getByText('$ heyiam publish')).toBeInTheDocument();
  });
});

// ===========================================================================
// Connected state — authenticated publish
// ===========================================================================

describe('Auth — connected state', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('skips auth modal and goes straight to terminal when authenticated', () => {
    renderEditor('ses-001', true);
    fireEvent.click(screen.getByRole('button', { name: /Publish/ }));
    expect(screen.queryByText('Connect your account?')).toBeNull();
    act(() => { vi.advanceTimersByTime(500); });
    expect(screen.getByText('$ heyiam publish')).toBeInTheDocument();
  });

  // NOTE: Connected state with green dot + username not yet wired
  // (Settings component has isConnected hardcoded to false).
  // When wired, add test: green dot visible + username shown.
});
