import { Fragment } from 'react';
import type { Session } from './types';

// ── Growth Chart ─────────────────────────────────────────────────

interface GrowthChartProps {
  sessions: Session[];
  totalLoc: number;
  totalFiles: number;
  onSessionClick?: (session: Session) => void;
}

/** A point on the cumulative LOC time series */
export interface GrowthPoint {
  /** Visual x position in ms (after gap compression) */
  visualTime: number;
  /** Cumulative LOC at this point */
  cumulativeLoc: number;
  /** Which session this point belongs to (index in sorted array) */
  sessionIndex: number;
}

/** Session boundary marker for vertical dashed lines */
export interface SessionBoundary {
  visualTime: number;
  title: string;
  sessionIndex: number;
}

function formatLoc(loc: number): string {
  if (loc < 1000) return String(loc);
  return `${(loc / 1000).toFixed(1)}k`;
}

/** @internal Exported for testing */
export function formatLocAxis(n: number): string {
  if (n === 0) return '0';
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
  return String(n);
}

/** @internal Exported for testing */
export function formatLocDelta(n: number): string {
  const rounded = Math.round(n);
  if (rounded >= 1000) return `+${(rounded / 1000).toFixed(rounded >= 10000 ? 0 : 1)}k`;
  return `+${rounded}`;
}

/** @internal Exported for testing */
export function computeAxisTicks(maxVal: number): number[] {
  if (maxVal <= 0) return [0];
  const rawStep = maxVal / 4;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const nice = [1, 2, 2.5, 5, 10];
  let step = magnitude;
  for (const n of nice) {
    if (n * magnitude >= rawStep) {
      step = n * magnitude;
      break;
    }
  }
  const ticks: number[] = [];
  for (let v = 0; v <= maxVal + step * 0.1; v += step) {
    ticks.push(Math.round(v));
  }
  if (ticks[ticks.length - 1] < maxVal) {
    ticks.push(ticks[ticks.length - 1] + Math.round(step));
  }
  return ticks;
}

const FIVE_MINUTES_MS = 5 * 60 * 1000;
const GAP_COMPRESS_THRESHOLD_MS = 60 * 60 * 1000;
const COMPRESSED_GAP_MS = 10 * 60 * 1000;

function bucketTurns(
  turns: Array<{ timestamp: string }>,
  sessionStart: number,
  sessionEnd: number,
  locPerTurn: number,
): Array<{ time: number; locDelta: number }> {
  const turnTimes = turns
    .map((t) => new Date(t.timestamp).getTime())
    .filter((t) => !isNaN(t) && t >= sessionStart && t <= sessionEnd + FIVE_MINUTES_MS)
    .sort((a, b) => a - b);

  if (turnTimes.length === 0) {
    return [{ time: sessionEnd, locDelta: locPerTurn * turns.length }];
  }

  const buckets = new Map<number, number>();
  for (const t of turnTimes) {
    const bucketStart = sessionStart + Math.floor((t - sessionStart) / FIVE_MINUTES_MS) * FIVE_MINUTES_MS;
    buckets.set(bucketStart, (buckets.get(bucketStart) ?? 0) + 1);
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => a - b)
    .map(([time, count]) => ({
      time: time + FIVE_MINUTES_MS / 2,
      locDelta: count * locPerTurn,
    }));
}

/** @internal Exported for testing */
export function buildGrowthTimeSeries(
  sessions: Session[],
): { points: GrowthPoint[]; boundaries: SessionBoundary[]; totalVisualTime: number } {
  const sorted = [...sessions]
    .filter((s) => s.date)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  if (sorted.length === 0) return { points: [], boundaries: [], totalVisualTime: 0 };

  interface RawPoint {
    realTime: number;
    cumulativeLoc: number;
    sessionIndex: number;
  }

  const rawPoints: RawPoint[] = [];
  const rawBoundaries: { realTime: number; title: string; sessionIndex: number }[] = [];
  let cumulativeLoc = 0;

  for (let si = 0; si < sorted.length; si++) {
    const session = sorted[si];
    const sessionStart = new Date(session.date).getTime();
    const sessionEnd = session.endTime
      ? new Date(session.endTime).getTime()
      : sessionStart + session.durationMinutes * 60 * 1000;
    const sessionLoc = Math.max(0, session.linesOfCode);

    rawBoundaries.push({ realTime: sessionStart, title: session.title, sessionIndex: si });
    rawPoints.push({ realTime: sessionStart, cumulativeLoc, sessionIndex: si });

    if (sessionLoc === 0) {
      rawPoints.push({ realTime: sessionEnd, cumulativeLoc, sessionIndex: si });
      continue;
    }

    const timeline = session.turnTimeline;
    if (!timeline || timeline.length === 0) {
      cumulativeLoc += sessionLoc;
      rawPoints.push({ realTime: sessionEnd, cumulativeLoc, sessionIndex: si });
      continue;
    }

    const editTurns = timeline.filter(
      (t) =>
        t.type === 'tool' &&
        t.tools &&
        t.tools.some((tool) => /edit|write/i.test(tool)),
    );

    const activeTurns = editTurns.length > 0
      ? editTurns
      : timeline.filter((t) => t.type === 'tool' && t.timestamp);

    if (activeTurns.length === 0) {
      cumulativeLoc += sessionLoc;
      rawPoints.push({ realTime: sessionEnd, cumulativeLoc, sessionIndex: si });
      continue;
    }

    const locPerTurn = sessionLoc / activeTurns.length;
    const buckets = bucketTurns(activeTurns, sessionStart, sessionEnd, locPerTurn);
    for (const bucket of buckets) {
      cumulativeLoc += bucket.locDelta;
      rawPoints.push({ realTime: bucket.time, cumulativeLoc, sessionIndex: si });
    }
  }

  if (rawPoints.length === 0) return { points: [], boundaries: [], totalVisualTime: 0 };

  let visualTime = 0;
  let prevRealTime = rawPoints[0].realTime;
  const realToVisual = new Map<number, number>();

  for (const rp of rawPoints) {
    const gap = rp.realTime - prevRealTime;
    if (gap > GAP_COMPRESS_THRESHOLD_MS) {
      visualTime += COMPRESSED_GAP_MS;
    } else {
      visualTime += Math.max(0, gap);
    }
    realToVisual.set(rp.realTime, visualTime);
    prevRealTime = rp.realTime;
  }

  const points: GrowthPoint[] = rawPoints.map((rp) => ({
    visualTime: realToVisual.get(rp.realTime) ?? 0,
    cumulativeLoc: rp.cumulativeLoc,
    sessionIndex: rp.sessionIndex,
  }));

  const boundaries: SessionBoundary[] = rawBoundaries.map((b) => {
    let bestVisual = 0;
    let bestDist = Infinity;
    for (const [real, vis] of realToVisual.entries()) {
      const dist = Math.abs(real - b.realTime);
      if (dist < bestDist) {
        bestDist = dist;
        bestVisual = vis;
      }
    }
    return { visualTime: bestVisual, title: b.title, sessionIndex: b.sessionIndex };
  });

  return { points, boundaries, totalVisualTime: visualTime };
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/**
 * Build a smooth cubic bezier SVG path through the given points.
 * @internal Exported for testing
 */
export function buildSmoothPath(
  coords: Array<{ x: number; y: number }>,
): string {
  if (coords.length === 0) return '';
  if (coords.length === 1) return `M${coords[0].x.toFixed(1)},${coords[0].y.toFixed(1)}`;
  if (coords.length === 2) {
    return `M${coords[0].x.toFixed(1)},${coords[0].y.toFixed(1)} L${coords[1].x.toFixed(1)},${coords[1].y.toFixed(1)}`;
  }

  const tension = 0.3;
  let path = `M${coords[0].x.toFixed(1)},${coords[0].y.toFixed(1)}`;

  for (let i = 0; i < coords.length - 1; i++) {
    const p0 = coords[Math.max(0, i - 1)];
    const p1 = coords[i];
    const p2 = coords[i + 1];
    const p3 = coords[Math.min(coords.length - 1, i + 2)];

    const cp1x = clamp(p1.x + (p2.x - p0.x) * tension, p1.x, p2.x);
    const cp1y = clamp(p1.y + (p2.y - p0.y) * tension, Math.min(p1.y, p2.y), Math.max(p1.y, p2.y));
    const cp2x = clamp(p2.x - (p3.x - p1.x) * tension, p1.x, p2.x);
    const cp2y = clamp(p2.y - (p3.y - p1.y) * tension, Math.min(p1.y, p2.y), Math.max(p1.y, p2.y));

    path += ` C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }

  return path;
}

function truncTitle(t: string, max: number = 14): string {
  return t.length > max ? t.slice(0, max - 1) + '\u2026' : t;
}

/** @internal Exported for testing */
export function GrowthChart({ sessions, totalLoc, totalFiles, onSessionClick }: GrowthChartProps) {
  if (sessions.length === 0) {
    return (
      <div className="growth-chart">
        <div className="growth-chart__svg-container">
          <p style={{ color: 'var(--on-surface-variant)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
            No session data available for growth chart.
          </p>
        </div>
        <div className="growth-chart__summary">
          <div className="growth-chart__total-value">0</div>
          <div className="growth-chart__total-label">LINES OF CODE</div>
        </div>
      </div>
    );
  }

  const dated = sessions.filter((s) => s.date);
  if (dated.length === 0) {
    return (
      <div className="growth-chart">
        <div className="growth-chart__svg-container">
          <p style={{ color: 'var(--on-surface-variant)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
            No dated sessions available for growth chart.
          </p>
        </div>
        <div className="growth-chart__summary">
          <div className="growth-chart__total-value">{formatLoc(totalLoc)}</div>
          <div className="growth-chart__total-label">LINES OF CODE</div>
        </div>
      </div>
    );
  }

  const sortedSessions = [...dated].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const { points, boundaries, totalVisualTime } = buildGrowthTimeSeries(dated);

  if (points.length === 0) {
    return (
      <div className="growth-chart">
        <div className="growth-chart__svg-container">
          <p style={{ color: 'var(--on-surface-variant)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
            No dated sessions available for growth chart.
          </p>
        </div>
        <div className="growth-chart__summary">
          <div className="growth-chart__total-value">{formatLoc(totalLoc)}</div>
          <div className="growth-chart__total-label">LINES OF CODE</div>
        </div>
      </div>
    );
  }

  const maxLoc = Math.max(...points.map((p) => p.cumulativeLoc), 1);
  const ticks = computeAxisTicks(maxLoc);
  const axisMax = ticks[ticks.length - 1] || 1;

  const baseWidth = 600;
  const widthPerMinute = 0.8;
  const svgWidth = Math.max(baseWidth, Math.round(totalVisualTime / 60000 * widthPerMinute) + 120);
  const svgHeight = 260;
  const padLeft = 48;
  const padRight = 16;
  const padTop = 32;
  const padBottom = 48;
  const chartW = svgWidth - padLeft - padRight;
  const chartH = svgHeight - padTop - padBottom;

  const maxVisualTime = totalVisualTime || 1;
  const toX = (vt: number) => padLeft + (vt / maxVisualTime) * chartW;
  const toY = (val: number) => padTop + chartH - (val / axisMax) * chartH;

  const coords = points.map((p) => ({ x: toX(p.visualTime), y: toY(p.cumulativeLoc) }));
  const linePath = buildSmoothPath(coords);

  const lastCoord = coords[coords.length - 1];
  const firstCoord = coords[0];
  const areaPath =
    linePath +
    ` L${lastCoord.x.toFixed(1)},${(padTop + chartH).toFixed(1)}` +
    ` L${firstCoord.x.toFixed(1)},${(padTop + chartH).toFixed(1)} Z`;

  const uniqueBoundaries = boundaries.filter(
    (b, i) => i === 0 || Math.abs(b.visualTime - boundaries[i - 1].visualTime) > 0.001,
  );

  // Thin x-axis labels: only show labels with enough pixel clearance
  const MIN_LABEL_GAP_PX = 80;
  const labelledIndices = new Set<number>();
  if (uniqueBoundaries.length > 0) {
    labelledIndices.add(0);
    labelledIndices.add(uniqueBoundaries.length - 1);
    let lastX = toX(uniqueBoundaries[0].visualTime);
    for (let i = 1; i < uniqueBoundaries.length - 1; i++) {
      const x = toX(uniqueBoundaries[i].visualTime);
      if (x - lastX >= MIN_LABEL_GAP_PX) {
        labelledIndices.add(i);
        lastX = x;
      }
    }
    // Ensure last label doesn't overlap the previous labelled one
    if (uniqueBoundaries.length > 1) {
      const lastBx = toX(uniqueBoundaries[uniqueBoundaries.length - 1].visualTime);
      const prevLabelled = [...labelledIndices].filter(i => i < uniqueBoundaries.length - 1).sort((a, b) => b - a)[0];
      if (prevLabelled !== undefined && lastBx - toX(uniqueBoundaries[prevLabelled].visualTime) < MIN_LABEL_GAP_PX) {
        labelledIndices.delete(prevLabelled);
      }
    }
  }

  const sessionCount = dated.length;
  const isScrollable = svgWidth > baseWidth;

  return (
    <div className="growth-chart">
      <div
        className="growth-chart__svg-container"
        style={isScrollable ? { overflowX: 'auto' } : undefined}
      >
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          width={isScrollable ? svgWidth : '100%'}
          height={isScrollable ? svgHeight : undefined}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={`Growth chart showing cumulative lines of code across ${sessionCount} sessions`}
        >
          {ticks.map((tick) => (
            <g key={`y-${tick}`}>
              <line x1={padLeft} y1={toY(tick)} x2={svgWidth - padRight} y2={toY(tick)} stroke="var(--outline-variant)" strokeWidth="0.5" strokeDasharray="4,4" />
              <text x={padLeft - 8} y={toY(tick) + 3} textAnchor="end" fontFamily="var(--font-mono)" fontSize="9" fill="var(--on-surface-variant)">{formatLocAxis(tick)}</text>
            </g>
          ))}

          {uniqueBoundaries.map((b, i) => {
            const showLabel = labelledIndices.has(i);
            const clickable = onSessionClick && sortedSessions[b.sessionIndex];
            return (
              <g key={`boundary-${i}`} style={clickable && showLabel ? { cursor: 'pointer' } : undefined} onClick={clickable && showLabel ? () => onSessionClick(sortedSessions[b.sessionIndex]) : undefined}>
                {showLabel && <line x1={toX(b.visualTime)} y1={padTop} x2={toX(b.visualTime)} y2={padTop + chartH} stroke="var(--outline-variant)" strokeWidth="0.5" strokeDasharray="3,3" />}
                {showLabel && <text x={toX(b.visualTime)} y={padTop + chartH + 16} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="8" fill={clickable ? 'var(--primary)' : 'var(--on-surface-variant)'} textDecoration={clickable ? 'underline' : undefined}>{truncTitle(b.title)}</text>}
              </g>
            );
          })}

          <path d={areaPath} fill="rgba(8,68,113,0.06)" />
          <path d={linePath} fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

          {uniqueBoundaries.map((b, i) => {
            if (!labelledIndices.has(i)) return null;
            const sessionPts = points.filter((p) => p.sessionIndex === b.sessionIndex);
            if (sessionPts.length === 0) return null;
            const lastPt = sessionPts[sessionPts.length - 1];
            const firstPt = sessionPts[0];
            const delta = lastPt.cumulativeLoc - firstPt.cumulativeLoc +
              (firstPt === points[0] ? firstPt.cumulativeLoc : 0);
            return (
              <g key={`dot-${i}`}>
                <circle cx={toX(lastPt.visualTime)} cy={toY(lastPt.cumulativeLoc)} r="3" fill="var(--secondary)" />
                {delta > 0 && (
                  <text x={toX(lastPt.visualTime)} y={toY(lastPt.cumulativeLoc) - 8} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="8" fill="var(--secondary)">{formatLocDelta(delta)}</text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <div className="growth-chart__summary">
        <div className="growth-chart__total-value">{formatLoc(totalLoc)}</div>
        <div className="growth-chart__total-label">LINES OF CODE</div>
        <div className="growth-chart__stat">
          <div className="growth-chart__stat-value">{totalFiles}</div>
          <div className="growth-chart__stat-label">FILES TOUCHED</div>
        </div>
        <div className="growth-chart__stat">
          <div className="growth-chart__stat-value">{sessionCount}</div>
          <div className="growth-chart__stat-label">SESSIONS</div>
        </div>
      </div>
    </div>
  );
}
