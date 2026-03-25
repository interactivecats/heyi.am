import type { ReactNode } from 'react'

interface SectionHeaderProps {
  title: string
  meta?: string
  children?: ReactNode
}

export function SectionHeader({ title, meta, children }: SectionHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h3 className="font-display text-base font-semibold text-on-surface">
        {title}
      </h3>
      <div className="flex items-center gap-2">
        {meta && (
          <span className="font-mono text-[9px] uppercase tracking-wider text-on-surface-variant">
            {meta}
          </span>
        )}
        {children}
      </div>
    </div>
  )
}
