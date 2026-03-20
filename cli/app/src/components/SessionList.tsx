import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from './AppShell';

/* ==========================================================================
   Data Model
   ========================================================================== */

export interface Session {
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

export interface Project {
  name: string;
  sessionCount: number;
  description: string;
}

/* ==========================================================================
   Mock Data
   ========================================================================== */

export const MOCK_SESSIONS: Session[] = [
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

export const MOCK_PROJECTS: Project[] = [
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

function deriveProjects(sessions: Session[]): Project[] {
  const map = new Map<string, number>();
  for (const s of sessions) {
    map.set(s.projectName, (map.get(s.projectName) ?? 0) + 1);
  }
  return Array.from(map.entries()).map(([name, count]) => ({
    name,
    sessionCount: count,
    description: '',
  }));
}

/* ==========================================================================
   Terminal log line renderer
   ========================================================================== */

function LogLine({ line }: { line: string }) {
  if (line.startsWith('[AI]')) {
    return (
      <div className="terminal-line">
        <span className="terminal-line--ai">{line.substring(0, 4)}</span>
        {line.substring(4)}
      </div>
    );
  }
  if (line.startsWith('>')) {
    return (
      <div className="terminal-line">
        <span className="terminal-line--prompt">&gt;</span>
        {line.substring(1)}
      </div>
    );
  }
  if (line === '...') {
    return (
      <div className="terminal-line">
        <span className="terminal-line--dim">...</span>
      </div>
    );
  }
  if (line.startsWith('[')) {
    return (
      <div className="terminal-line">
        <span className="terminal-line--success">{line}</span>
      </div>
    );
  }
  return <div className="terminal-line">{line}</div>;
}

/* ==========================================================================
   Component
   ========================================================================== */

interface SessionListProps {
  sessions?: Session[];
  projects?: Project[];
}

export function SessionList({
  sessions = MOCK_SESSIONS,
  projects: projectsProp,
}: SessionListProps = {}) {
  const navigate = useNavigate();
  const projects = projectsProp ?? (sessions === MOCK_SESSIONS ? MOCK_PROJECTS : deriveProjects(sessions));

  const [selectedProject, setSelectedProject] = useState<string | null>(
    projects.length > 0 ? projects[0].name : null,
  );
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

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

  /* ---------- Empty state ---------- */

  if (isEmpty) {
    return (
      <AppShell title="Sessions">
        <div style={{ padding: 'var(--spacing-6)' }}>
          <div className="setup-banner" data-testid="setup-banner">
            <span className="setup-banner__icon">&#9888;</span>
            <span className="setup-banner__text">
              Add your Anthropic API key to enable AI summaries
            </span>
            <button
              type="button"
              className="btn btn-secondary setup-banner__action"
              style={{ fontSize: '0.75rem', padding: '4px 12px' }}
              onClick={() => navigate('/settings')}
            >
              Settings
            </button>
          </div>

          <div className="empty-state">
            <div className="empty-state__icon">&#128196;</div>
            <h2 className="empty-state__title">No sessions found</h2>
            <p className="empty-state__desc">
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
            <div className="empty-state__cmd">
              <code>$ claude  # start a session first</code>
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
        <div className="sidebar-stats">
          <div>Sessions: <strong>{sessions.length}</strong></div>
          <div>Enhanced: <strong>{enhancedCount}</strong></div>
          <div>Published: <strong>{publishedCount}</strong></div>
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
      <div className="session-browser">
        {/* Session list column */}
        <div>
          <h2 className="session-browser__heading">
            {activeProject ? activeProject.name : 'All Sessions'}
          </h2>
          <p className="session-browser__subtitle">
            {filteredSessions.length} sessions
            {activeProject?.description ? ` \u00b7 ${activeProject.description}` : ''}
          </p>

          <div className="session-browser__search">
            <span className="session-browser__search-icon">&#128269;</span>
            <input
              className="session-browser__search-input"
              placeholder="Search sessions..."
              readOnly
            />
          </div>

          <div className="session-browser__table-header">
            <span>Session</span>
            <span>Duration</span>
            <span>Status</span>
            <span></span>
          </div>

          {filteredSessions.map((session) => (
            <button
              key={session.id}
              type="button"
              className={`session-browser__row${selectedSessionId === session.id ? ' session-browser__row--selected' : ''}`}
              onClick={() => setSelectedSessionId(session.id)}
            >
              <div>
                <div className="session-browser__row-title">{session.title}</div>
                <div className="session-browser__row-meta">
                  {formatDate(session.date)} &middot; {session.turns} turns
                </div>
              </div>
              <span className="session-browser__row-duration">
                {formatDuration(session.durationMinutes)}
              </span>
              <span className={`chip chip--${session.status}`}>
                {session.status.toUpperCase()}
              </span>
              <span className="session-browser__row-arrow">&#8594;</span>
            </button>
          ))}
        </div>

        {/* Preview panel */}
        <div className="session-browser__preview">
          <div className="session-browser__preview-label">
            Raw Session Log Preview
          </div>
          <div className="terminal session-browser__preview-terminal">
            {selectedSession ? (
              <>
                {selectedSession.rawLog.map((line, i) => (
                  <LogLine key={i} line={line} />
                ))}
                <div className="terminal-line">
                  <span className="raw-log__cursor" />
                </div>
              </>
            ) : (
              <div className="terminal-line--dim" style={{ fontStyle: 'italic' }}>
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
          <div className="session-browser__enhance-subtitle">
            Requires API key
          </div>
        </div>
      </div>
    </AppShell>
  );
}
