import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SessionEditorPage } from './SessionEditorPage';
import type { SessionEditorPageProps } from './SessionEditorPage';
import { MOCK_SESSIONS } from '../mock-data';

function renderWithRoute(sessionId: string, props?: Partial<SessionEditorPageProps>) {
  return render(
    <MemoryRouter initialEntries={[`/session/${sessionId}/edit`]}>
      <Routes>
        <Route path="/session/:id/edit" element={<SessionEditorPage sessions={MOCK_SESSIONS} {...props} />} />
        <Route path="/" element={<div>Home</div>} />
        <Route path="/session/:id" element={<div>Detail Page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('SessionEditorPage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows 404 for unknown session', () => {
    renderWithRoute('nonexistent');
    expect(screen.getByText('Session not found')).toBeDefined();
  });

  it('renders editor with session title', () => {
    renderWithRoute('ses-001');
    expect(screen.getByDisplayValue(MOCK_SESSIONS[0].title)).toBeDefined();
    expect(screen.getByText('Raw Session Digest')).toBeDefined();
  });

  it('shows auth modal when Publish clicked (not authenticated)', () => {
    renderWithRoute('ses-001', { isAuthenticated: false });
    const publishBtn = screen.getByRole('button', { name: /Publish/ });
    fireEvent.click(publishBtn);
    expect(screen.getByText('Connect your account?')).toBeDefined();
  });

  it('auth modal has "Connect now" and "Publish anonymously" buttons', () => {
    renderWithRoute('ses-001', { isAuthenticated: false });
    fireEvent.click(screen.getByRole('button', { name: /Publish/ }));
    expect(screen.getByText('Connect now')).toBeDefined();
    expect(screen.getByText('Publish anonymously instead')).toBeDefined();
  });

  it('"Connect now" transitions to terminal animation', () => {
    renderWithRoute('ses-001', { isAuthenticated: false });
    fireEvent.click(screen.getByRole('button', { name: /Publish/ }));
    fireEvent.click(screen.getByText('Connect now'));

    // First line appears after 500ms
    act(() => { vi.advanceTimersByTime(500); });
    expect(screen.getByText('$ heyiam publish')).toBeDefined();
  });

  it('"Publish anonymously" transitions to terminal animation', () => {
    renderWithRoute('ses-001', { isAuthenticated: false });
    fireEvent.click(screen.getByRole('button', { name: /Publish/ }));
    fireEvent.click(screen.getByText('Publish anonymously instead'));

    act(() => { vi.advanceTimersByTime(500); });
    expect(screen.getByText('$ heyiam publish')).toBeDefined();
  });

  it('terminal animation shows publish steps sequentially', () => {
    renderWithRoute('ses-001', { isAuthenticated: true });
    fireEvent.click(screen.getByRole('button', { name: /Publish/ }));

    // After 500ms: first line
    act(() => { vi.advanceTimersByTime(500); });
    expect(screen.getByText('$ heyiam publish')).toBeDefined();

    // After 1500ms: should have 3 lines visible (line 1 at 500, line 2 at 1000, line 3 at 1500)
    act(() => { vi.advanceTimersByTime(1000); });
    expect(screen.getByText('[INFO] Signing payload with Ed25519...')).toBeDefined();

    // After 2000ms: 4 lines
    act(() => { vi.advanceTimersByTime(500); });
    expect(screen.getByText('Payload signed')).toBeDefined();
  });

  it('terminal auto-advances to success after animation', () => {
    renderWithRoute('ses-001', { isAuthenticated: true });
    fireEvent.click(screen.getByRole('button', { name: /Publish/ }));

    // 10 lines * 500ms + 1000ms post-delay = 6000ms
    act(() => { vi.advanceTimersByTime(6500); });
    expect(screen.getByText('Session Published')).toBeDefined();
  });

  it('success-linked shows "Session Published" and URL', () => {
    renderWithRoute('ses-001', { isAuthenticated: true });
    fireEvent.click(screen.getByRole('button', { name: /Publish/ }));

    act(() => { vi.advanceTimersByTime(6500); });
    expect(screen.getByText('Session Published')).toBeDefined();
    expect(screen.getByText('Your case study is live on your portfolio.')).toBeDefined();
    expect(screen.getByText('heyi.am/s/ses-001')).toBeDefined();
  });

  it('success-anonymous shows "Published Anonymously" and delete code', () => {
    renderWithRoute('ses-001', { isAuthenticated: false });
    fireEvent.click(screen.getByRole('button', { name: /Publish/ }));
    fireEvent.click(screen.getByText('Publish anonymously instead'));

    // Wait for animation to complete
    act(() => { vi.advanceTimersByTime(6500); });
    expect(screen.getByText('Published Anonymously')).toBeDefined();
    expect(screen.getByText('DEL-X7K9-M2PQ')).toBeDefined();
    expect(screen.getByText('This session is not linked to any account.')).toBeDefined();
  });

  it('authenticated user skips auth modal on publish', () => {
    renderWithRoute('ses-001', { isAuthenticated: true });
    fireEvent.click(screen.getByRole('button', { name: /Publish/ }));

    // Should go straight to terminal, no auth modal
    expect(screen.queryByText('Connect your account?')).toBeNull();
    act(() => { vi.advanceTimersByTime(500); });
    expect(screen.getByText('$ heyiam publish')).toBeDefined();
  });

  it('copy button exists on success-linked screen', () => {
    renderWithRoute('ses-001', { isAuthenticated: true });
    fireEvent.click(screen.getByRole('button', { name: /Publish/ }));

    act(() => { vi.advanceTimersByTime(6500); });
    expect(screen.getByText('Copy')).toBeDefined();
  });

  it('copy button exists on success-anonymous screen', () => {
    renderWithRoute('ses-001', { isAuthenticated: false });
    fireEvent.click(screen.getByRole('button', { name: /Publish/ }));
    fireEvent.click(screen.getByText('Publish anonymously instead'));

    act(() => { vi.advanceTimersByTime(6500); });
    expect(screen.getByText('Copy')).toBeDefined();
  });
});
