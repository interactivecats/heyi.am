import { Link } from "react-router-dom";
import type { ProjectSession } from "../types";

interface Props {
  session: ProjectSession;
  projectName: string;
  oneLineSummary?: string;
  turnCount?: number;
  highlightCount?: number;
  duration?: number;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  }) +
    ", " +
    d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
}

export default function SessionCard({
  session,
  projectName,
  oneLineSummary,
  turnCount,
  highlightCount,
  duration,
}: Props) {
  const displaySummary = oneLineSummary || session.firstPrompt;
  const isFromPrompt = !oneLineSummary;

  return (
    <Link
      to={`/session/${projectName}/${session.id}`}
      className="session-card"
    >
      <div
        className={`session-card__summary ${isFromPrompt ? "session-card__summary--fallback" : ""}`}
      >
        {displaySummary || "Untitled session"}
      </div>
      <div className="session-card__meta">
        <span>{formatDate(session.date)}</span>
        {duration != null && (
          <>
            <span className="separator">&middot;</span>
            <span>{duration} min</span>
          </>
        )}
      </div>
      <div className="session-card__stats">
        {turnCount != null && (
          <span className="session-card__turns">{turnCount} turns</span>
        )}
        {highlightCount != null && highlightCount > 0 && (
          <span className="session-card__highlights">
            {highlightCount} highlights
          </span>
        )}
      </div>
    </Link>
  );
}
