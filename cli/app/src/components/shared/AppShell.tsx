import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Chip, type ChipVariant } from './Chip'

interface AppShellProps {
  back?: { label: string; to: string }
  chips?: { label: string; variant?: ChipVariant }[]
  actions?: ReactNode
  children: ReactNode
}

export function AppShell({ back, chips, actions, children }: AppShellProps) {
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

          {actions && (
            <div className="flex items-center gap-2">{actions}</div>
          )}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  )
}
