/**
 * Standalone session detail overlay for exported HTML.
 * Adapted from cli/app/src/components/SessionDetailOverlay.tsx
 * — no react-router, no API fetch (session data is passed directly).
 */

import { useEffect, useCallback } from 'react'
import type { Session } from './types'
import { WorkTimeline } from './WorkTimeline'

interface SessionOverlayProps {
  session: Session
  sessionPageUrl?: string
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

export function SessionOverlay({ session, sessionPageUrl, onClose }: SessionOverlayProps) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  }, [onClose])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [handleKeyDown])

  const hasChildren = session.children && session.children.length > 0

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', justifyContent: 'flex-end', background: 'rgba(0,0,0,0.4)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ width: 600, maxWidth: '100%', height: '100%', background: 'var(--surface, #f8f9fb)', overflowY: 'auto', boxShadow: '-8px 0 32px rgba(25,28,30,0.1)' }}>
        <div style={{ padding: '2rem' }}>
          {/* Close + View full session */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
            <button
              type="button"
              onClick={onClose}
              style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.8125rem', color: 'var(--on-surface-variant, #6b7280)', background: 'var(--surface-low, #f3f4f6)', border: '1px solid var(--surface-high, #e7e8ea)', borderRadius: '0.375rem', padding: '0.25rem 0.75rem', cursor: 'pointer' }}
            >
              ESC · Close
            </button>
            {sessionPageUrl && (
              <a
                href={sessionPageUrl}
                style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.8125rem', color: 'var(--primary, #084471)', background: 'rgba(8,68,113,0.05)', border: '1px solid rgba(8,68,113,0.2)', borderRadius: '0.375rem', padding: '0.25rem 0.75rem', textDecoration: 'none' }}
              >
                View full session →
              </a>
            )}
          </div>

          {/* Title + meta */}
          <h2 style={{ fontFamily: 'var(--font-display, sans-serif)', fontSize: '1.5rem', fontWeight: 700, color: 'var(--on-surface, #191c1e)', marginBottom: '0.5rem' }}>
            {session.title}
          </h2>
          <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--on-surface-variant, #6b7280)', marginBottom: '1rem' }}>
            {formatDate(session.date)}
            {session.source && ` · ${session.source}`}
            {session.context && ` · ${session.context}`}
          </div>

          {/* Stats grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', marginBottom: '1.25rem' }}>
            <StatBox label="Active Time" value={formatDuration(session.durationMinutes)} primary>
              {hasChildren && <SplitLine you={formatDuration(Math.max(0, session.durationMinutes - session.children!.reduce((s, c) => s + c.durationMinutes, 0)))} agent={formatDuration(session.children!.reduce((s, c) => s + c.durationMinutes, 0))} />}
            </StatBox>
            <StatBox label="Turns" value={session.turns}>
              {hasChildren && <SplitLine you="You" agent={`${session.children!.length} agents`} />}
            </StatBox>
            <StatBox label="Files" value={session.filesChanged?.length === 1 && session.filesChanged[0]?.path === '(aggregate)' ? '—' : (session.filesChanged?.length ?? '—')} />
            <StatBox label="LOC" value={formatLoc(session.linesOfCode)}>
              {hasChildren && <SplitLine you={formatLoc(Math.max(0, session.linesOfCode - session.children!.reduce((s, c) => s + c.linesOfCode, 0)))} agent={formatLoc(session.children!.reduce((s, c) => s + c.linesOfCode, 0))} />}
            </StatBox>
          </div>

          {/* Developer take */}
          {session.developerTake && (
            <p style={{ fontSize: '0.9375rem', lineHeight: 1.6, color: 'var(--on-surface, #191c1e)', borderLeft: '3px solid var(--primary, #084471)', paddingLeft: '0.75rem', marginBottom: '1.25rem' }}>
              {session.developerTake}
            </p>
          )}

          {/* Skills */}
          {session.skills && session.skills.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', marginBottom: '1.25rem' }}>
              {session.skills.map((skill) => (
                <span key={skill} style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '11px', padding: '0.125rem 0.5rem', borderRadius: '0.25rem', background: 'var(--violet-bg, #ede9fe)', color: 'var(--violet, #6d28d9)' }}>{skill}</span>
              ))}
            </div>
          )}

          {/* Session timeline for orchestrated sessions with 50+ turns */}
          {session.turns >= 50 && (
            <div style={{ marginBottom: '1.25rem' }}>
              <SectionLabel>Session Activity · {session.turns} turns over {formatDuration(session.durationMinutes)}</SectionLabel>
              <WorkTimeline sessions={[session]} maxHeight={200} />
            </div>
          )}

          {/* Execution path */}
          {session.executionPath && session.executionPath.length > 0 && (
            <div style={{ marginBottom: '1.25rem' }}>
              <SectionLabel>Execution Path</SectionLabel>
              {session.executionPath.map((step) => (
                <div key={step.stepNumber} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', padding: '0.625rem 0', borderBottom: '1px solid var(--ghost, rgba(194,199,208,0.15))' }}>
                  <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--primary, #084471)', color: 'white', fontFamily: 'var(--font-mono, monospace)', fontSize: '0.625rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {step.stepNumber}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--on-surface, #191c1e)', marginBottom: '0.125rem' }}>{step.title}</div>
                    <div style={{ fontSize: '0.8125rem', color: 'var(--on-surface-variant, #6b7280)', lineHeight: 1.5 }}>{step.description}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Tool usage */}
          {session.toolBreakdown && session.toolBreakdown.length > 0 && (
            <div style={{ marginBottom: '1.25rem' }}>
              <SectionLabel>Tool Usage</SectionLabel>
              {session.toolBreakdown.map((t) => (
                <div key={t.tool} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.375rem 0', borderBottom: '1px solid var(--ghost, rgba(194,199,208,0.15))', fontFamily: 'var(--font-mono, monospace)', fontSize: '0.75rem' }}>
                  <span style={{ color: 'var(--on-surface, #191c1e)' }}>{t.tool}</span>
                  <span style={{ color: 'var(--on-surface-variant, #6b7280)' }}>{t.count}</span>
                </div>
              ))}
            </div>
          )}

          {/* Q&A pairs */}
          {session.qaPairs && session.qaPairs.length > 0 && (
            <div style={{ marginBottom: '1.25rem' }}>
              <SectionLabel>Questions & Answers</SectionLabel>
              {session.qaPairs.map((qa, i) => (
                <div key={i} style={{ padding: '0.75rem 0', borderBottom: '1px solid var(--ghost, rgba(194,199,208,0.15))' }}>
                  <div style={{ fontWeight: 600, fontSize: '0.9375rem', color: 'var(--on-surface, #191c1e)', marginBottom: '0.5rem' }}>{qa.question}</div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--on-surface-variant, #6b7280)', lineHeight: 1.5 }}>{qa.answer}</div>
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
    <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.625rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--on-surface-variant, #6b7280)', marginBottom: '0.625rem' }}>
      {children}
    </div>
  )
}

function StatBox({ label, value, primary, children }: { label: string; value: string | number; primary?: boolean; children?: React.ReactNode }) {
  return (
    <div style={{ textAlign: 'center', padding: '0.75rem', border: '1px solid var(--ghost, rgba(194,199,208,0.15))', borderRadius: '0.25rem', background: 'var(--surface-lowest, #ffffff)' }}>
      <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '1.25rem', fontWeight: 700, color: primary ? 'var(--primary, #084471)' : 'var(--on-surface, #191c1e)' }}>
        {value}
      </div>
      <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--on-surface-variant, #6b7280)', marginTop: '0.25rem' }}>
        {label}
      </div>
      {children}
    </div>
  )
}

function SplitLine({ you, agent }: { you: string; agent: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '0.25rem', fontFamily: 'var(--font-mono, monospace)', fontSize: '9px', color: 'var(--on-surface-variant, #6b7280)' }}>
      <span style={{ color: 'var(--primary, #084471)', fontWeight: 600 }}>{you}</span>
      <span style={{ color: 'var(--green, #006a61)', fontWeight: 600 }}>{agent}</span>
    </div>
  )
}
