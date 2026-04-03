import { useEffect, useState, useCallback, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useParams } from 'react-router-dom'
import {
  fetchProjectDetail,
  fetchProjectRender,
  deleteProjectScreenshot,
  fetchGitRemote,
  saveProjectEnhanceLocally,
  captureScreenshotFromUrl,
  type ProjectDetail as ProjectDetailType,
  type Session,
} from '../api'
import { Note } from './shared'
import { Chip } from './shared/Chip'
import { WorkTimeline } from './WorkTimeline'
import { GrowthChart } from './GrowthChart'
import { SessionDetailOverlay } from './SessionDetailOverlay'
import { scopeTemplateCss, REVEAL_SELECTOR } from '../scopeCss'

/** Build a link element for DOM patching (safe — no innerHTML). */
function buildLinkEl(url: string, type: 'repo' | 'project'): HTMLAnchorElement {
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
      })
      .catch(() => {})
      .finally(() => setLoading(false))

    loadRender()

    fetchGitRemote(dirName).then(({ url }) => {
      if (url) setRepoUrl((prev) => prev || (url.startsWith('http') ? url : `https://${url}`))
    }).catch(() => {})
  }, [dirName, loadRender])

  // Inject server HTML into container via ref (not dangerouslySetInnerHTML).
  // This lets us patch the DOM for sidebar edits without React overwriting it.
  useEffect(() => {
    const container = liquidRef.current
    if (!renderHtml || !container) return
    container.innerHTML = renderHtml

    // Re-execute inline scripts (setting content via ref doesn't run <script> tags).
    // This activates template-specific animations (counters, scroll reveals).
    container.querySelectorAll('script').forEach((oldScript) => {
      const newScript = document.createElement('script')
      if (oldScript.src) {
        newScript.src = oldScript.src
      } else {
        newScript.textContent = oldScript.textContent ?? ''
      }
      oldScript.parentNode?.replaceChild(newScript, oldScript)
    })

    // Force-reveal animated elements that use IntersectionObserver + .visible class.
    // In the embedded React shell, viewport-based observers may not fire reliably.
    const timers: ReturnType<typeof setTimeout>[] = []
    const raf = requestAnimationFrame(() => {
      const animated = container.querySelectorAll(REVEAL_SELECTOR)
      animated.forEach((el, i) => {
        timers.push(setTimeout(() => {
          el.classList.add('visible')
          ;(el as HTMLElement).style.animationPlayState = 'running'
          ;(el as HTMLElement).style.opacity = '1'
        }, i * 50))
      })
    })
    return () => { cancelAnimationFrame(raf); timers.forEach(clearTimeout) }
  }, [renderHtml])

  // Intercept session card link clicks → open drawer instead of navigating away.
  // Session cards in Liquid templates are raw <a> tags that React Router doesn't manage.
  useEffect(() => {
    const container = liquidRef.current
    if (!container || !detail) return

    function handleClick(e: MouseEvent) {
      const anchor = (e.target as HTMLElement).closest('a[href]') as HTMLAnchorElement | null
      if (!anchor) return

      const href = anchor.getAttribute('href') ?? ''
      // Match session links: /session/:id or relative session/:id
      const match = href.match(/\/session\/(.+)$/)
      if (!match) return

      e.preventDefault()
      const sessionSlug = decodeURIComponent(match[1])
      const session = detail.sessions.find(
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

    for (const root of chartRootsRef.current) {
      root.unmount()
    }
    chartRootsRef.current = []

    const { sessions, project } = detail

    const isDark = templateMode === 'dark'

    container.querySelectorAll<HTMLElement>('[data-work-timeline]').forEach((el) => {
      const root = createRoot(el)
      chartRootsRef.current.push(root)
      root.render(
        <WorkTimeline
          sessions={sessions}
          onSessionClick={(s) => setSelectedSession(s)}
          accentColor={templateAccent}
          isDark={isDark}
        />,
      )
    })

    container.querySelectorAll<HTMLElement>('[data-growth-chart]').forEach((el) => {
      const root = createRoot(el)
      chartRootsRef.current.push(root)
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

    return () => {
      for (const root of chartRootsRef.current) {
        root.unmount()
      }
      chartRootsRef.current = []
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
        if (repoUrl) linksEl.appendChild(buildLinkEl(repoUrl, 'repo'))
        if (projectUrl) linksEl.appendChild(buildLinkEl(projectUrl, 'project'))
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
  }, [projectTitle, repoUrl, projectUrl, screenshotPreview, renderHtml])

  // Save metadata to disk (debounced) — no re-render needed, DOM patches are authoritative
  const saveMetadata = useCallback(() => {
    if (!dirName || !detail) return
    const cache = detail.enhanceCache
    saveProjectEnhanceLocally(
      dirName,
      cache?.selectedSessionIds ?? [],
      cache?.result ?? { narrative: '', arc: [], skills: [], timeline: [], questions: [] },
      { title: projectTitle || undefined, repoUrl: repoUrl || undefined, projectUrl: projectUrl || undefined, screenshotBase64: screenshotPreview ?? undefined },
    ).then(() => setMetadataDirty(false)).catch(() => {})
  }, [dirName, detail, projectTitle, repoUrl, projectUrl, screenshotPreview])

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
    <div className="grid grid-cols-[240px_1fr] min-h-[calc(100vh-48px)]">
      {/* Sidebar — editing controls */}
      <aside className="border-r border-ghost bg-surface-low p-4">
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
        </div>

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
      </aside>

      {/* Main content — Liquid-rendered template preview */}
      <div className="p-6 min-h-0" style={templateMode === 'dark' ? { background: '#000' } : undefined}>
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
      </div>

      {/* Session overlay */}
      {selectedSession && dirName && (
        <SessionDetailOverlay
          session={selectedSession}
          projectDirName={dirName}
          onClose={() => setSelectedSession(null)}
          isDark={templateMode === 'dark'}
        />
      )}
    </div>
  )
}
