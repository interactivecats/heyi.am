import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import type { Session } from '../types';
import { AppShell } from './AppShell';
import { SessionEditor } from './SessionEditor';
import { useSessionsContext } from '../SessionsContext';
import { useAuth } from '../AuthContext';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PublishPhase =
  | 'editing'
  | 'auth-prompt'
  | 'publishing'
  | 'success';

export interface SessionEditorPageProps {
  sessions?: Session[];
  isAuthenticated?: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PUBLISH_LINES = [
  { text: '$ heyiam publish', className: 'publish-terminal__prompt' },
  { text: '', className: '' },
  { text: '[INFO] Signing payload with Ed25519...', className: 'publish-terminal__info' },
  { text: 'Payload signed', className: 'publish-terminal__success', prefix: true },
  { text: '[INFO] Uploading to heyi.am...', className: 'publish-terminal__info' },
  { text: 'Upload complete', className: 'publish-terminal__success', prefix: true },
  { text: '[INFO] Publishing session...', className: 'publish-terminal__info' },
  { text: 'Session published', className: 'publish-terminal__success publish-terminal__success--bold', prefix: true },
  { text: '', className: '' },
];

const LINE_DELAY_MS = 500;
const POST_ANIMATION_DELAY_MS = 1000;

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function AuthPromptModal({
  onConnectNow,
  onCancel,
}: {
  onConnectNow: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="publish-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="auth-prompt-heading">
      <div className="publish-modal">
        <div className="publish-modal__icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </svg>
        </div>
        <h2 id="auth-prompt-heading" className="text-headline" style={{ marginTop: 'var(--spacing-4)' }}>
          Connect your account?
        </h2>
        <p className="text-body" style={{ marginTop: 'var(--spacing-3)', color: 'var(--on-surface-variant)' }}>
          Link this session to your heyi.am portfolio so it appears on your profile
          and can be managed from the web.
        </p>
        <div className="terminal publish-modal__terminal" style={{ marginTop: 'var(--spacing-6)' }}>
          <div className="publish-modal__device-code">RXKF-7Y2M</div>
          <div className="text-label" style={{ marginTop: 'var(--spacing-2)' }}>
            Enter at heyi.am/device
          </div>
        </div>
        <div className="publish-modal__actions" style={{ marginTop: 'var(--spacing-6)' }}>
          <button
            type="button"
            className="btn btn-primary btn--lg btn--full"
            onClick={onConnectNow}
          >
            Connect now
          </button>
          <button
            type="button"
            className="btn btn-tertiary"
            onClick={onCancel}
            style={{ marginTop: 'var(--spacing-3)' }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function PublishTerminal({
  sessionId,
  visibleLineCount,
  totalLines,
}: {
  sessionId: string;
  visibleLineCount: number;
  totalLines: number;
}) {
  const progress = totalLines > 0 ? Math.min((visibleLineCount / totalLines) * 100, 100) : 0;

  return (
    <div className="publish-terminal-wrapper">
      <div className="publish-terminal">
        <div className="publish-terminal__dots">
          <span className="publish-terminal__dot publish-terminal__dot--red" />
          <span className="publish-terminal__dot publish-terminal__dot--yellow" />
          <span className="publish-terminal__dot publish-terminal__dot--green" />
        </div>
        <div className="publish-terminal__body">
          {PUBLISH_LINES.slice(0, visibleLineCount).map((line, i) => (
            <div className="publish-terminal__line" key={i}>
              {line.prefix === true && <span className="publish-terminal__check">&#10003; </span>}
              <span className={line.className}>{line.text}</span>
            </div>
          ))}
          {visibleLineCount > PUBLISH_LINES.length - 1 && (
            <div className="publish-terminal__line">
              <span className="publish-terminal__link">
                Published: heyi.am/s/{sessionId}
              </span>
            </div>
          )}
        </div>
        <div className="publish-terminal__progress-track">
          <div
            className="publish-terminal__progress-fill"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function Success({ session }: { session: Session }) {
  const [copied, setCopied] = useState(false);
  const url = `heyi.am/s/${session.id}`;
  const publishDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const handleCopy = useCallback(() => {
    void navigator.clipboard.writeText(`https://${url}`).then(() => {
      setCopied(true);
      setTimeout(() => { setCopied(false); }, 2000);
    });
  }, [url]);

  return (
    <div className="publish-success">
      <div className="publish-success__icon publish-success__icon--green">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
      <h2 className="text-headline" style={{ marginTop: 'var(--spacing-4)' }}>
        Session Published
      </h2>
      <p className="text-body" style={{ marginTop: 'var(--spacing-2)', color: 'var(--on-surface-variant)' }}>
        Your case study is live on your portfolio.
      </p>

      <div className="publish-success__preview card" style={{ marginTop: 'var(--spacing-6)' }}>
        <h3 className="text-title">{session.title}</h3>
        <div className="publish-success__stats" style={{ marginTop: 'var(--spacing-3)' }}>
          <span className="text-label">{session.durationMinutes}m</span>
          <span className="text-label">{session.turns} turns</span>
          <span className="text-label">{session.skills?.length ?? 0} skills</span>
        </div>
      </div>

      <div className="publish-success__url-bar" style={{ marginTop: 'var(--spacing-4)' }}>
        <code className="publish-success__url">{url}</code>
        <button type="button" className="btn btn-secondary" onClick={handleCopy}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      <div className="publish-success__meta" style={{ marginTop: 'var(--spacing-4)' }}>
        <span className="badge badge--published">Published</span>
        <span className="text-label" style={{ marginInlineStart: 'var(--spacing-2)' }}>
          {publishDate}
        </span>
      </div>

      <div className="publish-success__actions" style={{ marginTop: 'var(--spacing-6)' }}>
        <Link to="/" className="btn btn-primary">View on Portfolio</Link>
        <Link to={`/session/${session.id}`} className="btn btn-secondary">View Case Study</Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function SessionEditorPage({
  sessions,
  isAuthenticated: isAuthenticatedProp,
}: SessionEditorPageProps) {
  const auth = useAuth();
  const isAuthenticated = isAuthenticatedProp ?? auth.authenticated;
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const ctx = useSessionsContext();

  const sessionList = sessions ?? ctx.sessions;
  const session = sessionList.find((s) => s.id === id);

  const [phase, setPhase] = useState<PublishPhase>('editing');
  const [visibleLineCount, setVisibleLineCount] = useState(0);

  // Total lines = PUBLISH_LINES + 1 final URL line
  const totalLines = PUBLISH_LINES.length + 1;

  // Publishing animation: reveal lines one by one
  useEffect(() => {
    if (phase !== 'publishing') return;

    setVisibleLineCount(0);

    const timers: ReturnType<typeof setTimeout>[] = [];

    for (let i = 0; i < totalLines; i++) {
      timers.push(
        setTimeout(() => {
          setVisibleLineCount(i + 1);
        }, (i + 1) * LINE_DELAY_MS),
      );
    }

    // Auto-advance after all lines + delay
    const advanceTimer = setTimeout(() => {
      setPhase('success');
    }, totalLines * LINE_DELAY_MS + POST_ANIMATION_DELAY_MS);

    timers.push(advanceTimer);

    return () => {
      for (const t of timers) clearTimeout(t);
    };
  }, [phase, totalLines]);

  const handlePublish = useCallback(() => {
    if (isAuthenticated) {
      setPhase('publishing');
    } else {
      setPhase('auth-prompt');
    }
  }, [isAuthenticated]);

  const handleConnectNow = useCallback(() => {
    setPhase('publishing');
  }, []);

  const handleCancel = useCallback(() => {
    setPhase('editing');
  }, []);

  const handleBack = useCallback(() => {
    navigate(`/session/${id}`);
  }, [navigate, id]);

  // Loading guard
  if (sessions == null && ctx.loading) {
    return (
      <AppShell title="Editor" onBack={() => { navigate('/'); }}>
        <div style={{ padding: 'var(--spacing-6)', textAlign: 'center' }}>
          <p className="text-body">Loading session...</p>
        </div>
      </AppShell>
    );
  }

  // 404 guard
  if (session == null) {
    return (
      <AppShell title="Editor" onBack={() => { navigate('/'); }}>
        <div className="empty-state">
          <div className="empty-state__icon">?</div>
          <h2 className="empty-state__title">Session not found</h2>
          <p className="empty-state__desc">
            The session you are looking for does not exist.
          </p>
          <div className="empty-state__cmd" style={{ marginTop: 'var(--spacing-6)' }}>
            <Link to="/" className="btn btn-secondary">
              Back to sessions
            </Link>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Editor"
      onBack={handleBack}
      headerActions={
        phase === 'editing' ? (
          <button
            type="button"
            className="btn btn-primary"
            onClick={handlePublish}
          >
            Publish &rarr;
          </button>
        ) : undefined
      }
    >
      {phase === 'editing' && (
        <SessionEditor session={session} />
      )}

      {phase === 'auth-prompt' && (
        <>
          <SessionEditor session={session} />
          <AuthPromptModal
            onConnectNow={handleConnectNow}
            onCancel={handleCancel}
          />
        </>
      )}

      {phase === 'publishing' && (
        <PublishTerminal
          sessionId={session.id}
          visibleLineCount={visibleLineCount}
          totalLines={totalLines}
        />
      )}

      {phase === 'success' && (
        <Success session={session} />
      )}
    </AppShell>
  );
}

export default SessionEditorPage;
