/**
 * SharePreview v6 — unified timeline view.
 * Raw session data is always the backbone. AI adds: better title, skills,
 * inline beat labels on turns, context line. Never replaces the timeline.
 */

import { useEffect, useRef } from "react";
import type { SessionAnalysis, SessionSummary, Beat } from "../types";
import MatrixText from "./MatrixText";

const SKILL_COLORS = ["violet", "rose", "teal", "amber"];

interface Props {
  analysis: SessionAnalysis;
  summary: SessionSummary | null;
  /** Whether AI is actively streaming — enables animations */
  enhancing?: boolean;
}

function formatMonth(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function formatTimeOffset(startIso: string, currentIso: string): string {
  if (!startIso || !currentIso) return "";
  const diffMs = new Date(currentIso).getTime() - new Date(startIso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "0 min";
  return `${mins} min`;
}

function groupTools(toolCalls: Array<{ name: string; succeeded: boolean }>): Array<{ name: string; count: number; errors: number }> {
  const map = new Map<string, { count: number; errors: number }>();
  for (const tc of toolCalls) {
    const existing = map.get(tc.name);
    if (existing) {
      existing.count++;
      if (!tc.succeeded) existing.errors++;
    } else {
      map.set(tc.name, { count: 1, errors: tc.succeeded ? 0 : 1 });
    }
  }
  return Array.from(map.entries())
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.count - a.count);
}

function ToolBreakdown({ toolUsage }: { toolUsage: Record<string, { count: number; errors: number }> }) {
  const entries = Object.entries(toolUsage).sort(([, a], [, b]) => b.count - a.count);
  if (entries.length === 0) return null;
  const max = Math.max(...entries.map(([, u]) => u.count));

  return (
    <div className="efficiency">
      {entries.map(([name, usage]) => (
        <div key={name} className="bar-chart__row">
          <span className="bar-chart__label">{name}</span>
          <div className="bar-chart__bar" style={{ width: `${(usage.count / max) * 200}px` }} />
          <span className="bar-chart__count">{usage.count}</span>
          {usage.errors > 0 && <span className="bar-chart__errors">({usage.errors} errors)</span>}
        </div>
      ))}
    </div>
  );
}

const BEAT_LABELS: Record<string, string> = {
  correction: "course correction",
  insight: "key insight",
  win: "resolved",
};

/** Build beat-to-turn map. Only use beats with real turn indices. Skip "step" type. */
function buildBeatMap(summary: SessionSummary | null, totalTurns: number): Map<number, Beat> {
  const map = new Map<number, Beat>();
  if (!summary) return map;

  const beats = summary.beats || [];

  // Only show inline labels if the AI provided real turn indices
  const hasRealIndices = beats.some(b => b.turnIndex > 0);
  if (!hasRealIndices) return map; // No guessing — clean timeline is better than wrong labels

  const priority: Record<string, number> = { correction: 3, insight: 2, win: 1, step: 0 };

  for (const beat of beats) {
    if (beat.type === "step") continue;
    const idx = Math.min(Math.max(0, beat.turnIndex), totalTurns - 1);
    const existing = map.get(idx);
    if (!existing || (priority[beat.type] || 0) > (priority[existing.type] || 0)) {
      map.set(idx, beat);
    }
  }

  return map;
}

/**
 * Inline helper: during enhancement, wrap text in MatrixText.
 * Each unique piece of text gets its own independent animation
 * that starts immediately when it first appears in the DOM.
 */
function AnimText({ text, speed = 18, active }: { text: string; speed?: number; active?: boolean }) {
  if (!active) return <>{text}</>;
  return <MatrixText text={text} speed={speed} />;
}

export default function SharePreview({ analysis, summary, enhancing }: Props) {
  const skills = summary?.skills || summary?.extractedSkills || [];
  const context = summary?.context || "";
  const scrollAnchorRef = useRef<HTMLDivElement>(null);

  // Title: AI title > one-line summary > first prompt
  const rawTitle = analysis.turns[0]?.userPrompt.slice(0, 100) || "Untitled Session";
  const aiTitle = summary?.title || summary?.oneLineSummary || "";
  const title = aiTitle || rawTitle;

  // Auto-scroll to new content during enhancement
  useEffect(() => {
    if (enhancing && scrollAnchorRef.current) {
      scrollAnchorRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [enhancing, summary?.executionPath?.length, skills.length, context]);

  const filesChanged = analysis.filesChanged || [];
  const totalFiles = filesChanged.length;
  const totalEdits = filesChanged.reduce((sum, f) => sum + f.count, 0);

  // Build beat map
  const beatMap = buildBeatMap(summary, analysis.turns.length);

  return (
    <div className="sp" data-enhancing={enhancing ? "true" : undefined}>
      {/* ── 2-column layout for top content ──────── */}
      <div className="enhance-layout">
        {/* Left: Stats + Raw Session */}
        <div>
          {/* Stats grid */}
          <div className="cli-stats-grid">
            <div className="cli-stats-grid__item">
              <div className="cli-stats-grid__value">{analysis.duration.minutes}</div>
              <div className="cli-stats-grid__label">minutes</div>
            </div>
            <div className="cli-stats-grid__item">
              <div className="cli-stats-grid__value">{analysis.turns.length}</div>
              <div className="cli-stats-grid__label">turns</div>
            </div>
            <div className="cli-stats-grid__item">
              <div className="cli-stats-grid__value">{analysis.totalToolCalls}</div>
              <div className="cli-stats-grid__label">tool calls</div>
            </div>
            <div className="cli-stats-grid__item">
              <div className="cli-stats-grid__value">{totalFiles}</div>
              <div className="cli-stats-grid__label">files</div>
            </div>
          </div>

          {/* Raw session panel */}
          <div className="raw-session-panel" style={{ marginTop: 16 }}>
            <div className="raw-session-panel__label">RAW SESSION</div>
            {analysis.turns.slice(0, 4).map((turn, i) => (
              <div key={i}>
                <span className="raw-session-panel__id">[{`${String(i + 1).padStart(2, '0')}`}]</span>{' '}
                <span>{turn.userPrompt.slice(0, 50)}{turn.userPrompt.length > 50 ? '...' : ''}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Hero + Context + Beats */}
        <div>
          {/* ── 1. Hero ───────────────────────────────── */}
          <section className="sp-hero">
            <h1>
              <AnimText text={title} speed={15} active={enhancing && !!aiTitle} />
            </h1>
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
              <span className="chip chip--muted">{formatMonth(analysis.duration.start)}</span>
            </div>

            {skills.length > 0 && (
              <div className="skills-line">
                {skills.map((skill, i) => (
                  <span key={skill} className={`skill-item s--${SKILL_COLORS[i % SKILL_COLORS.length]}`}>
                    <AnimText text={skill} speed={25} active={enhancing} />
                  </span>
                ))}
              </div>
            )}
          </section>

          {/* ── 3. Context line (AI-enhanced) ─────────── */}
          {context && (
            <div className="context-line">
              <AnimText text={context} speed={12} active={enhancing} />
            </div>
          )}

          {/* ── 4. Execution Path / Steps (AI-enhanced) ── */}
          {summary?.beats && summary.beats.length > 0 && (
            <>
              <div className="story-label" id="steps">
                <span>What happened</span>
                <span>{summary.beats.length} moments</span>
              </div>

              {summary.beats.map((beat, i) => (
                <div className={`beat beat--${beat.type}`} key={i}>
                  {beat.type !== "step" && (
                    <span className={`prompt-entry__beat-tag prompt-entry__beat-tag--${beat.type}`}>
                      {BEAT_LABELS[beat.type] || beat.type}
                    </span>
                  )}
                  {beat.type === "step" && (
                    <span className="beat__step-num">{i + 1}</span>
                  )}
                  <div className="beat__body">
                    <div className="beat__title">
                      <AnimText text={beat.title} speed={18} active={enhancing} />
                    </div>
                    <div className="beat__desc">
                      <AnimText text={beat.description} speed={12} active={enhancing} />
                    </div>
                    {beat.direction && (
                      <div className="beat__direction">
                        <span className="beat__direction-label">Developer:</span>{" "}
                        <AnimText text={beat.direction} speed={12} active={enhancing} />
                      </div>
                    )}
                    {beat.directionNote && (
                      <div className="beat__insight">
                        <AnimText text={beat.directionNote} speed={12} active={enhancing} />
                      </div>
                    )}
                  </div>
                  {beat.time && <div className="beat__time">{beat.time}</div>}
                </div>
              ))}
            </>
          )}

          {/* Scroll anchor for auto-scroll during enhancement */}
          <div ref={scrollAnchorRef} />
        </div>
      </div>

      {/* ── Full-width below: Explore divider + collapsibles ── */}
      <div className="explore-divider">
        <span className="explore-divider__label">Explore</span>
      </div>

      {/* ── 5. Tool breakdown (collapsible) ─────────── */}
      {Object.keys(analysis.toolUsage).length > 0 && (
        <div className="more">
          <details>
            <summary>
              Tool breakdown ({analysis.totalToolCalls} calls)
              <span className="arr">&rarr;</span>
            </summary>
            <div className="more-body">
              <ToolBreakdown toolUsage={analysis.toolUsage} />
            </div>
          </details>
        </div>
      )}

      {/* ── 5. Turn Timeline (collapsible) ─────────── */}
      {analysis.turns.length > 0 && (
        <div className="more">
          <details>
            <summary>
              Session timeline ({analysis.turns.length} turns · {analysis.duration.minutes} min)
              <span className="arr">&rarr;</span>
            </summary>
            <div className="more-body">

          {analysis.turns.map((turn) => {
            const tools = groupTools(turn.toolCalls);
            const timeOffset = formatTimeOffset(analysis.duration.start, turn.userTimestamp);
            const beat = beatMap.get(turn.index);
            const beatType = beat?.type || "";

            return (
              <div
                key={turn.index}
                className={`prompt-entry${beat ? ` prompt-entry--beat prompt-entry--${beatType}` : ""}`}
              >
                <div className="prompt-entry__time">{timeOffset}</div>
                <div className="prompt-entry__content">

                  {/* Beat annotation — inline label above the prompt */}
                  {beat && BEAT_LABELS[beat.type] && (
                    <div className="prompt-entry__beat">
                      <span className={`prompt-entry__beat-tag prompt-entry__beat-tag--${beatType}`}>
                        {BEAT_LABELS[beat.type]}
                      </span>
                      {beat.description && beat.description.length <= 200 && (
                        <span className="prompt-entry__beat-desc">
                          {beat.description}
                        </span>
                      )}
                    </div>
                  )}

                  <div className="prompt-entry__text">
                    {turn.userPrompt.slice(0, 300)}
                    {turn.userPrompt.length > 300 && "…"}
                  </div>

                  {tools.length > 0 && (
                    <div className="prompt-entry__tools">
                      {tools.map((t) => (
                        <span key={t.name} className={`prompt-tool ${t.errors > 0 ? "prompt-tool--err" : ""}`}>
                          {t.name}{t.count > 1 ? ` ×${t.count}` : ""}
                        </span>
                      ))}
                    </div>
                  )}

                  {turn.assistantText && (
                    <div className="prompt-entry__response">
                      {turn.assistantText.slice(0, 200)}
                      {turn.assistantText.length > 200 && "…"}
                    </div>
                  )}

                  {/* Beat takeaway — below response */}
                  {beat?.directionNote && (
                    <div className="prompt-entry__takeaway">
                      {beat.directionNote}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

            </div>
          </details>
        </div>
      )}

      {/* ── 6. Files changed ──────────────────────── */}
      {filesChanged.length > 0 && (
        <div className="more">
          <details>
            <summary>Files changed ({filesChanged.length} files · {totalEdits} edits) <span className="arr">&rarr;</span></summary>
            <div className="more-body">
              <div className="files-list">
                {filesChanged
                  .sort((a, b) => b.count - a.count)
                  .map((f) => (
                    <div key={f.filePath} className="files-list__row">
                      <span className="files-list__path">{f.filePath.split("/").slice(-3).join("/")}</span>
                      <span className="files-list__count">{f.count} {f.tool === "Write" ? "write" : "edit"}{f.count !== 1 ? "s" : ""}</span>
                    </div>
                  ))}
              </div>
            </div>
          </details>
        </div>
      )}

      {/* ── 7. Full narrative (collapsible, only with summary) ── */}
      {summary?.narrative && summary.narrative.includes("\n") && (
        <div className="more">
          <details>
            <summary>Full narrative <span className="arr">&rarr;</span></summary>
            <div className="more-body">
              {summary.narrative.split("\n").map((p, i) => p.trim() ? <p key={i}>{p}</p> : null)}
            </div>
          </details>
        </div>
      )}

      {/* ── 8. CTA ────────────────────────────────── */}
      <div className="share-cta">
        <p>Share your own AI coding sessions as case studies</p>
        <a href="https://heyi.am">Create yours on heyi.am</a>
      </div>
    </div>
  );
}
