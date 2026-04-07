import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, within, cleanup } from '@testing-library/react'

afterEach(() => cleanup())
import { MemoryRouter } from 'react-router-dom'
import { AppShell } from './AppShell'

function renderShell() {
  return render(
    <MemoryRouter initialEntries={['/portfolio']}>
      <AppShell>
        <div>child</div>
      </AppShell>
    </MemoryRouter>,
  )
}

describe('AppShell sidebar', () => {
  it('renders the five top-level destinations in order', () => {
    renderShell()
    const nav = screen.getByRole('navigation', { name: /primary/i })
    const links = within(nav).getAllByRole('link')
    expect(links.map((a) => a.textContent)).toEqual([
      'Dashboard',
      'Projects',
      'Portfolio',
      'Sessions',
      'Settings',
    ])
  })

  it('marks the Portfolio link as the current page on /portfolio', () => {
    renderShell()
    const nav = screen.getByRole('navigation', { name: /primary/i })
    const current = within(nav).getByRole('link', { current: 'page' })
    expect(current.textContent).toBe('Portfolio')
  })

  it('renders the ⌘K search pill in the top bar', () => {
    renderShell()
    const pill = screen.getByTestId('cmdk-pill')
    expect(pill).toBeTruthy()
    expect(pill.textContent).toContain('⌘K')
    expect(pill.textContent).toContain('Search')
  })
})
