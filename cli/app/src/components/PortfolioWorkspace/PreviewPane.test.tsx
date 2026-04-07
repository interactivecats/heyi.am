import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'
import { PreviewPane } from './PreviewPane'
import {
  PortfolioStoreProvider,
  usePortfolioStore,
  type PortfolioStoreState,
} from '../../hooks/usePortfolioStore'

vi.mock('../../api', () => ({
  fetchTheme: vi.fn(async () => ({ template: 'editorial' })),
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
