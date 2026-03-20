import { useState } from 'react';
import type { Session, ExecutionStep } from '../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SessionEditorProps {
  session: Session;
  onPublish: () => void;
}

interface EditorState {
  title: string;
  developerTake: string;
  context: string;
  executionPath: ExecutionStep[];
  skills: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TAKE_MAX_CHARS = 500;

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ProgressBreadcrumb() {
  return (
    <nav className="session-editor__breadcrumb" aria-label="Editor pipeline">
      <span className="enhance-flow__step--complete">Your Input</span>
      <span className="enhance-flow__separator" aria-hidden="true">&gt;</span>
      <span className="enhance-flow__step--complete">AI Enhancement</span>
      <span className="enhance-flow__separator" aria-hidden="true">&gt;</span>
      <span className="enhance-flow__step--active">Review &amp; Publish</span>
    </nav>
  );
}

function RawDigestPanel({ session }: { session: Session }) {
  const dateStr = new Date(session.date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div className="editor-panel__raw">
      <div className="editor-panel__raw-header">
        <span className="editor-panel__raw-label">Raw Session Digest</span>
        <span className="editor-panel__raw-label">{session.turns} turns</span>
      </div>
      <div className="editor-panel__raw-content">
        {session.rawLog.map((line, i) => (
          <div className="raw-log__line" key={i}>
            <span className="raw-log__line-num">{i + 1}</span>
            <span className="raw-log__line-text">{line}</span>
          </div>
        ))}

        <div className="session-editor__source-info">
          <span className="text-label-sm">Source: Claude Code</span>
          <span className="text-label-sm">{dateStr}</span>
          <span className="text-label-sm">{session.durationMinutes}min</span>
        </div>
      </div>
    </div>
  );
}

function StatusIndicator({ isEnhanced }: { isEnhanced: boolean }) {
  return (
    <div className="session-editor__status">
      <span
        className={`session-editor__status-dot ${isEnhanced ? 'session-editor__status-dot--enhanced' : ''}`}
      />
      <span className="text-label-sm">
        {isEnhanced ? 'Enhanced \u00B7 Ready to publish' : 'Draft'}
      </span>
    </div>
  );
}

function SkillChips({
  skills,
  onRemove,
  onAdd,
}: {
  skills: string[];
  onRemove: (skill: string) => void;
  onAdd: (skill: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [newSkill, setNewSkill] = useState('');

  function commitSkill() {
    const trimmed = newSkill.trim();
    if (trimmed.length > 0) {
      onAdd(trimmed);
    }
    setNewSkill('');
    setAdding(false);
  }

  return (
    <div className="session-editor__chips" aria-label="Skills">
      {skills.map((skill) => (
        <span key={skill} className="chip chip--primary session-editor__chip">
          <span className="chip__dot" />
          {skill}
          <button
            type="button"
            className="session-editor__chip-remove"
            onClick={() => { onRemove(skill); }}
            aria-label={`Remove ${skill}`}
          >
            x
          </button>
        </span>
      ))}
      {adding ? (
        <input
          type="text"
          className="session-editor__add-skill-input"
          value={newSkill}
          onChange={(e) => { setNewSkill(e.target.value); }}
          onKeyDown={(e) => { if (e.key === 'Enter') commitSkill(); }}
          onBlur={commitSkill}
          placeholder="Skill name"
          aria-label="New skill name"
          autoFocus
        />
      ) : (
        <button
          type="button"
          className="btn-tertiary session-editor__add-skill"
          onClick={() => { setAdding(true); }}
        >
          + Add
        </button>
      )}
    </div>
  );
}

function ExecutionPathEditor({
  steps,
  onMoveUp,
  onMoveDown,
}: {
  steps: ExecutionStep[];
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
}) {
  return (
    <div className="exec-path">
      {steps.map((step, index) => (
        <div key={step.stepNumber} className="exec-path__step session-editor__step">
          <div className="exec-path__step-icon">{index + 1}</div>
          <div className="exec-path__step-content">
            <p className="exec-path__step-title">{step.title}</p>
          </div>
          <div className="session-editor__step-actions">
            <button
              type="button"
              className="btn-tertiary"
              disabled={index === 0}
              onClick={() => { onMoveUp(index); }}
              aria-label={`Move step ${index + 1} up`}
            >
              Up
            </button>
            <button
              type="button"
              className="btn-tertiary"
              disabled={index === steps.length - 1}
              onClick={() => { onMoveDown(index); }}
              aria-label={`Move step ${index + 1} down`}
            >
              Down
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function PublishBar({ onPublish }: { onPublish: () => void }) {
  return (
    <div className="session-editor__publish-bar glass-panel">
      <div className="session-editor__publish-info">
        <span className="text-title">Publish</span>
        <span className="text-label">Share this case study on your portfolio</span>
      </div>
      <button
        type="button"
        className="btn btn-primary btn--lg"
        onClick={onPublish}
      >
        Publish &rarr;
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function SessionEditor({ session, onPublish }: SessionEditorProps) {
  const [state, setState] = useState<EditorState>(() => ({
    title: session.title,
    developerTake: session.developerTake ?? '',
    context: session.context ?? '',
    executionPath: session.executionPath ?? [],
    skills: session.skills ?? [],
  }));

  const isEnhanced = session.status === 'enhanced' || session.status === 'published';

  // -- Field handlers --

  function handleTitleChange(value: string) {
    setState((prev) => ({ ...prev, title: value }));
  }

  function handleTakeChange(value: string) {
    if (value.length <= TAKE_MAX_CHARS) {
      setState((prev) => ({ ...prev, developerTake: value }));
    }
  }

  function handleContextChange(value: string) {
    setState((prev) => ({ ...prev, context: value }));
  }

  // -- Step reorder --

  function handleMoveUp(index: number) {
    if (index === 0) return;
    setState((prev) => {
      const steps = [...prev.executionPath];
      const temp = steps[index - 1];
      steps[index - 1] = steps[index];
      steps[index] = temp;
      return { ...prev, executionPath: steps };
    });
  }

  function handleMoveDown(index: number) {
    setState((prev) => {
      if (index >= prev.executionPath.length - 1) return prev;
      const steps = [...prev.executionPath];
      const temp = steps[index + 1];
      steps[index + 1] = steps[index];
      steps[index] = temp;
      return { ...prev, executionPath: steps };
    });
  }

  // -- Skills --

  function handleRemoveSkill(skill: string) {
    setState((prev) => ({
      ...prev,
      skills: prev.skills.filter((s) => s !== skill),
    }));
  }

  function handleAddSkill(skill: string) {
    setState((prev) => {
      if (prev.skills.includes(skill)) return prev;
      return { ...prev, skills: [...prev.skills, skill] };
    });
  }

  return (
    <div className="session-editor">
      <div className="session-editor__header">
        <ProgressBreadcrumb />
      </div>

      <div className="editor-panel session-editor__grid">
        {/* Left: Raw digest */}
        <RawDigestPanel session={session} />

        {/* Right: Editable draft */}
        <div className="editor-panel__draft">
          <div className="editor-panel__draft-content">
            <StatusIndicator isEnhanced={isEnhanced} />

            {/* Title */}
            <section className="session-editor__section">
              <input
                type="text"
                className="session-editor__title-input"
                value={state.title}
                onChange={(e) => { handleTitleChange(e.target.value); }}
                aria-label="Session title"
              />
            </section>

            {/* Your Take */}
            <section className="session-editor__section">
              <span className="label label--primary">Your Take</span>
              <textarea
                className="textarea session-editor__take-textarea"
                rows={4}
                placeholder="What was the key insight? What would you tell a colleague about this session?"
                value={state.developerTake}
                onChange={(e) => { handleTakeChange(e.target.value); }}
                aria-label="Your Take"
              />
              <span className="session-editor__char-count text-label-sm">
                {state.developerTake.length} / {TAKE_MAX_CHARS}
              </span>
            </section>

            {/* Context */}
            <section className="session-editor__section">
              <span className="label label--primary">Context</span>
              <textarea
                className="textarea"
                rows={2}
                placeholder="What was the starting state? Why was this work needed?"
                value={state.context}
                onChange={(e) => { handleContextChange(e.target.value); }}
                aria-label="Context"
              />
            </section>

            {/* Execution Path */}
            {state.executionPath.length > 0 && (
              <section className="session-editor__section">
                <span className="label label--primary">Execution Path</span>
                <ExecutionPathEditor
                  steps={state.executionPath}
                  onMoveUp={handleMoveUp}
                  onMoveDown={handleMoveDown}
                />
              </section>
            )}

            {/* Skills */}
            <section className="session-editor__section">
              <span className="label label--primary">Skills</span>
              <SkillChips
                skills={state.skills}
                onRemove={handleRemoveSkill}
                onAdd={handleAddSkill}
              />
            </section>
          </div>

          {/* Publish bar */}
          <PublishBar onPublish={onPublish} />
        </div>
      </div>
    </div>
  );
}

export default SessionEditor;
