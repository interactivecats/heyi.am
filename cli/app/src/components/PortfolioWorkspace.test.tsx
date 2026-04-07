import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

afterEach(() => cleanup())
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
