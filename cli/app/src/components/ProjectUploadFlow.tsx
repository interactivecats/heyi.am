import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSessionsContext } from '../SessionsContext';
import { AppShell } from './AppShell';
import { fetchSessions, triageProject, type TriageResult } from '../api';
import type { Session, Project } from '../types';

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
        <button className="btn btn--primary btn--large" onClick={onTriage}>Let AI pick sessions &rarr;</button>
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

// ── Screen 44: Triage Results ────────────────────────────────────

function TriageResults({
  project,
  sessions,
  triageResult,
  selectedIds,
  onToggle,
  onEnhance,
  onBack,
}: {
  project: Project;
  sessions: Session[];
  triageResult: TriageResult;
  selectedIds: Set<string>;
  onToggle: (sessionId: string) => void;
  onEnhance: () => void;
  onBack: () => void;
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

      <div className="upload-flow__section-label upload-flow__section-label--selected">
        &#10003; Selected for showcase ({selectedCount})
      </div>
      <div className="triage-list">
        {triageResult.selected.map((item) => {
          const s = sessionMap.get(item.sessionId);
          const isSelected = selectedIds.has(item.sessionId);
          return (
            <div
              key={item.sessionId}
              className={`triage-item ${isSelected ? 'triage-item--selected' : 'triage-item--skipped'}`}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => onToggle(item.sessionId)}
                className="triage-item__checkbox"
              />
              <div className="triage-item__info">
                <div className="triage-item__name">{s?.title ?? item.sessionId}</div>
                <div className="triage-item__stats">
                  {s ? `${formatDuration(s.durationMinutes)} \u00b7 ${formatLoc(s.linesOfCode)} LOC \u00b7 ${s.turns} turns` : ''}
                </div>
              </div>
              <div className="triage-item__reason triage-item__reason--selected">{item.reason}</div>
            </div>
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
              <div
                key={item.sessionId}
                className={`triage-item ${isSelected ? 'triage-item--selected' : 'triage-item--skipped'}`}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => onToggle(item.sessionId)}
                  className="triage-item__checkbox"
                />
                <div className="triage-item__info">
                  <div className="triage-item__name" style={{ color: isSelected ? undefined : 'var(--on-surface-variant)' }}>
                    {s?.title ?? item.sessionId}
                  </div>
                  <div className="triage-item__stats">
                    {s ? `${formatDuration(s.durationMinutes)} \u00b7 ${formatLoc(s.linesOfCode)} LOC \u00b7 ${s.turns} turns` : ''}
                  </div>
                </div>
                <div className="triage-item__reason triage-item__reason--skipped">{item.reason}</div>
              </div>
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

// ── Main flow component ──────────────────────────────────────────

export function ProjectUploadFlow() {
  const { dirName } = useParams<{ dirName: string }>();
  const navigate = useNavigate();
  const { projects } = useSessionsContext();

  const project = projects.find((p) => p.dirName === dirName);

  const [step, setStep] = useState<Step>('overview');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [triageResult, setTriageResult] = useState<TriageResult | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [triaging, setTriaging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load sessions on mount
  useEffect(() => {
    if (!dirName) return;
    fetchSessions(dirName)
      .then((sess) => {
        setSessions(sess);
        setLoadingSessions(false);
      })
      .catch((err) => {
        setError((err as Error).message);
        setLoadingSessions(false);
      });
  }, [dirName]);

  const handleTriage = useCallback(async () => {
    if (!dirName) return;
    setTriaging(true);
    setError(null);
    try {
      const result = await triageProject(dirName);
      setTriageResult(result);
      setSelectedIds(new Set(result.selected.map((s) => s.sessionId)));
      setStep('triage');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setTriaging(false);
    }
  }, [dirName]);

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
      {loadingSessions ? (
        <div className="dashboard-loading">Loading sessions...</div>
      ) : error ? (
        <div className="dashboard-error">{error}</div>
      ) : step === 'overview' ? (
        triaging ? (
          <div className="dashboard-loading">
            Scanning {sessions.length} sessions...
          </div>
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
        />
      ) : step === 'enhance' ? (
        <div className="upload-flow">
          <PhaseBar current="enhance" />
          <h2 className="upload-flow__title">Enhancing project...</h2>
          <p className="upload-flow__desc">Phase 3 will build this screen (Screen 45).</p>
        </div>
      ) : null}
    </AppShell>
  );
}
