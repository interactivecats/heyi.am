import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchProjects, type Project } from '../api'
import { AppShell, Card, Badge, SectionHeader, StatCard } from './shared'
import { Chip } from './shared/Chip'

function formatDuration(minutes: number): string {
  const hours = minutes / 60
  return hours >= 1 ? `${hours.toFixed(1)}h` : `${Math.round(minutes)}m`
}

function formatLoc(loc: number): string {
  return loc >= 1000 ? `${(loc / 1000).toFixed(1)}k` : String(loc)
}

function projectBadges(p: Project) {
  const badges: { variant: 'refined' | 'local' | 'exported'; label: string }[] = []
  if (p.enhancedAt) badges.push({ variant: 'refined', label: 'Refined' })
  if (p.isUploaded) badges.push({ variant: 'exported', label: 'Exported' })
  else badges.push({ variant: 'local', label: 'Local only' })
  return badges
}

export function Projects() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchProjects()
      .then(setProjects)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <AppShell
      chips={[{ label: 'Projects' }]}
      actions={
        <>
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

        <div className="h-4" />

        {loading ? (
          <div className="text-sm text-on-surface-variant">Loading projects...</div>
        ) : projects.length === 0 ? (
          <Card>
            <p className="text-sm text-on-surface-variant">No projects found. Run a source scan to get started.</p>
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {projects.map((p) => (
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
                    </div>
                  </div>

                  <div className="flex items-center gap-4 font-mono text-[0.6875rem] text-outline uppercase tracking-wider mt-2">
                    <span>{p.dateRange}</span>
                    {p.skills.length > 0 && <span>{p.skills.join(' + ')}</span>}
                    <span>{p.sessionCount} sessions</span>
                  </div>

                  <div className="grid grid-cols-4 gap-3 mt-3">
                    <StatCard label="Sessions" value={p.sessionCount} valueSize="text-lg" />
                    <StatCard label="Time" value={formatDuration(p.totalDuration)} valueSize="text-lg" />
                    <StatCard label="LOC" value={formatLoc(p.totalLoc)} valueSize="text-lg" />
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
