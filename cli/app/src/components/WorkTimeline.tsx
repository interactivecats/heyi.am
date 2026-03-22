import type { Session } from '../types';

export interface WorkTimelineProps {
  sessions: Session[];
  /** Height in pixels per session lane */
  laneHeight?: number;
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
const GAP_PX = 40;
const PX_PER_MINUTE = 4;

interface SessionSegment {
  type: 'session';
  session: Session;
  startMs: number;
  endMs: number;
}

interface GapSegment {
  type: 'gap';
  durationMs: number;
}

type Segment = SessionSegment | GapSegment;

export function computeSegments(sessions: Session[]): Segment[] {
  if (sessions.length === 0) return [];

  const sorted = [...sessions].sort(
    (a, b) => getSessionStart(a) - getSessionStart(b),
  );

  const segments: Segment[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const s = sorted[i];
    const startMs = getSessionStart(s);
    const endMs = getSessionEnd(s);

    if (i > 0) {
      const prevEnd = getSessionEnd(sorted[i - 1]);
      const gapMs = startMs - prevEnd;
      if (gapMs > GAP_THRESHOLD_MS) {
        segments.push({ type: 'gap', durationMs: gapMs });
      }
    }

    segments.push({ type: 'session', session: s, startMs, endMs });
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

// ── Compute date tick marks for axis ───────────────────────────

interface DateTick {
  label: string;
  x: number;
}

// ── Component ──────────────────────────────────────────────────

const PADDING_LEFT = 20;
const PADDING_RIGHT = 20;
const LABEL_AREA_TOP = 16;
const AXIS_AREA_BOTTOM = 28;

export function WorkTimeline({ sessions, laneHeight = 80 }: WorkTimelineProps) {
  if (sessions.length === 0) {
    return (
      <div className="work-timeline" data-testid="work-timeline-empty">
        <p style={{
          fontFamily: "var(--font-mono), 'IBM Plex Mono', monospace",
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
      totalContentWidth += Math.max(durationMin * PX_PER_MINUTE, 60);
    }
  }

  const svgWidth = PADDING_LEFT + totalContentWidth + PADDING_RIGHT;

  // Compute max lanes needed for fork/join
  let maxChildLanes = 0;
  for (const seg of segments) {
    if (seg.type === 'session') {
      const children = seg.session.childSessions ?? [];
      if (children.length > maxChildLanes) maxChildLanes = children.length;
    }
  }

  const mainY = LABEL_AREA_TOP + laneHeight / 2;
  const forkLaneSpacing = Math.min(20, (laneHeight - 20) / Math.max(maxChildLanes, 1));
  const svgHeight = LABEL_AREA_TOP + laneHeight + AXIS_AREA_BOTTOM;

  // Determine if same-day for time label formatting
  const allSessionSegs = segments.filter(
    (s): s is SessionSegment => s.type === 'session',
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
      const w = Math.max(durationMin * PX_PER_MINUTE, 60);
      const x1 = cursor;
      const x2 = cursor + w;
      layouts.push({ seg, x1, x2 });
      cursor = x2;
    }
  }

  // Compute date ticks
  const dateTicks: DateTick[] = [];
  for (const layout of layouts) {
    if (layout.seg.type === 'session') {
      const seg = layout.seg;
      dateTicks.push({
        label: sameDay ? formatTimeLabel(seg.startMs) : formatDateLabel(seg.startMs),
        x: layout.x1,
      });
    }
  }

  // Deduplicate date ticks that are too close
  const filteredTicks: DateTick[] = [];
  for (const tick of dateTicks) {
    const prev = filteredTicks[filteredTicks.length - 1];
    if (!prev || tick.x - prev.x > 50) {
      filteredTicks.push(tick);
    }
  }

  return (
    <div className="work-timeline" data-testid="work-timeline">
      <div className="work-timeline__container" style={{
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
        paddingBottom: 'var(--spacing-2, 0.5rem)',
      }}>
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          xmlns="http://www.w3.org/2000/svg"
          role="img"
          aria-label="Work timeline across sessions"
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
                fontFamily="var(--font-mono), 'IBM Plex Mono', monospace"
                fontSize={9}
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
                    stroke="#9ca3af"
                    strokeWidth={1.5}
                    strokeDasharray="4,4"
                  />
                  <text
                    x={(layout.x1 + layout.x2) / 2}
                    y={mainY - 8}
                    fontFamily="var(--font-mono), 'IBM Plex Mono', monospace"
                    fontSize={8}
                    fill="#9ca3af"
                    textAnchor="middle"
                    data-testid="gap-label"
                  >
                    {formatGap(layout.seg.durationMs)}
                  </text>
                </g>
              );
            }

            const seg = layout.seg;
            const session = seg.session;
            const children = session.childSessions ?? [];
            const childCount = session.childCount ?? session.children?.length ?? 0;
            const hasLoadedChildren = children.length > 0;
            const isMultiAgent = hasLoadedChildren || childCount > 0;

            const durationLabel = `${session.durationMinutes}m`;
            const locLabel = session.linesOfCode > 0 ? `${session.linesOfCode} LOC` : '';
            const subtitle = [durationLabel, locLabel].filter(Boolean).join(' \u00b7 ');

            return (
              <g key={`session-${i}`} data-testid="session-segment">
                {/* Title above bar */}
                <text
                  x={layout.x1 + 6}
                  y={mainY - (isMultiAgent && hasLoadedChildren ? maxChildLanes * forkLaneSpacing / 2 + 14 : 14)}
                  fontFamily="var(--font-mono), 'IBM Plex Mono', monospace"
                  fontSize={9}
                  fontWeight={600}
                  fill="#1f2937"
                  data-testid="session-title"
                >
                  {session.title}
                </text>
                <text
                  x={layout.x1 + 6}
                  y={mainY - (isMultiAgent && hasLoadedChildren ? maxChildLanes * forkLaneSpacing / 2 + 5 : 5)}
                  fontFamily="var(--font-mono), 'IBM Plex Mono', monospace"
                  fontSize={7.5}
                  fill="#6b7280"
                  data-testid="session-subtitle"
                >
                  {subtitle}
                </text>

                {hasLoadedChildren ? (
                  <MultiAgentBar
                    x1={layout.x1}
                    x2={layout.x2}
                    mainY={mainY}
                    children={children}
                    laneSpacing={forkLaneSpacing}
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
      <line x1={x1} y1={mainY} x2={x2} y2={mainY} stroke={MAIN_COLOR} strokeWidth={2} strokeLinecap="round" />
      <circle cx={x2} cy={mainY} r={4} fill={MAIN_COLOR} />
    </g>
  );
}

// ── Thick bar for unloaded multi-agent ─────────────────────────

function ThickAgentBar({
  x1, x2, mainY, agentCount,
}: {
  x1: number; x2: number; mainY: number; agentCount: number;
}) {
  return (
    <g data-testid="thick-bar">
      <circle cx={x1} cy={mainY} r={4} fill="none" stroke={MAIN_COLOR} strokeWidth={1.5} />
      <line x1={x1} y1={mainY} x2={x2} y2={mainY} stroke={MAIN_COLOR} strokeWidth={4} strokeLinecap="round" />
      <circle cx={x2} cy={mainY} r={4} fill={MAIN_COLOR} />
      <text
        x={(x1 + x2) / 2}
        y={mainY + 16}
        fontFamily="var(--font-mono), 'IBM Plex Mono', monospace"
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

// ── Multi-agent bar with fork/join ─────────────────────────────

function MultiAgentBar({
  x1, x2, mainY, children, laneSpacing,
}: {
  x1: number; x2: number; mainY: number; children: Session[]; laneSpacing: number;
}) {
  const sorted = [...children].sort(
    (a, b) => getSessionStart(a) - getSessionStart(b),
  );

  const n = sorted.length;
  const totalH = (n - 1) * laneSpacing;
  const curveDx = 15;

  // Fork/join points
  const forkX = x1 + 20;
  const joinX = x2 - 20;
  const laneStartX = forkX + curveDx + 4;
  const laneEndX = joinX - curveDx - 4;
  const laneWidth = laneEndX - laneStartX;

  // Compute proportional widths for each child
  const maxDuration = Math.max(...sorted.map((c) => c.durationMinutes), 1);

  return (
    <g data-testid="multi-agent-bar">
      {/* Main line before fork */}
      <circle cx={x1} cy={mainY} r={4} fill="none" stroke={MAIN_COLOR} strokeWidth={1.5} />
      <line x1={x1} y1={mainY} x2={forkX} y2={mainY} stroke={MAIN_COLOR} strokeWidth={2} strokeLinecap="round" />

      {/* Fork dot */}
      <circle cx={forkX} cy={mainY} r={3} fill={MAIN_COLOR} data-testid="fork-dot" />

      {/* Child lanes */}
      {sorted.map((child, i) => {
        const laneY = mainY - totalH / 2 + i * laneSpacing;
        const color = getAgentColor(child.agentRole);
        const childLaneWidth = Math.max(20, (child.durationMinutes / maxDuration) * laneWidth);

        return (
          <g key={child.id || i} data-testid="child-lane">
            {/* Fork curve */}
            <path
              d={`M${forkX},${mainY} C${forkX + curveDx},${mainY} ${forkX + curveDx},${laneY} ${laneStartX},${laneY}`}
              stroke={color}
              strokeWidth={1.5}
              fill="none"
              strokeDasharray="4,3"
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

            {/* Role label */}
            <text
              x={laneStartX + childLaneWidth + 6}
              y={laneY + 3}
              fontFamily="var(--font-mono), 'IBM Plex Mono', monospace"
              fontSize={7.5}
              fill={color}
              fontWeight={600}
              data-testid="child-role-label"
            >
              {(child.agentRole ?? 'agent').toUpperCase()}
            </text>

            {/* Join curve */}
            <path
              d={`M${laneStartX + childLaneWidth},${laneY} C${joinX - curveDx},${laneY} ${joinX - curveDx},${mainY} ${joinX},${mainY}`}
              stroke={color}
              strokeWidth={1.5}
              fill="none"
              strokeDasharray="4,3"
            />
          </g>
        );
      })}

      {/* Join dot */}
      <circle cx={joinX} cy={mainY} r={3} fill={MAIN_COLOR} data-testid="join-dot" />

      {/* Main line after join */}
      <line x1={joinX} y1={mainY} x2={x2} y2={mainY} stroke={MAIN_COLOR} strokeWidth={2} strokeLinecap="round" />
      <circle cx={x2} cy={mainY} r={4} fill={MAIN_COLOR} />
    </g>
  );
}
