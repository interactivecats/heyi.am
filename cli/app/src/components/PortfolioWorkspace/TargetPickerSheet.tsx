// TargetPickerSheet — modal shown when the StatusBar target pill chevron is
// clicked. Lets the user pick which target ("heyi.am", "export to folder",
// or "GitHub Pages") the Publish button should push to, and configure each
// target inline.
//
// Phase 4 scope:
//   • "Export to folder" is first and featured — inline folder picker using
//     the File System Access API, with a text-input fallback for browsers
//     that don't support it (or when running in Electron without the API).
//   • "heyi.am" shows a Public/Unlisted radio (v1 visibility control). Custom
//     domain field is explicitly out of scope for v1.
//   • "GitHub Pages" is rendered but disabled. Phase 5 Frontend enables it.
//
// The sheet closes on Escape, click outside its body, or the ✕ button.

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  usePortfolioStore,
  type PortfolioTargetId,
} from '../../hooks/usePortfolioStore'

interface TargetPickerSheetProps {
  open: boolean
  onClose: () => void
}

// File System Access API — not in lib.dom for all TS versions we target.
interface WindowWithDirectoryPicker extends Window {
  showDirectoryPicker?: (options?: unknown) => Promise<{ name: string }>
}

function hasDirectoryPicker(w: Window): w is WindowWithDirectoryPicker &
  Required<Pick<WindowWithDirectoryPicker, 'showDirectoryPicker'>> {
  return typeof (w as WindowWithDirectoryPicker).showDirectoryPicker === 'function'
}

export function TargetPickerSheet({ open, onClose }: TargetPickerSheetProps) {
  const { state, dispatch } = usePortfolioStore()
  const { activeTarget, publishState, exportTargetPath } = state
  const bodyRef = useRef<HTMLDivElement | null>(null)

  const heyiamTarget = publishState?.targets['heyi.am']
  const heyiamVisibility = heyiamTarget?.visibility ?? 'public'

  const [pickerError, setPickerError] = useState<string | null>(null)
  const [pathInput, setPathInput] = useState<string>(exportTargetPath ?? '')

  // Keep the fallback input in sync when the store changes externally.
  useEffect(() => {
    setPathInput(exportTargetPath ?? '')
  }, [exportTargetPath, open])

  // Escape closes.
  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  const onOverlayMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (bodyRef.current && e.target instanceof Node && !bodyRef.current.contains(e.target)) {
        onClose()
      }
    },
    [onClose],
  )

  const pickFolder = useCallback(async () => {
    setPickerError(null)
    if (!hasDirectoryPicker(window)) {
      setPickerError('Folder picker not supported in this browser — type a path below.')
      return
    }
    try {
      const handle = await window.showDirectoryPicker()
      // The File System Access API does not expose absolute paths for
      // privacy reasons — we store the directory name as a human-readable
      // label. The backend export job prompts for a real path when invoked.
      dispatch({ type: 'SET_EXPORT_TARGET_PATH', path: handle.name })
      setPathInput(handle.name)
    } catch (err) {
      // User cancelled the native picker — not an error worth surfacing.
      if (err instanceof DOMException && err.name === 'AbortError') return
      const message = err instanceof Error ? err.message : 'Folder picker failed'
      setPickerError(message)
    }
  }, [dispatch])

  const commitFallbackPath = useCallback(() => {
    const trimmed = pathInput.trim()
    dispatch({ type: 'SET_EXPORT_TARGET_PATH', path: trimmed.length > 0 ? trimmed : null })
  }, [dispatch, pathInput])

  const setActiveTarget = useCallback(
    (target: PortfolioTargetId) => {
      dispatch({ type: 'SET_ACTIVE_TARGET', target })
    },
    [dispatch],
  )

  const setHeyiamVisibility = useCallback(
    (value: 'public' | 'unlisted') => {
      dispatch({ type: 'SET_VISIBILITY', target: 'heyi.am', visibility: value })
    },
    [dispatch],
  )

  if (!open) return null

  const supportsPicker = typeof window !== 'undefined' && hasDirectoryPicker(window)

  const overlayClass =
    'fixed inset-0 z-50 flex items-center justify-center bg-black/40'
  const bodyClass =
    'w-[520px] max-w-[92vw] bg-surface-low border border-ghost rounded-md p-6 relative'

  return (
    <div
      data-testid="target-picker-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Choose publish target"
      className={overlayClass}
      onMouseDown={onOverlayMouseDown}
    >
      <div ref={bodyRef} className={bodyClass} data-testid="target-picker-sheet">
        <button
          type="button"
          data-testid="target-picker-close"
          onClick={onClose}
          aria-label="Close target picker"
          className="absolute top-3 right-3 text-on-surface-variant hover:text-on-surface text-lg leading-none"
        >
          ×
        </button>

        <h2 className="text-[0.9375rem] font-semibold text-on-surface mb-1">
          Publish target
        </h2>
        <p className="text-[0.8125rem] text-on-surface-variant mb-5">
          Where should the Publish button push your portfolio?
        </p>

        <div className="flex flex-col gap-3">
          {/* ── Export to folder (featured) ───────────────────────── */}
          <section
            data-testid="target-card-export"
            className="border border-ghost rounded-sm p-4 bg-surface-lowest"
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <div>
                <h3 className="text-[0.875rem] font-semibold text-on-surface">
                  Export to folder
                </h3>
                <p className="text-[0.75rem] text-on-surface-variant mt-0.5">
                  Render a static site into a local folder you control. Host it anywhere.
                </p>
              </div>
              {activeTarget === 'export' ? (
                <span
                  data-testid="target-export-active-badge"
                  className="text-[0.6875rem] uppercase tracking-wide text-primary border border-primary rounded-sm px-1.5 py-0.5 shrink-0"
                >
                  Active
                </span>
              ) : null}
            </div>

            <div className="flex items-center gap-2 mt-3">
              {supportsPicker ? (
                <>
                  <button
                    type="button"
                    data-testid="target-export-pick-folder"
                    onClick={() => void pickFolder()}
                    className="text-[0.8125rem] px-2.5 py-1 rounded-sm border border-ghost hover:border-outline text-on-surface"
                  >
                    Pick folder…
                  </button>
                  <span
                    data-testid="target-export-path"
                    className="text-[0.75rem] text-on-surface-variant truncate"
                  >
                    {exportTargetPath ?? 'No folder picked yet'}
                  </span>
                </>
              ) : (
                <label className="flex items-center gap-2 w-full text-[0.75rem] text-on-surface-variant">
                  <span className="shrink-0">Path:</span>
                  <input
                    type="text"
                    data-testid="target-export-path-input"
                    value={pathInput}
                    placeholder="/absolute/path/to/folder"
                    onChange={(e) => setPathInput(e.target.value)}
                    onBlur={commitFallbackPath}
                    className="flex-1 bg-surface-low border border-ghost rounded-sm px-2 py-1 text-on-surface focus:outline-none focus:border-outline"
                  />
                </label>
              )}
            </div>
            {pickerError ? (
              <p
                data-testid="target-export-picker-error"
                className="text-[0.75rem] text-error mt-2"
              >
                {pickerError}
              </p>
            ) : null}

            <div className="mt-4">
              <button
                type="button"
                data-testid="target-export-set-active"
                onClick={() => setActiveTarget('export')}
                disabled={activeTarget === 'export'}
                className="text-[0.8125rem] px-3 py-1 rounded-sm bg-primary text-on-primary hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {activeTarget === 'export' ? 'Active target' : 'Set as active target'}
              </button>
            </div>
          </section>

          {/* ── heyi.am ───────────────────────────────────────────── */}
          <section
            data-testid="target-card-heyiam"
            className="border border-ghost rounded-sm p-4 bg-surface-lowest"
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <div>
                <h3 className="text-[0.875rem] font-semibold text-on-surface">heyi.am</h3>
                <p className="text-[0.75rem] text-on-surface-variant mt-0.5">
                  Hosted at heyi.am/your-handle. No DNS, no config.
                </p>
              </div>
              {activeTarget === 'heyi.am' ? (
                <span
                  data-testid="target-heyiam-active-badge"
                  className="text-[0.6875rem] uppercase tracking-wide text-primary border border-primary rounded-sm px-1.5 py-0.5 shrink-0"
                >
                  Active
                </span>
              ) : null}
            </div>

            <fieldset className="mt-3 flex items-center gap-4">
              <legend className="sr-only">Visibility</legend>
              <label className="flex items-center gap-1.5 text-[0.8125rem] text-on-surface cursor-pointer">
                <input
                  type="radio"
                  name="heyiam-visibility"
                  value="public"
                  data-testid="target-heyiam-visibility-public"
                  checked={heyiamVisibility === 'public'}
                  onChange={() => setHeyiamVisibility('public')}
                />
                <span>Public</span>
              </label>
              <label className="flex items-center gap-1.5 text-[0.8125rem] text-on-surface cursor-pointer">
                <input
                  type="radio"
                  name="heyiam-visibility"
                  value="unlisted"
                  data-testid="target-heyiam-visibility-unlisted"
                  checked={heyiamVisibility === 'unlisted'}
                  onChange={() => setHeyiamVisibility('unlisted')}
                />
                <span>Unlisted</span>
              </label>
            </fieldset>

            <div className="mt-4">
              <button
                type="button"
                data-testid="target-heyiam-set-active"
                onClick={() => setActiveTarget('heyi.am')}
                disabled={activeTarget === 'heyi.am'}
                className="text-[0.8125rem] px-3 py-1 rounded-sm bg-primary text-on-primary hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {activeTarget === 'heyi.am' ? 'Active target' : 'Set as active target'}
              </button>
            </div>
          </section>

          {/* ── GitHub Pages (disabled, Phase 5) ──────────────────── */}
          <section
            data-testid="target-card-github"
            aria-disabled="true"
            className="border border-ghost rounded-sm p-4 bg-surface-lowest opacity-50"
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <div>
                <h3 className="text-[0.875rem] font-semibold text-on-surface">GitHub Pages</h3>
                <p className="text-[0.75rem] text-on-surface-variant mt-0.5">
                  Push rendered HTML to a gh-pages branch of a repo you own.
                </p>
              </div>
              <span
                data-testid="target-github-coming-soon"
                className="text-[0.6875rem] uppercase tracking-wide text-on-surface-variant border border-ghost rounded-sm px-1.5 py-0.5 shrink-0"
              >
                Coming soon
              </span>
            </div>
            <div className="mt-4">
              <button
                type="button"
                data-testid="target-github-set-active"
                disabled
                className="text-[0.8125rem] px-3 py-1 rounded-sm bg-primary text-on-primary opacity-50 cursor-not-allowed"
              >
                Set as active target
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
