/**
 * Integration tests: Auth States
 *
 * Tests Settings page rendering (API key, account status, machine token),
 * unauthenticated publish flow auth prompt, and connection states.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Settings } from './Settings';
import { SessionEditorPage } from './SessionEditorPage';
import { AuthProvider } from '../AuthContext';
import { MOCK_SESSIONS } from '../mock-data';

const mockStartDeviceAuth = vi.fn(() =>
  Promise.resolve({
    device_code: 'test-device-code',
    user_code: 'ABCD-1234',
    verification_uri: 'http://localhost:4000/device',
    expires_in: 900,
    interval: 5,
  }),
);

const mockPollDeviceAuth = vi.fn(() =>
  Promise.resolve({ authenticated: false }),
);

vi.mock('../api', () => ({
  publishSession: vi.fn(() =>
    Promise.resolve({ token: 'tok-123', url: '/s/ses-001', sealed: false, content_hash: 'abc' }),
  ),
  fetchAuthStatus: vi.fn(() => Promise.resolve({ authenticated: false })),
  fetchEnhanceStatus: vi.fn(() => Promise.resolve({ mode: 'local', remaining: null })),
  startDeviceAuth: () => mockStartDeviceAuth(),
  pollDeviceAuth: (_deviceCode: string) => mockPollDeviceAuth(),
}));

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
      <AuthProvider>
        <Routes>
          <Route path="/session/:id/edit" element={<SessionEditorPage sessions={MOCK_SESSIONS} isAuthenticated={isAuthenticated} />} />
          <Route path="/" element={<div>Home</div>} />
          <Route path="/session/:id" element={<div>Detail Page</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

// ===========================================================================
// Settings page — API key, account status, machine token
// ===========================================================================

describe('Settings page — sections', () => {
  it('renders all three settings sections', () => {
    renderSettings();
    expect(screen.getByText('AI Enhancement')).toBeInTheDocument();
    expect(screen.getByText('Authentication')).toBeInTheDocument();
    expect(screen.getByText('Machine Identity')).toBeInTheDocument();
  });

  it('renders collapsible API key section', () => {
    renderSettings();
    expect(screen.getByText('Use your own API key')).toBeInTheDocument();
  });

  it('renders API key input inside collapsible with placeholder', () => {
    renderSettings();
    const input = screen.getByPlaceholderText('sk-ant-...');
    expect(input).toHaveAttribute('type', 'password');
  });

  it('renders BYOK help text', () => {
    renderSettings();
    expect(screen.getByText('Uses your own Anthropic account. Bypasses proxy quota.')).toBeInTheDocument();
  });

  it('toggles API key visibility', async () => {
    const user = userEvent.setup();
    renderSettings();
    const input = screen.getByPlaceholderText('sk-ant-...');
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
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockStartDeviceAuth.mockClear();
    mockPollDeviceAuth.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows auth prompt modal when Publish clicked without auth', async () => {
    renderEditor('ses-001', false);
    fireEvent.click(screen.getByRole('button', { name: /Publish/ }));
    await waitFor(() => {
      expect(screen.getByText('Connect your account')).toBeInTheDocument();
    });
  });

  it('shows loading state then real device code', async () => {
    renderEditor('ses-001', false);
    fireEvent.click(screen.getByRole('button', { name: /Publish/ }));
    // Initially the device-code area shows loading
    const codeEl = document.querySelector('.publish-modal__device-code');
    expect(codeEl?.textContent).toBe('...');
    // After API responds, shows real code
    await waitFor(() => {
      expect(screen.getByText('ABCD-1234')).toBeInTheDocument();
    });
  });

  it('modal has verification URI', async () => {
    renderEditor('ses-001', false);
    fireEvent.click(screen.getByRole('button', { name: /Publish/ }));
    await waitFor(() => {
      expect(screen.getByText(/localhost:4000\/device/)).toBeInTheDocument();
    });
  });

  it('modal has Open in browser link', async () => {
    renderEditor('ses-001', false);
    fireEvent.click(screen.getByRole('button', { name: /Publish/ }));
    await waitFor(() => {
      expect(screen.getByText('Open in browser')).toBeInTheDocument();
    });
  });

  it('modal has Cancel button', async () => {
    renderEditor('ses-001', false);
    fireEvent.click(screen.getByRole('button', { name: /Publish/ }));
    await waitFor(() => {
      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });
  });

  it('Cancel returns to editing phase', async () => {
    renderEditor('ses-001', false);
    fireEvent.click(screen.getByRole('button', { name: /Publish/ }));
    await waitFor(() => {
      expect(screen.getByText('Connect your account')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByText('Connect your account')).toBeNull();
  });

  it('calls startDeviceAuth when publish clicked unauthenticated', async () => {
    renderEditor('ses-001', false);
    fireEvent.click(screen.getByRole('button', { name: /Publish/ }));
    await waitFor(() => {
      expect(mockStartDeviceAuth).toHaveBeenCalledTimes(1);
    });
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
    expect(screen.queryByText('Connect your account')).toBeNull();
    act(() => { vi.advanceTimersByTime(500); });
    expect(screen.getByText('$ heyiam publish')).toBeInTheDocument();
  });
});
