import { useState, useEffect, useCallback } from 'react';
import type { Session, ExecutionStep, ToolUsage, FileChange, QaPair } from '../types';
import { fetchSession } from '../api';
import { AgentTimeline } from './AgentTimeline';

export interface SessionDetailOverlayProps {
  session: Session;
  projectName: string;
  projectDirName: string;
  onClose: () => void;
}

/** Strip the project root from absolute paths to make them relative. */
function stripRoot(filePath: string, dirName: string, cwd?: string): string {
  if (cwd && filePath.startsWith(cwd)) {
    return filePath.slice(cwd.length).replace(/^\//, '') || filePath;
  }
  const root = dirName.replace(/^-/, '/').replace(/-/g, '/');
  if (filePath.startsWith(root)) {
    return filePath.slice(root.length).replace(/^\//, '') || filePath;
  }
  return filePath;
}

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
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function isHighlightStep(step: ExecutionStep): boolean {
  const text = `${step.title} ${step.description}`.toLowerCase();
  return /\b(decision|pivot|key|critical|important|breakthrough)\b/.test(text);
}

// ── Sub-components ──────────────────────────────────────────────

function StatsGrid({ session }: { session: Session }) {
  const filesCount = session.filesChanged?.length ?? 0;
  return (
    <div className="session-detail__stats-grid">
      <div className="session-detail__stat">
        <div className="session-detail__stat-value">{formatDuration(session.durationMinutes)}</div>
        <div className="session-detail__stat-label">Duration</div>
      </div>
      <div className="session-detail__stat">
        <div className="session-detail__stat-value">{session.turns}</div>
        <div className="session-detail__stat-label">Turns</div>
      </div>
      <div className="session-detail__stat">
        <div className="session-detail__stat-value">{filesCount}</div>
        <div className="session-detail__stat-label">Files</div>
      </div>
      <div className="session-detail__stat">
        <div className="session-detail__stat-value">{formatLoc(session.linesOfCode)}</div>
        <div className="session-detail__stat-label">LOC Changed</div>
      </div>
    </div>
  );
}

function DeveloperTake({ take }: { take: string }) {
  return (
    <section className="session-detail__section">
      <h2 className="session-detail__section-label">DEVELOPER TAKE</h2>
      <blockquote className="session-detail__take">{take}</blockquote>
    </section>
  );
}

function SkillChips({ skills }: { skills: string[] }) {
  return (
    <section className="session-detail__section">
      <h2 className="session-detail__section-label">APPLIED SKILLS</h2>
      <div className="session-detail__skills">
        {skills.map((skill) => (
          <span key={skill} className="chip">{skill}</span>
        ))}
      </div>
    </section>
  );
}

function SessionQA({ pairs }: { pairs: QaPair[] }) {
  return (
    <section className="session-detail__section">
      <h2 className="session-detail__section-label">SESSION Q&amp;A</h2>
      <div className="session-detail__qa-list">
        {pairs.map((pair, i) => (
          <div key={i} className="session-detail__qa-pair">
            <div className="session-detail__qa-question">{pair.question}</div>
            <div className="session-detail__qa-answer">{pair.answer}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Highlights({ steps }: { steps: ExecutionStep[] }) {
  return (
    <section className="session-detail__section">
      <h2 className="session-detail__section-label">HIGHLIGHTS</h2>
      <div className="session-detail__highlights">
        {steps.map((step) => (
          <div key={step.stepNumber} className="session-detail__highlight-card">
            <div className="session-detail__highlight-step">Step {step.stepNumber}</div>
            <div className="session-detail__highlight-title">{step.title}</div>
            <div className="session-detail__highlight-desc">{step.description}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ExecutionPath({ steps }: { steps: ExecutionStep[] }) {
  return (
    <section className="session-detail__sidebar-section">
      <h2 className="session-detail__section-label">EXECUTION PATH</h2>
      <div className="session-detail__exec-path">
        {steps.map((step) => (
          <div key={step.stepNumber} className="session-detail__exec-step">
            <div className="session-detail__exec-dot" />
            <div className="session-detail__exec-content">
              <div className="session-detail__exec-title">{step.title}</div>
              <div className="session-detail__exec-desc">{step.description}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function RawLogPreview({ lines }: { lines: string[] }) {
  const preview = lines.slice(0, 4);
  return (
    <section className="session-detail__sidebar-section">
      <h2 className="session-detail__section-label">RAW LOG</h2>
      <div className="session-detail__raw-log">
        {preview.map((line, i) => (
          <div key={i} className="session-detail__raw-line">{line}</div>
        ))}
        {lines.length > 4 && (
          <div className="session-detail__raw-more">
            View full transcript ({lines.length} lines) &rarr;
          </div>
        )}
      </div>
    </section>
  );
}

function SourceInfo({ session, projectName }: { session: Session; projectName: string }) {
  return (
    <section className="session-detail__sidebar-section">
      <h2 className="session-detail__section-label">SOURCE INFO</h2>
      <div className="session-detail__source-list">
        <div className="session-detail__source-row">
          <span className="session-detail__source-key">Source</span>
          <span className="session-detail__source-val">{
            { claude: 'Claude Code', cursor: 'Cursor', codex: 'Codex', gemini: 'Gemini CLI', antigravity: 'Antigravity' }[session.source ?? 'claude'] ?? 'Claude Code'
          }</span>
        </div>
        <div className="session-detail__source-row">
          <span className="session-detail__source-key">Date</span>
          <span className="session-detail__source-val">{formatDate(session.date)}</span>
        </div>
        <div className="session-detail__source-row">
          <span className="session-detail__source-key">Project</span>
          <span className="session-detail__source-val">{projectName}</span>
        </div>
        {session.isOrchestrated && (
          <div className="session-detail__source-row">
            <span className="session-detail__source-key">Type</span>
            <span className="session-detail__source-val">
              Orchestrated ({session.childCount ?? session.childSessions?.length ?? 0} sub-sessions)
            </span>
          </div>
        )}
      </div>
    </section>
  );
}

function ToolBreakdown({ tools }: { tools: ToolUsage[] }) {
  const maxCount = tools.length > 0 ? Math.max(...tools.map((t) => t.count)) : 1;
  return (
    <details className="session-detail__collapsible">
      <summary className="session-detail__collapsible-summary">
        Tool Breakdown ({tools.length} tools)
      </summary>
      <div className="session-detail__tool-list">
        {tools.map((t) => {
          const pct = Math.max(8, Math.round((t.count / maxCount) * 100));
          return (
            <div key={t.tool} className="session-detail__tool-row">
              <span className="session-detail__tool-name">{t.tool}</span>
              <div className="session-detail__tool-bar-track">
                <div
                  className="session-detail__tool-bar"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="session-detail__tool-count">{t.count}</span>
            </div>
          );
        })}
      </div>
    </details>
  );
}

function FilesChanged({ files, projectDirName, cwd }: { files: FileChange[]; projectDirName: string; cwd?: string }) {
  return (
    <details className="session-detail__collapsible">
      <summary className="session-detail__collapsible-summary">
        Files Changed ({files.length} files)
      </summary>
      <div className="session-detail__file-list">
        {files.map((f) => (
          <div key={f.path} className="session-detail__file-row">
            <span className="session-detail__file-path">{stripRoot(f.path, projectDirName, cwd)}</span>
            <span className="session-detail__file-additions">+{f.additions}</span>
            <span className="session-detail__file-deletions">-{f.deletions}</span>
          </div>
        ))}
      </div>
    </details>
  );
}

// ── Main component ──────────────────────────────────────────────

export function SessionDetailOverlay({ session, projectName, projectDirName, onClose }: SessionDetailOverlayProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Lazy-load full session for orchestrated sessions with childCount but no childSessions
  const needsFetch = (session.childCount ?? 0) > 0 && !session.childSessions?.length;
  const [fullSession, setFullSession] = useState<Session | null>(null);
  const [timelineLoading, setTimelineLoading] = useState(needsFetch);

  useEffect(() => {
    if (!needsFetch || !projectDirName) {
      setTimelineLoading(false);
      return;
    }
    let cancelled = false;
    setTimelineLoading(true);
    fetchSession(projectDirName, session.id)
      .then((full) => {
        if (!cancelled) setFullSession(full);
      })
      .catch(() => {
        // Fetch failed; timeline will not render
      })
      .finally(() => {
        if (!cancelled) setTimelineLoading(false);
      });
    return () => { cancelled = true; };
  }, [needsFetch, projectDirName, session.id]);

  // Use the full session (with childSessions) if available, otherwise the original
  const timelineSession = fullSession ?? session;
  const showTimeline = (timelineSession.childSessions?.length ?? 0) > 0;

  const highlights = (session.executionPath ?? []).filter(isHighlightStep);
  const hasQA = Array.isArray(session.qaPairs) && session.qaPairs.length > 0;
  const hasSkills = Array.isArray(session.skills) && session.skills.length > 0;
  const hasExecPath = Array.isArray(session.executionPath) && session.executionPath.length > 0;
  const hasRawLog = Array.isArray(session.rawLog) && session.rawLog.length > 0;
  const hasTools = Array.isArray(session.toolBreakdown) && session.toolBreakdown.length > 0;
  const hasFiles = Array.isArray(session.filesChanged) && session.filesChanged.length > 0;

  return (
    <div className="session-detail-overlay" role="dialog" aria-label={`Session detail: ${session.title}`}>
      {/* Header bar */}
      <div className="session-detail__header">
        <button
          className="session-detail__back"
          onClick={onClose}
          type="button"
        >
          &larr; Back to project
        </button>
        <button
          className="session-detail__close"
          onClick={onClose}
          aria-label="Close session detail"
          type="button"
        >
          &times;
        </button>
      </div>

      <div className="session-detail__scroll">
        {/* Two-column layout */}
        <div className="session-detail__layout">
          {/* Left column */}
          <div className="session-detail__main">
            <div className="session-detail__breadcrumb">
              {projectName} / {session.title}
            </div>

            <h1 className="session-detail__title">{session.title}</h1>

            <StatsGrid session={session} />

            {/* Agent Timeline for orchestrated sessions */}
            {timelineLoading && (
              <div className="session-detail__timeline-loading" aria-label="Loading agent activity">
                Loading agent activity...
              </div>
            )}
            {!timelineLoading && showTimeline && (
              <section className="session-detail__section">
                <h2 className="session-detail__section-label">AGENT ACTIVITY</h2>
                <AgentTimeline session={timelineSession} variant="full" />
              </section>
            )}

            {session.developerTake && <DeveloperTake take={session.developerTake} />}

            {session.context && (
              <section className="session-detail__section">
                <h2 className="session-detail__section-label">CONTEXT</h2>
                <p className="session-detail__context">{session.context}</p>
              </section>
            )}

            {hasSkills && <SkillChips skills={session.skills!} />}

            {hasQA && <SessionQA pairs={session.qaPairs!} />}

            {highlights.length > 0 && <Highlights steps={highlights} />}
          </div>

          {/* Right column */}
          <div className="session-detail__sidebar">
            {hasExecPath && <ExecutionPath steps={session.executionPath!} />}
            {hasRawLog && <RawLogPreview lines={session.rawLog} />}
            <SourceInfo session={session} projectName={projectName} />
          </div>
        </div>

        {/* Full-width sections below */}
        <div className="session-detail__full-width">
          {hasTools && <ToolBreakdown tools={session.toolBreakdown!} />}
          {hasFiles && <FilesChanged files={session.filesChanged!} projectDirName={projectDirName} cwd={session.cwd} />}
        </div>
      </div>
    </div>
  );
}
