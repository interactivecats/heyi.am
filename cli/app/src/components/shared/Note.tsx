import type { ReactNode } from 'react'

interface NoteProps {
  title?: string
  children: ReactNode
}

export function Note({ title, children }: NoteProps) {
  return (
    <div className="bg-surface-low border border-ghost rounded-sm p-2.5">
      {title && (
        <div className="font-body text-sm font-semibold text-on-surface mb-1">
          {title}
        </div>
      )}
      <div className="text-sm text-on-surface-variant">{children}</div>
    </div>
  )
}
