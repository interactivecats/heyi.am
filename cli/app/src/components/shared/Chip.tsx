import type { ReactNode } from 'react'

export type ChipVariant = 'default' | 'green' | 'amber' | 'violet' | 'primary'

interface ChipProps {
  variant?: ChipVariant
  children: ReactNode
}

const variantStyles: Record<ChipVariant, string> = {
  default: 'bg-surface-low text-on-surface-variant',
  green: 'bg-green-bg text-green',
  amber: 'bg-amber-bg text-amber',
  violet: 'bg-violet-bg text-violet',
  primary: 'bg-primary/10 text-primary',
}

export function Chip({ variant = 'default', children }: ChipProps) {
  return (
    <span
      className={`font-mono text-[11px] leading-tight py-0.5 px-2 rounded-sm ${variantStyles[variant]}`}
    >
      {children}
    </span>
  )
}
