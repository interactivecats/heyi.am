import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { Chip, type ChipVariant } from './Chip'
import { SearchInput } from './SearchInput'

interface AppShellProps {
  back?: { label: string; to: string }
  chips?: { label: string; variant?: ChipVariant }[]
  actions?: ReactNode
  children: ReactNode
}

const SIDEBAR_DESTINATIONS: { label: string; to: string; match: (path: string) => boolean }[] = [
  { label: 'Dashboard', to: '/', match: (p) => p === '/' },
  { label: 'Projects', to: '/projects', match: (p) => p === '/projects' || p.startsWith('/project/') },
  { label: 'Portfolio', to: '/portfolio', match: (p) => p.startsWith('/portfolio') },
  { label: 'Sessions', to: '/search', match: (p) => p === '/search' || p.startsWith('/session/') },
  { label: 'Settings', to: '/settings', match: (p) => p.startsWith('/settings') },
]

export function AppShell({ back, chips, actions, children }: AppShellProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const isSearchPage = location.pathname === '/search'
  const [topbarQuery, setTopbarQuery] = useState('')

  return (
    <div className="min-h-screen flex flex-col bg-surface-mid">
      <header className="sticky top-0 z-50 bg-surface-lowest border-b border-ghost">
        <div className="flex items-center justify-between h-12 px-4">
          <div className="flex items-center gap-3">
            <Link to="/" className="flex items-center gap-2 shrink-0">
              <span className="w-6 h-6 bg-primary rounded-md flex items-center justify-center text-on-primary font-display text-xs font-bold">
                h
              </span>
              <span className="font-display text-sm font-semibold text-on-surface">
                heyi.am
              </span>
            </Link>

            {back && (
              <>
                <span className="text-outline text-xs">/</span>
                <Link
                  to={back.to}
                  className="text-sm text-on-surface-variant hover:text-on-surface transition-colors"
                >
                  {back.label}
                </Link>
              </>
            )}

            {chips && chips.length > 0 && (
              <div className="flex items-center gap-1.5 ml-1">
                {chips.map((chip) => (
                  <Chip key={chip.label} variant={chip.variant}>
                    {chip.label}
                  </Chip>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {!isSearchPage && (
              <div className="w-48">
                <SearchInput
                  value={topbarQuery}
                  onChange={setTopbarQuery}
                  onSubmit={() => {
                    navigate(`/search?q=${encodeURIComponent(topbarQuery)}`)
                    setTopbarQuery('')
                  }}
                  compact
                />
              </div>
            )}
            <button
              type="button"
              data-testid="cmdk-pill"
              onClick={() => console.log('cmd-k')}
              className="hidden md:inline-flex items-center gap-1.5 h-7 px-2 rounded-sm border border-ghost text-[0.6875rem] font-mono text-on-surface-variant hover:text-on-surface hover:border-outline transition-colors"
              aria-label="Open command palette"
            >
              <span>⌘K</span>
              <span>Search</span>
            </button>
            {actions}
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <nav
          aria-label="Primary"
          className="w-[220px] shrink-0 border-r border-ghost bg-surface-lowest py-3 overflow-y-auto"
        >
          <ul className="flex flex-col gap-0.5 px-2">
            {SIDEBAR_DESTINATIONS.map((dest) => {
              const active = dest.match(location.pathname)
              return (
                <li key={dest.to}>
                  <Link
                    to={dest.to}
                    aria-current={active ? 'page' : undefined}
                    className={
                      active
                        ? 'block px-3 py-1.5 rounded-sm text-[0.8125rem] font-semibold text-primary bg-surface-low'
                        : 'block px-3 py-1.5 rounded-sm text-[0.8125rem] text-on-surface-variant hover:text-on-surface hover:bg-surface-low transition-colors'
                    }
                  >
                    {dest.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  )
}
