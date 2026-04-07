import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

afterEach(() => cleanup())
import { MemoryRouter } from 'react-router-dom'
import { PortfolioWorkspace } from './PortfolioWorkspace'

describe('PortfolioWorkspace skeleton', () => {
  it('renders the three placeholder regions', () => {
    render(
      <MemoryRouter initialEntries={['/portfolio']}>
        <PortfolioWorkspace />
      </MemoryRouter>,
    )
    expect(screen.getByTestId('portfolio-statusbar-placeholder')).toBeTruthy()
    expect(screen.getByTestId('portfolio-preview-placeholder')).toBeTruthy()
    expect(screen.getByTestId('portfolio-editrail-placeholder')).toBeTruthy()
  })
})
