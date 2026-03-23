import { useState, useEffect } from 'react';

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

function multiplier(you: number, agent: number): string {
  if (you === 0) return '—';
  const m = agent / you;
  return m >= 1.05 ? `${m.toFixed(1)}x` : '1x';
}

export function TimePage() {
  const [data, setData] = useState<TimeStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/time-stats')
      .then(r => r.json())
      .then((d: TimeStatsResponse) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
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
  const totalOrchestrated = projects.reduce((s, p) => s + p.orchestratedSessions, 0);
  const globalMaxParallel = Math.max(...projects.map(p => p.maxParallelAgents));
  const allRoles = [...new Set(projects.flatMap(p => p.uniqueRoles))];

  return (
    <div className="time-page">
      <div className="time-page__header">
        <h1 className="time-page__title">You / Agents</h1>
        <p className="time-page__subtitle">Time you invested vs. total AI agent compute across all projects</p>
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
          <div className="time-page__hero-value">{multiplier(totals.yourMinutes, totals.agentMinutes)}</div>
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
        {projects.map((p) => (
          <div key={p.dirName} className="time-page__table-row">
            <span className="time-page__project-name">{p.name}</span>
            <span style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.8125rem' }}>
              {fmtTime(p.yourMinutes)} / {fmtTime(p.agentMinutes)}
            </span>
            <span style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.8125rem' }}>
              {multiplier(p.yourMinutes, p.agentMinutes)}
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
  );
}
