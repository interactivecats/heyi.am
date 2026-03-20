import { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { AppShell } from './AppShell';
import type { Session, Project, ChildSessionSummary } from '../types';
import { MOCK_SESSIONS, MOCK_PROJECTS } from '../mock-data';
import { useSessionsContext } from '../SessionsContext';

export type { Session, Project };
export { MOCK_SESSIONS, MOCK_PROJECTS };

const MAX_VISIBLE_CHILDREN = 5;

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
  sessions: sessionsProp,
  projects: projectsProp,
}: SessionListProps = {}) {
  const navigate = useNavigate();
  const ctx = useSessionsContext();

  const usingApi = sessionsProp == null;
  const projects = projectsProp ?? ctx.projects;
  const allSessions = sessionsProp ?? ctx.sessions;

  // Track which project is selected in the sidebar
  const [selectedDirName, setSelectedDirName] = useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());
  const [expandedMore, setExpandedMore] = useState<Set<string>>(new Set());

  const toggleExpanded = useCallback((sessionId: string) => {
    setExpandedParents((prev) => {
      const next = new Set(prev);
      if (next.has(sessionId)) next.delete(sessionId);
      else next.add(sessionId);
      return next;
    });
  }, []);

  const toggleMore = useCallback((sessionId: string) => {
    setExpandedMore((prev) => {
      const next = new Set(prev);
      if (next.has(sessionId)) next.delete(sessionId);
      else next.add(sessionId);
      return next;
    });
  }, []);

  // Auto-select first project when projects load
  useEffect(() => {
    if (projects.length > 0 && selectedDirName == null) {
      setSelectedDirName(projects[0].dirName);
    }
  }, [projects, selectedDirName]);

  // When project changes in API mode, tell context to lazy-load its sessions
  useEffect(() => {
    if (usingApi && selectedDirName) {
      ctx.selectProject(selectedDirName);
      setSelectedSessionId(null);
    }
  }, [usingApi, selectedDirName]); // eslint-disable-line react-hooks/exhaustive-deps

  // In prop mode, filter sessions locally by project name.
  // In API mode, context already returns sessions for the active project.
  const sessions = usingApi
    ? allSessions
    : selectedDirName
      ? allSessions.filter((s) => s.projectName === selectedDirName)
      : allSessions;

  // Loading projects
  if (usingApi && ctx.loading) {
    return (
      <AppShell title="Sessions">
        <div style={{ padding: 'var(--spacing-6)', textAlign: 'center' }}>
          <p className="text-body">Loading projects...</p>
        </div>
      </AppShell>
    );
  }

  // No projects at all
  if (projects.length === 0 && allSessions.length === 0) {
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

  // Selected session can be a parent or a child (matched by id or child sessionId)
  const selectedSession = selectedSessionId
    ? sessions.find((s) => s.id === selectedSessionId) ?? null
    : null;
  const isSelectedChild = selectedSessionId != null && selectedSession == null;
  const selectedChildParent = isSelectedChild
    ? sessions.find((s) => s.children?.some((c) => c.sessionId === selectedSessionId)) ?? null
    : null;

  const activeProject = selectedDirName
    ? projects.find((p) => p.dirName === selectedDirName) ?? null
    : null;

  /* ---------- Sidebar ---------- */

  const sidebarContent = (
    <>
      <div className="app-sidebar__section">
        <p className="app-sidebar__label">Projects</p>
        <ul className="app-sidebar__list">
          {projects.map((project) => (
            <li key={project.dirName}>
              <button
                type="button"
                className={`app-sidebar__item${selectedDirName === project.dirName ? ' app-sidebar__item--active' : ''}`}
                onClick={() => setSelectedDirName(project.dirName)}
              >
                <span className="app-sidebar__dot" />
                <span style={{ flex: 1 }}>{project.name}</span>
                <span className="label-mono" style={{ opacity: 0.5 }}>{project.sessionCount}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="app-sidebar__section">
        <p className="app-sidebar__label">Stats</p>
        <div className="sidebar-stats">
          <div>Sessions: <strong>{sessions.length}</strong></div>
          <div>Published: <strong>{sessions.filter((s) => s.status === 'published').length}</strong></div>
        </div>
      </div>
    </>
  );

  /* ---------- Main content ---------- */

  const isLoadingSessions = usingApi && ctx.loadingSessions;

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
            {isLoadingSessions
              ? 'Loading sessions...'
              : `${sessions.length} sessions`}
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

          {isLoadingSessions ? (
            <div style={{ padding: 'var(--spacing-6)', textAlign: 'center', opacity: 0.5 }}>
              Parsing session files...
            </div>
          ) : sessions.length === 0 ? (
            <div style={{ padding: 'var(--spacing-6)', textAlign: 'center', opacity: 0.5 }}>
              No sessions in this project
            </div>
          ) : (
            sessions.map((session) => {
              const hasChildren = (session.childCount ?? 0) > 0;
              const isExpanded = expandedParents.has(session.id);
              const children = session.children ?? [];
              const showAll = expandedMore.has(session.id);
              const visibleChildren = showAll ? children : children.slice(0, MAX_VISIBLE_CHILDREN);
              const hiddenCount = children.length - MAX_VISIBLE_CHILDREN;

              return (
                <div key={session.id}>
                  {/* Parent row */}
                  <button
                    type="button"
                    className={`session-browser__row${hasChildren ? ' session-browser__row--parent' : ''}${selectedSessionId === session.id ? ' session-browser__row--selected' : ''}`}
                    onClick={() => setSelectedSessionId(session.id)}
                    data-testid={hasChildren ? 'parent-row' : undefined}
                  >
                    <div>
                      <div className="session-browser__row-title">
                        {hasChildren && (
                          <span
                            className="session-browser__disclosure"
                            onClick={(e) => { e.stopPropagation(); toggleExpanded(session.id); }}
                            data-testid="disclosure-toggle"
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); e.preventDefault(); toggleExpanded(session.id); } }}
                          >
                            {isExpanded ? '\u25BE' : '\u25B8'}
                          </span>
                        )}
                        {session.title}
                      </div>
                      <div className="session-browser__row-meta">
                        {formatDate(session.date)} &middot; {session.turns} turns
                        {hasChildren && (
                          <>
                            {' '}&middot;{' '}
                            <span className="session-browser__agent-count" data-testid="agent-count">
                              {session.childCount} agent{session.childCount === 1 ? '' : 's'}
                            </span>
                          </>
                        )}
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

                  {/* Child rows */}
                  {hasChildren && isExpanded && (
                    <div data-testid="children-container">
                      {visibleChildren.map((child: ChildSessionSummary) => (
                        <button
                          key={child.sessionId}
                          type="button"
                          className={`session-browser__row session-browser__row--child${selectedSessionId === child.sessionId ? ' session-browser__row--selected' : ''}`}
                          onClick={() => setSelectedSessionId(child.sessionId)}
                          data-testid="child-row"
                        >
                          <div className="session-browser__connector" />
                          <div>
                            <div className="session-browser__row-title">
                              {child.role && (
                                <span className="session-browser__child-role" data-testid="child-role">
                                  {child.role}
                                </span>
                              )}
                              {child.title ?? child.sessionId}
                            </div>
                            {(child.durationMinutes != null || child.linesOfCode != null) && (
                              <div className="session-browser__row-meta">
                                {child.durationMinutes != null && `${child.durationMinutes} min`}
                                {child.durationMinutes != null && child.linesOfCode != null && ' \u00B7 '}
                                {child.linesOfCode != null && `${child.linesOfCode} LOC`}
                              </div>
                            )}
                          </div>
                          <span className="session-browser__row-duration" />
                          <span />
                          <span />
                        </button>
                      ))}
                      {!showAll && hiddenCount > 0 && (
                        <button
                          type="button"
                          className="session-browser__expand-more"
                          onClick={() => toggleMore(session.id)}
                          data-testid="expand-more"
                        >
                          ... {hiddenCount} more agent{hiddenCount === 1 ? '' : 's'}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Preview panel */}
        <div className="session-browser__preview">
          <div className="session-browser__preview-label">
            {selectedSession && (selectedSession.childCount ?? 0) > 0
              ? 'Orchestration Summary'
              : isSelectedChild
                ? 'Agent Session Preview'
                : 'Raw Session Log Preview'}
          </div>
          <div className="terminal session-browser__preview-terminal">
            {selectedSession && (selectedSession.childCount ?? 0) > 0 ? (
              <div data-testid="orchestration-preview">
                <div className="terminal-line">
                  <span className="terminal-line--prompt">Delegation</span>
                </div>
                {(selectedSession.children ?? []).map((child: ChildSessionSummary) => (
                  <div key={child.sessionId} className="terminal-line">
                    <span className="terminal-line--success">
                      {child.role ? child.role.toUpperCase() : 'AGENT'}
                    </span>
                    {' '}{child.title ?? child.sessionId}
                    {child.linesOfCode != null && ` — ${child.linesOfCode} LOC`}
                    {child.durationMinutes != null && `, ${child.durationMinutes} min`}
                  </div>
                ))}
              </div>
            ) : selectedSession ? (
              <>
                {selectedSession.rawLog.map((line, i) => (
                  <LogLine key={i} line={line} />
                ))}
                <div className="terminal-line">
                  <span className="raw-log__cursor" />
                </div>
              </>
            ) : isSelectedChild && selectedChildParent ? (
              <div className="terminal-line--dim" style={{ fontStyle: 'italic' }}>
                Agent session — open full detail to view log
              </div>
            ) : (
              <div className="terminal-line--dim" style={{ fontStyle: 'italic' }}>
                Select a session to preview
              </div>
            )}
          </div>
          <Link
            to={selectedSession ? `/session/${selectedSession.id}` : '#'}
            className="btn btn-primary btn--lg btn--full"
            style={{
              marginTop: 'var(--spacing-4)',
              justifyContent: 'center',
              pointerEvents: selectedSession ? 'auto' : 'none',
              opacity: selectedSession ? 1 : 0.5,
            }}
          >
            View Summary
          </Link>
          <Link
            to={selectedSession ? `/session/${selectedSession.id}/enhance` : '#'}
            className="btn btn-secondary btn--full"
            style={{
              marginTop: 'var(--spacing-2)',
              justifyContent: 'center',
              pointerEvents: selectedSession ? 'auto' : 'none',
              opacity: selectedSession ? 1 : 0.5,
            }}
          >
            Enhance with AI
          </Link>
          <div className="session-browser__enhance-subtitle">
            Enhancement requires API key
          </div>
        </div>
      </div>
    </AppShell>
  );
}
