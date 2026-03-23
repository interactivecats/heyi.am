import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSessionsContext } from '../SessionsContext';
import { AppShell } from './AppShell';
import { fetchEnhanceStatus } from '../api';
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
  const enhancedAt = project.enhancedAt;
  const uploadUrl = `/project/${encodeURIComponent(project.dirName)}/upload`;

  return (
    <div
      className="project-card"
      onClick={() => navigate(enhancedAt ? `${uploadUrl}?view=1` : uploadUrl)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter') navigate(enhancedAt ? `${uploadUrl}?view=1` : uploadUrl);
      }}
    >
      <div className="project-card__header">
        <div>
          <div className="project-card__title-row">
            <div className="project-card__dot" style={{ background: color }} />
            <h3 className="project-card__name">{project.name}</h3>
            {project.isPublished && (
              <span className="project-card__badge project-card__badge--published">
                Published
              </span>
            )}
            {enhancedAt && (
              <span className="project-card__badge">Enhanced</span>
            )}
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
        <div className="project-card__actions">
          {enhancedAt && (
            <button
              className="btn btn--secondary project-card__upload-btn"
              onClick={(e) => {
                e.stopPropagation();
                navigate(`${uploadUrl}?view=1`);
              }}
            >
              View
            </button>
          )}
          <button
            className="btn btn--primary project-card__upload-btn"
            onClick={(e) => {
              e.stopPropagation();
              navigate(uploadUrl);
            }}
          >
            {project.isPublished ? 'Update Project' : enhancedAt ? 'Re-enhance' : 'Upload'} &rarr;
          </button>
        </div>
      </div>

      <div className="project-card__stats">
        <StatCell label="Sessions" value={String(project.sessionCount)} />
        <StatCell label={project.totalAgentDuration ? 'Your Time' : 'Time'} value={formatDuration(project.totalDuration)} />
        {project.totalAgentDuration && project.totalAgentDuration > 0 && (
          <StatCell label="Agent Time" value={formatDuration(project.totalAgentDuration)} />
        )}
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
  const [hasApiKey, setHasApiKey] = useState(true);

  useEffect(() => {
    fetchEnhanceStatus().then((status) => {
      setHasApiKey(status.mode !== 'none');
    });
  }, []);

  return (
    <AppShell title="heyi.am">
      {!hasApiKey && (
        <div className="dashboard-banner">
          No Anthropic API key configured.{' '}
          <button
            type="button"
            className="dashboard-banner__link"
            onClick={() => navigate('/settings')}
          >
            Add one in Settings
          </button>{' '}
          to enable AI enhancement.
        </div>
      )}
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
