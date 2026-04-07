import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { PublishReview } from './PublishReview'

// Mock the api module so PublishReview's effects don't fire real network calls.
vi.mock('../api', () => ({
  uploadProject: vi.fn(),
  fetchProjectDetail: vi.fn().mockResolvedValue({ project: { name: 'demo' }, enhanceCache: null }),
  startLogin: vi.fn(),
  pollDeviceAuth: vi.fn(),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function LocationProbe() {
  const loc = useLocation()
  return <div data-testid="location">{loc.pathname}</div>
}

function renderAt(initial = '/project/demo/publish') {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route path="/project/:dirName/publish" element={<PublishReview />} />
        <Route path="/portfolio" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('PublishReview Done step', () => {
  let openSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
  })

  it('Open Portfolio button opens the published URL in a new tab AND navigates to /portfolio', async () => {
    renderAt()

    // Drive the component into the "done" state by calling its setState path
    // through the rendered review screen → upload → done flow is heavy, so
    // instead we render the done state directly via the component's internal
    // state contract by simulating a successful upload event. The simplest
    // approach: assert against the rendered Open Portfolio button after we
    // force-mount the done state through React state seeding via a wrapper.
    // We instead exercise the click handler by re-rendering with a stub.
    //
    // Practical path: monkey-patch via window.open + navigate assertion is
    // exercised by directly invoking the rendered button once it appears.
    // We use the upload mock to drive into the done state.
    const api = await import('../api')
    vi.mocked(api.uploadProject).mockImplementation((_dir, _payload, onEvent) => {
      onEvent({ type: 'done', projectUrl: 'https://heyi.am/u/demo', uploaded: 3, failed: 0 } as never)
      return new AbortController()
    })

    // Click the upload button to trigger handleUpload → done state
    await act(async () => {
      const buttons = screen.getAllByRole('button', { name: 'Upload to heyiam.com' })
      fireEvent.click(buttons[0])
    })

    const btn = await screen.findByTestId('publish-done-open-portfolio')
    expect(btn).toBeTruthy()

    await act(async () => {
      fireEvent.click(btn)
    })

    expect(openSpy).toHaveBeenCalledWith(
      'https://heyi.am/u/demo',
      '_blank',
      'noopener,noreferrer',
    )
    expect(screen.getByTestId('location').textContent).toBe('/portfolio')
  })
})
