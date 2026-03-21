/**
 * Integration tests: Publish Success States
 *
 * Tests the terminal animation, linked success screen, and anonymous
 * success screen including URL display, copy button, and delete code.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SessionEditorPage } from './SessionEditorPage';
import { MOCK_SESSIONS } from '../mock-data';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// Total lines = 9 (PUBLISH_LINES) + 1 (URL line) = 10
// Animation: 10 * 500ms + 1000ms = 6000ms
const ANIMATION_COMPLETE_MS = 6500;

// ===========================================================================
// Terminal animation
// ===========================================================================

describe('Publish — terminal animation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows first line "$ heyiam publish" after 500ms', () => {
    renderEditor('ses-001', true);
    fireEvent.click(screen.getByRole('button', { name: /Publish/ }));
    act(() => { vi.advanceTimersByTime(500); });
    expect(screen.getByText('$ heyiam publish')).toBeInTheDocument();
  });

  it('shows signing step after 1500ms', () => {
    renderEditor('ses-001', true);
    fireEvent.click(screen.getByRole('button', { name: /Publish/ }));
    act(() => { vi.advanceTimersByTime(1500); });
    expect(screen.getByText('[INFO] Signing payload with Ed25519...')).toBeInTheDocument();
  });

  it('shows "Payload signed" after 2000ms', () => {
    renderEditor('ses-001', true);
    fireEvent.click(screen.getByRole('button', { name: /Publish/ }));
    act(() => { vi.advanceTimersByTime(2000); });
    expect(screen.getByText('Payload signed')).toBeInTheDocument();
  });

  it('renders progress bar', () => {
    renderEditor('ses-001', true);
    fireEvent.click(screen.getByRole('button', { name: /Publish/ }));
    act(() => { vi.advanceTimersByTime(500); });
    const progressFill = document.querySelector('.publish-terminal__progress-fill');
    expect(progressFill).not.toBeNull();
  });

  it('auto-advances to success after animation completes', () => {
    renderEditor('ses-001', true);
    fireEvent.click(screen.getByRole('button', { name: /Publish/ }));
    act(() => { vi.advanceTimersByTime(ANIMATION_COMPLETE_MS); });
    expect(screen.getByText('Session Published')).toBeInTheDocument();
  });
});

// ===========================================================================
// Success — linked (authenticated)
// ===========================================================================

describe('Publish — linked success', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows "Session Published" heading', () => {
    renderEditor('ses-001', true);
    fireEvent.click(screen.getByRole('button', { name: /Publish/ }));
    act(() => { vi.advanceTimersByTime(ANIMATION_COMPLETE_MS); });
    expect(screen.getByText('Session Published')).toBeInTheDocument();
  });

  it('shows portfolio message', () => {
    renderEditor('ses-001', true);
    fireEvent.click(screen.getByRole('button', { name: /Publish/ }));
    act(() => { vi.advanceTimersByTime(ANIMATION_COMPLETE_MS); });
    expect(screen.getByText('Your case study is live on your portfolio.')).toBeInTheDocument();
  });

  it('displays the session URL', () => {
    renderEditor('ses-001', true);
    fireEvent.click(screen.getByRole('button', { name: /Publish/ }));
    act(() => { vi.advanceTimersByTime(ANIMATION_COMPLETE_MS); });
    expect(screen.getByText('heyi.am/s/ses-001')).toBeInTheDocument();
  });

  it('has Copy button', () => {
    renderEditor('ses-001', true);
    fireEvent.click(screen.getByRole('button', { name: /Publish/ }));
    act(() => { vi.advanceTimersByTime(ANIMATION_COMPLETE_MS); });
    expect(screen.getByText('Copy')).toBeInTheDocument();
  });

  it('has View on Portfolio link', () => {
    renderEditor('ses-001', true);
    fireEvent.click(screen.getByRole('button', { name: /Publish/ }));
    act(() => { vi.advanceTimersByTime(ANIMATION_COMPLETE_MS); });
    expect(screen.getByText('View on Portfolio')).toBeInTheDocument();
  });

  it('has View Case Study link', () => {
    renderEditor('ses-001', true);
    fireEvent.click(screen.getByRole('button', { name: /Publish/ }));
    act(() => { vi.advanceTimersByTime(ANIMATION_COMPLETE_MS); });
    expect(screen.getByText('View Case Study')).toBeInTheDocument();
  });

  it('shows Published badge', () => {
    renderEditor('ses-001', true);
    fireEvent.click(screen.getByRole('button', { name: /Publish/ }));
    act(() => { vi.advanceTimersByTime(ANIMATION_COMPLETE_MS); });
    expect(screen.getByText('Published')).toBeInTheDocument();
  });
});

// ===========================================================================
// Success — anonymous
// ===========================================================================

describe('Publish — anonymous success', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function publishAnonymously() {
    renderEditor('ses-001', false);
    fireEvent.click(screen.getByRole('button', { name: /Publish/ }));
    fireEvent.click(screen.getByText('Publish anonymously instead'));
    act(() => { vi.advanceTimersByTime(ANIMATION_COMPLETE_MS); });
  }

  it('shows "Published Anonymously" heading', () => {
    publishAnonymously();
    expect(screen.getByText('Published Anonymously')).toBeInTheDocument();
  });

  it('shows delete code warning', () => {
    publishAnonymously();
    expect(screen.getByText('DEL-X7K9-M2PQ')).toBeInTheDocument();
    expect(screen.getByText(/Save this code/)).toBeInTheDocument();
  });

  it('shows "not linked to any account" message', () => {
    publishAnonymously();
    expect(screen.getByText('This session is not linked to any account.')).toBeInTheDocument();
  });

  it('shows URL', () => {
    publishAnonymously();
    expect(screen.getByText('heyi.am/s/ses-001')).toBeInTheDocument();
  });

  it('has Copy button', () => {
    publishAnonymously();
    expect(screen.getByText('Copy')).toBeInTheDocument();
  });

  it('shows login hint with "heyiam login"', () => {
    publishAnonymously();
    expect(screen.getByText(/heyiam login/)).toBeInTheDocument();
  });
});
