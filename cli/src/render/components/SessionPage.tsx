import React from 'react';
import type { SessionRenderData, Beat, QaPair, FileEntry, ToolBreakdownEntry } from '../types.js';

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function BeatsList({ beats }: { beats: Beat[] }) {
  return (
    <ol className="session-beats">
      {beats.map((beat) => (
        <li key={beat.stepNumber} className="beat-item">
          <span className="beat-number">{beat.stepNumber}</span>
          <div className="beat-content">
            <strong className="beat-title">{beat.title}</strong>
            <p className="beat-body">{beat.body}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function QaSection({ pairs }: { pairs: QaPair[] }) {
  return (
    <div className="session-qa">
      {pairs.map((pair, i) => (
        <div key={i} className="qa-pair">
          <p className="qa-question">{pair.question}</p>
          <p className="qa-answer">{pair.answer}</p>
        </div>
      ))}
    </div>
  );
}

function ToolBreakdown({ tools }: { tools: ToolBreakdownEntry[] }) {
  return (
    <div className="session-tools">
      <h3 className="subsection-heading">Tool Usage</h3>
      <ul className="tool-list">
        {tools.map((t) => (
          <li key={t.tool} className="tool-item">
            <span className="tool-name">{t.tool}</span>
            <span className="tool-count">{t.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TopFiles({ files }: { files: FileEntry[] }) {
  return (
    <div className="session-files">
      <h3 className="subsection-heading">Top Files</h3>
      <ul className="file-list">
        {files.map((f) => (
          <li key={f.path} className="file-item">
            <span className="file-path">{f.path}</span>
            <span className="file-additions">+{f.additions}</span>
            <span className="file-deletions">-{f.deletions}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SessionPage({ data }: { data: SessionRenderData }) {
  const { user, projectSlug, session } = data;

  return (
    <div className="session-page" data-render-version="1" data-template={session.template}>
      <nav className="session-breadcrumb">
        <a href={`/@${user.username}`}>{user.username}</a>
        {projectSlug && (
          <>
            <span className="breadcrumb-sep" aria-hidden="true">/</span>
            <a href={`/@${user.username}/p/${projectSlug}`}>{projectSlug}</a>
          </>
        )}
        <span className="breadcrumb-sep" aria-hidden="true">/</span>
        <span>{session.title}</span>
      </nav>

      <header className="session-header">
        <h1 className="session-title">{session.title}</h1>

        <div className="session-meta">
          <time className="session-date" dateTime={session.recordedAt}>
            {formatDate(session.recordedAt)}
          </time>
          <span className="session-source">{session.sourceTool}</span>
          <span className="session-template">{session.template}</span>
        </div>

        <blockquote className="session-dev-take">
          <p>{session.devTake}</p>
        </blockquote>

        {session.context && (
          <p className="session-context">{session.context}</p>
        )}

        <div className="session-stats">
          <span className="stat">
            <span className="stat-value">{formatDuration(session.durationMinutes)}</span>
            <span className="stat-label">active</span>
          </span>
          <span className="stat">
            <span className="stat-value">{session.turns}</span>
            <span className="stat-label">turns</span>
          </span>
          <span className="stat">
            <span className="stat-value">{session.locChanged.toLocaleString()}</span>
            <span className="stat-label">loc</span>
          </span>
          <span className="stat">
            <span className="stat-value">{session.filesChanged}</span>
            <span className="stat-label">files</span>
          </span>
        </div>
      </header>

      {session.skills.length > 0 && (
        <section className="session-skills">
          <div className="skill-chips">
            {session.skills.map((skill) => (
              <span key={skill} className="skill-chip">{skill}</span>
            ))}
          </div>
        </section>
      )}

      {session.narrative && (
        <section className="session-narrative">
          <h2 className="section-heading">Narrative</h2>
          <p>{session.narrative}</p>
        </section>
      )}

      {session.highlights && session.highlights.length > 0 && (
        <section className="session-highlights">
          <h2 className="section-heading">Highlights</h2>
          <ul className="highlights-list">
            {session.highlights.map((h, i) => (
              <li key={i} className="highlight-item">{h}</li>
            ))}
          </ul>
        </section>
      )}

      {session.beats && session.beats.length > 0 && (
        <section className="session-execution">
          <h2 className="section-heading">Execution Path</h2>
          <BeatsList beats={session.beats} />
        </section>
      )}

      {session.qaPairs && session.qaPairs.length > 0 && (
        <section className="session-qa-section">
          <h2 className="section-heading">Q&amp;A</h2>
          <QaSection pairs={session.qaPairs} />
        </section>
      )}

      <aside className="session-sidebar">
        {session.toolBreakdown && session.toolBreakdown.length > 0 && (
          <ToolBreakdown tools={session.toolBreakdown} />
        )}
        {session.topFiles && session.topFiles.length > 0 && (
          <TopFiles files={session.topFiles} />
        )}
      </aside>
    </div>
  );
}
