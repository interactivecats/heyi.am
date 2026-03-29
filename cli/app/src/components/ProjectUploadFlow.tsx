import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { AppShell } from './shared';
import {
  fetchProjects,
  fetchSessions,
  saveProjectEnhanceLocally,
  triageProject,
  enhanceProject,
  refineNarrative,
  type TriageResult,
  type TriageEvent,
  type ProjectEnhanceResult,
  type EnhanceEvent,
  type RefineAnswer,
  type Project,
  type Session,
} from '../api';

type Step = 'overview' | 'triage' | 'enhance' | 'questions' | 'timeline';

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

const STEPS: Step[] = ['overview', 'triage', 'enhance', 'questions', 'timeline'];

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
        <StatCard
          label={project.totalAgentDuration ? 'You / Agents' : 'Total Time'}
          value={project.totalAgentDuration
            ? `${formatDuration(project.totalDuration)} / ${formatDuration(project.totalAgentDuration)}`
            : formatDuration(project.totalDuration)}
        />
        <StatCard label="Lines changed" value={formatLoc(project.totalLoc)} />
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
  previouslyUploaded,
}: {
  sessionId: string;
  title: string;
  stats: string;
  reason: string;
  variant: 'selected' | 'skipped';
  checked: boolean;
  onToggle: () => void;
  dimTitle?: boolean;
  previouslyUploaded?: boolean;
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
          {previouslyUploaded && (
            <span className="triage-item__uploaded-badge">previously uploaded</span>
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
  uploadedSessionIds,
}: {
  project: Project;
  sessions: Session[];
  triageResult: TriageResult;
  selectedIds: Set<string>;
  onToggle: (sessionId: string) => void;
  onEnhance: () => void;
  onBack: () => void;
  uploadedSessionIds?: Set<string>;
}) {
  const sessionMap = new Map(sessions.map((s) => [s.id, s]));

  const selectedCount = selectedIds.size;
  const skippedCount = sessions.length - selectedCount;

  return (
    <div className="upload-flow">
      <PhaseBar current="triage" />

      <div className="upload-flow__scan-status">
        &#10003; Scanned {sessions.length} sessions &middot; {formatDuration(project.totalDuration)} &middot; {formatLoc(project.totalLoc)} lines
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
              stats={s ? `${formatDuration(s.durationMinutes)} \u00b7 ${formatLoc(s.linesOfCode)} lines \u00b7 ${s.turns} turns` : ''}
              reason={item.reason}
              variant="selected"
              checked={isSelected}
              onToggle={() => onToggle(item.sessionId)}
              previouslyUploaded={uploadedSessionIds?.has(item.sessionId)}
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
                stats={s ? `${formatDuration(s.durationMinutes)} \u00b7 ${formatLoc(s.linesOfCode)} lines \u00b7 ${s.turns} turns` : ''}
                reason={item.reason}
                variant="skipped"
                checked={isSelected}
                onToggle={() => onToggle(item.sessionId)}
                dimTitle={!isSelected}
                previouslyUploaded={uploadedSessionIds?.has(item.sessionId)}
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
      (event: EnhanceEvent) => {
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

  const handleUploadWithoutNarrative = useCallback(() => {
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
                <button className="btn btn--primary btn--large" onClick={handleUploadWithoutNarrative}>
                  Continue without narrative
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
                    <button className="btn btn--primary btn--large" onClick={handleUploadWithoutNarrative}>
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
  onViewProject,
}: {
  project: Project;
  timeline: TimelinePeriod[];
  onBack: () => void;
  onViewProject: () => void;
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
        <button className="btn btn--primary btn--large" onClick={onViewProject}>View updated project &rarr;</button>
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


// ── Main flow component ──────────────────────────────────────────

export function ProjectUploadFlow() {
  const { dirName } = useParams<{ dirName: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);

  useEffect(() => {
    fetchProjects().then(setProjects).catch(() => {}).finally(() => setProjectsLoading(false));
  }, []);

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

  // Auto-load cached preview when ?preview=1 is in URL — redirect to project detail
  useEffect(() => {
    const mode = searchParams.get('view') || searchParams.get('preview');
    if (!dirName || mode !== '1') return;
    setSearchParams({}, { replace: true });
    navigate(`/project/${dirName}`);
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
        // Pre-check: triage-selected + any previously uploaded sessions
        const ids = new Set(result.selected.map((s) => s.sessionId));
        if (project?.uploadedSessions) {
          for (const sid of project.uploadedSessions) {
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

  if (projectsLoading) {
    return (
      <AppShell back={{ label: 'Projects', to: '/projects' }}>
        <div className="dashboard-loading">Loading project...</div>
      </AppShell>
    );
  }

  if (!project) {
    return (
      <AppShell back={{ label: 'Projects', to: '/projects' }}>
        <div className="dashboard-error">Project not found</div>
      </AppShell>
    );
  }

  return (
    <AppShell back={{ label: 'Projects', to: '/projects' }}>
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
          uploadedSessionIds={project.uploadedSessions ? new Set(project.uploadedSessions) : undefined}
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
          onViewProject={() => {
            // Save enhancement locally then navigate to project detail
            if (dirName && enhanceResult) {
              saveProjectEnhanceLocally(
                dirName,
                Array.from(selectedIds),
                enhanceResult,
              ).catch(() => { /* non-fatal */ });
            }
            navigate(`/project/${dirName}`);
          }}
        />
      ) : null}

    </AppShell>
  );
}
