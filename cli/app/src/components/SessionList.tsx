import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { AppShell } from './AppShell';
import type { Session, Project, ChildSessionSummary } from '../types';
import { MOCK_SESSIONS, MOCK_PROJECTS } from '../mock-data';
import { useSessionsContext } from '../SessionsContext';
import { bulkEnhance, bulkUpload, type BulkEnhanceEvent, type BulkUploadEvent } from '../api';

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
   Bulk enhance state
   ========================================================================== */

type BulkStatus = 'idle' | 'enhancing' | 'uploading' | 'done';

interface BulkProgress {
  completed: number;
  total: number;
  /** Per-session status overrides (sessionId -> chip status) */
  sessionStatuses: Map<string, 'queued' | 'processing' | 'enhanced' | 'uploaded' | 'failed'>;
  /** AI-generated titles for enhanced sessions (sessionId -> new title) */
  enhancedTitles: Map<string, string>;
  enhanced: number;
  failed: number;
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

  // Bulk selection state
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const lastCheckedRef = useRef<string | null>(null);

  // Bulk enhance state
  const [bulkStatus, setBulkStatus] = useState<BulkStatus>('idle');
  const [bulkProgress, setBulkProgress] = useState<BulkProgress>({
    completed: 0,
    total: 0,
    sessionStatuses: new Map(),
    enhancedTitles: new Map(),
    enhanced: 0,
    failed: 0,
  });
  const bulkAbortRef = useRef<AbortController | null>(null);

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
      setCheckedIds(new Set());
    }
  }, [usingApi, selectedDirName]); // eslint-disable-line react-hooks/exhaustive-deps

  // In prop mode, filter sessions locally by project name.
  // In API mode, context already returns sessions for the active project.
  const sessions = usingApi
    ? allSessions
    : selectedDirName
      ? allSessions.filter((s) => s.projectName === selectedDirName)
      : allSessions;

  // Checkbox handlers — checkboxes on all sessions (published excluded)
  const selectableSessions = sessions.filter((s) => s.status !== 'published');

  const toggleChecked = useCallback(
    (sessionId: string, shiftKey: boolean) => {
      setCheckedIds((prev) => {
        const next = new Set(prev);

        if (shiftKey && lastCheckedRef.current) {
          const ids = selectableSessions.map((s) => s.id);
          const lastIdx = ids.indexOf(lastCheckedRef.current);
          const curIdx = ids.indexOf(sessionId);
          if (lastIdx !== -1 && curIdx !== -1) {
            const [start, end] = lastIdx < curIdx ? [lastIdx, curIdx] : [curIdx, lastIdx];
            for (let i = start; i <= end; i++) {
              next.add(ids[i]);
            }
            return next;
          }
        }

        if (next.has(sessionId)) next.delete(sessionId);
        else next.add(sessionId);
        return next;
      });
      lastCheckedRef.current = sessionId;
    },
    [selectableSessions],
  );

  const toggleSelectAll = useCallback(() => {
    setCheckedIds((prev) => {
      const allChecked = selectableSessions.every((s) => prev.has(s.id));
      if (allChecked) return new Set();
      return new Set(selectableSessions.map((s) => s.id));
    });
  }, [selectableSessions]);

  // Bulk enhance handler
  const startBulkEnhance = useCallback(() => {
    const selected = sessions.filter((s) => checkedIds.has(s.id));
    if (selected.length === 0) return;

    const sessionReqs = selected.map((s) => ({
      projectName: s.projectName,
      sessionId: s.id,
    }));

    // Initialize progress with all as queued
    const statuses = new Map<string, 'queued' | 'processing' | 'enhanced' | 'failed'>();
    for (const s of selected) statuses.set(s.id, 'queued');

    setBulkStatus('enhancing');
    setBulkProgress({
      completed: 0,
      total: selected.length,
      sessionStatuses: statuses,
      enhancedTitles: new Map(),
      enhanced: 0,
      failed: 0,
    });

    const controller = bulkEnhance(
      sessionReqs,
      (event: BulkEnhanceEvent) => {
        if (event.type === 'progress' && event.sessionId) {
          setBulkProgress((prev) => {
            const nextStatuses = new Map(prev.sessionStatuses);
            nextStatuses.set(event.sessionId!, event.status as 'processing' | 'enhanced' | 'failed');

            const nextTitles = new Map(prev.enhancedTitles);
            if (event.status === 'enhanced' && event.title) {
              nextTitles.set(event.sessionId!, event.title);
            }

            return {
              ...prev,
              completed: event.completed ?? prev.completed,
              sessionStatuses: nextStatuses,
              enhancedTitles: nextTitles,
              enhanced: prev.enhanced + (event.status === 'enhanced' ? 1 : 0),
              failed: prev.failed + (event.status === 'failed' ? 1 : 0),
            };
          });
        }
        if (event.type === 'done') {
          setBulkStatus('done');
          setBulkProgress((prev) => ({
            ...prev,
            enhanced: event.enhanced ?? prev.enhanced,
            failed: event.failed ?? prev.failed,
          }));
          // Refresh sessions to pick up new enhanced statuses
          if (usingApi) ctx.refreshSessions();
        }
      },
      (error: Error) => {
        console.error('Bulk enhance error:', error);
        setBulkStatus('done');
      },
    );

    bulkAbortRef.current = controller;
  }, [checkedIds, sessions, usingApi, ctx]);

  const cancelBulk = useCallback(() => {
    bulkAbortRef.current?.abort();
    setBulkStatus('done');
  }, []);

  // Bulk upload handler
  const startBulkUpload = useCallback(() => {
    const selected = sessions.filter((s) => checkedIds.has(s.id) && s.status === 'enhanced');
    if (selected.length === 0) return;

    const sessionReqs = selected.map((s) => ({
      projectName: s.projectName,
      sessionId: s.id,
    }));

    const statuses = new Map<string, 'queued' | 'processing' | 'enhanced' | 'failed'>();
    for (const s of selected) statuses.set(s.id, 'queued');

    setBulkStatus('uploading');
    setBulkProgress({
      completed: 0,
      total: selected.length,
      sessionStatuses: statuses,
      enhancedTitles: new Map(),
      enhanced: 0,
      failed: 0,
    });

    const controller = bulkUpload(
      sessionReqs,
      (event: BulkUploadEvent) => {
        if (event.type === 'progress' && event.sessionId) {
          setBulkProgress((prev) => {
            const nextStatuses = new Map(prev.sessionStatuses);
            const chipStatus = event.status === 'uploading' ? 'processing'
              : event.status === 'uploaded' ? 'uploaded'
              : 'failed';
            nextStatuses.set(event.sessionId!, chipStatus);

            return {
              ...prev,
              completed: event.completed ?? prev.completed,
              sessionStatuses: nextStatuses,
              enhancedTitles: prev.enhancedTitles,
              enhanced: prev.enhanced + (event.status === 'uploaded' ? 1 : 0),
              failed: prev.failed + (event.status === 'failed' ? 1 : 0),
            };
          });
        }
        if (event.type === 'done') {
          setBulkStatus('done');
          setBulkProgress((prev) => ({
            ...prev,
            enhanced: event.uploaded ?? prev.enhanced,
            failed: event.failed ?? prev.failed,
          }));
          if (usingApi) ctx.refreshSessions();
        }
      },
      (error: Error) => {
        console.error('Bulk upload error:', error);
        setBulkStatus('done');
      },
    );

    bulkAbortRef.current = controller;
  }, [checkedIds, sessions, usingApi, ctx]);

  const dismissBulkBar = useCallback(() => {
    setBulkStatus('idle');
    setCheckedIds(new Set());
    setBulkProgress({
      completed: 0,
      total: 0,
      sessionStatuses: new Map(),
      enhancedTitles: new Map(),
      enhanced: 0,
      failed: 0,
    });
  }, []);

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

  // Checkbox helpers
  const checkedCount = checkedIds.size;
  const allSelectableChecked = selectableSessions.length > 0 && selectableSessions.every((s) => checkedIds.has(s.id));
  const someChecked = checkedCount > 0 && !allSelectableChecked;

  // Count checked sessions by status for showing relevant bulk actions
  const checkedDraftCount = sessions.filter((s) => checkedIds.has(s.id) && s.status === 'draft').length;
  const checkedEnhancedCount = sessions.filter((s) => checkedIds.has(s.id) && s.status === 'enhanced').length;

  // Resolve chip status: use bulk progress override if active, else session.status
  const getChipStatus = (session: Session): string => {
    const override = bulkProgress.sessionStatuses.get(session.id);
    if (override) return override;
    return session.status;
  };

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
          <div>Enhanced: <strong>{sessions.filter((s) => s.status === 'enhanced').length}</strong></div>
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
        <div style={{ position: 'relative' }}>
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
            {/* Select-all checkbox */}
            <span className="session-browser__checkbox-cell">
              {selectableSessions.length > 0 && (
                <input
                  type="checkbox"
                  checked={allSelectableChecked}
                  ref={(el) => { if (el) el.indeterminate = someChecked; }}
                  onChange={toggleSelectAll}
                  aria-label="Select all sessions"
                  data-testid="select-all-checkbox"
                  disabled={bulkStatus === 'enhancing' || bulkStatus === 'uploading'}
                />
              )}
            </span>
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
              const isSelectable = session.status !== 'published';
              const chipStatus = getChipStatus(session);

              return (
                <div key={session.id}>
                  {/* Parent row */}
                  <div
                    className={`session-browser__row${hasChildren ? ' session-browser__row--parent' : ''}${selectedSessionId === session.id ? ' session-browser__row--selected' : ''}`}
                    data-testid={hasChildren ? 'parent-row' : undefined}
                  >
                    {/* Checkbox cell */}
                    <span
                      className="session-browser__checkbox-cell"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {isSelectable && (
                        <input
                          type="checkbox"
                          checked={checkedIds.has(session.id)}
                          onChange={(e) => toggleChecked(session.id, e.nativeEvent instanceof MouseEvent && e.nativeEvent.shiftKey)}
                          aria-label={`Select ${session.title}`}
                          data-testid="session-checkbox"
                          disabled={bulkStatus === 'enhancing' || bulkStatus === 'uploading'}
                        />
                      )}
                    </span>
                    {/* Clickable row content — triggers preview selection */}
                    <button
                      type="button"
                      className="session-browser__row-content"
                      onClick={() => setSelectedSessionId(session.id)}
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
                          {bulkProgress.enhancedTitles.get(session.id) ?? session.title}
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
                      <span className={`chip chip--${chipStatus}`}>
                        {chipStatus.toUpperCase()}
                      </span>
                      <span className="session-browser__row-arrow">&#8594;</span>
                    </button>
                  </div>

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
                          <span className="session-browser__checkbox-cell" />
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

          {/* Bulk action bar */}
          {(checkedCount > 0 || bulkStatus !== 'idle') && (
            <div className="session-browser__bulk-bar" data-testid="bulk-bar">
              {bulkStatus === 'idle' && (
                <>
                  <span className="session-browser__bulk-count">
                    {checkedCount} selected
                  </span>
                  {checkedDraftCount > 0 && (
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={startBulkEnhance}
                      data-testid="bulk-enhance-btn"
                    >
                      Enhance{checkedDraftCount < checkedCount ? ` (${checkedDraftCount})` : ''}
                    </button>
                  )}
                  {checkedEnhancedCount > 0 && (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={startBulkUpload}
                      data-testid="bulk-upload-btn"
                    >
                      Upload{checkedEnhancedCount < checkedCount ? ` (${checkedEnhancedCount})` : ''}
                    </button>
                  )}
                  <button
                    type="button"
                    className="session-browser__bulk-clear"
                    onClick={() => setCheckedIds(new Set())}
                  >
                    Clear
                  </button>
                </>
              )}
              {(bulkStatus === 'enhancing' || bulkStatus === 'uploading') && (
                <div className="session-browser__bulk-progress" data-testid="bulk-progress">
                  <span className="session-browser__bulk-count">
                    {bulkStatus === 'enhancing' ? 'Enhancing' : 'Uploading'} {bulkProgress.completed}/{bulkProgress.total}
                  </span>
                  <div className="session-browser__bulk-progress-bar">
                    <div
                      className="session-browser__bulk-progress-fill"
                      style={{ width: `${(bulkProgress.completed / bulkProgress.total) * 100}%` }}
                    />
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={cancelBulk}
                    data-testid="bulk-cancel-btn"
                  >
                    Cancel
                  </button>
                </div>
              )}
              {bulkStatus === 'done' && (
                <div className="session-browser__bulk-progress" data-testid="bulk-done">
                  <span className="session-browser__bulk-count">
                    {bulkProgress.enhanced} done{bulkProgress.failed > 0 ? `, ${bulkProgress.failed} failed` : ''}
                  </span>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={dismissBulkBar}
                  >
                    Dismiss
                  </button>
                </div>
              )}
            </div>
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
