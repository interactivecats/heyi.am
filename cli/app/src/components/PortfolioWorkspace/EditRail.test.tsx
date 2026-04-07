import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act, waitFor } from '@testing-library/react'

vi.mock('../../api', async () => {
  const actual = await vi.importActual<typeof import('../../api')>('../../api')
  return {
    ...actual,
    fetchProjects: vi.fn().mockResolvedValue([
      { name: 'Alpha Project', dirName: 'p1', uuid: 'u1', sessionCount: 0, description: '', totalLoc: 0, totalDuration: 0, totalFiles: 0, skills: [], dateRange: '', lastSessionDate: '' },
      { name: 'Beta Project', dirName: 'p2', uuid: 'u2', sessionCount: 0, description: '', totalLoc: 0, totalDuration: 0, totalFiles: 0, skills: [], dateRange: '', lastSessionDate: '' },
      { name: 'Gamma Project', dirName: 'p3', uuid: 'u3', sessionCount: 0, description: '', totalLoc: 0, totalDuration: 0, totalFiles: 0, skills: [], dateRange: '', lastSessionDate: '' },
    ]),
    fetchTheme: vi.fn().mockResolvedValue({ template: 'editorial' }),
    fetchTemplates: vi.fn().mockResolvedValue([]),
    saveTheme: vi.fn().mockResolvedValue(undefined),
    savePortfolio: vi.fn().mockResolvedValue(undefined),
  }
})

// Mock TemplateBrowser so EditRail tests don't pull in the full template
// browser surface (and its own data fetching). We expose the callbacks via
// data-testid buttons so tests can drive selection/close deterministically.
vi.mock('../TemplateBrowser', () => ({
  TemplateBrowser: ({
    mode,
    onSelectTemplate,
    onClose,
  }: {
    mode?: string
    onSelectTemplate?: (n: string) => void
    onClose?: () => void
  }) => (
    <div data-testid="template-browser-mock" data-mode={mode}>
      <button
        type="button"
        data-testid="template-browser-mock-pick"
        onClick={() => onSelectTemplate?.('paper')}
      >
        pick paper
      </button>
      <button type="button" data-testid="template-browser-mock-close" onClick={() => onClose?.()}>
        close
      </button>
    </div>
  ),
}))

import { EditRail } from './EditRail'
import * as api from '../../api'
import {
  PortfolioStoreProvider,
  usePortfolioStore,
  type PortfolioStoreState,
} from '../../hooks/usePortfolioStore'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function renderWith(initial: Partial<PortfolioStoreState> = {}) {
  return render(
    <PortfolioStoreProvider initialState={initial}>
      <EditRail />
    </PortfolioStoreProvider>,
  )
}

const baseProjects = [
  { projectId: 'p1', included: true, order: 0 },
  { projectId: 'p2', included: false, order: 1 },
  { projectId: 'p3', included: true, order: 2 },
]

const publishedProfile = {
  bio: 'Old bio',
  displayName: 'Ada',
}

const livePublishState = {
  targets: {
    'heyi.am': {
      lastPublishedAt: '2026-04-07T00:00:00Z',
      lastPublishedProfileHash: 'abc',
      lastPublishedProfile: publishedProfile,
      config: {},
    },
  },
}

describe('EditRail — sections', () => {
  it('renders all five section headers', () => {
    renderWith()
    expect(screen.getByTestId('editrail-section-identity')).toBeTruthy()
    expect(screen.getByTestId('editrail-section-contact')).toBeTruthy()
    expect(screen.getByTestId('editrail-section-photo-resume')).toBeTruthy()
    expect(screen.getByTestId('editrail-section-projects')).toBeTruthy()
    expect(screen.getByTestId('editrail-section-template')).toBeTruthy()
    expect(screen.queryByTestId('editrail-section-accent')).toBeNull()
  })

  it('Identity section is open by default and Contact is collapsed', () => {
    renderWith()
    expect(screen.getByTestId('editrail-section-body-identity')).toBeTruthy()
    expect(screen.queryByTestId('editrail-section-body-contact')).toBeNull()
  })

  it('clicking a section header toggles open/closed', () => {
    renderWith()
    const toggle = screen.getByTestId('editrail-section-toggle-contact')
    fireEvent.click(toggle)
    expect(screen.getByTestId('editrail-section-body-contact')).toBeTruthy()
    fireEvent.click(toggle)
    expect(screen.queryByTestId('editrail-section-body-contact')).toBeNull()
  })
})

describe('EditRail — text fields live update with debounced save', () => {
  it('typing in displayName dispatches to the store on every keystroke', () => {
    let stateRef: { current: PortfolioStoreState | null } = { current: null }
    function Probe() {
      const { state } = usePortfolioStore()
      stateRef.current = state
      return null
    }
    render(
      <PortfolioStoreProvider>
        <EditRail />
        <Probe />
      </PortfolioStoreProvider>,
    )
    const input = screen.getByTestId('editrail-field-displayName') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'G' } })
    expect(stateRef.current?.profile.displayName).toBe('G')
    fireEvent.change(input, { target: { value: 'Gr' } })
    expect(stateRef.current?.profile.displayName).toBe('Gr')
    fireEvent.change(input, { target: { value: 'Grace' } })
    expect(stateRef.current?.profile.displayName).toBe('Grace')
  })

  it('savePortfolio is NOT called during the debounce window', () => {
    vi.useFakeTimers()
    try {
      renderWith({ profile: { bio: 'seed bio' } })
      const input = screen.getByTestId('editrail-field-displayName') as HTMLInputElement
      fireEvent.change(input, { target: { value: 'G' } })
      fireEvent.change(input, { target: { value: 'Gr' } })
      fireEvent.change(input, { target: { value: 'Grace' } })
      // Advance almost-but-not-quite past the debounce window.
      act(() => {
        vi.advanceTimersByTime(299)
      })
      expect(api.savePortfolio).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('savePortfolio is called exactly once after the debounce window elapses', () => {
    vi.useFakeTimers()
    try {
      renderWith({ profile: { bio: 'seed bio' } })
      const input = screen.getByTestId('editrail-field-displayName') as HTMLInputElement
      fireEvent.change(input, { target: { value: 'G' } })
      fireEvent.change(input, { target: { value: 'Gr' } })
      fireEvent.change(input, { target: { value: 'Grace' } })
      act(() => {
        vi.advanceTimersByTime(300)
      })
      expect(api.savePortfolio).toHaveBeenCalledTimes(1)
      const arg = (api.savePortfolio as ReturnType<typeof vi.fn>).mock.calls[0][0]
      expect(arg.displayName).toBe('Grace')
      expect(arg.bio).toBe('seed bio')
    } finally {
      vi.useRealTimers()
    }
  })

  it('dispatches PROFILE_SAVED once savePortfolio resolves (bumps lastSavedAt)', async () => {
    vi.useFakeTimers()
    let stateRef: { current: PortfolioStoreState | null } = { current: null }
    function Probe() {
      const { state } = usePortfolioStore()
      stateRef.current = state
      return null
    }
    try {
      vi.mocked(api.savePortfolio).mockResolvedValue(undefined)
      render(
        <PortfolioStoreProvider initialState={{ profile: { bio: 'seed' } }}>
          <EditRail />
          <Probe />
        </PortfolioStoreProvider>,
      )
      const before = stateRef.current?.lastSavedAt ?? null
      const input = screen.getByTestId('editrail-field-displayName') as HTMLInputElement
      fireEvent.change(input, { target: { value: 'Grace' } })
      await act(async () => {
        vi.advanceTimersByTime(300)
      })
      // Flush the resolved promise microtasks so the .then dispatch runs.
      await act(async () => {
        await Promise.resolve()
        await Promise.resolve()
      })
      expect(api.savePortfolio).toHaveBeenCalledTimes(1)
      expect(stateRef.current?.lastSavedAt).not.toBeNull()
      expect(stateRef.current?.lastSavedAt).not.toBe(before)
    } finally {
      vi.useRealTimers()
    }
  })

  it('does NOT dispatch PROFILE_SAVED when savePortfolio rejects', async () => {
    vi.useFakeTimers()
    let stateRef: { current: PortfolioStoreState | null } = { current: null }
    function Probe() {
      const { state } = usePortfolioStore()
      stateRef.current = state
      return null
    }
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      vi.mocked(api.savePortfolio).mockRejectedValueOnce(new Error('boom'))
      render(
        <PortfolioStoreProvider initialState={{ profile: { bio: 'seed' } }}>
          <EditRail />
          <Probe />
        </PortfolioStoreProvider>,
      )
      const before = stateRef.current?.lastSavedAt ?? null
      const input = screen.getByTestId('editrail-field-displayName') as HTMLInputElement
      fireEvent.change(input, { target: { value: 'Grace' } })
      await act(async () => {
        vi.advanceTimersByTime(300)
      })
      await act(async () => {
        await Promise.resolve()
        await Promise.resolve()
      })
      expect(stateRef.current?.lastSavedAt).toBe(before)
    } finally {
      errSpy.mockRestore()
      vi.useRealTimers()
    }
  })

  it('typing in bio dispatches to the store immediately', () => {
    let stateRef: { current: PortfolioStoreState | null } = { current: null }
    function Probe() {
      const { state } = usePortfolioStore()
      stateRef.current = state
      return null
    }
    render(
      <PortfolioStoreProvider>
        <EditRail />
        <Probe />
      </PortfolioStoreProvider>,
    )
    const ta = screen.getByTestId('editrail-field-bio') as HTMLTextAreaElement
    fireEvent.change(ta, { target: { value: 'New bio text' } })
    expect(stateRef.current?.profile.bio).toBe('New bio text')
  })

  it('dirty bio shows the amber border when value differs from lastPublishedProfile', () => {
    renderWith({
      profile: { bio: 'Brand new bio' },
      publishState: livePublishState,
    })
    const ta = screen.getByTestId('editrail-field-bio') as HTMLTextAreaElement
    expect(ta.className).toMatch(/border-amber-500/)
  })

  it('clean bio (matches lastPublishedProfile) does not show amber border', () => {
    renderWith({
      profile: { bio: 'Old bio' },
      publishState: livePublishState,
    })
    const ta = screen.getByTestId('editrail-field-bio') as HTMLTextAreaElement
    expect(ta.className).not.toMatch(/border-amber-500/)
  })
})

describe('EditRail — photo upload', () => {
  function makeFile(size: number, name = 'photo.png', type = 'image/png'): File {
    const f = new File(['x'], name, { type })
    Object.defineProperty(f, 'size', { value: size })
    return f
  }

  it('reads file as base64 and dispatches UPDATE_PROFILE_FIELD', async () => {
    renderWith()
    fireEvent.click(screen.getByTestId('editrail-section-toggle-photo-resume'))
    const input = screen.getByTestId('editrail-field-photoBase64') as HTMLInputElement
    const file = makeFile(1024)
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } })
    })
    await waitFor(() => {
      const img = document.querySelector('img[alt="Profile"]') as HTMLImageElement | null
      expect(img).toBeTruthy()
      expect(img!.src).toMatch(/^data:/)
    })
  })

  it('rejects oversize photo (>5MB)', () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
    renderWith()
    fireEvent.click(screen.getByTestId('editrail-section-toggle-photo-resume'))
    const input = screen.getByTestId('editrail-field-photoBase64') as HTMLInputElement
    const file = makeFile(6 * 1024 * 1024)
    fireEvent.change(input, { target: { files: [file] } })
    expect(alertSpy).toHaveBeenCalledWith('Photo must be under 5MB')
    alertSpy.mockRestore()
  })
})

describe('EditRail — resume upload', () => {
  function makeFile(size: number, name = 'cv.pdf', type = 'application/pdf'): File {
    const f = new File(['x'], name, { type })
    Object.defineProperty(f, 'size', { value: size })
    return f
  }

  it('dispatches base64 + filename on upload', async () => {
    renderWith()
    fireEvent.click(screen.getByTestId('editrail-section-toggle-photo-resume'))
    const input = screen.getByTestId('editrail-field-resumeBase64') as HTMLInputElement
    const file = makeFile(1024, 'mycv.pdf')
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } })
    })
    await waitFor(() => {
      expect(screen.getByText('mycv.pdf')).toBeTruthy()
    })
  })

  it('rejects oversize resume (>10MB)', () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
    renderWith()
    fireEvent.click(screen.getByTestId('editrail-section-toggle-photo-resume'))
    const input = screen.getByTestId('editrail-field-resumeBase64') as HTMLInputElement
    const file = makeFile(11 * 1024 * 1024)
    fireEvent.change(input, { target: { files: [file] } })
    expect(alertSpy).toHaveBeenCalledWith('Resume must be under 10MB')
    alertSpy.mockRestore()
  })
})

describe('EditRail — projects section', () => {
  it('renders N project rows in store order', async () => {
    renderWith({ projects: baseProjects })
    fireEvent.click(screen.getByTestId('editrail-section-toggle-projects'))
    await waitFor(() => {
      expect(screen.getByTestId('editrail-project-row-p1')).toBeTruthy()
      expect(screen.getByTestId('editrail-project-row-p2')).toBeTruthy()
      expect(screen.getByTestId('editrail-project-row-p3')).toBeTruthy()
    })
  })

  it('header reflects "M of N" included count', () => {
    renderWith({ projects: baseProjects })
    const header = screen.getByTestId('editrail-section-toggle-projects')
    // 2 included of 3
    expect(header.textContent).toContain('2 of 3')
  })

  it('toggling a project checkbox debounce-saves projectsOnPortfolio and bumps refreshTrigger', async () => {
    vi.useFakeTimers()
    let stateRef: { current: PortfolioStoreState | null } = { current: null }
    function Probe() {
      const { state } = usePortfolioStore()
      stateRef.current = state
      return null
    }
    try {
      vi.mocked(api.savePortfolio).mockResolvedValue(undefined)
      render(
        <PortfolioStoreProvider initialState={{ projects: baseProjects }}>
          <EditRail />
          <Probe />
        </PortfolioStoreProvider>,
      )
      fireEvent.click(screen.getByTestId('editrail-section-toggle-projects'))
      const before = stateRef.current?.refreshTrigger ?? 0
      const cb = screen.getByTestId('editrail-project-checkbox-p2') as HTMLInputElement
      fireEvent.click(cb)
      // Not yet — debounced.
      expect(api.savePortfolio).not.toHaveBeenCalled()
      await act(async () => {
        vi.advanceTimersByTime(300)
      })
      await act(async () => {
        await Promise.resolve()
        await Promise.resolve()
      })
      expect(api.savePortfolio).toHaveBeenCalledTimes(1)
      const arg = (api.savePortfolio as ReturnType<typeof vi.fn>).mock.calls[0][0]
      expect(arg.projectsOnPortfolio).toEqual([
        { projectId: 'p1', included: true, order: 0 },
        { projectId: 'p2', included: true, order: 1 },
        { projectId: 'p3', included: true, order: 2 },
      ])
      expect(stateRef.current?.refreshTrigger).toBe(before + 1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('toggling a project checkbox dispatches TOGGLE_PROJECT_INCLUDED', () => {
    renderWith({ projects: baseProjects })
    fireEvent.click(screen.getByTestId('editrail-section-toggle-projects'))
    const cb = screen.getByTestId('editrail-project-checkbox-p2') as HTMLInputElement
    expect(cb.checked).toBe(false)
    fireEvent.click(cb)
    const after = screen.getByTestId('editrail-project-checkbox-p2') as HTMLInputElement
    expect(after.checked).toBe(true)
    // header updates to 3 of 3
    expect(screen.getByTestId('editrail-section-toggle-projects').textContent).toContain('3 of 3')
  })

  it('reordering: simulating drag-end reindexes via REORDER_PROJECT', () => {
    // We render the EditRail and exercise the reducer indirectly via the
    // store-bound DndContext callback. dnd-kit's drag end is hard to simulate
    // in jsdom (it relies on PointerEvents we cannot fake), so we verify the
    // store reducer integration by reading state via a probe component.
    let dispatchRef:
      | ((a: { type: 'REORDER_PROJECT'; projectId: string; newIndex: number }) => void)
      | null = null
    function Probe() {
      const { dispatch, state } = usePortfolioStore()
      dispatchRef = dispatch as typeof dispatchRef
      return (
        <div data-testid="probe-order">
          {state.projects
            .slice()
            .sort((a, b) => a.order - b.order)
            .map((p) => p.projectId)
            .join(',')}
        </div>
      )
    }
    render(
      <PortfolioStoreProvider initialState={{ projects: baseProjects }}>
        <Probe />
        <EditRail />
      </PortfolioStoreProvider>,
    )
    expect(screen.getByTestId('probe-order').textContent).toBe('p1,p2,p3')
    act(() => {
      dispatchRef!({ type: 'REORDER_PROJECT', projectId: 'p3', newIndex: 0 })
    })
    expect(screen.getByTestId('probe-order').textContent).toBe('p3,p1,p2')
  })
})

describe('EditRail — template stub', () => {
  it('renders template pill and Change template button', () => {
    renderWith()
    fireEvent.click(screen.getByTestId('editrail-section-toggle-template'))
    expect(screen.getByTestId('editrail-template-change')).toBeTruthy()
  })

  it('does not render an Accent section (removed)', () => {
    renderWith()
    expect(screen.queryByTestId('editrail-section-accent')).toBeNull()
  })
})

describe('EditRail — Change template wiring', () => {
  it('clicking Change template opens the TemplateBrowser modal', () => {
    renderWith()
    fireEvent.click(screen.getByTestId('editrail-section-toggle-template'))
    expect(screen.queryByTestId('template-browser-mock')).toBeNull()
    fireEvent.click(screen.getByTestId('editrail-template-change'))
    const modal = screen.getByTestId('template-browser-mock')
    expect(modal).toBeTruthy()
    expect(modal.getAttribute('data-mode')).toBe('modal')
  })

  it('selecting a template calls saveTheme, closes the modal, and updates the pill', async () => {
    const saveSpy = vi.mocked(api.saveTheme)
    renderWith()
    fireEvent.click(screen.getByTestId('editrail-section-toggle-template'))
    // Wait for fetchTheme effect to settle so the pill starts at "editorial".
    await waitFor(() => {
      expect(screen.getByTestId('editrail-template-pill').textContent).toBe('editorial')
    })
    fireEvent.click(screen.getByTestId('editrail-template-change'))
    await act(async () => {
      fireEvent.click(screen.getByTestId('template-browser-mock-pick'))
    })
    await waitFor(() => {
      expect(saveSpy).toHaveBeenCalledWith('paper')
    })
    expect(screen.queryByTestId('template-browser-mock')).toBeNull()
    expect(screen.getByTestId('editrail-template-pill').textContent).toBe('paper')
  })

  it('closing the modal without selecting leaves the pill unchanged', async () => {
    renderWith()
    fireEvent.click(screen.getByTestId('editrail-section-toggle-template'))
    await waitFor(() => {
      expect(screen.getByTestId('editrail-template-pill').textContent).toBe('editorial')
    })
    fireEvent.click(screen.getByTestId('editrail-template-change'))
    fireEvent.click(screen.getByTestId('template-browser-mock-close'))
    expect(screen.queryByTestId('template-browser-mock')).toBeNull()
    expect(screen.getByTestId('editrail-template-pill').textContent).toBe('editorial')
  })

  it('rolls back the pill when saveTheme rejects', async () => {
    vi.mocked(api.saveTheme).mockRejectedValueOnce(new Error('boom'))
    renderWith()
    fireEvent.click(screen.getByTestId('editrail-section-toggle-template'))
    await waitFor(() => {
      expect(screen.getByTestId('editrail-template-pill').textContent).toBe('editorial')
    })
    fireEvent.click(screen.getByTestId('editrail-template-change'))
    await act(async () => {
      fireEvent.click(screen.getByTestId('template-browser-mock-pick'))
    })
    await waitFor(() => {
      expect(screen.getByTestId('editrail-template-pill').textContent).toBe('editorial')
    })
  })
})
