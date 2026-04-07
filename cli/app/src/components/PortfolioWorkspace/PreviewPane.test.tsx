import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, act, waitFor } from '@testing-library/react'
import { PreviewPane } from './PreviewPane'
import {
  PortfolioStoreProvider,
  usePortfolioStore,
  type PortfolioStoreState,
} from '../../hooks/usePortfolioStore'

vi.mock('../../api', () => ({
  fetchTheme: vi.fn(async () => ({ template: 'editorial' })),
  saveTheme: vi.fn(async () => undefined),
  fetchAuthStatus: vi.fn(async () => ({ authenticated: true, username: 'devuser' })),
}))

// TemplateBrowser is heavy (fetches templates, renders iframes). Stub it
// out so PreviewPane tests stay focused on the wiring around it.
vi.mock('../TemplateBrowser', () => ({
  TemplateBrowser: ({ mode, onClose, onSelectTemplate }: { mode: string; onClose?: () => void; onSelectTemplate?: (n: string) => void }) => (
    <div data-testid="template-browser-stub" data-mode={mode}>
      <button data-testid="template-browser-stub-close" onClick={onClose}>close</button>
      <button data-testid="template-browser-stub-pick" onClick={() => onSelectTemplate?.('blueprint')}>pick blueprint</button>
    </div>
  ),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function withProvider(initial?: Partial<PortfolioStoreState>) {
  return ({ children }: { children: React.ReactNode }) => (
    <PortfolioStoreProvider initialState={initial}>{children}</PortfolioStoreProvider>
  )
}

function getIframe(): HTMLIFrameElement {
  return screen.getByTestId('portfolio-preview-iframe') as HTMLIFrameElement
}

describe('PreviewPane', () => {
  it('renders the iframe with the Landing src by default', () => {
    render(<PreviewPane />, { wrapper: withProvider() })
    expect(getIframe().getAttribute('src')).toBe('/preview/portfolio')
  })

  it('renders template pill and Open in browser button (smoke)', async () => {
    render(<PreviewPane />, { wrapper: withProvider() })
    expect(screen.getByTestId('portfolio-preview-template-pill')).toBeTruthy()
    expect(screen.getByTestId('portfolio-preview-open-in-browser')).toBeTruthy()
  })

  it('shows the current template name from fetchTheme', async () => {
    const api = await import('../../api')
    ;(api.fetchTheme as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ template: 'editorial' })
    render(<PreviewPane />, { wrapper: withProvider() })
    // Wait a microtask for the effect's promise to resolve
    await act(async () => {
      await Promise.resolve()
    })
    expect(screen.getByTestId('portfolio-preview-template-pill').textContent).toBe('editorial')
  })

  it('Project button disabled when no included projects', () => {
    render(<PreviewPane />, { wrapper: withProvider() })
    const projectBtn = screen.getByRole('tab', { name: 'Project' }) as HTMLButtonElement
    expect(projectBtn.disabled).toBe(true)
  })

  it('clicking Project segment changes iframe src to project view', () => {
    render(<PreviewPane />, {
      wrapper: withProvider({
        projects: [{ projectId: 'alpha-proj', included: true, order: 0 }],
      }),
    })
    const projectBtn = screen.getByRole('tab', { name: 'Project' })
    fireEvent.click(projectBtn)
    expect(getIframe().getAttribute('src')).toBe(
      '/preview/portfolio?view=project&slug=alpha-proj',
    )
  })

  it('clicking Session segment changes iframe src to session view', () => {
    render(<PreviewPane />, {
      wrapper: withProvider({
        projects: [{ projectId: 'alpha-proj', included: true, order: 0 }],
      }),
    })
    const sessionBtn = screen.getByRole('tab', { name: 'Session' })
    fireEvent.click(sessionBtn)
    expect(getIframe().getAttribute('src')).toBe(
      '/preview/portfolio?view=session&slug=alpha-proj',
    )
  })

  it('Template pill click opens the TemplateBrowser modal', async () => {
    render(<PreviewPane />, { wrapper: withProvider() })
    expect(screen.queryByTestId('template-browser-stub')).toBeNull()
    fireEvent.click(screen.getByTestId('portfolio-preview-template-pill'))
    const stub = await screen.findByTestId('template-browser-stub')
    expect(stub.getAttribute('data-mode')).toBe('modal')
  })

  it('selecting a template in the modal calls saveTheme, updates the pill, bumps iframe key, and closes the modal', async () => {
    const api = await import('../../api')
    render(<PreviewPane />, { wrapper: withProvider() })
    await act(async () => { await Promise.resolve() })
    const initialIframe = screen.getByTestId('portfolio-preview-iframe')

    fireEvent.click(screen.getByTestId('portfolio-preview-template-pill'))
    fireEvent.click(await screen.findByTestId('template-browser-stub-pick'))

    await waitFor(() => {
      expect(api.saveTheme).toHaveBeenCalledWith('blueprint')
    })
    // Modal closed
    expect(screen.queryByTestId('template-browser-stub')).toBeNull()
    // Pill updated
    expect(screen.getByTestId('portfolio-preview-template-pill').textContent).toBe('blueprint')
    // Iframe element identity changed (key bump)
    expect(screen.getByTestId('portfolio-preview-iframe')).not.toBe(initialIframe)
  })

  it('Refresh button bumps the iframe key (forces reload)', () => {
    render(<PreviewPane />, { wrapper: withProvider() })
    const before = getIframe()
    fireEvent.click(screen.getByTestId('portfolio-preview-refresh'))
    const after = getIframe()
    expect(after).not.toBe(before)
  })

  it('Refresh button disables itself for ~500ms after click', () => {
    vi.useFakeTimers()
    try {
      render(<PreviewPane />, { wrapper: withProvider() })
      const btn = screen.getByTestId('portfolio-preview-refresh') as HTMLButtonElement
      fireEvent.click(btn)
      expect(btn.disabled).toBe(true)
      act(() => {
        vi.advanceTimersByTime(500)
      })
      expect(
        (screen.getByTestId('portfolio-preview-refresh') as HTMLButtonElement).disabled,
      ).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('"Open in browser" is disabled when never published', () => {
    render(<PreviewPane />, { wrapper: withProvider() })
    const btn = screen.getByTestId('portfolio-preview-open-in-browser') as HTMLButtonElement
    expect(btn.disabled).toBe(true)
  })

  it('"Open in browser" opens heyi.am/:username when heyi.am target is published', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    try {
      render(<PreviewPane />, {
        wrapper: withProvider({
          activeTarget: 'heyi.am',
          publishState: {
            targets: {
              'heyi.am': {
                lastPublishedAt: '2026-04-01T00:00:00.000Z',
                lastPublishedProfileHash: 'abc',
                lastPublishedProfile: {},
                config: {},
              },
            },
          },
        }),
      })
      // Wait for fetchAuthStatus to resolve and set the username.
      await act(async () => { await Promise.resolve(); await Promise.resolve() })
      const btn = screen.getByTestId('portfolio-preview-open-in-browser') as HTMLButtonElement
      expect(btn.disabled).toBe(false)
      fireEvent.click(btn)
      expect(openSpy).toHaveBeenCalledWith(
        'https://heyi.am/devuser',
        '_blank',
        'noopener,noreferrer',
      )
    } finally {
      openSpy.mockRestore()
    }
  })

  it('"Open in browser" prefers the published target URL when present', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    try {
      render(<PreviewPane />, {
        wrapper: withProvider({
          activeTarget: 'heyi.am',
          publishState: {
            targets: {
              'heyi.am': {
                lastPublishedAt: '2026-04-01T00:00:00.000Z',
                lastPublishedProfileHash: 'abc',
                lastPublishedProfile: {},
                config: {},
                url: 'https://heyi.am/custom-url',
              },
            },
          },
        }),
      })
      await act(async () => { await Promise.resolve(); await Promise.resolve() })
      fireEvent.click(screen.getByTestId('portfolio-preview-open-in-browser'))
      expect(openSpy).toHaveBeenCalledWith(
        'https://heyi.am/custom-url',
        '_blank',
        'noopener,noreferrer',
      )
    } finally {
      openSpy.mockRestore()
    }
  })

  it('"Open in browser" is disabled for the github target when no URL is published', async () => {
    render(<PreviewPane />, {
      wrapper: withProvider({
        activeTarget: 'github',
        publishState: { targets: {} },
      }),
    })
    await act(async () => { await Promise.resolve() })
    const btn = screen.getByTestId('portfolio-preview-open-in-browser') as HTMLButtonElement
    expect(btn.disabled).toBe(true)
  })

  describe('live DOM patching', () => {
    // Install a stub contentDocument on the iframe element so the patch
    // effect has something to write into. jsdom does not auto-create a
    // contentDocument for iframes whose src never resolves.
    function installStubDoc(fields: Array<'displayName' | 'bio' | 'location'>) {
      const iframe = getIframe()
      const doc = document.implementation.createHTMLDocument('preview')
      for (const f of fields) {
        const el = doc.createElement('span')
        el.setAttribute('data-portfolio-field', f)
        el.textContent = `initial-${f}`
        doc.body.appendChild(el)
      }
      Object.defineProperty(iframe, 'contentDocument', {
        configurable: true,
        get: () => doc,
      })
      return doc
    }

    function Harness({ field }: { field: 'displayName' | 'bio' | 'location' }) {
      const { dispatch } = usePortfolioStore()
      return (
        <>
          <button
            data-testid="bump-profile"
            onClick={() =>
              dispatch({
                type: 'UPDATE_PROFILE_FIELD',
                field,
                value: `next-${field}`,
              })
            }
          />
          <PreviewPane />
        </>
      )
    }

    it('patches displayName in iframe on profile change', () => {
      render(<Harness field="displayName" />, { wrapper: withProvider() })
      const doc = installStubDoc(['displayName'])
      fireEvent.click(screen.getByTestId('bump-profile'))
      expect(
        doc.querySelector('[data-portfolio-field="displayName"]')?.textContent,
      ).toBe('next-displayName')
    })

    it('patches bio in iframe on profile change', () => {
      render(<Harness field="bio" />, { wrapper: withProvider() })
      const doc = installStubDoc(['bio'])
      fireEvent.click(screen.getByTestId('bump-profile'))
      expect(doc.querySelector('[data-portfolio-field="bio"]')?.textContent).toBe(
        'next-bio',
      )
    })

    it('patches location in iframe on profile change', () => {
      render(<Harness field="location" />, { wrapper: withProvider() })
      const doc = installStubDoc(['location'])
      fireEvent.click(screen.getByTestId('bump-profile'))
      expect(
        doc.querySelector('[data-portfolio-field="location"]')?.textContent,
      ).toBe('next-location')
    })

    it('silently no-ops when iframe contentDocument is null', () => {
      render(<Harness field="displayName" />, { wrapper: withProvider() })
      const iframe = getIframe()
      Object.defineProperty(iframe, 'contentDocument', {
        configurable: true,
        get: () => null,
      })
      // Should not throw.
      expect(() =>
        fireEvent.click(screen.getByTestId('bump-profile')),
      ).not.toThrow()
    })

    it('silently no-ops when data-portfolio-field element is missing', () => {
      render(<Harness field="displayName" />, { wrapper: withProvider() })
      // Stub doc but without the displayName element.
      installStubDoc(['bio'])
      expect(() =>
        fireEvent.click(screen.getByTestId('bump-profile')),
      ).not.toThrow()
    })

    // ── Contact + photo + visibility patching ───────────────

    function installContactDoc(): Document {
      const iframe = getIframe()
      const doc = document.implementation.createHTMLDocument('preview')
      // email <a> with inner text wrapper
      const email = doc.createElement('a')
      email.setAttribute('data-portfolio-field', 'email')
      email.setAttribute('href', 'mailto:old@example.com')
      const emailText = doc.createElement('span')
      emailText.setAttribute('data-portfolio-text', '')
      emailText.textContent = 'old@example.com'
      email.appendChild(emailText)
      doc.body.appendChild(email)
      // phone <span> (blueprint pattern: no href)
      const phone = doc.createElement('span')
      phone.setAttribute('data-portfolio-field', 'phone')
      const phoneText = doc.createElement('span')
      phoneText.setAttribute('data-portfolio-text', '')
      phoneText.textContent = '555-old'
      phone.appendChild(phoneText)
      doc.body.appendChild(phone)
      // linkedin <a> with no inner text (fixed "LinkedIn" label)
      const li = doc.createElement('a')
      li.setAttribute('data-portfolio-field', 'linkedinUrl')
      li.setAttribute('href', 'https://linkedin.com/in/old')
      li.textContent = 'LinkedIn'
      doc.body.appendChild(li)
      // twitter <a> with inner text
      const tw = doc.createElement('a')
      tw.setAttribute('data-portfolio-field', 'twitterHandle')
      tw.setAttribute('href', 'https://x.com/old')
      const twText = doc.createElement('span')
      twText.setAttribute('data-portfolio-text', '')
      twText.textContent = '@old'
      tw.appendChild(twText)
      doc.body.appendChild(tw)
      // photo <img>
      const img = doc.createElement('img')
      img.setAttribute('data-portfolio-field', 'photoBase64')
      img.setAttribute('src', 'data:image/png;base64,OLD')
      doc.body.appendChild(img)
      Object.defineProperty(iframe, 'contentDocument', {
        configurable: true,
        get: () => doc,
      })
      return doc
    }

    function ContactHarness({
      field,
      value,
    }: {
      field:
        | 'email'
        | 'phone'
        | 'linkedinUrl'
        | 'githubUrl'
        | 'twitterHandle'
        | 'websiteUrl'
        | 'photoBase64'
      value: string | undefined
    }) {
      const { dispatch } = usePortfolioStore()
      return (
        <>
          <button
            data-testid="bump-contact"
            onClick={() => dispatch({ type: 'UPDATE_PROFILE_FIELD', field, value })}
          />
          <PreviewPane />
        </>
      )
    }

    it('patches email text + mailto href', () => {
      render(<ContactHarness field="email" value="new@example.com" />, { wrapper: withProvider() })
      const doc = installContactDoc()
      fireEvent.click(screen.getByTestId('bump-contact'))
      const a = doc.querySelector('[data-portfolio-field="email"]') as HTMLAnchorElement
      expect(a.querySelector('[data-portfolio-text]')?.textContent).toBe('new@example.com')
      expect(a.getAttribute('href')).toBe('mailto:new@example.com')
    })

    it('patches phone text without touching href on a non-anchor', () => {
      render(<ContactHarness field="phone" value="555-NEW" />, { wrapper: withProvider() })
      const doc = installContactDoc()
      fireEvent.click(screen.getByTestId('bump-contact'))
      const span = doc.querySelector('[data-portfolio-field="phone"]') as HTMLElement
      expect(span.querySelector('[data-portfolio-text]')?.textContent).toBe('555-NEW')
      expect(span.tagName).toBe('SPAN')
    })

    it('patches linkedinUrl href but leaves the fixed "LinkedIn" text alone', () => {
      render(
        <ContactHarness field="linkedinUrl" value="https://linkedin.com/in/new" />,
        { wrapper: withProvider() },
      )
      const doc = installContactDoc()
      fireEvent.click(screen.getByTestId('bump-contact'))
      const a = doc.querySelector('[data-portfolio-field="linkedinUrl"]') as HTMLAnchorElement
      expect(a.getAttribute('href')).toBe('https://linkedin.com/in/new')
      expect(a.textContent).toBe('LinkedIn')
    })

    it('patches twitterHandle: builds x.com href, prefixes @ in display text', () => {
      render(<ContactHarness field="twitterHandle" value="newhandle" />, { wrapper: withProvider() })
      const doc = installContactDoc()
      fireEvent.click(screen.getByTestId('bump-contact'))
      const a = doc.querySelector('[data-portfolio-field="twitterHandle"]') as HTMLAnchorElement
      expect(a.getAttribute('href')).toBe('https://x.com/newhandle')
      expect(a.querySelector('[data-portfolio-text]')?.textContent).toBe('@newhandle')
    })

    it('patches photoBase64 by updating <img> src', () => {
      render(
        <ContactHarness field="photoBase64" value="data:image/png;base64,NEW" />,
        { wrapper: withProvider() },
      )
      const doc = installContactDoc()
      fireEvent.click(screen.getByTestId('bump-contact'))
      const img = doc.querySelector('[data-portfolio-field="photoBase64"]') as HTMLImageElement
      expect(img.getAttribute('src')).toBe('data:image/png;base64,NEW')
      expect(img.style.display).toBe('')
    })

    it('clearing email hides the element via display:none', () => {
      render(<ContactHarness field="email" value={undefined} />, { wrapper: withProvider() })
      const doc = installContactDoc()
      fireEvent.click(screen.getByTestId('bump-contact'))
      const a = doc.querySelector('[data-portfolio-field="email"]') as HTMLElement
      expect(a.style.display).toBe('none')
    })

    it('clearing photoBase64 hides the <img>', () => {
      render(<ContactHarness field="photoBase64" value={undefined} />, { wrapper: withProvider() })
      const doc = installContactDoc()
      fireEvent.click(screen.getByTestId('bump-contact'))
      const img = doc.querySelector('[data-portfolio-field="photoBase64"]') as HTMLElement
      expect(img.style.display).toBe('none')
    })

    it('iframe does NOT reload (key does not change) on profile change', () => {
      render(<Harness field="displayName" />, { wrapper: withProvider() })
      installStubDoc(['displayName'])
      const before = getIframe()
      for (let i = 0; i < 5; i++) {
        fireEvent.click(screen.getByTestId('bump-profile'))
      }
      const after = getIframe()
      expect(after).toBe(before)
      expect(screen.getAllByTestId('portfolio-preview-iframe').length).toBe(1)
    })
  })
})
