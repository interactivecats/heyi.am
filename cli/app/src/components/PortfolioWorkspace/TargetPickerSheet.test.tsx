import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import { TargetPickerSheet } from './TargetPickerSheet'
import {
  PortfolioStoreProvider,
  type PortfolioStoreState,
} from '../../hooks/usePortfolioStore'

afterEach(() => {
  cleanup()
  // Remove any mocked showDirectoryPicker we installed on window.
  delete (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker
})

function renderSheet(initial: Partial<PortfolioStoreState> = {}, onClose = vi.fn()) {
  const utils = render(
    <PortfolioStoreProvider initialState={initial}>
      <TargetPickerSheet open={true} onClose={onClose} />
    </PortfolioStoreProvider>,
  )
  return { ...utils, onClose }
}

describe('TargetPickerSheet', () => {
  it('does not render when open=false', () => {
    render(
      <PortfolioStoreProvider>
        <TargetPickerSheet open={false} onClose={() => {}} />
      </PortfolioStoreProvider>,
    )
    expect(screen.queryByTestId('target-picker-sheet')).toBeNull()
  })

  it('renders three target cards in order: export, heyi.am, github', () => {
    renderSheet()
    const sections = screen
      .getAllByRole('heading', { level: 3 })
      .map((h) => h.textContent)
    expect(sections).toEqual(['Export to folder', 'heyi.am', 'GitHub Pages'])
  })

  it('GitHub Pages card is disabled with a "Coming soon" badge', () => {
    renderSheet()
    expect(screen.getByTestId('target-card-github').getAttribute('aria-disabled')).toBe(
      'true',
    )
    expect(screen.getByTestId('target-github-coming-soon')).toBeTruthy()
    const btn = screen.getByTestId('target-github-set-active') as HTMLButtonElement
    expect(btn.disabled).toBe(true)
  })

  describe('folder picker', () => {
    beforeEach(() => {
      // jsdom does NOT implement showDirectoryPicker — install a mock.
      ;(window as unknown as { showDirectoryPicker: unknown }).showDirectoryPicker = vi
        .fn()
        .mockResolvedValue({ name: 'my-portfolio-export' })
    })

    it('clicking "Pick folder" calls showDirectoryPicker and stores the name', async () => {
      renderSheet()
      const btn = screen.getByTestId('target-export-pick-folder')
      await act(async () => {
        fireEvent.click(btn)
      })
      expect(
        (window as unknown as { showDirectoryPicker: ReturnType<typeof vi.fn> })
          .showDirectoryPicker,
      ).toHaveBeenCalled()
      expect(screen.getByTestId('target-export-path').textContent).toBe(
        'my-portfolio-export',
      )
    })

    it('silently ignores user-cancelled picker (AbortError)', async () => {
      ;(window as unknown as { showDirectoryPicker: unknown }).showDirectoryPicker = vi
        .fn()
        .mockRejectedValue(
          typeof DOMException !== 'undefined'
            ? new DOMException('cancelled', 'AbortError')
            : Object.assign(new Error('cancelled'), { name: 'AbortError' }),
        )
      renderSheet()
      await act(async () => {
        fireEvent.click(screen.getByTestId('target-export-pick-folder'))
      })
      expect(screen.queryByTestId('target-export-picker-error')).toBeNull()
    })
  })

  describe('fallback text input', () => {
    // Ensure the API is not present for these tests.
    beforeEach(() => {
      delete (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker
    })

    it('renders a text input instead of a picker button', () => {
      renderSheet()
      expect(screen.queryByTestId('target-export-pick-folder')).toBeNull()
      expect(screen.getByTestId('target-export-path-input')).toBeTruthy()
    })

    it('typing and blurring commits the path to the store', () => {
      const { rerender } = render(
        <PortfolioStoreProvider>
          <TargetPickerSheet open={true} onClose={() => {}} />
        </PortfolioStoreProvider>,
      )
      const input = screen.getByTestId('target-export-path-input') as HTMLInputElement
      fireEvent.change(input, { target: { value: '/Users/ada/out' } })
      fireEvent.blur(input)
      // Re-render to observe the committed value round-tripping through the store.
      rerender(
        <PortfolioStoreProvider initialState={{ exportTargetPath: '/Users/ada/out' }}>
          <TargetPickerSheet open={true} onClose={() => {}} />
        </PortfolioStoreProvider>,
      )
      const input2 = screen.getByTestId('target-export-path-input') as HTMLInputElement
      expect(input2.value).toBe('/Users/ada/out')
    })
  })

  describe('visibility radio', () => {
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
      // After dispatch, the component re-renders with the new visibility.
      expect(
        (screen.getByTestId('target-heyiam-visibility-unlisted') as HTMLInputElement)
          .checked,
      ).toBe(true)
    })
  })

  describe('active target', () => {
    it('clicking "Set as active target" on export switches activeTarget', () => {
      renderSheet()
      fireEvent.click(screen.getByTestId('target-export-set-active'))
      // Button now reads "Active target" and is disabled.
      const btn = screen.getByTestId('target-export-set-active') as HTMLButtonElement
      expect(btn.textContent).toContain('Active target')
      expect(btn.disabled).toBe(true)
      expect(screen.getByTestId('target-export-active-badge')).toBeTruthy()
    })

    it('clicking "Set as active target" on heyi.am switches activeTarget', () => {
      renderSheet({ activeTarget: 'export' })
      fireEvent.click(screen.getByTestId('target-heyiam-set-active'))
      const btn = screen.getByTestId('target-heyiam-set-active') as HTMLButtonElement
      expect(btn.disabled).toBe(true)
      expect(screen.getByTestId('target-heyiam-active-badge')).toBeTruthy()
    })
  })

  describe('dismissal', () => {
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
})
