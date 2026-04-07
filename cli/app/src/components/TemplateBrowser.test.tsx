import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { TemplateBrowser, resolveTemplateIframeSrc } from './TemplateBrowser'
import type { TemplateInfo } from '../api'

const FAKE_TEMPLATES: TemplateInfo[] = [
  {
    name: 'editorial',
    label: 'Editorial',
    description: 'Serif-forward magazine layout',
    mode: 'light',
    accent: '#084471',
    tags: ['minimal'],
  },
  {
    name: 'blueprint',
    label: 'Blueprint',
    description: 'Dense schematic grid',
    mode: 'light',
    accent: '#1a3b5d',
    tags: ['data-dense'],
  },
  {
    name: 'kinetic',
    label: 'Kinetic',
    description: 'Animated dark surface',
    mode: 'dark',
    accent: '#7c3aed',
    tags: ['animated'],
  },
] as unknown as TemplateInfo[]

vi.mock('../api', () => ({
  fetchTemplates: vi.fn(async () => FAKE_TEMPLATES),
  fetchTheme: vi.fn(async () => ({ template: 'editorial' })),
  saveTheme: vi.fn(async () => undefined),
  fetchProjects: vi.fn(async () => []),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

beforeEach(async () => {
  const api = await import('../api')
  ;(api.fetchTemplates as ReturnType<typeof vi.fn>).mockResolvedValue(FAKE_TEMPLATES)
  ;(api.fetchTheme as ReturnType<typeof vi.fn>).mockResolvedValue({ template: 'editorial' })
  ;(api.fetchProjects as ReturnType<typeof vi.fn>).mockResolvedValue([])
  ;(api.saveTheme as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
})

function renderRoute() {
  return render(
    <MemoryRouter initialEntries={['/templates']}>
      <TemplateBrowser />
    </MemoryRouter>,
  )
}

function renderModal(props: { onSelectTemplate?: (n: string) => void; onClose?: () => void } = {}) {
  return render(
    <MemoryRouter initialEntries={['/portfolio']}>
      <TemplateBrowser mode="modal" {...props} />
    </MemoryRouter>,
  )
}

async function flush() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('resolveTemplateIframeSrc', () => {
  it('returns the curated mock URL for mock mode', () => {
    expect(resolveTemplateIframeSrc('blueprint', 'mock')).toBe('/preview/template/blueprint?page=portfolio')
  })

  it('returns the user-data preview URL for mine mode', () => {
    expect(resolveTemplateIframeSrc('blueprint', 'mine')).toBe('/preview/portfolio?template=blueprint')
  })

  it('encodes the template name for URL safety', () => {
    expect(resolveTemplateIframeSrc('weird name/x', 'mine')).toBe('/preview/portfolio?template=weird%20name%2Fx')
  })
})

describe('TemplateBrowser — route mode', () => {
  it('renders without modal chrome by default', async () => {
    renderRoute()
    await flush()
    expect(screen.queryByTestId('template-browser-modal-overlay')).toBeNull()
    expect(screen.getByText('Portfolio Templates')).toBeTruthy()
  })

  it('iframes default to mock-data src', async () => {
    renderRoute()
    await flush()
    const editorial = screen.getByTestId('template-card-iframe-editorial') as HTMLIFrameElement
    expect(editorial.getAttribute('src')).toBe('/preview/template/editorial?page=portfolio')
  })

  it('toggling to "My data" rewrites iframe src to /preview/portfolio?template=', async () => {
    renderRoute()
    await flush()
    fireEvent.click(screen.getByTestId('template-browser-data-mode-mine'))
    const blueprint = screen.getByTestId('template-card-iframe-blueprint') as HTMLIFrameElement
    expect(blueprint.getAttribute('src')).toBe('/preview/portfolio?template=blueprint')
  })
})

describe('TemplateBrowser — modal mode', () => {
  it('renders the modal sheet with a close button and Choose-a-template heading', async () => {
    renderModal({ onClose: () => {} })
    await flush()
    expect(screen.getByTestId('template-browser-modal-sheet')).toBeTruthy()
    expect(screen.getByTestId('template-browser-close')).toBeTruthy()
    expect(screen.getByText('Choose a template')).toBeTruthy()
  })

  it('Escape key calls onClose', async () => {
    const onClose = vi.fn()
    renderModal({ onClose })
    await flush()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('clicking the overlay calls onClose; clicking the sheet does not', async () => {
    const onClose = vi.fn()
    renderModal({ onClose })
    await flush()
    fireEvent.click(screen.getByTestId('template-browser-modal-sheet'))
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('template-browser-modal-overlay'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('"Mock data" toggle defaults selected; iframe src uses /preview/template', async () => {
    renderModal({ onClose: () => {} })
    await flush()
    const mockBtn = screen.getByTestId('template-browser-data-mode-mock')
    expect(mockBtn.getAttribute('aria-checked')).toBe('true')
    // Active template iframe is mounted by default in single-iframe mode.
    const editorial = screen.getByTestId('template-card-iframe-editorial') as HTMLIFrameElement
    expect(editorial.getAttribute('src')).toBe('/preview/template/editorial?page=portfolio')
  })

  it('toggling to "My data" rewrites iframe src to /preview/portfolio?template=', async () => {
    renderModal({ onClose: () => {} })
    await flush()
    fireEvent.click(screen.getByTestId('template-browser-data-mode-mine'))
    const editorial = screen.getByTestId('template-card-iframe-editorial') as HTMLIFrameElement
    expect(editorial.getAttribute('src')).toBe('/preview/portfolio?template=editorial')
  })

  it('clicking "Use this template" fires onSelectTemplate(name)', async () => {
    const onSelectTemplate = vi.fn()
    renderModal({ onSelectTemplate, onClose: () => {} })
    await flush()
    fireEvent.click(screen.getByTestId('template-card-use-blueprint'))
    expect(onSelectTemplate).toHaveBeenCalledWith('blueprint')
  })

  it('does NOT call saveTheme directly in modal mode (host owns persistence)', async () => {
    const api = await import('../api')
    const onSelectTemplate = vi.fn()
    renderModal({ onSelectTemplate, onClose: () => {} })
    await flush()
    fireEvent.click(screen.getByTestId('template-card-use-blueprint'))
    expect(api.saveTheme).not.toHaveBeenCalled()
  })

  it('mounts only the focused/active card iframe at a time (single-iframe mode)', async () => {
    renderModal({ onClose: () => {} })
    await flush()
    // Default focus = active template (editorial). Other cards should not
    // have mounted their iframe yet.
    expect(screen.queryByTestId('template-card-iframe-editorial')).toBeTruthy()
    expect(screen.queryByTestId('template-card-iframe-blueprint')).toBeNull()
    expect(screen.queryByTestId('template-card-iframe-kinetic')).toBeNull()

    // Hovering blueprint card mounts its iframe.
    const blueprintCard = screen.getByLabelText('Blueprint template')
    fireEvent.mouseEnter(blueprintCard)
    await waitFor(() => {
      expect(screen.getByTestId('template-card-iframe-blueprint')).toBeTruthy()
    })
  })
})
