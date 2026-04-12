import { useState, useCallback, useMemo } from 'react'
import { enhanceSession } from '../api'
import type { Session } from '../types'
import { formatDuration, formatLoc } from '../format'

interface SessionManageModalProps {
  sessions: Session[]
  initialSelection: Set<string>
  projectDirName: string
  onClose: () => void
  onSave: (selected: Set<string>) => Promise<void>
}

type EnhanceStatus = 'idle' | 'enhancing' | 'done' | 'failed'

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  } catch { return '' }
}

export function SessionManageModal({ sessions, initialSelection, projectDirName, onClose, onSave }: SessionManageModalProps) {
  const [selection, setSelection] = useState<Set<string>>(() => new Set(initialSelection))
  const [filter, setFilter] = useState('')
  const [saving, setSaving] = useState(false)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set())

  // Draft enhancement state
  const [draftsToEnhance, setDraftsToEnhance] = useState<Set<string>>(() => new Set())
  const [enhanceStatuses, setEnhanceStatuses] = useState<Record<string, EnhanceStatus>>({})
  const [enhancedTitles, setEnhancedTitles] = useState<Record<string, string>>({})

  const parentSessions = useMemo(() =>
    sessions.filter((s) => !s.parentSessionId),
    [sessions],
  )

  // Categorize sessions into tiers
  const { included, enhanced, draft } = useMemo(() => {
    const filterLower = filter.toLowerCase()
    const filtered = parentSessions.filter((s) => {
      if (!filterLower) return true
      const title = (enhancedTitles[s.id] || s.title || s.id).toLowerCase()
      return title.includes(filterLower)
        || (s.skills ?? []).some((sk) => sk.toLowerCase().includes(filterLower))
        || (s.source ?? '').toLowerCase().includes(filterLower)
    })

    const inc: Session[] = []
    const enh: Session[] = []
    const dft: Session[] = []

    // Sort by date descending within each group
    const byDate = (a: Session, b: Session) => {
      const da = a.date ? new Date(a.date).getTime() : 0
      const db = b.date ? new Date(b.date).getTime() : 0
      return db - da
    }

    for (const s of filtered) {
      if (selection.has(s.id)) inc.push(s)
      else if (s.status === 'enhanced' || s.status === 'uploaded' || enhanceStatuses[s.id] === 'done') enh.push(s)
      else dft.push(s)
    }

    return { included: inc.sort(byDate), enhanced: enh.sort(byDate), draft: dft.sort(byDate) }
  }, [parentSessions, selection, filter, enhanceStatuses, enhancedTitles])

  const selectionChanged = useMemo(() => {
    if (selection.size !== initialSelection.size) return true
    for (const id of selection) {
      if (!initialSelection.has(id)) return true
    }
    return false
  }, [selection, initialSelection])

  const toggleCollapse = useCallback((group: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(group)) next.delete(group)
      else next.add(group)
      return next
    })
  }, [])

  const toggleSelection = useCallback((id: string) => {
    setSelection((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleDraftEnhance = useCallback((id: string) => {
    setDraftsToEnhance((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const enhanceSelectedDrafts = useCallback(async () => {
    const ids = [...draftsToEnhance]
    if (ids.length === 0) return

    // Mark all as enhancing
    const statuses: Record<string, EnhanceStatus> = {}
    ids.forEach((id) => { statuses[id] = 'enhancing' })
    setEnhanceStatuses((prev) => ({ ...prev, ...statuses }))

    // Process in batches of 3
    const BATCH = 3
    for (let i = 0; i < ids.length; i += BATCH) {
      const batch = ids.slice(i, i + BATCH)
      await Promise.all(batch.map(async (id) => {
        try {
          const res = await enhanceSession(projectDirName, id)
          setEnhanceStatuses((prev) => ({ ...prev, [id]: 'done' }))
          setEnhancedTitles((prev) => ({ ...prev, [id]: res.result.title }))
        } catch {
          setEnhanceStatuses((prev) => ({ ...prev, [id]: 'failed' }))
        }
      }))
    }
    setDraftsToEnhance(new Set())
  }, [draftsToEnhance, projectDirName])

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      await onSave(selection)
    } catch (err) {
      console.error('Failed to save:', err)
    } finally {
      setSaving(false)
    }
  }, [selection, onSave])

  const isEnhancing = Object.values(enhanceStatuses).some((s) => s === 'enhancing')

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
      <div className="bg-surface-lowest rounded-md border border-ghost shadow-lg w-full max-w-xl max-h-[75vh] flex flex-col">
        {/* Header */}
        <div className="px-4 py-3 border-b border-ghost">
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono text-[0.8125rem] font-semibold text-on-surface">Manage Sessions</span>
            <button type="button" onClick={onClose} className="text-on-surface-variant hover:text-on-surface text-lg leading-none">&times;</button>
          </div>
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter sessions..."
            className="w-full bg-surface-lowest border border-ghost rounded-sm px-2 py-1.5 text-xs font-mono text-on-surface placeholder:text-outline outline-none focus:border-primary"
          />
        </div>

        {/* Session list */}
        <div className="flex-1 overflow-y-auto">
          {/* Included tier */}
          <TierGroup
            label="Included"
            count={included.length}
            borderColor="border-primary"
            collapsed={collapsedGroups.has('included')}
            onToggle={() => toggleCollapse('included')}
          >
            {included.map((s) => (
              <SessionRow
                key={s.id}
                session={s}
                displayTitle={enhancedTitles[s.id]}
                borderColor="border-primary"
                checked={true}
                onToggle={() => toggleSelection(s.id)}
              />
            ))}
          </TierGroup>

          {/* Enhanced tier */}
          {enhanced.length > 0 && (
            <TierGroup
              label="Enhanced"
              count={enhanced.length}
              borderColor="border-green"
              collapsed={collapsedGroups.has('enhanced')}
              onToggle={() => toggleCollapse('enhanced')}
            >
              {enhanced.map((s) => (
                <SessionRow
                  key={s.id}
                  session={s}
                  displayTitle={enhancedTitles[s.id]}
                  borderColor="border-green"
                  checked={false}
                  onToggle={() => toggleSelection(s.id)}
                />
              ))}
            </TierGroup>
          )}

          {/* Draft tier */}
          {draft.length > 0 && (
            <TierGroup
              label="Draft"
              count={draft.length}
              borderColor="border-transparent"
              collapsed={collapsedGroups.has('draft')}
              onToggle={() => toggleCollapse('draft')}
              action={draftsToEnhance.size > 0 && !isEnhancing ? (
                <button
                  type="button"
                  onClick={enhanceSelectedDrafts}
                  className="font-mono text-[10px] text-primary hover:underline"
                >
                  Enhance {draftsToEnhance.size} session{draftsToEnhance.size !== 1 ? 's' : ''}
                </button>
              ) : undefined}
            >
              {draft.map((s) => (
                <DraftRow
                  key={s.id}
                  session={s}
                  checked={draftsToEnhance.has(s.id)}
                  status={enhanceStatuses[s.id] ?? 'idle'}
                  enhancedTitle={enhancedTitles[s.id]}
                  onToggle={() => toggleDraftEnhance(s.id)}
                  onInclude={() => {
                    // Only includable if just enhanced
                    if (enhanceStatuses[s.id] === 'done') toggleSelection(s.id)
                  }}
                />
              ))}
            </TierGroup>
          )}

          {included.length === 0 && enhanced.length === 0 && draft.length === 0 && (
            <div className="text-center py-8 text-xs text-on-surface-variant">No sessions match filter.</div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-ghost">
          {selectionChanged && (
            <div className="text-[10px] text-amber-600 mb-2 font-mono">
              Session set changed. Re-enhance to update the narrative.
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-xs text-on-surface-variant font-mono">{selection.size} included</span>
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="font-mono text-[0.8125rem] text-on-surface-variant hover:text-on-surface px-3 py-1">
                Cancel
              </button>
              <button
                type="button"
                disabled={selection.size === 0 || saving || isEnhancing}
                onClick={handleSave}
                className="font-mono text-[0.8125rem] text-on-primary bg-primary rounded-md px-3 py-1 hover:bg-primary-hover transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Tier group ─────────────────────────────────────────────

function TierGroup({
  label,
  count,
  borderColor: _borderColor,
  collapsed,
  onToggle,
  action,
  children,
}: {
  label: string
  count: number
  borderColor: string
  collapsed: boolean
  onToggle: () => void
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="border-b border-ghost last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center justify-between w-full px-4 py-2 hover:bg-surface-low"
        aria-expanded={!collapsed}
      >
        <span className="font-mono text-[9px] uppercase tracking-wider text-outline">
          {label} ({count})
        </span>
        <div className="flex items-center gap-3">
          {action && <span onClick={(e) => e.stopPropagation()}>{action}</span>}
          <span className="text-[10px] text-outline">{collapsed ? '+' : '−'}</span>
        </div>
      </button>
      {!collapsed && <div className="pb-1">{children}</div>}
    </div>
  )
}

// ── Session row (included / enhanced) ─────────────────────

function SessionRow({
  session: s,
  displayTitle,
  borderColor,
  checked,
  onToggle,
}: {
  session: Session
  displayTitle?: string
  borderColor: string
  checked: boolean
  onToggle: () => void
}) {
  return (
    <label className={`flex items-center gap-3 px-4 py-2 hover:bg-surface-low cursor-pointer border-l-2 ${borderColor}`}>
      <input type="checkbox" checked={checked} onChange={onToggle} className="accent-primary flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-sm text-on-surface truncate">{displayTitle || s.title || `Session ${s.id.slice(0, 8)}`}</div>
        <div className="font-mono text-[10px] text-on-surface-variant">
          {s.date ? formatDate(s.date) : ''}
          {s.durationMinutes > 0 && ` · ${formatDuration(s.durationMinutes)}`}
          {s.linesOfCode > 0 && ` · ${formatLoc(s.linesOfCode)}`}
          {s.source && <span className="ml-1.5 text-outline">{s.source}</span>}
        </div>
      </div>
    </label>
  )
}

// ── Draft row ─────────────────────────────────────────────

function DraftRow({
  session: s,
  checked,
  status,
  enhancedTitle,
  onToggle,
  onInclude,
}: {
  session: Session
  checked: boolean
  status: EnhanceStatus
  enhancedTitle?: string
  onToggle: () => void
  onInclude: () => void
}) {
  const isDone = status === 'done'

  return (
    <div className="flex items-center gap-3 px-4 py-2 hover:bg-surface-low border-l-2 border-transparent">
      {isDone ? (
        // Once enhanced, show include checkbox
        <input type="checkbox" checked={false} onChange={onInclude} className="accent-primary flex-shrink-0" title="Include in project" />
      ) : status === 'enhancing' ? (
        <span className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin flex-shrink-0" />
      ) : (
        // Checkbox to select for enhancement
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="accent-amber-500 flex-shrink-0"
          title="Select for enhancement"
        />
      )}
      <div className="flex-1 min-w-0">
        <div className="text-sm text-on-surface truncate">
          {isDone ? (
            <>{enhancedTitle || s.title || `Session ${s.id.slice(0, 8)}`}</>
          ) : (
            <span className="text-on-surface-variant">{s.title || `Session ${s.id.slice(0, 8)}`}</span>
          )}
          {status === 'idle' && (
            <span className="ml-1.5 font-mono text-[9px] text-amber-600 bg-amber-50 px-1 py-0.5 rounded-sm">draft</span>
          )}
          {status === 'enhancing' && (
            <span className="ml-1.5 font-mono text-[9px] text-primary">enhancing...</span>
          )}
          {status === 'done' && (
            <span className="ml-1.5 font-mono text-[9px] text-green">enhanced</span>
          )}
          {status === 'failed' && (
            <span className="ml-1.5 font-mono text-[9px] text-error">failed</span>
          )}
        </div>
        <div className="font-mono text-[10px] text-on-surface-variant">
          {s.date ? formatDate(s.date) : ''}
          {s.durationMinutes > 0 && ` · ${formatDuration(s.durationMinutes)}`}
          {s.linesOfCode > 0 && ` · ${formatLoc(s.linesOfCode)}`}
          {s.source && <span className="ml-1.5 text-outline">{s.source}</span>}
        </div>
      </div>
    </div>
  )
}
