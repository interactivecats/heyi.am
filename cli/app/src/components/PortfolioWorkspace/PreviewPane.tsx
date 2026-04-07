// PreviewPane — center region of the portfolio workspace.
//
// Renders an iframe pointing at /preview/portfolio (served by the same Express
// server as this React app, so same-origin access works). Above the iframe is
// a thin header strip with a Landing | Project | Session segmented control,
// the current template name, and an "Open in browser" stub button.
//
// On profile changes (debounced 300ms) the iframe is force-remounted via a
// `key` bump. Scroll position is preserved by reading
// iframe.contentWindow.scrollY before remount and restoring it after the new
// document loads. This works because preview is same-origin; if a future move
// to a different origin breaks this, fall back to a postMessage scroll bridge.

import { useEffect, useMemo, useRef, useState } from 'react'
import { usePortfolioStore } from '../../hooks/usePortfolioStore'
import { fetchTheme } from '../../api'

type PreviewTarget = 'landing' | 'project' | 'session'

const LANDING_SRC = '/preview/portfolio'

interface ResolvedSrc {
  landing: string
  project: string | null
  session: string | null
}

function buildSources(firstIncludedProjectId: string | null): ResolvedSrc {
  const project = firstIncludedProjectId
    ? `/preview/portfolio?view=project&slug=${encodeURIComponent(firstIncludedProjectId)}`
    : null
  const session = firstIncludedProjectId
    ? `/preview/portfolio?view=session&slug=${encodeURIComponent(firstIncludedProjectId)}`
    : null
  return { landing: LANDING_SRC, project, session }
}

export function PreviewPane() {
  const { state } = usePortfolioStore()
  const [target, setTarget] = useState<PreviewTarget>('landing')
  const [reloadKey, setReloadKey] = useState(0)
  const [templateName, setTemplateName] = useState<string>('editorial')
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const savedScrollRef = useRef<number>(0)

  const firstIncludedProjectId = useMemo(() => {
    const sorted = state.projects
      .filter((p) => p.included)
      .sort((a, b) => a.order - b.order)
    return sorted[0]?.projectId ?? null
  }, [state.projects])

  const sources = useMemo(() => buildSources(firstIncludedProjectId), [firstIncludedProjectId])

  // Effective target: fall back to landing when chosen target has no source.
  const effectiveTarget: PreviewTarget =
    target === 'landing'
      ? 'landing'
      : target === 'project' && sources.project
        ? 'project'
        : target === 'session' && sources.session
          ? 'session'
          : 'landing'

  const currentSrc =
    effectiveTarget === 'project'
      ? (sources.project as string)
      : effectiveTarget === 'session'
        ? (sources.session as string)
        : sources.landing

  // Fetch the current template name once on mount. Failure is non-fatal —
  // we just leave the default ("editorial").
  useEffect(() => {
    let cancelled = false
    fetchTheme()
      .then((t) => {
        if (!cancelled && t?.template) setTemplateName(t.template)
      })
      .catch(() => {
        /* keep default */
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Debounced reload on profile change. Captures scroll position before the
  // remount, restores it after the new iframe document fires `load`.
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const win = iframeRef.current?.contentWindow
        // Same-origin access: this throws if cross-origin.
        savedScrollRef.current = win?.scrollY ?? 0
      } catch {
        savedScrollRef.current = 0
      }
      setReloadKey((k) => k + 1)
    }, 300)
    return () => clearTimeout(timer)
    // We intentionally only depend on `profile` — segmented-control changes
    // already swap the iframe via the `src` prop.
  }, [state.profile])

  function handleIframeLoad() {
    try {
      const win = iframeRef.current?.contentWindow
      if (win && savedScrollRef.current > 0) {
        win.scrollTo(0, savedScrollRef.current)
      }
    } catch {
      /* cross-origin: nothing we can do */
    }
  }

  function handleOpenInBrowser() {
    // Phase 6 wires this up — the resolved URL depends on activeTarget.
    // eslint-disable-next-line no-console
    console.log('open in browser')
  }

  function handleOpenTemplateBrowser() {
    // Phase 6 wires this up.
    // eslint-disable-next-line no-console
    console.log('open template browser')
  }

  return (
    <div className="flex flex-1 flex-col bg-surface-mid" data-testid="portfolio-preview">
      {/* Header strip */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-ghost bg-surface-lowest px-3">
        {/* Segmented control */}
        <div
          role="tablist"
          aria-label="Preview target"
          className="inline-flex items-center rounded-sm border border-ghost"
        >
          <SegmentButton
            label="Landing"
            active={effectiveTarget === 'landing'}
            disabled={false}
            onClick={() => setTarget('landing')}
          />
          <SegmentButton
            label="Project"
            active={effectiveTarget === 'project'}
            disabled={sources.project === null}
            onClick={() => setTarget('project')}
          />
          <SegmentButton
            label="Session"
            active={effectiveTarget === 'session'}
            disabled={sources.session === null}
            onClick={() => setTarget('session')}
          />
        </div>

        {/* Template pill */}
        <button
          type="button"
          onClick={handleOpenTemplateBrowser}
          className="font-mono text-xs text-on-surface-variant hover:text-on-surface px-2 py-1 rounded-sm border border-ghost"
          data-testid="portfolio-preview-template-pill"
        >
          {templateName}
        </button>

        {/* Open in browser */}
        <button
          type="button"
          onClick={handleOpenInBrowser}
          className="text-xs text-on-surface-variant hover:text-on-surface px-2 py-1"
          data-testid="portfolio-preview-open-in-browser"
        >
          Open in browser ↗
        </button>
      </div>

      {/* Iframe */}
      <iframe
        key={reloadKey}
        ref={iframeRef}
        title="Portfolio preview"
        src={currentSrc}
        onLoad={handleIframeLoad}
        className="flex-1 w-full border-0 bg-surface-lowest"
        data-testid="portfolio-preview-iframe"
      />
    </div>
  )
}

function SegmentButton({
  label,
  active,
  disabled,
  onClick,
}: {
  label: string
  active: boolean
  disabled: boolean
  onClick: () => void
}) {
  const base =
    'text-xs px-3 py-1 transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-0 first:rounded-l-sm last:rounded-r-sm'
  const stateClass = disabled
    ? 'text-on-surface-variant/40 cursor-not-allowed'
    : active
      ? 'bg-surface-low text-primary'
      : 'text-on-surface-variant hover:text-on-surface'
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      disabled={disabled}
      onClick={onClick}
      className={`${base} ${stateClass}`}
    >
      {label}
    </button>
  )
}
