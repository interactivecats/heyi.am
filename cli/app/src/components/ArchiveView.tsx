import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppShell, Card, Chip, StatCard, SectionHeader, Note } from './shared'
import { fetchArchiveStats, fetchSourceAudit, type ArchiveStats, type SourceAuditResult } from '../api'

interface ArchiveRow {
  source: string
  archived: number
  status: string
  statusVariant: 'green' | 'default' | 'violet'
}

function healthToStatus(health: 'healthy' | 'warning' | 'error'): { status: string; statusVariant: 'green' | 'default' | 'violet' } {
  switch (health) {
    case 'healthy': return { status: 'healthy', statusVariant: 'green' }
    case 'warning': return { status: 'partial', statusVariant: 'default' }
    case 'error': return { status: 'filtered', statusVariant: 'violet' }
  }
}

export function ArchiveView() {
  const [stats, setStats] = useState<{
    archived: number
    oldest: string
    sources: number
    lastSync: string
  } | null>(null)
  const [rows, setRows] = useState<ArchiveRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    Promise.all([fetchArchiveStats(), fetchSourceAudit()])
      .then(([archiveData, sourceData]: [ArchiveStats, SourceAuditResult]) => {
        setStats({
          archived: archiveData.total,
          oldest: archiveData.oldest,
          sources: archiveData.sourcesCount,
          lastSync: archiveData.lastSync,
        })
        setRows(
          sourceData.sources.map((s) => ({
            source: s.name,
            archived: s.archivedCount,
            ...healthToStatus(s.health),
          })),
        )
      })
      .catch(() => {
        setError(true)
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <AppShell
        back={{ label: 'Sources', to: '/sources' }}
        chips={[{ label: 'Archive' }]}
      >
        <div className="p-6">
          <span className="text-sm text-on-surface-variant">Loading archive...</span>
        </div>
      </AppShell>
    )
  }

  if (error || !stats) {
    return (
      <AppShell
        back={{ label: 'Sources', to: '/sources' }}
        chips={[{ label: 'Archive' }]}
      >
        <div className="p-6">
          <span className="text-sm text-on-surface-variant">Failed to load archive data.</span>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell
      back={{ label: 'Sources', to: '/sources' }}
      chips={[{ label: 'Archive' }]}
      actions={
        <div className="flex items-center gap-2">
          <button className="inline-flex items-center gap-1.5 font-semibold text-[0.8125rem] px-3.5 py-1.5 rounded-sm text-primary border border-ghost hover:border-outline transition-colors bg-transparent">
            Archive now
          </button>
          <button className="inline-flex items-center gap-1.5 font-semibold text-[0.8125rem] px-3.5 py-1.5 rounded-sm text-primary border border-ghost hover:border-outline transition-colors bg-transparent">
            Export archive
          </button>
        </div>
      }
    >
      <div className="p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div>
            <h2 className="font-display text-xl font-semibold text-on-surface">
              Your preserved AI work history
            </h2>
            <p className="text-on-surface-variant text-sm mt-1">
              A durable library across tools, with clear ownership and visible coverage.
            </p>
          </div>
          <Chip variant="green">under your control</Chip>
        </div>

        <div className="h-4" />

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3">
          <StatCard label="Archived sessions" value={stats.archived} />
          <StatCard label="Oldest saved" value={stats.oldest} />
          <StatCard label="Sources covered" value={stats.sources} />
          <StatCard label="Last sync" value={stats.lastSync} />
        </div>

        <div className="h-5" />

        {/* Two-column grid */}
        <div className="grid grid-cols-2 gap-4">
          {/* Left: Table */}
          <Card className="bg-white">
            <SectionHeader title="By source" meta="coverage" />
            <table className="w-full border-collapse text-[0.8125rem]">
              <thead>
                <tr>
                  <th className="text-left py-2 font-mono text-[9px] uppercase tracking-wider text-outline border-b border-ghost">
                    Source
                  </th>
                  <th className="text-left py-2 font-mono text-[9px] uppercase tracking-wider text-outline border-b border-ghost">
                    Archived
                  </th>
                  <th className="text-left py-2 font-mono text-[9px] uppercase tracking-wider text-outline border-b border-ghost">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.source}>
                    <td className="py-2 border-b border-ghost">{row.source}</td>
                    <td className="py-2 border-b border-ghost">{row.archived}</td>
                    <td className="py-2 border-b border-ghost">
                      <Chip variant={row.statusVariant}>{row.status}</Chip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* Right: Posture + CTAs */}
          <Card className="bg-white">
            <SectionHeader title="Archive posture" meta="ops" />
            <div className="flex flex-col gap-3">
              <Note>
                Claude retention risk is already mitigated for previously captured sessions.
              </Note>
              <Note>
                Two sources are missing a recent manual sync and should be refreshed before a
                long trip or machine change.
              </Note>
              <Note>
                <span className="font-mono text-xs">
                  Archive path: ~/.config/heyiam/sessions/
                </span>
              </Note>
            </div>
            <div className="h-4" />
            <div className="flex items-center gap-2">
              <Link
                to="/projects"
                className="inline-flex items-center gap-1.5 font-semibold text-[0.8125rem] px-3.5 py-1.5 rounded-sm bg-primary text-on-primary hover:bg-primary-hover transition-colors"
              >
                Go to projects
              </Link>
              <button className="inline-flex items-center gap-1.5 font-semibold text-[0.8125rem] px-3.5 py-1.5 rounded-sm text-primary border border-ghost hover:border-outline transition-colors bg-transparent">
                Verify integrity
              </button>
            </div>
          </Card>
        </div>
      </div>
    </AppShell>
  )
}
