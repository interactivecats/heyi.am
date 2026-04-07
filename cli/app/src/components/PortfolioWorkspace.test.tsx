import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react'

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
