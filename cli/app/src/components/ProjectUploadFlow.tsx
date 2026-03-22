import { useState, useEffect, useCallback, useRef, Fragment } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useSessionsContext } from '../SessionsContext';
import { AppShell } from './AppShell';
import { WorkTimeline } from './WorkTimeline';
import {
  fetchSessions,
  fetchSession,
  fetchProjectEnhanceCache,
  saveProjectEnhanceLocally,
  triageProject,
  enhanceProject,
  refineNarrative,
  publishProject,
  startDeviceAuth,
  pollDeviceAuth,
  type TriageResult,
  type TriageEvent,
  type ProjectEnhanceResult,
  type EnhanceEventType,
  type RefineAnswer,
  type PublishProjectPayload,
  type PublishEvent,
} from '../api';
import { useAuth } from '../AuthContext';
import type { Session, Project } from '../types';
import { AgentTimeline } from './AgentTimeline';
import { SessionDetailOverlay } from './SessionDetailOverlay';

type Step = 'overview' | 'triage' | 'enhance' | 'questions' | 'timeline' | 'review' | 'done';

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
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDateRange(dateRange: string): string {
  if (!dateRange) return '';
  const [first, last] = dateRange.split('|');
  if (!first || !last) return '';
  const d1 = new Date(first);
  const d2 = new Date(last);
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const year = d2.getFullYear();
  return `${fmt(d1)}\u2013${fmt(d2)}, ${year}`;
}

// ── Phase bar ──────────────────────────────────────────────────

const STEPS: Step[] = ['overview', 'triage', 'enhance', 'questions', 'timeline', 'review', 'done'];

function PhaseBar({ current }: { current: Step }) {
  const idx = STEPS.indexOf(current);
  return (
    <div className="phase-bar">
      {STEPS.slice(0, -1).map((_, i) => (
        <div key={i} className={`phase-bar__segment ${i <= idx ? 'phase-bar__segment--active' : ''}`} />
      ))}
    </div>
  );
}

// ── Screen 43: Session Overview ──────────────────────────────────

function SessionOverview({
  project,
  sessions,
  onTriage,
  onCancel,
}: {
  project: Project;
  sessions: Session[];
  onTriage: () => void;
  onCancel: () => void;
}) {
  const sorted = [...sessions].sort((a, b) => {
    const da = a.date ? new Date(a.date).getTime() : 0;
    const db = b.date ? new Date(b.date).getTime() : 0;
    return db - da;
  });

  return (
    <div className="upload-flow">
      <div className="upload-flow__label">Upload Project</div>
      <h2 className="upload-flow__title">{project.name}</h2>
      <div className="upload-flow__date">{formatDateRange(project.dateRange)}</div>
      <p className="upload-flow__desc">
        The AI will scan all {project.sessionCount} sessions, pick the ones worth showcasing,
        and build a project narrative. Small or trivial sessions are skipped automatically.
      </p>

      <div className="upload-flow__stat-grid">
        <StatCard label="Sessions" value={String(project.sessionCount)} />
        <StatCard label="Total Time" value={formatDuration(project.totalDuration)} />
        <StatCard label="LOC" value={formatLoc(project.totalLoc)} />
        <StatCard label="Files" value={String(project.totalFiles)} />
      </div>

      <div className="upload-flow__section-label">All Sessions ({sessions.length})</div>
      <div className="session-table">
        <div className="session-table__header">
          <span>Session</span>
          <span style={{ textAlign: 'right' }}>Date</span>
          <span style={{ textAlign: 'right' }}>Time</span>
          <span style={{ textAlign: 'right' }}>LOC</span>
          <span style={{ textAlign: 'right' }}>Turns</span>
        </div>
        <div className="session-table__body">
          {sorted.map((s) => (
            <div key={s.id} className="session-table__row">
              <span className="session-table__name">{s.title}</span>
              <span className="session-table__cell">{formatDate(s.date)}</span>
              <span className="session-table__cell">{formatDuration(s.durationMinutes)}</span>
              <span className="session-table__cell">{formatLoc(s.linesOfCode)}</span>
              <span className="session-table__cell">{s.turns}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="upload-flow__actions">
        <button className="btn btn--secondary btn--large" onClick={onCancel}>Cancel</button>
        <button className="btn btn--primary btn--large" onClick={onTriage}>
          {project.sessionCount < 5
            ? `Enhance all ${project.sessionCount} sessions`
            : 'Let AI pick sessions'} &rarr;
        </button>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat-card">
      <div className="stat-card__label">{label}</div>
      <div className="stat-card__value">{value}</div>
    </div>
  );
}

// ── Screen 43b: Triage Terminal ──────────────────────────────────

interface TriageLine {
  id: string;
  text: string;
  variant: 'default' | 'passed' | 'skipped' | 'active' | 'section' | 'prompt';
}

const SPINNER_FRAMES = ['\u25D0', '\u25D1', '\u25D2', '\u25D3'];

function useSpinner(): string {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setFrame((f) => (f + 1) % SPINNER_FRAMES.length), 120);
    return () => clearInterval(id);
  }, []);
  return SPINNER_FRAMES[frame];
}

function triageEventsToLines(events: TriageEvent[], spinnerChar: string): TriageLine[] {
  const lines: TriageLine[] = [
    { id: 'prompt', text: '$ heyiam triage', variant: 'prompt' },
  ];

  let loadingTotal = 0;
  let loadedCount = 0;
  let hardFloorPassed = 0;
  let hardFloorFiltered = 0;
  let showedHardFloorHeader = false;
  let showedSignalHeader = false;
  let showedRankingHeader = false;

  for (const evt of events) {
    switch (evt.type) {
      case 'scanning':
        loadingTotal = evt.total;
        lines.push({ id: 'scanning', text: `  Loading session stats... (${evt.total} sessions)`, variant: 'active' });
        break;

      case 'loading_stats':
        loadedCount = evt.index;
        break;

      case 'hard_floor': {
        if (!showedHardFloorHeader) {
          // Replace scanning line with done
          const scanIdx = lines.findIndex((l) => l.id === 'scanning');
          if (scanIdx !== -1) {
            lines[scanIdx] = { id: 'scanning-done', text: `  \u2713 Loaded ${loadingTotal} sessions`, variant: 'passed' };
          }
          lines.push({ id: 'hf-header', text: '', variant: 'default' });
          lines.push({ id: 'hf-section', text: '  \u2500\u2500 Hard floor filter \u2500\u2500', variant: 'section' });
          showedHardFloorHeader = true;
        }
        const shortId = evt.sessionId.slice(0, 8);
        if (evt.passed) {
          hardFloorPassed++;
          lines.push({
            id: `hf-${evt.sessionId}`,
            text: `  \u2713 ${evt.title || shortId} \u2192 passed`,
            variant: 'passed',
          });
        } else {
          hardFloorFiltered++;
          lines.push({
            id: `hf-${evt.sessionId}`,
            text: `  \u2717 ${evt.title || shortId} \u2192 skipped${evt.reason ? ` (${evt.reason})` : ''}`,
            variant: 'skipped',
          });
        }
        break;
      }

      case 'extracting_signals': {
        if (!showedSignalHeader) {
          // Add hard floor summary if we had hard floor events
          if (showedHardFloorHeader) {
            lines.push({
              id: 'hf-summary',
              text: `  \u2713 ${hardFloorPassed} passed, ${hardFloorFiltered} filtered`,
              variant: 'passed',
            });
          }
          lines.push({ id: 'sig-header', text: '', variant: 'default' });
          lines.push({ id: 'sig-section', text: '  \u2500\u2500 Signal extraction \u2500\u2500', variant: 'section' });
          showedSignalHeader = true;
        }
        const shortId = evt.sessionId.slice(0, 8);
        lines.push({
          id: `sig-${evt.sessionId}`,
          text: `  ${spinnerChar} Scanning ${evt.title || shortId}...`,
          variant: 'active',
        });
        break;
      }

      case 'signals_done': {
        // Replace the active scanning line with a done line
        const idx = lines.findIndex((l) => l.id === `sig-${evt.sessionId}`);
        if (idx !== -1) {
          const shortId = evt.sessionId.slice(0, 8);
          lines[idx] = {
            id: `sig-done-${evt.sessionId}`,
            text: `  \u2713 ${shortId}: signals extracted`,
            variant: 'passed',
          };
        }
        break;
      }

      case 'llm_ranking':
        if (!showedRankingHeader) {
          lines.push({ id: 'rank-header', text: '', variant: 'default' });
          lines.push({ id: 'rank-section', text: '  \u2500\u2500 AI ranking \u2500\u2500', variant: 'section' });
          showedRankingHeader = true;
        }
        lines.push({
          id: 'llm-ranking',
          text: `  ${spinnerChar} Sending ${evt.sessionCount} sessions to AI...`,
          variant: 'active',
        });
        break;

      case 'scoring_fallback':
        if (!showedRankingHeader) {
          lines.push({ id: 'rank-header', text: '', variant: 'default' });
          lines.push({ id: 'rank-section', text: '  \u2500\u2500 Scoring \u2500\u2500', variant: 'section' });
          showedRankingHeader = true;
        }
        lines.push({
          id: 'scoring-fallback',
          text: `  ${spinnerChar} Scoring ${evt.sessionCount} sessions...`,
          variant: 'active',
        });
        break;

      case 'done':
        // Replace ranking active line
        const rankIdx = lines.findIndex((l) => l.id === 'llm-ranking' || l.id === 'scoring-fallback');
        if (rankIdx !== -1) {
          lines[rankIdx] = {
            id: 'rank-done',
            text: `  \u2713 AI selected ${evt.selected} sessions`,
            variant: 'passed',
          };
        }
        break;

      case 'result':
        // Final result -- no terminal line needed, handled by parent
        break;
    }
  }

  return lines;
}

/** @internal Exported for testing */
export function TriageTerminal({
  events,
  dirName,
}: {
  events: TriageEvent[];
  dirName: string;
}) {
  const spinnerChar = useSpinner();
  const feedRef = useRef<HTMLDivElement>(null);
  const lines = triageEventsToLines(events, spinnerChar);

  // Auto-scroll to bottom when new lines appear
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [lines.length]);

  return (
    <div className="triage-terminal" role="log" aria-live="polite" aria-label="Triage progress">
      <div className="triage-terminal__feed" ref={feedRef}>
        {lines.map((line) => (
          <div
            key={line.id}
            className={`triage-terminal__line${
              line.variant === 'prompt' ? ' triage-terminal__prompt' :
              line.variant === 'section' ? ' triage-terminal__section' :
              line.variant === 'passed' ? ' triage-terminal__line--passed' :
              line.variant === 'skipped' ? ' triage-terminal__line--skipped' :
              line.variant === 'active' ? ' triage-terminal__line--active' :
              ''
            }`}
          >
            {line.text}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Screen 44: Triage Results ────────────────────────────────────

function TriageItem({
  sessionId,
  title,
  stats,
  reason,
  variant,
  checked,
  onToggle,
  dimTitle,
  previouslyPublished,
}: {
  sessionId: string;
  title: string;
  stats: string;
  reason: string;
  variant: 'selected' | 'skipped';
  checked: boolean;
  onToggle: () => void;
  dimTitle?: boolean;
  previouslyPublished?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const isLong = reason.length > (variant === 'selected' ? 60 : 40);
  const truncated = variant === 'selected'
    ? (reason.length > 60 ? reason.slice(0, 57) + '...' : reason)
    : (reason.length > 40 ? reason.slice(0, 37) + '...' : reason);

  return (
    <div className={`triage-item ${checked ? 'triage-item--selected' : 'triage-item--skipped'}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="triage-item__checkbox"
      />
      <div className="triage-item__info">
        <div className="triage-item__name" style={dimTitle ? { color: 'var(--on-surface-variant)' } : undefined}>
          {title}
          {previouslyPublished && (
            <span className="triage-item__published-badge">previously published</span>
          )}
        </div>
        <div className="triage-item__stats">{stats}</div>
      </div>
      <div
        className={`triage-item__reason triage-item__reason--${variant} ${isLong ? 'triage-item__reason--expandable' : ''}`}
        onClick={isLong ? () => setExpanded(!expanded) : undefined}
        role={isLong ? 'button' : undefined}
        tabIndex={isLong ? 0 : undefined}
        onKeyDown={isLong ? (e) => { if (e.key === 'Enter') setExpanded(!expanded); } : undefined}
      >
        {expanded ? reason : truncated}
      </div>
    </div>
  );
}

function TriageResults({
  project,
  sessions,
  triageResult,
  selectedIds,
  onToggle,
  onEnhance,
  onBack,
  publishedSessionIds,
}: {
  project: Project;
  sessions: Session[];
  triageResult: TriageResult;
  selectedIds: Set<string>;
  onToggle: (sessionId: string) => void;
  onEnhance: () => void;
  onBack: () => void;
  publishedSessionIds?: Set<string>;
}) {
  const sessionMap = new Map(sessions.map((s) => [s.id, s]));

  const selectedCount = selectedIds.size;
  const skippedCount = sessions.length - selectedCount;

  return (
    <div className="upload-flow">
      <PhaseBar current="triage" />

      <div className="upload-flow__scan-status">
        &#10003; Scanned {sessions.length} sessions &middot; {formatDuration(project.totalDuration)} &middot; {formatLoc(project.totalLoc)} LOC
      </div>

      <h2 className="upload-flow__title">AI selected {selectedCount} sessions to showcase</h2>
      <p className="upload-flow__desc">
        Skipped {skippedCount} sessions that were too small, purely mechanical, or redundant.
        You can override any selection.
      </p>

      {triageResult.triageMethod === 'scoring' && (
        <div className="triage-method-banner">
          <span className="triage-method-banner__icon" aria-hidden="true">&#9432;</span>
          <span>Sessions selected by signal analysis (no API key configured). </span>
          <a href="/settings" className="triage-method-banner__link">Go to Settings</a>
        </div>
      )}

      <div className="upload-flow__section-label upload-flow__section-label--selected">
        &#10003; Selected for showcase ({selectedCount})
      </div>
      <div className="triage-list">
        {triageResult.selected.map((item) => {
          const s = sessionMap.get(item.sessionId);
          const isSelected = selectedIds.has(item.sessionId);
          return (
            <TriageItem
              key={item.sessionId}
              sessionId={item.sessionId}
              title={s?.title ?? item.sessionId}
              stats={s ? `${formatDuration(s.durationMinutes)} \u00b7 ${formatLoc(s.linesOfCode)} LOC \u00b7 ${s.turns} turns` : ''}
              reason={item.reason}
              variant="selected"
              checked={isSelected}
              onToggle={() => onToggle(item.sessionId)}
              previouslyPublished={publishedSessionIds?.has(item.sessionId)}
            />
          );
        })}
      </div>

      <details className="triage-skipped">
        <summary className="triage-skipped__summary">
          <span>&#9654;</span> Skipped ({triageResult.skipped.length}) &mdash; click to override
        </summary>
        <div className="triage-list" style={{ marginTop: 'var(--spacing-3)' }}>
          {triageResult.skipped.map((item) => {
            const s = sessionMap.get(item.sessionId);
            const isSelected = selectedIds.has(item.sessionId);
            return (
              <TriageItem
                key={item.sessionId}
                sessionId={item.sessionId}
                title={s?.title ?? item.sessionId}
                stats={s ? `${formatDuration(s.durationMinutes)} \u00b7 ${formatLoc(s.linesOfCode)} LOC \u00b7 ${s.turns} turns` : ''}
                reason={item.reason}
                variant="skipped"
                checked={isSelected}
                onToggle={() => onToggle(item.sessionId)}
                dimTitle={!isSelected}
                previouslyPublished={publishedSessionIds?.has(item.sessionId)}
              />
            );
          })}
        </div>
      </details>

      <div className="upload-flow__actions">
        <button className="btn btn--secondary btn--large" onClick={onBack}>Back</button>
        <button className="btn btn--primary btn--large" onClick={onEnhance} disabled={selectedCount === 0}>
          Enhance project &rarr;
        </button>
      </div>
    </div>
  );
}

// ── Screen 45: Enhance Step ──────────────────────────────────────

interface SessionProgress {
  sessionId: string;
  title: string;
  status: 'pending' | 'enhancing' | 'done' | 'skipped' | 'failed';
  detail?: string;
}

function EnhanceStep({
  project,
  sessions,
  selectedIds,
  triageResult,
  onComplete,
  onBack,
}: {
  project: Project;
  sessions: Session[];
  selectedIds: Set<string>;
  triageResult: TriageResult;
  onComplete: (result: ProjectEnhanceResult) => void;
  onBack: () => void;
}) {
  const sessionMap = new Map(sessions.map((s) => [s.id, s]));
  const [sessionProgress, setSessionProgress] = useState<SessionProgress[]>(() => {
    const selected = triageResult.selected.filter((s) => selectedIds.has(s.sessionId));
    const reAdded = triageResult.skipped.filter((s) => selectedIds.has(s.sessionId));
    return [...selected, ...reAdded].map((s) => ({
      sessionId: s.sessionId,
      title: sessionMap.get(s.sessionId)?.title ?? s.sessionId,
      status: 'pending' as const,
    }));
  });
  const [narrativeStatus, setNarrativeStatus] = useState<'waiting' | 'generating' | 'done'>('waiting');
  const [result, setResult] = useState<ProjectEnhanceResult | null>(null);
  const [progressSkills, setProgressSkills] = useState<string[]>([]);
  const [streamingNarrative, setStreamingNarrative] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [forceEnhance, setForceEnhance] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);

  const startEnhance = useCallback((force: boolean) => {
    if (!project.dirName) return;

    // Reset state for fresh run
    if (force) {
      setCachedAt(null);
      setResult(null);
      setNarrativeStatus('waiting');
      setStreamingNarrative('');
      setProgressSkills([]);
      setError(null);
      setSessionProgress((prev) => prev.map((sp) => ({ ...sp, status: 'pending' as const })));
    }

    const skippedSessions = triageResult.skipped
      .filter((s) => !selectedIds.has(s.sessionId))
      .map((s) => {
        const sess = sessionMap.get(s.sessionId);
        return {
          title: sess?.title ?? s.sessionId,
          duration: sess?.durationMinutes ?? 0,
          loc: sess?.linesOfCode ?? 0,
        };
      });

    const controller = enhanceProject(
      project.dirName,
      Array.from(selectedIds),
      skippedSessions,
      (event: EnhanceEventType) => {
        switch (event.type) {
          case 'session_progress':
            setSessionProgress((prev) =>
              prev.map((sp) =>
                sp.sessionId === event.sessionId
                  ? { ...sp, status: event.status, title: event.title || sp.title, detail: event.detail }
                  : sp,
              ),
            );
            if ((event.status === 'done' || event.status === 'skipped') && event.skills) {
              setProgressSkills((prev) => {
                const set = new Set(prev);
                for (const s of event.skills!) set.add(s);
                return [...set];
              });
            }
            break;
          case 'project_enhance':
            setNarrativeStatus('generating');
            break;
          case 'narrative_chunk':
            setStreamingNarrative((prev) => prev + event.text);
            break;
          case 'cached':
            setCachedAt(event.enhancedAt);
            // Mark all sessions as done instantly
            setSessionProgress((prev) => prev.map((sp) => ({ ...sp, status: 'done' as const })));
            setNarrativeStatus('done');
            break;
          case 'done':
            setNarrativeStatus('done');
            setResult(event.result);
            break;
          case 'error':
            setError(event.message);
            break;
        }
      },
      force,
    );

    controllerRef.current = controller;
    return controller;
  }, [project.dirName, selectedIds, triageResult, sessionMap]);

  useEffect(() => {
    const controller = startEnhance(forceEnhance);
    return () => controller?.abort();
  }, [forceEnhance]);  // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll feed to keep the active/latest completed item visible
  const completedCount = sessionProgress.filter((sp) => sp.status !== 'pending').length;
  useEffect(() => {
    if (!feedRef.current || completedCount === 0) return;
    // Scroll to show the last non-pending item
    const items = feedRef.current.querySelectorAll('.enhance-feed-item:not(.enhance-feed-item--pending)');
    const last = items[items.length - 1];
    if (last) {
      last.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [completedCount]);

  const isDone = result !== null;
  const displaySkills = result?.skills ?? progressSkills;
  const failedSessions = sessionProgress.filter((sp) => sp.status === 'failed');
  const successfulSessions = sessionProgress.filter((sp) => sp.status === 'done' || sp.status === 'skipped');
  const allSessionsDone = sessionProgress.every((sp) => sp.status !== 'pending' && sp.status !== 'enhancing');
  const hasFailures = failedSessions.length > 0;
  const hasSuccesses = successfulSessions.length > 0;

  const handleRetryFailed = useCallback(() => {
    // Reset failed sessions to pending and re-run enhance
    setSessionProgress((prev) => prev.map((sp) => sp.status === 'failed' ? { ...sp, status: 'pending' as const, detail: undefined } : sp));
    setError(null);
    controllerRef.current?.abort();
    setForceEnhance((prev) => !prev);
  }, []);

  const handlePublishWithoutNarrative = useCallback(() => {
    // Create a minimal result without narrative
    const minimalResult: ProjectEnhanceResult = {
      narrative: '',
      arc: [],
      skills: progressSkills,
      timeline: [],
      questions: [],
    };
    onComplete(minimalResult);
  }, [progressSkills, onComplete]);

  return (
    <div className="enhance-split">
      {/* Left: dark terminal feed */}
      <div className="enhance-split__left">
        <div className="enhance-split__left-header">Session Processing</div>
        <div className="enhance-split__feed" ref={feedRef}>
          {sessionProgress.map((sp) => (
            <div key={sp.sessionId} className={`enhance-feed-item ${sp.status === 'pending' ? 'enhance-feed-item--pending' : ''} ${sp.status === 'failed' ? 'enhance-feed-item--failed' : ''}`}>
              <div className="enhance-feed-item__row">
                {sp.status === 'done' || sp.status === 'skipped' ? (
                  <span className="enhance-feed-item__check">&#10003;</span>
                ) : sp.status === 'failed' ? (
                  <span className="enhance-feed-item__fail">&#10007;</span>
                ) : sp.status === 'enhancing' ? (
                  <span className="enhance-feed-item__spinner" />
                ) : (
                  <span className="enhance-feed-item__circle">&#9711;</span>
                )}
                <span className={`enhance-feed-item__title ${sp.status === 'enhancing' ? 'enhance-feed-item__title--active' : ''} ${sp.status === 'failed' ? 'enhance-feed-item__title--failed' : ''}`}>
                  {sp.title}
                </span>
              </div>
              {sp.detail && sp.status !== 'pending' && (
                <div className={`enhance-feed-item__detail ${sp.status === 'failed' ? 'enhance-feed-item__detail--failed' : ''}`}>{sp.detail}</div>
              )}
            </div>
          ))}
        </div>

        <div className="enhance-split__narrative-box">
          <div className="enhance-split__narrative-label">PROJECT NARRATIVE</div>
          <div className="enhance-split__narrative-status">
            {cachedAt && narrativeStatus === 'done' ? (
              <>
                <span className="enhance-feed-item__check">&#10003;</span>
                <span>Loaded from cache ({new Date(cachedAt).toLocaleDateString()})</span>
              </>
            ) : narrativeStatus === 'done' ? (
              <>
                <span className="enhance-feed-item__check">&#10003;</span>
                <span>Project story complete</span>
              </>
            ) : narrativeStatus === 'generating' ? (
              <>
                <span className="enhance-split__blink-dot" />
                <span>Building project story from {selectedIds.size} sessions...</span>
              </>
            ) : (
              <span>Waiting for session processing...</span>
            )}
          </div>
        </div>
      </div>

      {/* Right: emerging narrative */}
      <div className="enhance-split__right">
        <PhaseBar current="enhance" />

        {error ? (
          <div className="enhance-error" style={{ marginTop: 'var(--spacing-4)' }}>
            <div className="enhance-error__message">{error}</div>
            <div className="upload-flow__actions">
              <button className="btn btn--secondary btn--large" onClick={onBack}>Back</button>
              <button className="btn btn--secondary btn--large" onClick={handleRetryFailed}>Retry</button>
              {hasSuccesses && (
                <button className="btn btn--primary btn--large" onClick={handlePublishWithoutNarrative}>
                  Publish without narrative
                </button>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="upload-flow__label">Project Story</div>
            <h2 className="upload-flow__title">{project.name}</h2>

            {!streamingNarrative && !result?.narrative && (
              <div className="enhance-split__narrative-placeholder">
                <span className="enhance-split__blink-dot" />
                <span>
                  {narrativeStatus === 'generating'
                    ? 'Writing project narrative...'
                    : 'Analyzing sessions — narrative will appear here...'}
                </span>
              </div>
            )}

            {(streamingNarrative || result?.narrative) && (
              <div className="enhance-split__narrative-text">
                {result?.narrative ?? streamingNarrative}
                {narrativeStatus === 'generating' && (
                  <span className="typewriter-cursor" aria-hidden="true" />
                )}
              </div>
            )}

            {displaySkills.length > 0 && (
              <div className="enhance-split__skills">
                {displaySkills.map((skill) => (
                  <span key={skill} className="chip">{skill}</span>
                ))}
              </div>
            )}

            {result?.arc && result.arc.length > 0 && (() => {
              const arc = result.arc;
              return (
              <>
                <div className="upload-flow__section-label" style={{ marginTop: 'var(--spacing-6)' }}>Project Arc</div>
                <div className="enhance-split__arc">
                  {arc.map((phase, i) => (
                    <div key={i} className={`enhance-split__arc-item ${!isDone && i === arc.length - 1 ? 'enhance-split__arc-item--generating' : ''}`}>
                      <div className="enhance-split__arc-num">{String(phase.phase).padStart(2, '0')}</div>
                      <div>
                        <div className="enhance-split__arc-title">{phase.title}</div>
                        <div className="enhance-split__arc-desc">{phase.description}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
              );
            })()}

            {allSessionsDone && hasFailures && !isDone && (
              <div className="enhance-split__failure-recovery">
                <p className="enhance-split__failure-text">
                  {failedSessions.length} session{failedSessions.length !== 1 ? 's' : ''} failed to enhance.
                </p>
                <div className="upload-flow__actions">
                  <button className="btn btn--secondary btn--large" onClick={handleRetryFailed}>
                    Retry failed
                  </button>
                  {hasSuccesses && (
                    <button className="btn btn--primary btn--large" onClick={handlePublishWithoutNarrative}>
                      Continue with {successfulSessions.length} successful &rarr;
                    </button>
                  )}
                </div>
              </div>
            )}

            {isDone && (
              <div className="upload-flow__actions">
                {cachedAt && (
                  <button
                    className="btn btn--secondary btn--large"
                    onClick={() => {
                      controllerRef.current?.abort();
                      setForceEnhance(true);
                    }}
                  >
                    Re-enhance
                  </button>
                )}
                <button className="btn btn--primary btn--large" onClick={() => onComplete(result!)}>
                  {result!.questions.length > 0 ? 'Answer a few questions' : 'Continue'} &rarr;
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Screen 48: Questions Step ────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  pattern: 'Pattern detected',
  architecture: 'Architecture',
  evolution: 'Evolution',
};

function QuestionsStep({
  enhanceResult,
  onSkip,
  onWeave,
}: {
  enhanceResult: ProjectEnhanceResult;
  onSkip: () => void;
  onWeave: (answers: RefineAnswer[]) => void;
}) {
  const [answers, setAnswers] = useState<Map<string, string>>(new Map());
  const [refining, setRefining] = useState(false);

  const handleChange = useCallback((id: string, value: string) => {
    setAnswers((prev) => {
      const next = new Map(prev);
      next.set(id, value);
      return next;
    });
  }, []);

  const hasAnswers = Array.from(answers.values()).some((v) => v.trim().length > 0);

  const handleWeave = useCallback(() => {
    const filled: RefineAnswer[] = enhanceResult.questions
      .filter((q) => (answers.get(q.id) ?? '').trim().length > 0)
      .map((q) => ({
        questionId: q.id,
        question: q.question,
        answer: answers.get(q.id)!.trim(),
      }));
    setRefining(true);
    onWeave(filled);
  }, [answers, enhanceResult.questions, onWeave]);

  return (
    <div className="upload-flow">
      <PhaseBar current="questions" />

      <div className="upload-flow__scan-status">
        &#10003; {enhanceResult.timeline.reduce((sum, p) => sum + p.sessions.length, 0)} sessions enhanced &middot; Project narrative generated
      </div>

      <h2 className="upload-flow__title">A few things we noticed</h2>
      <p className="upload-flow__desc">
        Your answers get woven into the narrative. Skip any you don't want to answer.
      </p>

      <div className="questions-list">
        {enhanceResult.questions.map((q) => (
          <div key={q.id} className="question-card">
            <div className="question-card__tag-row">
              <span className={`question-card__tag question-card__tag--${q.category}`}>
                {CATEGORY_LABELS[q.category] ?? q.category}
              </span>
            </div>
            <div className="question-card__text">{q.question}</div>
            <textarea
              className="question-card__textarea"
              value={answers.get(q.id) ?? ''}
              onChange={(e) => handleChange(q.id, e.target.value)}
              placeholder={q.context || ''}
              rows={3}
            />
          </div>
        ))}
      </div>

      <div className="upload-flow__actions">
        <button className="btn btn--secondary btn--large" onClick={onSkip} disabled={refining}>
          Skip questions
        </button>
        <button
          className="btn btn--primary btn--large"
          onClick={handleWeave}
          disabled={!hasAnswers || refining}
        >
          {refining ? 'Weaving...' : 'Weave into narrative \u2192'}
        </button>
      </div>
    </div>
  );
}

// ── Timeline period interface ────────────────────────────────────

interface TimelineSession {
  sessionId: string;
  title: string;
  description?: string;
  duration: number;    // minutes
  featured: boolean;
  tag?: string;        // "KEY DECISION", etc
  skills?: string[];
  date?: string;       // ISO date
}

interface TimelinePeriod {
  period: string;      // "Mar 3–7"
  label: string;       // "Foundation"
  sessions: TimelineSession[];
}

// ── Screen 46: Timeline View ────────────────────────────────────

function TimelineView({
  project,
  timeline,
  onBack,
  onReview,
}: {
  project: Project;
  timeline: TimelinePeriod[];
  onBack: () => void;
  onReview: () => void;
}) {
  const totalSessions = timeline.reduce((sum, p) => sum + p.sessions.length, 0);

  return (
    <div className="upload-flow">
      <PhaseBar current="timeline" />

      <div className="upload-flow__label">Project Timeline</div>
      <h2 className="upload-flow__title">
        {project.name} <span style={{ fontWeight: 400, fontSize: '1rem', color: 'var(--on-surface-variant)' }}>{totalSessions} sessions</span>
      </h2>
      <p className="upload-flow__desc">{project.description}</p>

      <div className="timeline">
        <div className="timeline__line" />
        {timeline.map((period, pIdx) => {
          const featured = period.sessions.filter((s) => s.featured);
          const collapsed = period.sessions.filter((s) => !s.featured);

          return (
            <div key={pIdx} className="timeline__period">
              <div className="timeline__period-header">
                <span className="timeline__period-date">{period.period}</span>
                <span className="timeline__period-sep">&mdash;</span>
                <span className="timeline__period-label">{period.label}</span>
              </div>

              {featured.map((s) => (
                <div key={s.sessionId} className="timeline__featured">
                  <div className="timeline__dot--large" />
                  <div className="timeline__card">
                    <div className="timeline__card-header">
                      <span className="timeline__card-title">{s.title}</span>
                      {s.tag && (
                        <span className="timeline__card-tag">{s.tag}</span>
                      )}
                    </div>
                    <div className="timeline__card-meta">
                      <span>{formatDuration(s.duration)}</span>
                      {s.date && <span>{formatDate(s.date)}</span>}
                    </div>
                    {s.description && (
                      <p className="timeline__card-desc">{s.description}</p>
                    )}
                    {s.skills && s.skills.length > 0 && (
                      <div className="timeline__card-skills">
                        {s.skills.map((skill) => (
                          <span key={skill} className="chip">{skill}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {collapsed.length > 0 && (
                <div className="timeline__collapsed">
                  <div className="timeline__dot--small" />
                  <CollapsedSessions sessions={collapsed} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="upload-flow__actions">
        <button className="btn btn--secondary btn--large" onClick={onBack}>Back</button>
        <button className="btn btn--primary btn--large" onClick={onReview}>Review &amp; publish &rarr;</button>
      </div>
    </div>
  );
}

function CollapsedSessions({ sessions }: { sessions: TimelineSession[] }) {
  const titles = sessions.map((s) => s.title.toLowerCase()).join(', ');
  const dates = sessions
    .filter((s) => s.date)
    .map((s) => s.date as string)
    .sort();
  const dateRange = dates.length >= 2
    ? `${formatDate(dates[0])} \u2013 ${formatDate(dates[dates.length - 1])}`
    : dates.length === 1
      ? formatDate(dates[0])
      : '';

  return (
    <span className="timeline__collapsed-text">
      {sessions.length} smaller session{sessions.length !== 1 ? 's' : ''} &mdash; {titles}
      {dateRange && <> &middot; {dateRange}</>}
    </span>
  );
}

// ── Placeholder timeline data ───────────────────────────────────

const PLACEHOLDER_TIMELINE: TimelinePeriod[] = [
  {
    period: 'Mar 3\u20137',
    label: 'Foundation',
    sessions: [
      {
        sessionId: 'placeholder-1',
        title: 'Project scaffolding & architecture',
        description: 'Set up the monorepo structure, CI pipeline, and core abstractions.',
        duration: 145,
        featured: true,
        tag: 'KEY DECISION',
        skills: ['Architecture', 'CI/CD'],
        date: '2026-03-03',
      },
      {
        sessionId: 'placeholder-2',
        title: 'Dependency setup',
        duration: 30,
        featured: false,
        date: '2026-03-04',
      },
      {
        sessionId: 'placeholder-3',
        title: 'Initial config',
        duration: 15,
        featured: false,
        date: '2026-03-05',
      },
    ],
  },
  {
    period: 'Mar 10\u201314',
    label: 'Core Implementation',
    sessions: [
      {
        sessionId: 'placeholder-4',
        title: 'Data model & API design',
        description: 'Designed the schema and REST endpoints for the core domain.',
        duration: 210,
        featured: true,
        skills: ['API Design', 'PostgreSQL'],
        date: '2026-03-10',
      },
      {
        sessionId: 'placeholder-5',
        title: 'Frontend component library',
        description: 'Built reusable components following the design system.',
        duration: 180,
        featured: true,
        skills: ['React', 'CSS'],
        date: '2026-03-12',
      },
    ],
  },
];

// ── Growth Chart ─────────────────────────────────────────────────

interface GrowthChartProps {
  sessions: Session[];
  totalLoc: number;
  totalFiles: number;
  onSessionClick?: (session: Session) => void;
}

/** A point on the cumulative LOC time series */
export interface GrowthPoint {
  /** Visual x position in ms (after gap compression) */
  visualTime: number;
  /** Cumulative LOC at this point */
  cumulativeLoc: number;
  /** Which session this point belongs to (index in sorted array) */
  sessionIndex: number;
}

/** Session boundary marker for vertical dashed lines */
export interface SessionBoundary {
  visualTime: number;
  title: string;
  sessionIndex: number;
}

/** @internal Exported for testing */
export function formatLocAxis(n: number): string {
  if (n === 0) return '0';
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
  return String(n);
}

/** @internal Exported for testing */
export function formatLocDelta(n: number): string {
  if (n >= 1000) return `+${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return `+${n}`;
}

/** @internal Exported for testing */
export function computeAxisTicks(maxVal: number): number[] {
  if (maxVal <= 0) return [0];
  const rawStep = maxVal / 4;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const nice = [1, 2, 2.5, 5, 10];
  let step = magnitude;
  for (const n of nice) {
    if (n * magnitude >= rawStep) {
      step = n * magnitude;
      break;
    }
  }
  const ticks: number[] = [];
  for (let v = 0; v <= maxVal + step * 0.1; v += step) {
    ticks.push(Math.round(v));
  }
  if (ticks[ticks.length - 1] < maxVal) {
    ticks.push(ticks[ticks.length - 1] + Math.round(step));
  }
  return ticks;
}

const FIVE_MINUTES_MS = 5 * 60 * 1000;
const GAP_COMPRESS_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour
const COMPRESSED_GAP_MS = 10 * 60 * 1000; // gaps > 1h render as 10min

/** Group turns into 5-minute buckets and sum LOC per bucket */
function bucketTurns(
  turns: Array<{ timestamp: string }>,
  sessionStart: number,
  sessionEnd: number,
  locPerTurn: number,
): Array<{ time: number; locDelta: number }> {
  const turnTimes = turns
    .map((t) => new Date(t.timestamp).getTime())
    .filter((t) => !isNaN(t) && t >= sessionStart && t <= sessionEnd + FIVE_MINUTES_MS)
    .sort((a, b) => a - b);

  if (turnTimes.length === 0) {
    return [{ time: sessionEnd, locDelta: locPerTurn * turns.length }];
  }

  const buckets = new Map<number, number>();
  for (const t of turnTimes) {
    const bucketStart = sessionStart + Math.floor((t - sessionStart) / FIVE_MINUTES_MS) * FIVE_MINUTES_MS;
    buckets.set(bucketStart, (buckets.get(bucketStart) ?? 0) + 1);
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => a - b)
    .map(([time, count]) => ({
      time: time + FIVE_MINUTES_MS / 2,
      locDelta: count * locPerTurn,
    }));
}

/**
 * Build intra-session time-series data from turnTimeline.
 * Distributes each session's LOC across tool turns that contain Edit/Write,
 * sampled at 5-minute intervals. Compresses gaps > 1 hour.
 * @internal Exported for testing
 */
export function buildGrowthTimeSeries(
  sessions: Session[],
): { points: GrowthPoint[]; boundaries: SessionBoundary[]; totalVisualTime: number } {
  const sorted = [...sessions]
    .filter((s) => s.date)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  if (sorted.length === 0) return { points: [], boundaries: [], totalVisualTime: 0 };

  interface RawPoint {
    realTime: number;
    cumulativeLoc: number;
    sessionIndex: number;
  }

  const rawPoints: RawPoint[] = [];
  const rawBoundaries: { realTime: number; title: string; sessionIndex: number }[] = [];
  let cumulativeLoc = 0;

  for (let si = 0; si < sorted.length; si++) {
    const session = sorted[si];
    const sessionStart = new Date(session.date).getTime();
    const sessionEnd = session.endTime
      ? new Date(session.endTime).getTime()
      : sessionStart + session.durationMinutes * 60 * 1000;
    const sessionLoc = Math.max(0, session.linesOfCode);

    rawBoundaries.push({ realTime: sessionStart, title: session.title, sessionIndex: si });

    // Start of session: flat line at current cumulative
    rawPoints.push({ realTime: sessionStart, cumulativeLoc, sessionIndex: si });

    if (sessionLoc === 0) {
      rawPoints.push({ realTime: sessionEnd, cumulativeLoc, sessionIndex: si });
      continue;
    }

    const timeline = session.turnTimeline;
    if (!timeline || timeline.length === 0) {
      // No timeline: single jump at session end
      cumulativeLoc += sessionLoc;
      rawPoints.push({ realTime: sessionEnd, cumulativeLoc, sessionIndex: si });
      continue;
    }

    // Find tool turns with Edit/Write
    const editTurns = timeline.filter(
      (t) =>
        t.type === 'tool' &&
        t.tools &&
        t.tools.some((tool) => /edit|write/i.test(tool)),
    );

    const activeTurns = editTurns.length > 0
      ? editTurns
      : timeline.filter((t) => t.type === 'tool' && t.timestamp);

    if (activeTurns.length === 0) {
      cumulativeLoc += sessionLoc;
      rawPoints.push({ realTime: sessionEnd, cumulativeLoc, sessionIndex: si });
      continue;
    }

    const locPerTurn = sessionLoc / activeTurns.length;
    const buckets = bucketTurns(activeTurns, sessionStart, sessionEnd, locPerTurn);
    for (const bucket of buckets) {
      cumulativeLoc += bucket.locDelta;
      rawPoints.push({ realTime: bucket.time, cumulativeLoc, sessionIndex: si });
    }
  }

  if (rawPoints.length === 0) return { points: [], boundaries: [], totalVisualTime: 0 };

  // Compress time gaps > 1 hour
  let visualTime = 0;
  let prevRealTime = rawPoints[0].realTime;
  const realToVisual = new Map<number, number>();

  for (const rp of rawPoints) {
    const gap = rp.realTime - prevRealTime;
    if (gap > GAP_COMPRESS_THRESHOLD_MS) {
      visualTime += COMPRESSED_GAP_MS;
    } else {
      visualTime += Math.max(0, gap);
    }
    realToVisual.set(rp.realTime, visualTime);
    prevRealTime = rp.realTime;
  }

  const points: GrowthPoint[] = rawPoints.map((rp) => ({
    visualTime: realToVisual.get(rp.realTime) ?? 0,
    cumulativeLoc: rp.cumulativeLoc,
    sessionIndex: rp.sessionIndex,
  }));

  // Map boundary real times to visual times
  const boundaries: SessionBoundary[] = rawBoundaries.map((b) => {
    let bestVisual = 0;
    let bestDist = Infinity;
    for (const [real, vis] of realToVisual.entries()) {
      const dist = Math.abs(real - b.realTime);
      if (dist < bestDist) {
        bestDist = dist;
        bestVisual = vis;
      }
    }
    return { visualTime: bestVisual, title: b.title, sessionIndex: b.sessionIndex };
  });

  return { points, boundaries, totalVisualTime: visualTime };
}

/**
 * Build a smooth cubic bezier SVG path through the given points.
 * Uses Catmull-Rom to cubic bezier conversion for natural curves.
 * @internal Exported for testing
 */
export function buildSmoothPath(
  coords: Array<{ x: number; y: number }>,
): string {
  if (coords.length === 0) return '';
  if (coords.length === 1) return `M${coords[0].x.toFixed(1)},${coords[0].y.toFixed(1)}`;
  if (coords.length === 2) {
    return `M${coords[0].x.toFixed(1)},${coords[0].y.toFixed(1)} L${coords[1].x.toFixed(1)},${coords[1].y.toFixed(1)}`;
  }

  const tension = 0.3;
  let path = `M${coords[0].x.toFixed(1)},${coords[0].y.toFixed(1)}`;

  for (let i = 0; i < coords.length - 1; i++) {
    const p0 = coords[Math.max(0, i - 1)];
    const p1 = coords[i];
    const p2 = coords[i + 1];
    const p3 = coords[Math.min(coords.length - 1, i + 2)];

    const cp1x = p1.x + (p2.x - p0.x) * tension;
    const cp1y = p1.y + (p2.y - p0.y) * tension;
    const cp2x = p2.x - (p3.x - p1.x) * tension;
    const cp2y = p2.y - (p3.y - p1.y) * tension;

    path += ` C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }

  return path;
}

/** Truncate title for display */
function truncTitle(t: string, max: number = 14): string {
  return t.length > max ? t.slice(0, max - 1) + '\u2026' : t;
}

/** @internal Exported for testing */
export function GrowthChart({ sessions, totalLoc, totalFiles, onSessionClick }: GrowthChartProps) {
  if (sessions.length === 0) {
    return (
      <div className="growth-chart">
        <div className="growth-chart__svg-container">
          <p style={{ color: 'var(--on-surface-variant)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
            No session data available for growth chart.
          </p>
        </div>
        <div className="growth-chart__summary">
          <div className="growth-chart__total-value">0</div>
          <div className="growth-chart__total-label">LINES OF CODE</div>
        </div>
      </div>
    );
  }

  const dated = sessions.filter((s) => s.date);
  if (dated.length === 0) {
    return (
      <div className="growth-chart">
        <div className="growth-chart__svg-container">
          <p style={{ color: 'var(--on-surface-variant)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
            No dated sessions available for growth chart.
          </p>
        </div>
        <div className="growth-chart__summary">
          <div className="growth-chart__total-value">{formatLoc(totalLoc)}</div>
          <div className="growth-chart__total-label">LINES OF CODE</div>
        </div>
      </div>
    );
  }

  const sortedSessions = [...dated].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const { points, boundaries, totalVisualTime } = buildGrowthTimeSeries(dated);

  if (points.length === 0) {
    return (
      <div className="growth-chart">
        <div className="growth-chart__svg-container">
          <p style={{ color: 'var(--on-surface-variant)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
            No dated sessions available for growth chart.
          </p>
        </div>
        <div className="growth-chart__summary">
          <div className="growth-chart__total-value">{formatLoc(totalLoc)}</div>
          <div className="growth-chart__total-label">LINES OF CODE</div>
        </div>
      </div>
    );
  }

  const maxLoc = Math.max(...points.map((p) => p.cumulativeLoc), 1);
  const ticks = computeAxisTicks(maxLoc);
  const axisMax = ticks[ticks.length - 1] || 1;

  // SVG layout: wider when many sessions to allow horizontal scroll
  const baseWidth = 600;
  const widthPerMinute = 0.8;
  const svgWidth = Math.max(baseWidth, Math.round(totalVisualTime / 60000 * widthPerMinute) + 120);
  const svgHeight = 260;
  const padLeft = 48;
  const padRight = 16;
  const padTop = 32;
  const padBottom = 48;
  const chartW = svgWidth - padLeft - padRight;
  const chartH = svgHeight - padTop - padBottom;

  const maxVisualTime = totalVisualTime || 1;
  const toX = (vt: number) => padLeft + (vt / maxVisualTime) * chartW;
  const toY = (val: number) => padTop + chartH - (val / axisMax) * chartH;

  // Build smooth curve coordinates
  const coords = points.map((p) => ({ x: toX(p.visualTime), y: toY(p.cumulativeLoc) }));
  const linePath = buildSmoothPath(coords);

  // Build area path: smooth line + close along bottom
  const lastCoord = coords[coords.length - 1];
  const firstCoord = coords[0];
  const areaPath =
    linePath +
    ` L${lastCoord.x.toFixed(1)},${(padTop + chartH).toFixed(1)}` +
    ` L${firstCoord.x.toFixed(1)},${(padTop + chartH).toFixed(1)} Z`;

  // Deduplicate boundaries at same visual position
  const uniqueBoundaries = boundaries.filter(
    (b, i) => i === 0 || Math.abs(b.visualTime - boundaries[i - 1].visualTime) > 0.001,
  );

  const sessionCount = dated.length;
  const isScrollable = svgWidth > baseWidth;

  return (
    <div className="growth-chart">
      <div
        className="growth-chart__svg-container"
        style={isScrollable ? { overflowX: 'auto' } : undefined}
      >
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          width={isScrollable ? svgWidth : '100%'}
          height={isScrollable ? svgHeight : undefined}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={`Growth chart showing cumulative lines of code across ${sessionCount} sessions`}
        >
          {/* Y-axis grid lines and labels */}
          {ticks.map((tick) => (
            <g key={`y-${tick}`}>
              <line
                x1={padLeft}
                y1={toY(tick)}
                x2={svgWidth - padRight}
                y2={toY(tick)}
                stroke="var(--outline-variant)"
                strokeWidth="0.5"
                strokeDasharray="4,4"
              />
              <text
                x={padLeft - 8}
                y={toY(tick) + 3}
                textAnchor="end"
                fontFamily="var(--font-mono)"
                fontSize="9"
                fill="var(--on-surface-variant)"
              >
                {formatLocAxis(tick)}
              </text>
            </g>
          ))}

          {/* Session boundary dashed lines and labels */}
          {uniqueBoundaries.map((b, i) => {
            const clickable = onSessionClick && sortedSessions[b.sessionIndex];
            return (
              <g
                key={`boundary-${i}`}
                style={clickable ? { cursor: 'pointer' } : undefined}
                onClick={clickable ? () => onSessionClick(sortedSessions[b.sessionIndex]) : undefined}
              >
                <line
                  x1={toX(b.visualTime)}
                  y1={padTop}
                  x2={toX(b.visualTime)}
                  y2={padTop + chartH}
                  stroke="var(--outline-variant)"
                  strokeWidth="0.5"
                  strokeDasharray="3,3"
                />
                <text
                  x={toX(b.visualTime)}
                  y={padTop + chartH + 16}
                  textAnchor="middle"
                  fontFamily="var(--font-mono)"
                  fontSize="8"
                  fill={clickable ? 'var(--primary)' : 'var(--on-surface-variant)'}
                  textDecoration={clickable ? 'underline' : undefined}
                >
                  {truncTitle(b.title)}
                </text>
              </g>
            );
          })}

          {/* Area fill */}
          <path d={areaPath} fill="rgba(8,68,113,0.06)" />

          {/* Smooth cumulative line */}
          <path
            d={linePath}
            fill="none"
            stroke="var(--primary)"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* Session endpoint dots with delta labels */}
          {uniqueBoundaries.map((b, i) => {
            const sessionPts = points.filter((p) => p.sessionIndex === b.sessionIndex);
            if (sessionPts.length === 0) return null;
            const lastPt = sessionPts[sessionPts.length - 1];
            const firstPt = sessionPts[0];
            const delta = lastPt.cumulativeLoc - firstPt.cumulativeLoc +
              (firstPt === points[0] ? firstPt.cumulativeLoc : 0);
            return (
              <g key={`dot-${i}`}>
                <circle
                  cx={toX(lastPt.visualTime)}
                  cy={toY(lastPt.cumulativeLoc)}
                  r="3"
                  fill="var(--secondary)"
                />
                {delta > 0 && (
                  <text
                    x={toX(lastPt.visualTime)}
                    y={toY(lastPt.cumulativeLoc) - 8}
                    textAnchor="middle"
                    fontFamily="var(--font-mono)"
                    fontSize="8"
                    fill="var(--secondary)"
                  >
                    {formatLocDelta(delta)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <div className="growth-chart__summary">
        <div className="growth-chart__total-value">{formatLoc(totalLoc)}</div>
        <div className="growth-chart__total-label">LINES OF CODE</div>
        <div className="growth-chart__stat">
          <div className="growth-chart__stat-value">{totalFiles}</div>
          <div className="growth-chart__stat-label">FILES TOUCHED</div>
        </div>
        <div className="growth-chart__stat">
          <div className="growth-chart__stat-value">{sessionCount}</div>
          <div className="growth-chart__stat-label">SESSIONS</div>
        </div>
      </div>
    </div>
  );
}

// ── Directory Heatmap ──────────────────────────────────────────

interface FileEditData {
  path: string;
  editCount: number;
}

/** Strip the project root from an absolute path to make it relative.
 *  Prefers session.cwd when available; falls back to dirName decoding. */
function stripProjectRoot(filePath: string, projectDirName: string, cwd?: string): string {
  // Prefer cwd (exact working directory from session data)
  if (cwd && filePath.startsWith(cwd)) {
    const relative = filePath.slice(cwd.length).replace(/^\//, '');
    return relative || filePath;
  }
  // Fallback: decode dirName ("-Users-ben-Dev-myapp" → "/Users/ben/Dev/myapp")
  const root = projectDirName.replace(/^-/, '/').replace(/-/g, '/');
  if (filePath.startsWith(root)) {
    const relative = filePath.slice(root.length).replace(/^\//, '');
    return relative || filePath;
  }
  return filePath;
}

function extractDirectory(filePath: string): string {
  const segments = filePath.split('/').filter(Boolean);
  if (segments.length <= 1) return '/';
  const depth = Math.min(segments.length - 1, 2); // exclude filename, max 2 levels
  return segments.slice(0, depth).join('/') + '/';
}

interface HeatmapData {
  /** Top directories sorted by total edits descending (max 10) */
  directories: string[];
  /** Grid keyed by "dir|sessionId" -> edit count */
  grid: Map<string, number>;
  /** Global max edit count across all cells (for opacity scaling) */
  maxEdits: number;
  /** Top 10 files sorted by edit count descending */
  files: FileEditData[];
  /** Total unique file count */
  totalFiles: number;
}

function buildHeatmapData(sessions: Session[], projectDirName: string): HeatmapData {
  // dir -> session.id -> edits
  const dirSessionMap = new Map<string, Map<string, number>>();
  const dirTotals = new Map<string, number>();
  const fileMap = new Map<string, number>();

  for (const session of sessions) {
    if (!session.filesChanged) continue;
    for (const fc of session.filesChanged) {
      if (!fc.path || typeof fc.path !== 'string') continue;
      const edits = fc.editCount ?? (fc.additions + fc.deletions);
      const relativePath = stripProjectRoot(fc.path, projectDirName, session.cwd);
      const dir = extractDirectory(relativePath);

      if (!dirSessionMap.has(dir)) dirSessionMap.set(dir, new Map());
      const sessionMap = dirSessionMap.get(dir)!;
      sessionMap.set(session.id, (sessionMap.get(session.id) ?? 0) + edits);
      dirTotals.set(dir, (dirTotals.get(dir) ?? 0) + edits);
      fileMap.set(relativePath, (fileMap.get(relativePath) ?? 0) + edits);
    }
  }

  // Top 10 directories by total edits
  const directories = Array.from(dirTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([dir]) => dir);

  // Flatten into grid map keyed by "dir|sessionId"
  const grid = new Map<string, number>();
  let maxEdits = 0;
  for (const dir of directories) {
    const sessionMap = dirSessionMap.get(dir);
    if (!sessionMap) continue;
    for (const session of sessions) {
      const edits = sessionMap.get(session.id) ?? 0;
      grid.set(`${dir}|${session.id}`, edits);
      if (edits > maxEdits) maxEdits = edits;
    }
  }

  const files = Array.from(fileMap.entries())
    .map(([path, editCount]) => ({ path, editCount }))
    .sort((a, b) => b.editCount - a.editCount)
    .slice(0, 10);

  return { directories, grid, maxEdits, files, totalFiles: fileMap.size };
}

function getCellOpacity(editCount: number, maxEdits: number): number {
  if (editCount === 0) return 0.02;
  if (maxEdits === 0) return 0.05;
  const ratio = editCount / maxEdits;
  return 0.05 + ratio * 0.65; // range: 0.05 (1 edit) to 0.70 (max edits)
}

function truncateTitle(title: string, maxLen: number = 15): string {
  if (title.length <= maxLen) return title;
  return title.slice(0, maxLen - 1) + '\u2026';
}

/** @internal Exported for testing */
export function DirectoryHeatmap({ sessions, projectDirName }: { sessions: Session[]; projectDirName: string }) {
  const { directories, grid, maxEdits, files, totalFiles } = buildHeatmapData(sessions, projectDirName);

  if (directories.length === 0) {
    return (
      <div className="dir-heatmap">
        <div className="project-preview__timeline-heading">EDIT HEATMAP BY DIRECTORY</div>
        <p className="dir-heatmap__empty">No file data available</p>
      </div>
    );
  }

  const sessionCount = sessions.length;

  return (
    <div className="dir-heatmap">
      <div className="project-preview__timeline-heading">EDIT HEATMAP BY DIRECTORY</div>
      <div
        className="dir-heatmap__grid"
        style={{ gridTemplateColumns: `150px repeat(${sessionCount}, 1fr)` }}
        role="table"
        aria-label="Directory edit heatmap"
      >
        {/* Header row: empty corner + session labels */}
        <div className="dir-heatmap__corner" role="columnheader" />
        {sessions.map((s) => (
          <div
            key={s.id}
            className="dir-heatmap__session-label"
            role="columnheader"
            title={s.title}
          >
            {truncateTitle(s.title)}
          </div>
        ))}

        {/* Data rows: directory label + cells */}
        {directories.map((dir) => (
          <Fragment key={dir}>
            <div className="dir-heatmap__dir-label" role="rowheader" title={dir}>
              {dir}
            </div>
            {sessions.map((s) => {
              const edits = grid.get(`${dir}|${s.id}`) ?? 0;
              const opacity = getCellOpacity(edits, maxEdits);
              return (
                <div
                  key={s.id}
                  className="dir-heatmap__cell"
                  style={{ background: `rgba(8,68,113,${opacity})` }}
                  role="cell"
                  title={`${dir} in ${s.title}: ${edits} edits`}
                  aria-label={`${dir} in ${s.title}: ${edits} edits`}
                />
              );
            })}
          </Fragment>
        ))}
      </div>

      {/* Legend */}
      <div className="dir-heatmap__legend" aria-hidden="true">
        <span>Intensity = edit count</span>
        <span
          style={{
            display: 'inline-block',
            width: 12,
            height: 12,
            background: 'rgba(8,68,113,0.05)',
            borderRadius: 2,
          }}
        />
        <span
          style={{
            display: 'inline-block',
            width: 12,
            height: 12,
            background: 'rgba(8,68,113,0.35)',
            borderRadius: 2,
          }}
        />
        <span
          style={{
            display: 'inline-block',
            width: 12,
            height: 12,
            background: 'rgba(8,68,113,0.7)',
            borderRadius: 2,
          }}
        />
        <span>low &rarr; high</span>
      </div>

      {/* Top 10 most-edited files (collapsible) */}
      <details className="dir-heatmap__top-files">
        <summary className="dir-heatmap__top-files-summary">
          Top {files.length} most-edited files (of {totalFiles} total) &rarr;
        </summary>
        <div role="list" aria-label="Most edited files">
          {files.map((f) => (
            <div key={f.path} className="dir-heatmap__file-row" role="listitem">
              <span className="dir-heatmap__file-path" title={f.path}>{f.path}</span>
              <span className="dir-heatmap__file-count">{f.editCount} edits</span>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

// ── Agent Activity Section ────────────────────────────────────────

const AGENT_LEGEND: { role: string; label: string; color: string }[] = [
  { role: 'main', label: 'Main', color: '#084471' },
  { role: 'frontend', label: 'Frontend', color: '#7c3aed' },
  { role: 'backend', label: 'Backend', color: '#0891b2' },
  { role: 'qa', label: 'QA', color: '#059669' },
  { role: 'ux', label: 'UX', color: '#d97706' },
  { role: 'pm', label: 'PM', color: '#dc2626' },
];

export function AgentActivitySection({ sessions, projectDirName }: { sessions: Session[]; projectDirName?: string }) {
  // Lazy-load full session data for sessions with childCount > 0 but no childSessions
  const [loadedSessions, setLoadedSessions] = useState<Record<string, Session>>({});
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
  const attemptedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!projectDirName) return;
    const toFetch = sessions.filter(
      (s) =>
        (s.childCount ?? 0) > 0 &&
        !s.childSessions?.length &&
        !attemptedRef.current.has(s.id),
    );
    if (toFetch.length === 0) return;

    for (const s of toFetch) {
      attemptedRef.current.add(s.id);
    }

    setLoadingIds((prev) => {
      const next = new Set(prev);
      for (const s of toFetch) next.add(s.id);
      return next;
    });

    for (const s of toFetch) {
      fetchSession(projectDirName, s.id)
        .then((full) => {
          setLoadedSessions((prev) => ({ ...prev, [s.id]: full }));
        })
        .catch(() => {
          // Fetch failed; leave it out of loadedSessions
        })
        .finally(() => {
          setLoadingIds((prev) => {
            const next = new Set(prev);
            next.delete(s.id);
            return next;
          });
        });
    }
  }, [sessions, projectDirName]);

  // Merge loaded full sessions into the session list for rendering
  const resolvedSessions = sessions.map((s) => loadedSessions[s.id] ?? s);

  if (sessions.length === 0) return null;

  const orchestrated = resolvedSessions.filter(
    (s) => s.isOrchestrated === true || (s.childCount ?? 0) > 0,
  );
  const hasOrchestrated = orchestrated.length > 0;

  // Collect unique agent roles across all resolved sessions
  const allRoles = new Set<string>();
  for (const s of resolvedSessions) {
    if (s.agentRole) allRoles.add(s.agentRole.toLowerCase());
    if (s.childSessions) {
      for (const c of s.childSessions) {
        if (c.agentRole) allRoles.add(c.agentRole.toLowerCase());
      }
    }
    if (s.children) {
      for (const c of s.children) {
        if (c.role) allRoles.add(c.role.toLowerCase());
      }
    }
  }

  // Compute agent LOC from resolved sessions
  let agentLoc = 0;
  let totalLoc = 0;
  for (const s of resolvedSessions) {
    totalLoc += s.linesOfCode;
    if (s.childSessions) {
      for (const c of s.childSessions) {
        agentLoc += c.linesOfCode;
      }
    } else if (s.children) {
      for (const c of s.children) {
        agentLoc += c.linesOfCode ?? 0;
      }
    }
  }

  // Filter legend to only roles actually present
  const activeLegend = AGENT_LEGEND.filter((l) => allRoles.has(l.role));
  // If no specific roles found but we have sessions, show at least "Main"
  if (activeLegend.length === 0) {
    activeLegend.push(AGENT_LEGEND[0]);
  }

  const maxDuration = Math.max(...resolvedSessions.map((s) => s.durationMinutes), 1);

  return (
    <div className="agent-activity">
      <div className="project-preview__timeline-heading">AGENT ACTIVITY</div>
      <div className="agent-activity__card">
        {/* Color legend */}
        <div className="agent-activity__legend">
          {activeLegend.map((item) => (
            <div key={item.role} className="agent-activity__legend-item">
              <span
                className="agent-activity__legend-dot"
                style={{ background: item.color }}
              />
              {item.label}
            </div>
          ))}
        </div>

        {/* Session timelines */}
        <div className="agent-activity__timelines">
          {resolvedSessions.map((s) => {
            const hasChildren = (s.childSessions && s.childSessions.length > 0) || false;
            const isLoading = loadingIds.has(s.id);
            const canUseFullTimeline = hasChildren;

            if (canUseFullTimeline) {
              return (
                <div key={s.id} className="agent-activity__session">
                  <div className="agent-activity__session-label">{s.title}</div>
                  <AgentTimeline session={s} variant="compact" />
                </div>
              );
            }

            // Show loading state for sessions being fetched
            if (isLoading) {
              return (
                <div key={s.id} className="agent-activity__session">
                  <div className="agent-activity__session-label">{s.title}</div>
                  <div className="agent-activity__loading" aria-label="Loading agent activity">
                    Loading agent activity...
                  </div>
                </div>
              );
            }

            // Simplified fallback: horizontal bar with dots
            const barWidth = Math.max(20, Math.round((s.durationMinutes / maxDuration) * 100));
            const childCount = s.childCount ?? s.children?.length ?? 0;

            return (
              <div key={s.id} className="agent-activity__session">
                <div className="agent-activity__session-label">{s.title}</div>
                <svg
                  viewBox="0 0 400 30"
                  role="img"
                  aria-label={`Session timeline: ${s.title}`}
                  style={{ width: '100%', height: 30, display: 'block' }}
                >
                  {/* Track line */}
                  <line
                    x1="20" y1="15" x2={20 + barWidth * 3.4} y2="15"
                    stroke="var(--primary, #084471)"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                  {/* Open circle at start */}
                  <circle
                    cx="20" cy="15" r="4"
                    fill="none"
                    stroke="var(--primary, #084471)"
                    strokeWidth="1.5"
                  />
                  {/* Filled circle at end */}
                  <circle
                    cx={20 + barWidth * 3.4} cy="15" r="4"
                    fill="var(--primary, #084471)"
                  />
                  {/* Duration + LOC label */}
                  <text
                    x={20 + barWidth * 3.4 + 12}
                    y="19"
                    fontFamily="var(--font-mono, monospace)"
                    fontSize="8"
                    fill="var(--on-surface-variant, #6b7280)"
                  >
                    {Math.round(s.durationMinutes)}m
                    {s.linesOfCode > 0 ? ` \u00B7 ${s.linesOfCode} LOC` : ''}
                    {childCount > 0 ? ` (${childCount} agents)` : ''}
                  </text>
                </svg>
              </div>
            );
          })}
        </div>

        {/* Summary stats */}
        <div className="agent-activity__summary">
          <div>
            <div className="agent-activity__summary-value">
              {orchestrated.length} of {sessions.length}
            </div>
            <div className="agent-activity__summary-label">Orchestrated</div>
          </div>
          <div>
            <div className="agent-activity__summary-value">
              {Math.max(allRoles.size, 1)}
            </div>
            <div className="agent-activity__summary-label">Unique Roles</div>
          </div>
          <div>
            <div className="agent-activity__summary-value">
              {agentLoc > 0 ? `${agentLoc}` : '\u2014'}
            </div>
            <div className="agent-activity__summary-label">Agent LOC</div>
          </div>
          <div>
            <div className="agent-activity__summary-value">
              {totalLoc > 0 ? `${totalLoc}` : '\u2014'}
            </div>
            <div className="agent-activity__summary-label">Total LOC</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Project Preview overlay (Screen 25 mockup) ──────────────────

interface ProjectPreviewProps {
  project: Project;
  narrative: string;
  skills: string[];
  timeline: TimelinePeriod[];
  selectedCount: number;
  sessions: Session[];
  repoUrl: string;
  projectUrl: string;
  onClose: () => void;
}

const SESSION_BAR_COLORS = ['var(--primary)', 'var(--secondary)', 'var(--tertiary)'];

function ProjectPreview({
  project,
  narrative,
  skills,
  timeline,
  selectedCount,
  sessions,
  repoUrl,
  projectUrl,
  onClose,
}: ProjectPreviewProps) {
  const [detailSession, setDetailSession] = useState<Session | null>(null);
  const totalSessions = timeline.reduce((sum, p) => sum + p.sessions.length, 0);
  const maxDuration = sessions.length > 0
    ? Math.max(...sessions.map((s) => s.durationMinutes))
    : 1;

  // Close on Escape key (detail overlay handles its own Escape)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !detailSession) onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, detailSession]);

  return (
    <div className="project-preview" role="dialog" aria-label="Project preview">
      <div className="project-preview__banner">
        Preview — this is how your project will appear on heyi.am
      </div>
      <button
        className="project-preview__close"
        onClick={onClose}
        aria-label="Close preview"
      >
        Close preview &times;
      </button>

      <div className="project-preview__content">
        {/* Breadcrumb */}
        <div className="project-preview__breadcrumb">
          ben / {project.name}
        </div>

        {/* Title */}
        <h1 className="project-preview__title">{project.name}</h1>

        {/* Links row */}
        {(repoUrl || projectUrl) && (
          <div className="project-preview__links">
            {repoUrl && (
              <a
                href={repoUrl}
                className="project-preview__link"
                target="_blank"
                rel="noopener noreferrer"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
                </svg>
                Repo
              </a>
            )}
            {projectUrl && (
              <a
                href={projectUrl}
                className="project-preview__link"
                target="_blank"
                rel="noopener noreferrer"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                  <path d="M5 1H2a1 1 0 00-1 1v10a1 1 0 001 1h10a1 1 0 001-1V9M8 1h5v5M13 1L6 8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Live site
              </a>
            )}
          </div>
        )}

        {/* Narrative */}
        {narrative && (
          <div className="project-preview__narrative">
            {narrative}
          </div>
        )}

        {/* Skills */}
        {skills.length > 0 && (
          <div className="project-preview__skills">
            {skills.map((skill) => (
              <span key={skill} className="chip">{skill}</span>
            ))}
          </div>
        )}

        {/* Screenshot placeholder */}
        <div className="project-preview__screenshot">
          <div className="project-preview__screenshot-inner">
            <span aria-hidden="true">&#128247;</span>
            <span>Project screenshot</span>
          </div>
        </div>

        {/* Hero stats */}
        <div className="project-preview__hero-stats">
          <div className="project-preview__hero-stat">
            <div className="project-preview__hero-value project-preview__hero-value--primary">
              {formatDuration(project.totalDuration)}
            </div>
            <div className="project-preview__hero-label">Total Time</div>
          </div>
          <div className="project-preview__hero-stat">
            <div className="project-preview__hero-value">
              {project.sessionCount} ({selectedCount})
            </div>
            <div className="project-preview__hero-label">Sessions</div>
          </div>
          <div className="project-preview__hero-stat">
            <div className="project-preview__hero-value">{formatLoc(project.totalLoc)}</div>
            <div className="project-preview__hero-label">LOC</div>
          </div>
          <div className="project-preview__hero-stat">
            <div className="project-preview__hero-value">{project.totalFiles}</div>
            <div className="project-preview__hero-label">Files</div>
          </div>
        </div>

        {/* Work Timeline — real time axis with gaps and fork/join */}
        <div className="project-preview__timeline-heading">WORK TIMELINE</div>
        <WorkTimeline sessions={sessions} onSessionClick={setDetailSession} />

        {/* Timeline */}
        <div className="project-preview__timeline-heading">PROJECT TIMELINE</div>
        <div className="timeline">
          <div className="timeline__line" />
          {timeline.map((period, pIdx) => {
            const featured = period.sessions.filter((s) => s.featured);
            const collapsed = period.sessions.filter((s) => !s.featured);

            return (
              <div key={pIdx} className="timeline__period">
                <div className="timeline__period-header">
                  <span className="timeline__period-date">{period.period}</span>
                  <span className="timeline__period-sep">&mdash;</span>
                  <span className="timeline__period-label">{period.label}</span>
                </div>

                {featured.map((s) => (
                  <div key={s.sessionId} className="timeline__featured">
                    <div className="timeline__dot--large" />
                    <div
                      className="timeline__card"
                      style={{ cursor: 'pointer' }}
                      onClick={() => {
                        const match = sessions.find((sess) => sess.id === s.sessionId);
                        if (match) {
                          setDetailSession(match);
                        } else {
                          document.getElementById(`session-${s.sessionId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          const match = sessions.find((sess) => sess.id === s.sessionId);
                          if (match) {
                            setDetailSession(match);
                          } else {
                            document.getElementById(`session-${s.sessionId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          }
                        }
                      }}
                    >
                      <div className="timeline__card-header">
                        <span className="timeline__card-title">{s.title}</span>
                        {s.tag && (
                          <span className="timeline__card-tag">{s.tag}</span>
                        )}
                      </div>
                      <div className="timeline__card-meta">
                        <span>{formatDuration(s.duration)}</span>
                        {s.date && <span>{formatDate(s.date)}</span>}
                      </div>
                      {s.description && (
                        <p className="timeline__card-desc">{s.description}</p>
                      )}
                      {s.skills && s.skills.length > 0 && (
                        <div className="timeline__card-skills">
                          {s.skills.map((skill) => (
                            <span key={skill} className="chip">{skill}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {collapsed.length > 0 && (
                  <div className="timeline__collapsed">
                    <div className="timeline__dot--small" />
                    <CollapsedSessions sessions={collapsed} />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Project Growth chart */}
        <div className="project-preview__timeline-heading">PROJECT GROWTH</div>
        <GrowthChart
          sessions={sessions}
          totalLoc={project.totalLoc}
          totalFiles={project.totalFiles}
          onSessionClick={setDetailSession}
        />

        {/* Directory Heatmap */}
        <DirectoryHeatmap sessions={sessions} projectDirName={project.dirName} />

        {/* Published Sessions grid */}
        {sessions.length > 0 && (
          <>
            <div className="project-preview__sessions-heading">PUBLISHED SESSIONS</div>
            <div className="project-preview__sessions-grid">
              {sessions.map((s, i) => {
                const barColor = SESSION_BAR_COLORS[i % SESSION_BAR_COLORS.length];
                const barWidth = maxDuration > 0
                  ? Math.max(20, Math.round((s.durationMinutes / maxDuration) * 100))
                  : 100;
                const filesCount = s.filesChanged?.length ?? 0;

                return (
                  <div
                    key={s.id}
                    id={`session-${s.id}`}
                    className="project-preview__session-card project-preview__session-card--clickable"
                    onClick={() => setDetailSession(s)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setDetailSession(s);
                      }
                    }}
                  >
                    <div
                      className="project-preview__session-bar"
                      style={{ width: `${barWidth}%`, background: barColor }}
                    />
                    <h3 className="project-preview__session-title">{s.title}</h3>
                    <div className="project-preview__session-stats">
                      {Math.round(s.durationMinutes)} min
                      {' \u00B7 '}{s.turns} turns
                      {filesCount > 0 && <>{' \u00B7 '}{filesCount} files</>}
                      {' \u00B7 '}{formatLoc(s.linesOfCode)} LOC
                    </div>
                    {s.skills && s.skills.length > 0 && (
                      <div className="project-preview__session-skills">
                        {s.skills.map((skill) => (
                          <span key={skill} className="chip">{skill}</span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {detailSession && (
        <SessionDetailOverlay
          session={detailSession}
          projectName={project.name}
          projectDirName={project.dirName}
          onClose={() => setDetailSession(null)}
        />
      )}
    </div>
  );
}

// ── Screen 47: Review before publishing ──────────────────────────

interface ReviewStepProps {
  project: Project;
  narrative: string;
  selectedCount: number;
  skippedCount: number;
  skills: string[];
  timeline: TimelinePeriod[];
  sessions: Session[];
  selectedIds: Set<string>;
  allSessions: Session[];
  repoUrl: string;
  onRepoUrlChange: (url: string) => void;
  projectUrl: string;
  onProjectUrlChange: (url: string) => void;
  onPublish: (result: { url: string; publishedSessions: number }) => void;
  onSaveLocal: () => void | Promise<void>;
  onBack: () => void;
}

/** @internal Exported for testing */
export function ReviewStep({
  project,
  narrative,
  selectedCount,
  skippedCount,
  skills,
  timeline,
  sessions,
  selectedIds,
  allSessions,
  repoUrl,
  onRepoUrlChange,
  projectUrl,
  onProjectUrlChange,
  onPublish,
  onSaveLocal,
  onBack,
}: ReviewStepProps) {
  const [showPreview, setShowPreview] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishErrorType, setPublishErrorType] = useState<'project' | 'sessions' | null>(null);
  const [sessionPublishStatuses, setSessionPublishStatuses] = useState<Map<string, { status: 'publishing' | 'published' | 'failed'; error?: string }>>(new Map());
  const [partialPublishUrl, setPartialPublishUrl] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [deviceCode, setDeviceCode] = useState<{ userCode: string; verificationUri: string; deviceCode: string } | null>(null);
  const [authPolling, setAuthPolling] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const publishControllerRef = useRef<AbortController | null>(null);
  const { refresh: refreshAuth } = useAuth();

  const publishedLabel = `${project.sessionCount} (${selectedCount} published)`;

  const slug = project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const buildPayload = useCallback((): PublishProjectPayload => {
    const skippedSessions = allSessions
      .filter((s) => !selectedIds.has(s.id))
      .map((s) => ({
        title: s.title,
        duration: s.durationMinutes ?? 0,
        loc: s.linesOfCode ?? 0,
        reason: 'Not selected',
      }));

    return {
      title: project.name,
      slug,
      narrative,
      repoUrl,
      projectUrl,
      timeline,
      skills,
      totalSessions: project.sessionCount,
      totalLoc: project.totalLoc,
      totalDurationMinutes: project.totalDuration,
      totalFilesChanged: project.totalFiles,
      skippedSessions,
      selectedSessionIds: [...selectedIds],
    };
  }, [project, slug, narrative, repoUrl, projectUrl, timeline, skills, allSessions, selectedIds]);

  const startAuthFlow = useCallback(async () => {
    setNeedsAuth(true);
    try {
      const codeInfo = await startDeviceAuth();
      setDeviceCode({
        userCode: codeInfo.user_code,
        verificationUri: codeInfo.verification_uri,
        deviceCode: codeInfo.device_code,
      });
      setAuthPolling(true);
      const interval = (codeInfo.interval || 5) * 1000;
      pollRef.current = setInterval(async () => {
        try {
          const status = await pollDeviceAuth(codeInfo.device_code);
          if (status.authenticated) {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            setAuthPolling(false);
            setNeedsAuth(false);
            await refreshAuth();
            doPublish();
          }
        } catch {
          // Keep polling on transient errors
        }
      }, interval);
    } catch (authErr) {
      setPublishError(`Login failed: ${(authErr as Error).message}`);
    }
  }, [refreshAuth]);

  const doPublish = useCallback((retrySessionIds?: string[]) => {
    setPublishing(true);
    setPublishError(null);
    setPublishErrorType(null);
    setNeedsAuth(false);

    const payload = buildPayload();
    if (retrySessionIds) {
      payload.selectedSessionIds = retrySessionIds;
    }

    publishControllerRef.current?.abort();
    const controller = publishProject(project.dirName, payload, (event: PublishEvent) => {
      switch (event.type) {
        case 'session':
          setSessionPublishStatuses((prev) => {
            const next = new Map(prev);
            next.set(event.sessionId, { status: event.status === 'publishing' ? 'publishing' as const : event.status, error: event.error });
            return next;
          });
          break;

        case 'done': {
          setPublishing(false);
          if (event.failed > 0) {
            setPublishErrorType('sessions');
            setPartialPublishUrl(event.projectUrl);
            setPublishError(`${event.failed} session${event.failed !== 1 ? 's' : ''} failed to publish`);
          } else {
            refreshAuth();
            onPublish({ url: event.projectUrl, publishedSessions: event.uploaded });
          }
          break;
        }

        case 'error':
          setPublishing(false);
          if (event.error === 'AUTH_REQUIRED') {
            startAuthFlow();
          } else {
            setPublishErrorType('project');
            setPublishError(event.error);
          }
          break;
      }
    });

    publishControllerRef.current = controller;
  }, [buildPayload, project.dirName, onPublish, refreshAuth, startAuthFlow]);

  // Cleanup polling and publish stream on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      publishControllerRef.current?.abort();
    };
  }, []);

  return (
    <div className="upload-flow">
      <PhaseBar current="review" />

      <div className="upload-flow__scan-status">
        &#10003; {selectedCount} sessions enhanced &middot; Project narrative generated &middot; Timeline built
      </div>

      <h2 className="upload-flow__title">Review your project</h2>

      {/* ── Project card preview ── */}
      <div className="review-card">
        <div className="upload-flow__label">PROJECT</div>
        <h3 className="review-card__name">{project.name}</h3>
        {narrative && <p className="review-card__narrative">{narrative}</p>}

        <div className="upload-flow__stat-grid">
          <StatCard label="Sessions" value={publishedLabel} />
          <StatCard label="Total Time" value={formatDuration(project.totalDuration)} />
          <StatCard label="LOC" value={formatLoc(project.totalLoc)} />
          <StatCard label="Files" value={String(project.totalFiles)} />
        </div>

        <div className="review-card__skills">
          {skills.map((skill) => (
            <span key={skill} className="chip">{skill}</span>
          ))}
        </div>
      </div>

      <button
        className="review-preview-link"
        onClick={() => setShowPreview(true)}
      >
        Preview full project page &rarr;
      </button>

      {showPreview && (
        <ProjectPreview
          project={project}
          narrative={narrative}
          skills={skills}
          timeline={timeline}
          selectedCount={selectedCount}
          sessions={sessions}
          repoUrl={repoUrl}
          projectUrl={projectUrl}
          onClose={() => setShowPreview(false)}
        />
      )}

      {/* ── What gets published ── */}
      <div className="review-checklist">
        <div className="upload-flow__section-label" style={{ marginBottom: 'var(--spacing-3)' }}>What gets published</div>
        <div className="review-checklist__item">
          <span className="review-checklist__icon review-checklist__icon--checked" aria-hidden="true">&#10003;</span>
          <span>Project narrative and timeline</span>
        </div>
        <div className="review-checklist__item">
          <span className="review-checklist__icon review-checklist__icon--checked" aria-hidden="true">&#10003;</span>
          <span>{selectedCount} enhanced session case studies</span>
        </div>
        <div className="review-checklist__item">
          <span className="review-checklist__icon review-checklist__icon--checked" aria-hidden="true">&#10003;</span>
          <span>Aggregate stats from all sessions</span>
        </div>
        <div className="review-checklist__item">
          <span className="review-checklist__icon review-checklist__icon--checked" aria-hidden="true">&#10003;</span>
          <span>Growth chart, heatmap, and top files</span>
        </div>
        {skippedCount > 0 && (
          <div className="review-checklist__item review-checklist__item--skipped">
            <span className="review-checklist__icon review-checklist__icon--skipped" aria-hidden="true">&#9675;</span>
            <span>{skippedCount} skipped sessions (metadata only)</span>
          </div>
        )}
      </div>

      {/* ── Project details ── */}
      <div className="review-details">
        <div className="review-details__header">
          <div className="upload-flow__section-label" style={{ marginBottom: 0 }}>Project details</div>
          <span className="review-details__optional">all optional</span>
        </div>

        <div className="review-field">
          <label className="review-field__label" htmlFor="review-repo-url">
            Repository URL
            {repoUrl && <span className="review-field__badge">&#10003; auto-detected</span>}
          </label>
          <input
            id="review-repo-url"
            type="url"
            className="review-field__input"
            value={repoUrl}
            onChange={(e) => onRepoUrlChange(e.target.value)}
            placeholder="https://github.com/..."
          />
        </div>

        <div className="review-field">
          <label className="review-field__label" htmlFor="review-project-url">Project URL</label>
          <input
            id="review-project-url"
            type="url"
            className="review-field__input"
            value={projectUrl}
            onChange={(e) => onProjectUrlChange(e.target.value)}
            placeholder="Live site, docs, demo..."
          />
        </div>

        <div className="review-field">
          <span className="review-field__label">Screenshot</span>
          <div className="review-dropzone" role="button" tabIndex={0} aria-label="Upload screenshot">
            <span className="review-dropzone__icon" aria-hidden="true">&#128247;</span>
            <span className="review-dropzone__text">Drop an image or click to upload</span>
          </div>
        </div>
      </div>

      {/* ── Inline auth card ── */}
      {needsAuth && (
        <div className="review-auth">
          <div className="review-auth__card">
            <h3 className="review-auth__title">Sign in to publish</h3>
            {deviceCode ? (
              <>
                <p className="review-auth__instructions">
                  Open{' '}
                  <a href={deviceCode.verificationUri} target="_blank" rel="noopener noreferrer">
                    {deviceCode.verificationUri}
                  </a>{' '}
                  and enter:
                </p>
                <div className="review-auth__code">{deviceCode.userCode}</div>
                {authPolling && (
                  <p className="review-auth__polling">Waiting for authorization...</p>
                )}
              </>
            ) : (
              <p className="review-auth__polling">Starting login...</p>
            )}
          </div>
        </div>
      )}

      {/* Live publish progress */}
      {publishing && sessionPublishStatuses.size > 0 && (
        <div className="publish-progress">
          <div className="upload-flow__section-label" style={{ marginBottom: 'var(--spacing-2)' }}>Publishing sessions...</div>
          <div className="publish-progress__sessions">
            {Array.from(sessionPublishStatuses.entries()).map(([sid, st]) => {
              const s = sessions.find((sess) => sess.id === sid);
              return (
                <div key={sid} className="publish-progress__row">
                  {st.status === 'published' ? (
                    <span className="publish-error__icon--published">{'\u2713'}</span>
                  ) : st.status === 'publishing' ? (
                    <span className="enhance-feed-item__spinner" />
                  ) : (
                    <span className="publish-error__icon--failed">{'\u2717'}</span>
                  )}
                  <span>{s?.title ?? sid}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {publishError && (
        <div className="publish-error">
          <div className="publish-error__message">{publishError}</div>

          {publishErrorType === 'sessions' && sessionPublishStatuses.size > 0 && (
            <div className="publish-error__sessions">
              {Array.from(sessionPublishStatuses.entries()).map(([sid, st]) => {
                const s = sessions.find((sess) => sess.id === sid);
                return (
                  <div key={sid} className={`publish-error__session-row publish-error__session-row--${st.status}`}>
                    <span className={`publish-error__icon publish-error__icon--${st.status}`}>
                      {st.status === 'published' ? '\u2713' : '\u2717'}
                    </span>
                    <span className="publish-error__session-title">{s?.title ?? sid}</span>
                    {st.error && <span className="publish-error__session-error">{st.error}</span>}
                  </div>
                );
              })}
            </div>
          )}

          <div className="publish-error__actions">
            {publishErrorType === 'sessions' && (
              <>
                <button
                  className="btn btn--secondary"
                  onClick={() => {
                    const failedIds = Array.from(sessionPublishStatuses.entries())
                      .filter(([, st]) => st.status === 'failed')
                      .map(([sid]) => sid);
                    doPublish(failedIds);
                  }}
                >
                  Retry failed sessions
                </button>
                {partialPublishUrl && (
                  <button
                    className="btn btn--primary"
                    onClick={() => onPublish({
                      url: partialPublishUrl,
                      publishedSessions: Array.from(sessionPublishStatuses.values()).filter((s) => s.status === 'published').length,
                    })}
                  >
                    Continue with published sessions
                  </button>
                )}
              </>
            )}
            {publishErrorType === 'project' && (
              <button className="btn btn--secondary" onClick={() => doPublish()}>
                Retry
              </button>
            )}
            <button
              className="btn btn--secondary"
              onClick={() => {
                setPublishError(null);
                setPublishErrorType(null);
              }}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* ── Actions ── */}
      <div className="upload-flow__actions">
        <button type="button" className="btn btn--secondary btn--large" onClick={onBack} disabled={publishing}>
          Back to timeline
        </button>
        <button type="button" className="btn btn--secondary btn--large" onClick={onSaveLocal} disabled={publishing}>
          Save locally
        </button>
        <button
          type="button"
          className="btn btn--primary btn--large"
          onClick={() => doPublish()}
          disabled={publishing || needsAuth}
        >
          {publishing ? 'Publishing...' : 'Publish project \u2192'}
        </button>
      </div>
    </div>
  );
}

// ── Screen 12: Success Step ───────────────────────────────────────

interface SuccessStepProps {
  project: Project;
  narrative: string;
  selectedCount: number;
  publishedUrl?: string;
  publishedSessions?: number;
}

function SuccessStep({ project, narrative, selectedCount, publishedUrl, publishedSessions }: SuccessStepProps) {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const isPublished = !!publishedUrl;
  const displayUrl = publishedUrl
    ? (publishedUrl.startsWith('/') ? `heyi.am${publishedUrl}` : publishedUrl)
    : '';

  const handleCopy = useCallback(() => {
    if (!displayUrl) return;
    navigator.clipboard.writeText(`https://${displayUrl}`).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      // clipboard API not available in this context
    });
  }, [displayUrl]);

  const handleViewProject = useCallback(() => {
    if (displayUrl) {
      window.open(`https://${displayUrl}`, '_blank', 'noopener');
    }
  }, [displayUrl]);

  const handleViewPortfolio = useCallback(() => {
    if (!displayUrl) return;
    const parts = displayUrl.split('/');
    const portfolioUrl = parts.length >= 2 ? `https://${parts[0]}/${parts[1]}` : `https://${displayUrl}`;
    window.open(portfolioUrl, '_blank', 'noopener');
  }, [displayUrl]);

  const saveDate = new Date().toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const snippetText = narrative.length > 120 ? `${narrative.slice(0, 117)}...` : narrative;

  return (
    <div className="upload-flow">
      <PhaseBar current="done" />

      <div className="success-card">
        <div className="success-card__icon">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <circle cx="16" cy="16" r="16" fill="var(--success-bg, #dcfce7)" />
            <path d="M10 16.5L14 20.5L22 12.5" stroke="var(--success-fg, #16a34a)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        <h2 className="success-card__title">
          {isPublished ? 'Project Published' : 'Project Saved'}
        </h2>
        <p className="success-card__subtitle">
          {isPublished
            ? `Your project is live on your portfolio with ${selectedCount} session case ${selectedCount === 1 ? 'study' : 'studies'}.`
            : `Enhancement saved locally with ${selectedCount} session case ${selectedCount === 1 ? 'study' : 'studies'}. You can preview or publish anytime.`}
        </p>

        <div className="success-card__preview">
          <div className="success-card__preview-name">{project.name}</div>
          <div className="success-card__preview-narrative">{snippetText}</div>
          <div className="success-card__preview-stats">
            <div className="success-card__preview-stat">
              <span className="success-card__preview-stat-value">{project.sessionCount}</span>
              <span className="success-card__preview-stat-label">Sessions</span>
            </div>
            <div className="success-card__preview-stat">
              <span className="success-card__preview-stat-value">{formatDuration(project.totalDuration)}</span>
              <span className="success-card__preview-stat-label">Time</span>
            </div>
            <div className="success-card__preview-stat">
              <span className="success-card__preview-stat-value">{formatLoc(project.totalLoc)}</span>
              <span className="success-card__preview-stat-label">LOC</span>
            </div>
            <div className="success-card__preview-stat">
              <span className="success-card__preview-stat-value">{selectedCount}</span>
              <span className="success-card__preview-stat-label">{isPublished ? 'Published' : 'Enhanced'}</span>
            </div>
          </div>
        </div>

        {isPublished && displayUrl && (
          <div className="success-card__url-bar">
            <span className="success-card__url-text">{displayUrl}</span>
            <button className="success-card__url-copy" onClick={handleCopy}>
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        )}

        <div className="success-card__meta">
          <span className="success-card__badge">{isPublished ? 'Published' : 'Saved locally'}</span>
          {isPublished && publishedSessions && (
            <span className="success-card__meta-text">{publishedSessions} sessions uploaded</span>
          )}
          <span className="success-card__meta-text">{saveDate}</span>
        </div>

        <div className="success-card__actions">
          {isPublished ? (
            <>
              <button type="button" className="btn btn--primary btn--large" onClick={handleViewProject}>
                View Project Page
              </button>
              <button type="button" className="btn btn--secondary btn--large" onClick={handleViewPortfolio}>
                View Portfolio
              </button>
            </>
          ) : (
            <button type="button" className="btn btn--primary btn--large" onClick={() => navigate('/')}>
              Back to Projects
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main flow component ──────────────────────────────────────────

export function ProjectUploadFlow() {
  const { dirName } = useParams<{ dirName: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { projects } = useSessionsContext();

  const project = projects.find((p) => p.dirName === dirName);

  const [step, setStepRaw] = useState<Step>('overview');
  const setStep = useCallback((s: Step) => {
    setStepRaw(s);
    window.scrollTo(0, 0);
  }, []);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [triageResult, setTriageResult] = useState<TriageResult | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [triaging, setTriaging] = useState(false);
  const [triageEvents, setTriageEvents] = useState<TriageEvent[]>([]);
  const [autoSelectMessage, setAutoSelectMessage] = useState<string | null>(null);
  const triageControllerRef = useRef<AbortController | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enhanceResult, setEnhanceResult] = useState<ProjectEnhanceResult | null>(null);
  const [repoUrl, setRepoUrl] = useState('');
  const [projectUrl, setProjectUrl] = useState('');
  const [publishResult, setPublishResult] = useState<{ url: string; publishedSessions: number } | null>(null);


  // Derived from enhance result (or refined)
  const narrative = enhanceResult?.narrative ?? '';
  const enhanceSkills = enhanceResult?.skills ?? [];
  const enhanceTimeline = enhanceResult?.timeline ?? [];

  // Load sessions lazily — only when a step actually needs them
  const loadSessionsIfNeeded = useCallback(() => {
    if (sessions.length > 0 || !dirName) return;
    fetchSessions(dirName)
      .then((sess) => {
        setSessions(sess);
        setLoadingSessions(false);
      })
      .catch((err) => {
        setError((err as Error).message);
        setLoadingSessions(false);
      });
  }, [dirName, sessions.length]);

  // Load sessions when entering a step that needs them
  useEffect(() => {
    if (['overview', 'triage', 'enhance'].includes(step)) {
      loadSessionsIfNeeded();
    }
  }, [step, loadSessionsIfNeeded]);

  // Auto-load cached preview when ?preview=1 is in URL
  useEffect(() => {
    const mode = searchParams.get('view') || searchParams.get('preview');
    if (!dirName || mode !== '1') return;
    fetchProjectEnhanceCache(dirName).then((cache) => {
      if (cache) {
        setEnhanceResult(cache.result);
        setSelectedIds(new Set(cache.selectedSessionIds));
        setStep('review');
      }
      setSearchParams({}, { replace: true });
    });
  }, [dirName]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTriage = useCallback(() => {
    if (!dirName) return;
    setTriaging(true);
    setError(null);
    setTriageEvents([]);

    const controller = triageProject(dirName, (event: TriageEvent) => {
      setTriageEvents((prev) => [...prev, event]);

      if (event.type === 'error') {
        setError(event.message);
        setTriaging(false);
        return;
      }

      if (event.type === 'result') {
        const result: TriageResult = {
          selected: event.selected,
          skipped: event.skipped,
          autoSelected: (event as TriageResult & { autoSelected?: boolean }).autoSelected,
          triageMethod: (event as TriageResult & { triageMethod?: string }).triageMethod,
        };
        setTriageResult(result);
        // Pre-check: triage-selected + any previously published sessions
        const ids = new Set(result.selected.map((s) => s.sessionId));
        if (project?.publishedSessions) {
          for (const sid of project.publishedSessions) {
            ids.add(sid);
          }
        }
        setSelectedIds(ids);
        // Brief pause then advance
        setTimeout(() => {
          setTriaging(false);
          if (result.autoSelected) {
            // Small project: skip triage results, go straight to enhance
            setAutoSelectMessage(`All ${ids.size} sessions selected (small project)`);
            setStep('enhance');
          } else {
            setStep('triage');
          }
        }, 1200);
      }
    });

    triageControllerRef.current = controller;
  }, [dirName]);

  // Cleanup triage controller on unmount
  useEffect(() => {
    return () => {
      triageControllerRef.current?.abort();
    };
  }, []);

  const handleEnhanceComplete = useCallback((result: ProjectEnhanceResult) => {
    setEnhanceResult(result);
    if (result.questions.length > 0) {
      setStep('questions');
    } else {
      setStep('timeline');
    }
  }, []);

  const handleSkipQuestions = useCallback(() => {
    setStep('timeline');
  }, []);

  const handleWeaveAnswers = useCallback(async (answers: RefineAnswer[]) => {
    if (!dirName || !enhanceResult) return;
    try {
      const refined = await refineNarrative(
        dirName,
        enhanceResult.narrative,
        enhanceResult.timeline,
        answers,
      );
      setEnhanceResult((prev) => prev ? {
        ...prev,
        narrative: refined.narrative,
        timeline: refined.timeline,
      } : prev);
      setStep('timeline');
    } catch (err) {
      setError((err as Error).message);
    }
  }, [dirName, enhanceResult]);

  const handleToggle = useCallback((sessionId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(sessionId)) {
        next.delete(sessionId);
      } else {
        next.add(sessionId);
      }
      return next;
    });
  }, []);

  if (!project) {
    return (
      <AppShell title="heyi.am" onBack={() => navigate('/')}>
        <div className="dashboard-error">Project not found</div>
      </AppShell>
    );
  }

  return (
    <AppShell title="heyi.am" onBack={() => navigate('/')}>
      {loadingSessions && step === 'overview' ? (
        <div className="dashboard-loading">Loading sessions...</div>
      ) : error && step === 'overview' ? (
        <div className="dashboard-error">{error}</div>
      ) : step === 'overview' ? (
        triaging ? (
          <TriageTerminal events={triageEvents} dirName={dirName ?? ''} />
        ) : (
          <SessionOverview
            project={project}
            sessions={sessions}
            onTriage={handleTriage}
            onCancel={() => navigate('/')}
          />
        )
      ) : step === 'triage' && triageResult ? (
        <TriageResults
          project={project}
          sessions={sessions}
          triageResult={triageResult}
          selectedIds={selectedIds}
          onToggle={handleToggle}
          onEnhance={() => setStep('enhance')}
          onBack={() => setStep('overview')}
          publishedSessionIds={project.publishedSessions ? new Set(project.publishedSessions) : undefined}
        />
      ) : step === 'enhance' && triageResult ? (
        <>
        {autoSelectMessage && (
          <div className="upload-flow__auto-select-banner">
            &#10003; {autoSelectMessage}
          </div>
        )}
        <EnhanceStep
          project={project}
          sessions={sessions}
          selectedIds={selectedIds}
          triageResult={triageResult}
          onComplete={handleEnhanceComplete}
          onBack={() => setStep('triage')}
        />
        </>
      ) : step === 'questions' && enhanceResult ? (
        <QuestionsStep
          enhanceResult={enhanceResult}
          onSkip={handleSkipQuestions}
          onWeave={handleWeaveAnswers}
        />
      ) : step === 'timeline' ? (
        <TimelineView
          project={project}
          timeline={enhanceTimeline.length > 0
            ? enhanceTimeline.map((t) => ({
                ...t,
                sessions: t.sessions.map((s) => ({
                  sessionId: s.sessionId,
                  title: s.title,
                  featured: s.featured,
                  tag: s.tag,
                  duration: sessions.find((ss) => ss.id === s.sessionId)?.durationMinutes ?? 0,
                  date: sessions.find((ss) => ss.id === s.sessionId)?.date,
                })),
              }))
            : PLACEHOLDER_TIMELINE}
          onBack={() => enhanceResult?.questions.length ? setStep('questions') : setStep('enhance')}
          onReview={() => setStep('review')}
        />
      ) : step === 'review' ? (
        <ReviewStep
          project={project}
          narrative={narrative}
          selectedCount={selectedIds.size}
          skippedCount={sessions.length - selectedIds.size}
          skills={enhanceSkills.length > 0 ? enhanceSkills : project.skills}
          timeline={enhanceTimeline.length > 0
            ? enhanceTimeline.map((t) => ({
                ...t,
                sessions: t.sessions.map((s) => ({
                  sessionId: s.sessionId,
                  title: s.title,
                  description: s.description,
                  featured: s.featured,
                  tag: s.tag,
                  skills: s.skills,
                  duration: sessions.find((ss) => ss.id === s.sessionId)?.durationMinutes ?? 0,
                  date: sessions.find((ss) => ss.id === s.sessionId)?.date,
                })),
              }))
            : PLACEHOLDER_TIMELINE}
          sessions={sessions.filter((s) => selectedIds.has(s.id))}
          selectedIds={selectedIds}
          allSessions={sessions}
          repoUrl={repoUrl}
          onRepoUrlChange={setRepoUrl}
          projectUrl={projectUrl}
          onProjectUrlChange={setProjectUrl}
          onPublish={(result) => {
            setPublishResult(result);
            setStep('done');
          }}
          onSaveLocal={async () => {
            if (!dirName || !enhanceResult) return;
            await saveProjectEnhanceLocally(
              dirName,
              [...selectedIds],
              enhanceResult,
            );
            setPublishResult(null);
            setStep('done');
          }}
          onBack={() => setStep('timeline')}
        />
      ) : step === 'done' ? (
        <SuccessStep
          project={project}
          narrative={narrative}
          selectedCount={selectedIds.size}
          publishedUrl={publishResult?.url}
          publishedSessions={publishResult?.publishedSessions}
        />
      ) : null}

    </AppShell>
  );
}
