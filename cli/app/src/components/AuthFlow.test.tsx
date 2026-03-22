/**
 * Integration tests: Auth States
 *
 * Tests Settings page rendering (API key, account status, machine token).
 * Auth-prompt-on-publish tests will be added when ProjectUploadFlow is built.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Settings } from './Settings';

vi.mock('../api', () => ({
  fetchAuthStatus: vi.fn(() => Promise.resolve({ authenticated: false })),
  fetchEnhanceStatus: vi.fn(() => Promise.resolve({ mode: 'local', remaining: null })),
}));

// Mock fetch for Settings-internal API calls that use relative URLs (broken in jsdom)
const mockFetch = vi.fn((input: RequestInfo | URL) => {
  const url = typeof input === 'string' ? input : (input as Request).url;
  if (url.includes('/api/settings/api-key')) {
    return Promise.resolve(new Response(JSON.stringify({ hasKey: false, maskedKey: null }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
  }
  if (url.includes('/api/auth/status')) {
    return Promise.resolve(new Response(JSON.stringify({ authenticated: false }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
  }
  return Promise.resolve(new Response('{}', { status: 200 }));
}) as unknown as typeof fetch;

beforeEach(() => { vi.stubGlobal('fetch', mockFetch); });

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

  it('renders BYOK details section', () => {
    renderSettings();
    expect(screen.getByText('Use your own API key')).toBeInTheDocument();
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
