import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { fetchSessionById, fetchSessionContext, type Session } from '../api'
import { Card, Chip, StatCard, SectionHeader } from './shared'

type ContextFormat = 'compact' | 'summary' | 'full'

function formatDuration(minutes: number): string {
  const hours = minutes / 60
  return hours >= 1 ? `${hours.toFixed(1)}h` : `${Math.round(minutes)}m`
}

function formatLoc(loc: number): string {
  return loc >= 1000 ? `${(loc / 1000).toFixed(1)}k` : String(loc)
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export function SessionView() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()

  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Context export state
  const [contextOpen, setContextOpen] = useState(false)
  const [copying, setCopying] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    if (!sessionId) return
    setLoading(true)
    fetchSessionById(sessionId)
      .then(setSession)
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false))
  }, [sessionId])

  // Dismiss toast after 3s
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(timer)
  }, [toast])

  async function copyContext(format: ContextFormat) {
    if (!sessionId || copying) return
    setCopying(true)
    setContextOpen(false)
    try {
      const data = await fetchSessionContext(sessionId, format)
      await navigator.clipboard.writeText(data.content)
      setToast(`Session context copied (${data.tokens.toLocaleString()} tokens)`)
    } catch {
      setToast('Failed to copy context')
    } finally {
      setCopying(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-mid">
        <span className="text-sm text-on-surface-variant">Loading session...</span>
      </div>
    )
  }

  if (error || !session) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-surface-mid gap-3">
        <span className="text-sm text-on-surface-variant">{error ?? 'Session not found.'}</span>
        <button
          onClick={() => navigate(-1)}
          className="text-xs text-primary hover:underline cursor-pointer"
        >
          Go back
        </button>
      </div>
    )
  }

  const filesChanged = session.filesChanged ?? []
  const toolBreakdown = session.toolBreakdown ?? []
  const executionPath = session.executionPath ?? []
  const maxToolCount = Math.max(...toolBreakdown.map((t) => t.count), 1)

  return (
    <div className="min-h-screen bg-surface-mid">
      {/* Header bar */}
      <header className="sticky top-0 z-50 bg-surface-lowest border-b border-ghost">
        <div className="flex items-center justify-between h-12 px-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="text-sm text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
            >
              &larr; Back
            </button>
            <span className="text-outline text-xs">/</span>
            <span className="font-display text-sm font-semibold text-on-surface truncate max-w-md">
              {session.title}
            </span>
          </div>

          {/* Copy for AI context */}
          <div className="relative">
            <button
              onClick={() => setContextOpen(!contextOpen)}
              disabled={copying}
              className="inline-flex items-center gap-1.5 font-semibold text-[0.8125rem] px-3.5 py-1.5 rounded-sm bg-primary text-on-primary hover:bg-primary-hover transition-colors cursor-pointer disabled:opacity-50"
            >
              {copying ? 'Copying...' : 'Copy for AI context'}
            </button>
            {contextOpen && (
              <div className="absolute right-0 top-full mt-1 bg-surface-lowest border border-ghost rounded-md shadow-lg z-50 py-1 min-w-[160px]">
                {(['compact', 'summary', 'full'] as const).map((fmt) => (
                  <button
                    key={fmt}
                    onClick={() => copyContext(fmt)}
                    className="w-full text-left px-3 py-1.5 text-sm text-on-surface hover:bg-surface-low transition-colors cursor-pointer"
                  >
                    <span className="font-semibold capitalize">{fmt}</span>
                    <span className="text-on-surface-variant text-xs ml-1.5">
                      {fmt === 'compact' ? '~500 tokens' : fmt === 'summary' ? '~2k tokens' : '~5k tokens'}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 right-4 z-50 bg-surface-dark text-on-primary font-mono text-xs px-4 py-2.5 rounded-md shadow-lg">
          {toast}
        </div>
      )}

      <div className="p-6 max-w-3xl mx-auto">
        {/* Title */}
        <h1 className="font-display text-xl font-bold text-on-surface mb-1">{session.title}</h1>

        {/* Metadata chips */}
        <div className="flex flex-wrap items-center gap-1.5 mb-4">
          {session.source && <Chip>{session.source}</Chip>}
          <Chip>{formatDate(session.date)}</Chip>
          {session.projectName && <Chip variant="primary">{session.projectName}</Chip>}
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-4 gap-3 mb-4">
          <StatCard label="Duration" value={formatDuration(session.durationMinutes)} />
          <StatCard label="Turns" value={session.turns} />
          <StatCard label="Files" value={filesChanged.length} />
          <StatCard label="LOC" value={formatLoc(session.linesOfCode)} />
        </div>

        {/* Skills */}
        {session.skills && session.skills.length > 0 && (
          <div className="mb-4">
            <div className="font-mono text-[9px] uppercase tracking-wider text-on-surface-variant mb-1.5">Skills</div>
            <div className="flex flex-wrap gap-1">
              {session.skills.map((sk) => (
                <Chip key={sk} variant="violet">{sk}</Chip>
              ))}
            </div>
          </div>
        )}

        {/* Context block */}
        {session.context && (
          <Card className="mb-4">
            <SectionHeader title="Context" />
            <p className="text-[0.8125rem] leading-relaxed text-on-surface-variant bg-surface-low rounded-sm p-3">
              {session.context}
            </p>
          </Card>
        )}

        {/* Execution path */}
        {executionPath.length > 0 && (
          <Card className="mb-4">
            <SectionHeader title="Execution path" meta={`${executionPath.length} steps`} />
            <div className="relative pl-5">
              <div className="absolute left-1 top-1.5 bottom-1.5 w-0.5 bg-ghost rounded-full" />
              {executionPath.map((step) => (
                <div key={step.stepNumber} className="relative pb-4 last:pb-0">
                  <div className="absolute -left-5 top-1.5 w-2 h-2 rounded-full bg-primary shadow-[0_0_0_3px_rgba(8,68,113,0.1)]" />
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-outline">{step.stepNumber}</span>
                    <span className="font-display text-[0.8125rem] font-semibold text-on-surface">
                      {step.title}
                    </span>
                    {step.type && <Chip>{step.type}</Chip>}
                  </div>
                  <p className="text-xs text-on-surface-variant mt-0.5 ml-5">{step.description}</p>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Tool breakdown */}
        {toolBreakdown.length > 0 && (
          <Card className="mb-4">
            <SectionHeader title="Tool breakdown" meta={`${toolBreakdown.reduce((a, t) => a + t.count, 0)} calls`} />
            <div className="flex flex-col gap-2">
              {toolBreakdown
                .sort((a, b) => b.count - a.count)
                .map((t) => (
                  <div key={t.tool} className="flex items-center gap-3">
                    <span className="font-mono text-[11px] text-on-surface-variant w-28 truncate shrink-0">
                      {t.tool}
                    </span>
                    <div className="flex-1 h-4 bg-surface-low rounded-sm overflow-hidden">
                      <div
                        className="h-full bg-primary/20 rounded-sm"
                        style={{ width: `${(t.count / maxToolCount) * 100}%` }}
                      />
                    </div>
                    <span className="font-mono text-[11px] text-outline w-8 text-right shrink-0">
                      {t.count}
                    </span>
                  </div>
                ))}
            </div>
          </Card>
        )}

        {/* Files changed */}
        {filesChanged.length > 0 && (
          <Card className="mb-4">
            <SectionHeader title="Files changed" meta={`${filesChanged.length} files`} />
            <div className="flex flex-col divide-y divide-ghost">
              {filesChanged.map((f) => (
                <div key={f.path} className="flex items-center justify-between py-2">
                  <span className="font-mono text-xs text-on-surface truncate flex-1 mr-3">{f.path}</span>
                  <div className="flex items-center gap-2 font-mono text-[11px] shrink-0">
                    {f.additions > 0 && <span className="text-green">+{f.additions}</span>}
                    {f.deletions > 0 && <span className="text-error">-{f.deletions}</span>}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}
