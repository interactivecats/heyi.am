import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, act, waitFor } from '@testing-library/react'
import { PreviewPane } from './PreviewPane'
import {
  PortfolioStoreProvider,
  usePortfolioStore,
  type PortfolioStoreState,
} from '../../hooks/usePortfolioStore'

vi.mock('../../api', () => ({
  fetchTheme: vi.fn(async () => ({ template: 'editorial' })),
  saveTheme: vi.fn(async () => undefined),
  fetchAuthStatus: vi.fn(async () => ({ authenticated: true, username: 'devuser' })),
}))

// TemplateBrowser is heavy (fetches templates, renders iframes). Stub it
// out so PreviewPane tests stay focused on the wiring around it.
vi.mock('../TemplateBrowser', () => ({
  TemplateBrowser: ({ mode, onClose, onSelectTemplate }: { mode: string; onClose?: () => void; onSelectTemplate?: (n: string) => void }) => (
    <div data-testid="template-browser-stub" data-mode={mode}>
      <button data-testid="template-browser-stub-close" onClick={onClose}>close</button>
      <button data-testid="template-browser-stub-pick" onClick={() => onSelectTemplate?.('blueprint')}>pick blueprint</button>
    </div>
  ),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function withProvider(initial?: Partial<PortfolioStoreState>) {
  return ({ children }: { children: React.ReactNode }) => (
    <PortfolioStoreProvider initialState={initial}>{children}</PortfolioStoreProvider>
  )
}

function getIframe(): HTMLIFrameElement {
  return screen.getByTestId('portfolio-preview-iframe') as HTMLIFrameElement
}

describe('PreviewPane', () => {
  it('renders the iframe with the Landing src by default', () => {
    render(<PreviewPane />, { wrapper: withProvider() })
    expect(getIframe().getAttribute('src')).toBe('/preview/portfolio')
  })

  it('renders template pill and Open in browser button (smoke)', async () => {
    render(<PreviewPane />, { wrapper: withProvider() })
    expect(screen.getByTestId('portfolio-preview-template-pill')).toBeTruthy()
    expect(screen.getByTestId('portfolio-preview-open-in-browser')).toBeTruthy()
  })

  it('shows the current template name from fetchTheme', async () => {
    const api = await import('../../api')
    ;(api.fetchTheme as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ template: 'editorial' })
    render(<PreviewPane />, { wrapper: withProvider() })
    // Wait a microtask for the effect's promise to resolve
    await act(async () => {
      await Promise.resolve()
    })
    expect(screen.getByTestId('portfolio-preview-template-pill').textContent).toBe('editorial')
  })

  it('Project button disabled when no included projects', () => {
    render(<PreviewPane />, { wrapper: withProvider() })
    const projectBtn = screen.getByRole('tab', { name: 'Project' }) as HTMLButtonElement
    expect(projectBtn.disabled).toBe(true)
  })

  it('clicking Project segment changes iframe src to project view', () => {
    render(<PreviewPane />, {
      wrapper: withProvider({
        projects: [{ projectId: 'alpha-proj', included: true, order: 0 }],
      }),
    })
    const projectBtn = screen.getByRole('tab', { name: 'Project' })
    fireEvent.click(projectBtn)
    expect(getIframe().getAttribute('src')).toBe(
      '/preview/portfolio?view=project&slug=alpha-proj',
    )
  })

  it('clicking Session segment changes iframe src to session view', () => {
    render(<PreviewPane />, {
      wrapper: withProvider({
        projects: [{ projectId: 'alpha-proj', included: true, order: 0 }],
      }),
    })
    const sessionBtn = screen.getByRole('tab', { name: 'Session' })
    fireEvent.click(sessionBtn)
    expect(getIframe().getAttribute('src')).toBe(
      '/preview/portfolio?view=session&slug=alpha-proj',
    )
  })

  it('Template pill click opens the TemplateBrowser modal', async () => {
    render(<PreviewPane />, { wrapper: withProvider() })
    expect(screen.queryByTestId('template-browser-stub')).toBeNull()
    fireEvent.click(screen.getByTestId('portfolio-preview-template-pill'))
    const stub = await screen.findByTestId('template-browser-stub')
    expect(stub.getAttribute('data-mode')).toBe('modal')
  })

  it('selecting a template in the modal calls saveTheme, updates the pill, bumps iframe key, and closes the modal', async () => {
    const api = await import('../../api')
    render(<PreviewPane />, { wrapper: withProvider() })
    await act(async () => { await Promise.resolve() })
    const initialIframe = screen.getByTestId('portfolio-preview-iframe')

    fireEvent.click(screen.getByTestId('portfolio-preview-template-pill'))
    fireEvent.click(await screen.findByTestId('template-browser-stub-pick'))

    await waitFor(() => {
      expect(api.saveTheme).toHaveBeenCalledWith('blueprint')
    })
    // Modal closed
    expect(screen.queryByTestId('template-browser-stub')).toBeNull()
    // Pill updated
    expect(screen.getByTestId('portfolio-preview-template-pill').textContent).toBe('blueprint')
    // Iframe element identity changed (key bump)
    expect(screen.getByTestId('portfolio-preview-iframe')).not.toBe(initialIframe)
  })

  it('"Open in browser" is disabled when never published', () => {
    render(<PreviewPane />, { wrapper: withProvider() })
    const btn = screen.getByTestId('portfolio-preview-open-in-browser') as HTMLButtonElement
    expect(btn.disabled).toBe(true)
  })

  it('"Open in browser" opens heyi.am/:username when heyi.am target is published', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    try {
      render(<PreviewPane />, {
        wrapper: withProvider({
          activeTarget: 'heyi.am',
          publishState: {
            targets: {
              'heyi.am': {
                lastPublishedAt: '2026-04-01T00:00:00.000Z',
                lastPublishedProfileHash: 'abc',
                lastPublishedProfile: {},
                config: {},
              },
            },
          },
        }),
      })
      // Wait for fetchAuthStatus to resolve and set the username.
      await act(async () => { await Promise.resolve(); await Promise.resolve() })
      const btn = screen.getByTestId('portfolio-preview-open-in-browser') as HTMLButtonElement
      expect(btn.disabled).toBe(false)
      fireEvent.click(btn)
      expect(openSpy).toHaveBeenCalledWith(
        'https://heyi.am/devuser',
        '_blank',
        'noopener,noreferrer',
      )
    } finally {
      openSpy.mockRestore()
    }
  })

  it('"Open in browser" prefers the published target URL when present', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    try {
      render(<PreviewPane />, {
        wrapper: withProvider({
          activeTarget: 'heyi.am',
          publishState: {
            targets: {
              'heyi.am': {
                lastPublishedAt: '2026-04-01T00:00:00.000Z',
                lastPublishedProfileHash: 'abc',
                lastPublishedProfile: {},
                config: {},
                url: 'https://heyi.am/custom-url',
              },
            },
          },
        }),
      })
      await act(async () => { await Promise.resolve(); await Promise.resolve() })
      fireEvent.click(screen.getByTestId('portfolio-preview-open-in-browser'))
      expect(openSpy).toHaveBeenCalledWith(
        'https://heyi.am/custom-url',
        '_blank',
        'noopener,noreferrer',
      )
    } finally {
      openSpy.mockRestore()
    }
  })

  it('"Open in browser" is disabled for the export target even when published', async () => {
    render(<PreviewPane />, {
      wrapper: withProvider({
        activeTarget: 'export',
        publishState: {
          targets: {
            export: {
              lastPublishedAt: '2026-04-01T00:00:00.000Z',
              lastPublishedProfileHash: 'abc',
              lastPublishedProfile: {},
              config: {},
            },
          },
        },
      }),
    })
    await act(async () => { await Promise.resolve() })
    const btn = screen.getByTestId('portfolio-preview-open-in-browser') as HTMLButtonElement
    expect(btn.disabled).toBe(true)
  })

  it('debounces profile updates: rapid changes result in one iframe reload', () => {
    vi.useFakeTimers()
    try {
      // Wrapper that exposes dispatch via a button.
      function Harness() {
        const { dispatch } = usePortfolioStore()
        return (
          <>
            <button
              data-testid="bump"
              onClick={() =>
                dispatch({
                  type: 'UPDATE_PROFILE_FIELD',
                  field: 'displayName',
                  value: Math.random().toString(),
                })
              }
            />
            <PreviewPane />
          </>
        )
      }
      render(<Harness />, { wrapper: withProvider() })
      const initialKey = getIframe().getAttribute('data-reactroot')
      // Use the iframe element identity (key changes => new element).
      const before = getIframe()

      // Five rapid keystrokes within the debounce window
      for (let i = 0; i < 5; i++) {
        fireEvent.click(screen.getByTestId('bump'))
        act(() => {
          vi.advanceTimersByTime(50)
        })
      }
      // None should have reloaded yet (cumulative 250ms < 300ms)
      // After total elapsed >= 300ms from the LAST click, exactly one reload.
      act(() => {
        vi.advanceTimersByTime(300)
      })
      const after = getIframe()
      // The element identity must have changed exactly once compared to before.
      expect(after).not.toBe(before)
      // And there is only one iframe rendered.
      expect(screen.getAllByTestId('portfolio-preview-iframe').length).toBe(1)
      void initialKey
    } finally {
      vi.useRealTimers()
    }
  })
})
