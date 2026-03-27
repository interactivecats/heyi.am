/**
 * Static HTML export version of ProjectDetail.
 *
 * Mirrors the CLI dashboard layout (browser chrome screenshot, cards,
 * stat grid, work timeline / growth chart mount points, session grid)
 * using the same Tailwind classes so the Vite-built CSS styles it identically.
 *
 * Interactive elements (overlays, editable fields, sidebar inputs) are
 * stripped — this is a read-only export.
 */

import React from 'react';
import type { ProjectRenderData, SessionCard } from '../types.js';

function formatDuration(minutes: number): string {
  const hours = minutes / 60;
  return hours >= 1 ? `${hours.toFixed(1)}h` : `${Math.round(minutes)}m`;
}

function formatLoc(loc: number): string {
  return loc >= 1000 ? `${(loc / 1000).toFixed(1)}k` : String(loc);
}

function formatDate(iso: string): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return iso; }
}

// ── Inlined shared components (static versions) ──────────────

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-surface-lowest border border-ghost rounded-md p-4${className ? ` ${className}` : ''}`}>
      {children}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-surface-lowest border border-ghost rounded-md p-4">
      <div className="font-mono text-[9px] uppercase tracking-wider text-on-surface-variant mb-1">{label}</div>
      <div className="font-display text-2xl font-bold text-on-surface">{value}</div>
    </div>
  );
}

function SectionHeader({ title, meta }: { title: string; meta?: string }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h3 className="font-display text-base font-semibold text-on-surface">{title}</h3>
      {meta && (
        <span className="font-mono text-[9px] uppercase tracking-wider text-on-surface-variant">{meta}</span>
      )}
    </div>
  );
}

function Note({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface-low border border-ghost rounded-sm p-2.5">
      {title && <div className="font-body text-sm font-semibold text-on-surface mb-1">{title}</div>}
      <div className="text-sm text-on-surface-variant">{children}</div>
    </div>
  );
}

function Chip({ children, variant = 'default' }: { children: React.ReactNode; variant?: string }) {
  const styles: Record<string, string> = {
    default: 'bg-surface-low text-on-surface-variant',
    green: 'bg-green-bg text-green',
    violet: 'bg-violet-bg text-violet',
    primary: 'bg-primary/10 text-primary',
  };
  return (
    <span className={`font-mono text-[11px] leading-tight py-0.5 px-2 rounded-sm ${styles[variant] || styles.default}`}>
      {children}
    </span>
  );
}

// ── Duration bar colors ──────────────────────────────────────

const DURATION_COLORS = ['bg-primary', 'bg-green', 'bg-violet'];

// ── Main export page ─────────────────────────────────────────

export function ProjectExportPage({ data }: { data: ProjectRenderData }) {
  const { project, sessions } = data;
  const allSessions = data.allSessions || sessions;

  const stats = [
    { label: 'Sessions', value: project.totalSessions },
    {
      label: project.totalAgentDurationMinutes ? 'You / Agents' : 'Time',
      value: project.totalAgentDurationMinutes
        ? `${formatDuration(project.totalDurationMinutes)} / ${formatDuration(project.totalAgentDurationMinutes)}`
        : formatDuration(project.totalDurationMinutes),
    },
    { label: 'LOC', value: formatLoc(project.totalLoc) },
    { label: 'Files', value: project.totalFilesChanged },
  ];

  // Source breakdown
  const sourceCounts = sessions.reduce<Record<string, number>>((acc, s) => {
    const src = s.sourceTool || 'unknown';
    acc[src] = (acc[src] || 0) + 1;
    return acc;
  }, {});

  return (
    <div style={{ maxWidth: '960px', margin: '0 auto', padding: '2rem 1.5rem' }}>
      {/* Title + date */}
      <div className="mb-1">
        <h1 className="font-display text-xl font-bold text-on-surface">{project.title}</h1>
      </div>

      {/* Project links */}
      {(project.repoUrl || project.projectUrl) && (
        <div className="flex items-center gap-4 mt-1 mb-1">
          {project.repoUrl && (
            <a href={project.repoUrl} target="_blank" rel="noopener noreferrer"
              className="font-mono text-xs text-primary hover:underline flex items-center gap-1">
              <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
              {project.repoUrl.replace(/^https?:\/\/(www\.)?/, '').replace(/\.git$/, '')}
            </a>
          )}
          {project.projectUrl && (
            <a href={project.projectUrl} target="_blank" rel="noopener noreferrer"
              className="font-mono text-xs text-primary hover:underline flex items-center gap-1">
              <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M6.5 10.5l3-3m-1.5-2a2.5 2.5 0 013.54 3.54l-1.5 1.5m-4.08-1.08a2.5 2.5 0 01-3.54-3.54l1.5-1.5"/></svg>
              {project.projectUrl.replace(/^https?:\/\/(www\.)?/, '')}
            </a>
          )}
        </div>
      )}

      <div className="h-4" />

      {/* Screenshot with browser chrome */}
      {project.screenshotUrl && (
        <div className="rounded-md border border-ghost overflow-hidden shadow-sm mb-4">
          <div className="flex items-center gap-1.5 px-3 py-2 bg-surface-low border-b border-ghost">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#ff5f57' }} />
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#febc2e' }} />
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#28c840' }} />
          </div>
          <div className="max-h-96 overflow-y-auto">
            <img src={project.screenshotUrl} alt={`${project.title} screenshot`} className="w-full h-auto" />
          </div>
        </div>
      )}

      {/* Narrative */}
      {project.narrative && (
        <Card className="mb-4">
          <SectionHeader title="Narrative summary" />
          <p className="leading-relaxed text-on-surface border-l-[3px] border-primary pl-3"
            style={{ fontSize: 'clamp(0.8125rem, 1.2vw, 1rem)' }}>
            {project.narrative}
          </p>
        </Card>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        {stats.map((s) => (
          <StatCard key={s.label} label={s.label} value={s.value} />
        ))}
      </div>

      {/* Work Timeline mount point */}
      <Card className="mb-4">
        <SectionHeader title="Work timeline" meta="sessions over time" />
        <div
          data-work-timeline="true"
          data-sessions={JSON.stringify(allSessions.map((s) => ({
            id: s.token, title: s.title, date: s.recordedAt,
            durationMinutes: s.durationMinutes, turns: s.turns,
            linesOfCode: s.locChanged, status: 'enhanced' as const,
            projectName: project.title, rawLog: [],
            skills: s.skills, source: s.sourceTool,
            filesChanged: s.filesChanged,
          })))}
        />
      </Card>

      {/* Growth Chart mount point */}
      <Card className="mb-4">
        <SectionHeader title="Project growth" meta="cumulative LOC" />
        <div
          data-growth-chart="true"
          data-total-loc={project.totalLoc}
          data-total-files={project.totalFilesChanged}
          data-sessions={JSON.stringify(allSessions.map((s) => ({
            id: s.token, title: s.title, date: s.recordedAt,
            durationMinutes: s.durationMinutes, turns: s.turns,
            linesOfCode: s.locChanged, status: 'enhanced' as const,
            projectName: project.title, rawLog: [],
          })))}
        />
      </Card>

      {/* Source breakdown + Skills */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        {project.skills?.length > 0 && (
          <Card>
            <SectionHeader title="Skills" />
            <div className="flex flex-wrap gap-1">
              {project.skills.map((skill) => (
                <Chip key={skill} variant="violet">{skill}</Chip>
              ))}
            </div>
          </Card>
        )}
        <Card>
          <SectionHeader title="Source breakdown" meta="provenance" />
          <table className="w-full border-collapse text-[0.8125rem]">
            <thead>
              <tr>
                <th className="text-left py-2 font-mono text-[9px] uppercase tracking-wider text-outline border-b border-ghost">Source</th>
                <th className="text-left py-2 font-mono text-[9px] uppercase tracking-wider text-outline border-b border-ghost">Count</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(sourceCounts).map(([tool, count]) => (
                <tr key={tool}>
                  <td className="py-2 border-b border-ghost">{tool}</td>
                  <td className="py-2 border-b border-ghost">{count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      {/* Session cards */}
      {sessions.length > 0 && (
        <Card>
          <SectionHeader title="Sessions" meta={`${sessions.length} total`} />
          <div className="grid grid-cols-2 gap-3">
            {sessions.map((s, i) => (
              <SessionCardItem key={s.token} session={s} index={i} baseUrl={data.sessionBaseUrl} />
            ))}
          </div>
        </Card>
      )}

      {/* Footer */}
      <div className="mt-8 pt-4 border-t border-ghost text-center">
        <span className="font-mono text-[10px] text-on-surface-variant uppercase tracking-wider">
          exported from heyi.am
        </span>
      </div>
    </div>
  );
}

function SessionCardItem({ session, index, baseUrl }: { session: SessionCard; index: number; baseUrl?: string }) {
  const href = baseUrl ? `${baseUrl}/${session.slug || session.token}` : undefined;
  const card = (
    <div className="bg-surface-lowest border border-ghost rounded-sm p-4">
      <div className={`h-1 rounded-full mb-3 ${DURATION_COLORS[index % DURATION_COLORS.length]}`} />
      <h4 className="font-display text-[0.8125rem] font-semibold text-on-surface mb-1 line-clamp-2">
        {session.title}
      </h4>
      <span className="text-on-surface-variant text-xs">
        {formatDuration(session.durationMinutes)} &middot; {session.turns} turns &middot; {formatLoc(session.locChanged)} LOC
      </span>
      {session.skills?.[0] && (
        <div className="mt-2">
          <Chip variant="violet">{session.skills[0]}</Chip>
        </div>
      )}
    </div>
  );

  if (href) {
    return <a href={href} style={{ textDecoration: 'none', color: 'inherit' }}>{card}</a>;
  }
  return card;
}
