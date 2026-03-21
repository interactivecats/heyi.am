import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SessionEditorPage } from './SessionEditorPage';
import type { SessionEditorPageProps } from './SessionEditorPage';
import { AuthProvider } from '../AuthContext';
import { MOCK_SESSIONS } from '../mock-data';

vi.mock('../api', () => ({
  publishSession: vi.fn(() =>
    Promise.resolve({ token: 'tok-123', url: '/s/ses-001', sealed: false, content_hash: 'abc' }),
  ),
  fetchAuthStatus: vi.fn(() => Promise.resolve({ authenticated: false })),
  startDeviceAuth: vi.fn(() =>
    Promise.resolve({
      device_code: 'test-dc',
      user_code: 'TEST-CODE',
      verification_uri: 'http://localhost:4000/device',
      expires_in: 900,
      interval: 5,
    }),
  ),
  pollDeviceAuth: vi.fn(() => Promise.resolve({ authenticated: false })),
}));

function renderWithRoute(sessionId: string, props?: Partial<SessionEditorPageProps>) {
  return render(
    <MemoryRouter initialEntries={[`/session/${sessionId}/edit`]}>
      <AuthProvider>
        <Routes>
          <Route path="/session/:id/edit" element={<SessionEditorPage sessions={MOCK_SESSIONS} {...props} />} />
          <Route path="/" element={<div>Home</div>} />
          <Route path="/session/:id" element={<div>Detail Page</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('SessionEditorPage', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
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

  it('renders publish button in the header bar', () => {
    renderWithRoute('ses-001');
    const headerRight = document.querySelector('.app-header__right');
    const buttons = headerRight?.querySelectorAll('button');
    const publishBtn = Array.from(buttons ?? []).find((b) => b.textContent?.includes('Publish'));
    expect(publishBtn).toBeDefined();
    expect(publishBtn?.textContent).toContain('Publish');
  });

  it('shows auth modal when Publish clicked (not authenticated)', async () => {
    renderWithRoute('ses-001', { isAuthenticated: false });
    const publishBtn = screen.getByRole('button', { name: /Publish/ });
    fireEvent.click(publishBtn);
    await waitFor(() => {
      expect(screen.getByText('Connect your account')).toBeDefined();
    });
  });

  it('auth modal has "Open in browser" and "Cancel" buttons', async () => {
    renderWithRoute('ses-001', { isAuthenticated: false });
    fireEvent.click(screen.getByRole('button', { name: /Publish/ }));
    await waitFor(() => {
      expect(screen.getByText('Open in browser')).toBeDefined();
    });
    expect(screen.getByText('Cancel')).toBeDefined();
  });

  it('Cancel button returns to editing phase', async () => {
    renderWithRoute('ses-001', { isAuthenticated: false });
    fireEvent.click(screen.getByRole('button', { name: /Publish/ }));
    await waitFor(() => {
      expect(screen.getByText('Connect your account')).toBeDefined();
    });
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByText('Connect your account')).toBeNull();
    expect(screen.getByDisplayValue(MOCK_SESSIONS[0].title)).toBeDefined();
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

  it('terminal auto-advances to success after animation', async () => {
    renderWithRoute('ses-001', { isAuthenticated: true });
    fireEvent.click(screen.getByRole('button', { name: /Publish/ }));

    // Flush the publish promise microtask, then advance timers
    await act(async () => { vi.advanceTimersByTime(6500); });
    expect(screen.getByText('Session Published')).toBeDefined();
  });

  it('success shows "Session Published" and URL', async () => {
    renderWithRoute('ses-001', { isAuthenticated: true });
    fireEvent.click(screen.getByRole('button', { name: /Publish/ }));

    await act(async () => { vi.advanceTimersByTime(6500); });
    expect(screen.getByText('Session Published')).toBeDefined();
    expect(screen.getByText('Your case study is live on your portfolio.')).toBeDefined();
    expect(screen.getByText('heyi.am/s/ses-001')).toBeDefined();
  });

  it('authenticated user skips auth modal on publish', () => {
    renderWithRoute('ses-001', { isAuthenticated: true });
    fireEvent.click(screen.getByRole('button', { name: /Publish/ }));

    // Should go straight to terminal, no auth modal
    expect(screen.queryByText('Connect your account')).toBeNull();
    act(() => { vi.advanceTimersByTime(500); });
    expect(screen.getByText('$ heyiam publish')).toBeDefined();
  });

  it('copy button exists on success screen', async () => {
    renderWithRoute('ses-001', { isAuthenticated: true });
    fireEvent.click(screen.getByRole('button', { name: /Publish/ }));

    await act(async () => { vi.advanceTimersByTime(6500); });
    expect(screen.getByText('Copy')).toBeDefined();
  });
});

describe('SessionEditorPage — quick-enhanced publish gate', () => {
  const QUICK_ENHANCED_SESSIONS = MOCK_SESSIONS.map((s) =>
    s.id === 'ses-001'
      ? { ...s, quickEnhanced: true, developerTake: 'AI suggested take' }
      : s,
  );

  function renderQuickEnhanced(props?: Partial<SessionEditorPageProps>) {
    return render(
      <MemoryRouter initialEntries={['/session/ses-001/edit']}>
        <AuthProvider>
          <Routes>
            <Route
              path="/session/:id/edit"
              element={
                <SessionEditorPage
                  sessions={QUICK_ENHANCED_SESSIONS}
                  isAuthenticated={true}
                  {...props}
                />
              }
            />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );
  }

  it('shows quick-enhance banner for quick-enhanced sessions', () => {
    renderQuickEnhanced();
    expect(screen.getByTestId('quick-enhance-banner')).toBeDefined();
    expect(screen.getByText(/Bulk-enhanced/)).toBeDefined();
  });

  it('publish button is disabled when take has not been edited', () => {
    renderQuickEnhanced();
    const publishBtn = screen.getByRole('button', { name: /Publish/ });
    expect(publishBtn).toBeDisabled();
  });

  it('does not show banner for normal enhanced sessions', () => {
    const normalSessions = MOCK_SESSIONS.map((s) =>
      s.id === 'ses-001' ? { ...s, quickEnhanced: false } : s,
    );
    render(
      <MemoryRouter initialEntries={['/session/ses-001/edit']}>
        <AuthProvider>
          <Routes>
            <Route
              path="/session/:id/edit"
              element={
                <SessionEditorPage sessions={normalSessions} isAuthenticated={true} />
              }
            />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );
    expect(screen.queryByTestId('quick-enhance-banner')).toBeNull();
  });
});
