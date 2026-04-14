import { useEffect, useRef } from 'react'

export interface ConfirmModalProps {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  /** Optional extra details rendered below the main message. */
  details?: string
  busy?: boolean
  error?: string | null
  onConfirm: () => void
  onCancel: () => void
}

/**
 * A dead-simple confirm dialog with focus + Escape handling. Destructive
 * variant renders the confirm button in the error color.
 *
 * The parent owns the async state — this component only reflects `busy`
 * and `error`. On Escape or Cancel we call `onCancel`; on confirm we call
 * `onConfirm`. The parent is responsible for closing the modal when the
 * async action resolves.
 */
export function ConfirmModal({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  details,
  busy = false,
  error,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    // Focus defaults to Cancel for destructive actions — the safe choice.
    cancelRef.current?.focus()
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) {
        e.stopPropagation()
        onCancel()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [busy, onCancel])

  const confirmClass = destructive
    ? 'font-mono text-[0.8125rem] text-white bg-red-600 rounded-md px-3 py-1 hover:bg-red-700 transition-colors disabled:opacity-50'
    : 'font-mono text-[0.8125rem] text-on-primary bg-primary rounded-md px-3 py-1 hover:bg-primary-hover transition-colors disabled:opacity-50'

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40"
    >
      <div className="bg-surface-lowest rounded-md border border-ghost shadow-lg w-full max-w-md">
        <div className="px-4 py-3 border-b border-ghost">
          <span id="confirm-modal-title" className="font-mono text-[0.8125rem] font-semibold text-on-surface">
            {title}
          </span>
        </div>
        <div className="px-4 py-4">
          <p className="text-sm text-on-surface leading-relaxed">{message}</p>
          {details && (
            <p className="mt-2 text-xs text-on-surface-variant leading-relaxed">{details}</p>
          )}
          {error && (
            <p className="mt-3 text-xs text-error font-mono" role="alert">{error}</p>
          )}
        </div>
        <div className="px-4 py-3 border-t border-ghost flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="font-mono text-[0.8125rem] text-on-surface-variant hover:text-on-surface px-3 py-1 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={confirmClass}
          >
            {busy ? 'Working...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
