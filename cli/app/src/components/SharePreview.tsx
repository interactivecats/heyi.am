import type { Session } from '../types';

interface SharePreviewProps {
  session: Session;
}

function ToolBreakdownBar({ tools }: { tools: { tool: string; count: number }[] }) {
  const maxCount = Math.max(...tools.map(t => t.count));
  return (
    <div className="tool-bar">
      {tools.map((tool) => {
        const pct = (tool.count / maxCount) * 100;
        return (
          <div key={tool.tool} className="tool-bar__item">
            <span className="tool-bar__name">{tool.tool}</span>
            <div className="tool-bar__track">
              <div className="tool-bar__fill" style={{ width: `${pct}%` }} />
            </div>
            <span className="tool-bar__count">{tool.count}</span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * SharePreview renders a session case study as it would appear
 * when published on heyi.am. Reusable in session detail and editor views.
 */
export function SharePreview({ session }: SharePreviewProps) {
  const totalToolCalls = session.toolBreakdown?.reduce(
    (sum, t) => sum + t.count,
    0,
  );

  return (
    <article className="share-preview">
      {/* Session ref label */}
      {session.sessionRef != null && session.sessionRef.length > 0 && (
        <span className="share-preview__ref">{session.sessionRef}</span>
      )}

      {/* Title */}
      <h1 className="share-preview__title">{session.title}</h1>

      {/* Stats grid */}
      <div className="stats-grid share-preview__stats">
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
            {session.toolCalls ?? totalToolCalls ?? 0}
          </div>
          <div className="stat-card__label">Tool Calls</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__value">{session.linesOfCode}</div>
          <div className="stat-card__label">LOC</div>
        </div>
      </div>

      {/* Developer Take */}
      {session.developerTake != null && session.developerTake.length > 0 && (
        <div className="share-preview__take">
          <span className="share-preview__take-quote" aria-hidden="true">
            &ldquo;
          </span>
          <p className="share-preview__take-label">The Developer Take</p>
          <p className="share-preview__take-text">{session.developerTake}</p>
        </div>
      )}

      {/* Skills chips */}
      {session.skills != null && session.skills.length > 0 && (
        <div className="share-preview__skills">
          {session.skills.map((skill) => (
            <span key={skill} className="chip chip--primary">
              <span className="chip__dot" />
              {skill}
            </span>
          ))}
        </div>
      )}

      {/* Execution Path */}
      {session.executionPath != null && session.executionPath.length > 0 && (
        <section
          className="share-preview__section"
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
                    <div className="exec-path__step-title">{step.title}</div>
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

      {/* Files Changed — collapsible */}
      {session.filesChanged != null && session.filesChanged.length > 0 && (
        <details className="collapsible">
          <summary className="collapsible__summary">
            Files Changed ({session.filesChanged.length})
            <span className="collapsible__chevron" aria-hidden="true">&#9662;</span>
          </summary>
          <div className="collapsible__content">
            <div className="file-list">
              {session.filesChanged.map((file) => (
                <div key={file.path} className="file-list__item">
                  {file.additions > 0 && (
                    <span className="file-list__additions">+{file.additions}</span>
                  )}
                  {file.deletions > 0 && (
                    <span className="file-list__deletions">-{file.deletions}</span>
                  )}
                  <span className="file-list__path">{file.path}</span>
                </div>
              ))}
            </div>
          </div>
        </details>
      )}

      {/* Tool Breakdown — collapsible */}
      {session.toolBreakdown != null && session.toolBreakdown.length > 0 && (
        <details className="collapsible">
          <summary className="collapsible__summary">
            Tool Breakdown
            <span className="collapsible__chevron" aria-hidden="true">&#9662;</span>
          </summary>
          <div className="collapsible__content">
            <ToolBreakdownBar tools={session.toolBreakdown} />
          </div>
        </details>
      )}

      {/* Session Timeline — collapsible */}
      {session.turnTimeline != null && session.turnTimeline.length > 0 && (
        <details className="collapsible">
          <summary className="collapsible__summary">
            Session Timeline
            <span className="collapsible__chevron" aria-hidden="true">&#9662;</span>
          </summary>
          <div className="collapsible__content">
            <div className="timeline-list">
              {session.turnTimeline.map((event, i) => (
                <div key={i} className="timeline-list__item">
                  <span className="timeline-list__time">{event.timestamp}</span>
                  <span className={`timeline-list__content${event.type === 'prompt' ? ' timeline-list__content--prompt' : ''}`}>
                    {event.content}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </details>
      )}
    </article>
  );
}

export default SharePreview;
