import { useRef, useCallback } from 'react';
import type { Session, ChildSessionSummary } from '../types';

export interface WorkTimelineProps {
  sessions: Session[];
  /** Called when a session bar is clicked */
  onSessionClick?: (session: Session) => void;
}

// ── Color mapping (shared with AgentTimeline) ──────────────────

const AGENT_COLORS: Record<string, string> = {
  main: '#084471',
  orchestrator: '#084471',
  'frontend-dev': '#7c3aed',
  frontend: '#7c3aed',
  'backend-dev': '#0891b2',
  backend: '#0891b2',
  'qa-engineer': '#059669',
  qa: '#059669',
  'ux-designer': '#d97706',
  ux: '#d97706',
  'product-manager': '#dc2626',
  pm: '#dc2626',
  'security-engineer': '#6b7280',
  'team-lead': '#6b7280',
  explore: '#94a3b8',
};

const DEFAULT_COLOR = '#6b7280';
const MAIN_COLOR = '#084471';

// SVG text cannot resolve CSS custom properties, so use literal font family
const SVG_FONT = "'IBM Plex Mono', monospace";

function getAgentColor(role?: string): string {
  if (!role) return DEFAULT_COLOR;
  return AGENT_COLORS[role.toLowerCase()] ?? DEFAULT_COLOR;
}

// ── Time helpers ───────────────────────────────────────────────

function getSessionStart(s: Session): number {
  return new Date(s.date).getTime();
}

function getSessionEnd(s: Session): number {
  if (s.endTime) return new Date(s.endTime).getTime();
  return getSessionStart(s) + s.durationMinutes * 60_000;
}

function formatGap(ms: number): string {
  const hours = ms / 3_600_000;
  if (hours < 20) {
    const h = Math.round(hours);
    return `${h}h`;
  }
  const days = Math.round(hours / 24);
  if (days < 1) return `${Math.round(hours)}h`;
  return days === 1 ? '1 day' : `${days} days`;
}

function formatDateLabel(ms: number): string {
  const d = new Date(ms);
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

function formatTimeLabel(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ── Segment computation ────────────────────────────────────────

const GAP_THRESHOLD_MS = 60 * 60_000; // 1 hour
const GAP_PX = 56;
const PX_PER_MINUTE = 5;
const MIN_SESSION_WIDTH = 90;

interface SessionSegment {
  type: 'session';
  session: Session;
  startMs: number;
  endMs: number;
}

/** Multiple sessions running at the same time */
interface ConcurrentSegment {
  type: 'concurrent';
  sessions: Session[];
  startMs: number;
  endMs: number;
}

interface GapSegment {
  type: 'gap';
  durationMs: number;
}

type Segment = SessionSegment | ConcurrentSegment | GapSegment;

/**
 * Cluster overlapping sessions into groups.
 * Uses a sweep-line: sessions that overlap with any session in the current
 * cluster (by start < clusterEnd) get merged into the same cluster.
 */
function clusterOverlapping(
  sorted: Session[],
): Array<{ sessions: Session[]; startMs: number; endMs: number }> {
  const clusters: Array<{ sessions: Session[]; startMs: number; endMs: number }> = [];
  let current: { sessions: Session[]; startMs: number; endMs: number } | null = null;

  for (const s of sorted) {
    const start = getSessionStart(s);
    const end = getSessionEnd(s);

    if (!current || start >= current.endMs) {
      if (current) clusters.push(current);
      current = { sessions: [s], startMs: start, endMs: end };
    } else {
      current.sessions.push(s);
      if (end > current.endMs) current.endMs = end;
    }
  }

  if (current) clusters.push(current);
  return clusters;
}

export function computeSegments(sessions: Session[]): Segment[] {
  if (sessions.length === 0) return [];

  const sorted = [...sessions].sort(
    (a, b) => getSessionStart(a) - getSessionStart(b),
  );

  const clusters = clusterOverlapping(sorted);
  const segments: Segment[] = [];

  for (let i = 0; i < clusters.length; i++) {
    const cluster = clusters[i];

    if (i > 0) {
      const prevEnd = clusters[i - 1].endMs;
      const gapMs = cluster.startMs - prevEnd;
      if (gapMs > GAP_THRESHOLD_MS) {
        segments.push({ type: 'gap', durationMs: gapMs });
      }
    }

    if (cluster.sessions.length === 1) {
      const s = cluster.sessions[0];
      segments.push({
        type: 'session',
        session: s,
        startMs: cluster.startMs,
        endMs: cluster.endMs,
      });
    } else {
      segments.push({
        type: 'concurrent',
        sessions: cluster.sessions,
        startMs: cluster.startMs,
        endMs: cluster.endMs,
      });
    }
  }

  return segments;
}

// ── Determine if all sessions are same-day ─────────────────────

function isSameDay(ms1: number, ms2: number): boolean {
  const d1 = new Date(ms1);
  const d2 = new Date(ms2);
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

interface DateTick {
  label: string;
  x: number;
}

// ── Layout constants ────────────────────────────────────────────

const PADDING_LEFT = 32;
const PADDING_RIGHT = 32;
const LABEL_AREA_TOP = 36;
const AXIS_AREA_BOTTOM = 28;
const LANE_SPACING = 24;
const FORK_INSET = 24;
const CURVE_DX = 18;

/**
 * Get the number of fork lanes a session needs.
 * Uses childSessions (full data) first, then children (summaries), then childCount.
 */
function getChildLaneCount(session: Session): number {
  if (session.childSessions && session.childSessions.length > 0) return session.childSessions.length;
  if (session.children && session.children.length > 0) return session.children.length;
  return 0;
}

/**
 * Get the renderable children for fork/join — prefers full childSessions,
 * falls back to children summaries.
 */
function getRenderableChildren(session: Session): Array<{
  id: string;
  role?: string;
  durationMinutes: number;
  linesOfCode: number;
  date?: string;
}> {
  if (session.childSessions && session.childSessions.length > 0) {
    return session.childSessions.map((c) => ({
      id: c.id,
      role: c.agentRole,
      durationMinutes: c.durationMinutes,
      linesOfCode: c.linesOfCode,
      date: c.date,
    }));
  }
  if (session.children && session.children.length > 0) {
    return session.children.map((c) => ({
      id: c.sessionId,
      role: c.role,
      durationMinutes: c.durationMinutes ?? 0,
      linesOfCode: c.linesOfCode ?? 0,
      date: c.date,
    }));
  }
  return [];
}

// ── Component ──────────────────────────────────────────────────

/** Truncate title to fit within a pixel width (rough: ~5.5px per char at 10px font) */
function truncateTitle(title: string, maxPx: number): string {
  const maxChars = Math.floor(maxPx / 5.5);
  if (title.length <= maxChars) return title;
  return title.slice(0, Math.max(maxChars - 1, 8)) + '…';
}

export function WorkTimeline({ sessions, onSessionClick }: WorkTimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollBy = useCallback((delta: number) => {
    scrollRef.current?.scrollBy({ left: delta, behavior: 'smooth' });
  }, []);

  if (sessions.length === 0) {
    return (
      <div className="work-timeline" data-testid="work-timeline-empty">
        <p style={{
          fontFamily: SVG_FONT,
          fontSize: '0.75rem',
          color: '#6b7280',
        }}>
          No sessions to display.
        </p>
      </div>
    );
  }

  const segments = computeSegments(sessions);

  // Compute total width from segments
  let totalContentWidth = 0;
  for (const seg of segments) {
    if (seg.type === 'gap') {
      totalContentWidth += GAP_PX;
    } else {
      const durationMin = (seg.endMs - seg.startMs) / 60_000;
      totalContentWidth += Math.max(durationMin * PX_PER_MINUTE, MIN_SESSION_WIDTH);
    }
  }

  const svgWidth = PADDING_LEFT + totalContentWidth + PADDING_RIGHT;

  // Compute max lanes needed for fork/join (from child sessions or concurrent sessions)
  let maxLanes = 0;
  for (const seg of segments) {
    if (seg.type === 'session') {
      const lanes = getChildLaneCount(seg.session);
      if (lanes > maxLanes) maxLanes = lanes;
    } else if (seg.type === 'concurrent') {
      if (seg.sessions.length > maxLanes) maxLanes = seg.sessions.length;
    }
  }

  // Dynamic height based on max lanes
  const baseLaneHeight = 48;
  const forkSpread = maxLanes > 0 ? maxLanes * LANE_SPACING + 16 : 0;
  const laneAreaHeight = Math.max(baseLaneHeight, forkSpread);
  const mainY = LABEL_AREA_TOP + laneAreaHeight / 2;
  const svgHeight = LABEL_AREA_TOP + laneAreaHeight + AXIS_AREA_BOTTOM;

  // Determine if same-day for time label formatting
  const allSessionSegs = segments.filter(
    (s): s is SessionSegment | ConcurrentSegment => s.type !== 'gap',
  );
  const firstMs = allSessionSegs[0].startMs;
  const lastMs = allSessionSegs[allSessionSegs.length - 1].endMs;
  const sameDay = isSameDay(firstMs, lastMs);

  // Build x-position map for segments
  interface SegmentLayout {
    seg: Segment;
    x1: number;
    x2: number;
  }

  const layouts: SegmentLayout[] = [];
  let cursor = PADDING_LEFT;

  for (const seg of segments) {
    if (seg.type === 'gap') {
      const x1 = cursor;
      const x2 = cursor + GAP_PX;
      layouts.push({ seg, x1, x2 });
      cursor = x2;
    } else {
      const durationMin = (seg.endMs - seg.startMs) / 60_000;
      const w = Math.max(durationMin * PX_PER_MINUTE, MIN_SESSION_WIDTH);
      const x1 = cursor;
      const x2 = cursor + w;
      layouts.push({ seg, x1, x2 });
      cursor = x2;
    }
  }

  // Compute date ticks
  const dateTicks: DateTick[] = [];
  for (const layout of layouts) {
    if (layout.seg.type !== 'gap') {
      dateTicks.push({
        label: sameDay ? formatTimeLabel(layout.seg.startMs) : formatDateLabel(layout.seg.startMs),
        x: layout.x1,
      });
    }
  }

  // Deduplicate date ticks that are too close
  const filteredTicks: DateTick[] = [];
  for (const tick of dateTicks) {
    const prev = filteredTicks[filteredTicks.length - 1];
    if (!prev || tick.x - prev.x > 70) {
      filteredTicks.push(tick);
    }
  }

  const needsScroll = svgWidth > 800;

  return (
    <div className="work-timeline" data-testid="work-timeline" style={{ position: 'relative' }}>
      {needsScroll && (
        <div className="work-timeline__scroll-controls">
          <button
            type="button"
            className="work-timeline__scroll-btn"
            onClick={() => scrollBy(-300)}
            aria-label="Scroll left"
          >
            &#8592;
          </button>
          <button
            type="button"
            className="work-timeline__scroll-btn"
            onClick={() => scrollBy(300)}
            aria-label="Scroll right"
          >
            &#8594;
          </button>
        </div>
      )}
      <div
        className="work-timeline__container"
        ref={scrollRef}
        style={{
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
          paddingBottom: 'var(--spacing-2, 0.5rem)',
        }}
      >
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          xmlns="http://www.w3.org/2000/svg"
          role="img"
          aria-label={`Work timeline showing ${sessions.length} sessions`}
          width={svgWidth}
          height={svgHeight}
          style={{ display: 'block' }}
        >
          {/* Time axis line */}
          <line
            x1={PADDING_LEFT}
            y1={svgHeight - AXIS_AREA_BOTTOM + 4}
            x2={svgWidth - PADDING_RIGHT}
            y2={svgHeight - AXIS_AREA_BOTTOM + 4}
            stroke="#e5e7eb"
            strokeWidth={1}
            data-testid="axis-line"
          />

          {/* Date/time tick labels */}
          {filteredTicks.map((tick, i) => (
            <g key={i} data-testid="axis-tick">
              <line
                x1={tick.x}
                y1={svgHeight - AXIS_AREA_BOTTOM + 1}
                x2={tick.x}
                y2={svgHeight - AXIS_AREA_BOTTOM + 7}
                stroke="#d1d5db"
                strokeWidth={1}
              />
              <text
                x={tick.x}
                y={svgHeight - 6}
                fontFamily={SVG_FONT}
                fontSize={8}
                fill="#9ca3af"
                textAnchor="start"
              >
                {tick.label}
              </text>
            </g>
          ))}

          {/* Render each segment */}
          {layouts.map((layout, i) => {
            if (layout.seg.type === 'gap') {
              return (
                <g key={`gap-${i}`} data-testid="gap-segment">
                  <line
                    x1={layout.x1 + 4}
                    y1={mainY}
                    x2={layout.x2 - 4}
                    y2={mainY}
                    stroke="#d1d5db"
                    strokeWidth={1.5}
                    strokeDasharray="4,4"
                  />
                  <text
                    x={(layout.x1 + layout.x2) / 2}
                    y={mainY - 8}
                    fontFamily={SVG_FONT}
                    fontSize={8}
                    fontStyle="italic"
                    fill="#9ca3af"
                    textAnchor="middle"
                    data-testid="gap-label"
                  >
                    {formatGap(layout.seg.durationMs)}
                  </text>
                </g>
              );
            }

            if (layout.seg.type === 'concurrent') {
              return (
                <ConcurrentSessionBar
                  key={`concurrent-${i}`}
                  x1={layout.x1}
                  x2={layout.x2}
                  mainY={mainY}
                  sessions={layout.seg.sessions}
                  clusterStartMs={layout.seg.startMs}
                  clusterEndMs={layout.seg.endMs}
                  onSessionClick={onSessionClick}
                />
              );
            }

            const seg = layout.seg;
            const session = seg.session;
            const renderableChildren = getRenderableChildren(session);
            const childCount = session.childCount ?? session.children?.length ?? 0;
            const hasChildren = renderableChildren.length > 0;
            const isMultiAgent = hasChildren || childCount > 0;

            const durationLabel = `${session.durationMinutes}m`;
            const locLabel = session.linesOfCode > 0 ? `${session.linesOfCode} LOC` : '';
            const subtitle = [durationLabel, locLabel].filter(Boolean).join(' \u00b7 ');

            // Compute label Y: push up when fork/join lanes exist
            const labelOffsetY = hasChildren ? renderableChildren.length * LANE_SPACING / 2 + 18 : 18;

            return (
              <g
                key={`session-${i}`}
                data-testid="session-segment"
                style={onSessionClick ? { cursor: 'pointer' } : undefined}
                onClick={onSessionClick ? () => onSessionClick(session) : undefined}
                role={onSessionClick ? 'button' : undefined}
                tabIndex={onSessionClick ? 0 : undefined}
                onKeyDown={onSessionClick ? (e) => { if (e.key === 'Enter') onSessionClick(session); } : undefined}
                aria-label={`${session.title}, ${durationLabel}${childCount > 0 ? `, ${childCount} agents` : ''}`}
              >
                {/* Title above bar */}
                <text
                  x={layout.x1 + 6}
                  y={mainY - labelOffsetY}
                  fontFamily={SVG_FONT}
                  fontSize={10}
                  fontWeight={600}
                  fill="#191c1e"
                  data-testid="session-title"
                >
                  {truncateTitle(session.title, layout.x2 - layout.x1 - 12)}
                </text>
                <text
                  x={layout.x1 + 6}
                  y={mainY - labelOffsetY + 12}
                  fontFamily={SVG_FONT}
                  fontSize={8}
                  fill="#6b7280"
                  data-testid="session-subtitle"
                >
                  {subtitle}
                </text>

                {hasChildren ? (
                  <ForkJoinBar
                    x1={layout.x1}
                    x2={layout.x2}
                    mainY={mainY}
                    children={renderableChildren}
                  />
                ) : isMultiAgent ? (
                  <ThickAgentBar
                    x1={layout.x1}
                    x2={layout.x2}
                    mainY={mainY}
                    agentCount={childCount}
                  />
                ) : (
                  <SingleBar
                    x1={layout.x1}
                    x2={layout.x2}
                    mainY={mainY}
                  />
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

// ── Single session bar ─────────────────────────────────────────

function SingleBar({ x1, x2, mainY }: { x1: number; x2: number; mainY: number }) {
  return (
    <g data-testid="single-bar">
      <circle cx={x1} cy={mainY} r={4} fill="none" stroke={MAIN_COLOR} strokeWidth={1.5} />
      <line x1={x1} y1={mainY} x2={x2} y2={mainY} stroke={MAIN_COLOR} strokeWidth={2.5} strokeLinecap="round" />
      <circle cx={x2} cy={mainY} r={4} fill={MAIN_COLOR} />
    </g>
  );
}

// ── Thick bar for unloaded multi-agent (count only, no timing data) ──

function ThickAgentBar({
  x1, x2, mainY, agentCount,
}: {
  x1: number; x2: number; mainY: number; agentCount: number;
}) {
  return (
    <g data-testid="thick-bar">
      <circle cx={x1} cy={mainY} r={4} fill="none" stroke={MAIN_COLOR} strokeWidth={1.5} />
      <line x1={x1} y1={mainY} x2={x2} y2={mainY} stroke={MAIN_COLOR} strokeWidth={4.5} strokeLinecap="round" />
      <circle cx={x2} cy={mainY} r={4} fill={MAIN_COLOR} />
      <text
        x={(x1 + x2) / 2}
        y={mainY + 18}
        fontFamily={SVG_FONT}
        fontSize={8}
        fill="#6b7280"
        textAnchor="middle"
        data-testid="agent-count-badge"
      >
        ({agentCount} agents)
      </text>
    </g>
  );
}

// ── Fork/join bar for multi-agent sessions ──────────────────────

interface RenderableChild {
  id: string;
  role?: string;
  durationMinutes: number;
  linesOfCode: number;
  date?: string;
}

function ForkJoinBar({
  x1, x2, mainY, children,
}: {
  x1: number; x2: number; mainY: number; children: RenderableChild[];
}) {
  const sorted = [...children].sort((a, b) => {
    // Sort by date if available, otherwise keep original order
    if (a.date && b.date) return new Date(a.date).getTime() - new Date(b.date).getTime();
    return 0;
  });

  const n = sorted.length;
  const totalH = (n - 1) * LANE_SPACING;

  // Fork/join points
  const forkX = x1 + FORK_INSET;
  const joinX = x2 - FORK_INSET;
  const laneStartX = forkX + CURVE_DX + 4;
  const laneEndX = joinX - CURVE_DX - 4;
  const laneWidth = Math.max(laneEndX - laneStartX, 20);

  // Compute proportional widths for each child
  const maxDuration = Math.max(...sorted.map((c) => c.durationMinutes), 1);

  return (
    <g data-testid="multi-agent-bar">
      {/* Main line before fork */}
      <circle cx={x1} cy={mainY} r={4} fill="none" stroke={MAIN_COLOR} strokeWidth={1.5} />
      <line x1={x1} y1={mainY} x2={forkX} y2={mainY} stroke={MAIN_COLOR} strokeWidth={2.5} strokeLinecap="round" />

      {/* Fork dot */}
      <circle cx={forkX} cy={mainY} r={4} fill={MAIN_COLOR} data-testid="fork-dot" />

      {/* Child lanes */}
      {sorted.map((child, i) => {
        const laneY = mainY - totalH / 2 + i * LANE_SPACING;
        const color = getAgentColor(child.role);
        const childLaneWidth = Math.max(24, (child.durationMinutes / maxDuration) * laneWidth);

        return (
          <g key={child.id || i} data-testid="child-lane">
            {/* Fork curve */}
            <path
              d={`M${forkX},${mainY} C${forkX + CURVE_DX},${mainY} ${forkX + CURVE_DX},${laneY} ${laneStartX},${laneY}`}
              stroke={color}
              strokeWidth={1.5}
              fill="none"
              strokeDasharray="4,3"
            />

            {/* Lane background */}
            <rect
              x={laneStartX}
              y={laneY - 10}
              rx={2}
              ry={2}
              width={childLaneWidth}
              height={20}
              fill={color}
              opacity={0.06}
            />

            {/* Lane line */}
            <line
              x1={laneStartX}
              y1={laneY}
              x2={laneStartX + childLaneWidth}
              y2={laneY}
              stroke={color}
              strokeWidth={2.5}
              strokeLinecap="round"
            />

            {/* Role label to the right */}
            <text
              x={laneStartX + childLaneWidth + 6}
              y={laneY + 3}
              fontFamily={SVG_FONT}
              fontSize={8}
              fill={color}
              fontWeight={600}
              data-testid="child-role-label"
            >
              {(child.role ?? 'agent').toUpperCase()}
            </text>

            {/* Join curve */}
            <path
              d={`M${laneStartX + childLaneWidth},${laneY} C${joinX - CURVE_DX},${laneY} ${joinX - CURVE_DX},${mainY} ${joinX},${mainY}`}
              stroke={color}
              strokeWidth={1.5}
              fill="none"
              strokeDasharray="4,3"
            />
          </g>
        );
      })}

      {/* Join dot */}
      <circle cx={joinX} cy={mainY} r={4} fill={MAIN_COLOR} data-testid="join-dot" />

      {/* Main line after join */}
      <line x1={joinX} y1={mainY} x2={x2} y2={mainY} stroke={MAIN_COLOR} strokeWidth={2.5} strokeLinecap="round" />
      <circle cx={x2} cy={mainY} r={4} fill={MAIN_COLOR} />
    </g>
  );
}

// ── Concurrent top-level sessions (overlapping in time) ─────────

const CONCURRENT_COLORS = ['#084471', '#7c3aed', '#0891b2', '#059669', '#d97706', '#dc2626'];

function ConcurrentSessionBar({
  x1, x2, mainY, sessions, clusterStartMs, clusterEndMs, onSessionClick,
}: {
  x1: number; x2: number; mainY: number;
  sessions: Session[];
  clusterStartMs: number; clusterEndMs: number;
  onSessionClick?: (session: Session) => void;
}) {
  const sorted = [...sessions].sort(
    (a, b) => getSessionStart(a) - getSessionStart(b),
  );

  const n = sorted.length;
  const totalH = (n - 1) * LANE_SPACING;
  const forkX = x1 + 12;
  const joinX = x2 - 12;
  const laneAreaWidth = joinX - forkX - CURVE_DX * 2 - 8;
  const clusterDurationMs = clusterEndMs - clusterStartMs;

  return (
    <g data-testid="concurrent-segment">
      {/* Main line into fork */}
      <circle cx={x1} cy={mainY} r={4} fill="none" stroke={MAIN_COLOR} strokeWidth={1.5} />
      <line x1={x1} y1={mainY} x2={forkX} y2={mainY} stroke={MAIN_COLOR} strokeWidth={2.5} strokeLinecap="round" />
      <circle cx={forkX} cy={mainY} r={4} fill={MAIN_COLOR} data-testid="concurrent-fork" />

      {/* Session lanes */}
      {sorted.map((session, i) => {
        const laneY = mainY - totalH / 2 + i * LANE_SPACING;
        const color = CONCURRENT_COLORS[i % CONCURRENT_COLORS.length];

        // Position lane proportionally within the cluster time range
        const sessionStart = getSessionStart(session);
        const sessionEnd = getSessionEnd(session);
        const startFrac = clusterDurationMs > 0 ? (sessionStart - clusterStartMs) / clusterDurationMs : 0;
        const endFrac = clusterDurationMs > 0 ? (sessionEnd - clusterStartMs) / clusterDurationMs : 1;
        const laneStartX = forkX + CURVE_DX + 4 + startFrac * laneAreaWidth;
        const laneEndX = forkX + CURVE_DX + 4 + endFrac * laneAreaWidth;
        const laneW = Math.max(laneEndX - laneStartX, 20);

        const durationLabel = `${session.durationMinutes}m`;
        const locLabel = session.linesOfCode > 0 ? `${session.linesOfCode} LOC` : '';
        const subtitle = [durationLabel, locLabel].filter(Boolean).join(' · ');

        return (
          <g
            key={session.id || i}
            data-testid="concurrent-lane"
            style={onSessionClick ? { cursor: 'pointer' } : undefined}
            onClick={onSessionClick ? (e) => { e.stopPropagation(); onSessionClick(session); } : undefined}
            role={onSessionClick ? 'button' : undefined}
            tabIndex={onSessionClick ? 0 : undefined}
          >
            {/* Fork curve from main line to lane */}
            <path
              d={`M${forkX},${mainY} C${forkX + CURVE_DX},${mainY} ${forkX + CURVE_DX},${laneY} ${laneStartX},${laneY}`}
              stroke={color}
              strokeWidth={1.5}
              fill="none"
              strokeDasharray="4,3"
            />

            {/* Lane background */}
            <rect
              x={laneStartX}
              y={laneY - 10}
              rx={2}
              ry={2}
              width={laneW}
              height={20}
              fill={color}
              opacity={0.06}
            />

            {/* Lane bar */}
            <line
              x1={laneStartX}
              y1={laneY}
              x2={laneStartX + laneW}
              y2={laneY}
              stroke={color}
              strokeWidth={2.5}
              strokeLinecap="round"
            />

            {/* Session title to the left */}
            <text
              x={laneStartX - 4}
              y={laneY + 3}
              fontFamily={SVG_FONT}
              fontSize={8}
              fontWeight={600}
              fill={color}
              textAnchor="end"
              data-testid="concurrent-title"
            >
              {session.title.length > 30 ? session.title.slice(0, 28) + '…' : session.title}
            </text>

            {/* Stats after the lane */}
            <text
              x={laneStartX + laneW + 6}
              y={laneY + 3}
              fontFamily={SVG_FONT}
              fontSize={7}
              fill="#9ca3af"
            >
              {subtitle}
            </text>

            {/* Join curve from lane to main line */}
            <path
              d={`M${laneStartX + laneW},${laneY} C${joinX - CURVE_DX},${laneY} ${joinX - CURVE_DX},${mainY} ${joinX},${mainY}`}
              stroke={color}
              strokeWidth={1.5}
              fill="none"
              strokeDasharray="4,3"
            />
          </g>
        );
      })}

      {/* Join dot */}
      <circle cx={joinX} cy={mainY} r={4} fill={MAIN_COLOR} data-testid="concurrent-join" />

      {/* Main line out */}
      <line x1={joinX} y1={mainY} x2={x2} y2={mainY} stroke={MAIN_COLOR} strokeWidth={2.5} strokeLinecap="round" />
      <circle cx={x2} cy={mainY} r={4} fill={MAIN_COLOR} />
    </g>
  );
}
