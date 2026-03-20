import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import type { Session, ExecutionStep } from '../types';
import { MOCK_SESSIONS } from '../mock-data';
import { AppShell } from './AppShell';

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateQuestions(session: Session): Question[] {
  const questions: Question[] = [];
  const steps = session.executionPath ?? [];

  if (steps.length >= 2) {
    questions.push({
      id: 1,
      text: `Why did you choose to "${steps[0].title}" before "${steps[1].title}"?`,
      suggestedAnswer: `The ${steps[0].title.toLowerCase()} step was a prerequisite — without understanding the existing state, the implementation would have been guesswork.`,
      answer: '',
      skipped: false,
    });
  } else {
    questions.push({
      id: 1,
      text: 'What was the first thing you checked before making changes?',
      suggestedAnswer: 'I started by reading the existing code to understand what was already there.',
      answer: '',
      skipped: false,
    });
  }

  if (session.context != null && session.context.length > 0) {
    questions.push({
      id: 2,
      text: `What wasn't working about the existing setup? You mentioned: "${session.context.slice(0, 80)}..."`,
      suggestedAnswer: 'The main pain point was maintainability — the existing approach worked but was fragile and hard to extend.',
      answer: '',
      skipped: false,
    });
  } else {
    questions.push({
      id: 2,
      text: 'What problem were you solving in this session?',
      suggestedAnswer: 'The existing implementation needed improvement for maintainability and performance.',
      answer: '',
      skipped: false,
    });
  }

  questions.push({
    id: 3,
    text: 'What would you do differently next time?',
    suggestedAnswer: 'I would write the tests first — the implementation evolved faster than the test coverage.',
    answer: '',
    skipped: false,
  });

  return questions;
}

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

function buildStreamedItems(session: Session): StreamItem[] {
  const items: StreamItem[] = [];

  items.push({ type: 'title', content: session.title });

  if (session.skills != null && session.skills.length > 0) {
    items.push({ type: 'skills', content: session.skills.join(', '), skills: session.skills });
  }

  if (session.executionPath != null) {
    for (const step of session.executionPath) {
      items.push({ type: 'step', content: step.title, step });
    }
  }

  if (session.developerTake != null) {
    items.push({ type: 'take', content: session.developerTake });
  }

  return items;
}

interface StreamItem {
  type: 'title' | 'skills' | 'step' | 'take';
  content: string;
  skills?: string[];
  step?: ExecutionStep;
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

function AnalyzingPanel({ session }: { session: Session }) {
  return (
    <div className="editor-panel__draft-content">
      <div className="card">
        <div className="enhance-flow__status">
          <span className="enhance-flow__status-dot" />
          Reading your session...
        </div>
        <p
          className="text-body"
          style={{ marginTop: 'var(--spacing-4)' }}
        >
          Analyzing {session.turns} turns across {session.durationMinutes} minutes.
        </p>
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
                    {item.step.description}
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
}: {
  session: Session;
  items: StreamItem[];
  questions: Question[];
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
                    {item.step.description}
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
        <div style={{ marginTop: 'var(--spacing-8)' }}>
          <span className="label label--primary">Your answers incorporated</span>
          {answeredQuestions.map((q) => (
            <div
              className="card"
              key={q.id}
              style={{ marginTop: 'var(--spacing-4)' }}
            >
              <p className="text-label" style={{ marginBottom: 'var(--spacing-2)' }}>
                {q.text}
              </p>
              <p className="text-body">{q.answer}</p>
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
        <Link
          to={`/session/${session.id}/edit`}
          className="btn btn-primary btn--lg"
        >
          Edit &amp; Publish
        </Link>
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

  const sessionList = sessions ?? MOCK_SESSIONS;
  const session = sessionList.find((s) => s.id === id);

  const [phase, setPhase] = useState<Phase>('analyzing');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [feedLines] = useState<AiFeedLine[]>(
    session != null ? buildAiFeedLines(session) : [],
  );
  const [visibleFeedCount, setVisibleFeedCount] = useState(0);
  const [streamItems] = useState<StreamItem[]>(
    session != null ? buildStreamedItems(session) : [],
  );
  const [visibleStreamCount, setVisibleStreamCount] = useState(0);

  // Phase 1: auto-advance after revealing feed lines, then wait 2s
  useEffect(() => {
    if (phase !== 'analyzing' || session == null) return;

    const feedTimers: ReturnType<typeof setTimeout>[] = [];

    // Reveal feed lines one by one at 300ms intervals
    for (let i = 0; i < feedLines.length; i++) {
      feedTimers.push(
        setTimeout(() => {
          setVisibleFeedCount(i + 1);
        }, (i + 1) * 300),
      );
    }

    // Auto-advance to questions after all feed lines + 2s
    const advanceTimer = setTimeout(() => {
      setQuestions(generateQuestions(session));
      setPhase('questions');
    }, feedLines.length * 300 + 2000);

    return () => {
      for (const t of feedTimers) clearTimeout(t);
      clearTimeout(advanceTimer);
    };
  }, [phase, session, feedLines.length]);

  // Phase 3: stream items one by one
  useEffect(() => {
    if (phase !== 'streaming') return;

    const timers: ReturnType<typeof setTimeout>[] = [];

    for (let i = 0; i < streamItems.length; i++) {
      const delay = (i + 1) * 400; // 400ms between items
      timers.push(
        setTimeout(() => {
          setVisibleStreamCount(i + 1);
        }, delay),
      );
    }

    // Auto-advance to done after all items revealed + 500ms
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
          {phase === 'analyzing' && <AnalyzingPanel session={session} />}
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
            />
          )}
        </div>
      </div>
    </AppShell>
  );
}

export default EnhanceFlow;
