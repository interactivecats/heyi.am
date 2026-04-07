import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { fetchProjects, type Project } from '../api'
import { AppShell, Card, Badge, SectionHeader, StatCard } from './shared'
import { Chip } from './shared/Chip'
import { formatDuration, formatLoc } from '../format'

function formatDateRange(raw: string): string {
  if (!raw) return ''
  const [start, end] = raw.split('|')
  const fmt = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    } catch {
      return ''
    }
  }
  const s = fmt(start)
  const e = fmt(end)
  if (!s) return ''
  if (s === e) return s
  return `${s} — ${e}`
}

function projectBadges(p: Project) {
  const badges: { variant: 'refined' | 'local' | 'exported'; label: string }[] = []
  if (p.enhancedAt) badges.push({ variant: 'refined', label: 'Refined' })
  if (p.isUploaded) badges.push({ variant: 'exported', label: 'Exported' })
  else badges.push({ variant: 'local', label: 'Local only' })
  return badges
}

/**
 * Enhancement status label for a project card.
 * - Fully enhanced: "Enhanced ✓"
 * - Partially enhanced: "N of M enhanced"
 * - Not enhanced: null (omit — keep the card quiet)
 */
export function enhancementStatusLabel(p: Project): string | null {
  const enhanced = p.enhancedSessionCount ?? 0
  const total = p.sessionCount
  if (enhanced === 0) return null
  if (enhanced >= total && p.enhancedAt) return 'Enhanced \u2713'
  return `${enhanced} of ${total} enhanced`
}

export function Projects() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [searchParams] = useSearchParams()
  const urlFilter = searchParams.get('filter') // e.g. "unenhanced"

  useEffect(() => {
    fetchProjects()
      .then(setProjects)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // URL filter (?filter=unenhanced) narrows the data set first; the
  // text filter applies on top of that.
  // "unenhanced" means no sessions in the project have been enhanced yet.
  // Falls back to enhancedAt for backends that don't yet send enhancedSessionCount.
  const urlFiltered = urlFilter === 'unenhanced'
    ? projects.filter((p) => (p.enhancedSessionCount ?? 0) === 0 && !p.enhancedAt)
    : projects

  const filtered = filter
    ? urlFiltered.filter((p) => {
        const q = filter.toLowerCase()
        return (
          p.name.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.skills.some((s) => s.toLowerCase().includes(q))
        )
      })
    : urlFiltered

  return (
    <AppShell
      chips={[{ label: 'Projects' }]}
      actions={
        <>
          <Link to="/search" className="text-xs text-on-surface-variant hover:text-on-surface transition-colors">
            Search
          </Link>
          <Link to="/archive" className="text-xs text-on-surface-variant hover:text-on-surface transition-colors">
            Archive
          </Link>
          <Link to="/settings" className="text-xs text-on-surface-variant hover:text-on-surface transition-colors">
            Settings
          </Link>
        </>
      }
    >
      <div className="p-6">
        <SectionHeader title="Your projects" meta="Local project memory built from both live and archived history.">
          <Chip variant="green">Local-only is a complete state</Chip>
        </SectionHeader>

        {/* Project filter */}
        {projects.length > 3 && (
          <div className="mt-3">
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter projects..."
              className="w-full max-w-sm bg-surface-low border border-ghost rounded-md font-mono text-xs text-on-surface placeholder:text-outline px-3 py-1.5 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
            />
          </div>
        )}

        <div className="h-4" />

        {loading ? (
          <div className="text-sm text-on-surface-variant">Loading projects...</div>
        ) : filtered.length === 0 ? (
          <Card>
            <p className="text-sm text-on-surface-variant">
              {filter ? 'No projects match your filter.' : 'No projects found. Run a source scan to get started.'}
            </p>
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {filtered.map((p) => (
              <Link key={p.dirName} to={`/project/${encodeURIComponent(p.dirName)}`} className="no-underline">
                <Card hover>
                  <div className="flex items-center justify-between mb-1">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-display text-[0.9375rem] font-semibold text-on-surface">{p.name}</h3>
                        {projectBadges(p).map((b) => (
                          <Badge key={b.label} variant={b.variant}>{b.label}</Badge>
                        ))}
                      </div>
                      <p className="text-on-surface-variant text-sm mt-1">{p.description}</p>
                      {enhancementStatusLabel(p) && (
                        <div
                          data-testid="enhancement-status"
                          className="font-mono text-[10px] text-on-surface-variant mt-1"
                        >
                          {enhancementStatusLabel(p)}
                        </div>
                      )}
                    </div>
                  </div>

                  {(p.dateRange || p.skills.length > 0) && (
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      {p.dateRange && (
                        <span className="font-mono text-[0.6875rem] text-outline">{formatDateRange(p.dateRange)}</span>
                      )}
                      {p.skills.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {p.skills.slice(0, 8).map((sk) => (
                            <Chip key={sk} variant="violet">{sk}</Chip>
                          ))}
                          {p.skills.length > 8 && (
                            <span className="font-mono text-[10px] text-outline">+{p.skills.length - 8}</span>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-4 gap-3 mt-3">
                    <StatCard label="Sessions" value={p.sessionCount} valueSize="text-lg" />
                    <StatCard label="Time" value={formatDuration(p.totalDuration)} valueSize="text-lg" />
                    <StatCard label="Lines changed" value={formatLoc(p.totalLoc)} valueSize="text-lg" />
                    <StatCard label="Files" value={p.totalFiles} valueSize="text-lg" />
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  )
}
