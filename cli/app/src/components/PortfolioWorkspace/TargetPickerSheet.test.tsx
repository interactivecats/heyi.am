import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act, waitFor } from '@testing-library/react'
import { TargetPickerSheet } from './TargetPickerSheet'
import {
  PortfolioStoreProvider,
  type PortfolioStoreState,
} from '../../hooks/usePortfolioStore'
import * as api from '../../api'

vi.mock('../../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api')>()
  return {
    ...actual,
    downloadPortfolioZip: vi.fn(),
    fetchGithubAccount: vi.fn(),
    requestGithubDeviceCode: vi.fn(),
    pollGithubToken: vi.fn(),
    fetchGithubRepos: vi.fn(),
    publishToGithub: vi.fn(),
  }
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function renderSheet(initial: Partial<PortfolioStoreState> = {}, onClose = vi.fn()) {
  // Default: GitHub idle (no account connected). Tests can override per test.
  if (!vi.mocked(api.fetchGithubAccount).getMockImplementation()) {
    vi.mocked(api.fetchGithubAccount).mockResolvedValue(null)
  }
  const utils = render(
    <PortfolioStoreProvider initialState={initial}>
      <TargetPickerSheet open={true} onClose={onClose} />
    </PortfolioStoreProvider>,
  )
  return { ...utils, onClose }
}

describe('TargetPickerSheet — structure', () => {
  beforeEach(() => {
    vi.mocked(api.fetchGithubAccount).mockResolvedValue(null)
  })

  it('does not render when open=false', () => {
    render(
      <PortfolioStoreProvider>
        <TargetPickerSheet open={false} onClose={() => {}} />
      </PortfolioStoreProvider>,
    )
    expect(screen.queryByTestId('target-picker-sheet')).toBeNull()
  })

  it('renders three target cards in order: download zip, heyi.am, github', () => {
    renderSheet()
    const sections = screen
      .getAllByRole('heading', { level: 3 })
      .map((h) => h.textContent)
    expect(sections).toEqual(['Download as .zip', 'heyi.am', 'GitHub Pages'])
  })

  it('GitHub Pages card is no longer disabled', () => {
    renderSheet()
    const card = screen.getByTestId('target-card-github')
    expect(card.getAttribute('aria-disabled')).toBeNull()
  })
})

describe('TargetPickerSheet — Download as zip', () => {
  beforeEach(() => {
    vi.mocked(api.fetchGithubAccount).mockResolvedValue(null)
  })

  it('clicking "Download as .zip" calls downloadPortfolioZip and shows the filename', async () => {
    vi.mocked(api.downloadPortfolioZip).mockResolvedValue({
      ok: true,
      filename: 'portfolio-ada-2026-04-07.zip',
    })
    renderSheet()
    await act(async () => {
      fireEvent.click(screen.getByTestId('target-export-download'))
    })
    expect(api.downloadPortfolioZip).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('target-export-downloaded-filename').textContent).toContain(
      'portfolio-ada-2026-04-07.zip',
    )
    expect(screen.queryByTestId('target-export-download-error')).toBeNull()
  })

  it('shows an inline error if the download throws', async () => {
    vi.mocked(api.downloadPortfolioZip).mockRejectedValue(new Error('disk full'))
    renderSheet()
    await act(async () => {
      fireEvent.click(screen.getByTestId('target-export-download'))
    })
    expect(screen.getByTestId('target-export-download-error').textContent).toContain('disk full')
  })
})

describe('TargetPickerSheet — visibility radio', () => {
  beforeEach(() => {
    vi.mocked(api.fetchGithubAccount).mockResolvedValue(null)
  })

  it('defaults to Public when no publishState', () => {
    renderSheet()
    const publicRadio = screen.getByTestId(
      'target-heyiam-visibility-public',
    ) as HTMLInputElement
    expect(publicRadio.checked).toBe(true)
  })

  it('selecting Unlisted dispatches SET_VISIBILITY', () => {
    renderSheet({
      publishState: {
        targets: {
          'heyi.am': {
            lastPublishedAt: '',
            lastPublishedProfileHash: '',
            lastPublishedProfile: {},
            config: {},
            visibility: 'public',
          },
        },
      },
    })
    const unlisted = screen.getByTestId(
      'target-heyiam-visibility-unlisted',
    ) as HTMLInputElement
    fireEvent.click(unlisted)
    expect(
      (screen.getByTestId('target-heyiam-visibility-unlisted') as HTMLInputElement)
        .checked,
    ).toBe(true)
  })
})

describe('TargetPickerSheet — active target heyi.am', () => {
  beforeEach(() => {
    vi.mocked(api.fetchGithubAccount).mockResolvedValue(null)
  })

  it('clicking "Set as active target" on heyi.am switches activeTarget', () => {
    renderSheet()
    fireEvent.click(screen.getByTestId('target-heyiam-set-active'))
    const btn = screen.getByTestId('target-heyiam-set-active') as HTMLButtonElement
    expect(btn.disabled).toBe(true)
    expect(screen.getByTestId('target-heyiam-active-badge')).toBeTruthy()
  })
})

describe('TargetPickerSheet — GitHub Pages flow', () => {
  it('idle state: shows Connect GitHub button when no account is connected', async () => {
    vi.mocked(api.fetchGithubAccount).mockResolvedValue(null)
    renderSheet()
    await waitFor(() =>
      expect(screen.getByTestId('github-connect')).toBeTruthy(),
    )
  })

  it('clicking Connect requests a device code and shows user_code + verification link', async () => {
    vi.mocked(api.fetchGithubAccount).mockResolvedValue(null)
    vi.mocked(api.requestGithubDeviceCode).mockResolvedValue({
      device_code: 'devcode123',
      user_code: 'ABCD-EFGH',
      verification_uri: 'https://github.com/login/device',
      expires_in: 900,
      interval: 5,
    })
    renderSheet()
    await waitFor(() => screen.getByTestId('github-connect'))
    await act(async () => {
      fireEvent.click(screen.getByTestId('github-connect'))
    })
    await waitFor(() => screen.getByTestId('github-awaiting'))
    expect(screen.getByTestId('github-user-code').textContent).toBe('ABCD-EFGH')
    expect(screen.getByTestId('github-verification-link').getAttribute('href')).toBe(
      'https://github.com/login/device',
    )
    expect(screen.getByTestId('github-spinner')).toBeTruthy()
    expect(api.requestGithubDeviceCode).toHaveBeenCalledTimes(1)
  })

  it('user_code uses the prescribed mono/large/tracking style', async () => {
    vi.mocked(api.fetchGithubAccount).mockResolvedValue(null)
    vi.mocked(api.requestGithubDeviceCode).mockResolvedValue({
      device_code: 'd',
      user_code: 'X1-X2',
      verification_uri: 'https://github.com/login/device',
      expires_in: 900,
      interval: 5,
    })
    renderSheet()
    await waitFor(() => screen.getByTestId('github-connect'))
    await act(async () => {
      fireEvent.click(screen.getByTestId('github-connect'))
    })
    await waitFor(() => screen.getByTestId('github-user-code'))
    const code = screen.getByTestId('github-user-code')
    expect(code.className).toContain('font-mono')
    expect(code.className).toContain('text-2xl')
    expect(code.className).toContain('tracking-widest')
  })

  it('polling triggers pollGithubToken and transitions to connected on success', async () => {
    vi.useFakeTimers()
    vi.mocked(api.fetchGithubAccount).mockResolvedValue(null)
    vi.mocked(api.requestGithubDeviceCode).mockResolvedValue({
      device_code: 'devcode',
      user_code: 'AB-CD',
      verification_uri: 'https://github.com/login/device',
      expires_in: 900,
      interval: 1,
    })
    vi.mocked(api.pollGithubToken).mockResolvedValue({
      ok: true,
      account: { login: 'ada', name: 'Ada', avatarUrl: 'https://x/y.png' },
    })
    vi.mocked(api.fetchGithubRepos).mockResolvedValue([
      {
        id: 1,
        name: 'site',
        full_name: 'ada/site',
        owner: { login: 'ada' },
        default_branch: 'main',
        private: false,
        html_url: 'https://github.com/ada/site',
      },
    ])
    renderSheet()
    // Initial fetchGithubAccount() resolves a microtask later.
    await act(async () => {
      await Promise.resolve()
    })
    await act(async () => {
      fireEvent.click(screen.getByTestId('github-connect'))
    })
    // Drain microtasks so requestGithubDeviceCode resolves.
    await act(async () => {
      await Promise.resolve()
    })
    // Advance the polling interval — pollGithubToken should fire.
    await act(async () => {
      vi.advanceTimersByTime(1500)
    })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(api.pollGithubToken).toHaveBeenCalled()
    vi.useRealTimers()
    await waitFor(() => screen.getByTestId('github-connected'))
    expect(screen.getByText(/Connected as/i)).toBeTruthy()
  })

  it('connected state: fetches repos, allows selection, and publishes', async () => {
    vi.mocked(api.fetchGithubAccount).mockResolvedValue({
      login: 'ada',
      name: 'Ada',
      avatarUrl: 'https://x/y.png',
    })
    vi.mocked(api.fetchGithubRepos).mockResolvedValue([
      {
        id: 1,
        name: 'site',
        full_name: 'ada/site',
        owner: { login: 'ada' },
        default_branch: 'main',
        private: false,
        html_url: 'https://github.com/ada/site',
      },
      {
        id: 2,
        name: 'portfolio',
        full_name: 'ada/portfolio',
        owner: { login: 'ada' },
        default_branch: 'main',
        private: false,
        html_url: 'https://github.com/ada/portfolio',
      },
    ])
    vi.mocked(api.publishToGithub).mockResolvedValue({
      ok: true,
      url: 'https://ada.github.io/site/',
    })
    renderSheet()
    await waitFor(() => screen.getByTestId('github-connected'))
    await waitFor(() =>
      expect(
        (screen.getByTestId('github-repo-select') as HTMLSelectElement).value,
      ).toBe('ada/site'),
    )
    const publishBtn = screen.getByTestId('github-publish') as HTMLButtonElement
    expect(publishBtn.textContent).toContain('Publish to ada/site')
    await act(async () => {
      fireEvent.click(publishBtn)
    })
    expect(api.publishToGithub).toHaveBeenCalledWith({ owner: 'ada', repo: 'site' })
    await waitFor(() =>
      expect(screen.getByTestId('github-published-url').textContent).toContain(
        'https://ada.github.io/site/',
      ),
    )
    // After publish, activeTarget should be 'github' and the badge shows.
    expect(screen.getByTestId('target-github-active-badge')).toBeTruthy()
  })

  it('publish error displays inline', async () => {
    vi.mocked(api.fetchGithubAccount).mockResolvedValue({
      login: 'ada',
      name: null,
      avatarUrl: 'https://x/y.png',
    })
    vi.mocked(api.fetchGithubRepos).mockResolvedValue([
      {
        id: 1,
        name: 'site',
        full_name: 'ada/site',
        owner: { login: 'ada' },
        default_branch: 'main',
        private: false,
        html_url: 'https://github.com/ada/site',
      },
    ])
    vi.mocked(api.publishToGithub).mockRejectedValue(new Error('Pages build failed'))
    renderSheet()
    await waitFor(() => screen.getByTestId('github-connected'))
    await waitFor(() =>
      expect(
        (screen.getByTestId('github-repo-select') as HTMLSelectElement).value,
      ).toBe('ada/site'),
    )
    await act(async () => {
      fireEvent.click(screen.getByTestId('github-publish'))
    })
    await waitFor(() =>
      expect(screen.getByTestId('github-publish-error').textContent).toContain(
        'Pages build failed',
      ),
    )
  })

  it('initial fetchGithubAccount error transitions to error state with retry', async () => {
    vi.mocked(api.fetchGithubAccount).mockRejectedValue(new Error('boom'))
    renderSheet()
    await waitFor(() => screen.getByTestId('github-error'))
    expect(screen.getByTestId('github-retry')).toBeTruthy()
  })
})

describe('TargetPickerSheet — dismissal', () => {
  beforeEach(() => {
    vi.mocked(api.fetchGithubAccount).mockResolvedValue(null)
  })

  it('closes on Escape key', () => {
    const { onClose } = renderSheet()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes when clicking the overlay outside the sheet body', () => {
    const { onClose } = renderSheet()
    fireEvent.mouseDown(screen.getByTestId('target-picker-overlay'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does NOT close when clicking inside the sheet body', () => {
    const { onClose } = renderSheet()
    fireEvent.mouseDown(screen.getByTestId('target-picker-sheet'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes on the × button', () => {
    const { onClose } = renderSheet()
    fireEvent.click(screen.getByTestId('target-picker-close'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
