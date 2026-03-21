import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import type { Session } from '../types';
import { AppShell } from './AppShell';
import { useSessionsContext } from '../SessionsContext';
import { AgentTimeline } from './AgentTimeline';
import { fetchSession } from '../api';

interface SessionDetailProps {
  /** Whether an API key is configured. Defaults to true. */
  hasApiKey?: boolean;
  /** Optional override for sessions list (aids testability). */
  sessions?: Session[];
}

/**
 * SessionDetail shows the raw session detail view at /session/:id.
 * Includes stats, context, skills, execution path, collapsible sections,
 * and action buttons for enhancement and publishing.
 */
export function SessionDetail({
  hasApiKey = true,
  sessions,
}: SessionDetailProps) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [showApiKeyError, setShowApiKeyError] = useState(false);
  const [fullSession, setFullSession] = useState<Session | null>(null);
  const [loadingFull, setLoadingFull] = useState(false);
  const ctx = useSessionsContext();

  const sessionList = sessions ?? ctx.sessions;
  const listSession = sessionList.find((s) => s.id === id);

  // Fetch the full session detail (includes childSessions, richer data)
  useEffect(() => {
    if (sessions != null) return; // test mode — use props directly
    if (!listSession) return;

    let cancelled = false;
    setLoadingFull(true);

    fetchSession(listSession.projectName, listSession.id)
      .then((full) => {
        if (!cancelled) setFullSession(full);
      })
      .catch(() => {
        // Fall back to list data if detail fetch fails
      })
      .finally(() => {
        if (!cancelled) setLoadingFull(false);
      });

    return () => { cancelled = true; };
  }, [listSession?.id, listSession?.projectName, sessions]);

  // Use full session if available, otherwise fall back to list data
  const session = fullSession ?? listSession ?? (sessions ? sessions.find((s) => s.id === id) : null);

  if ((sessions == null && ctx.loading) || (!session && loadingFull)) {
    return (
      <AppShell title="Loading..." onBack={() => navigate('/')}>
        <div style={{ padding: 'var(--spacing-6)', textAlign: 'center' }}>
          <p className="text-body">Loading session...</p>
        </div>
      </AppShell>
    );
  }

  if (session == null) {
    return (
      <AppShell title="Not Found" onBack={() => navigate('/')}>
        <div className="empty-state">
          <div className="empty-state__icon">?</div>
          <h2 className="empty-state__title">Session not found</h2>
          <p className="empty-state__desc">
            No session with ID &ldquo;{id}&rdquo; exists. It may have been
            removed or the URL is incorrect.
          </p>
        </div>
      </AppShell>
    );
  }

  function handleEnhanceClick() {
    if (!hasApiKey) {
      setShowApiKeyError(true);
      return;
    }
    navigate(`/session/${id}/enhance`);
  }

  return (
    <AppShell title={session.title} onBack={() => navigate('/')}>
      <div className="session-detail">
        {/* API key error banner */}
        {showApiKeyError && (
          <div className="setup-banner" role="alert">
            <span className="setup-banner__icon" aria-hidden="true">
              !
            </span>
            <div className="setup-banner__text">
              <strong>API key required for AI enhancement.</strong>{' '}
              <Link to="/settings">Go to Settings</Link> to configure your API
              key, or{' '}
              <Link to={`/session/${id}/edit`}>publish without enhancement</Link>
              .
            </div>
          </div>
        )}

        {/* Stats grid */}
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-card__value">{session.durationMinutes}m</div>
            <div className="stat-card__label">
              Active Time
              {session.wallClockMinutes != null && session.wallClockMinutes !== session.durationMinutes && (
                <span style={{
                  display: 'block',
                  fontSize: '0.625rem',
                  color: 'var(--on-surface-variant)',
                  fontFamily: 'var(--font-mono)',
                  marginTop: '2px',
                }}>
                  over {session.wallClockMinutes >= 60
                    ? `${Math.floor(session.wallClockMinutes / 60)}h ${session.wallClockMinutes % 60}m`
                    : `${session.wallClockMinutes}m`
                  }
                </span>
              )}
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-card__value">{session.turns}</div>
            <div className="stat-card__label">Turns</div>
          </div>
          <div className="stat-card">
            <div className="stat-card__value">
              {session.filesChanged?.length ?? 0}
            </div>
            <div className="stat-card__label">Files Changed</div>
          </div>
          <div className="stat-card">
            <div className="stat-card__value">{session.linesOfCode}</div>
            <div className="stat-card__label">LOC</div>
          </div>
        </div>

        {/* Agent Timeline (orchestrated sessions) */}
        {session.isOrchestrated && session.childSessions && session.childSessions.length > 0 && (
          <section className="session-detail__section" aria-label="Agent Timeline">
            <span className="label label--primary">Agent Timeline</span>
            <div style={{ marginTop: 'var(--spacing-3)', overflow: 'auto' }}>
              <AgentTimeline session={session} variant="full" />
            </div>
          </section>
        )}

        {/* Agent Contributions (orchestrated sessions) */}
        {session.childSessions && session.childSessions.length > 0 && (
          <section className="session-detail__section" aria-label="Agent Contributions">
            <span className="label label--primary">
              Agent Contributions ({session.childSessions.length} agents)
            </span>
            <div className="agent-contributions" style={{ marginTop: 'var(--spacing-3)' }}>
              {session.childSessions.map((child) => (
                <div
                  key={child.id}
                  className="agent-contributions__row"
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: 'var(--spacing-4)',
                    padding: 'var(--spacing-2) 0',
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.6875rem',
                      color: 'var(--primary)',
                      textTransform: 'uppercase',
                      minWidth: '8rem',
                      flexShrink: 0,
                    }}
                  >
                    {child.agentRole ?? 'agent'}
                  </span>
                  <span style={{ flex: 1, color: 'var(--on-surface-variant)' }}>
                    {child.title}
                  </span>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.75rem',
                      minWidth: '5rem',
                      textAlign: 'right',
                    }}
                  >
                    {child.linesOfCode} LOC
                  </span>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.75rem',
                      minWidth: '4rem',
                      textAlign: 'right',
                      color: 'var(--on-surface-variant)',
                    }}
                  >
                    {child.durationMinutes}m
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Context */}
        {session.context != null && session.context.length > 0 && (
          <section className="session-detail__section">
            <span className="label label--primary">Context</span>
            <p className="session-detail__context">{session.context}</p>
          </section>
        )}

        {/* Skills chips */}
        {session.skills != null && session.skills.length > 0 && (
          <section
            className="session-detail__section"
            aria-label="Skills"
          >
            <span className="label label--primary">Skills</span>
            <div className="session-detail__chips">
              {session.skills.map((skill) => (
                <span key={skill} className="chip chip--primary">
                  <span className="chip__dot" />
                  {skill}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Execution Path */}
        {session.executionPath != null &&
          session.executionPath.length > 0 && (
            <section
              className="session-detail__section"
              aria-label="Execution Path"
            >
              <span className="label label--primary">Execution Path</span>
              <div className="share-preview__timeline">
                <div className="exec-path">
                  {session.executionPath.map((step) => (
                    <div key={step.stepNumber} className="exec-path__step">
                      <div className="exec-path__step-icon">
                        <span className="exec-path__step-num">
                          {String(step.stepNumber).padStart(2, '0')}
                        </span>
                      </div>
                      <div className="exec-path__step-content">
                        <div className="exec-path__step-title">
                          {step.title}
                        </div>
                        <div className="exec-path__step-desc">
                          {step.description}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

        {/* Collapsible: Tool Breakdown */}
        {session.toolBreakdown != null &&
          session.toolBreakdown.length > 0 && (
            <details className="session-detail__details">
              <summary className="session-detail__summary">
                Tool Breakdown
              </summary>
              <div className="tool-breakdown-rows">
                {session.toolBreakdown.map((tool) => {
                  const maxCount = Math.max(...session.toolBreakdown!.map((t) => t.count));
                  const pct = (tool.count / maxCount) * 100;
                  return (
                    <div key={tool.tool} className="tool-breakdown-row">
                      <span className="tool-breakdown-row__label">{tool.tool}</span>
                      <div className="tool-breakdown-row__track">
                        <div
                          className="tool-breakdown-row__bar"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="tool-breakdown-row__count">{tool.count}</span>
                    </div>
                  );
                })}
              </div>
            </details>
          )}

        {/* Collapsible: Turn Timeline */}
        {session.turnTimeline != null &&
          session.turnTimeline.length > 0 && (
            <details className="session-detail__details">
              <summary className="session-detail__summary">
                Turn Timeline
              </summary>
              <div className="turn-timeline-entries">
                {session.turnTimeline.slice(0, 3).map((event, i) => (
                  <div key={i} className="turn-timeline-entry">
                    <span className="turn-timeline-entry__num">
                      {event.turnNumber ?? i + 1}
                    </span>
                    <span className="turn-timeline-entry__content">
                      {event.content}
                    </span>
                    {event.tools && event.tools.length > 0 && (
                      <div className="turn-timeline-entry__tools">
                        {event.tools.map((tool) => (
                          <span key={tool} className="chip chip--sm">{tool}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {session.turnTimeline.length > 3 && (
                  <div className="turn-timeline-more">
                    ... {session.turnTimeline.length - 3} more turns
                  </div>
                )}
              </div>
            </details>
          )}

        {/* Collapsible: Files Changed */}
        {session.filesChanged != null &&
          session.filesChanged.length > 0 && (
            <details className="session-detail__details">
              <summary className="session-detail__summary">
                Files Changed ({session.filesChanged.length})
              </summary>
              <div className="files-changed-list">
                {session.filesChanged.map((file) => (
                  <div key={file.path} className="files-changed-row">
                    <span className="files-changed-row__path">{file.path}</span>
                    <span className="files-changed-row__count">
                      {file.editCount ?? file.additions + file.deletions}x
                    </span>
                  </div>
                ))}
              </div>
            </details>
          )}

        {/* Action buttons */}
        <div className="session-detail__actions">
          <button
            type="button"
            className="btn btn-primary btn--lg"
            onClick={handleEnhanceClick}
          >
            Enhance with AI
          </button>
          <Link
            to={`/session/${id}/edit`}
            className="btn btn-secondary btn--lg"
          >
            Edit &amp; Publish
          </Link>
        </div>
      </div>
    </AppShell>
  );
}

export default SessionDetail;
