import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Settings } from './Settings'
import * as api from '../api'

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>()
  return {
    ...actual,
    fetchApiKeyStatus: vi.fn(),
    fetchAuthStatus: vi.fn(),
    saveApiKey: vi.fn(),
    logout: vi.fn(),
    fetchGithubAccount: vi.fn(),
    disconnectGithub: vi.fn(),
  }
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function renderSettings() {
  return render(
    <MemoryRouter>
      <Settings />
    </MemoryRouter>,
  )
}

describe('Settings — Connected accounts', () => {
  beforeEach(() => {
    vi.mocked(api.fetchApiKeyStatus).mockResolvedValue({ hasKey: false })
    vi.mocked(api.fetchAuthStatus).mockResolvedValue({ authenticated: false })
  })

  it('renders the empty state when no GitHub account is connected', async () => {
    vi.mocked(api.fetchGithubAccount).mockResolvedValue(null)
    renderSettings()
    await waitFor(() =>
      expect(screen.getByText('Connected accounts')).toBeTruthy(),
    )
    await waitFor(() =>
      expect(screen.getByTestId('settings-github-empty')).toBeTruthy(),
    )
    expect(screen.getByText(/No accounts connected/i)).toBeTruthy()
    // Link to /portfolio for connecting from there.
    const link = screen.getByText(/Connect from Portfolio/i).closest('a')
    expect(link?.getAttribute('href')).toBe('/portfolio')
  })

  it('renders avatar + login + name + Disconnect when an account is connected', async () => {
    vi.mocked(api.fetchGithubAccount).mockResolvedValue({
      login: 'ada',
      name: 'Ada Lovelace',
      avatarUrl: 'https://example/x.png',
    })
    renderSettings()
    await waitFor(() => screen.getByTestId('settings-github-row'))
    expect(screen.getByText('ada')).toBeTruthy()
    expect(screen.getByText('Ada Lovelace')).toBeTruthy()
    const avatar = screen.getByTestId('settings-github-row').querySelector('img')
    expect(avatar?.getAttribute('src')).toBe('https://example/x.png')
    expect(screen.getByTestId('settings-github-disconnect')).toBeTruthy()
  })

  it('Disconnect calls disconnectGithub() and transitions to a "Disconnected" empty state', async () => {
    vi.mocked(api.fetchGithubAccount).mockResolvedValue({
      login: 'ada',
      name: null,
      avatarUrl: 'https://example/x.png',
    })
    vi.mocked(api.disconnectGithub).mockResolvedValue(undefined)
    renderSettings()
    await waitFor(() => screen.getByTestId('settings-github-disconnect'))
    await act(async () => {
      fireEvent.click(screen.getByTestId('settings-github-disconnect'))
    })
    expect(api.disconnectGithub).toHaveBeenCalledTimes(1)
    await waitFor(() =>
      expect(screen.getByText(/^Disconnected\.$/)).toBeTruthy(),
    )
  })

  it('shows an inline error when disconnect fails', async () => {
    vi.mocked(api.fetchGithubAccount).mockResolvedValue({
      login: 'ada',
      name: null,
      avatarUrl: 'https://example/x.png',
    })
    vi.mocked(api.disconnectGithub).mockRejectedValue(new Error('keychain locked'))
    renderSettings()
    await waitFor(() => screen.getByTestId('settings-github-disconnect'))
    await act(async () => {
      fireEvent.click(screen.getByTestId('settings-github-disconnect'))
    })
    await waitFor(() =>
      expect(screen.getByTestId('settings-github-error').textContent).toContain(
        'keychain locked',
      ),
    )
  })
})
