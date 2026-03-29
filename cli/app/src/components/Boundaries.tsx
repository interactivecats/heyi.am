import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { fetchBoundaries, saveBoundaries, fetchSessions, type BoundaryConfig, type Session } from '../api'
import { AppShell, Card, Note, SectionHeader } from './shared'

export function Boundaries() {
  const { dirName } = useParams<{ dirName: string }>()
  const [boundaries, setBoundaries] = useState<BoundaryConfig | null>(null)
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!dirName) return
    Promise.all([
      fetchBoundaries(dirName).catch(() => null),
      fetchSessions(dirName).catch(() => [] as Session[]),
    ]).then(([b, s]) => {
      if (b) setBoundaries(b)
      setSessions(s)
    }).finally(() => setLoading(false))
  }, [dirName])

  const included = sessions.filter((s) => boundaries?.selectedSessionIds?.includes(s.id))
  const excluded = boundaries?.skippedSessions ?? []

  async function handleSave() {
    if (!dirName || !boundaries) return
    setSaving(true)
    try {
      await saveBoundaries(dirName, boundaries)
    } catch {
      // handled by UI
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <AppShell
        back={{ label: dirName ?? 'Project', to: `/project/${encodeURIComponent(dirName ?? '')}` }}
        chips={[{ label: 'Project boundaries' }]}
      >
        <div className="p-6">
          <span className="text-sm text-on-surface-variant">Loading boundaries...</span>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell
      back={{ label: dirName ?? 'Project', to: `/project/${encodeURIComponent(dirName ?? '')}` }}
      chips={[{ label: 'Project boundaries' }]}
      actions={
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-primary text-on-primary font-semibold text-[0.8125rem] px-3.5 py-1.5 rounded-sm hover:bg-primary-hover transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save boundaries'}
        </button>
      }
    >
      <div className="p-6">
        <h2 className="font-display text-xl font-bold text-on-surface">Shape what this project actually contains</h2>
        <p className="text-on-surface-variant text-sm mt-1">Clustering gets you close. This screen makes it trustworthy.</p>

        <div className="h-4" />

        <div className="grid grid-cols-2 gap-4">
          <Card>
            <SectionHeader title="Included sessions" meta={`${included.length} total`} />
            <div className="flex flex-col gap-3">
              {included.length === 0 ? (
                <Note>No sessions included yet.</Note>
              ) : (
                included.map((s) => (
                  <Note key={s.id} title={s.title}>
                    <span className="font-mono text-xs text-on-surface-variant">
                      {s.source ?? 'unknown'} &middot; {(s.filesChanged?.length ?? 0)} files &middot; {s.linesOfCode} lines
                    </span>
                  </Note>
                ))
              )}
            </div>
          </Card>

          <Card>
            <SectionHeader title="Nearby / excluded" meta="needs review" />
            <div className="flex flex-col gap-3">
              {excluded.length === 0 ? (
                <Note>No excluded sessions.</Note>
              ) : (
                excluded.map((s) => (
                  <Note key={s.sessionId} title={sessions.find((ss) => ss.id === s.sessionId)?.title ?? s.sessionId}>
                    <span className="font-mono text-xs text-on-surface-variant">
                      excluded &middot; {s.reason}
                    </span>
                  </Note>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>
    </AppShell>
  )
}
