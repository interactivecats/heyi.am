import { useEffect, useState, useCallback, useRef } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  fetchProjectDetail,
  fetchGitRemote,
  saveProjectEnhanceLocally,
  captureScreenshotFromUrl,
  type ProjectDetail as ProjectDetailType,
  type Session,
} from '../api'
import { Card, Note, SectionHeader, StatCard } from './shared'
import { LayoutThemePicker } from './LayoutThemePicker'
import { Chip } from './shared/Chip'
import { WorkTimeline } from './WorkTimeline'
import { GrowthChart } from './GrowthChart'
import { SessionDetailOverlay } from './SessionDetailOverlay'

function formatDuration(minutes: number): string {
  const hours = minutes / 60
  return hours >= 1 ? `${hours.toFixed(1)}h` : `${Math.round(minutes)}m`
}

function formatLoc(loc: number): string {
  return loc >= 1000 ? `${(loc / 1000).toFixed(1)}k` : String(loc)
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(0)}k`
  return String(tokens)
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch { return iso }
}

function timeSince(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const hours = Math.floor(diff / 3600000)
  if (hours < 1) return 'just now'
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

const DURATION_COLORS = ['bg-primary', 'bg-green', 'bg-violet'] as const

function ProjectHero({
  narrative,
  screenshotSrc,
  projectName,
  humanTime,
  agentTime,
  stats,
}: {
  narrative: string
  screenshotSrc?: string
  projectName: string
  humanTime: string
  agentTime?: string
  stats: Array<{ label: string; value: string | number }>
}) {
  const multiplier = agentTime ? (parseFloat(agentTime) / parseFloat(humanTime)) : undefined
  const multiplierStr = multiplier && multiplier > 1 ? `${multiplier.toFixed(1)}x` : undefined

  return (
    <div className="flex flex-col gap-4 mb-4">
      {screenshotSrc && (
        <div className="rounded-md border border-ghost overflow-hidden shadow-sm">
          {/* Browser chrome */}
          <div className="flex items-center gap-1.5 px-3 py-2 bg-surface-low border-b border-ghost">
            <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
          </div>
          {/* Screenshot viewport — scrollable like a real browser */}
          <div className="max-h-96 overflow-y-auto">
            <img
              src={screenshotSrc}
              alt={`${projectName} screenshot`}
              className="w-full h-auto"
            />
          </div>
        </div>
      )}

      {narrative && (
        <Card>
          <SectionHeader title="Narrative summary" meta="editable" />
          <p
            className="leading-relaxed text-on-surface border-l-[3px] border-primary pl-3"
            style={{ fontSize: 'clamp(0.8125rem, 1.2vw, 1rem)' }}
          >
            {narrative}
          </p>
        </Card>
      )}

      {/* Stats: hero time card + compact grid */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr] gap-3">
        {/* Hero: time + efficiency */}
        <div className="bg-surface-lowest border border-ghost rounded-md p-4 flex flex-col justify-between">
          <div>
            <div className="font-mono text-[9px] uppercase tracking-wider text-on-surface-variant mb-1">
              {agentTime ? 'Human / Agents' : 'Time'}
            </div>
            <div className="font-display font-bold text-on-surface text-2xl">
              {agentTime ? `${humanTime} / ${agentTime}` : humanTime}
            </div>
          </div>
          {multiplierStr && (
            <div className="mt-2 pt-2 border-t border-ghost">
              <div className="font-mono text-[9px] uppercase tracking-wider text-on-surface-variant mb-0.5">
                Efficiency multiplier
              </div>
              <div className="font-display font-bold text-on-surface text-lg">
                {multiplierStr}
              </div>
            </div>
          )}
        </div>

        {/* Compact stats grid */}
        <div className="grid grid-cols-2 sm:grid-cols-2 gap-3">
          {stats.map((s) => (
            <StatCard key={s.label} label={s.label} value={s.value} />
          ))}
        </div>
      </div>
    </div>
  )
}

export function ProjectDetail() {
  const { dirName } = useParams<{ dirName: string }>()
  const [detail, setDetail] = useState<ProjectDetailType | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedSession, setSelectedSession] = useState<Session | null>(null)

  // Project metadata fields
  const [projectTitle, setProjectTitle] = useState('')
  const [repoUrl, setRepoUrl] = useState('')
  const [projectUrl, setProjectUrl] = useState('')
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null)
  const [screenshotCapturing, setScreenshotCapturing] = useState(false)
  const [projectLayout, setProjectLayout] = useState('classic')
  const [projectTheme, setProjectTheme] = useState('seal-blue')
  const [metadataDirty, setMetadataDirty] = useState(false)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const screenshotInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!dirName) return
    fetchProjectDetail(dirName)
      .then((d) => {
        setDetail(d)
        // Populate metadata from enhance cache
        if (d.enhanceCache?.title) setProjectTitle(d.enhanceCache.title)
        if (d.enhanceCache?.repoUrl) setRepoUrl(d.enhanceCache.repoUrl)
        if (d.enhanceCache?.projectUrl) setProjectUrl(d.enhanceCache.projectUrl)
        if (d.enhanceCache?.screenshotBase64) setScreenshotPreview(d.enhanceCache.screenshotBase64)
        if (d.enhanceCache?.layout) setProjectLayout(d.enhanceCache.layout)
        if (d.enhanceCache?.theme) setProjectTheme(d.enhanceCache.theme)
      })
      .catch(() => {})
      .finally(() => setLoading(false))

    // Auto-detect git remote
    fetchGitRemote(dirName).then(({ url }) => {
      if (url) setRepoUrl((prev) => prev || (url.startsWith('http') ? url : `https://${url}`))
    }).catch(() => {})
  }, [dirName])

  // Auto-save metadata on change (debounced)
  const saveMetadata = useCallback(() => {
    if (!dirName || !detail) return
    const cache = detail.enhanceCache
    saveProjectEnhanceLocally(
      dirName,
      cache?.selectedSessionIds ?? [],
      cache?.result ?? { narrative: '', arc: [], skills: [], timeline: [], questions: [] },
      { title: projectTitle || undefined, repoUrl: repoUrl || undefined, projectUrl: projectUrl || undefined, screenshotBase64: screenshotPreview ?? undefined, layout: projectLayout, theme: projectTheme },
    ).then(() => setMetadataDirty(false)).catch(() => {})
  }, [dirName, detail, projectTitle, repoUrl, projectUrl, screenshotPreview, projectLayout, projectTheme])

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

  const { project, sessions, enhanceCache } = detail
  const cache = enhanceCache ?? null
  const narrative = cache?.result?.narrative ?? project.description
  const phases = cache?.result?.arc ?? []
  const tools = [...new Set(sessions.map((s) => s.source ?? 'unknown'))]
  const screenshotSrc = cache?.screenshotBase64
    ? `data:image/png;base64,${cache.screenshotBase64}`
    : undefined

  // Build key moments from enhance cache timeline (featured sessions)
  const keyMoments: Array<{ sessionId: string; label: string }> = []
  const featuredSessionIds = new Set<string>()
  if (cache?.result?.timeline) {
    for (const period of cache.result.timeline) {
      for (const s of period.sessions) {
        if (s.featured) {
          featuredSessionIds.add(s.sessionId)
          if (s.tag) {
            keyMoments.push({ sessionId: s.sessionId, label: s.tag })
          } else {
            keyMoments.push({ sessionId: s.sessionId, label: s.title.slice(0, 18) })
          }
        }
      }
    }
  }

  // Pick best sessions for the featured grid:
  // 1. Sessions marked featured in enhance cache timeline
  // 2. Enhanced sessions (have real titles/data)
  // 3. Most recent sessions as fallback
  const featuredSessions = (() => {
    // First: sessions flagged as featured in the enhance cache
    const featured = sessions.filter(s => featuredSessionIds.has(s.id))
    if (featured.length >= 6) return featured.slice(0, 6)

    // Then: enhanced sessions (status !== 'draft')
    const enhanced = sessions.filter(s => s.status === 'enhanced' || s.status === 'uploaded')
    const rest = sessions.filter(s => s.status === 'draft' && !featuredSessionIds.has(s.id))

    // Combine: featured first, then enhanced by LOC desc, then recent
    const combined = [
      ...featured,
      ...enhanced.filter(s => !featuredSessionIds.has(s.id))
        .sort((a, b) => b.linesOfCode - a.linesOfCode),
      ...rest,
    ]

    // Deduplicate
    const seen = new Set<string>()
    return combined.filter(s => {
      if (seen.has(s.id)) return false
      seen.add(s.id)
      return true
    }).slice(0, 6)
  })()

  return (
    <div className="grid grid-cols-[240px_1fr] min-h-[calc(100vh-48px)]">
      {/* Sidebar */}
      <aside className="border-r border-ghost bg-surface-low p-4 overflow-y-auto">

        {/* 1. Project links + screenshot (top) */}
        <div className="mb-4">
          <div className="font-mono text-[9px] uppercase tracking-wider text-outline mb-3">Project links</div>
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
                  src={screenshotPreview.startsWith('data:') ? screenshotPreview : `data:image/png;base64,${screenshotPreview}`}
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
        </div>

        {/* 2. Theme + Layout picker */}
        <div className="mb-4 pt-4 border-t border-ghost">
          <LayoutThemePicker
            layout={projectLayout}
            theme={projectTheme}
            onLayoutChange={(l) => { setProjectLayout(l); setMetadataDirty(true) }}
            onThemeChange={(t) => { setProjectTheme(t); setMetadataDirty(true) }}
          />
        </div>

        {/* 3. Source mix + Status */}
        <div className="pt-4 border-t border-ghost">
          <div className="mb-3">
            <div className="font-mono text-[9px] uppercase tracking-wider text-outline mb-1.5">Source mix</div>
            <div className="flex flex-wrap gap-1">
              {tools.map((t) => (
                <Chip key={t}>{t}</Chip>
              ))}
            </div>
          </div>
          <div className="mb-3">
            <div className="font-mono text-[9px] uppercase tracking-wider text-outline mb-1.5">Status</div>
            <div className="flex flex-wrap gap-1">
              <Chip variant="primary">{project.enhancedAt ? 'Refined' : 'Unrefined'}</Chip>
              <Chip variant="green">{project.isUploaded ? 'Uploaded' : 'Local only'}</Chip>
            </div>
          </div>
        </div>

        {metadataDirty && (
          <div className="text-[9px] font-mono text-outline mt-2">Saving...</div>
        )}
      </aside>

      {/* Main content — data-template drives CSS theme overrides */}
      <main
        className="p-6 overflow-y-auto max-w-[1200px] mx-auto"
        data-template={{ 'seal-blue': 'editorial', 'warm-stone': 'minimal', 'ember': 'kinetic', 'matrix': 'terminal', 'midnight': 'kinetic', 'twilight': 'editorial' }[projectTheme] ?? 'editorial'}
      >
        <div className="flex items-center justify-between mb-1">
          <div>
            <input
              type="text"
              value={projectTitle}
              placeholder={project.name}
              onChange={(e) => { setProjectTitle(e.target.value); setMetadataDirty(true) }}
              className="font-display text-xl font-bold text-on-surface bg-transparent border-none outline-none w-full hover:bg-surface-low focus:bg-surface-low rounded px-1 -ml-1 transition-colors placeholder:text-on-surface-variant/50"
            />
            <span className="text-on-surface-variant text-[0.8125rem]">
              {project.dateRange
                ? typeof project.dateRange === 'string'
                  ? project.dateRange
                  : `${formatDate(project.dateRange.start)} – ${formatDate(project.dateRange.end)}`
                : ''}
              {project.enhancedAt && ` · last refined ${timeSince(project.enhancedAt)}`}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Chip variant="primary">{project.sessionCount} sessions</Chip>
          </div>
        </div>
        {/* Project links */}
        {(repoUrl || projectUrl) && (
          <div className="flex items-center gap-4 mt-1 mb-1">
            {repoUrl && (
              <a
                href={repoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-xs text-primary hover:underline flex items-center gap-1"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
                {repoUrl.replace(/^https?:\/\/(www\.)?/, '').replace(/\.git$/, '')}
              </a>
            )}
            {projectUrl && (
              <a
                href={projectUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-xs text-primary hover:underline flex items-center gap-1"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M6.5 10.5l3-3m-1.5-2a2.5 2.5 0 013.54 3.54l-1.5 1.5m-4.08-1.08a2.5 2.5 0 01-3.54-3.54l1.5-1.5"/></svg>
                {projectUrl.replace(/^https?:\/\/(www\.)?/, '')}
              </a>
            )}
          </div>
        )}
        <div className="h-4" />

        {/* Narrative + Stats beside Screenshot */}
        <ProjectHero
          narrative={narrative}
          screenshotSrc={
            screenshotPreview
              ? (screenshotPreview.startsWith('data:') ? screenshotPreview : `data:image/png;base64,${screenshotPreview}`)
              : screenshotSrc
          }
          projectName={project.name}
          humanTime={formatDuration(project.totalDuration)}
          agentTime={project.totalAgentDuration ? formatDuration(project.totalAgentDuration) : undefined}
          stats={[
            { label: 'Sessions', value: project.sessionCount },
            { label: 'Lines changed', value: formatLoc(project.totalLoc) },
            { label: 'Files', value: project.totalFiles },
            ...((project.totalInputTokens || project.totalOutputTokens)
              ? [{ label: 'Tokens', value: formatTokens((project.totalInputTokens ?? 0) + (project.totalOutputTokens ?? 0)) }]
              : []),
          ]}
        />

        {/* Work Timeline — full agent visualization */}
        <Card className="mb-4">
          <SectionHeader title="Work timeline" meta="sessions over time" />
          <WorkTimeline sessions={sessions} maxHeight={300} />
        </Card>

        {/* Growth Chart — with v3-style annotations */}
        <Card className="mb-4">
          <SectionHeader title="Project growth" meta="lines changed" />
          <GrowthChart
            sessions={sessions}
            totalLoc={project.totalLoc}
            totalFiles={project.totalFiles}
            keyMoments={keyMoments}
          />
        </Card>

        {/* Key decisions + Source breakdown */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <Card>
            <SectionHeader title="Key decisions" meta="signal" />
            <div className="flex flex-col gap-3">
              {phases.length > 0 ? (
                phases.slice(0, 3).map((phase) => (
                  <Note key={phase.phase} title={phase.title}>{phase.description}</Note>
                ))
              ) : (
                <Note>Enhance this project to extract key decisions.</Note>
              )}
            </div>
          </Card>
          <Card>
            <SectionHeader title="Source breakdown" meta="provenance" />
            <SourceTable sessions={sessions} />
          </Card>
        </div>

        {/* Project phases */}
        {phases.length > 0 && (
          <Card className="mb-4">
            <SectionHeader title="Project phases" meta="timeline" />
            <div className="relative pl-5">
              <div className="absolute left-1 top-1.5 bottom-1.5 w-0.5 bg-ghost rounded-full" />
              {phases.map((phase) => (
                <div key={phase.phase} className="relative pb-4 last:pb-0">
                  <div className="absolute -left-5 top-1.5 w-2 h-2 rounded-full bg-primary shadow-[0_0_0_3px_rgba(8,68,113,0.1)]" />
                  <div className="font-mono text-[0.6875rem] uppercase tracking-wider text-on-surface-variant">
                    {phase.title}
                  </div>
                  <Note>
                    <span className="text-on-surface-variant">{phase.description}</span>
                  </Note>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Featured sessions — card grid */}
        <Card>
          <SectionHeader title="Featured sessions">
            <Link
              to={`/project/${encodeURIComponent(dirName ?? '')}/sessions`}
              className="font-mono text-[11px] text-primary hover:underline"
            >
              All {sessions.length} sessions →
            </Link>
          </SectionHeader>
          <div className="grid grid-cols-2 gap-3">
            {featuredSessions.map((s, i) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSelectedSession(s)}
                className="text-left bg-surface-lowest border border-ghost rounded-sm p-4 cursor-pointer transition-shadow hover:shadow-md"
              >
                <div className={`h-1 rounded-full mb-3 ${DURATION_COLORS[i % DURATION_COLORS.length]}`} />
                <h4 className="font-display text-[0.8125rem] font-semibold text-on-surface mb-1 line-clamp-2">
                  {s.title}
                </h4>
                <span className="text-on-surface-variant text-xs">
                  {formatDuration(s.durationMinutes)} · {s.turns} turns · {formatLoc(s.linesOfCode)} lines
                </span>
                {s.skills?.[0] && (
                  <div className="mt-2">
                    <Chip variant="violet">{s.skills[0]}</Chip>
                  </div>
                )}
              </button>
            ))}
          </div>
        </Card>
      </main>

      {/* Session overlay */}
      {selectedSession && dirName && (
        <SessionDetailOverlay
          session={selectedSession}
          projectDirName={dirName}
          onClose={() => setSelectedSession(null)}
        />
      )}
    </div>
  )
}

function SourceTable({ sessions }: { sessions: Session[] }) {
  const counts = sessions.reduce<Record<string, number>>((acc, s) => {
    acc[s.source ?? 'unknown'] = (acc[s.source ?? 'unknown'] ?? 0) + 1
    return acc
  }, {})

  return (
    <table className="w-full border-collapse text-[0.8125rem]">
      <thead>
        <tr>
          <th className="text-left py-2 font-mono text-[9px] uppercase tracking-wider text-outline border-b border-ghost">Source</th>
          <th className="text-left py-2 font-mono text-[9px] uppercase tracking-wider text-outline border-b border-ghost">Count</th>
        </tr>
      </thead>
      <tbody>
        {Object.entries(counts).map(([tool, count]) => (
          <tr key={tool}>
            <td className="py-2 border-b border-ghost">{tool}</td>
            <td className="py-2 border-b border-ghost">{count}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
