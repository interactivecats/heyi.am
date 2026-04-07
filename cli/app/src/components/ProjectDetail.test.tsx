import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { ProjectDetail } from './ProjectDetail'
import * as api from '../api'

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>()
  return {
    ...actual,
    fetchProjectDetail: vi.fn(),
    fetchProjectRender: vi.fn(),
    fetchAuthStatus: vi.fn(),
    fetchGitRemote: vi.fn(),
    saveProjectEnhanceLocally: vi.fn(),
    captureScreenshotFromUrl: vi.fn(),
  }
})

vi.mock('@heyiam/ui', () => ({
  mountCounterAnimations: vi.fn(),
  mountScrollReveals: vi.fn(),
  mountBarAnimations: vi.fn(),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function baseProject(overrides: Partial<api.Project> = {}): api.Project {
  return {
    name: 'demo',
    dirName: 'demo',
    uuid: 'u',
    sessionCount: 3,
    description: '',
    totalLoc: 0,
    totalDuration: 0,
    totalFiles: 0,
    skills: [],
    dateRange: '',
    lastSessionDate: '',
    ...overrides,
  }
}

function renderDetail(detailOverrides: Partial<api.ProjectDetail> = {}) {
  vi.mocked(api.fetchProjectRender).mockResolvedValue({
    html: '<div>render</div>',
    css: '',
    accent: '#000',
    mode: 'light',
  } as never)
  vi.mocked(api.fetchAuthStatus).mockResolvedValue({ authenticated: false } as never)
  vi.mocked(api.fetchGitRemote).mockResolvedValue({ url: '' } as never)
  vi.mocked(api.fetchProjectDetail).mockResolvedValue({
    project: baseProject(),
    sessions: [
      { id: 's1', title: 'one' } as never,
      { id: 's2', title: 'two' } as never,
      { id: 's3', title: 'three' } as never,
    ],
    enhanceCache: null,
    ...detailOverrides,
  } as never)

  return render(
    <MemoryRouter initialEntries={['/project/demo']}>
      <Routes>
        <Route path="/project/:dirName" element={<ProjectDetail />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ProjectDetail — Enhance button', () => {
  beforeEach(() => {})

  it('renders an active "Enhance with AI" link when project is not fully enhanced', async () => {
    renderDetail()
    await waitFor(() => expect(screen.getByText('Enhance with AI')).toBeTruthy())
    const link = screen.getByText('Enhance with AI').closest('a') as HTMLAnchorElement
    expect(link).toBeTruthy()
    expect(link.getAttribute('href')).toBe('/project/demo/enhance')
    expect(link.className).not.toContain('cursor-not-allowed')
  })

  it('shows partial-progress hint when some sessions enhanced', async () => {
    renderDetail({
      project: baseProject({ sessionCount: 3, enhancedSessionCount: 1 }),
      enhanceCache: {
        fingerprint: 'fp',
        enhancedAt: '2026-04-01',
        selectedSessionIds: ['s1'],
        result: { narrative: '', arc: [], skills: [], timeline: [], questions: [] },
        isFresh: true,
      } as never,
    })
    await waitFor(() => expect(screen.getByText('1 of 3 sessions enhanced')).toBeTruthy())
  })

  it('disables button and shows "Enhanced ✓" when fully enhanced', async () => {
    renderDetail({
      project: baseProject({ sessionCount: 3, enhancedSessionCount: 3, enhancedAt: '2026-04-01' }),
      enhanceCache: {
        fingerprint: 'fp',
        enhancedAt: '2026-04-01',
        selectedSessionIds: ['s1', 's2', 's3'],
        result: { narrative: '', arc: [], skills: [], timeline: [], questions: [] },
        isFresh: true,
      } as never,
    })
    await waitFor(() => expect(screen.getByText('Enhanced \u2713')).toBeTruthy())
    const link = screen.getByText('Enhanced \u2713').closest('a') as HTMLAnchorElement
    expect(link.className).toContain('cursor-not-allowed')
    expect(link.getAttribute('aria-disabled')).toBe('true')
  })
})
