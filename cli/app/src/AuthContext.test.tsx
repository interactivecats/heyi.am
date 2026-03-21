import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { AuthProvider, useAuth } from './AuthContext';

let loginTrigger: (() => Promise<unknown>) | null = null;
let refreshTrigger: (() => Promise<void>) | null = null;

function AuthDisplay() {
  const auth = useAuth();
  loginTrigger = async () => { return await auth.login(); };
  refreshTrigger = async () => { await auth.refresh(); };
  return (
    <div>
      <span data-testid="loading">{String(auth.loading)}</span>
      <span data-testid="authenticated">{String(auth.authenticated)}</span>
      <span data-testid="username">{auth.username ?? ''}</span>
    </div>
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('AuthContext', () => {
  it('shows loading initially then resolves authenticated', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ authenticated: true, username: 'alice' }),
    } as Response);

    render(
      <AuthProvider>
        <AuthDisplay />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });
    expect(screen.getByTestId('authenticated').textContent).toBe('true');
    expect(screen.getByTestId('username').textContent).toBe('alice');
  });

  it('falls back to unauthenticated on fetch failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('network'));

    render(
      <AuthProvider>
        <AuthDisplay />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });
    expect(screen.getByTestId('authenticated').textContent).toBe('false');
  });

  it('falls back to unauthenticated on non-ok response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 401,
    } as Response);

    render(
      <AuthProvider>
        <AuthDisplay />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });
    expect(screen.getByTestId('authenticated').textContent).toBe('false');
  });

  it('login() calls startDeviceAuth and returns code info', async () => {
    const mockCodeInfo = {
      device_code: 'abc',
      user_code: 'ABCD-1234',
      verification_uri: 'http://localhost:4000/device',
      expires_in: 900,
      interval: 5,
    };

    vi.spyOn(globalThis, 'fetch')
      // Initial auth status check
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ authenticated: false }),
      } as Response)
      // startDeviceAuth call
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockCodeInfo,
      } as Response);

    render(
      <AuthProvider>
        <AuthDisplay />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });

    let result: unknown;
    await act(async () => {
      result = await loginTrigger!();
    });
    // login returns the DeviceCodeInfo from startDeviceAuth
    expect(result).toHaveProperty('user_code');
  });

  it('refresh() updates auth state', async () => {
    vi.spyOn(globalThis, 'fetch')
      // Initial: not authenticated
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ authenticated: false }),
      } as Response)
      // After refresh: authenticated
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ authenticated: true, username: 'bob' }),
      } as Response);

    render(
      <AuthProvider>
        <AuthDisplay />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('authenticated').textContent).toBe('false');
    });

    await act(async () => {
      await refreshTrigger!();
    });

    expect(screen.getByTestId('authenticated').textContent).toBe('true');
    expect(screen.getByTestId('username').textContent).toBe('bob');
  });
});
