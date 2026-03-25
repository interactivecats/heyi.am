import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppShell, Card, Chip, StatCard } from './shared'
import { fetchSourceAudit, type SourceAuditResult } from '../api'

interface SourceCardData {
  tool: string
  path: string
  live: number
  archived: number
  chips: { label: string; variant: 'primary' | 'green' | 'amber' | 'violet' }[]
  kpis: { label: string; value: string }[]
}

const MOCK_SOURCES: SourceCardData[] = [
  {
    tool: 'Claude Code',
    path: '~/.claude/projects \u00b7 Jan 12\u2013Mar 24',
    live: 14,
    archived: 89,
    chips: [
      { label: '14 live', variant: 'primary' },
      { label: '89 archived', variant: 'green' },
      { label: '30-day retention risk', variant: 'amber' },
    ],
    kpis: [
      { label: 'Path', value: 'local session store' },
      { label: 'Archive', value: 'healthy' },
      { label: 'Notes', value: 'older sessions already preserved' },
    ],
  },
  {
    tool: 'Cursor',
    path: '~/Library/... \u00b7 Feb 1\u2013Mar 18',
    live: 9,
    archived: 41,
    chips: [
      { label: '9 live', variant: 'primary' },
      { label: '41 archived', variant: 'green' },
    ],
    kpis: [
      { label: 'Coverage', value: 'stable' },
      { label: 'Last archive', value: '2h ago' },
      { label: 'Warnings', value: 'none' },
    ],
  },
  {
    tool: 'OpenClaw',
    path: 'workspace-linked sessions only',
    live: 11,
    archived: 26,
    chips: [
      { label: '11 live', variant: 'primary' },
      { label: '26 archived', variant: 'green' },
      { label: '4 personal/admin excluded', variant: 'violet' },
    ],
    kpis: [
      { label: 'Filter', value: 'workspace-linked only' },
      { label: 'Excluded', value: 'reminders, personal threads' },
      { label: 'Reason', value: 'keep project scope clean' },
    ],
  },
]

export function SourceAudit() {
  const [sources, setSources] = useState<SourceCardData[]>(MOCK_SOURCES)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    fetchSourceAudit()
      .then((data: SourceAuditResult) => {
        if (data.sources.length > 0) {
          setSources(
            data.sources.map((s) => ({
              tool: s.name,
              path: s.path + (s.dateRange ? ` \u00b7 ${s.dateRange}` : ''),
              live: s.liveCount,
              archived: s.archivedCount,
              chips: [
                { label: `${s.liveCount} live` as string, variant: 'primary' as const },
                { label: `${s.archivedCount} archived` as string, variant: 'green' as const },
                ...(s.retentionRisk
                  ? [{ label: s.retentionRisk, variant: 'amber' as const }]
                  : []),
              ],
              kpis: [
                { label: 'Health', value: s.health },
              ],
            })),
          )
        }
      })
      .catch(() => {
        // API not ready yet — keep mock data
      })
      .finally(() => setLoading(false))
  }, [])

  const totalLive = sources.reduce((s, src) => s + src.live, 0)
  const totalArchived = sources.reduce((s, src) => s + src.archived, 0)

  return (
    <AppShell
      back={{ label: 'Back', to: '/' }}
      chips={[{ label: 'Source audit' }]}
      actions={
        <button className="inline-flex items-center gap-1.5 font-semibold text-[0.8125rem] px-3.5 py-1.5 rounded-sm text-primary border border-ghost hover:border-outline transition-colors bg-transparent">
          Rescan all
        </button>
      }
    >
      <div className="p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div>
            <h2 className="font-display text-xl font-semibold text-on-surface">
              What we found, what we archived, and what we skipped
            </h2>
            <p className="text-on-surface-variant text-sm mt-1">
              The ingestion layer should feel inspectable, not magical.
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Chip variant="green">{totalArchived} archived</Chip>
            <Chip variant="amber">Claude retention risk detected</Chip>
          </div>
        </div>

        <div className="h-4" />

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3">
          <StatCard label="Sources scanned" value={sources.length} />
          <StatCard label="Live sessions" value={totalLive} />
          <StatCard label="Archived" value={totalArchived} />
          <StatCard label="Projects detected" value={7} />
        </div>

        <div className="h-5" />

        {/* Source cards */}
        <div className="flex flex-col gap-3">
          {sources.map((src) => (
            <Card key={src.tool}>
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="font-display text-[0.9375rem] font-semibold text-on-surface">
                    {src.tool}
                  </h3>
                  <span className="font-mono text-xs text-outline">{src.path}</span>
                </div>
                <div className="flex items-center gap-1">
                  {src.chips.map((chip) => (
                    <Chip key={chip.label} variant={chip.variant}>
                      {chip.label}
                    </Chip>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap gap-4 text-[0.8125rem] text-on-surface-variant mt-2">
                {src.kpis.map((kpi) => (
                  <span key={kpi.label}>
                    <strong className="text-on-surface">{kpi.label}:</strong> {kpi.value}
                  </span>
                ))}
              </div>
            </Card>
          ))}
        </div>

        <div className="h-5" />

        {/* CTAs */}
        <div className="flex items-center gap-2">
          <Link
            to="/archive"
            className="inline-flex items-center gap-1.5 font-semibold text-[0.8125rem] px-3.5 py-1.5 rounded-sm bg-primary text-on-primary hover:bg-primary-hover transition-colors"
          >
            Review archive
          </Link>
          <Link
            to="/projects"
            className="inline-flex items-center gap-1.5 font-semibold text-[0.8125rem] px-3.5 py-1.5 rounded-sm text-primary border border-ghost hover:border-outline transition-colors"
          >
            Continue to projects
          </Link>
          <button className="text-xs text-on-surface-variant hover:text-on-surface transition-colors bg-transparent border-none">
            Add custom path
          </button>
        </div>

        {loading && (
          <p className="text-sm text-on-surface-variant mt-4">Loading source data...</p>
        )}
      </div>
    </AppShell>
  )
}
