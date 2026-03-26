import { useEffect, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import {
  fetchSessionById,
  fetchSessionContext,
  fetchTranscript,
  type Session,
  type TranscriptMessage,
} from '../api'
import { Card, Chip, StatCard, SectionHeader } from './shared'
import { SessionTranscript } from './SessionTranscript'

type ContextFormat = 'compact' | 'summary' | 'full'
type ViewTab = 'transcript' | 'overview'

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
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  const initialSearchQuery = searchParams.get('q') ?? ''

  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Transcript state
  const [transcriptMessages, setTranscriptMessages] = useState<TranscriptMessage[]>([])
  const [transcriptLoading, setTranscriptLoading] = useState(false)

  // Tab state
  const [activeTab, setActiveTab] = useState<ViewTab>('transcript')

  // Context export state
  const [contextOpen, setContextOpen] = useState(false)
  const [copying, setCopying] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  // Download state
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    if (!sessionId) return
    setLoading(true)
    fetchSessionById(sessionId)
      .then(setSession)
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false))
  }, [sessionId])

  // Load transcript when tab is active
  useEffect(() => {
    if (!sessionId || activeTab !== 'transcript' || transcriptMessages.length > 0) return
    setTranscriptLoading(true)
    fetchTranscript(sessionId)
      .then((data) => setTranscriptMessages(data.messages))
      .catch(() => {
        // Fall back to overview if transcript fails
        setActiveTab('overview')
      })
      .finally(() => setTranscriptLoading(false))
  }, [sessionId, activeTab, transcriptMessages.length])

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

  async function handleDownloadSummary() {
    if (!sessionId || downloading) return
    setDownloading(true)
    try {
      const data = await fetchSessionContext(sessionId, 'summary')
      const blob = new Blob([data.content], { type: 'text/markdown' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `session-${sessionId.slice(0, 8)}.md`
      a.click()
      URL.revokeObjectURL(url)
      setToast(`Downloaded summary (${data.tokens.toLocaleString()} tokens)`)
    } catch {
      setToast('Failed to download summary')
    } finally {
      setDownloading(false)
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
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => navigate(-1)}
              className="text-sm text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer shrink-0"
            >
              &larr; Back
            </button>
            <span className="text-outline text-xs shrink-0">/</span>
            <span className="font-display text-sm font-semibold text-on-surface truncate">
              {session.title}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Download summary */}
            <button
              onClick={handleDownloadSummary}
              disabled={downloading}
              className="inline-flex items-center gap-1.5 text-[0.8125rem] px-3 py-1.5 rounded-sm border border-ghost text-on-surface-variant hover:text-on-surface hover:border-outline transition-colors cursor-pointer disabled:opacity-50"
            >
              {downloading ? 'Downloading...' : '↓ Summary'}
            </button>

            {/* Copy for AI context */}
            <div className="relative">
              <button
                onClick={() => setContextOpen(!contextOpen)}
                disabled={copying}
                className="inline-flex items-center gap-1.5 font-semibold text-[0.8125rem] px-3.5 py-1.5 rounded-sm bg-primary text-on-primary hover:bg-primary-hover transition-colors cursor-pointer disabled:opacity-50"
              >
                {copying ? 'Copying...' : 'Copy for AI'}
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
                        {fmt === 'compact' ? '~500 tokens' : fmt === 'summary' ? '~2k tokens' : '~5k+ tokens'}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
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
        {/* Title + meta */}
        <h1 className="font-display text-xl font-bold text-on-surface mb-1">{session.title}</h1>
        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          {session.source && <Chip>{session.source}</Chip>}
          <Chip>{formatDate(session.date)}</Chip>
          {session.projectName && <Chip variant="primary">{session.projectName}</Chip>}
        </div>

        {/* Compact stats row */}
        <div className="flex items-center gap-4 font-mono text-[11px] text-on-surface-variant mb-4">
          <span>{formatDuration(session.durationMinutes)} active</span>
          <span className="text-ghost">|</span>
          <span>{session.turns} turns</span>
          <span className="text-ghost">|</span>
          <span>{filesChanged.length} files</span>
          <span className="text-ghost">|</span>
          <span>{formatLoc(session.linesOfCode)} LOC</span>
          {session.skills && session.skills.length > 0 && (
            <>
              <span className="text-ghost">|</span>
              <span className="flex gap-1">
                {session.skills.slice(0, 5).map((sk) => (
                  <Chip key={sk} variant="violet">{sk}</Chip>
                ))}
                {session.skills.length > 5 && (
                  <span className="text-outline">+{session.skills.length - 5}</span>
                )}
              </span>
            </>
          )}
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-0 border-b border-ghost mb-4">
          <TabButton
            active={activeTab === 'transcript'}
            onClick={() => setActiveTab('transcript')}
            label="Transcript"
            count={transcriptMessages.length > 0 ? transcriptMessages.length : undefined}
          />
          <TabButton
            active={activeTab === 'overview'}
            onClick={() => setActiveTab('overview')}
            label="Overview"
          />
        </div>

        {/* Tab content */}
        {activeTab === 'transcript' ? (
          transcriptLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="flex items-center gap-3">
                <span className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <span className="text-sm text-on-surface-variant">Loading transcript...</span>
              </div>
            </div>
          ) : (
            <SessionTranscript
              messages={transcriptMessages}
              initialSearchQuery={initialSearchQuery}
            />
          )
        ) : (
          <OverviewTab
            session={session}
            filesChanged={filesChanged}
            toolBreakdown={toolBreakdown}
            executionPath={executionPath}
            maxToolCount={maxToolCount}
          />
        )}
      </div>
    </div>
  )
}

// ── Tab button ──────────────────────────────────────────────

function TabButton({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean
  onClick: () => void
  label: string
  count?: number
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2.5 text-sm font-medium transition-colors cursor-pointer border-b-2 -mb-px ${
        active
          ? 'text-on-surface border-primary'
          : 'text-on-surface-variant border-transparent hover:text-on-surface hover:border-ghost'
      }`}
    >
      {label}
      {count !== undefined && count > 0 && (
        <span className="font-mono text-[10px] text-outline ml-1.5">{count}</span>
      )}
    </button>
  )
}

// ── Overview tab (original session view content) ────────────

function OverviewTab({
  session,
  filesChanged,
  toolBreakdown,
  executionPath,
  maxToolCount,
}: {
  session: Session
  filesChanged: Session['filesChanged'] & object[]
  toolBreakdown: Array<{ tool: string; count: number }>
  executionPath: Array<{ stepNumber: number; title: string; description: string; type?: string }>
  maxToolCount: number
}) {
  return (
    <>
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

      {/* Developer take */}
      {session.developerTake && (
        <Card className="mb-4">
          <SectionHeader title="Developer take" />
          <p className="text-[0.8125rem] leading-relaxed text-on-surface border-l-[3px] border-primary pl-3">
            {session.developerTake}
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

      {/* Q&A pairs */}
      {session.qaPairs && session.qaPairs.length > 0 && (
        <Card className="mb-4">
          <SectionHeader title="Questions & Answers" />
          {session.qaPairs.map((qa, i) => (
            <div key={i} className="py-3 border-b border-ghost last:border-b-0">
              <div className="font-semibold text-sm text-on-surface mb-1">{qa.question}</div>
              <div className="text-[0.8125rem] text-on-surface-variant leading-relaxed">{qa.answer}</div>
            </div>
          ))}
        </Card>
      )}
    </>
  )
}
