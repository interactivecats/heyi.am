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
  description: string;
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
      '> The existing auth was frankencode',
      '> three different token systems',
      '> layered on top of each other',
      '...',
      '[AI] I can help patch the existing system',
      '> No. Tear it all out. Start fresh.',
      '...',
      '[309 tests passing]',
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
      '> create an abstraction layer for OAuth2 providers',
      '> Analyzing existing OAuth implementation...',
      '> Found hardcoded Google OAuth in auth.controller.ts',
      '> Proposing provider interface pattern',
      '[AI] Created src/providers/OAuthProvider.ts',
      '[AI] Implemented GoogleProvider extends OAuthProvider',
      '...',
      '[22 tests passing]',
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
      '> set up an ETL pipeline for our Kafka event stream',
      '> Reading existing consumer setup...',
      '> Found src/consumers/eventConsumer.ts',
      '[AI] Proposing transform layer architecture',
      '[AI] Created src/transforms/EventTransformer.ts',
      '> Added batch processing with configurable window',
      '...',
      '[18 tests passing]',
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
      '> build an accessible dropdown with keyboard nav',
      '[AI] Creating Dropdown component with ARIA attributes...',
      '[AI] Added role="listbox" and aria-activedescendant',
      '> Implemented arrow key navigation',
      '> Added Home/End key support',
      '...',
      '[0 a11y violations]',
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
      '> add zod validation to all API routes',
      '> Scanning route definitions in src/routes/...',
      '> Found 14 route handlers without input validation',
      '[AI] Proposing validation middleware pattern',
      '[AI] Created src/middleware/validate.ts',
      '...',
      '[31 tests passing, coverage: 94%]',
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
      '> optimize the batch insert — dropping events at peak',
      '> Profiling current insert path...',
      '> Bottleneck: individual INSERTs in a loop',
      '[AI] Proposing bulk INSERT with UNNEST',
      '[AI] Rewrote sink to use pg COPY protocol',
      '...',
      '[Throughput: 12k → 48k events/sec]',
    ],
  },
];

const MOCK_PROJECTS: Project[] = [
  { name: 'auth-service', sessionCount: 2, description: 'JWT auth and OAuth provider layer' },
  { name: 'data-pipeline', sessionCount: 2, description: 'Event stream ETL and ingestion' },
  { name: 'ui-components', sessionCount: 1, description: 'Accessible component library' },
  { name: 'api-gateway', sessionCount: 1, description: 'Request validation and routing' },
];

/* ==========================================================================
   Helpers
   ========================================================================== */

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function formatDuration(minutes: number): string {
  return `${minutes} min`;
}

/* ==========================================================================
   Component
   ========================================================================== */

export function SessionList() {
  const navigate = useNavigate();
  const [selectedProject, setSelectedProject] = useState<string | null>(
    MOCK_PROJECTS.length > 0 ? MOCK_PROJECTS[0].name : null,
  );
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  const sessions = MOCK_SESSIONS;
  const projects = MOCK_PROJECTS;
  const isEmpty = sessions.length === 0;

  const filteredSessions = selectedProject
    ? sessions.filter((s) => s.projectName === selectedProject)
    : sessions;

  const selectedSession = selectedSessionId
    ? sessions.find((s) => s.id === selectedSessionId) ?? null
    : null;

  const activeProject = selectedProject
    ? projects.find((p) => p.name === selectedProject) ?? null
    : null;

  const totalSessions = selectedProject
    ? filteredSessions.length
    : sessions.length;

  /* ---------- Empty state ---------- */

  if (isEmpty) {
    return (
      <AppShell title="Sessions">
        <div style={{ padding: 'var(--spacing-6)' }}>
          {/* Setup banner */}
          <div
            style={{
              background: 'var(--tertiary-fixed)',
              padding: 'var(--spacing-4) var(--spacing-6)',
              borderRadius: 'var(--radius-sm)',
              marginBottom: 'var(--spacing-8)',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--spacing-3)',
            }}
            data-testid="setup-banner"
          >
            <span style={{ color: 'var(--tertiary)', fontWeight: 600, fontSize: '1rem' }}>&#9888;</span>
            <span style={{ fontSize: '0.875rem', color: 'var(--tertiary)' }}>
              Add your Anthropic API key to enable AI summaries
            </span>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ marginLeft: 'auto', fontSize: '0.75rem', padding: '4px 12px' }}
              onClick={() => navigate('/settings')}
            >
              Settings
            </button>
          </div>

          {/* Empty state */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 'var(--spacing-20) 0',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                width: '64px',
                height: '64px',
                background: 'var(--surface-container-low)',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 'var(--spacing-6)',
                color: 'var(--on-surface-variant)',
                fontSize: '1.5rem',
              }}
            >
              &#128196;
            </div>
            <h2
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '1.5rem',
                fontWeight: 700,
                marginBottom: 'var(--spacing-3)',
              }}
            >
              No sessions found
            </h2>
            <p
              style={{
                fontSize: '0.9375rem',
                color: 'var(--on-surface-variant)',
                maxWidth: '400px',
                lineHeight: 1.6,
              }}
            >
              Claude Code sessions from{' '}
              <code
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.8125rem',
                  background: 'var(--surface-container-low)',
                  padding: '2px 6px',
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                ~/.claude/projects
              </code>{' '}
              will appear here.
            </p>
            <div style={{ marginTop: 'var(--spacing-8)' }}>
              <code
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.8125rem',
                  color: 'var(--on-surface-variant)',
                  background: 'var(--surface-container-low)',
                  padding: 'var(--spacing-3) var(--spacing-5)',
                  borderRadius: 'var(--radius-sm)',
                  display: 'inline-block',
                }}
              >
                $ claude  # start a session first
              </code>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  /* ---------- Sidebar ---------- */

  const publishedCount = sessions.filter((s) => s.status === 'published').length;
  const enhancedCount = sessions.filter((s) => s.status !== 'draft').length;

  const sidebarContent = (
    <>
      <div className="app-sidebar__section">
        <p className="app-sidebar__label">Projects</p>
        <ul className="app-sidebar__list">
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
      <div className="app-sidebar__section">
        <p className="app-sidebar__label">Stats</p>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.75rem',
            color: 'var(--on-surface-variant)',
            lineHeight: 2,
          }}
        >
          <div>
            Sessions: <strong style={{ color: 'var(--on-surface)' }}>{sessions.length}</strong>
          </div>
          <div>
            Enhanced: <strong style={{ color: 'var(--on-surface)' }}>{enhancedCount}</strong>
          </div>
          <div>
            Published: <strong style={{ color: 'var(--on-surface)' }}>{publishedCount}</strong>
          </div>
        </div>
      </div>
    </>
  );

  /* ---------- Main content ---------- */

  return (
    <AppShell
      title="Sessions"
      showSidebar
      sidebarContent={sidebarContent}
    >
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 340px', gap: 'var(--spacing-8)', padding: 'var(--spacing-8)' }}>
        {/* Session list column */}
        <div>
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.75rem',
              fontWeight: 700,
              marginBottom: 'var(--spacing-1)',
            }}
          >
            {activeProject ? activeProject.name : 'All Sessions'}
          </h2>
          <p
            style={{
              fontSize: '0.875rem',
              color: 'var(--on-surface-variant)',
              marginBottom: 'var(--spacing-6)',
            }}
          >
            {totalSessions} sessions
            {activeProject ? ` \u00b7 ${activeProject.description}` : ''}
          </p>

          {/* Search */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--spacing-2)',
              background: 'var(--surface-container-lowest)',
              padding: 'var(--spacing-3) var(--spacing-4)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid rgba(194, 199, 208, 0.15)',
              marginBottom: 'var(--spacing-6)',
            }}
          >
            <span style={{ color: 'var(--on-surface-variant)', fontSize: '0.875rem' }}>&#128269;</span>
            <input
              className="input"
              style={{
                border: 'none',
                outline: 'none',
                background: 'none',
                padding: 0,
                boxShadow: 'none',
                fontFamily: 'var(--font-body)',
                fontSize: '0.875rem',
                color: 'var(--on-surface)',
                width: '100%',
              }}
              placeholder="Search sessions..."
              readOnly
            />
          </div>

          {/* Table header */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 120px 100px 40px',
              padding: 'var(--spacing-3) var(--spacing-4)',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.6875rem',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              color: 'var(--on-surface-variant)',
              background: 'var(--surface-container-low)',
              borderRadius: 'var(--radius-sm) var(--radius-sm) 0 0',
            }}
          >
            <span>Session</span>
            <span>Duration</span>
            <span>Status</span>
            <span></span>
          </div>

          {/* Session rows */}
          {filteredSessions.map((session, i) => (
            <button
              key={session.id}
              type="button"
              onClick={() => setSelectedSessionId(session.id)}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 120px 100px 40px',
                alignItems: 'center',
                padding: 'var(--spacing-5) var(--spacing-4)',
                background: selectedSessionId === session.id
                  ? 'var(--surface-container-low)'
                  : 'var(--surface-container-lowest)',
                cursor: 'pointer',
                border: 'none',
                borderTop: i > 0 ? '1px solid rgba(194, 199, 208, 0.15)' : 'none',
                textAlign: 'start',
                width: '100%',
                fontFamily: 'inherit',
              }}
            >
              <div>
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: '0.9375rem',
                    marginBottom: '2px',
                    color: 'var(--on-surface)',
                  }}
                >
                  {session.title}
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.6875rem',
                    color: 'var(--on-surface-variant)',
                  }}
                >
                  {formatDate(session.date)} &middot; {session.turns} turns
                </div>
              </div>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.75rem',
                  color: 'var(--on-surface-variant)',
                }}
              >
                {formatDuration(session.durationMinutes)}
              </span>
              <span className={`chip chip--${session.status}`}>
                {session.status.toUpperCase()}
              </span>
              <span
                style={{
                  color: 'var(--primary)',
                  fontSize: '1.25rem',
                  textAlign: 'center',
                }}
              >
                &#8594;
              </span>
            </button>
          ))}
        </div>

        {/* Preview panel */}
        <div
          style={{
            background: 'var(--surface-container-low)',
            borderRadius: 'var(--radius-sm)',
            padding: 'var(--spacing-5)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.6875rem',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--on-surface-variant)',
              marginBottom: 'var(--spacing-4)',
              textAlign: 'center',
            }}
          >
            Raw Session Log Preview
          </div>
          <div className="terminal" style={{ flex: 1, minHeight: '260px' }}>
            {selectedSession ? (
              <>
                {selectedSession.rawLog.map((line, i) => (
                  <div key={i} style={{ lineHeight: 1.8 }}>
                    {line.startsWith('[AI]') ? (
                      <><span style={{ color: '#60a5fa' }}>{line.substring(0, 4)}</span>{line.substring(4)}</>
                    ) : line.startsWith('>') ? (
                      <><span style={{ color: '#34d399' }}>&gt;</span>{line.substring(1)}</>
                    ) : line === '...' ? (
                      <span style={{ color: 'rgba(255,255,255,0.3)' }}>...</span>
                    ) : line.startsWith('[') ? (
                      <span style={{ color: '#34d399', fontWeight: 600 }}>{line}</span>
                    ) : (
                      <span>{line}</span>
                    )}
                  </div>
                ))}
                <div style={{ lineHeight: 1.8 }}>
                  <span className="raw-log__cursor" />
                </div>
              </>
            ) : (
              <div style={{ color: 'rgba(255,255,255,0.3)', fontStyle: 'italic' }}>
                Select a session to preview
              </div>
            )}
          </div>
          <a
            href={selectedSession ? `/session/${selectedSession.id}/enhance` : '#'}
            className="btn btn-primary btn--lg btn--full"
            style={{
              marginTop: 'var(--spacing-4)',
              justifyContent: 'center',
              pointerEvents: selectedSession ? 'auto' : 'none',
              opacity: selectedSession ? 1 : 0.5,
            }}
          >
            Enhance with AI
          </a>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.625rem',
              color: 'var(--on-surface-variant)',
              textAlign: 'center',
              marginTop: 'var(--spacing-2)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Requires API key
          </div>
        </div>
      </div>
    </AppShell>
  );
}
