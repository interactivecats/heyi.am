import type { ReactNode } from 'react'

interface CardProps {
  hover?: boolean
  className?: string
  children: ReactNode
}

export function Card({ hover, className = '', children }: CardProps) {
  return (
    <div
      className={[
        'bg-surface-lowest border border-ghost rounded-md p-4',
        hover ? 'transition-shadow hover:shadow-md' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </div>
  )
}
