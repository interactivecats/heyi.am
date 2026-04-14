import { useEffect, useState, useCallback, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Link, useParams } from 'react-router-dom'
import {
  fetchProjectDetail,
  fetchProjectRender,
  fetchAuthStatus,
  fetchGitRemote,
  saveProjectEnhanceLocally,
  saveBoundaries,
  captureScreenshotFromUrl,
  deleteProjectRemote,
  type ProjectDetail as ProjectDetailType,
  type Session,
} from '../api'
import { SessionManageModal } from './SessionManageModal'
import { Note } from './shared'
import { Chip } from './shared/Chip'
import { ConfirmModal } from './shared/ConfirmModal'
import { WorkTimeline } from './WorkTimeline'
import { GrowthChart } from './GrowthChart'
import { SessionDetailOverlay } from './SessionDetailOverlay'
import { mountCounterAnimations, mountScrollReveals, mountBarAnimations } from '@heyiam/ui'
import { scopeTemplateCss } from '../scopeCss'

/** Build a link element for DOM patching (safe — no innerHTML). */
function buildLinkEl(url: string): HTMLAnchorElement {
  const a = document.createElement('a')
  a.href = url
  a.target = '_blank'
  a.rel = 'noopener noreferrer'
  a.className = 'project-link'
  a.textContent = url.replace(/^https?:\/\/(www\.)?/, '').replace(/\.git$/, '')
  return a
}

/**
 * Scope template CSS to the #liquid-render container.
 * Remaps :root/body selectors and wraps in @layer for lower specificity than Tailwind.
 */
function scopeProjectCss(css: string): string {
  return scopeTemplateCss(css, 'liquid-render') +
    '\n#liquid-render img[alt*="screenshot" i], #liquid-render img[alt*="Screenshot" i], #liquid-render [class*="screenshot"] img { max-height: 24rem; width: 100%; object-fit: cover; object-position: top; border-radius: 6px; }'
}

export function ProjectDetail() {
  const { dirName } = useParams<{ dirName: string }>()
  const [detail, setDetail] = useState<ProjectDetailType | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedSession, setSelectedSession] = useState<Session | null>(null)

  // Liquid-rendered HTML + CSS from server
  const [renderHtml, setRenderHtml] = useState<string | null>(null)
  const [renderCss, setRenderCss] = useState<string | null>(null)
  const [renderError, setRenderError] = useState<string | null>(null)
  const [templateAccent, setTemplateAccent] = useState('#084471')
  const [templateMode, setTemplateMode] = useState<'light' | 'dark'>('light')

  // Chart React roots for cleanup
  const chartRootsRef = useRef<Root[]>([])
  const liquidRef = useRef<HTMLDivElement>(null)

  // Project metadata fields
  const [projectTitle, setProjectTitle] = useState('')
  const [repoUrl, setRepoUrl] = useState('')
  const [projectUrl, setProjectUrl] = useState('')
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null)
  const [screenshotCapturing, setScreenshotCapturing] = useState(false)
  const [metadataDirty, setMetadataDirty] = useState(false)
  const [authUsername, setAuthUsername] = useState<string | null>(null)
  const [narrative, setNarrative] = useState('')
  const [embedOpen, setEmbedOpen] = useState(false)
  const [embedCopied, setEmbedCopied] = useState<string | null>(null)
  const [sessionModalOpen, setSessionModalOpen] = useState(false)
  const [deleteProjectOpen, setDeleteProjectOpen] = useState(false)
  const [deleteProjectBusy, setDeleteProjectBusy] = useState(false)
  const [deleteProjectError, setDeleteProjectError] = useState<string | null>(null)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const screenshotInputRef = useRef<HTMLInputElement>(null)

  // Fetch rendered Liquid HTML (called on mount and after metadata saves)
  const loadRender = useCallback((templateOverride?: string) => {
    if (!dirName) return
    setRenderError(null)
    const url = templateOverride
      ? `${dirName}?template=${encodeURIComponent(templateOverride)}`
      : dirName
    fetchProjectRender(url)
      .then((r) => {
        if (r) {
          setRenderHtml(r.html)
          setRenderCss(r.css)
          if (r.accent) setTemplateAccent(r.accent)
          if (r.mode) setTemplateMode(r.mode)
          if (r.screenshotUrl) {
            setScreenshotPreview((prev) => prev || r.screenshotUrl!)
          }
        } else {
          setRenderError('Failed to render template')
        }
      })
      .catch(() => {
        setRenderError('Failed to render template')
      })
  }, [dirName])

  useEffect(() => {
    if (!dirName) return
    // Clear stale state from previous project so CSS/HTML don't flash
    setRenderHtml(null)
    setRenderCss(null)
    setDetail(null)
    setLoading(true)
    fetchProjectDetail(dirName)
      .then((d) => {
        setDetail(d)
        if (d.enhanceCache?.title) setProjectTitle(d.enhanceCache.title)
        if (d.enhanceCache?.repoUrl) setRepoUrl(d.enhanceCache.repoUrl)
        if (d.enhanceCache?.projectUrl) setProjectUrl(d.enhanceCache.projectUrl)
        if (d.enhanceCache?.screenshotBase64) setScreenshotPreview(d.enhanceCache.screenshotBase64)
        if (d.enhanceCache?.result?.narrative) setNarrative(d.enhanceCache.result.narrative)
      })
      .catch(() => {})
      .finally(() => setLoading(false))

    loadRender()

    fetchGitRemote(dirName).then(({ url }) => {
      if (url) setRepoUrl((prev) => prev || (url.startsWith('http') ? url : `https://${url}`))
    }).catch(() => {})

    fetchAuthStatus().then((s) => {
      if (s.username) setAuthUsername(s.username)
    }).catch(() => {})
  }, [dirName, loadRender])

  // Inject server HTML into container via ref (not dangerouslySetInnerHTML).
  // Content is trusted — rendered by our Liquid engine with outputEscape: 'escape'.
  useEffect(() => {
    const container = liquidRef.current
    if (!renderHtml || !container) return
    container.innerHTML = renderHtml

    // Activate template animations (counters, scroll reveals, bar fills).
    // Defer to after paint so the browser has computed CSS layout — otherwise
    // IntersectionObserver sees elements at position 0,0 and scroll reveals
    // never trigger. This is why templates appeared broken until refresh.
    requestAnimationFrame(() => {
      mountCounterAnimations()
      mountScrollReveals()
      mountBarAnimations()
    })
    // loading is in deps because the <div ref={liquidRef}> is behind a loading
    // guard — if renderHtml arrives before detail, the ref is null and injection
    // silently skips. Re-firing when loading clears ensures the HTML gets injected
    // once the container div exists.
  }, [renderHtml, loading])

  // Intercept session card link clicks → open drawer instead of navigating away.
  // Session cards in Liquid templates are raw <a> tags that React Router doesn't manage.
  useEffect(() => {
    const container = liquidRef.current
    if (!container || !detail) return
    const currentDetail = detail

    function handleClick(e: MouseEvent) {
      const anchor = (e.target as HTMLElement).closest('a[href]') as HTMLAnchorElement | null
      if (!anchor) return

      const href = anchor.getAttribute('href') ?? ''
      // Match session links: /session/:id or relative session/:id
      const match = href.match(/\/session\/(.+)$/)
      if (!match) return

      e.preventDefault()
      const sessionSlug = decodeURIComponent(match[1]).replace(/\.html$/, '')
      const session = currentDetail.sessions.find(
        (s) => s.id === sessionSlug || s.title?.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') === sessionSlug,
      )
      if (session) {
        setSelectedSession(session)
      }
    }

    container.addEventListener('click', handleClick)
    return () => container.removeEventListener('click', handleClick)
  }, [detail])

  // Hydrate charts after HTML injection AND detail data is available
  useEffect(() => {
    const container = liquidRef.current
    if (!renderHtml || !container || !detail) return

    // Previous roots are cleaned up by the effect's return function below.
    // Do NOT unmount here — doing so during render causes React race conditions.
    const newRoots: Root[] = []

    const { sessions, project } = detail

    const isDark = templateMode === 'dark'

    container.querySelectorAll<HTMLElement>('[data-work-timeline]').forEach((el) => {
      const root = createRoot(el)
      newRoots.push(root)
      root.render(
        <WorkTimeline
          sessions={sessions}
          maxHeight={400}
          onSessionClick={(s) => setSelectedSession(s)}
          accentColor={templateAccent}
          isDark={isDark}
        />,
      )
    })

    container.querySelectorAll<HTMLElement>('[data-growth-chart]').forEach((el) => {
      const root = createRoot(el)
      newRoots.push(root)
      root.render(
        <GrowthChart
          sessions={sessions}
          totalLoc={project.totalLoc}
          totalFiles={project.totalFiles}
          onSessionClick={(s) => setSelectedSession(s)}
          accentColor={templateAccent}
          isDark={isDark}
          dualPositive
          variant={(el.getAttribute('data-variant') as 'default' | 'radar') || 'default'}
        />,
      )
    })

    chartRootsRef.current = newRoots

    return () => {
      for (const root of newRoots) {
        root.unmount()
      }
    }
  }, [renderHtml, detail])

  // Instant DOM patches for sidebar edits — survives because React doesn't touch the container
  useEffect(() => {
    const container = liquidRef.current
    if (!container || !renderHtml) return

    const titleEl = container.querySelector('[data-editable="title"]')
    if (titleEl && projectTitle) titleEl.textContent = projectTitle

    const linksEl = container.querySelector('[data-editable="links"]')
    if (linksEl) {
      linksEl.replaceChildren()
      if (repoUrl || projectUrl) {
        if (repoUrl) linksEl.appendChild(buildLinkEl(repoUrl))
        if (projectUrl) linksEl.appendChild(buildLinkEl(projectUrl))
      }
    }
    // Patch screenshot — hide browser chrome when removed
    const screenshotEl = container.querySelector('[data-editable="screenshot"]')
    if (screenshotEl) {
      if (!screenshotPreview) {
        (screenshotEl as HTMLElement).style.display = 'none'
      } else {
        (screenshotEl as HTMLElement).style.display = ''
      }
    }
    // Patch narrative text
    const narrativeEl = container.querySelector('[data-editable="narrative"]')
    if (narrativeEl && narrative) narrativeEl.textContent = narrative
  }, [projectTitle, repoUrl, projectUrl, screenshotPreview, narrative, renderHtml])

  // Save metadata to disk (debounced) — no re-render needed, DOM patches are authoritative
  const saveMetadata = useCallback(() => {
    if (!dirName || !detail) return
    const cache = detail.enhanceCache
    const result = cache?.result ?? { narrative: '', arc: [], skills: [], timeline: [], questions: [] }
    // Merge narrative edits into the result
    const updatedResult = narrative !== result.narrative ? { ...result, narrative } : result
    saveProjectEnhanceLocally(
      dirName,
      cache?.selectedSessionIds ?? [],
      updatedResult,
      { title: projectTitle || undefined, repoUrl: repoUrl || undefined, projectUrl: projectUrl || undefined, screenshotBase64: screenshotPreview ?? undefined },
    ).then(() => setMetadataDirty(false)).catch(() => {})
  }, [dirName, detail, projectTitle, repoUrl, projectUrl, screenshotPreview, narrative])

  useEffect(() => {
    if (!metadataDirty) return
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = setTimeout(saveMetadata, 800)
    return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current) }
  }, [metadataDirty, saveMetadata])

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <span className="text-sm text-on-surface-variant">Loading project...</span>
      </div>
    )
  }

  if (!detail) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <span className="text-sm text-on-surface-variant">Project not found.</span>
      </div>
    )
  }

  const { project, sessions } = detail
  const tools = [...new Set(sessions.map((s) => s.source ?? 'unknown'))]

  return (
    <div className={`grid grid-cols-[240px_1fr] min-h-[calc(100vh-48px)]${templateMode === 'dark' ? ' bg-black' : ''}`}>
      {/* Sidebar — editing controls */}
      <aside className="border-r border-ghost bg-surface-low p-4 overflow-y-auto">
        <div className="mb-4">
          <div className="font-mono text-[9px] uppercase tracking-wider text-outline mb-1.5">Source mix</div>
          <div className="flex flex-wrap gap-1 mt-1.5">
            {tools.map((t) => (
              <Chip key={t}>{t}</Chip>
            ))}
          </div>
        </div>

        <div className="mb-4">
          <div className="font-mono text-[9px] uppercase tracking-wider text-outline mb-1.5">Status</div>
          <div className="flex flex-wrap gap-1 mt-1.5">
            <Chip variant="primary">{project.enhancedAt ? 'Refined' : 'Unrefined'}</Chip>
            <Chip variant="green">{project.isUploaded ? 'Uploaded' : 'Local only'}</Chip>
          </div>
          {project.isUploaded && (
            <button
              type="button"
              onClick={() => { setDeleteProjectError(null); setDeleteProjectOpen(true) }}
              className="mt-2 font-mono text-[10px] text-error hover:underline"
            >
              Remove from heyi.am
            </button>
          )}
        </div>

        {/* Sessions — manage which sessions are in this project */}
        {detail.enhanceCache && (
          <div className="mb-4">
            <div className="font-mono text-[9px] uppercase tracking-wider text-outline mb-1.5">Sessions</div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-on-surface-variant">
                {detail.enhanceCache.selectedSessionIds.length} of {sessions.filter((s) => !s.parentSessionId).length} included
              </span>
              <button
                type="button"
                onClick={() => setSessionModalOpen(true)}
                className="text-[10px] font-mono text-primary hover:underline"
              >
                Manage
              </button>
            </div>
          </div>
        )}

        {/* Enhance action — first-class entry to the enhance flow without forcing publish */}
        {(() => {
          const enhancedCount = detail.enhanceCache?.selectedSessionIds?.length ?? 0
          const totalCount = sessions.length
          const fullyEnhanced = !!project.enhancedAt && enhancedCount >= totalCount && totalCount > 0
          return (
            <div className="mb-4">
              <Link
                to={`/project/${encodeURIComponent(dirName!)}/enhance`}
                aria-disabled={fullyEnhanced || undefined}
                onClick={(e) => { if (fullyEnhanced) e.preventDefault() }}
                className={`block w-full text-center font-mono text-[10px] uppercase tracking-wider px-3 py-2 rounded-sm border ${fullyEnhanced ? 'border-ghost text-outline cursor-not-allowed pointer-events-none' : 'border-primary text-primary hover:bg-primary/10'}`}
              >
                {fullyEnhanced ? 'Enhanced \u2713' : 'Enhance with AI'}
              </Link>
              {!fullyEnhanced && enhancedCount > 0 && (
                <div className="text-[9px] font-mono text-outline mt-1">{enhancedCount} of {totalCount} sessions enhanced</div>
              )}
            </div>
          )
        })()}

        <Note>The local project page is the main object. Public pages are just one projection of it.</Note>

        {/* Project metadata */}
        <div className="mt-6 pt-4 border-t border-ghost">
          <div className="font-mono text-[9px] uppercase tracking-wider text-outline mb-3">Project metadata</div>

          <label className="block mb-3">
            <span className="text-[0.75rem] font-medium text-on-surface-variant block mb-1">Title</span>
            <input
              type="text"
              value={projectTitle}
              placeholder={project.name}
              onChange={(e) => { setProjectTitle(e.target.value); setMetadataDirty(true) }}
              className="w-full text-xs font-mono px-2 py-1.5 rounded-sm border border-ghost bg-surface-lowest text-on-surface placeholder:text-outline"
            />
          </label>

          {detail.enhanceCache?.result?.narrative !== undefined && (
            <label className="block mb-3">
              <span className="text-[0.75rem] font-medium text-on-surface-variant block mb-1">Narrative</span>
              <textarea
                value={narrative}
                onChange={(e) => { setNarrative(e.target.value); setMetadataDirty(true) }}
                rows={4}
                placeholder="Project narrative..."
                className="w-full text-xs font-mono px-2 py-1.5 rounded-sm border border-ghost bg-surface-lowest text-on-surface placeholder:text-outline resize-y leading-relaxed"
              />
            </label>
          )}

          <label className="block mb-3">
            <span className="text-[0.75rem] font-medium text-on-surface-variant block mb-1">Repo URL</span>
            <input
              type="url"
              value={repoUrl}
              onChange={(e) => { setRepoUrl(e.target.value); setMetadataDirty(true) }}
              placeholder="https://github.com/..."
              className="w-full text-xs font-mono px-2 py-1.5 rounded-sm border border-ghost bg-surface-lowest text-on-surface placeholder:text-outline"
            />
          </label>

          <label className="block mb-3">
            <span className="text-[0.75rem] font-medium text-on-surface-variant block mb-1">Project URL</span>
            <input
              type="url"
              value={projectUrl}
              onChange={(e) => { setProjectUrl(e.target.value); setMetadataDirty(true) }}
              placeholder="https://example.com"
              className="w-full text-xs font-mono px-2 py-1.5 rounded-sm border border-ghost bg-surface-lowest text-on-surface placeholder:text-outline"
            />
          </label>

          <div className="mb-2">
            <span className="text-[0.75rem] font-medium text-on-surface-variant block mb-1">Screenshot</span>
            {screenshotPreview ? (
              <div className="relative rounded-sm overflow-hidden border border-ghost">
                <img
                  src={screenshotPreview.startsWith('data:') ? screenshotPreview : screenshotPreview.startsWith('/') ? screenshotPreview : `data:image/png;base64,${screenshotPreview}`}
                  alt="Project screenshot"
                  className="w-full h-auto max-h-32 object-cover object-top"
                />
                <button
                  type="button"
                  onClick={() => { setScreenshotPreview(null); setMetadataDirty(true) }}
                  className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white text-[10px] flex items-center justify-center hover:bg-black/80"
                >
                  &times;
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <button
                  type="button"
                  onClick={() => screenshotInputRef.current?.click()}
                  className="text-xs font-mono text-primary hover:underline text-left"
                >
                  Upload image...
                </button>
                {projectUrl && (
                  <button
                    type="button"
                    onClick={async () => {
                      if (!dirName) return
                      setScreenshotCapturing(true)
                      const slug = project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
                      try {
                        const result = await captureScreenshotFromUrl(dirName, slug, projectUrl)
                        if (result.ok && result.preview) {
                          setScreenshotPreview(result.preview)
                          setMetadataDirty(true)
                        }
                      } catch { /* non-fatal */ }
                      finally { setScreenshotCapturing(false) }
                    }}
                    disabled={screenshotCapturing}
                    className="text-xs font-mono text-primary hover:underline text-left"
                  >
                    {screenshotCapturing ? 'Capturing...' : 'Auto-capture from URL'}
                  </button>
                )}
              </div>
            )}
            <input
              ref={screenshotInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (!file) return
                const reader = new FileReader()
                reader.onload = () => { setScreenshotPreview(reader.result as string); setMetadataDirty(true) }
                reader.readAsDataURL(file)
              }}
            />
          </div>

          {metadataDirty && (
            <div className="text-[9px] font-mono text-outline mt-2">Saving...</div>
          )}
        </div>

        {/* Embed snippets — always available, published formats shown when uploaded */}
        <div className="mt-6 pt-4 border-t border-ghost">
          <button
            onClick={() => setEmbedOpen(!embedOpen)}
            className="flex items-center justify-between w-full text-left"
          >
            <span className="font-mono text-[9px] uppercase tracking-wider text-outline">Embed</span>
            <span className="text-[10px] text-outline">{embedOpen ? '−' : '+'}</span>
          </button>
          {embedOpen && (() => {
            const slug = (projectTitle || project.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || dirName
            const base = authUsername ? `https://heyi.am/${authUsername}/${slug}` : null
            const isPublished = project.isUploaded && base

            // Static HTML (always available)
            const durationStr = project.totalDuration >= 60 ? `${Math.round(project.totalDuration / 60)}h` : `${project.totalDuration}m`
            const locStr = project.totalLoc >= 1000 ? `${(project.totalLoc / 1000).toFixed(1)}k` : String(project.totalLoc)
            const staticHtml = `<div style="font-family:ui-monospace,monospace;background:#0a0a0f;color:#e5e7eb;padding:16px 20px;border-radius:6px">
  <div style="font-size:15px;font-weight:600;color:#f9fafb;margin-bottom:12px">${projectTitle || project.name}</div>
  <div style="display:flex;gap:20px;flex-wrap:wrap">
    <div><div style="font-size:18px;font-weight:700;color:#f9fafb">${project.sessionCount}</div><div style="font-size:10px;color:#6b7280;text-transform:uppercase">Sessions</div></div>
    <div><div style="font-size:18px;font-weight:700;color:#f9fafb">${locStr}</div><div style="font-size:10px;color:#6b7280;text-transform:uppercase">Lines Changed</div></div>
    <div><div style="font-size:18px;font-weight:700;color:#f9fafb">${durationStr}</div><div style="font-size:10px;color:#6b7280;text-transform:uppercase">Active Time</div></div>
  </div>
</div>`

            const snippets = [
              { label: 'Badge', desc: 'GitHub, markdown', code: base ? `[![heyi.am](${base}/embed.svg)](${base})` : `[![heyi.am](https://heyi.am/${slug}/embed.svg)](https://heyi.am/${slug})` },
              { label: 'Widget', desc: 'Personal site', code: `<div class="heyiam-embed" data-username="${authUsername || 'your-username'}" data-project="${slug}"></div>\n<script src="https://heyi.am/embed.js"></script>` },
              { label: 'iframe', desc: 'Any site', code: `<iframe src="${base || `https://heyi.am/${slug}`}/embed?sections=stats,skills" width="480" height="200" frameborder="0"></iframe>` },
              { label: 'HTML', desc: 'No JS needed', code: staticHtml },
            ]

            const copy = (code: string, label: string) => {
              navigator.clipboard.writeText(code).then(() => {
                setEmbedCopied(label)
                setTimeout(() => setEmbedCopied(null), 2000)
              })
            }
            return (
              <div className="mt-2 space-y-2">
                {!isPublished && (
                  <div className="text-[10px] text-on-surface-variant mb-1">Badge, widget, and iframe will work after publishing.</div>
                )}
                {snippets.map((s) => (
                  <div key={s.label}>
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-[10px] text-on-surface-variant"><strong>{s.label}</strong> <span className="text-outline">{s.desc}</span></span>
                      <button onClick={() => copy(s.code, s.label)} className="text-[10px] text-primary hover:underline">
                        {embedCopied === s.label ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                    <pre className="text-[10px] font-mono bg-surface-lowest border border-ghost rounded-sm px-2 py-1.5 overflow-x-auto text-on-surface-variant whitespace-pre-wrap break-all">{s.code}</pre>
                  </div>
                ))}
              </div>
            )
          })()}
        </div>
      </aside>

      {/* Main content — Liquid-rendered template preview */}
      <div className={`relative min-h-0 overflow-y-auto ${templateMode === 'dark' ? 'p-0' : 'p-6'}`} style={templateMode === 'dark' ? { background: '#000' } : undefined}>
        {renderHtml ? (
          <>
            {renderCss && <style>{scopeProjectCss(renderCss)}</style>}
            <div id="liquid-render" ref={liquidRef} />
          </>
        ) : renderError ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <span className="text-sm text-on-surface-variant">{renderError}</span>
            <button
              onClick={() => loadRender('editorial')}
              className="text-xs text-primary hover:underline"
            >
              Retry with editorial template
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-center py-16">
            <span className="text-sm text-on-surface-variant">Rendering template...</span>
          </div>
        )}

        {/* Session overlay — fills the main content area, not the whole viewport */}
        {selectedSession && dirName && (
          <SessionDetailOverlay
            session={selectedSession}
            projectDirName={dirName}
            onClose={() => setSelectedSession(null)}
            isDark={templateMode === 'dark'}
            onSessionUpdated={() => loadRender()}
          />
        )}
      </div>

      {/* Session management modal */}
      {sessionModalOpen && (
        <SessionManageModal
          sessions={sessions}
          initialSelection={new Set(detail.enhanceCache?.selectedSessionIds ?? [])}
          projectDirName={dirName!}
          onClose={() => setSessionModalOpen(false)}
          onSave={async (selected) => {
            await saveBoundaries(dirName!, { selectedSessionIds: [...selected] })
            setSessionModalOpen(false)
            // Refresh after modal is unmounted to avoid race condition
            const d = await fetchProjectDetail(dirName!)
            setDetail(d)
            if (d.enhanceCache?.result?.narrative) setNarrative(d.enhanceCache.result.narrative)
            loadRender()
          }}
          onSessionDeleted={async () => {
            // Refresh local detail so status badges + counts reflect the
            // removed session. Failures are non-fatal — the modal already
            // hides the row optimistically.
            try {
              const d = await fetchProjectDetail(dirName!)
              setDetail(d)
              loadRender()
            } catch { /* non-fatal */ }
          }}
        />
      )}

      {deleteProjectOpen && (
        <ConfirmModal
          title="Remove from heyi.am"
          message="Delete this project and all its sessions from heyi.am? This can't be undone."
          details="Your local archived sessions stay on disk — only the remote copy is removed."
          confirmLabel="Remove"
          destructive
          busy={deleteProjectBusy}
          error={deleteProjectError}
          onCancel={() => { if (!deleteProjectBusy) { setDeleteProjectOpen(false); setDeleteProjectError(null) } }}
          onConfirm={async () => {
            setDeleteProjectBusy(true)
            setDeleteProjectError(null)
            try {
              await deleteProjectRemote(dirName!)
              setDeleteProjectOpen(false)
              const d = await fetchProjectDetail(dirName!)
              setDetail(d)
              loadRender()
            } catch (err) {
              setDeleteProjectError((err as Error).message)
            } finally {
              setDeleteProjectBusy(false)
            }
          }}
        />
      )}
    </div>
  )
}
