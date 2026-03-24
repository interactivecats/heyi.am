import React from 'react';
import type { ProjectRenderData, SessionCard, ProjectTimeline } from '../types.js';

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = minutes / 60;
  return hours >= 10 ? `${Math.round(hours)}h` : `${hours.toFixed(1)}h`;
}

function formatLoc(loc: number): string {
  if (loc < 1000) return String(loc);
  return `${(loc / 1000).toFixed(1)}k`;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const SESSION_BAR_COLORS = ['var(--primary)', 'var(--secondary)', 'var(--tertiary)'];
const INITIAL_SESSIONS = 6;
const INITIAL_TIMELINE_PERIODS = 3;

function CollapsedSessions({ sessions }: { sessions: TimelineSessionEntry[] }) {
  const titles = sessions.map((s) => s.title.toLowerCase()).join(', ');
  const dates = sessions
    .filter((s) => s.date)
    .map((s) => s.date as string)
    .sort();
  const dateRange = dates.length >= 2
    ? `${formatDate(dates[0])} \u2013 ${formatDate(dates[dates.length - 1])}`
    : dates.length === 1
      ? formatDate(dates[0])
      : '';

  return (
    <span className="timeline__collapsed-text">
      {sessions.length} smaller session{sessions.length !== 1 ? 's' : ''} &mdash; {titles}
      {dateRange && <> &middot; {dateRange}</>}
    </span>
  );
}

interface TimelineSessionEntry {
  sessionId: string;
  title: string;
  description?: string;
  duration: number;
  featured: boolean;
  tag?: string;
  skills?: string[];
  date?: string;
}

function SessionCardItem({ session, index, maxDuration }: {
  session: SessionCard;
  index: number;
  maxDuration: number;
}) {
  const barColor = SESSION_BAR_COLORS[index % SESSION_BAR_COLORS.length];
  const barWidth = maxDuration > 0
    ? Math.max(20, Math.round((session.durationMinutes / maxDuration) * 100))
    : 100;

  return (
    <div className="project-preview__session-card">
      <div
        className="project-preview__session-bar"
        style={{ width: `${barWidth}%`, background: barColor }}
      />
      <h3 className="project-preview__session-title">{session.title}</h3>
      <div className="project-preview__session-stats">
        {Math.round(session.durationMinutes)} min
        {' \u00B7 '}{session.turns} turns
        {session.filesChanged > 0 && <>{' \u00B7 '}{session.filesChanged} files</>}
        {' \u00B7 '}{formatLoc(session.locChanged)} LOC
      </div>
      {session.skills.length > 0 && (
        <div className="project-preview__session-skills">
          {session.skills.map((skill) => (
            <span key={skill} className="chip">{skill}</span>
          ))}
        </div>
      )}
    </div>
  );
}

interface ParsedPeriod {
  period: string;
  label: string;
  featured: TimelineSessionEntry[];
  collapsed: TimelineSessionEntry[];
}

function TimelinePeriodBlock({ period }: { period: ParsedPeriod }) {
  return (
    <div className="timeline__period">
      <div className="timeline__period-header">
        <span className="timeline__period-date">{period.period}</span>
        <span className="timeline__period-sep">&mdash;</span>
        <span className="timeline__period-label">{period.label}</span>
      </div>

      {period.featured.map((s) => (
        <div key={s.sessionId} className="timeline__featured">
          <div className="timeline__dot--large" />
          <div className="timeline__card">
            <div className="timeline__card-header">
              <span className="timeline__card-title">{s.title}</span>
              {s.tag && (
                <span className="timeline__card-tag">{s.tag}</span>
              )}
            </div>
            <div className="timeline__card-meta">
              <span>{formatDuration(s.duration)}</span>
              {s.date && <span>{formatDate(s.date)}</span>}
            </div>
            {s.description && (
              <p className="timeline__card-desc">{s.description}</p>
            )}
            {s.skills && s.skills.length > 0 && (
              <div className="timeline__card-skills">
                {s.skills.map((skill) => (
                  <span key={skill} className="chip">{skill}</span>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}

      {period.collapsed.map((s) => (
        <div key={s.sessionId} className="timeline__collapsed">
          <div className="timeline__dot--small" />
          <div className="timeline__collapsed-card">
            <span className="timeline__collapsed-title">{s.title}</span>
            <span className="timeline__collapsed-meta">
              {formatDuration(s.duration)}
              {s.date && <> &middot; {formatDate(s.date)}</>}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function ProjectPage({ data }: { data: ProjectRenderData }) {
  const { user, project, sessions } = data;
  const maxDuration = sessions.length > 0
    ? Math.max(...sessions.map((s) => s.durationMinutes))
    : 1;

  // Parse timeline sessions for featured/collapsed rendering
  const timelinePeriods: Array<{
    period: string;
    label: string;
    featured: TimelineSessionEntry[];
    collapsed: TimelineSessionEntry[];
  }> = (project.timeline || []).map((t: ProjectTimeline) => {
    const entries: TimelineSessionEntry[] = (t.sessions || []).map((s: Record<string, unknown>) => ({
      sessionId: (s.sessionId as string) || '',
      title: (s.title as string) || '',
      description: s.description as string | undefined,
      duration: (s.duration as number) || 0,
      featured: (s.featured as boolean) || false,
      tag: s.tag as string | undefined,
      skills: (s.skills as string[]) || [],
      date: s.date as string | undefined,
    }));
    return {
      period: t.period,
      label: t.label,
      featured: entries.filter((s) => s.featured),
      collapsed: entries.filter((s) => !s.featured),
    };
  });

  return (
    <div className="project-preview__content" data-render-version="1" data-template="editorial">
      {/* Breadcrumb */}
      <div className="project-preview__breadcrumb">
        <a href={`/${user.username}`}>{user.username}</a> / {project.title}
      </div>

      {/* Title */}
      <h1 className="project-preview__title">{project.title}</h1>

      {/* Links */}
      {(project.repoUrl || project.projectUrl) && (
        <div className="project-preview__links">
          {project.repoUrl && (
            <a
              href={project.repoUrl}
              className="project-preview__link"
              target="_blank"
              rel="noopener noreferrer"
            >
              Repository
            </a>
          )}
          {project.projectUrl && (
            <a
              href={project.projectUrl}
              className="project-preview__link"
              target="_blank"
              rel="noopener noreferrer"
            >
              Live site
            </a>
          )}
        </div>
      )}

      {/* Narrative */}
      {project.narrative && (
        <div className="project-preview__narrative">
          {project.narrative}
        </div>
      )}

      {/* Skills */}
      {project.skills.length > 0 && (
        <div className="project-preview__skills">
          {project.skills.map((skill) => (
            <span key={skill} className="chip">{skill}</span>
          ))}
        </div>
      )}

      {/* Hero stats */}
      <div className="project-preview__hero-stats">
        <div className="project-preview__hero-stat">
          <div className="project-preview__hero-value project-preview__hero-value--primary">
            {project.totalAgentDurationMinutes
              ? `${formatDuration(project.totalDurationMinutes)} / ${formatDuration(project.totalAgentDurationMinutes)}`
              : formatDuration(project.totalDurationMinutes)}
          </div>
          <div className="project-preview__hero-label">
            {project.totalAgentDurationMinutes ? 'You / Agents' : 'Total Time'}
          </div>
        </div>
        <div className="project-preview__hero-stat">
          <div className="project-preview__hero-value">
            {project.totalSessions} ({sessions.length})
          </div>
          <div className="project-preview__hero-label">Sessions</div>
        </div>
        <div className="project-preview__hero-stat">
          <div className="project-preview__hero-value">{formatLoc(project.totalLoc)}</div>
          <div className="project-preview__hero-label">LOC</div>
        </div>
        <div className="project-preview__hero-stat">
          <div className="project-preview__hero-value">{project.totalFilesChanged}</div>
          <div className="project-preview__hero-label">Files</div>
        </div>
      </div>

      {/* Work Timeline mount point — JS from @heyiam/ui reads data-sessions and renders */}
      <div className="project-preview__timeline-heading">WORK TIMELINE</div>
      <div
        data-work-timeline
        data-sessions={JSON.stringify(sessions.map((s) => ({
          id: s.token, title: s.title, date: s.recordedAt,
          durationMinutes: s.durationMinutes, turns: s.turns,
          linesOfCode: s.locChanged, status: 'enhanced' as const,
          projectName: project.title, rawLog: [],
          skills: s.skills, source: s.sourceTool,
          filesChanged: s.filesChanged,
        })))}
      />

      {/* Project Timeline */}
      {timelinePeriods.length > 0 && (
        <>
          <div className="project-preview__timeline-heading">PROJECT TIMELINE</div>
          <div className="timeline">
            <div className="timeline__line" />
            {timelinePeriods.map((period, pIdx) => (
              <TimelinePeriodBlock key={pIdx} period={period} />
            ))}
          </div>
        </>
      )}

      {/* Growth Chart mount point — JS from @heyiam/ui reads data-sessions and renders */}
      <div className="project-preview__timeline-heading">PROJECT GROWTH</div>
      <div
        data-growth-chart
        data-total-loc={project.totalLoc}
        data-total-files={project.totalFilesChanged}
        data-sessions={JSON.stringify(sessions.map((s) => ({
          id: s.token, title: s.title, date: s.recordedAt,
          durationMinutes: s.durationMinutes, turns: s.turns,
          linesOfCode: s.locChanged, status: 'enhanced' as const,
          projectName: project.title, rawLog: [],
        })))}
      />

      {/* Session cards */}
      {sessions.length > 0 && (
        <>
          <div className="project-preview__sessions-heading">
            SESSIONS ({sessions.length})
          </div>
          <div className="project-preview__sessions-grid">
            {sessions.slice(0, INITIAL_SESSIONS).map((session, i) => (
              <SessionCardItem
                key={session.token}
                session={session}
                index={i}
                maxDuration={maxDuration}
              />
            ))}
          </div>
          {sessions.length > INITIAL_SESSIONS && (
            <details className="project-preview__sessions-more">
              <summary className="project-preview__sessions-expand">
                Show {sessions.length - INITIAL_SESSIONS} more sessions
              </summary>
              <div className="project-preview__sessions-grid">
                {sessions.slice(INITIAL_SESSIONS).map((session, i) => (
                  <SessionCardItem
                    key={session.token}
                    session={session}
                    index={i + INITIAL_SESSIONS}
                    maxDuration={maxDuration}
                  />
                ))}
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
}
