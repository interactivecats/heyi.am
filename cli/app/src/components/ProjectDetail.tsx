import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchProjectDetail, type ProjectDetail as ProjectDetailType, type Session } from '../api'
import { Card, Note, SectionHeader, StatCard } from './shared'
import { Chip } from './shared/Chip'
import { WorkTimelineSvg } from './WorkTimelineSvg'
import { GrowthChartSvg } from './GrowthChartSvg'

function formatDuration(minutes: number): string {
  const hours = minutes / 60
  return hours >= 1 ? `${hours.toFixed(1)}h` : `${Math.round(minutes)}m`
}

function formatLoc(loc: number): string {
  return loc >= 1000 ? `${(loc / 1000).toFixed(1)}k` : String(loc)
}

function timeSince(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const hours = Math.floor(diff / 3600000)
  if (hours < 1) return 'just now'
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function ProjectDetail() {
  const { dirName } = useParams<{ dirName: string }>()
  const [detail, setDetail] = useState<ProjectDetailType | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!dirName) return
    fetchProjectDetail(dirName)
      .then(setDetail)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [dirName])

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <span className="text-sm text-on-surface-variant">Loading project...</span>
      </div>
    )
  }

  if (!detail) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <span className="text-sm text-on-surface-variant">Project not found.</span>
      </div>
    )
  }

  const { project, sessions, enhanceCache } = detail
  const cache = enhanceCache ?? null
  const narrative = cache?.result?.narrative ?? project.description
  const phases = cache?.result?.arc ?? []
  const tools = [...new Set(sessions.map((s) => s.source ?? 'unknown'))]

  return (
    <div className="grid grid-cols-[240px_1fr] min-h-[calc(100vh-48px)]">
      {/* Sidebar */}
      <aside className="border-r border-ghost bg-surface-low p-4">
        <div className="mb-5">
          <div className="font-mono text-[9px] uppercase tracking-wider text-outline mb-2">Project</div>
          <div className="flex flex-col gap-0.5">
            <SideLink label="Overview" badge="1" active />
            <Link to={`/project/${encodeURIComponent(dirName!)}/boundaries`} className="no-underline">
              <SideLink label="Boundaries" badge="2" />
            </Link>
            <Link to={`/project/${encodeURIComponent(dirName!)}/output`} className="no-underline">
              <SideLink label="Outputs" badge="3" />
            </Link>
          </div>
        </div>

        <div className="mb-4">
          <div className="font-mono text-[9px] uppercase tracking-wider text-outline mb-1.5">Source mix</div>
          <div className="flex flex-wrap gap-1 mt-1.5">
            {tools.map((t) => (
              <Chip key={t}>{t}</Chip>
            ))}
          </div>
        </div>

        <div className="mb-4">
          <div className="font-mono text-[9px] uppercase tracking-wider text-outline mb-1.5">Status</div>
          <div className="flex flex-wrap gap-1 mt-1.5">
            <Chip variant="primary">{project.enhancedAt ? 'Refined' : 'Unrefined'}</Chip>
            <Chip variant="green">{project.isUploaded ? 'Uploaded' : 'Local only'}</Chip>
          </div>
        </div>

        <Note>The local project page is the main object. Public pages are just one projection of it.</Note>
      </aside>

      {/* Main content */}
      <main className="p-6 overflow-y-auto">
        <div className="flex items-center justify-between mb-1">
          <div>
            <h2 className="font-display text-xl font-bold text-on-surface">{project.name}</h2>
            <span className="text-on-surface-variant text-[0.8125rem]">
              {project.dateRange}
              {project.enhancedAt && ` · last refined ${timeSince(project.enhancedAt)}`}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Chip variant="primary">{project.sessionCount} sessions</Chip>
          </div>
        </div>
        <div className="h-4" />

        {/* Narrative */}
        <Card className="mb-4">
          <SectionHeader title="Narrative summary" meta="editable" />
          <p className="text-[0.8125rem] leading-relaxed text-on-surface border-l-[3px] border-primary pl-3">
            {narrative}
          </p>
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3 mb-4">
          <StatCard label="Sessions" value={project.sessionCount} />
          <StatCard label="Time" value={formatDuration(project.totalDuration)} />
          <StatCard label="LOC" value={formatLoc(project.totalLoc)} />
          <StatCard label="Files" value={project.totalFiles} />
        </div>

        {/* Work Timeline */}
        <Card className="mb-4">
          <SectionHeader title="Work timeline" meta="sessions over time" />
          <WorkTimelineSvg sessions={sessions} />
        </Card>

        {/* Key decisions + Source breakdown */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <Card>
            <SectionHeader title="Key decisions" meta="signal" />
            <div className="flex flex-col gap-3">
              <Note title="Move rendering to the CLI">Treat output generation as a trust-boundary problem.</Note>
              <Note title="Split public and private domains">Prevent the hosted layer from becoming the center.</Note>
              <Note title="Archive before analysis">Protect work history from source-tool retention loss.</Note>
            </div>
          </Card>
          <Card>
            <SectionHeader title="Source breakdown" meta="provenance" />
            <SourceTable sessions={sessions} />
          </Card>
        </div>

        {/* Project phases */}
        {phases.length > 0 && (
          <Card className="mb-4">
            <SectionHeader title="Project phases" meta="timeline" />
            <div className="relative pl-5">
              <div className="absolute left-1 top-1.5 bottom-1.5 w-0.5 bg-ghost rounded-full" />
              {phases.map((phase) => (
                <div key={phase.phase} className="relative pb-4 last:pb-0">
                  <div className="absolute -left-5 top-1.5 w-2 h-2 rounded-full bg-primary shadow-[0_0_0_3px_rgba(8,68,113,0.1)]" />
                  <div className="font-mono text-[0.6875rem] uppercase tracking-wider text-on-surface-variant">
                    {phase.title}
                  </div>
                  <Note>
                    <span className="text-on-surface-variant">{phase.description}</span>
                  </Note>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Growth chart */}
        <Card className="mb-4">
          <SectionHeader title="Project growth" meta="cumulative LOC" />
          <div className="flex justify-between mb-2">
            <span className="font-mono text-[0.6875rem] uppercase tracking-wider text-on-surface-variant">Cumulative LOC</span>
            <span className="font-mono text-[0.6875rem] font-semibold">{formatLoc(project.totalLoc)} total</span>
          </div>
          <GrowthChartSvg sessions={sessions} />
        </Card>

        {/* Featured sessions */}
        <Card>
          <SectionHeader title="Featured sessions" meta="editable selection" />
          {sessions.slice(0, 5).map((s) => (
            <div key={s.id} className="flex justify-between items-center py-2.5 border-b border-ghost last:border-b-0">
              <div>
                <h4 className="font-display text-[0.8125rem] font-semibold text-on-surface">{s.title}</h4>
                <span className="text-on-surface-variant text-xs">
                  {formatDuration(s.durationMinutes)} · {s.turns} turns · {formatLoc(s.linesOfCode)} LOC
                </span>
              </div>
              {s.skills?.[0] && <Chip variant="violet">{s.skills[0]}</Chip>}
            </div>
          ))}
        </Card>
      </main>
    </div>
  )
}

function SideLink({ label, badge, active }: { label: string; badge?: string; active?: boolean }) {
  return (
    <div
      className={`flex justify-between items-center px-2.5 py-2 rounded-sm text-[0.8125rem] transition-colors cursor-pointer ${
        active
          ? 'bg-primary/[0.06] text-primary font-semibold'
          : 'text-on-surface-variant hover:bg-primary/[0.04] hover:text-primary'
      }`}
    >
      {label}
      {badge && (
        <span className="font-mono text-[9px] bg-primary/[0.06] text-primary px-1.5 py-0.5 rounded-sm">
          {badge}
        </span>
      )}
    </div>
  )
}

function SourceTable({ sessions }: { sessions: Session[] }) {
  const counts = sessions.reduce<Record<string, number>>((acc, s) => {
    acc[s.source ?? 'unknown'] = (acc[s.source ?? 'unknown'] ?? 0) + 1
    return acc
  }, {})

  return (
    <table className="w-full border-collapse text-[0.8125rem]">
      <thead>
        <tr>
          <th className="text-left py-2 font-mono text-[9px] uppercase tracking-wider text-outline border-b border-ghost">Source</th>
          <th className="text-left py-2 font-mono text-[9px] uppercase tracking-wider text-outline border-b border-ghost">Count</th>
        </tr>
      </thead>
      <tbody>
        {Object.entries(counts).map(([tool, count]) => (
          <tr key={tool}>
            <td className="py-2 border-b border-ghost">{tool}</td>
            <td className="py-2 border-b border-ghost">{count}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
