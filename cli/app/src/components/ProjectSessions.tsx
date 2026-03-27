import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { fetchProjectDetail, type ProjectDetail } from '../api'
import type { Session } from '../types'
import { Chip } from './shared/Chip'

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

type SortKey = 'date' | 'duration' | 'loc' | 'turns'

export function ProjectSessions() {
  const { dirName } = useParams<{ dirName: string }>()
  const navigate = useNavigate()
  const [detail, setDetail] = useState<ProjectDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState<SortKey>('date')
  const [sortDesc, setSortDesc] = useState(true)
  const [filter, setFilter] = useState('')

  useEffect(() => {
    if (!dirName) return
    fetchProjectDetail(dirName)
      .then(setDetail)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [dirName])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-mid">
        <span className="text-sm text-on-surface-variant">Loading sessions...</span>
      </div>
    )
  }

  if (!detail) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-surface-mid gap-3">
        <span className="text-sm text-on-surface-variant">Project not found.</span>
        <button onClick={() => navigate(-1)} className="text-xs text-primary hover:underline cursor-pointer">
          Go back
        </button>
      </div>
    )
  }

  const { sessions } = detail

  // Filter
  const filtered = filter
    ? sessions.filter((s) =>
        s.title.toLowerCase().includes(filter.toLowerCase()) ||
        (s.skills ?? []).some((sk) => sk.toLowerCase().includes(filter.toLowerCase())) ||
        (s.source ?? '').toLowerCase().includes(filter.toLowerCase())
      )
    : sessions

  // Sort
  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0
    switch (sortBy) {
      case 'date': cmp = new Date(a.date).getTime() - new Date(b.date).getTime(); break
      case 'duration': cmp = a.durationMinutes - b.durationMinutes; break
      case 'loc': cmp = a.linesOfCode - b.linesOfCode; break
      case 'turns': cmp = a.turns - b.turns; break
    }
    return sortDesc ? -cmp : cmp
  })

  function handleSort(key: SortKey) {
    if (sortBy === key) {
      setSortDesc(!sortDesc)
    } else {
      setSortBy(key)
      setSortDesc(true)
    }
  }

  function SortHeader({ label, sortKey }: { label: string; sortKey: SortKey }) {
    const active = sortBy === sortKey
    return (
      <button
        type="button"
        onClick={() => handleSort(sortKey)}
        className={`font-mono text-[9px] uppercase tracking-wider cursor-pointer transition-colors ${
          active ? 'text-primary font-bold' : 'text-outline hover:text-on-surface-variant'
        }`}
      >
        {label} {active ? (sortDesc ? '↓' : '↑') : ''}
      </button>
    )
  }

  return (
    <div className="min-h-screen bg-surface-mid">
      <header className="sticky top-0 z-50 bg-surface-lowest border-b border-ghost">
        <div className="flex items-center justify-between h-12 px-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => navigate(`/project/${encodeURIComponent(dirName ?? '')}`)}
              className="text-sm text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer shrink-0"
            >
              &larr; {detail.project.name}
            </button>
            <span className="text-outline text-xs shrink-0">/</span>
            <span className="font-display text-sm font-semibold text-on-surface">
              All sessions
            </span>
          </div>
          <Chip variant="primary">{sessions.length} sessions</Chip>
        </div>
      </header>

      <div className="p-6 max-w-4xl mx-auto">
        {/* Filter + sort controls */}
        <div className="flex items-center gap-4 mb-4">
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by title, skill, or source..."
            className="flex-1 bg-surface-lowest border border-ghost rounded-md px-3 py-2 text-sm text-on-surface placeholder:text-outline outline-none focus:border-primary transition-colors"
          />
          <div className="flex items-center gap-3 shrink-0">
            <span className="font-mono text-[9px] uppercase tracking-wider text-outline">Sort:</span>
            <SortHeader label="Date" sortKey="date" />
            <SortHeader label="Duration" sortKey="duration" />
            <SortHeader label="LOC" sortKey="loc" />
            <SortHeader label="Turns" sortKey="turns" />
          </div>
        </div>

        {/* Sessions list */}
        <div className="flex flex-col gap-2">
          {sorted.map((s) => (
            <Link
              key={s.id}
              to={`/session/${encodeURIComponent(s.id)}`}
              className="flex items-start gap-4 bg-surface-lowest border border-ghost rounded-md px-4 py-3 hover:shadow-md transition-shadow"
            >
              <div className="flex-1 min-w-0">
                <div className="font-display text-[0.8125rem] font-semibold text-on-surface mb-0.5 truncate">
                  {s.title}
                </div>
                <div className="flex items-center gap-3 font-mono text-[10px] text-on-surface-variant">
                  <span>{formatDate(s.date)}</span>
                  <span className="text-ghost">|</span>
                  <span>{formatDuration(s.durationMinutes)}</span>
                  <span className="text-ghost">|</span>
                  <span>{s.turns} turns</span>
                  <span className="text-ghost">|</span>
                  <span>{formatLoc(s.linesOfCode)} LOC</span>
                </div>
                {s.developerTake && (
                  <p className="text-xs text-on-surface-variant mt-1 line-clamp-1">
                    {s.developerTake}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                {s.source && <Chip>{s.source}</Chip>}
                {s.skills?.[0] && <Chip variant="violet">{s.skills[0]}</Chip>}
                {(s.skills?.length ?? 0) > 1 && (
                  <span className="font-mono text-[9px] text-outline">+{s.skills!.length - 1}</span>
                )}
              </div>
            </Link>
          ))}

          {sorted.length === 0 && (
            <div className="text-center py-12">
              <p className="text-sm text-on-surface-variant">
                {filter ? 'No sessions match your filter.' : 'No sessions in this project.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
