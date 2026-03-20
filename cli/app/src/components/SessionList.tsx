import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from './AppShell';

/* ==========================================================================
   Data Model
   ========================================================================== */

interface Session {
  id: string;
  title: string;
  date: string;
  durationMinutes: number;
  turns: number;
  linesOfCode: number;
  status: 'draft' | 'published' | 'archived';
  projectName: string;
  rawLog: string[];
}

interface Project {
  name: string;
  sessionCount: number;
}

/* ==========================================================================
   Mock Data
   ========================================================================== */

const MOCK_SESSIONS: Session[] = [
  {
    id: 'ses-001',
    title: 'Refactor JWT middleware to support refresh tokens',
    date: '2026-03-18T14:32:00Z',
    durationMinutes: 47,
    turns: 23,
    linesOfCode: 312,
    status: 'published',
    projectName: 'auth-service',
    rawLog: [
      '$ claude "refactor the JWT middleware to handle refresh tokens"',
      '> Reading src/middleware/auth.ts...',
      '> Found 3 files referencing token validation',
      '> Proposing changes to src/middleware/auth.ts',
      '+ Added refreshToken() handler',
      '+ Updated validateToken() to check expiry',
      '+ Added token rotation logic',
      '> Running tests... 14 passed, 0 failed',
      '$ claude "add rate limiting to the refresh endpoint"',
      '> Adding rate limiter middleware...',
      '+ Created src/middleware/rateLimit.ts',
      '> All tests passing. Session complete.',
    ],
  },
  {
    id: 'ses-002',
    title: 'Add OAuth2 provider abstraction layer',
    date: '2026-03-17T09:15:00Z',
    durationMinutes: 63,
    turns: 31,
    linesOfCode: 487,
    status: 'draft',
    projectName: 'auth-service',
    rawLog: [
      '$ claude "create an abstraction layer for OAuth2 providers"',
      '> Analyzing existing OAuth implementation...',
      '> Found hardcoded Google OAuth in auth.controller.ts',
      '> Proposing provider interface pattern',
      '+ Created src/providers/OAuthProvider.ts',
      '+ Implemented GoogleProvider extends OAuthProvider',
      '+ Implemented GitHubProvider extends OAuthProvider',
      '> Running tests... 22 passed, 0 failed',
    ],
  },
  {
    id: 'ses-003',
    title: 'Build ETL pipeline for event stream processing',
    date: '2026-03-16T11:00:00Z',
    durationMinutes: 89,
    turns: 42,
    linesOfCode: 634,
    status: 'published',
    projectName: 'data-pipeline',
    rawLog: [
      '$ claude "set up an ETL pipeline for our Kafka event stream"',
      '> Reading existing consumer setup...',
      '> Found src/consumers/eventConsumer.ts',
      '> Proposing transform layer architecture',
      '+ Created src/transforms/EventTransformer.ts',
      '+ Added batch processing with configurable window',
      '+ Created src/sinks/PostgresSink.ts',
      '> Tests: 18 passed. Pipeline throughput: 12k events/sec.',
    ],
  },
  {
    id: 'ses-004',
    title: 'Implement accessible dropdown component',
    date: '2026-03-15T16:20:00Z',
    durationMinutes: 34,
    turns: 18,
    linesOfCode: 198,
    status: 'draft',
    projectName: 'ui-components',
    rawLog: [
      '$ claude "build an accessible dropdown with keyboard nav"',
      '> Creating Dropdown component with ARIA attributes...',
      '+ Added role="listbox" and aria-activedescendant',
      '+ Implemented arrow key navigation',
      '+ Added Home/End key support',
      '+ Focus trap and Escape to close',
      '> Running a11y audit... 0 violations found.',
    ],
  },
  {
    id: 'ses-005',
    title: 'Add request validation and error serialization',
    date: '2026-03-14T13:45:00Z',
    durationMinutes: 52,
    turns: 27,
    linesOfCode: 401,
    status: 'archived',
    projectName: 'api-gateway',
    rawLog: [
      '$ claude "add zod validation to all API routes"',
      '> Scanning route definitions in src/routes/...',
      '> Found 14 route handlers without input validation',
      '> Proposing validation middleware pattern',
      '+ Created src/middleware/validate.ts',
      '+ Added schemas for all 14 routes',
      '+ Standardized error response format',
      '> Tests: 31 passed, 0 failed. Coverage: 94%.',
    ],
  },
  {
    id: 'ses-006',
    title: 'Optimize batch insert performance for high-volume ingestion',
    date: '2026-03-13T10:10:00Z',
    durationMinutes: 71,
    turns: 35,
    linesOfCode: 289,
    status: 'published',
    projectName: 'data-pipeline',
    rawLog: [
      '$ claude "optimize the batch insert — we are dropping events at peak"',
      '> Profiling current insert path...',
      '> Bottleneck: individual INSERTs in a loop',
      '> Proposing bulk INSERT with UNNEST',
      '+ Rewrote sink to use pg COPY protocol',
      '+ Added connection pooling (pool size: 10)',
      '+ Added backpressure signaling to consumer',
      '> Throughput improved from 12k to 48k events/sec.',
    ],
  },
];

const MOCK_PROJECTS: Project[] = [
  { name: 'auth-service', sessionCount: 2 },
  { name: 'data-pipeline', sessionCount: 2 },
  { name: 'ui-components', sessionCount: 1 },
  { name: 'api-gateway', sessionCount: 1 },
];

/* ==========================================================================
   Helpers
   ========================================================================== */

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/* ==========================================================================
   Component
   ========================================================================== */

export function SessionList() {
  const navigate = useNavigate();
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  // For testing empty state, use the mock data.
  // In production this would come from a data-fetching layer.
  const sessions = MOCK_SESSIONS;
  const projects = MOCK_PROJECTS;
  const isEmpty = sessions.length === 0;

  const filteredSessions = selectedProject
    ? sessions.filter((s) => s.projectName === selectedProject)
    : sessions;

  const selectedSession = selectedSessionId
    ? sessions.find((s) => s.id === selectedSessionId) ?? null
    : null;

  /* ---------- Empty state ---------- */

  if (isEmpty) {
    return (
      <AppShell title="Sessions">
        <div style={{ padding: 'var(--spacing-8)' }}>
          <div className="card" data-testid="setup-banner">
            <p className="label" style={{ marginBottom: 'var(--spacing-2)' }}>
              Setup
            </p>
            <p style={{ fontSize: '0.875rem', color: 'var(--on-surface)' }}>
              Add your Anthropic API key to enable AI summaries
            </p>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ marginTop: 'var(--spacing-4)' }}
              onClick={() => navigate('/settings')}
            >
              Go to settings
            </button>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: '24rem',
              textAlign: 'center',
            }}
          >
            <h2 className="app-main__title">No sessions found</h2>
            <p className="app-main__subtitle">
              Start a Claude Code session and come back here to browse it
            </p>
          </div>
        </div>
      </AppShell>
    );
  }

  /* ---------- Sidebar ---------- */

  const sidebarContent = (
    <div className="app-sidebar__section">
      <p className="app-sidebar__label">Projects</p>
      <ul className="app-sidebar__list">
        <li>
          <button
            type="button"
            className={`app-sidebar__item${selectedProject === null ? ' app-sidebar__item--active' : ''}`}
            onClick={() => {
              setSelectedProject(null);
              setSelectedSessionId(null);
            }}
          >
            <span className="app-sidebar__dot" />
            All Projects
          </button>
        </li>
        {projects.map((project) => (
          <li key={project.name}>
            <button
              type="button"
              className={`app-sidebar__item${selectedProject === project.name ? ' app-sidebar__item--active' : ''}`}
              onClick={() => {
                setSelectedProject(project.name);
                setSelectedSessionId(null);
              }}
            >
              <span className="app-sidebar__dot" />
              {project.name}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );

  /* ---------- Bottom bar ---------- */

  const bottomBar = selectedSession ? (
    <a
      href={`/session/${selectedSession.id}/enhance`}
      className="btn btn-primary btn--lg btn--full"
    >
      Enhance with AI
    </a>
  ) : undefined;

  /* ---------- Main content ---------- */

  return (
    <AppShell
      title="Sessions"
      showSidebar
      sidebarContent={sidebarContent}
      bottomBar={bottomBar}
    >
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* Session list column */}
        <div style={{ flex: 3, overflowY: 'auto', minWidth: 0 }}>
          <div className="app-main__header">
            <div>
              <h1 className="app-main__title">Browse Sessions</h1>
              <p className="app-main__subtitle">
                {selectedProject ? (
                  <>
                    Showing <span className="chip">{selectedProject}</span>
                  </>
                ) : (
                  `${sessions.length} sessions across ${projects.length} projects`
                )}
              </p>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--spacing-2)',
              padding: '0 var(--spacing-8) var(--spacing-8)',
            }}
          >
            {filteredSessions.map((session) => (
              <button
                key={session.id}
                type="button"
                className={`session-card${selectedSessionId === session.id ? ' session-card--selected' : ''}`}
                onClick={() => setSelectedSessionId(session.id)}
                style={{ textAlign: 'start' }}
              >
                <div className="session-card__identity">
                  <div className="session-card__title">{session.title}</div>
                  <div className="session-card__date">
                    {formatDate(session.date)}
                  </div>
                </div>
                <div className="session-card__metrics">
                  <span className="session-card__metric">
                    {formatDuration(session.durationMinutes)}
                  </span>
                  <span className="session-card__metric">
                    {session.turns} turns
                  </span>
                  <span className="session-card__metric">
                    {session.linesOfCode} loc
                  </span>
                </div>
                <div className="session-card__status">
                  <span className={`badge badge--${session.status}`}>
                    {session.status}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Raw log preview column */}
        <div
          style={{
            flex: 2,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            padding: 'var(--spacing-6)',
          }}
        >
          {selectedSession ? (
            <div className="raw-log" style={{ flex: 1 }}>
              <div className="raw-log__header">
                <span className="raw-log__header-label">Raw Session Log</span>
                <div className="raw-log__dots">
                  <span className="raw-log__dot raw-log__dot--red" />
                  <span className="raw-log__dot raw-log__dot--yellow" />
                  <span className="raw-log__dot raw-log__dot--blue" />
                </div>
              </div>
              <div className="raw-log__content">
                {selectedSession.rawLog.map((line, i) => (
                  <div className="raw-log__line" key={i}>
                    <span className="raw-log__line-num">{i + 1}</span>
                    <span className="raw-log__line-text">{line}</span>
                  </div>
                ))}
                <div className="raw-log__line">
                  <span className="raw-log__line-num">
                    {selectedSession.rawLog.length + 1}
                  </span>
                  <span className="raw-log__line-text">
                    <span className="raw-log__cursor" />
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <p
                className="label"
                style={{ textAlign: 'center' }}
              >
                Select a session to preview its raw log
              </p>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
