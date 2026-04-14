import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, waitFor, fireEvent, within } from '@testing-library/react'
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
    deleteProjectRemote: vi.fn(),
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

describe('ProjectDetail — Remove from heyi.am', () => {
  beforeEach(() => {
    vi.mocked(api.deleteProjectRemote).mockResolvedValue({ ok: true })
  })

  it('shows the "Remove from heyi.am" button only when the project is uploaded', async () => {
    renderDetail({ project: baseProject({ isUploaded: true } as never) })
    await waitFor(() => expect(screen.getByText('Remove from heyi.am')).toBeTruthy())
  })

  it('does not show the button when the project is local-only', async () => {
    renderDetail({ project: baseProject({ isUploaded: false } as never) })
    await waitFor(() => expect(screen.getByText('Enhance with AI')).toBeTruthy())
    expect(screen.queryByText('Remove from heyi.am')).toBeNull()
  })

  it('opens confirm modal, calls deleteProjectRemote on confirm, refetches on success', async () => {
    renderDetail({ project: baseProject({ isUploaded: true } as never) })
    await waitFor(() => expect(screen.getByText('Remove from heyi.am')).toBeTruthy())

    fireEvent.click(screen.getByText('Remove from heyi.am'))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/Delete this project and all its sessions/)).toBeTruthy()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }))

    await waitFor(() => {
      expect(api.deleteProjectRemote).toHaveBeenCalledWith('demo')
    })
    // Refetch of project detail happens on success.
    await waitFor(() => {
      expect(vi.mocked(api.fetchProjectDetail).mock.calls.length).toBeGreaterThanOrEqual(2)
    })
  })

  it('surfaces an error and leaves the dialog open on API failure', async () => {
    vi.mocked(api.deleteProjectRemote).mockRejectedValueOnce(new Error('Remote delete failed (HTTP 502)'))
    renderDetail({ project: baseProject({ isUploaded: true } as never) })
    await waitFor(() => expect(screen.getByText('Remove from heyi.am')).toBeTruthy())

    fireEvent.click(screen.getByText('Remove from heyi.am'))
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }))

    await waitFor(() => {
      const alert = screen.getByRole('alert')
      expect(alert.textContent).toContain('Remote delete failed')
    })
    // Dialog still open.
    expect(screen.queryByRole('dialog')).not.toBeNull()
  })

  it('cancel closes the dialog without calling the API', async () => {
    renderDetail({ project: baseProject({ isUploaded: true } as never) })
    await waitFor(() => expect(screen.getByText('Remove from heyi.am')).toBeTruthy())

    fireEvent.click(screen.getByText('Remove from heyi.am'))
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(api.deleteProjectRemote).not.toHaveBeenCalled()
  })
})
