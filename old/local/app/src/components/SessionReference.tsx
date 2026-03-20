import { useState } from "react";
import type { SessionAnalysis, Turn } from "../types";

// ── Constants ────────────────────────────────────────────

const INITIAL_TURN_LIMIT = 20;
const PROMPT_TRUNCATE = 200;

// ── Props ────────────────────────────────────────────────

interface Props {
  analysis: SessionAnalysis;
}

// ── Helpers ──────────────────────────────────────────────

function formatTimeOffset(startIso: string, currentIso: string): string {
  if (!startIso || !currentIso) return "";
  const diffMs = new Date(currentIso).getTime() - new Date(startIso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "0m";
  return `${mins}m`;
}

function groupToolCalls(
  toolCalls: Turn["toolCalls"]
): Array<{ name: string; count: number }> {
  const map = new Map<string, number>();
  for (const tc of toolCalls) {
    map.set(tc.name, (map.get(tc.name) || 0) + 1);
  }
  return Array.from(map.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

// ── Component ────────────────────────────────────────────

export default function SessionReference({ analysis }: Props) {
  const [showAll, setShowAll] = useState(false);

  const totalFiles = analysis.filesChanged.length;
  const totalEdits = analysis.filesChanged.reduce((sum, f) => sum + f.count, 0);

  const turnsToShow = showAll
    ? analysis.turns
    : analysis.turns.slice(0, INITIAL_TURN_LIMIT);
  const hasMoreTurns = analysis.turns.length > INITIAL_TURN_LIMIT;

  return (
    <aside className="se-reference" aria-label="Session reference">
      {/* ── Stats ───────────────────────────────── */}
      <div className="se-reference__stats">
        <span>{analysis.duration.minutes} min</span>
        <span aria-hidden="true" className="se-reference__dot">&middot;</span>
        <span>{analysis.turns.length} turns</span>
        <span aria-hidden="true" className="se-reference__dot">&middot;</span>
        <span>{analysis.totalToolCalls} tools</span>
        <span aria-hidden="true" className="se-reference__dot">&middot;</span>
        <span>{totalFiles} files</span>
      </div>

      {/* ── Turn timeline ───────────────────────── */}
      <div className="se-reference__section-label">Turn timeline</div>
      <div className="se-reference__turns">
        {turnsToShow.map((turn) => {
          const tools = groupToolCalls(turn.toolCalls);
          const offset = formatTimeOffset(
            analysis.duration.start,
            turn.userTimestamp
          );

          return (
            <div className="se-reference__turn" key={turn.index}>
              <div className="se-reference__turn-header">
                <span className="se-reference__turn-num">{turn.index + 1}</span>
                <span className="se-reference__turn-time">{offset}</span>
              </div>
              <div className="se-reference__turn-prompt">
                {turn.userPrompt.slice(0, PROMPT_TRUNCATE)}
                {turn.userPrompt.length > PROMPT_TRUNCATE && "..."}
              </div>
              {tools.length > 0 && (
                <div className="se-reference__turn-tools">
                  {tools.map((t) => (
                    <span key={t.name} className="prompt-tool">
                      {t.name}
                      {t.count > 1 ? ` x${t.count}` : ""}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {hasMoreTurns && !showAll && (
          <button
            type="button"
            className="se-reference__show-all"
            onClick={() => setShowAll(true)}
          >
            Show all {analysis.turns.length} turns
          </button>
        )}
      </div>

      {/* ── Files changed ───────────────────────── */}
      {totalFiles > 0 && (
        <>
          <div className="se-reference__section-label">
            Files changed ({totalFiles} files, {totalEdits} edits)
          </div>
          <div className="se-reference__files">
            {analysis.filesChanged
              .sort((a, b) => b.count - a.count)
              .map((f) => {
                const shortPath = f.filePath.split("/").pop() || f.filePath;
                return (
                  <div key={f.filePath} className="se-reference__file">
                    <span className="se-reference__file-name" title={f.filePath}>
                      {shortPath}
                    </span>
                    <span className="se-reference__file-count">
                      {f.count} {f.count === 1 ? "edit" : "edits"}
                    </span>
                  </div>
                );
              })}
          </div>
        </>
      )}
    </aside>
  );
}
