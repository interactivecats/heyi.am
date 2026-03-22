import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Settings } from './Settings';

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    fetchEnhanceStatus: vi.fn().mockResolvedValue({ mode: 'local', remaining: null }),
  };
});

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

function renderSettings() {
  return render(
    <MemoryRouter initialEntries={['/settings']}>
      <Settings />
    </MemoryRouter>,
  );
}

describe('Settings', () => {
  it('renders settings page with all sections', () => {
    renderSettings();
    expect(screen.getByText('AI Enhancement')).toBeInTheDocument();
    expect(screen.getByText('Authentication')).toBeInTheDocument();
    expect(screen.getByText('Machine Identity')).toBeInTheDocument();
  });

  it('renders mode indicator', async () => {
    renderSettings();
    // Wait for enhance status to load
    expect(await screen.findByText('Local API key')).toBeInTheDocument();
  });

  it('renders collapsible API key section', () => {
    renderSettings();
    expect(screen.getByText('Use your own API key')).toBeInTheDocument();
  });

  it('renders API key input inside collapsible', async () => {
    const user = userEvent.setup();
    renderSettings();

    // Open the details
    await user.click(screen.getByText('Use your own API key'));

    const input = screen.getByPlaceholderText('sk-ant-...');
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('type', 'password');
  });

  it('toggles API key visibility', async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.click(screen.getByText('Use your own API key'));

    const input = screen.getByPlaceholderText('sk-ant-...');
    const toggleBtn = screen.getByRole('button', { name: /show api key/i });

    expect(input).toHaveAttribute('type', 'password');
    await user.click(toggleBtn);
    expect(input).toHaveAttribute('type', 'text');

    const hideBtn = screen.getByRole('button', { name: /hide api key/i });
    await user.click(hideBtn);
    expect(input).toHaveAttribute('type', 'password');
  });

  it('renders auth status as not connected by default', () => {
    renderSettings();
    expect(screen.getByText('Not connected')).toBeInTheDocument();
    const badge = screen.getByText('Not connected');
    expect(badge.className).toContain('badge--draft');
  });

  it('shows "heyiam login" command when not connected', () => {
    renderSettings();
    expect(screen.getByText(/heyiam login/)).toBeInTheDocument();
  });

  it('renders machine token section', () => {
    renderSettings();
    expect(screen.getByText('Machine Token')).toBeInTheDocument();
    expect(screen.getByText('ed25519:a4f2...8b3c')).toBeInTheDocument();
    expect(screen.getByText('SHA256:kR7x...Qm4w')).toBeInTheDocument();
  });

  it('renders BYOK details section', () => {
    renderSettings();
    // The "Use your own API key" label is the <details> summary
    expect(screen.getByText('Use your own API key')).toBeInTheDocument();
  });

  it('shows em dash for username when not connected', () => {
    renderSettings();
    expect(screen.getByText('\u2014')).toBeInTheDocument();
  });

  it('renders title in app shell header', () => {
    renderSettings();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('renders section labels with label class', () => {
    const { container } = renderSettings();
    const labels = container.querySelectorAll('.label');
    const labelTexts = Array.from(labels).map((el) => el.textContent);
    expect(labelTexts).toContain('AI Enhancement');
    expect(labelTexts).toContain('Authentication');
    expect(labelTexts).toContain('Machine Identity');
  });
});

describe('Settings — enhance mode display', () => {
  it('shows "Not configured" when mode is none', async () => {
    const api = await import('../api');
    vi.mocked(api.fetchEnhanceStatus).mockResolvedValue({ mode: 'none', remaining: 0 });
    renderSettings();
    expect(await screen.findByText('Not configured')).toBeInTheDocument();
    expect(screen.getByText(/Log in or set ANTHROPIC_API_KEY/)).toBeInTheDocument();
  });

  it('shows "heyi.am proxy" when mode is proxy', async () => {
    const api = await import('../api');
    vi.mocked(api.fetchEnhanceStatus).mockResolvedValue({ mode: 'proxy', remaining: 7 });
    renderSettings();
    expect(await screen.findByText('heyi.am proxy')).toBeInTheDocument();
    expect(await screen.findByText('7 remaining this month')).toBeInTheDocument();
  });
});
