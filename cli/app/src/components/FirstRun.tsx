import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { AppShell, Chip } from './shared'
import { fetchProjects, fetchArchiveStats } from '../api'
import type { Project, ArchiveStats } from '../types'

type LoadPhase = 'idle' | 'archive' | 'projects' | 'done'

export function FirstRun() {
  const [projects, setProjects] = useState<Project[]>([])
  const [archive, setArchive] = useState<ArchiveStats | null>(null)
  const [phase, setPhase] = useState<LoadPhase>('idle')

  useEffect(() => {
    let cancelled = false

    async function load() {
      setPhase('archive')
      try {
        const a = await fetchArchiveStats()
        if (cancelled) return
        setArchive(a)
      } catch { /* ok */ }

      if (cancelled) return
      setPhase('projects')
      try {
        const p = await fetchProjects()
        if (cancelled) return
        setProjects(p)
      } catch { /* ok */ }

      if (!cancelled) setPhase('done')
    }

    load()
    return () => { cancelled = true }
  }, [])

  const loading = phase !== 'done'

  // ── Dashboard ──────────────────────────────────────────────
  const hasData = !loading && (projects.length > 0 || (archive?.total ?? 0) > 0)
  const recentProjects = [...projects]
    .sort((a, b) => (b.lastSessionDate ?? '').localeCompare(a.lastSessionDate ?? ''))
    .slice(0, 4)
  const enhancedCount = projects.filter((p) => p.enhancedAt).length

  return (
    <AppShell
      chips={[
        { label: 'local-first', variant: 'primary' },
        { label: 'private by default', variant: 'green' },
      ]}
      actions={
        <Link to="/settings" className="text-xs text-on-surface-variant hover:text-on-surface transition-colors">
          Settings
        </Link>
      }
    >
      <div className="p-6">
        {/* Tagline — centered when loading */}
        <h1 className={`font-display text-[1.75rem] leading-[1.1] font-bold text-on-surface${loading ? ' text-center' : ''}`}>
          Turn your AI sessions into a dev portfolio.
        </h1>

        {/* Loading terminal — inline like triage terminal */}
        {loading && (
          <LoadingTerminal phase={phase} archiveStats={archive} projectCount={projects.length} />
        )}

        {/* Everything below hidden while loading */}
        {!loading && (
          <>
            {/* Empty state — no data yet */}
            {!hasData && (
              <>
                <div className="h-3" />
                <p className="text-[0.9375rem] text-on-surface-variant leading-[1.65] max-w-[640px]">
                  No sessions found yet. Scan your local sources to archive work
                  from Claude Code, Cursor, Codex, and Gemini CLI.
                </p>
                <div className="h-4" />
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Chip>Claude Code</Chip>
                  <Chip>Cursor</Chip>
                  <Chip>Codex</Chip>
                  <Chip>Gemini CLI</Chip>
                  <Chip>OpenClaw</Chip>
                </div>
              </>
            )}

            {/* Stats bar */}
            {hasData && (
              <>
                <div className="h-6" />
                <div className="grid grid-cols-4 gap-4">
                  <StatBox label="Sessions archived" value={archive?.total ?? 0} to="/archive" color="var(--primary)" />
                  <StatBox label="Projects" value={projects.length} to="/projects" />
                  <StatBox label="Enhanced" value={enhancedCount} to="/projects" color={enhancedCount > 0 ? '#34d399' : undefined} />
                  <StatBox label="Sources" value={archive?.sourcesCount ?? 0} to="/sources" />
                </div>
              </>
            )}

            <div className="h-6" />

            {/* Quick actions */}
            <div className="flex items-center gap-3 flex-wrap">
              <Link
                to="/sources"
                className="inline-flex items-center gap-1.5 font-semibold text-[0.8125rem] px-4 py-2 rounded-sm bg-primary text-on-primary hover:bg-primary-hover transition-colors"
              >
                {hasData ? 'Sync new sessions' : 'Scan local sources'}
              </Link>
              {hasData ? (
                <>
                  <Link
                    to="/projects"
                    className="inline-flex items-center gap-1.5 font-semibold text-[0.8125rem] px-4 py-2 rounded-sm text-primary border border-ghost hover:border-outline transition-colors"
                  >
                    View projects
                  </Link>
                  <Link
                    to="/search"
                    className="inline-flex items-center gap-1.5 font-semibold text-[0.8125rem] px-4 py-2 rounded-sm text-primary border border-ghost hover:border-outline transition-colors"
                  >
                    Search sessions
                  </Link>
                </>
              ) : (
                <button className="inline-flex items-center gap-1.5 font-semibold text-[0.8125rem] px-4 py-2 rounded-sm text-primary border border-ghost hover:border-outline transition-colors bg-transparent">
                  Choose sources manually
                </button>
              )}
            </div>

            <div className="h-10" />

            {/* Recent projects */}
            {recentProjects.length > 0 && (
              <>
                <div className="flex items-baseline justify-between mb-3">
                  <h2 className="font-semibold text-sm text-on-surface">Recent projects</h2>
                  <Link to="/projects" className="text-xs text-primary hover:underline">
                    View all &rarr;
                  </Link>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {recentProjects.map((p) => (
                    <Link
                      key={p.dirName}
                      to={`/project/${encodeURIComponent(p.dirName)}`}
                      className="group block bg-white border border-ghost rounded-sm p-3.5 hover:border-outline transition-colors"
                    >
                      <div className="font-semibold text-sm text-on-surface truncate">{p.name}</div>
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
                  ))}
                </div>
                <div className="h-10" />
              </>
            )}

            {/* Feature nav cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <FeatureCard to="/archive" label="Archive" title="Back up sessions" desc="Import from local AI tools before they expire. Everything stays on your machine." />
              <FeatureCard to="/projects" label="Build" title="AI case studies" desc="AI reads your sessions, extracts skills, and drafts a narrative for each project." />
              <FeatureCard to="/search" label="Search" title="Find past work" desc="Full-text search across all sessions. Filter by tool, project, or skill." />
              <FeatureCard to="/projects" label="Export" title="HTML, markdown, or publish" desc="Save locally, export markdown, or publish a public portfolio on heyi.am." />
            </div>

            <div className="h-8" />

            {/* Trust footer */}
            <div className="border-t border-ghost pt-4 flex items-start gap-6 text-xs text-on-surface-variant">
              <span>Everything is local by default.</span>
              <span>Nothing is published unless you choose to.</span>
              <span>No account required to archive or export.</span>
            </div>
          </>
        )}
      </div>
    </AppShell>
  )
}

/* ── Loading terminal ─────────────────────────────────────────── */

function LoadingTerminal({
  phase,
  archiveStats,
  projectCount,
}: {
  phase: LoadPhase
  archiveStats: ArchiveStats | null
  projectCount: number
}) {
  const feedRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight })
  }, [phase])

  return (
    <div className="triage-terminal" style={{ maxWidth: 640, margin: '2rem auto', padding: '1.5rem' }}>
      <div ref={feedRef} className="triage-terminal__feed">
        <div className="triage-terminal__prompt">$ heyiam status</div>

        {/* Archive line */}
        {phase === 'archive' && (
          <div className="triage-terminal__line triage-terminal__line--active">
            &nbsp; ◌ Reading archive...
          </div>
        )}
        {phase !== 'idle' && phase !== 'archive' && archiveStats && (
          <div className="triage-terminal__line triage-terminal__line--passed">
            &nbsp; ✓ Archive: {archiveStats.total} sessions from {archiveStats.sourcesCount} source{archiveStats.sourcesCount !== 1 ? 's' : ''}
          </div>
        )}
        {phase !== 'idle' && phase !== 'archive' && !archiveStats && (
          <div className="triage-terminal__line" style={{ color: 'rgba(255,255,255,0.5)' }}>
            &nbsp; — No archive yet
          </div>
        )}

        {/* Projects line */}
        {phase === 'projects' && (
          <div className="triage-terminal__line triage-terminal__line--active">
            &nbsp; ◌ Scanning projects...
          </div>
        )}
        {phase === 'done' && projectCount > 0 && (
          <div className="triage-terminal__line triage-terminal__line--passed">
            &nbsp; ✓ Found {projectCount} project{projectCount !== 1 ? 's' : ''}
          </div>
        )}
        {phase === 'done' && projectCount === 0 && (
          <div className="triage-terminal__line" style={{ color: 'rgba(255,255,255,0.5)' }}>
            &nbsp; — No projects found
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Stat box ─────────────────────────────────────────────────── */

function StatBox({ label, value, to, color }: { label: string; value: number; to: string; color?: string }) {
  return (
    <Link
      to={to}
      className="block bg-white border border-ghost rounded-sm px-4 py-3 hover:border-outline transition-colors"
    >
      <div className="text-2xl font-bold" style={color ? { color } : { color: 'var(--on-surface)' }}>{value}</div>
      <div className="text-xs text-on-surface-variant mt-0.5">{label}</div>
    </Link>
  )
}

/* ── Feature card ─────────────────────────────────────────────── */

function FeatureCard({ to, label, title, desc }: { to: string; label: string; title: string; desc: string }) {
  return (
    <Link
      to={to}
      className="group block bg-white border border-ghost rounded-sm p-4 hover:border-outline transition-colors"
    >
      <div className="font-mono text-[9px] uppercase tracking-wider text-primary mb-1.5">{label}</div>
      <div className="font-semibold text-sm text-on-surface mb-1">{title}</div>
      <div className="text-xs text-on-surface-variant leading-relaxed">{desc}</div>
    </Link>
  )
}
