import { useEffect, useRef } from 'react'

interface SearchInputProps {
  value: string
  onChange: (value: string) => void
  onSubmit?: () => void
  compact?: boolean
  placeholder?: string
  autoFocus?: boolean
}

export function SearchInput({
  value,
  onChange,
  onSubmit,
  compact = false,
  placeholder = 'Search sessions...',
  autoFocus = false,
}: SearchInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (
        e.key === '/' &&
        !e.ctrlKey &&
        !e.metaKey &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA'
      ) {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <div className="relative">
      <svg
        className={`absolute top-1/2 -translate-y-1/2 text-on-surface-variant ${compact ? 'left-2 w-3.5 h-3.5' : 'left-3 w-4 h-4'}`}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && onSubmit) onSubmit()
          if (e.key === 'Escape') inputRef.current?.blur()
        }}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className={[
          'w-full bg-surface-low border border-ghost rounded-md font-mono text-on-surface placeholder:text-outline transition-colors',
          'focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20',
          compact ? 'text-xs pl-7 pr-2 py-1' : 'text-sm pl-9 pr-3 py-2',
        ].join(' ')}
      />
      {!compact && (
        <kbd className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[10px] text-outline bg-surface-mid px-1.5 py-0.5 rounded-sm border border-ghost">
          /
        </kbd>
      )}
    </div>
  )
}
