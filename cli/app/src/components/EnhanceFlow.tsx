import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import type { Session } from '../types';
import { AppShell } from './AppShell';
import { useSessionsContext } from '../SessionsContext';
import { enhanceSession } from '../api';
import type { EnhancementResult, EnhancementStep as ApiStep } from '../api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Phase = 'analyzing' | 'questions' | 'streaming' | 'done';

interface Question {
  id: number;
  text: string;
  suggestedAnswer: string;
  answer: string;
  skipped: boolean;
}

interface AiFeedLine {
  text: string;
  tag?: string;
}

interface StreamItem {
  type: 'title' | 'skills' | 'step' | 'take' | 'context';
  content: string;
  skills?: string[];
  step?: ApiStep;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildAiFeedLines(session: Session): AiFeedLine[] {
  return [
    { text: `Scanning ${session.turns} turns across ${session.durationMinutes}min session...` },
    { text: 'Identifying core patterns...', tag: 'FOUND' },
    { text: 'Extracting key decisions...', tag: 'IN PROGRESS' },
    { text: 'Mapping dependency graph...' },
    { text: `Detected ${session.executionPath?.length ?? 0} execution steps` },
    { text: `${session.skills?.length ?? 0} skills identified`, tag: 'DONE' },
  ];
}

function resultToStreamItems(result: EnhancementResult): StreamItem[] {
  const items: StreamItem[] = [];

  items.push({ type: 'title', content: result.title });

  if (result.context) {
    items.push({ type: 'context', content: result.context });
  }

  if (result.skills.length > 0) {
    items.push({ type: 'skills', content: result.skills.join(', '), skills: result.skills });
  }

  for (const step of result.executionSteps) {
    items.push({ type: 'step', content: step.title, step });
  }

  if (result.developerTake) {
    items.push({ type: 'take', content: result.developerTake });
  }

  return items;
}

function resultToQuestions(result: EnhancementResult): Question[] {
  return result.questions.map((q, i) => ({
    id: i + 1,
    text: q.text,
    suggestedAnswer: q.suggestedAnswer,
    answer: '',
    skipped: false,
  }));
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Breadcrumb() {
  return (
    <nav className="enhance-flow__breadcrumb" aria-label="Enhancement pipeline">
      <span className="enhance-flow__step">Browse</span>
      <span className="enhance-flow__separator" aria-hidden="true">&gt;</span>
      <span className="enhance-flow__step--active">ENHANCE</span>
      <span className="enhance-flow__separator" aria-hidden="true">&gt;</span>
      <span className="enhance-flow__step">Edit</span>
      <span className="enhance-flow__separator" aria-hidden="true">&gt;</span>
      <span className="enhance-flow__step">Publish</span>
    </nav>
  );
}

function RawLogPanel({
  session,
  feedLines,
  visibleFeedCount,
}: {
  session: Session;
  feedLines: AiFeedLine[];
  visibleFeedCount: number;
}) {
  return (
    <div className="editor-panel__raw">
      <div className="editor-panel__raw-header">
        <span className="editor-panel__raw-label">Raw session log</span>
        <span className="editor-panel__raw-label">{session.turns} turns</span>
      </div>
      <div className="editor-panel__raw-content">
        {session.rawLog.map((line, i) => (
          <div className="raw-log__line" key={i}>
            <span className="raw-log__line-num">{i + 1}</span>
            <span className="raw-log__line-text">{line}</span>
          </div>
        ))}

        {visibleFeedCount > 0 && (
          <div
            className="enhance-flow__ai-feed"
            style={{ marginTop: 'var(--spacing-6)' }}
          >
            <div className="enhance-flow__ai-feed-header">
              <span className="enhance-flow__ai-dot" />
              AI Logic Feed
            </div>
            {feedLines.slice(0, visibleFeedCount).map((line, i) => (
              <div className="enhance-flow__ai-line" key={i}>
                <span className="enhance-flow__ai-dot" />
                <span>{line.text}</span>
                {line.tag != null && (
                  <span className="enhance-flow__ai-tag">[{line.tag}]</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AnalyzingPanel({ session, error, errorCode }: { session: Session; error?: string; errorCode?: string }) {
  const isAuthError = errorCode === 'AUTH_REQUIRED' || errorCode === 'AUTH_EXPIRED';
  const isQuotaError = errorCode === 'QUOTA_EXCEEDED';

  return (
    <div className="editor-panel__draft-content">
      <div className="card">
        <div className="enhance-flow__status">
          <span className="enhance-flow__status-dot" />
          {error ? 'Enhancement failed' : 'Reading your session...'}
        </div>
        {isAuthError ? (
          <div style={{ marginTop: 'var(--spacing-4)' }}>
            <p className="text-body">To run AI enhancement, either:</p>
            <div className="terminal" style={{ marginTop: 'var(--spacing-4)', fontSize: '0.75rem' }}>
              <span className="terminal__prompt">$ </span>heyiam login
            </div>
            <p className="settings-help" style={{ marginTop: 'var(--spacing-2)' }}>
              Uses our hosted AI (10 free per month)
            </p>
            <div style={{ marginTop: 'var(--spacing-4)', borderTop: '1px solid var(--color-border)', paddingTop: 'var(--spacing-4)' }}>
              <p className="text-body">Set ANTHROPIC_API_KEY in your env</p>
              <p className="settings-help" style={{ marginTop: 'var(--spacing-2)' }}>
                Uses your own Anthropic account
              </p>
            </div>
          </div>
        ) : isQuotaError ? (
          <div style={{ marginTop: 'var(--spacing-4)' }}>
            <p className="text-body">{error}</p>
            <div style={{ marginTop: 'var(--spacing-4)', borderTop: '1px solid var(--color-border)', paddingTop: 'var(--spacing-4)' }}>
              <p className="text-body">Set ANTHROPIC_API_KEY in your env</p>
              <p className="settings-help" style={{ marginTop: 'var(--spacing-2)' }}>
                Uses your own account, no limits
              </p>
            </div>
          </div>
        ) : error ? (
          <p
            className="text-body"
            style={{ marginTop: 'var(--spacing-4)', color: 'var(--color-error, #dc2626)' }}
          >
            {error}
          </p>
        ) : (
          <p
            className="text-body"
            style={{ marginTop: 'var(--spacing-4)' }}
          >
            Analyzing {session.turns} turns across {session.durationMinutes} minutes.
          </p>
        )}
      </div>
    </div>
  );
}

function QuestionsPanel({
  questions,
  onAnswerChange,
  onSkip,
  onContinue,
}: {
  questions: Question[];
  onAnswerChange: (id: number, value: string) => void;
  onSkip: (id: number) => void;
  onContinue: () => void;
}) {
  return (
    <div className="editor-panel__draft-content">
      <h2 className="text-headline" style={{ marginBottom: 'var(--spacing-6)' }}>
        A few questions
      </h2>
      <p className="text-body" style={{ marginBottom: 'var(--spacing-8)' }}>
        Your answers help generate a more accurate case study. Skip any that
        do not apply.
      </p>

      {questions.map((q) => (
        <div
          className="card"
          key={q.id}
          style={{ marginBottom: 'var(--spacing-6)' }}
        >
          <p
            className="text-title"
            style={{ marginBottom: 'var(--spacing-4)' }}
          >
            {q.text}
          </p>
          <textarea
            className="enhance-question__textarea"
            rows={3}
            placeholder={q.suggestedAnswer}
            value={q.answer}
            disabled={q.skipped}
            onChange={(e) => { onAnswerChange(q.id, e.target.value); }}
            aria-label={`Answer for question ${q.id}`}
          />
          <button
            type="button"
            className="btn-tertiary"
            onClick={() => { onSkip(q.id); }}
            style={{ marginTop: 'var(--spacing-2)' }}
          >
            {q.skipped ? 'Unskip' : 'Skip'}
          </button>
        </div>
      ))}

      <button
        type="button"
        className="btn btn-primary btn--lg"
        onClick={onContinue}
      >
        Continue
      </button>
    </div>
  );
}

function StreamingPanel({
  items,
  visibleCount,
}: {
  items: StreamItem[];
  visibleCount: number;
}) {
  return (
    <div className="editor-panel__draft-content">
      <h2 className="text-headline" style={{ marginBottom: 'var(--spacing-6)' }}>
        Generating case study
      </h2>

      {items.map((item, i) => {
        const visible = i < visibleCount;
        const className = visible
          ? 'enhance-streaming__item enhance-streaming__item--visible'
          : 'enhance-streaming__item';

        if (item.type === 'title') {
          return (
            <div className={className} key={i}>
              <h3 className="text-display-lg" style={{ fontSize: '1.875rem' }}>
                {item.content}
              </h3>
            </div>
          );
        }

        if (item.type === 'context') {
          return (
            <div className={className} key={i} style={{ marginTop: 'var(--spacing-3)' }}>
              <p className="text-body" style={{ color: 'var(--color-text-secondary)' }}>
                {item.content}
              </p>
            </div>
          );
        }

        if (item.type === 'skills' && item.skills != null) {
          return (
            <div
              className={className}
              key={i}
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 'var(--spacing-2)',
                marginTop: 'var(--spacing-4)',
              }}
            >
              {item.skills.map((skill) => (
                <span className="chip chip--primary" key={skill}>
                  <span className="chip__dot" />
                  {skill}
                </span>
              ))}
            </div>
          );
        }

        if (item.type === 'step' && item.step != null) {
          return (
            <div
              className={className}
              key={i}
              style={{ marginTop: 'var(--spacing-4)' }}
            >
              <div className="exec-path__step">
                <div className="exec-path__step-icon">
                  {item.step.stepNumber}
                </div>
                <div className="exec-path__step-content">
                  <span className="exec-path__step-num">
                    Step {item.step.stepNumber}
                  </span>
                  <p className="exec-path__step-title">{item.step.title}</p>
                  <p className="exec-path__step-desc">
                    {item.step.body}
                  </p>
                </div>
              </div>
            </div>
          );
        }

        if (item.type === 'take') {
          return (
            <div
              className={className}
              key={i}
              style={{ marginTop: 'var(--spacing-6)' }}
            >
              <div className="card">
                <span className="label label--primary">Developer take</span>
                <p
                  className="text-body"
                  style={{ marginTop: 'var(--spacing-2)' }}
                >
                  {item.content}
                </p>
              </div>
            </div>
          );
        }

        return null;
      })}
    </div>
  );
}

function DonePanel({
  session,
  items,
  questions,
  onEditPublish,
}: {
  session: Session;
  items: StreamItem[];
  questions: Question[];
  onEditPublish: () => void;
}) {
  const answeredQuestions = questions.filter(
    (q) => !q.skipped && q.answer.trim().length > 0,
  );

  return (
    <div className="editor-panel__draft-content">
      <h2 className="text-headline" style={{ marginBottom: 'var(--spacing-4)' }}>
        Case study ready
      </h2>

      {items.map((item, i) => {
        if (item.type === 'title') {
          return (
            <h3
              className="text-display-lg"
              style={{ fontSize: '1.875rem' }}
              key={i}
            >
              {item.content}
            </h3>
          );
        }

        if (item.type === 'context') {
          return (
            <div key={i} style={{ marginTop: 'var(--spacing-3)' }}>
              <p className="text-body" style={{ color: 'var(--color-text-secondary)' }}>
                {item.content}
              </p>
            </div>
          );
        }

        if (item.type === 'skills' && item.skills != null) {
          return (
            <div
              key={i}
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 'var(--spacing-2)',
                marginTop: 'var(--spacing-4)',
              }}
            >
              {item.skills.map((skill) => (
                <span className="chip chip--primary" key={skill}>
                  <span className="chip__dot" />
                  {skill}
                </span>
              ))}
            </div>
          );
        }

        if (item.type === 'step' && item.step != null) {
          return (
            <div
              key={i}
              style={{ marginTop: 'var(--spacing-4)' }}
            >
              <div className="exec-path__step">
                <div className="exec-path__step-icon">
                  {item.step.stepNumber}
                </div>
                <div className="exec-path__step-content">
                  <span className="exec-path__step-num">
                    Step {item.step.stepNumber}
                  </span>
                  <p className="exec-path__step-title">{item.step.title}</p>
                  <p className="exec-path__step-desc">
                    {item.step.body}
                  </p>
                </div>
              </div>
            </div>
          );
        }

        if (item.type === 'take') {
          return (
            <div key={i} style={{ marginTop: 'var(--spacing-6)' }}>
              <div className="card">
                <span className="label label--primary">Developer take</span>
                <p
                  className="text-body"
                  style={{ marginTop: 'var(--spacing-2)' }}
                >
                  {item.content}
                </p>
              </div>
            </div>
          );
        }

        return null;
      })}

      {answeredQuestions.length > 0 && (
        <div className="enhance-qa-summary" style={{ marginTop: 'var(--spacing-8)' }}>
          <div className="enhance-qa-summary__header">
            <span className="label" style={{ color: 'var(--primary)' }}>Your input baked in</span>
            <span className="enhance-qa-summary__count">&#10003; {answeredQuestions.length} answers</span>
          </div>
          {answeredQuestions.map((q) => (
            <div
              className="enhance-qa-summary__item"
              key={q.id}
            >
              <p className="text-label" style={{ marginBottom: 'var(--spacing-2)', fontWeight: 600 }}>
                {q.text}
              </p>
              <p className="enhance-qa-summary__answer">{q.answer}</p>
            </div>
          ))}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          gap: 'var(--spacing-4)',
          marginTop: 'var(--spacing-8)',
        }}
      >
        <button
          className="btn btn-primary btn--lg"
          onClick={onEditPublish}
        >
          Edit &amp; Publish
        </button>
        <Link
          to={`/session/${session.id}`}
          className="btn btn-secondary"
        >
          Discard
        </Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface EnhanceFlowProps {
  sessions?: Session[];
}

export function EnhanceFlow({ sessions }: EnhanceFlowProps = {}) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const ctx = useSessionsContext();

  const sessionList = sessions ?? ctx.sessions;
  const session = sessionList.find((s) => s.id === id);

  const [phase, setPhase] = useState<Phase>('analyzing');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [enhanceError, setEnhanceError] = useState<string>();
  const [enhanceErrorCode, setEnhanceErrorCode] = useState<string>();
  const [feedLines] = useState<AiFeedLine[]>(
    session != null ? buildAiFeedLines(session) : [],
  );
  const [visibleFeedCount, setVisibleFeedCount] = useState(0);
  const [streamItems, setStreamItems] = useState<StreamItem[]>([]);
  const [visibleStreamCount, setVisibleStreamCount] = useState(0);
  const [enhanceResult, setEnhanceResult] = useState<EnhancementResult | null>(null);

  const enhanceCalledRef = useRef(false);

  // Phase 1: call the real enhance API, animate feed lines while waiting
  useEffect(() => {
    if (phase !== 'analyzing' || session == null) return;
    if (enhanceCalledRef.current) return;
    enhanceCalledRef.current = true;

    // Animate feed lines while API call runs
    const feedTimers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 0; i < feedLines.length; i++) {
      feedTimers.push(
        setTimeout(() => {
          setVisibleFeedCount(i + 1);
        }, (i + 1) * 300),
      );
    }

    enhanceSession(session.projectName, session.id)
      .then((result) => {
        setEnhanceResult(result);
        setQuestions(resultToQuestions(result));
        setStreamItems(resultToStreamItems(result));
        setVisibleFeedCount(feedLines.length);
        setTimeout(() => {
          setPhase('questions');
        }, 500);
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : 'Enhancement failed';
        const code = (err as { code?: string }).code;
        setEnhanceError(message);
        setEnhanceErrorCode(code);
      });

    return () => {
      for (const t of feedTimers) clearTimeout(t);
    };
  }, [phase, session, feedLines.length]);

  // Phase 3: reveal stream items progressively
  useEffect(() => {
    if (phase !== 'streaming') return;

    const timers: ReturnType<typeof setTimeout>[] = [];

    for (let i = 0; i < streamItems.length; i++) {
      const delay = (i + 1) * 400;
      timers.push(
        setTimeout(() => {
          setVisibleStreamCount(i + 1);
        }, delay),
      );
    }

    const doneTimer = setTimeout(() => {
      setPhase('done');
    }, streamItems.length * 400 + 500);

    return () => {
      for (const t of timers) clearTimeout(t);
      clearTimeout(doneTimer);
    };
  }, [phase, streamItems.length]);

  const handleAnswerChange = useCallback((questionId: number, value: string) => {
    setQuestions((prev) =>
      prev.map((q) => (q.id === questionId ? { ...q, answer: value } : q)),
    );
  }, []);

  const handleSkip = useCallback((questionId: number) => {
    setQuestions((prev) =>
      prev.map((q) =>
        q.id === questionId ? { ...q, skipped: !q.skipped, answer: '' } : q,
      ),
    );
  }, []);

  const handleContinue = useCallback(() => {
    setVisibleStreamCount(0);
    setPhase('streaming');
  }, []);

  const handleBack = useCallback(() => {
    navigate(`/session/${id}`);
  }, [navigate, id]);

  // Loading guard
  if (sessions == null && ctx.loading) {
    return (
      <AppShell title="Enhance" onBack={() => { navigate('/'); }}>
        <div style={{ padding: 'var(--spacing-6)', textAlign: 'center' }}>
          <p className="text-body">Loading session...</p>
        </div>
      </AppShell>
    );
  }

  // 404 guard
  if (session == null) {
    return (
      <AppShell title="Enhance" onBack={() => { navigate('/'); }}>
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
    <AppShell title="Enhance" onBack={handleBack}>
      <div className="enhance-flow" style={{ padding: 'var(--spacing-4) var(--spacing-6) 0' }}>
        <Breadcrumb />
      </div>
      <div className="editor-panel" style={{ height: 'calc(100vh - 7rem)' }}>
        <RawLogPanel
          session={session}
          feedLines={feedLines}
          visibleFeedCount={visibleFeedCount}
        />
        <div className="editor-panel__draft">
          {phase === 'analyzing' && <AnalyzingPanel session={session} error={enhanceError} errorCode={enhanceErrorCode} />}
          {phase === 'questions' && (
            <QuestionsPanel
              questions={questions}
              onAnswerChange={handleAnswerChange}
              onSkip={handleSkip}
              onContinue={handleContinue}
            />
          )}
          {phase === 'streaming' && (
            <StreamingPanel
              items={streamItems}
              visibleCount={visibleStreamCount}
            />
          )}
          {phase === 'done' && (
            <DonePanel
              session={session}
              items={streamItems}
              questions={questions}
              onEditPublish={() => {
                if (enhanceResult && session) {
                  const answeredQaPairs = questions
                    .filter((q) => !q.skipped && q.answer.trim())
                    .map((q) => ({ question: q.text, answer: q.answer }));

                  ctx.updateSession(session.id, {
                    title: enhanceResult.title,
                    developerTake: enhanceResult.developerTake,
                    context: enhanceResult.context,
                    skills: enhanceResult.skills,
                    executionPath: enhanceResult.executionSteps.map((s) => ({
                      stepNumber: s.stepNumber,
                      title: s.title,
                      description: s.body,
                    })),
                    qaPairs: answeredQaPairs,
                    status: 'enhanced',
                  });
                }
                navigate(`/session/${id}/edit`);
              }}
            />
          )}
        </div>
      </div>
    </AppShell>
  );
}

export default EnhanceFlow;
