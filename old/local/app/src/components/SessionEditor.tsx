import { useState, useRef } from "react";
import type { ExecutionStep, SessionSummary, SessionAnalysis, DeveloperQuote } from "../types";
import CharCounter from "./CharCounter";

// ── Field limits ─────────────────────────────────────────

const LIMITS = {
  title: 80,
  context: 200,
  developerTake: 300,
  stepTitle: 80,
  stepBody: 160,
  skillTag: 40,
} as const;

// ── Props ────────────────────────────────────────────────

export interface EditorData {
  title: string;
  context: string;
  developer_take: string;
  execution_path: ExecutionStep[];
  skills: string[];
  developerQuotes?: DeveloperQuote[];
  suggestedTake?: string;
  hero_image_url?: string;
}

interface Props {
  initialData: EditorData;
  analysis: SessionAnalysis;
  onPublish: (data: EditorData) => Promise<{ url: string }>;
  onCancel: () => void;
}

// ── Validation ───────────────────────────────────────────

function validate(data: EditorData, fromSuggestion: boolean): string | null {
  if (!data.title.trim()) return "Add a title before publishing";
  const take = data.developer_take.trim();
  if (!take) return "Add your take — what would you tell a colleague?";
  if (take.length < 10) return "Your take is too short — say a bit more";
  if (fromSuggestion && data.suggestedTake && take === data.suggestedTake.trim()) {
    return "Edit the suggested take to make it yours";
  }
  return null;
}

// ── Build initial data from summary ──────────────────────

export function buildEditorData(
  summary: SessionSummary | null,
  analysis: SessionAnalysis
): EditorData {
  if (!summary) {
    return {
      title: analysis.turns[0]?.userPrompt.slice(0, LIMITS.title) || "",
      context: "",
      developer_take: "",
      execution_path: [],
      skills: [],
    };
  }

  let executionPath: ExecutionStep[];
  if (summary.executionPath && summary.executionPath.length > 0) {
    executionPath = summary.executionPath;
  } else if (summary.tutorialSteps && summary.tutorialSteps.length > 0) {
    executionPath = summary.tutorialSteps.map((step) => ({
      title: step.title,
      body: step.description,
      insight: step.keyTakeaway || "",
    }));
  } else if (summary.beats && summary.beats.length > 0) {
    executionPath = summary.beats
      .filter((b) => ["step", "win", "insight"].includes(b.type))
      .slice(0, 7)
      .map((beat) => ({
        title: beat.title,
        body: beat.description.slice(0, 160),
        insight: beat.directionNote || "",
      }));
  } else {
    executionPath = [];
  }

  return {
    title: summary.title || summary.oneLineSummary || "",
    context: summary.context || "",
    developer_take: "",
    execution_path: executionPath,
    skills: summary.skills || summary.extractedSkills || [],
    developerQuotes: summary.developerQuotes,
    suggestedTake: summary.suggestedTake,
  };
}

// ── Skill colors ─────────────────────────────────────────

const SKILL_COLORS = ["violet", "rose", "teal", "amber"];

// ── Component ────────────────────────────────────────────

export default function SessionEditor({
  initialData,
  analysis,
  onPublish,
  onCancel,
}: Props) {
  const [data, setData] = useState<EditorData>(initialData);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"editing" | "confirming" | "publishing">("editing");
  const [publishResult, setPublishResult] = useState<{ url: string } | null>(null);
  const [newSkill, setNewSkill] = useState("");
  const [fromSuggestion, setFromSuggestion] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [showRef, setShowRef] = useState(false);
  const [heroImage, setHeroImage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const takeRef = useRef<HTMLTextAreaElement>(null);

  function update<K extends keyof EditorData>(field: K, value: EditorData[K]) {
    setData((prev) => ({ ...prev, [field]: value }));
    setError(null);
  }

  function updateStep(index: number, field: keyof ExecutionStep, value: string) {
    setData((prev) => {
      const steps = [...prev.execution_path];
      steps[index] = { ...steps[index], [field]: value };
      return { ...prev, execution_path: steps };
    });
  }

  function deleteStep(index: number) {
    setData((prev) => ({
      ...prev,
      execution_path: prev.execution_path.filter((_, i) => i !== index),
    }));
  }

  async function handleImageUpload(file: File) {
    if (file.size > 5 * 1024 * 1024) {
      setError("Image must be under 5MB");
      return;
    }
    if (!file.type.match(/^image\/(png|jpe?g|webp|gif)$/)) {
      setError("Only PNG, JPG, WebP, and GIF images are supported");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("image", file);
      const res = await fetch("/api/upload-image", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Upload failed");
      const { url } = await res.json();
      setHeroImage(url);
    } catch {
      setError("Failed to upload image");
    } finally {
      setUploading(false);
    }
  }

  function handlePublish() {
    const err = validate(data, fromSuggestion);
    if (err) { setError(err); return; }
    setPhase("confirming");
  }

  function confirmPublish() {
    setPhase("publishing");
    const publishData = { ...data, hero_image_url: heroImage || undefined };
    onPublish(publishData)
      .then(setPublishResult)
      .catch((e: Error) => {
        // Auth prompt intercept — parent handles this, not an error
        if (e.message === "__auth_prompt__") {
          setPhase("editing");
          return;
        }
        setError("Something went wrong");
        setPhase("editing");
      });
  }

  if (publishResult) {
    return (
      <div className="se-success">
        <div className="se-success__label">Session Published</div>
        <a href={publishResult.url} className="se-success__url" target="_blank" rel="noopener noreferrer">
          {publishResult.url}
        </a>
        <button className="se-success__copy" onClick={() => navigator.clipboard.writeText(publishResult.url)}>
          Copy link
        </button>
      </div>
    );
  }

  const filesChanged = analysis.filesChanged || [];
  const totalFiles = filesChanged.length;

  return (
    <div className="se-preview-editor">
      <div className="se-header">
        <button
          type="button"
          className={`se-ref-toggle ${showRef ? 'active' : ''}`}
          onClick={() => setShowRef(!showRef)}
        >
          {showRef ? 'Hide data' : 'Session data'}
        </button>
      </div>

      {/* ═══ 1. YOUR TAKE — the one thing that matters ═══ */}
      <section className="se-take">
        <label className="se-take__label" htmlFor="se-take">
          Your take <span className="se-take__required">required</span>
        </label>
        <p className="se-take__hint">What would you tell a colleague about this session?</p>
        <textarea
          id="se-take"
          ref={takeRef}
          className="se-take__input"
          value={data.developer_take}
          onFocus={() => setFocusedField('take')}
          onBlur={() => setFocusedField(null)}
          onChange={(e) => {
            update("developer_take", e.target.value.slice(0, LIMITS.developerTake));
            if (fromSuggestion && e.target.value !== data.suggestedTake) {
              setFromSuggestion(false);
            }
          }}
          placeholder="The tricky part was... I chose this because... What surprised me was..."
          maxLength={LIMITS.developerTake}
          rows={3}
        />
        {focusedField === 'take' && data.developer_take.length > LIMITS.developerTake * 0.7 && (
          <CharCounter current={data.developer_take.length} max={LIMITS.developerTake} />
        )}

        {/* Suggested take */}
        {data.suggestedTake && !data.developer_take && (
          <div className="se-suggestion">
            <span className="se-suggestion__label">Suggested from what you said:</span>
            <p className="se-suggestion__text">{data.suggestedTake}</p>
            <button
              type="button"
              className="se-suggestion__use"
              onClick={() => {
                update("developer_take", data.suggestedTake!);
                setFromSuggestion(true);
                takeRef.current?.focus();
              }}
            >
              Use this as starting point
            </button>
          </div>
        )}

        {/* Quote chips */}
        {data.developerQuotes && data.developerQuotes.length > 0 && data.developer_take.length < 10 && (
          <div className="se-quotes">
            <span className="se-quotes__label">Things you said:</span>
            {data.developerQuotes.map((q, i) => (
              <button
                key={i}
                type="button"
                className="se-quote"
                onClick={() => {
                  update("developer_take", q.text.slice(0, LIMITS.developerTake));
                  takeRef.current?.focus();
                }}
              >
                &ldquo;{q.text}&rdquo;
              </button>
            ))}
          </div>
        )}

        {/* Starter chips — disappear after typing 10+ chars */}
        {data.developer_take.length < 10 && !data.developerQuotes?.length && (
          <div className="se-starters">
            <span className="se-starters__label">Start with:</span>
            {["The tricky part was...", "I chose this because...", "What surprised me was..."].map((starter, i) => (
              <button
                key={i}
                type="button"
                className="se-starter"
                onClick={() => {
                  update("developer_take", starter);
                  takeRef.current?.focus();
                }}
              >
                {starter}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* ═══ 2. CASE STUDY — everything is editable in-place ═══ */}
      <section className="se-case-study">

        {/* Title — looks like an h1, is an input */}
        <input
          className="se-live-title"
          value={data.title}
          onFocus={() => setFocusedField('title')}
          onBlur={() => setFocusedField(null)}
          onChange={(e) => update("title", e.target.value.slice(0, LIMITS.title))}
          placeholder="What did you build?"
          maxLength={LIMITS.title}
        />
        {focusedField === 'title' && data.title.length > LIMITS.title * 0.7 && (
          <CharCounter current={data.title.length} max={LIMITS.title} />
        )}

        {/* Stats (read-only) */}
        <div className="meta-row">
          <span className="chip chip--violet">Claude Code</span>
          <span className="chip chip--teal">{analysis.duration.minutes} min</span>
          <span className="chip chip--amber">{analysis.turns.length} turns</span>
          {analysis.totalToolCalls > 0 && (
            <span className="chip chip--muted">{analysis.totalToolCalls} tool calls</span>
          )}
          {totalFiles > 0 && (
            <span className="chip chip--muted">{totalFiles} files</span>
          )}
        </div>

        {/* Skills — each is an editable input */}
        <div className="se-case-study__skills">
          {data.skills.map((skill, i) => (
            <span key={i} className={`se-skill-edit s--${SKILL_COLORS[i % SKILL_COLORS.length]}`}>
              <input
                className="se-skill-edit__input"
                value={skill}
                onChange={(e) => {
                  const next = [...data.skills];
                  next[i] = e.target.value.slice(0, LIMITS.skillTag);
                  update("skills", next);
                }}
                onBlur={() => {
                  // Remove empty skills on blur
                  if (!data.skills[i]?.trim()) {
                    update("skills", data.skills.filter((_, j) => j !== i));
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Backspace" && !skill) {
                    e.preventDefault();
                    update("skills", data.skills.filter((_, j) => j !== i));
                  }
                }}
                maxLength={LIMITS.skillTag}
                style={{ width: `${Math.max(3, skill.length + 1)}ch` }}
              />
              <button
                type="button"
                className="se-skill-edit__x"
                onClick={() => update("skills", data.skills.filter((_, j) => j !== i))}
                aria-label={`Remove ${skill}`}
              >
                &times;
              </button>
            </span>
          ))}
          <input
            type="text"
            value={newSkill}
            onChange={(e) => setNewSkill(e.target.value.slice(0, LIMITS.skillTag))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newSkill.trim()) {
                e.preventDefault();
                if (!data.skills.includes(newSkill.trim())) {
                  update("skills", [...data.skills, newSkill.trim()]);
                }
                setNewSkill("");
              }
            }}
            placeholder="+ add skill"
            className="se-skill-inline"
          />
        </div>

        {/* Hero image upload */}
        <div className="se-image-upload">
          {heroImage ? (
            <div className="se-image-preview">
              <img src={heroImage} alt="Hero" />
              <button
                type="button"
                className="se-image-remove"
                onClick={() => setHeroImage(null)}
              >
                Remove
              </button>
            </div>
          ) : (
            <label className="se-image-dropzone">
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                style={{ display: "none" }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImageUpload(file);
                }}
              />
              {uploading ? "Uploading..." : "Add hero image (optional)"}
            </label>
          )}
        </div>

        {/* Context — looks like a blockquote, is a textarea */}
        <textarea
          className="se-live-context"
          value={data.context}
          onFocus={() => setFocusedField('context')}
          onBlur={() => setFocusedField(null)}
          onChange={(e) => update("context", e.target.value.slice(0, LIMITS.context))}
          placeholder="What problem were you solving?"
          maxLength={LIMITS.context}
          rows={2}
        />
        {focusedField === 'context' && data.context.length > LIMITS.context * 0.7 && (
          <CharCounter current={data.context.length} max={LIMITS.context} />
        )}

        {/* Steps — each field is editable */}
        {data.execution_path.length > 0 && (
          <div className="se-steps">
            <div className="se-steps__label">
              What happened
            </div>
            {data.execution_path.map((step, i) => (
              <div className="se-step-card" key={i}>
                <span className="se-step-card__num">{i + 1}</span>
                <div className="se-step-card__body">
                  <input
                    className="se-step-card__title-input"
                    value={step.title}
                    onChange={(e) => updateStep(i, "title", e.target.value.slice(0, LIMITS.stepTitle))}
                    placeholder="What happened?"
                    maxLength={LIMITS.stepTitle}
                  />
                  <textarea
                    className="se-step-card__desc-input"
                    value={step.body}
                    onChange={(e) => updateStep(i, "body", e.target.value.slice(0, LIMITS.stepBody))}
                    placeholder="Why this decision?"
                    maxLength={LIMITS.stepBody}
                    rows={2}
                  />
                </div>
                <button
                  type="button"
                  className="se-step-card__delete"
                  onClick={() => deleteStep(i)}
                  aria-label={`Remove step ${i + 1}`}
                >
                  &times;
                </button>
              </div>
            ))}
            {data.execution_path.length < 7 && (
              <button
                type="button"
                className="se-steps__add"
                onClick={() => {
                  setData((prev) => ({
                    ...prev,
                    execution_path: [...prev.execution_path, { title: "", body: "", insight: "" }],
                  }));
                }}
              >
                + Add step
              </button>
            )}
          </div>
        )}
        {data.execution_path.length === 0 && (
          <button
            type="button"
            className="se-steps__add"
            onClick={() => {
              setData((prev) => ({
                ...prev,
                execution_path: [...prev.execution_path, { title: "", body: "", insight: "" }],
              }));
            }}
          >
            + Add step
          </button>
        )}
      </section>

      {/* ═══ 3. ACTIONS ═══ */}
      {error && <div className="se-error" role="alert">{error}</div>}

      {phase === "confirming" ? (
        <div className="se-confirm">
          <p className="se-confirm__q">Would you say this in an interview?</p>
          <div className="se-confirm__btns">
            <button type="button" className="se-confirm__yes" onClick={confirmPublish}>
              Yes, publish
            </button>
            <button type="button" className="se-confirm__no" onClick={() => { setPhase("editing"); takeRef.current?.focus(); }}>
              Let me edit
            </button>
          </div>
        </div>
      ) : (
        <div className="se-actions">
          <button
            type="button"
            className="se-publish-btn"
            onClick={handlePublish}
            disabled={phase === "publishing"}
          >
            {phase === "publishing" ? "Publishing..." : "Publish"}
          </button>
          <button type="button" className="se-cancel-btn" onClick={onCancel}>
            Cancel
          </button>
        </div>
      )}

      {showRef && (
        <div className="se-ref-panel">
          <div className="se-ref-panel__header">
            <span>Session reference</span>
            <button type="button" onClick={() => setShowRef(false)}>&times;</button>
          </div>
          <div className="se-ref-panel__body">
            <div className="se-ref-section">
              <div className="se-ref-label">Stats</div>
              <div className="se-ref-stat">{analysis.turns.length} turns</div>
              <div className="se-ref-stat">{analysis.duration.minutes} min</div>
              <div className="se-ref-stat">{analysis.totalToolCalls} tool calls</div>
              <div className="se-ref-stat">{filesChanged.length} files</div>
            </div>
            {filesChanged.length > 0 && (
              <div className="se-ref-section">
                <div className="se-ref-label">Files touched</div>
                {filesChanged.slice(0, 15).map((f, i) => (
                  <div key={i} className="se-ref-file">{f.filePath}</div>
                ))}
              </div>
            )}
            {analysis.turns.length > 0 && (
              <div className="se-ref-section">
                <div className="se-ref-label">First prompts</div>
                {analysis.turns.slice(0, 5).map((t, i) => (
                  <div key={i} className="se-ref-turn">
                    <span className="se-ref-turn__num">{i + 1}</span>
                    <span className="se-ref-turn__text">{t.userPrompt.slice(0, 100)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
