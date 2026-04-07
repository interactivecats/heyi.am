import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Projects, enhancementStatusLabel } from './Projects'
import * as api from '../api'
import type { Project } from '../api'

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>()
  return { ...actual, fetchProjects: vi.fn() }
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    name: 'demo',
    dirName: 'demo',
    uuid: 'u',
    sessionCount: 5,
    description: 'A project',
    totalLoc: 100,
    totalDuration: 60,
    totalFiles: 3,
    skills: [],
    dateRange: '',
    lastSessionDate: '',
    ...overrides,
  }
}

describe('enhancementStatusLabel', () => {
  it('returns null when no sessions are enhanced', () => {
    expect(enhancementStatusLabel(makeProject({ enhancedSessionCount: 0 }))).toBeNull()
    expect(enhancementStatusLabel(makeProject())).toBeNull()
  })

  it('returns "N of M enhanced" when partially enhanced', () => {
    expect(
      enhancementStatusLabel(makeProject({ sessionCount: 5, enhancedSessionCount: 2 })),
    ).toBe('2 of 5 enhanced')
  })

  it('returns "Enhanced ✓" only when fully enhanced AND project narrative exists', () => {
    expect(
      enhancementStatusLabel(
        makeProject({ sessionCount: 3, enhancedSessionCount: 3, enhancedAt: '2026-04-01' }),
      ),
    ).toBe('Enhanced \u2713')
    // No enhancedAt → still partial-style
    expect(
      enhancementStatusLabel(makeProject({ sessionCount: 3, enhancedSessionCount: 3 })),
    ).toBe('3 of 3 enhanced')
  })
})

describe('Projects — enhancement-status badge rendering', () => {
  beforeEach(() => {
    vi.mocked(api.fetchProjects).mockResolvedValue([
      makeProject({ name: 'alpha', dirName: 'alpha', sessionCount: 4, enhancedSessionCount: 2 }),
      makeProject({
        name: 'beta',
        dirName: 'beta',
        sessionCount: 3,
        enhancedSessionCount: 3,
        enhancedAt: '2026-04-01',
      }),
      makeProject({ name: 'gamma', dirName: 'gamma', sessionCount: 7, enhancedSessionCount: 0 }),
    ])
  })

  it('renders partial, full, and absent badges per card', async () => {
    render(
      <MemoryRouter>
        <Projects />
      </MemoryRouter>,
    )
    await waitFor(() => expect(screen.getByText('alpha')).toBeTruthy())
    expect(screen.getByText('2 of 4 enhanced')).toBeTruthy()
    expect(screen.getByText('Enhanced \u2713')).toBeTruthy()
    // Gamma has no enhancement → no badge for it
    const badges = screen.getAllByTestId('enhancement-status')
    expect(badges.length).toBe(2)
  })
})

describe('Projects ?filter=unenhanced', () => {
  beforeEach(() => {
    vi.mocked(api.fetchProjects).mockResolvedValue([
      makeProject({ name: 'alpha', dirName: 'alpha', enhancedSessionCount: 0 }),
      makeProject({
        name: 'beta',
        dirName: 'beta',
        sessionCount: 3,
        enhancedSessionCount: 3,
        enhancedAt: '2026-04-01',
      }),
      makeProject({ name: 'gamma', dirName: 'gamma', sessionCount: 5, enhancedSessionCount: 2 }),
    ])
  })

  it('shows only fully-unenhanced projects when ?filter=unenhanced', async () => {
    render(
      <MemoryRouter initialEntries={['/projects?filter=unenhanced']}>
        <Projects />
      </MemoryRouter>,
    )
    await waitFor(() => expect(screen.getByText('alpha')).toBeTruthy())
    expect(screen.queryByText('beta')).toBeNull()
    expect(screen.queryByText('gamma')).toBeNull()
  })

  it('shows all projects when no ?filter is set', async () => {
    render(
      <MemoryRouter initialEntries={['/projects']}>
        <Projects />
      </MemoryRouter>,
    )
    await waitFor(() => expect(screen.getByText('alpha')).toBeTruthy())
    expect(screen.getByText('beta')).toBeTruthy()
    expect(screen.getByText('gamma')).toBeTruthy()
  })
})
