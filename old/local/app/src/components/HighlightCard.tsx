import type { Highlight } from "../types";

interface Props {
  highlight: Highlight;
}

export default function HighlightCard({ highlight }: Props) {
  return (
    <div className="highlight-card">
      <div className="highlight-card__header">
        <span
          className={`highlight-card__badge highlight-card__badge--${highlight.type}`}
        >
          {highlight.type}
        </span>
        <span className="highlight-card__title">{highlight.title}</span>
      </div>
      <span className="highlight-card__description">
        {highlight.description}
      </span>
      <span className="highlight-card__turn-link">
        Turn {highlight.turnIndex} &rarr;
      </span>
    </div>
  );
}
