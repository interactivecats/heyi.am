import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'

vi.mock('../../api', async () => {
  const actual = await vi.importActual<typeof import('../../api')>('../../api')
  return {
    ...actual,
    publishPortfolio: vi.fn(),
  }
})

import { publishPortfolio } from '../../api'
import { StatusBar } from './StatusBar'
import {
  PortfolioStoreProvider,
  type PortfolioStoreState,
} from '../../hooks/usePortfolioStore'

const mockedPublish = vi.mocked(publishPortfolio)

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

beforeEach(() => {
  mockedPublish.mockReset()
})

function renderWith(initial: Partial<PortfolioStoreState>) {
  return render(
    <PortfolioStoreProvider initialState={initial}>
      <StatusBar />
    </PortfolioStoreProvider>,
  )
}

const livePublishState = {
  targets: {
    'heyi.am': {
      lastPublishedAt: '2026-04-07T00:00:00Z',
      lastPublishedProfileHash: 'abc',
      lastPublishedProfile: {},
      config: {},
      visibility: 'public' as const,
      url: 'https://heyi.am/ada',
    },
  },
}

describe('StatusBar', () => {
  it('renders never-published state with grey dot and Publish button', () => {
    renderWith({})
    expect(screen.getByTestId('status-never').textContent).toContain('Not yet published')
    expect(screen.getByTestId('statusbar-primary-action').textContent).toContain('Publish to heyi.am')
  })

  it('renders draft state with change count', () => {
    renderWith({
      publishState: livePublishState,
      isDraft: true,
      changeList: ['bio', 'photo'],
    })
    expect(screen.getByTestId('status-draft').textContent).toContain('Draft — 2 changes')
    expect(screen.getByTestId('statusbar-primary-action').textContent).toContain('Re-publish')
  })

  it('renders publishing state with disabled button', () => {
    renderWith({ isPublishing: true })
    const btn = screen.getByTestId('statusbar-primary-action') as HTMLButtonElement
    expect(btn.disabled).toBe(true)
    expect(btn.textContent).toContain('Publishing')
    expect(screen.getByTestId('status-publishing')).toBeTruthy()
  })

  it('renders error state with Retry button', () => {
    renderWith({ lastPublishError: 'network down' })
    expect(screen.getByTestId('status-error').textContent).toContain('network down')
    expect(screen.getByTestId('statusbar-primary-action').textContent).toContain('Retry publish')
  })

  it('renders live state with View live button', () => {
    renderWith({ publishState: livePublishState })
    expect(screen.getByTestId('status-live').textContent).toContain('Live')
    expect(screen.getByTestId('statusbar-primary-action').textContent).toContain('View live')
  })

  it('shows Unlisted in target pill when visibility is unlisted', () => {
    renderWith({
      publishState: {
        targets: {
          'heyi.am': { ...livePublishState.targets['heyi.am'], visibility: 'unlisted' },
        },
      },
    })
    expect(screen.getByTestId('statusbar-target-pill').textContent).toContain('Unlisted')
  })

  it('shows Public in target pill by default', () => {
    renderWith({})
    expect(screen.getByTestId('statusbar-target-pill').textContent).toContain('Public')
  })

  it('clicking Publish in never-published state calls publishPortfolio', async () => {
    mockedPublish.mockResolvedValue({ ok: true, url: 'https://heyi.am/ada' })
    renderWith({})
    await act(async () => {
      fireEvent.click(screen.getByTestId('statusbar-primary-action'))
    })
    expect(mockedPublish).toHaveBeenCalledWith('heyi.am')
  })

  it('Cmd+Enter triggers primary action when no input focused', async () => {
    mockedPublish.mockResolvedValue({ ok: true, url: 'https://heyi.am/ada' })
    renderWith({})
    await act(async () => {
      fireEvent.keyDown(window, { key: 'Enter', metaKey: true })
    })
    expect(mockedPublish).toHaveBeenCalledTimes(1)
  })

  it('Ctrl+Enter also triggers primary action', async () => {
    mockedPublish.mockResolvedValue({ ok: true, url: 'https://heyi.am/ada' })
    renderWith({})
    await act(async () => {
      fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true })
    })
    expect(mockedPublish).toHaveBeenCalledTimes(1)
  })

  it('Cmd+Enter does NOT fire when an input is focused', async () => {
    mockedPublish.mockResolvedValue({ ok: true, url: 'https://heyi.am/ada' })
    render(
      <PortfolioStoreProvider>
        <input data-testid="some-input" />
        <StatusBar />
      </PortfolioStoreProvider>,
    )
    const input = screen.getByTestId('some-input') as HTMLInputElement
    input.focus()
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter', metaKey: true })
    })
    expect(mockedPublish).not.toHaveBeenCalled()
  })

  it('Cmd+Enter is a no-op while publishing (button disabled)', async () => {
    renderWith({ isPublishing: true })
    await act(async () => {
      fireEvent.keyDown(window, { key: 'Enter', metaKey: true })
    })
    expect(mockedPublish).not.toHaveBeenCalled()
  })
})
