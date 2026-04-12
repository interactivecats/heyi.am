import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchSession, fetchSessionRender, patchSessionEnhanced } from '../api'
import type { Session, QaPair, ExecutionStep } from '../types'
import { Chip } from './shared/Chip'
import { WorkTimeline } from './WorkTimeline'
import { scopeTemplateCss, REVEAL_SELECTOR } from '../scopeCss'
import { formatDuration, formatLoc } from '../format'

interface SessionDetailOverlayProps {
  session: Session
  projectDirName: string
  onClose: () => void
  isDark?: boolean
  onSessionUpdated?: () => void
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch { return iso }
}

/**
 * Scope template CSS to the session overlay container.
 * Same approach as ProjectDetail's scopeTemplateCss.
 */
function scopeSessionCss(css: string): string {
  return scopeTemplateCss(css, 'session-liquid-render')
}

export function SessionDetailOverlay({ session: initialSession, projectDirName, onClose, isDark, onSessionUpdated }: SessionDetailOverlayProps) {
  const [session, setSession] = useState<Session>(initialSession)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const navigate = useNavigate()

  // Edit-mode draft state
  const [editTitle, setEditTitle] = useState('')
  const [editDevTake, setEditDevTake] = useState('')
  const [editSkills, setEditSkills] = useState<string[]>([])
  const [editQaPairs, setEditQaPairs] = useState<QaPair[]>([])
  const [editSteps, setEditSteps] = useState<Array<{ stepNumber: number; title: string; body: string }>>([])
  const [newSkill, setNewSkill] = useState('')

  // Liquid-rendered session HTML (trusted — from our own Liquid engine with outputEscape)
  const [renderHtml, setRenderHtml] = useState<string | null>(null)
  const [renderCss, setRenderCss] = useState<string | null>(null)
  const liquidRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Scroll to top when session changes
  useEffect(() => {
    scrollRef.current?.scrollTo(0, 0)
  }, [initialSession.id])

  useEffect(() => {
    fetchSession(projectDirName, initialSession.id)
      .then((full) => setSession(full))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [projectDirName, initialSession.id])

  // Fetch Liquid-rendered session HTML
  useEffect(() => {
    fetchSessionRender(initialSession.id)
      .then((r) => {
        if (r) {
          setRenderHtml(r.html)
          setRenderCss(r.css)
        }
      })
      .catch(() => {})
  }, [initialSession.id])

  // Inject rendered HTML via ref and activate template scripts.
  // Re-run when exiting edit mode so the Liquid content is re-injected into the
  // freshly mounted container (the ref was unmounted while editing).
  useEffect(() => {
    if (editing) return
    const container = liquidRef.current
    if (!renderHtml || !container) return
    // Content is trusted — rendered by our Liquid engine with outputEscape: 'escape'
    container.textContent = ''
    const range = document.createRange()
    range.selectNodeContents(container)
    const fragment = range.createContextualFragment(renderHtml)
    container.appendChild(fragment)

    // Force-reveal animated elements
    requestAnimationFrame(() => {
      const animated = container.querySelectorAll(REVEAL_SELECTOR)
      animated.forEach((el, i) => {
        setTimeout(() => {
          el.classList.add('visible')
          ;(el as HTMLElement).style.animationPlayState = 'running'
          ;(el as HTMLElement).style.opacity = '1'
        }, i * 50)
      })
    })
  }, [renderHtml, editing])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  }, [onClose])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  const isEnhanced = session.status === 'enhanced' || session.status === 'uploaded'

  const enterEdit = useCallback(() => {
    setEditTitle(session.title || '')
    setEditDevTake(session.developerTake || '')
    setEditSkills([...(session.skills || [])])
    setEditQaPairs((session.qaPairs || []).map((qa) => ({ ...qa })))
    setEditSteps((session.executionPath || []).map((s) => ({ stepNumber: s.stepNumber, title: s.title, body: s.description })))
    setEditing(true)
  }, [session])

  const cancelEdit = useCallback(() => {
    setEditing(false)
    setNewSkill('')
  }, [])

  const saveEdit = useCallback(async () => {
    setSaving(true)
    try {
      await patchSessionEnhanced(session.id, {
        title: editTitle,
        developerTake: editDevTake,
        skills: editSkills,
        qaPairs: editQaPairs,
        executionSteps: editSteps,
      })
      // Refresh session data
      const full = await fetchSession(projectDirName, session.id)
      setSession(full)
      // Re-fetch Liquid render
      const r = await fetchSessionRender(session.id)
      if (r) {
        setRenderHtml(r.html)
        setRenderCss(r.css)
      }
      setEditing(false)
      onSessionUpdated?.()
    } catch (err) {
      console.error('Failed to save session edits:', err)
    } finally {
      setSaving(false)
    }
  }, [session.id, projectDirName, editTitle, editDevTake, editSkills, editQaPairs, editSteps, onSessionUpdated])

  const addSkill = useCallback(() => {
    const trimmed = newSkill.trim()
    if (trimmed && !editSkills.includes(trimmed)) {
      setEditSkills([...editSkills, trimmed])
    }
    setNewSkill('')
  }, [newSkill, editSkills])

  const hasChildren = session.children && session.children.length > 0

  return (
    <div
      className="absolute inset-0 z-50 flex flex-col"
    >
      {/* Sticky header */}
      <div className={`sticky top-0 z-10 border-b px-6 py-3 flex items-center gap-3 ${isDark ? 'bg-black border-white/10' : 'bg-surface-lowest border-ghost'}`}>
        <button
          type="button"
          onClick={onClose}
          className={`font-mono text-[0.8125rem] rounded-md px-3 py-1 cursor-pointer transition-colors ${isDark ? 'text-white/60 hover:text-white/90 bg-white/5 border border-white/10' : 'text-on-surface-variant hover:text-on-surface bg-surface-low border border-surface-high'}`}
        >
          ← Back to project
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
        {isEnhanced && !editing && (
          <button
            type="button"
            onClick={enterEdit}
            className="font-mono text-[0.8125rem] text-on-surface-variant bg-surface-low border border-ghost rounded-md px-3 py-1 cursor-pointer hover:text-on-surface hover:bg-surface-high transition-colors ml-auto"
          >
            Edit
          </button>
        )}
        {editing && (
          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={cancelEdit}
              className="font-mono text-[0.8125rem] text-on-surface-variant hover:text-on-surface px-3 py-1 cursor-pointer transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={saveEdit}
              disabled={saving}
              className="font-mono text-[0.8125rem] text-on-primary bg-primary rounded-md px-3 py-1 cursor-pointer hover:bg-primary-hover transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        )}
      </div>
      <div ref={scrollRef} className={`flex-1 overflow-y-auto ${isDark ? '' : 'bg-surface'}`} style={isDark ? { background: '#000' } : undefined}>
        <div className="max-w-4xl mx-auto p-8">

          {/* Edit mode — always React-rendered with form inputs */}
          {editing ? (
            <>
              {/* Title */}
              <div className="mb-4">
                <SectionLabel>Title</SectionLabel>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  maxLength={200}
                  className="w-full text-xl font-display font-bold px-3 py-2 rounded-sm border border-ghost bg-surface-lowest text-on-surface"
                />
              </div>

              {/* Developer take */}
              <div className="mb-4">
                <SectionLabel>Developer Take</SectionLabel>
                <textarea
                  value={editDevTake}
                  onChange={(e) => setEditDevTake(e.target.value)}
                  maxLength={2000}
                  rows={4}
                  className="w-full text-[0.9375rem] leading-relaxed px-3 py-2 rounded-sm border border-ghost bg-surface-lowest text-on-surface resize-y"
                />
              </div>

              {/* Skills */}
              <div className="mb-4">
                <SectionLabel>Skills</SectionLabel>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {editSkills.map((skill, i) => (
                    <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-mono rounded-sm bg-violet-50 text-violet-700 border border-violet-200">
                      {skill}
                      <button
                        type="button"
                        onClick={() => setEditSkills(editSkills.filter((_, j) => j !== i))}
                        className="text-violet-400 hover:text-violet-700 text-sm leading-none"
                      >
                        &times;
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newSkill}
                    onChange={(e) => setNewSkill(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSkill() } }}
                    placeholder="Add skill..."
                    className="flex-1 text-xs font-mono px-2 py-1.5 rounded-sm border border-ghost bg-surface-lowest text-on-surface placeholder:text-outline"
                  />
                  <button
                    type="button"
                    onClick={addSkill}
                    className="text-xs font-mono text-primary hover:underline px-2"
                  >
                    Add
                  </button>
                </div>
              </div>

              {/* Execution steps */}
              {editSteps.length > 0 && (
                <div className="mb-4">
                  <SectionLabel>Execution Path</SectionLabel>
                  {editSteps.map((step, i) => (
                    <div key={i} className="flex gap-3 items-start py-2.5 border-b border-ghost last:border-b-0">
                      <div className="w-6 h-6 rounded-full bg-primary text-white font-mono text-[0.625rem] font-bold flex items-center justify-center flex-shrink-0 mt-1.5">
                        {step.stepNumber}
                      </div>
                      <div className="flex-1 space-y-1.5">
                        <input
                          type="text"
                          value={step.title}
                          onChange={(e) => {
                            const updated = [...editSteps]
                            updated[i] = { ...updated[i], title: e.target.value }
                            setEditSteps(updated)
                          }}
                          className="w-full text-sm font-semibold px-2 py-1 rounded-sm border border-ghost bg-surface-lowest text-on-surface"
                        />
                        <textarea
                          value={step.body}
                          onChange={(e) => {
                            const updated = [...editSteps]
                            updated[i] = { ...updated[i], body: e.target.value }
                            setEditSteps(updated)
                          }}
                          rows={2}
                          className="w-full text-[0.8125rem] leading-relaxed px-2 py-1 rounded-sm border border-ghost bg-surface-lowest text-on-surface-variant resize-y"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => setEditSteps(editSteps.filter((_, j) => j !== i))}
                        className="text-on-surface-variant hover:text-error text-sm mt-1.5"
                      >
                        &times;
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setEditSteps([...editSteps, { stepNumber: editSteps.length + 1, title: '', body: '' }])}
                    className="text-xs font-mono text-primary hover:underline mt-2"
                  >
                    + Add step
                  </button>
                </div>
              )}

              {/* Q&A pairs */}
              <div className="mb-4">
                <SectionLabel>Questions & Answers</SectionLabel>
                {editQaPairs.map((qa, i) => (
                  <div key={i} className="py-3 border-b border-ghost last:border-b-0">
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <input
                        type="text"
                        value={qa.question}
                        onChange={(e) => {
                          const updated = [...editQaPairs]
                          updated[i] = { ...updated[i], question: e.target.value }
                          setEditQaPairs(updated)
                        }}
                        className="flex-1 text-[0.9375rem] font-semibold px-2 py-1 rounded-sm border border-ghost bg-surface-lowest text-on-surface"
                      />
                      <button
                        type="button"
                        onClick={() => setEditQaPairs(editQaPairs.filter((_, j) => j !== i))}
                        className="text-on-surface-variant hover:text-error text-sm"
                      >
                        &times;
                      </button>
                    </div>
                    <textarea
                      value={qa.answer}
                      onChange={(e) => {
                        const updated = [...editQaPairs]
                        updated[i] = { ...updated[i], answer: e.target.value }
                        setEditQaPairs(updated)
                      }}
                      rows={2}
                      className="w-full text-sm leading-relaxed px-2 py-1 rounded-sm border border-ghost bg-surface-lowest text-on-surface-variant resize-y"
                    />
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setEditQaPairs([...editQaPairs, { question: '', answer: '' }])}
                  className="text-xs font-mono text-primary hover:underline mt-2"
                >
                  + Add Q&A
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Liquid-rendered template content */}
              {renderHtml ? (
                <>
                  {renderCss && <style>{scopeSessionCss(renderCss)}</style>}
                  <div id="session-liquid-render" ref={liquidRef} />
                </>
              ) : (
                <>
                  {/* Fallback: React-rendered session detail while Liquid loads */}
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
                      {hasChildren && <SplitLine you="Human" agent={`${session.childCount ?? session.children!.length} agents`} />}
                    </StatBox>
                    <StatBox label="Files" value={session.filesChanged?.length === 1 && session.filesChanged[0]?.path === '(aggregate)' ? '—' : (session.filesChanged?.length ?? '—')} />
                    <StatBox label="Lines changed" value={formatLoc(session.linesOfCode)}>
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

                  {/* Session timeline */}
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
                </>
              )}
            </>
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
