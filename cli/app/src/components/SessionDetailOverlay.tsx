import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchSession } from '../api'
import type { Session } from '../types'
import { Chip } from './shared/Chip'
import { WorkTimeline } from './WorkTimeline'

interface SessionDetailOverlayProps {
  session: Session
  projectDirName: string
  onClose: () => void
}

function formatDuration(minutes: number): string {
  const hours = minutes / 60
  return hours >= 1 ? `${hours.toFixed(1)}h` : `${Math.round(minutes)}m`
}

function formatLoc(loc: number): string {
  return loc >= 1000 ? `${(loc / 1000).toFixed(1)}k` : String(loc)
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch { return iso }
}

export function SessionDetailOverlay({ session: initialSession, projectDirName, onClose }: SessionDetailOverlayProps) {
  const [session, setSession] = useState<Session>(initialSession)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    fetchSession(projectDirName, initialSession.id)
      .then((full) => setSession(full))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [projectDirName, initialSession.id])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  }, [onClose])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  const hasChildren = session.children && session.children.length > 0

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-[600px] max-w-full h-full bg-surface overflow-y-auto shadow-[-8px_0_32px_rgba(25,28,30,0.1)]">
        <div className="p-8">
          {/* Close + View full session */}
          <div className="flex items-center gap-3 mb-6">
            <button
              type="button"
              onClick={onClose}
              className="font-mono text-[0.8125rem] text-on-surface-variant bg-surface-low border border-surface-high rounded-md px-3 py-1 cursor-pointer hover:text-on-surface"
            >
              ESC · Close
            </button>
            <button
              type="button"
              onClick={() => {
                onClose()
                navigate(`/session/${encodeURIComponent(session.id)}`)
              }}
              className="font-mono text-[0.8125rem] text-primary bg-primary/5 border border-primary/20 rounded-md px-3 py-1 cursor-pointer hover:bg-primary/10 transition-colors"
            >
              View full session →
            </button>
          </div>

          {/* Title + meta */}
          <h2 className="font-display text-2xl font-bold text-on-surface mb-2">
            {session.title}
          </h2>
          <div className="font-mono text-[0.6875rem] uppercase tracking-wider text-on-surface-variant mb-4">
            {formatDate(session.date)}
            {session.source && ` · ${session.source}`}
            {session.context && ` · ${session.context}`}
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-4 gap-3 mb-5">
            <StatBox label="Active Time" value={formatDuration(session.durationMinutes)} primary>
              {hasChildren && <SplitLine you={formatDuration(Math.max(0, session.durationMinutes - session.children!.reduce((s, c) => s + c.durationMinutes, 0)))} agent={formatDuration(session.children!.reduce((s, c) => s + c.durationMinutes, 0))} />}
            </StatBox>
            <StatBox label="Turns" value={session.turns}>
              {hasChildren && <SplitLine you="You" agent={`${session.childCount ?? session.children!.length} agents`} />}
            </StatBox>
            <StatBox label="Files" value={session.filesChanged?.length === 1 && session.filesChanged[0]?.path === '(aggregate)' ? '—' : (session.filesChanged?.length ?? '—')} />
            <StatBox label="LOC" value={formatLoc(session.linesOfCode)}>
              {hasChildren && <SplitLine you={formatLoc(Math.max(0, session.linesOfCode - session.children!.reduce((s, c) => s + c.linesOfCode, 0)))} agent={formatLoc(session.children!.reduce((s, c) => s + c.linesOfCode, 0))} />}
            </StatBox>
          </div>

          {/* Developer take */}
          {session.developerTake && (
            <p className="text-[0.9375rem] leading-relaxed text-on-surface border-l-[3px] border-primary pl-3 mb-5">
              {session.developerTake}
            </p>
          )}

          {/* Skills */}
          {session.skills && session.skills.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-5">
              {session.skills.map((skill) => (
                <Chip key={skill} variant="violet">{skill}</Chip>
              ))}
            </div>
          )}

          {/* Session timeline (reuses WorkTimeline for orchestrated sessions with 50+ turns) */}
          {session.turns >= 50 && (
            <div className="mb-5">
              <SectionLabel>Session Activity · {session.turns} turns over {formatDuration(session.durationMinutes)}</SectionLabel>
              <WorkTimeline sessions={[session]} maxHeight={200} />
            </div>
          )}

          {loading && (
            <p className="text-sm text-on-surface-variant mb-4">Loading full session data...</p>
          )}

          {/* Execution path */}
          {session.executionPath && session.executionPath.length > 0 && (
            <div className="mb-5">
              <SectionLabel>Execution Path</SectionLabel>
              {session.executionPath.map((step) => (
                <div key={step.stepNumber} className="flex gap-3 items-start py-2.5 border-b border-ghost last:border-b-0">
                  <div className="w-6 h-6 rounded-full bg-primary text-white font-mono text-[0.625rem] font-bold flex items-center justify-center flex-shrink-0">
                    {step.stepNumber}
                  </div>
                  <div>
                    <div className="font-semibold text-sm text-on-surface mb-0.5">{step.title}</div>
                    <div className="text-[0.8125rem] text-on-surface-variant leading-relaxed">{step.description}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Tool usage */}
          {session.toolBreakdown && session.toolBreakdown.length > 0 && (
            <div className="mb-5">
              <SectionLabel>Tool Usage</SectionLabel>
              {session.toolBreakdown.map((t) => (
                <div key={t.tool} className="flex justify-between items-center py-1.5 border-b border-ghost last:border-b-0 font-mono text-xs">
                  <span className="text-on-surface truncate min-w-0">{t.tool}</span>
                  <span className="text-on-surface-variant flex-shrink-0 ml-3">{t.count}</span>
                </div>
              ))}
            </div>
          )}

          {/* Top files */}
          {session.filesChanged && session.filesChanged.length > 0 && (
            <div className="mb-5">
              <SectionLabel>Top Files</SectionLabel>
              {session.filesChanged.slice(0, 10).map((f) => (
                <div key={f.path} className="flex justify-between items-center py-1.5 border-b border-ghost last:border-b-0 font-mono text-xs">
                  <span className="text-on-surface truncate min-w-0">{f.path}</span>
                  <span className="flex-shrink-0 ml-2 whitespace-nowrap">
                    <span className="text-green-600 font-semibold">+{f.additions}</span>
                    <span className="text-red-600 font-semibold ml-1">-{f.deletions}</span>
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Q&A pairs */}
          {session.qaPairs && session.qaPairs.length > 0 && (
            <div className="mb-5">
              <SectionLabel>Questions & Answers</SectionLabel>
              {session.qaPairs.map((qa, i) => (
                <div key={i} className="py-3 border-b border-ghost last:border-b-0">
                  <div className="font-semibold text-[0.9375rem] text-on-surface mb-2">{qa.question}</div>
                  <div className="text-sm text-on-surface-variant leading-relaxed">{qa.answer}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mono text-[0.625rem] font-semibold uppercase tracking-wider text-on-surface-variant mb-2.5">
      {children}
    </div>
  )
}

function StatBox({ label, value, primary, children }: { label: string; value: string | number; primary?: boolean; children?: React.ReactNode }) {
  return (
    <div className="text-center p-3 border border-ghost rounded-sm bg-surface-lowest">
      <div className={`font-mono text-xl font-bold ${primary ? 'text-primary' : 'text-on-surface'}`}>
        {value}
      </div>
      <div className="font-mono text-[9px] uppercase tracking-wider text-on-surface-variant mt-1">
        {label}
      </div>
      {children}
    </div>
  )
}

function SplitLine({ you, agent }: { you: string; agent: string }) {
  return (
    <div className="flex justify-center gap-2 mt-1 font-mono text-[9px] text-on-surface-variant">
      <span className="text-primary font-semibold">{you}</span>
      <span className="text-green font-semibold">{agent}</span>
    </div>
  )
}
