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
            {actions}
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  )
}
