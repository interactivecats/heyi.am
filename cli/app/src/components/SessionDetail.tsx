import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import type { Session } from '../types';
import { MOCK_SESSIONS } from '../mock-data';
import { AppShell } from './AppShell';

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

  const sessionList = sessions ?? MOCK_SESSIONS;
  const session = sessionList.find((s) => s.id === id);

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

  const totalToolCalls = session.toolBreakdown?.reduce(
    (sum, t) => sum + t.count,
    0,
  );

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
            <div className="stat-card__label">Duration</div>
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
              <div className="share-preview__tool-breakdown">
                <div
                  className="share-preview__tool-bar"
                  role="img"
                  aria-label="Tool usage breakdown"
                >
                  {session.toolBreakdown.map((tool) => {
                    const total = totalToolCalls ?? 1;
                    const pct = (tool.count / total) * 100;
                    return (
                      <div
                        key={tool.tool}
                        className="share-preview__tool-segment"
                        style={{ flex: `${pct} 0 0%` }}
                        title={`${tool.tool}: ${tool.count} (${Math.round(pct)}%)`}
                      />
                    );
                  })}
                </div>
                <div className="share-preview__tool-legend">
                  {session.toolBreakdown.map((tool) => (
                    <span
                      key={tool.tool}
                      className="share-preview__tool-label"
                    >
                      <span className="share-preview__tool-dot" />
                      {tool.tool} ({tool.count})
                    </span>
                  ))}
                </div>
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
              <div className="share-preview__timeline-entries">
                {session.turnTimeline.map((event, i) => (
                  <div key={i} className="share-preview__timeline-entry">
                    <span className="share-preview__timeline-time">
                      {event.timestamp}
                    </span>
                    <span
                      className={`badge badge--${event.type === 'prompt' ? 'sealed' : event.type === 'error' ? 'archived' : 'published'}`}
                    >
                      {event.type}
                    </span>
                    <span className="share-preview__timeline-content">
                      {event.content}
                    </span>
                  </div>
                ))}
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
              <table className="share-preview__file-table">
                <thead>
                  <tr>
                    <th className="share-preview__file-th">File</th>
                    <th className="share-preview__file-th share-preview__file-th--num">
                      +
                    </th>
                    <th className="share-preview__file-th share-preview__file-th--num">
                      -
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {session.filesChanged.map((file) => (
                    <tr key={file.path}>
                      <td className="share-preview__file-path">{file.path}</td>
                      <td className="share-preview__file-add">
                        +{file.additions}
                      </td>
                      <td className="share-preview__file-del">
                        -{file.deletions}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
