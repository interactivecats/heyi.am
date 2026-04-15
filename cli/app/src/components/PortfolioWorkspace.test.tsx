import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react'

// jsdom ships without ResizeObserver. PreviewPane's ScaledIframe needs one
// at mount time — install a no-op shim so tests can render it.
if (typeof globalThis.ResizeObserver === 'undefined') {
  class ResizeObserverStub {
    observe() { /* no-op */ }
    unobserve() { /* no-op */ }
    disconnect() { /* no-op */ }
  }
  ;(globalThis as unknown as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver = ResizeObserverStub
}

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api')
  return {
    ...actual,
    fetchPortfolio: vi.fn().mockResolvedValue({}),
    fetchPortfolioPublishState: vi.fn().mockResolvedValue({ targets: {} }),
    fetchProjects: vi.fn().mockResolvedValue([
      { name: 'Alpha', dirName: 'alpha', uuid: 'u1', sessionCount: 0, description: '', totalLoc: 0, totalDuration: 0, totalFiles: 0, skills: [], dateRange: '', lastSessionDate: '' },
      { name: 'Beta', dirName: 'beta', uuid: 'u2', sessionCount: 0, description: '', totalLoc: 0, totalDuration: 0, totalFiles: 0, skills: [], dateRange: '', lastSessionDate: '' },
    ]),
    fetchTheme: vi.fn().mockResolvedValue({ template: 'editorial' }),
    fetchAuthStatus: vi.fn().mockResolvedValue({ authenticated: false }),
  }
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})
import { MemoryRouter } from 'react-router-dom'
import { PortfolioWorkspace } from './PortfolioWorkspace'
import type { Project } from '../types'

describe('PortfolioWorkspace skeleton', () => {
  it('renders the three workspace regions', () => {
    render(
      <MemoryRouter initialEntries={['/portfolio']}>
        <PortfolioWorkspace />
      </MemoryRouter>,
    )
    expect(screen.getByTestId('portfolio-statusbar')).toBeTruthy()
    expect(screen.getByTestId('portfolio-preview')).toBeTruthy()
    expect(screen.getByTestId('portfolio-editrail')).toBeTruthy()
  })

  it('hydrates the projects list so the EditRail count reflects N of N', async () => {
    render(
      <MemoryRouter initialEntries={['/portfolio']}>
        <PortfolioWorkspace />
      </MemoryRouter>,
    )
    // Open the projects section so the count meta is visible.
    await waitFor(() => {
      expect(screen.getByTestId('editrail-section-toggle-projects').textContent).toContain('2 of 2')
    })
    fireEvent.click(screen.getByTestId('editrail-section-toggle-projects'))
    await waitFor(() => {
      expect(screen.getByTestId('editrail-project-row-alpha')).toBeTruthy()
      expect(screen.getByTestId('editrail-project-row-beta')).toBeTruthy()
    })
  })

  it('defaults a fresh portfolio to the 3 most recent projects when more than 3 exist', async () => {
    const api = await import('../api')
    vi.mocked(api.fetchProjects).mockResolvedValueOnce([
      { name: 'A', dirName: 'a', uuid: 'u', sessionCount: 0, description: '', totalLoc: 0, totalDuration: 0, totalFiles: 0, skills: [], dateRange: '', lastSessionDate: '2026-01-01' },
      { name: 'B', dirName: 'b', uuid: 'u', sessionCount: 0, description: '', totalLoc: 0, totalDuration: 0, totalFiles: 0, skills: [], dateRange: '', lastSessionDate: '2026-03-15' },
      { name: 'C', dirName: 'c', uuid: 'u', sessionCount: 0, description: '', totalLoc: 0, totalDuration: 0, totalFiles: 0, skills: [], dateRange: '', lastSessionDate: '2026-02-10' },
      { name: 'D', dirName: 'd', uuid: 'u', sessionCount: 0, description: '', totalLoc: 0, totalDuration: 0, totalFiles: 0, skills: [], dateRange: '', lastSessionDate: '2026-04-01' },
    ] as Project[])
    render(
      <MemoryRouter initialEntries={['/portfolio']}>
        <PortfolioWorkspace />
      </MemoryRouter>,
    )
    await waitFor(() => {
      expect(screen.getByTestId('editrail-section-toggle-projects').textContent).toContain('3 of 4')
    })
  })

  it('preview pane container allows flex children to shrink (min-w-0)', () => {
    render(
      <MemoryRouter initialEntries={['/portfolio']}>
        <PortfolioWorkspace />
      </MemoryRouter>,
    )
    const preview = screen.getByTestId('portfolio-preview')
    expect(preview.className).toMatch(/min-w-0/)
    expect(preview.className).toMatch(/min-h-0/)
  })
})
