import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from './AppShell';
import type { Session, Project } from '../types';
import { MOCK_SESSIONS, MOCK_PROJECTS } from '../mock-data';

export type { Session, Project };
export { MOCK_SESSIONS, MOCK_PROJECTS };

/* ==========================================================================
   Helpers
   ========================================================================== */

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function formatDuration(minutes: number): string {
  return `${minutes} min`;
}

function deriveProjects(sessions: Session[]): Project[] {
  const map = new Map<string, number>();
  for (const s of sessions) {
    map.set(s.projectName, (map.get(s.projectName) ?? 0) + 1);
  }
  return Array.from(map.entries()).map(([name, count]) => ({
    name,
    sessionCount: count,
    description: '',
  }));
}

/* ==========================================================================
   Terminal log line renderer
   ========================================================================== */

function LogLine({ line }: { line: string }) {
  if (line.startsWith('[AI]')) {
    return (
      <div className="terminal-line">
        <span className="terminal-line--ai">{line.substring(0, 4)}</span>
        {line.substring(4)}
      </div>
    );
  }
  if (line.startsWith('>')) {
    return (
      <div className="terminal-line">
        <span className="terminal-line--prompt">&gt;</span>
        {line.substring(1)}
      </div>
    );
  }
  if (line === '...') {
    return (
      <div className="terminal-line">
        <span className="terminal-line--dim">...</span>
      </div>
    );
  }
  if (line.startsWith('[')) {
    return (
      <div className="terminal-line">
        <span className="terminal-line--success">{line}</span>
      </div>
    );
  }
  return <div className="terminal-line">{line}</div>;
}

/* ==========================================================================
   Component
   ========================================================================== */

interface SessionListProps {
  sessions?: Session[];
  projects?: Project[];
}

export function SessionList({
  sessions = MOCK_SESSIONS,
  projects: projectsProp,
}: SessionListProps = {}) {
  const navigate = useNavigate();
  const projects = projectsProp ?? (sessions === MOCK_SESSIONS ? MOCK_PROJECTS : deriveProjects(sessions));

  const [selectedProject, setSelectedProject] = useState<string | null>(
    projects.length > 0 ? projects[0].name : null,
  );
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  const isEmpty = sessions.length === 0;

  const filteredSessions = selectedProject
    ? sessions.filter((s) => s.projectName === selectedProject)
    : sessions;

  const selectedSession = selectedSessionId
    ? sessions.find((s) => s.id === selectedSessionId) ?? null
    : null;

  const activeProject = selectedProject
    ? projects.find((p) => p.name === selectedProject) ?? null
    : null;

  /* ---------- Empty state ---------- */

  if (isEmpty) {
    return (
      <AppShell title="Sessions">
        <div style={{ padding: 'var(--spacing-6)' }}>
          <div className="setup-banner" data-testid="setup-banner">
            <span className="setup-banner__icon">&#9888;</span>
            <span className="setup-banner__text">
              Add your Anthropic API key to enable AI summaries
            </span>
            <button
              type="button"
              className="btn btn-secondary setup-banner__action"
              style={{ fontSize: '0.75rem', padding: '4px 12px' }}
              onClick={() => navigate('/settings')}
            >
              Settings
            </button>
          </div>

          <div className="empty-state">
            <div className="empty-state__icon">&#128196;</div>
            <h2 className="empty-state__title">No sessions found</h2>
            <p className="empty-state__desc">
              Claude Code sessions from{' '}
              <code
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.8125rem',
                  background: 'var(--surface-container-low)',
                  padding: '2px 6px',
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                ~/.claude/projects
              </code>{' '}
              will appear here.
            </p>
            <div className="empty-state__cmd">
              <code>$ claude  # start a session first</code>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  /* ---------- Sidebar ---------- */

  const publishedCount = sessions.filter((s) => s.status === 'published').length;
  const enhancedCount = sessions.filter((s) => s.status !== 'draft').length;

  const sidebarContent = (
    <>
      <div className="app-sidebar__section">
        <p className="app-sidebar__label">Projects</p>
        <ul className="app-sidebar__list">
          {projects.map((project) => (
            <li key={project.name}>
              <button
                type="button"
                className={`app-sidebar__item${selectedProject === project.name ? ' app-sidebar__item--active' : ''}`}
                onClick={() => {
                  setSelectedProject(project.name);
                  setSelectedSessionId(null);
                }}
              >
                <span className="app-sidebar__dot" />
                {project.name}
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="app-sidebar__section">
        <p className="app-sidebar__label">Stats</p>
        <div className="sidebar-stats">
          <div>Sessions: <strong>{sessions.length}</strong></div>
          <div>Enhanced: <strong>{enhancedCount}</strong></div>
          <div>Published: <strong>{publishedCount}</strong></div>
        </div>
      </div>
    </>
  );

  /* ---------- Main content ---------- */

  return (
    <AppShell
      title="Sessions"
      showSidebar
      sidebarContent={sidebarContent}
    >
      <div className="session-browser">
        {/* Session list column */}
        <div>
          <h2 className="session-browser__heading">
            {activeProject ? activeProject.name : 'All Sessions'}
          </h2>
          <p className="session-browser__subtitle">
            {filteredSessions.length} sessions
            {activeProject?.description ? ` \u00b7 ${activeProject.description}` : ''}
          </p>

          <div className="session-browser__search">
            <span className="session-browser__search-icon">&#128269;</span>
            <input
              className="session-browser__search-input"
              placeholder="Search sessions..."
              readOnly
            />
          </div>

          <div className="session-browser__table-header">
            <span>Session</span>
            <span>Duration</span>
            <span>Status</span>
            <span></span>
          </div>

          {filteredSessions.map((session) => (
            <button
              key={session.id}
              type="button"
              className={`session-browser__row${selectedSessionId === session.id ? ' session-browser__row--selected' : ''}`}
              onClick={() => setSelectedSessionId(session.id)}
            >
              <div>
                <div className="session-browser__row-title">{session.title}</div>
                <div className="session-browser__row-meta">
                  {formatDate(session.date)} &middot; {session.turns} turns
                </div>
              </div>
              <span className="session-browser__row-duration">
                {formatDuration(session.durationMinutes)}
              </span>
              <span className={`chip chip--${session.status}`}>
                {session.status.toUpperCase()}
              </span>
              <span className="session-browser__row-arrow">&#8594;</span>
            </button>
          ))}
        </div>

        {/* Preview panel */}
        <div className="session-browser__preview">
          <div className="session-browser__preview-label">
            Raw Session Log Preview
          </div>
          <div className="terminal session-browser__preview-terminal">
            {selectedSession ? (
              <>
                {selectedSession.rawLog.map((line, i) => (
                  <LogLine key={i} line={line} />
                ))}
                <div className="terminal-line">
                  <span className="raw-log__cursor" />
                </div>
              </>
            ) : (
              <div className="terminal-line--dim" style={{ fontStyle: 'italic' }}>
                Select a session to preview
              </div>
            )}
          </div>
          <a
            href={selectedSession ? `/session/${selectedSession.id}/enhance` : '#'}
            className="btn btn-primary btn--lg btn--full"
            style={{
              marginTop: 'var(--spacing-4)',
              justifyContent: 'center',
              pointerEvents: selectedSession ? 'auto' : 'none',
              opacity: selectedSession ? 1 : 0.5,
            }}
          >
            Enhance with AI
          </a>
          <div className="session-browser__enhance-subtitle">
            Requires API key
          </div>
        </div>
      </div>
    </AppShell>
  );
}
