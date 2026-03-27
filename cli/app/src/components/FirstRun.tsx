import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { AppShell, Chip } from './shared'
import { fetchDashboard, subscribeSyncProgress } from '../api'
import type { DashboardResponse, DashboardProject, SyncProgressEvent } from '../types'

type ViewState = 'loading' | 'syncing' | 'empty' | 'dashboard'

export function FirstRun() {
  const [view, setView] = useState<ViewState>('loading')
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null)
  const [syncProgress, setSyncProgress] = useState<SyncProgressEvent | null>(null)

  useEffect(() => {
    let cancelled = false
    let cleanupRef: (() => void) | null = null

    fetchDashboard()
      .then((data) => {
        if (cancelled) return
        setDashboard(data)

        if (data.isEmpty && data.sync.status === 'syncing') {
          // First run — sync is in progress, subscribe to SSE
          setView('syncing')
          setSyncProgress(data.sync)

          const unsub = subscribeSyncProgress((evt) => {
            if (cancelled) return
            setSyncProgress(evt)

            if (evt.status === 'done') {
              // Re-fetch dashboard now that sync is complete
              fetchDashboard().then((fresh) => {
                if (cancelled) return
                setDashboard(fresh)
                setView(fresh.isEmpty ? 'empty' : 'dashboard')
              })
            }
          })

          cleanupRef = unsub
        } else if (data.isEmpty) {
          setView('empty')
        } else {
          setView('dashboard')
        }
      })
      .catch(() => {
        if (!cancelled) setView('empty')
      })

    return () => {
      cancelled = true
      cleanupRef?.()
    }
  }, [])

  const stats = dashboard?.stats
  const projects = dashboard?.projects ?? []
  const recentProjects = projects.slice(0, 4)
  const enhancedCount = stats?.enhancedCount ?? 0

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
        {/* Tagline — centered when loading/syncing */}
        <h1 className={`font-display text-[1.75rem] leading-[1.1] font-bold text-on-surface${view === 'loading' || view === 'syncing' ? ' text-center' : ''}`}>
          Turn your AI sessions into a dev portfolio.
        </h1>

        {/* ── Loading: initial fetch ─────────────────────────── */}
        {view === 'loading' && (
          <SyncTerminal
            lines={[
              { text: '$ heyiam status', variant: 'prompt' },
              { text: '  ◌ Connecting...', variant: 'active' },
            ]}
          />
        )}

        {/* ── Syncing: first-run with live progress ──────────── */}
        {view === 'syncing' && syncProgress && (
          <SyncTerminal lines={buildSyncLines(syncProgress)} />
        )}

        {/* ── Everything below: only after loading ───────────── */}
        {(view === 'dashboard' || view === 'empty') && (
          <>
            {/* Empty state */}
            {view === 'empty' && (
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
            {view === 'dashboard' && stats && (
              <>
                <div className="h-6" />
                <div className="grid grid-cols-4 gap-4">
                  <StatBox label="Sessions indexed" value={stats.sessionCount} to="/archive" color="var(--primary)" />
                  <StatBox label="Projects" value={stats.projectCount} to="/projects" />
                  <StatBox label="Enhanced" value={enhancedCount} to="/projects" color={enhancedCount > 0 ? '#34d399' : undefined} />
                  <StatBox label="Sources" value={stats.sourceCount} to="/sources" />
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
                {view === 'dashboard' ? 'Sync new sessions' : 'Scan local sources'}
              </Link>
              {view === 'dashboard' ? (
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

              {/* Subtle sync indicator for returning users */}
              {view === 'dashboard' && dashboard?.sync.status === 'syncing' && (
                <span className="text-xs text-on-surface-variant">
                  syncing {dashboard.sync.current}/{dashboard.sync.total}...
                </span>
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
                    <ProjectCard key={p.projectDir} project={p} />
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

/* ── Sync terminal ────────────────────────────────────────────── */

interface TerminalLine {
  text: string
  variant: 'prompt' | 'active' | 'passed' | 'info' | 'default'
}

function buildSyncLines(progress: SyncProgressEvent): TerminalLine[] {
  const lines: TerminalLine[] = [
    { text: '$ heyiam init', variant: 'prompt' },
  ]

  if (progress.phase === 'discovering') {
    lines.push({ text: '  ◌ Discovering sessions...', variant: 'active' })
  }

  if (progress.phase === 'indexing' || progress.phase === 'done') {
    lines.push({ text: `  ✓ Found ${progress.total} sessions`, variant: 'passed' })
  }

  if (progress.phase === 'indexing') {
    lines.push({
      text: `  ◌ Indexing sessions... (${progress.current}/${progress.total})`,
      variant: 'active',
    })
  }

  if (progress.phase === 'done') {
    lines.push({ text: `  ✓ Indexed ${progress.total} sessions`, variant: 'passed' })
    lines.push({ text: '  ✓ Ready', variant: 'passed' })
  }

  return lines
}

function SyncTerminal({ lines }: { lines: TerminalLine[] }) {
  const feedRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight })
  }, [lines.length])

  return (
    <div className="triage-terminal" style={{ maxWidth: 640, margin: '2rem auto', padding: '1.5rem' }}>
      <div ref={feedRef} className="triage-terminal__feed">
        {lines.map((line, i) => (
          <div
            key={i}
            className={`triage-terminal__line${
              line.variant === 'prompt' ? ' triage-terminal__prompt' :
              line.variant === 'passed' ? ' triage-terminal__line--passed' :
              line.variant === 'active' ? ' triage-terminal__line--active' :
              ''
            }`}
          >
            {line.text}
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Project card ─────────────────────────────────────────────── */

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
