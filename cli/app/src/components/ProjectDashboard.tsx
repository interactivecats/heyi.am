import { useNavigate } from 'react-router-dom';
import { useSessionsContext } from '../SessionsContext';
import { AppShell } from './AppShell';
import type { Project } from '../types';

const PROJECT_COLORS = ['var(--primary)', 'var(--secondary)', 'var(--tertiary)'];

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = minutes / 60;
  return hours >= 10 ? `${Math.round(hours)}h` : `${hours.toFixed(1)}h`;
}

function formatLoc(loc: number): string {
  if (loc < 1000) return String(loc);
  return `${(loc / 1000).toFixed(1)}k`;
}

function formatDateRange(dateRange: string): string {
  if (!dateRange) return '';
  const [first, last] = dateRange.split('|');
  if (!first || !last) return '';

  const d1 = new Date(first);
  const d2 = new Date(last);
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const year = d2.getFullYear();

  if (d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate()) {
    return `${fmt(d1)}, ${year}`;
  }
  return `${fmt(d1)}–${fmt(d2)}, ${year}`;
}

function timeAgo(dateStr: string): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w ago`;
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="project-card__stat-label">{label}</div>
      <div className="project-card__stat-value">{value}</div>
    </div>
  );
}

function ProjectCard({ project, index }: { project: Project; index: number }) {
  const navigate = useNavigate();
  const color = PROJECT_COLORS[index % PROJECT_COLORS.length];

  return (
    <div
      className="project-card"
      onClick={() => navigate(`/project/${encodeURIComponent(project.dirName)}/upload`)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter') navigate(`/project/${encodeURIComponent(project.dirName)}/upload`);
      }}
    >
      <div className="project-card__header">
        <div>
          <div className="project-card__title-row">
            <div className="project-card__dot" style={{ background: color }} />
            <h3 className="project-card__name">{project.name}</h3>
          </div>
          {project.description && (
            <p className="project-card__desc">{project.description}</p>
          )}
          <div className="project-card__date">
            {formatDateRange(project.dateRange)}
            {project.lastSessionDate && (
              <span className="project-card__date-ago"> &middot; last session {timeAgo(project.lastSessionDate)}</span>
            )}
          </div>
        </div>
        <button
          className="btn btn--primary project-card__upload-btn"
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/project/${encodeURIComponent(project.dirName)}/upload`);
          }}
        >
          Upload &rarr;
        </button>
      </div>

      <div className="project-card__stats">
        <StatCell label="Sessions" value={String(project.sessionCount)} />
        <StatCell label="Time" value={formatDuration(project.totalDuration)} />
        <StatCell label="LOC" value={formatLoc(project.totalLoc)} />
        <StatCell label="Files" value={String(project.totalFiles)} />
      </div>

      {project.skills.length > 0 && (
        <div className="project-card__skills">
          {project.skills.map((skill) => (
            <span key={skill} className="skill-chip">{skill}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="empty-state">
      <div className="empty-state__icon">&#128196;</div>
      <h2 className="empty-state__title">No sessions found</h2>
      <p className="empty-state__text">
        Claude Code sessions from <code>~/.claude/projects</code> will appear here.
      </p>
      <div className="empty-state__hint">
        <code>$ claude  # start a session first</code>
      </div>
    </div>
  );
}

export function ProjectDashboard() {
  const { projects, loading, error } = useSessionsContext();
  const navigate = useNavigate();

  return (
    <AppShell
      title="heyi.am"
      headerActions={
        <button
          className="topbar-icon-btn"
          onClick={() => navigate('/settings')}
          aria-label="Settings"
        >
          &#9881;
        </button>
      }
    >
      {loading ? (
        <div className="dashboard-loading">Loading projects...</div>
      ) : error ? (
        <div className="dashboard-error">{error}</div>
      ) : projects.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="dashboard">
          <h1 className="dashboard__title">Your Projects</h1>
          <p className="dashboard__subtitle">
            Pick a project to upload. The AI will read your sessions, pick the ones worth showcasing, and build the narrative for you.
          </p>
          <div className="dashboard__cards">
            {projects.map((project, i) => (
              <ProjectCard key={project.dirName} project={project} index={i} />
            ))}
          </div>
        </div>
      )}
    </AppShell>
  );
}
