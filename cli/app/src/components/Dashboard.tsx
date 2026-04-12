import { Link } from 'react-router-dom'
import { Chip } from './shared'
import type { DashboardResponse, DashboardProject } from '../types'

export interface DashboardProps {
  dashboard: DashboardResponse | null
  stats: DashboardResponse['stats'] | undefined
  projects: DashboardProject[]
}

export function Dashboard({ dashboard, stats, projects }: DashboardProps) {
  const recentProjects = projects.slice(0, 4)
  const enhancedCount = stats?.enhancedCount ?? 0

  return (
    <div className="p-6">
      <h1 className="font-display text-[1.75rem] leading-[1.1] font-bold text-on-surface">
        Turn your AI sessions into a dev portfolio.
      </h1>

      {stats && (
        <>
          <div className="h-6" />
          <div className="grid grid-cols-4 gap-4">
            <StatBox label="Sessions indexed" value={stats.sessionCount} to="/archive" color="var(--primary)" />
            <StatBox label="Projects" value={stats.projectCount} to="/projects" />
            <StatBox label="Enhanced" value={enhancedCount} to="/projects?filter=unenhanced" color={enhancedCount > 0 ? '#34d399' : undefined} />
            <StatBox label="Sources" value={stats.sourceCount} to="/sources" />
          </div>
        </>
      )}

      <div className="h-6" />

      <div className="flex items-center gap-3 flex-wrap">
        <Link to="/sources" className="inline-flex items-center gap-1.5 font-semibold text-[0.8125rem] px-4 py-2 rounded-sm bg-primary text-on-primary hover:bg-primary-hover transition-colors">
          Sync new sessions
        </Link>
        <Link to="/projects" className="inline-flex items-center gap-1.5 font-semibold text-[0.8125rem] px-4 py-2 rounded-sm text-primary border border-ghost hover:border-outline transition-colors">
          View projects
        </Link>
        <Link to="/search" className="inline-flex items-center gap-1.5 font-semibold text-[0.8125rem] px-4 py-2 rounded-sm text-primary border border-ghost hover:border-outline transition-colors">
          Search sessions
        </Link>
        <Link to="/portfolio" className="inline-flex items-center gap-1.5 font-semibold text-[0.8125rem] px-4 py-2 rounded-sm text-primary border border-ghost hover:border-outline transition-colors">
          Open Portfolio
        </Link>

        {dashboard?.sync.status === 'syncing' && (
          <span className="text-xs text-on-surface-variant">
            syncing {dashboard.sync.current}/{dashboard.sync.total}
            {dashboard.sync.currentProject ? ` — ${dashboard.sync.currentProject}` : ''}...
          </span>
        )}
      </div>

      <div className="h-10" />

      {recentProjects.length > 0 && (
        <>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="font-semibold text-sm text-on-surface">Recent projects</h2>
            <Link to="/projects" className="text-xs text-primary hover:underline">View all &rarr;</Link>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {recentProjects.map((p) => (
              <ProjectCard key={p.projectDir} project={p} />
            ))}
          </div>
          <div className="h-10" />
        </>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <FeatureCard to="/archive" label="Archive" title="Back up sessions" desc="Import from local AI tools before they expire. Everything stays on your machine." />
        <FeatureCard to="/projects" label="Build" title="AI case studies" desc="AI reads your sessions, extracts skills, and drafts a narrative for each project." />
        <FeatureCard to="/search" label="Search" title="Find past work" desc="Full-text search across all sessions. Filter by tool, project, or skill." />
        <FeatureCard to="/portfolio" label="Export" title="HTML, markdown, or publish" desc="Export your full portfolio as a static site, publish to heyi.am, or push to GitHub Pages." />
      </div>

      <div className="h-8" />

      <div className="border-t border-ghost pt-4 flex items-start gap-6 text-xs text-on-surface-variant">
        <span>Everything is local by default.</span>
        <span>Nothing is published unless you choose to.</span>
        <span>No account required to archive or export.</span>
      </div>
    </div>
  )
}

// ── Sub-components ───────────────────────────────────────────

function ProjectCard({ project: p }: { project: DashboardProject }) {
  return (
    <Link
      to={`/project/${encodeURIComponent(p.projectDir)}`}
      className="group block bg-white border border-ghost rounded-sm p-3.5 hover:border-outline transition-colors"
    >
      <div className="font-semibold text-sm text-on-surface truncate">{p.projectName}</div>
      <div className="text-xs text-on-surface-variant mt-0.5">
        {p.sessionCount} session{p.sessionCount !== 1 ? 's' : ''}
        {p.enhancedAt && <span className="ml-2" style={{ color: '#34d399' }}>enhanced</span>}
      </div>
      {p.skills.length > 0 && (
        <div className="flex gap-1 mt-2 flex-wrap">
          {p.skills.slice(0, 3).map((s) => (
            <Chip key={s}>{s}</Chip>
          ))}
        </div>
      )}
    </Link>
  )
}

function StatBox({ label, value, to, color }: { label: string; value: number; to: string; color?: string }) {
  return (
    <Link to={to} className="block bg-white border border-ghost rounded-sm px-4 py-3 hover:border-outline transition-colors">
      <div className="text-2xl font-bold" style={color ? { color } : { color: 'var(--on-surface)' }}>{value}</div>
      <div className="text-xs text-on-surface-variant mt-0.5">{label}</div>
    </Link>
  )
}

function FeatureCard({ to, label, title, desc }: { to: string; label: string; title: string; desc: string }) {
  return (
    <Link to={to} className="group block bg-white border border-ghost rounded-sm p-4 hover:border-outline transition-colors">
      <div className="font-mono text-[9px] uppercase tracking-wider text-primary mb-1.5">{label}</div>
      <div className="font-semibold text-sm text-on-surface mb-1">{title}</div>
      <div className="text-xs text-on-surface-variant leading-relaxed">{desc}</div>
    </Link>
  )
}
