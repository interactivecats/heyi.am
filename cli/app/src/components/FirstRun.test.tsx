import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { FirstRun } from './FirstRun'

vi.mock('../api', () => ({
  fetchDashboard: vi.fn(),
  subscribeSyncProgress: vi.fn().mockReturnValue(() => {}),
  completeOnboarding: vi.fn().mockResolvedValue(undefined),
  saveApiKey: vi.fn(),
  checkUsername: vi.fn(),
  startSignup: vi.fn(),
  startLogin: vi.fn(),
  pollDeviceAuth: vi.fn(),
}))

// jsdom doesn't implement Element.scrollTo
;(Element.prototype as unknown as { scrollTo: () => void }).scrollTo = () => {}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function LocationProbe() {
  const loc = useLocation()
  return <div data-testid="loc">{loc.pathname + loc.search}</div>
}

function renderApp() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<FirstRun />} />
        <Route path="/portfolio" element={<LocationProbe />} />
        <Route path="/projects" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  )
}

const dashboardWithData = {
  onboardingComplete: true,
  isEmpty: false,
  stats: { sessionCount: 12, projectCount: 3, sourceCount: 2, enhancedCount: 1 },
  projects: [],
  sync: { status: 'idle', phase: 'done', current: 0, total: 0, parentCount: 0 },
}

describe('FirstRun → Dashboard', () => {
  beforeEach(async () => {
    const api = await import('../api')
    vi.mocked(api.fetchDashboard).mockResolvedValue(dashboardWithData as never)
  })

  it('renders the Open Portfolio action button when on the dashboard', async () => {
    renderApp()
    const link = await screen.findByRole('link', { name: 'Open Portfolio' })
    expect(link.getAttribute('href')).toBe('/portfolio')
  })

  it('Export feature card uses the new multi-target copy', async () => {
    renderApp()
    await waitFor(() => screen.getByText(/Export your full portfolio/i))
    const desc = screen.getByText(/Export your full portfolio/i)
    expect(desc.textContent).toContain('static site')
    expect(desc.textContent).toContain('heyi.am')
    expect(desc.textContent).toContain('GitHub Pages')
  })

  it('Enhanced stat card links to /projects?filter=unenhanced', async () => {
    renderApp()
    await waitFor(() => screen.getByText('Enhanced'))
    const enhancedLabel = screen.getByText('Enhanced')
    const link = enhancedLabel.closest('a')
    expect(link?.getAttribute('href')).toBe('/projects?filter=unenhanced')
  })
})

describe('FirstRun completion lands on /', () => {
  it('after onboarding completes, the dashboard is rendered at /', async () => {
    const api = await import('../api')
    vi.mocked(api.fetchDashboard).mockResolvedValue(dashboardWithData as never)
    renderApp()
    // Hero copy proves we're on the dashboard surface (which is mounted at /)
    await waitFor(() =>
      expect(screen.getByText(/Turn your AI sessions into a dev portfolio/i)).toBeTruthy(),
    )
  })
})
