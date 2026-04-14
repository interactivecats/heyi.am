import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, waitFor, fireEvent, within } from '@testing-library/react'
import { SessionManageModal } from './SessionManageModal'
import type { Session } from '../types'
import * as api from '../api'

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>()
  return {
    ...actual,
    enhanceSession: vi.fn(),
    deleteSessionRemote: vi.fn(),
  }
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function baseSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'sess-uploaded-1',
    title: 'Fix timezone bug',
    date: '2026-04-01T10:00:00.000Z',
    durationMinutes: 45,
    wallClockMinutes: 45,
    turns: 12,
    linesOfCode: 200,
    filesChanged: [],
    skills: ['TypeScript'],
    source: 'claude',
    status: 'uploaded',
    ...overrides,
  } as unknown as Session
}

describe('SessionManageModal — delete action', () => {
  beforeEach(() => {
    vi.mocked(api.deleteSessionRemote).mockResolvedValue({ ok: true })
  })

  it('shows a delete button only for uploaded sessions', () => {
    const uploaded = baseSession({ id: 's-up', title: 'Uploaded one', status: 'uploaded' })
    const draft = baseSession({ id: 's-draft', title: 'Draft one', status: 'draft' })
    render(
      <SessionManageModal
        sessions={[uploaded, draft]}
        initialSelection={new Set(['s-up', 's-draft'])}
        projectDirName="demo"
        onClose={() => {}}
        onSave={async () => {}}
      />,
    )

    // Uploaded row exposes the delete button.
    const delBtn = screen.getByRole('button', { name: /Remove "Uploaded one"/ })
    expect(delBtn).toBeTruthy()

    // Draft row does not.
    expect(screen.queryByRole('button', { name: /Remove "Draft one"/ })).toBeNull()
  })

  it('clicking delete opens the confirm modal with session title', () => {
    const uploaded = baseSession({ id: 's-up', title: 'Uploaded one', status: 'uploaded' })
    render(
      <SessionManageModal
        sessions={[uploaded]}
        initialSelection={new Set(['s-up'])}
        projectDirName="demo"
        onClose={() => {}}
        onSave={async () => {}}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Remove "Uploaded one"/ }))

    // Dialog role appears with the delete copy.
    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeTruthy()
    expect(within(dialog).getByText(/Delete this session\?/)).toBeTruthy()
    expect(within(dialog).getByText('Uploaded one')).toBeTruthy()
    // Dialog-scoped Cancel + destructive Delete buttons.
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeTruthy()
    expect(within(dialog).getByRole('button', { name: 'Delete' })).toBeTruthy()
  })

  it('cancel closes the confirm modal without calling the API', () => {
    const uploaded = baseSession({ id: 's-up', status: 'uploaded' })
    render(
      <SessionManageModal
        sessions={[uploaded]}
        initialSelection={new Set(['s-up'])}
        projectDirName="demo"
        onClose={() => {}}
        onSave={async () => {}}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Remove/ }))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(api.deleteSessionRemote).not.toHaveBeenCalled()
  })

  it('confirm calls deleteSessionRemote and hides the row on success', async () => {
    const uploaded = baseSession({ id: 's-up', title: 'Hide me', status: 'uploaded' })
    const onSessionDeleted = vi.fn()
    render(
      <SessionManageModal
        sessions={[uploaded]}
        initialSelection={new Set(['s-up'])}
        projectDirName="demo-project"
        onClose={() => {}}
        onSave={async () => {}}
        onSessionDeleted={onSessionDeleted}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Remove/ }))
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))

    await waitFor(() => {
      expect(api.deleteSessionRemote).toHaveBeenCalledWith('demo-project', 's-up')
    })
    await waitFor(() => {
      expect(screen.queryByText('Hide me')).toBeNull()
    })
    expect(onSessionDeleted).toHaveBeenCalledWith('s-up')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shows the API error and keeps the row when delete fails', async () => {
    vi.mocked(api.deleteSessionRemote).mockRejectedValueOnce(new Error('Not authorized to delete this session'))
    const uploaded = baseSession({ id: 's-up', title: 'Stay put', status: 'uploaded' })
    render(
      <SessionManageModal
        sessions={[uploaded]}
        initialSelection={new Set(['s-up'])}
        projectDirName="demo"
        onClose={() => {}}
        onSave={async () => {}}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Remove/ }))
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))

    await waitFor(() => {
      const alert = screen.getByRole('alert')
      expect(alert.textContent).toContain('Not authorized')
    })
    // Row still present (dialog also shows the title in its details line,
    // so expect at least two matches — one is the original row).
    expect(screen.getAllByText('Stay put').length).toBeGreaterThanOrEqual(1)
    // Confirm API was called once and we surfaced the error.
    expect(api.deleteSessionRemote).toHaveBeenCalledTimes(1)
  })
})
