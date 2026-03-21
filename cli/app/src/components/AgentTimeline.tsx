import type { Session } from '../types';

export interface AgentTimelineProps {
  session: Session;
  variant: 'compact' | 'full';
}

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

// ── Wave detection ──────────────────────────────────────────────

interface Wave {
  children: Session[];
}

function detectWaves(children: Session[]): Wave[] {
  if (children.length === 0) return [];

  const sorted = [...children].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  const waves: Wave[] = [];
  let currentWave: Session[] = [sorted[0]];
  let currentWaveEnd =
    new Date(sorted[0].date).getTime() +
    (sorted[0].wallClockMinutes ?? sorted[0].durationMinutes) * 60000;

  for (let i = 1; i < sorted.length; i++) {
    const childStart = new Date(sorted[i].date).getTime();
    if (childStart >= currentWaveEnd) {
      waves.push({ children: currentWave });
      currentWave = [sorted[i]];
      currentWaveEnd =
        childStart +
        (sorted[i].wallClockMinutes ?? sorted[i].durationMinutes) * 60000;
    } else {
      currentWave.push(sorted[i]);
      const thisEnd =
        childStart +
        (sorted[i].wallClockMinutes ?? sorted[i].durationMinutes) * 60000;
      if (thisEnd > currentWaveEnd) currentWaveEnd = thisEnd;
    }
  }
  waves.push({ children: currentWave });
  return waves;
}

// ── Component ───────────────────────────────────────────────────

export function AgentTimeline({ session, variant }: AgentTimelineProps) {
  const isCompact = variant === 'compact';
  const children = session.childSessions ?? [];
  const isMultiAgent = children.length > 0;

  if (!isMultiAgent) {
    return <SingleAgentTimeline session={session} isCompact={isCompact} />;
  }

  const waves = detectWaves(children);

  // ── Structural layout: proportional lane widths based on duration ──
  const laneSpacing = isCompact ? 20 : 60;
  const maxLanesPerWave = Math.max(...waves.map((w) => w.children.length), 1);
  const curveDx = isCompact ? 12 : 25;
  const preFork = isCompact ? 30 : 80;     // main line before first fork
  const postJoin = isCompact ? 30 : 80;    // main line after last join
  const waveGap = isCompact ? 20 : 50;     // main line between waves
  const minLaneWidth = isCompact ? 30 : 60;
  const maxLaneWidth = isCompact ? 80 : 200;
  const labelSpace = isCompact ? 0 : 100;  // space after lane for label text
  const forkJoinWidth = curveDx * 2;       // space for fork/join curves

  // Compute max child duration across ALL waves for proportional sizing
  const allChildren = waves.flatMap((w) => w.children);
  const maxChildDuration = Math.max(...allChildren.map((c) => c.durationMinutes), 1);

  // Each wave's width varies based on its longest lane
  const waveWidths = waves.map((wave) => {
    const longestLane = Math.max(...wave.children.map((c) => c.durationMinutes), 1);
    const laneWidth = Math.max(minLaneWidth, (longestLane / maxChildDuration) * maxLaneWidth);
    return forkJoinWidth + laneWidth + labelSpace + forkJoinWidth;
  });
  const totalWidth = preFork + waveWidths.reduce((a, b) => a + b, 0) + (waves.length - 1) * waveGap + postJoin;
  const width = Math.max(isCompact ? 400 : 900, totalWidth);
  const padding = isCompact ? 10 : 30;

  // Vertical layout
  const baseY = isCompact ? 30 : Math.max(80, maxLanesPerWave * laneSpacing / 2 + 30);
  const height = isCompact
    ? Math.max(60, maxLanesPerWave * laneSpacing + 30)
    : baseY + maxLanesPerWave * laneSpacing / 2 + 40;

  const strokeW = isCompact ? 2.5 : 3;
  const circleR = isCompact ? 3.5 : 5;
  const startR = isCompact ? 3 : 4;
  const labelSize = isCompact ? 7 : 8.5;
  const detailSize = isCompact ? 0 : 7.5;
  const rectPadY = isCompact ? 8 : 13;
  const rectH = isCompact ? 16 : 26;

  // Compute x positions for each wave structurally
  interface LaneInfo {
    child: Session;
    y: number;
    x1: number;
    x2: number;
    color: string;
    offsetMinutes: number;
  }
  interface WaveLayout {
    forkX: number;
    joinX: number;
    lanes: LaneInfo[];
  }

  const waveLayouts: WaveLayout[] = [];
  let cursor = padding + preFork;

  const sessionStartMs = new Date(session.date).getTime();

  for (let wi = 0; wi < waves.length; wi++) {
    const wave = waves[wi];
    const forkX = cursor;
    const longestLane = Math.max(...wave.children.map((c) => c.durationMinutes), 1);
    const waveLaneWidth = Math.max(minLaneWidth, (longestLane / maxChildDuration) * maxLaneWidth);
    const laneStart = forkX + forkJoinWidth;
    const joinX = laneStart + waveLaneWidth + labelSpace + forkJoinWidth;

    const sorted = [...wave.children].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );

    const lanes: LaneInfo[] = sorted.map((child, i) => {
      const n = sorted.length;
      const totalH = (n - 1) * laneSpacing;
      const y = baseY - totalH / 2 + i * laneSpacing;
      const childLaneWidth = Math.max(minLaneWidth, (child.durationMinutes / maxChildDuration) * maxLaneWidth);
      const offsetMinutes = Math.round((new Date(child.date).getTime() - sessionStartMs) / 60000);
      return {
        child,
        y,
        x1: laneStart,
        x2: laneStart + childLaneWidth,
        color: getAgentColor(child.agentRole),
        offsetMinutes,
      };
    });

    waveLayouts.push({ forkX, joinX, lanes });
    cursor = joinX + waveGap;
  }

  const endX = width - padding;

  const svgContent = (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Multi-agent session timeline"
      width={width}
      height={height}
      style={{ display: 'block' }}
    >
      {/* Start marker */}
      <circle
        cx={padding}
        cy={baseY}
        r={startR}
        fill="none"
        stroke={MAIN_COLOR}
        strokeWidth={isCompact ? 1.5 : 2}
      />

      {/* Pre-fork main line */}
      <line
        x1={padding}
        y1={baseY}
        x2={waveLayouts[0].forkX}
        y2={baseY}
        stroke={MAIN_COLOR}
        strokeWidth={strokeW}
        strokeLinecap="round"
      />

      {waveLayouts.map((wl, wi) => (
        <g key={wi} data-testid="wave">
          {/* Fork circle */}
          <circle cx={wl.forkX} cy={baseY} r={circleR} fill={MAIN_COLOR} data-testid="fork-circle" />

          {/* Fork curves */}
          {wl.lanes.map((lane, li) => (
            <path
              key={`f${li}`}
              d={`M${wl.forkX},${baseY} C${wl.forkX + curveDx},${baseY} ${wl.forkX + curveDx},${lane.y} ${lane.x1},${lane.y}`}
              stroke={lane.color}
              strokeWidth={isCompact ? 1.5 : 2}
              fill="none"
              strokeDasharray={isCompact ? '3,2' : '4,3'}
              data-testid="fork-line"
            />
          ))}

          {/* Agent lanes with labels */}
          {wl.lanes.map((lane, li) => (
            <g key={`l${li}`} data-testid="agent-lane">
              <rect
                x={lane.x1}
                y={lane.y - rectPadY}
                rx={2}
                ry={2}
                width={lane.x2 - lane.x1}
                height={rectH}
                fill={lane.color}
                opacity={0.08}
              />
              <line
                x1={lane.x1}
                y1={lane.y}
                x2={lane.x2}
                y2={lane.y}
                stroke={lane.color}
                strokeWidth={strokeW}
                strokeLinecap="round"
              />
              {/* Role label — above lane like the mockup */}
              <text
                x={lane.x1 + 6}
                y={lane.y - rectPadY - 3}
                fontFamily="var(--font-mono), 'IBM Plex Mono', monospace"
                fontSize={labelSize}
                fill={lane.color}
                fontWeight={600}
                data-testid="role-label"
              >
                {(lane.child.agentRole ?? 'agent').toUpperCase()}
              </text>
              {/* Detail text: offset + LOC + duration (full variant only) */}
              {!isCompact && detailSize > 0 && (
                <text
                  x={lane.x2 + 8}
                  y={lane.y + 4}
                  fontFamily="var(--font-body), 'Inter', sans-serif"
                  fontSize={detailSize}
                  fill="#6b7280"
                >
                  +{lane.offsetMinutes}m · {lane.child.linesOfCode > 0 ? `${lane.child.linesOfCode} LOC · ` : ''}
                  {lane.child.durationMinutes}m
                </text>
              )}
            </g>
          ))}

          {/* Join curves */}
          {wl.lanes.map((lane, li) => (
            <path
              key={`j${li}`}
              d={`M${lane.x2},${lane.y} C${lane.x2 + curveDx},${lane.y} ${wl.joinX - curveDx},${baseY} ${wl.joinX},${baseY}`}
              stroke={lane.color}
              strokeWidth={isCompact ? 1.5 : 2}
              fill="none"
              strokeDasharray={isCompact ? '3,2' : '4,3'}
              data-testid="join-line"
            />
          ))}

          {/* Join circle */}
          <circle cx={wl.joinX} cy={baseY} r={circleR} fill={MAIN_COLOR} data-testid="join-circle" />

          {/* Between-wave main line */}
          {wi < waveLayouts.length - 1 && (
            <line
              x1={wl.joinX}
              y1={baseY}
              x2={waveLayouts[wi + 1].forkX}
              y2={baseY}
              stroke={MAIN_COLOR}
              strokeWidth={strokeW}
              strokeLinecap="round"
            />
          )}
        </g>
      ))}

      {/* Post-join main line */}
      <line
        x1={waveLayouts[waveLayouts.length - 1].joinX}
        y1={baseY}
        x2={endX}
        y2={baseY}
        stroke={MAIN_COLOR}
        strokeWidth={strokeW}
        strokeLinecap="round"
      />

      {/* End marker */}
      <circle cx={endX} cy={baseY} r={startR} fill={MAIN_COLOR} />

    </svg>
  );

  // Wrap in scrollable container for wide timelines
  return (
    <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
      {svgContent}
    </div>
  );
}

// ── Single-agent (no children) ──────────────────────────────────

function SingleAgentTimeline({
  session,
  isCompact,
}: {
  session: Session;
  isCompact: boolean;
}) {
  const width = isCompact ? 400 : 900;
  const padding = isCompact ? 20 : 60;
  const xStart = padding;
  const xEnd = width - padding;
  const strokeW = isCompact ? 2.5 : 3;
  const circleR = isCompact ? 3 : 4;
  const mainY = isCompact ? 20 : 50;
  const height = isCompact ? 40 : 80;
  const tickHeight = isCompact ? 12 : 20;

  const turns = session.turns || 0;
  const tickCount = Math.min(turns, 14);
  const lineLen = xEnd - xStart;
  const ticks: { x: number; opacity: number }[] = [];
  for (let i = 0; i < tickCount; i++) {
    const frac = (i + 1) / (tickCount + 1);
    const opacity = 0.15 + ((i * 7 + 3) % 5) * 0.06;
    ticks.push({ x: xStart + frac * lineLen, opacity: Math.min(opacity, 0.4) });
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Single agent session timeline"
      style={{ width: '100%', display: 'block' }}
    >
      <line x1={xStart} y1={mainY} x2={xEnd} y2={mainY} stroke={MAIN_COLOR} strokeWidth={strokeW} strokeLinecap="round" />
      <circle cx={xStart} cy={mainY} r={circleR} fill="none" stroke={MAIN_COLOR} strokeWidth={isCompact ? 1.5 : 2} />
      <circle cx={xEnd} cy={mainY} r={circleR} fill={MAIN_COLOR} />
      {ticks.map((tick, i) => (
        <rect
          key={i}
          x={tick.x}
          y={mainY - tickHeight / 2}
          width={isCompact ? 2 : 3}
          height={tickHeight}
          fill={MAIN_COLOR}
          opacity={tick.opacity}
          rx={1}
          data-testid="activity-tick"
        />
      ))}
    </svg>
  );
}
