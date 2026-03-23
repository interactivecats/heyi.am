import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../AuthContext';

interface ProjectTimeStats {
  name: string;
  dirName: string;
  sessions: number;
  yourMinutes: number;
  agentMinutes: number;
  orchestratedSessions: number;
  maxParallelAgents: number;
  avgAgentsPerSession: number;
  uniqueRoles: string[];
}

interface TimeStatsResponse {
  projects: ProjectTimeStats[];
  totals: {
    yourMinutes: number;
    agentMinutes: number;
    sessions: number;
  };
}

function fmtTime(mins: number): string {
  if (mins >= 60) {
    const h = mins / 60;
    return h >= 10 ? `${Math.round(h)}h` : `${h.toFixed(1)}h`;
  }
  return `${Math.round(mins)}m`;
}

function calcMultiplier(you: number, agent: number): string {
  if (you === 0) return '—';
  const m = agent / you;
  return m >= 1.05 ? `${m.toFixed(1)}x` : '1x';
}

export function TimePage() {
  const auth = useAuth();
  const [data, setData] = useState<TimeStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [anonymize, setAnonymize] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<{ ok: boolean; url?: string; error?: string } | null>(null);
  const [copyingImage, setCopyingImage] = useState(false);
  const captureRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/time-stats')
      .then(r => r.json())
      .then((d: TimeStatsResponse) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const handlePublish = useCallback(async () => {
    if (!data) return;
    setPublishing(true);
    setPublishResult(null);

    const payload = {
      time_stats: {
        anonymized: anonymize,
        projects: data.projects.map(p => ({
          name: p.name,
          your_minutes: p.yourMinutes,
          agent_minutes: p.agentMinutes,
          sessions: p.sessions,
          orchestrated_sessions: p.orchestratedSessions,
          max_parallel_agents: p.maxParallelAgents,
          avg_agents_per_session: p.avgAgentsPerSession,
          unique_roles: p.uniqueRoles,
        })),
        totals: {
          your_minutes: data.totals.yourMinutes,
          agent_minutes: data.totals.agentMinutes,
          sessions: data.totals.sessions,
        },
      },
    };

    try {
      const res = await fetch('/api/publish-time-stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await res.json();
      if (res.ok) {
        setPublishResult({ ok: true, url: result.url });
      } else if (res.status === 401) {
        setPublishResult({ ok: false, error: 'Not logged in. Run heyiam login in your terminal, or go to Settings.' });
      } else {
        setPublishResult({ ok: false, error: result.error || 'Failed to publish' });
      }
    } catch {
      setPublishResult({ ok: false, error: 'Network error' });
    } finally {
      setPublishing(false);
    }
  }, [data, anonymize]);

  const handleCopyImage = useCallback(async () => {
    if (!captureRef.current) return;
    setCopyingImage(true);
    try {
      const { default: html2canvas } = await import('html2canvas');
      const canvas = await html2canvas(captureRef.current, {
        backgroundColor: '#ffffff',
        scale: 2,
      });
      canvas.toBlob(async (blob) => {
        if (blob) {
          try {
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
          } catch {
            // Fallback: download
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'heyi-am-time.png';
            a.click();
            URL.revokeObjectURL(url);
          }
        }
        setCopyingImage(false);
      }, 'image/png');
    } catch {
      setCopyingImage(false);
    }
  }, []);

  if (loading) {
    return (
      <div className="time-page">
        <div className="time-page__loading">Scanning sessions...</div>
      </div>
    );
  }

  if (!data || data.projects.length === 0) {
    return (
      <div className="time-page">
        <div className="time-page__empty">No sessions found.</div>
      </div>
    );
  }

  const { projects, totals } = data;
  const displayProjects = anonymize
    ? projects.map((p, i) => ({ ...p, name: `Project ${String.fromCharCode(65 + i)}` }))
    : projects;
  const totalOrchestrated = projects.reduce((s, p) => s + p.orchestratedSessions, 0);
  const globalMaxParallel = Math.max(...projects.map(p => p.maxParallelAgents));
  const allRoles = [...new Set(projects.flatMap(p => p.uniqueRoles))];

  return (
    <div className="time-page">
      {/* Actions bar */}
      <div className="time-page__actions">
        <label className="time-page__toggle">
          <input type="checkbox" checked={anonymize} onChange={e => setAnonymize(e.target.checked)} />
          <span>Anonymize projects</span>
        </label>
        <div className="time-page__action-buttons">
          <button
            className="btn btn--secondary btn--small"
            onClick={handleCopyImage}
            disabled={copyingImage}
          >
            {copyingImage ? 'Capturing...' : 'Copy as image'}
          </button>
          {auth.authenticated ? (
            <button
              className="btn btn--primary btn--small"
              onClick={handlePublish}
              disabled={publishing}
            >
              {publishing ? 'Publishing...' : 'Publish to heyi.am'}
            </button>
          ) : (
            <a href="/settings" className="btn btn--primary btn--small" style={{ textDecoration: 'none' }}>
              Log in to publish
            </a>
          )}
        </div>
      </div>

      {publishResult && (
        <div className={`time-page__publish-result ${publishResult.ok ? '' : 'time-page__publish-result--error'}`}>
          {publishResult.ok
            ? <>Published! Share: <a href={`https://heyi.am${publishResult.url}`} target="_blank" rel="noopener">heyi.am{publishResult.url}</a></>
            : publishResult.error}
        </div>
      )}

      {/* Capturable area for screenshot */}
      <div ref={captureRef} className="time-page__capture">
        <div className="time-page__header">
          <h1 className="time-page__title">You / Agents</h1>
          <p className="time-page__subtitle">Time invested vs. total AI agent compute</p>
        </div>

        {/* Hero stats */}
        <div className="time-page__hero">
          <div className="time-page__hero-stat">
            <div className="time-page__hero-value time-page__hero-value--primary">{fmtTime(totals.yourMinutes)}</div>
            <div className="time-page__hero-label">Your Time</div>
          </div>
          <div className="time-page__hero-divider">/</div>
          <div className="time-page__hero-stat">
            <div className="time-page__hero-value">{fmtTime(totals.agentMinutes)}</div>
            <div className="time-page__hero-label">Agent Time</div>
          </div>
          <div className="time-page__hero-stat">
            <div className="time-page__hero-value">{calcMultiplier(totals.yourMinutes, totals.agentMinutes)}</div>
            <div className="time-page__hero-label">Multiplier</div>
          </div>
        </div>

        {/* Summary chips */}
        <div className="time-page__chips">
          <span className="time-page__chip">{totals.sessions} sessions</span>
          <span className="time-page__chip">{totalOrchestrated} orchestrated</span>
          {globalMaxParallel > 0 && <span className="time-page__chip">{globalMaxParallel} max parallel agents</span>}
          {allRoles.length > 0 && <span className="time-page__chip">{allRoles.length} unique roles</span>}
        </div>

        {/* Project table */}
        <div className="time-page__table">
          <div className="time-page__table-header">
            <span>Project</span>
            <span style={{ textAlign: 'right' }}>You / Agents</span>
            <span style={{ textAlign: 'right' }}>Multiplier</span>
            <span style={{ textAlign: 'right' }}>Sessions</span>
            <span style={{ textAlign: 'right' }}>Max Parallel</span>
            <span style={{ textAlign: 'right' }}>Avg Agents</span>
          </div>
          {displayProjects.map((p, i) => (
            <div key={p.dirName || i} className="time-page__table-row">
              <span className="time-page__project-name">{p.name}</span>
              <span style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.8125rem' }}>
                {fmtTime(p.yourMinutes)} / {fmtTime(p.agentMinutes)}
              </span>
              <span style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.8125rem' }}>
                {calcMultiplier(p.yourMinutes, p.agentMinutes)}
              </span>
              <span style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.8125rem' }}>
                {p.sessions}{p.orchestratedSessions > 0 ? ` (${p.orchestratedSessions})` : ''}
              </span>
              <span style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.8125rem' }}>
                {p.maxParallelAgents > 0 ? p.maxParallelAgents : '—'}
              </span>
              <span style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.8125rem' }}>
                {p.avgAgentsPerSession > 1 ? p.avgAgentsPerSession : '1'}
              </span>
            </div>
          ))}
        </div>

        {/* Roles breakdown */}
        {allRoles.length > 0 && (
          <div className="time-page__roles">
            <div className="time-page__section-label">Agent Roles Used</div>
            <div className="time-page__role-chips">
              {allRoles.map(role => (
                <span key={role} className="chip">{role}</span>
              ))}
            </div>
          </div>
        )}

        <div className="time-page__footer">
          <span className="time-page__footer-text">heyi.am — proof of how you build with AI</span>
        </div>
      </div>
    </div>
  );
}
