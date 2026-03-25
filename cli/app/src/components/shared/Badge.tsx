import type { ReactNode } from 'react'

export type BadgeVariant = 'refined' | 'local' | 'exported' | 'violet'

interface BadgeProps {
  variant: BadgeVariant
  children: ReactNode
}

const variantStyles: Record<BadgeVariant, string> = {
  refined: 'bg-green-bg text-green',
  local: 'bg-surface-low text-on-surface-variant',
  exported: 'bg-amber-bg text-amber',
  violet: 'bg-violet-bg text-violet',
}

export function Badge({ variant, children }: BadgeProps) {
  return (
    <span
      className={`font-mono text-[9px] leading-tight uppercase tracking-wider py-0.5 px-1.5 rounded-sm ${variantStyles[variant]}`}
    >
      {children}
    </span>
  )
}
