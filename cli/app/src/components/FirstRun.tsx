import { Link } from 'react-router-dom'
import { AppShell, Chip, StatCard, Note, SectionHeader } from './shared'

export function FirstRun() {
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
        <div className="grid grid-cols-2 gap-6">
          {/* Left: Hero */}
          <div>
            <div className="font-mono text-[9px] uppercase tracking-wider text-primary mb-2">
              Preserve &rarr; Organize &rarr; Refine &rarr; Share
            </div>
            <h1 className="font-display text-[1.75rem] leading-[1.1] font-bold text-on-surface">
              Own your AI work history before it disappears.
            </h1>
            <div className="h-4" />
            <p className="text-[0.9375rem] text-on-surface-variant max-w-[640px] leading-[1.65]">
              Archive local sessions from Claude Code, Cursor, Codex, Gemini CLI, and OpenClaw.
              Keep them under your control, turn them into readable project memory, and publish
              only if it's actually worth sharing.
            </p>
            <div className="h-5" />
            <div className="flex items-center gap-2">
              <Link
                to="/sources"
                className="inline-flex items-center gap-1.5 font-semibold text-[0.8125rem] px-3.5 py-1.5 rounded-sm bg-primary text-on-primary hover:bg-primary-hover transition-colors"
              >
                Scan local sources
              </Link>
              <button className="inline-flex items-center gap-1.5 font-semibold text-[0.8125rem] px-3.5 py-1.5 rounded-sm text-primary border border-ghost hover:border-outline transition-colors bg-transparent">
                Choose sources manually
              </button>
            </div>
            <div className="h-4" />
            <div className="flex items-center gap-1">
              <Chip>Claude Code</Chip>
              <Chip>Cursor</Chip>
              <Chip>Codex</Chip>
              <Chip>Gemini CLI</Chip>
              <Chip>OpenClaw</Chip>
            </div>
          </div>

          {/* Right: Info */}
          <div>
            <SectionHeader title="Why archive first" meta="Trust model" />
            <div className="flex flex-col gap-3">
              <Note>
                Some tools delete or hide old sessions. Your project history shouldn't vanish
                just because a vendor changes retention policy.
              </Note>
              <Note>
                Your work often lives across multiple tools. Archiving gives you one durable
                timeline under your own control.
              </Note>
              <Note>
                Nothing is published by default. Review, export, and public sharing are all
                separate decisions.
              </Note>
            </div>
            <div className="h-4" />
            <div className="grid grid-cols-2 gap-4">
              <StatCard label="Default posture" value="Local only" valueSize="text-base" />
              <StatCard label="Public step" value="Optional" valueSize="text-base" />
            </div>
          </div>
        </div>

        <div className="h-6" />

        <div className="grid grid-cols-4 gap-3">
          <StatCard label="Capture" value="Archive sessions" valueSize="text-sm" />
          <StatCard label="Organize" value="Cluster projects" valueSize="text-sm" />
          <StatCard label="Refine" value="Draft narratives" valueSize="text-sm" />
          <StatCard label="Share" value="Export or publish" valueSize="text-sm" />
        </div>
      </div>
    </AppShell>
  )
}
