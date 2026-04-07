// PreviewPane — center region of the portfolio workspace.
//
// Renders an iframe pointing at /preview/portfolio (served by the same Express
// server as this React app, so same-origin access works). Above the iframe is
// a thin header strip with a Landing | Project | Session segmented control,
// the current template name, and an "Open in browser" stub button.
//
// Profile edits do NOT reload the iframe. Instead, on every state.profile
// change we reach across the same-origin iframe boundary and patch the text
// nodes that templates have annotated with data-portfolio-field="<field>".
// This avoids re-running the portfolio's mount animations (counter ticker,
// intro fades) on every keystroke. The iframe only fully reloads when the
// template changes (key bump in handleSelectTemplate).
//
// Fields covered in v1: displayName, bio, location. Photo, accent color,
// contact info, and social links still wait for a full reload (not yet on
// the live-patch path). Templates that don't carry the data-portfolio-field
// annotation silently no-op for that field.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePortfolioStore } from '../../hooks/usePortfolioStore'
import { fetchAuthStatus, fetchTheme, saveTheme, type PortfolioProfile } from '../../api'
import { TemplateBrowser } from '../TemplateBrowser'

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

// ── Live DOM patcher helpers ─────────────────────────────────
//
// Each annotated field maps to a patch descriptor describing how to mutate
// the matching element. Text fields update an inner [data-portfolio-text]
// child (or fall back to the element itself); link fields additionally
// rewrite the <a> href via a per-field URL transform; the photo field
// updates the <img> src.

type PatchableField =
  | 'displayName'
  | 'bio'
  | 'location'
  | 'email'
  | 'phone'
  | 'linkedinUrl'
  | 'githubUrl'
  | 'twitterHandle'
  | 'websiteUrl'
  | 'photoBase64'

const PATCHABLE_FIELDS: PatchableField[] = [
  'displayName',
  'bio',
  'location',
  'email',
  'phone',
  'linkedinUrl',
  'githubUrl',
  'twitterHandle',
  'websiteUrl',
  'photoBase64',
]

/**
 * Map a contact field to the URL it should produce in the <a href>.
 * Returns null if the field has no href transform (text-only field).
 */
function fieldToHref(field: PatchableField, value: string): string | null {
  switch (field) {
    case 'email':
      return `mailto:${value}`
    case 'phone':
      return `tel:${value}`
    case 'linkedinUrl':
    case 'githubUrl':
    case 'websiteUrl':
      return value
    case 'twitterHandle':
      return `https://x.com/${value.replace(/^@/, '')}`
    default:
      return null
  }
}

function patchField(doc: Document, field: PatchableField, rawValue: string | undefined): void {
  const el = doc.querySelector(`[data-portfolio-field="${field}"]`) as HTMLElement | null
  if (!el) return
  const value = rawValue ?? ''
  const isEmpty = value === ''

  // Visibility toggle. Empty -> mark with data-portfolio-empty so the
  // template stylesheet's [data-portfolio-empty="true"] { display: none }
  // rule hides it. Non-empty -> remove the attribute so the stylesheet's
  // default visibility wins. We deliberately do NOT touch style.display so
  // we don't fight whatever layout the template has on the element.
  if (isEmpty) {
    el.setAttribute('data-portfolio-empty', 'true')
  } else {
    el.removeAttribute('data-portfolio-empty')
  }

  if (field === 'photoBase64') {
    // <img> src update. setAttribute keeps things consistent with how the
    // template renders the value at SSR time.
    if (!isEmpty) el.setAttribute('src', value)
    return
  }

  // Text update: prefer the inner [data-portfolio-text] child so we don't
  // clobber the inline SVG icon that lives next to the text in most
  // contact-row templates. Fall back to the element itself when no inner
  // wrapper is present (e.g. hero displayName/bio).
  const textHost = el.querySelector('[data-portfolio-text]') as HTMLElement | null
  if (textHost) {
    // For twitterHandle the template prefixes "@" — re-apply that here so
    // the displayed value matches the static render.
    textHost.textContent = field === 'twitterHandle' ? `@${value.replace(/^@/, '')}` : value
  } else if (field === 'displayName' || field === 'bio' || field === 'location') {
    el.textContent = value
  }

  // href update for <a> tags. Skip when the element isn't an anchor (e.g.
  // blueprint's phone is a <span>) — fieldToHref still returns a value
  // but there's no href to write.
  const href = fieldToHref(field, value)
  if (href !== null && el.tagName === 'A' && !isEmpty) {
    el.setAttribute('href', href)
  }
}

function applyAllPatches(doc: Document, profile: PortfolioProfile): void {
  for (const field of PATCHABLE_FIELDS) {
    patchField(doc, field, profile[field] as string | undefined)
  }
}

export function PreviewPane() {
  const { state, dispatch } = usePortfolioStore()
  const [target, setTarget] = useState<PreviewTarget>('landing')
  const [reloadKey, setReloadKey] = useState(0)
  const [refreshDisabled, setRefreshDisabled] = useState(false)
  const [templateName, setTemplateName] = useState<string>('editorial')
  const [username, setUsername] = useState<string | null>(null)
  const [templateBrowserOpen, setTemplateBrowserOpen] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)

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

  // Fetch the authenticated username so the "Open in browser" button can
  // resolve heyi.am/:username. Failure is non-fatal — the button just stays
  // disabled until the user is authenticated.
  useEffect(() => {
    let cancelled = false
    fetchAuthStatus()
      .then((s) => {
        if (!cancelled && s.authenticated && s.username) setUsername(s.username)
      })
      .catch(() => {
        /* keep null */
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Live-patch the iframe DOM in place on every profile change. Same-origin
  // access lets us reach into iframe.contentDocument and update text /
  // href / src on elements that templates have annotated with
  // data-portfolio-field. No reload, no remount, no animation re-run.
  //
  // Per-field semantics handled by patchField():
  //  - text fields (displayName, bio, location): set textContent on the
  //    annotated element, OR on its inner [data-portfolio-text] child if
  //    one exists (so the inline SVG icon next to the text is preserved).
  //  - link fields (email, phone, linkedinUrl, githubUrl, twitterHandle,
  //    websiteUrl): update the inner [data-portfolio-text] (if present),
  //    AND rewrite the href via a field-specific URL transform when the
  //    annotated element is an <a>. LinkedIn/GitHub render fixed link
  //    text ("LinkedIn"/"GitHub") so the text update is a no-op there.
  //  - photoBase64: setAttribute('src', value) on the annotated <img>.
  //  - empty value on a non-image: hide via inline display:none.
  //  - empty value on an image: hide via inline display:none.
  //
  // textContent + setAttribute (NOT innerHTML) — XSS-safe by definition.
  // The patcher silently no-ops when the iframe contentDocument is not yet
  // ready, when the current template doesn't carry an annotation for a
  // given field, or when the field was {% if %}-omitted at render time.
  //
  // Empty-then-restore caveat: if a field was empty at render time the
  // template `{% if %}` left no element in the DOM, so this patcher has
  // nothing to find when the user types into it. The Refresh button is
  // the escape hatch — see handleRefresh below.
  useEffect(() => {
    const doc = iframeRef.current?.contentDocument
    if (!doc) return
    applyAllPatches(doc, state.profile)
  }, [state.profile])

  // Re-apply the live patch after the iframe finishes loading (e.g. on
  // initial mount or after a template-switch reload), so the freshly
  // rendered HTML reflects the latest store state instead of whatever
  // settings.json was on disk.
  function handleIframeLoad() {
    const doc = iframeRef.current?.contentDocument
    if (!doc) return
    applyAllPatches(doc, state.profile)
  }

  // Resolve the "Open in browser" URL based on the active target. Returns
  // null when there's nothing to open (never published or missing config).
  const openInBrowserUrl = useMemo<string | null>(() => {
    if (state.activeTarget === 'heyi.am') {
      if (!username) return null
      const targetState = state.publishState?.targets['heyi.am']
      // Only consider the portfolio "live" once the user has actually
      // published once — otherwise the URL would 404.
      if (!targetState?.lastPublishedAt) return null
      // Prefer the URL the publish endpoint reported back; fall back to the
      // canonical heyi.am path computed from the username.
      return targetState.url || `https://heyi.am/${encodeURIComponent(username)}`
    }
    const githubTarget = state.publishState?.targets.github
    return githubTarget?.url ?? null
  }, [state.activeTarget, state.publishState, username])

  /**
   * Manual escape hatch — fully reload the iframe so any state the live
   * patcher cannot reach (template-conditional contact rows that were
   * `{% if %}`-omitted at SSR time, project list reorder/toggle, etc.)
   * picks up the freshest server render. Disables itself for ~500ms after
   * each click to prevent accidental spam.
   */
  function handleRefresh() {
    if (refreshDisabled) return
    // Unified with the auto-refresh path: dispatch BUMP_REFRESH so the
    // iframe key derived from state.refreshTrigger increments. This is the
    // same mechanism EditRail uses after a project list save lands.
    dispatch({ type: 'BUMP_REFRESH' })
    setRefreshDisabled(true)
    setTimeout(() => setRefreshDisabled(false), 500)
  }

  function handleOpenInBrowser() {
    if (!openInBrowserUrl) return
    window.open(openInBrowserUrl, '_blank', 'noopener,noreferrer')
  }

  function handleOpenTemplateBrowser() {
    setTemplateBrowserOpen(true)
  }

  function handleCloseTemplateBrowser() {
    setTemplateBrowserOpen(false)
  }

  // When the user picks a template inside the modal, persist it via
  // saveTheme, refresh our local copy of the template name, bump the
  // iframe key so the preview re-renders against the new template, and
  // close the modal. Errors are swallowed at the UI layer (saveTheme
  // throws would otherwise crash the modal); a future polish pass can
  // surface these via the StatusBar's lastPublishError channel.
  const handleSelectTemplate = useCallback(async (newTemplate: string) => {
    setTemplateBrowserOpen(false)
    const previous = templateName
    setTemplateName(newTemplate)
    try {
      await saveTheme(newTemplate)
      // Force the iframe to re-render with the new template.
      setReloadKey((k) => k + 1)
    } catch {
      // Roll back the optimistic UI change so the pill stays truthful.
      setTemplateName(previous)
    }
  }, [templateName])

  return (
    <div className="flex flex-1 min-w-0 min-h-0 flex-col bg-surface-mid" data-testid="portfolio-preview">
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

        {/* Refresh preview */}
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshDisabled}
          aria-disabled={refreshDisabled}
          className="text-xs text-on-surface-variant hover:text-on-surface px-2 py-1 disabled:opacity-40 disabled:cursor-not-allowed"
          data-testid="portfolio-preview-refresh"
          title="Force a fresh preview render."
        >
          Refresh ⟳
        </button>

        {/* Open in browser */}
        <button
          type="button"
          onClick={handleOpenInBrowser}
          disabled={openInBrowserUrl === null}
          aria-disabled={openInBrowserUrl === null}
          className="text-xs text-on-surface-variant hover:text-on-surface px-2 py-1 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-on-surface-variant"
          data-testid="portfolio-preview-open-in-browser"
          title={openInBrowserUrl === null ? 'Publish first to open in browser' : openInBrowserUrl}
        >
          Open in browser ↗
        </button>
      </div>

      {/* Iframe */}
      <iframe
        key={`${reloadKey}-${state.refreshTrigger}`}
        ref={iframeRef}
        title="Portfolio preview"
        src={currentSrc}
        onLoad={handleIframeLoad}
        className="flex-1 w-full min-h-0 border-0 bg-surface-lowest"
        data-testid="portfolio-preview-iframe"
      />

      {templateBrowserOpen && (
        <TemplateBrowser
          mode="modal"
          onClose={handleCloseTemplateBrowser}
          onSelectTemplate={handleSelectTemplate}
        />
      )}
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
