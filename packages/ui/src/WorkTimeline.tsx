import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import type { Session } from './types';

export interface WorkTimelineProps {
  sessions: Session[];
  onSessionClick?: (session: Session) => void;
  /** Cap inline height with gradient fade + expand button. Fullscreen shows everything. */
  maxHeight?: number;
}

// ── Colors ───────────────────────────────────────────────────────

const AGENT_COLORS: Record<string, string> = {
  main: '#084471', orchestrator: '#084471',
  'frontend-dev': '#7c3aed', frontend: '#7c3aed',
  'backend-dev': '#0891b2', backend: '#0891b2',
  'qa-engineer': '#059669', qa: '#059669',
  'ux-designer': '#d97706', ux: '#d97706',
  'product-manager': '#dc2626', pm: '#dc2626',
  'security-engineer': '#6b7280', 'team-lead': '#6b7280',
  explore: '#94a3b8',
};

const MAIN_COLOR = '#084471';
const THREAD_COLOR = '#d1d5db';
const FONT = "'IBM Plex Mono', monospace";
const TEXT_SECONDARY = '#6b7280';
const TEXT_MUTED = '#9ca3af';

function agentColor(role?: string): string {
  if (!role) return TEXT_SECONDARY;
  return AGENT_COLORS[role.toLowerCase()] ?? TEXT_SECONDARY;
}

// ── Time helpers ─────────────────────────────────────────────────

function sessionStart(s: Session): number { return new Date(s.date).getTime(); }
function sessionEnd(s: Session): number {
  return s.endTime ? new Date(s.endTime).getTime() : sessionStart(s) + s.durationMinutes * 60_000;
}

function formatGap(ms: number): string {
  const h = ms / 3_600_000;
  if (h < 20) return `${Math.round(h)}h gap`;
  const d = Math.round(h / 24);
  return d === 1 ? '1 day gap' : `${d} days gap`;
}

export function formatTimestamp(dateStr: string): string {
  const d = new Date(dateStr);
  const mon = d.toLocaleString('en-US', { month: 'short' });
  const day = d.getDate();
  const hour = d.getHours();
  const min = d.getMinutes().toString().padStart(2, '0');
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 || 12;
  return `${mon} ${day}, ${h12}:${min} ${ampm}`;
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// ── Segment computation ──────────────────────────────────────────

const GAP_MS = 3_600_000;
const MIN_W = 160;
const MAX_W = 480;
const MIN_CW = 120;

export function timeToPx(minutes: number): number {
  return Math.min(Math.max(minutes * 3, MIN_W), MAX_W);
}

interface SSeg { type: 'session'; session: Session; startMs: number; endMs: number }
interface CSeg { type: 'concurrent'; sessions: Session[]; startMs: number; endMs: number }
interface GSeg { type: 'gap'; durationMs: number }
type Seg = SSeg | CSeg | GSeg;

export function computeSegments(sessions: Session[]): Seg[] {
  if (!sessions.length) return [];
  const sorted = [...sessions].sort((a, b) => sessionStart(a) - sessionStart(b));
  const clusters: { sessions: Session[]; s: number; e: number }[] = [];
  let cur: typeof clusters[0] | null = null;
  for (const s of sorted) {
    const st = sessionStart(s), en = sessionEnd(s);
    if (!cur || st >= cur.e) { if (cur) clusters.push(cur); cur = { sessions: [s], s: st, e: en }; }
    else { cur.sessions.push(s); if (en > cur.e) cur.e = en; }
  }
  if (cur) clusters.push(cur);
  const segs: Seg[] = [];
  for (let i = 0; i < clusters.length; i++) {
    const c = clusters[i];
    if (i > 0) { const gap = c.s - clusters[i - 1].e; if (gap > GAP_MS) segs.push({ type: 'gap', durationMs: gap }); }
    if (c.sessions.length === 1) segs.push({ type: 'session', session: c.sessions[0], startMs: c.s, endMs: c.e });
    else segs.push({ type: 'concurrent', sessions: c.sessions, startMs: c.s, endMs: c.e });
  }
  return segs;
}

// ── Parallel track helpers ────────────────────────────────────────

/** Greedy lane packing: assign each session to lowest lane where it fits.
 *  Adds a visual buffer after each session so bezier flares don't collide. */
export function assignLanes(sessions: Session[]): Map<string, number> {
  const sorted = [...sessions].sort((a, b) => sessionStart(a) - sessionStart(b));
  const laneEnds: number[] = []; // laneEnds[i] = effective visual end of last session on lane i
  const assignment = new Map<string, number>();

  for (const s of sorted) {
    const start = sessionStart(s);
    let assigned = -1;
    for (let i = 0; i < laneEnds.length; i++) {
      if (laneEnds[i] <= start) { assigned = i; break; }
    }
    if (assigned === -1) {
      assigned = laneEnds.length;
      laneEnds.push(0);
    }
    // Add buffer: sessions with agents need extra clearance for bezier flares
    // ~15 min buffer per session, more for agent-heavy sessions
    const kids = s.childSessions?.length ?? s.children?.length ?? 0;
    const bufferMs = (kids > 5 ? 30 : 15) * 60_000;
    laneEnds[assigned] = sessionEnd(s) + bufferMs;
    assignment.set(s.id, assigned);
  }
  return assignment;
}

/** Linear time-to-pixel mapping within a concurrent segment */
export function timeToX(timeMs: number, rangeStartMs: number, rangeEndMs: number, xStart: number, xEnd: number): number {
  if (rangeEndMs === rangeStartMs) return xStart;
  const ratio = (timeMs - rangeStartMs) / (rangeEndMs - rangeStartMs);
  return xStart + ratio * (xEnd - xStart);
}

// ── Children helper ──────────────────────────────────────────────

interface Child { id: string; role?: string; durationMinutes: number; linesOfCode: number }

function getChildren(s: Session): Child[] {
  if (!s.children?.length) return [];
  return s.children.map(c => ({
    id: c.sessionId,
    role: c.role,
    durationMinutes: c.durationMinutes,
    linesOfCode: c.linesOfCode,
  }));
}

// ── Tooltip data ─────────────────────────────────────────────────

interface TooltipData {
  title: string;
  timestamp: string;
  duration: string;
  linesOfCode: number;
  agentCount: number;
  session: Session;
}

function buildTooltip(s: Session): TooltipData {
  const kids = getChildren(s);
  return {
    title: s.title,
    timestamp: formatTimestamp(s.date),
    duration: formatDuration(s.durationMinutes),
    linesOfCode: s.linesOfCode,
    agentCount: kids.length,
    session: s,
  };
}

// ── Legend data ──────────────────────────────────────────────────

export interface LegendAgent {
  role: string;
  color: string;
  duration: string;
  count: number;
}

export interface LegendEntry {
  title: string;
  timestamp: string;
  agents: LegendAgent[];
  totalAgents: number;
  xStart: number;
  xEnd: number;
}

const MAX_LEGEND_ROLES = 6;

/** Aggregate children by role: sum durations, count instances */
function aggregateAgents(kids: Child[]): LegendAgent[] {
  const byRole = new Map<string, { totalMin: number; count: number }>();
  for (const k of kids) {
    const role = k.role ?? 'agent';
    const existing = byRole.get(role);
    if (existing) {
      existing.totalMin += k.durationMinutes;
      existing.count += 1;
    } else {
      byRole.set(role, { totalMin: k.durationMinutes, count: 1 });
    }
  }
  // Sort by total duration descending so the most significant agents show first
  return [...byRole.entries()]
    .sort((a, b) => b[1].totalMin - a[1].totalMin)
    .map(([role, { totalMin, count }]) => ({
      role,
      color: agentColor(role),
      duration: formatDuration(totalMin),
      count,
    }));
}

function buildLegendEntries(segments: Seg[], sessionRanges: SessionRange[]): LegendEntry[] {
  return sessionRanges.map(r => {
    const kids = getChildren(r.session);
    return {
      title: r.session.title,
      timestamp: formatTimestamp(r.session.date),
      agents: aggregateAgents(kids),
      totalAgents: kids.length,
      xStart: r.xStart,
      xEnd: r.xEnd,
    };
  });
}

// ── Layout ───────────────────────────────────────────────────────

const MAX_AGENTS = 30;
const LEGENDARY_THRESHOLD = 30;
const SEG_GAP = 56;
const CURVE_CP = 50;
const LANE_GAP = 40;
const MAX_TITLE = 32;
const TRACK_GAP = 140;
const PX_PER_MIN = 4;
const MIN_CONCURRENT_W = 300;
const MAX_CONCURRENT_W = 1200;
const MIN_LABEL_GAP = 140;

/** Dynamic lane gap — shrinks as agent count grows so it doesn't explode vertically */
function laneGap(agentCount: number): number {
  if (agentCount <= 5) return 44;
  if (agentCount <= 10) return 32;
  if (agentCount <= 20) return 22;
  return 16;
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + '\u2026';
}

interface Pos { x: number; y: number }

interface LLabel { kind: 'label'; pos: Pos; title: string; sub?: string; timestamp?: string; color: string; above: boolean; session?: Session; tooltip?: TooltipData }
interface LDot { kind: 'dot'; pos: Pos; color: string; size: 'sm' | 'lg'; tooltip?: TooltipData }
interface LGap { kind: 'gap'; pos: Pos; label: string; durationMs: number }
type LNode = LLabel | LDot | LGap;

interface LTrack { path: string; color: string; width: number; dashed?: boolean; opacity?: number }

interface SessionRange { session: Session; xStart: number; xEnd: number }

interface Layout {
  nodes: LNode[];
  tracks: LTrack[];
  sessionRanges: SessionRange[];
  hasConcurrentOverflow: boolean;
  threadStart: number;
  threadEnd: number;
  totalW: number;
  totalH: number;
  centerY: number;
}

function bezierForkJoin(forkX: number, joinX: number, cY: number, laneY: number): string {
  if (laneY === cY) return `M ${forkX} ${cY} L ${joinX} ${cY}`;
  const cp = Math.min(CURVE_CP, (joinX - forkX) / 4);
  return [
    `M ${forkX} ${cY}`,
    `C ${forkX + cp} ${cY}, ${forkX + cp} ${laneY}, ${forkX + cp * 2} ${laneY}`,
    `L ${joinX - cp * 2} ${laneY}`,
    `C ${joinX - cp} ${laneY}, ${joinX - cp} ${cY}, ${joinX} ${cY}`,
  ].join(' ');
}

const DEFAULT_MAX_CONCURRENT = 8;

function layout(segments: Seg[], maxConcurrent: number = DEFAULT_MAX_CONCURRENT): Layout {
  const nodes: LNode[] = [];
  const tracks: LTrack[] = [];
  const sessionRanges: SessionRange[] = [];
  let hasConcurrentOverflow = false;
  let cx = 48;
  const cY = 0;
  let minY = 0, maxY = 0;
  const threadStart = cx;

  const bound = (y: number, h: number) => { if (y < minY) minY = y; if (y + h > maxY) maxY = y + h; };

  for (const seg of segments) {
    if (seg.type === 'gap') {
      const gapW = 72;
      tracks.push({ path: `M ${cx} ${cY} L ${cx + gapW} ${cY}`, color: TEXT_MUTED, width: 1.5, dashed: true });
      nodes.push({ kind: 'gap', pos: { x: cx, y: cY + 16 }, label: formatGap(seg.durationMs), durationMs: seg.durationMs });
      bound(cY - 8, 40);
      cx += gapW + SEG_GAP;
      continue;
    }

    if (seg.type === 'session') {
      const s = seg.session;
      const kids = getChildren(s);
      const dur = (seg.endMs - seg.startMs) / 60_000;
      const w = Math.min(Math.max(timeToPx(dur), MIN_W), MAX_W);
      const sub = formatDuration(s.durationMinutes);
      const tooltip = buildTooltip(s);
      const ts = formatTimestamp(s.date);

      if (kids.length > 0) {
        // Render every individual agent curve — chaos is the point
        const visible = kids.slice(0, MAX_AGENTS);
        const n = visible.length;
        const gap = laneGap(n);
        const totalSpread = (n - 1) * gap;
        const forkX = cx;
        const joinX = cx + w;
        const topLaneY = cY - totalSpread / 2;

        // Session title above topmost lane
        const titleY = topLaneY - 32;
        const flatStartX = forkX + CURVE_CP * 2;
        nodes.push({ kind: 'label', pos: { x: flatStartX + 8, y: titleY }, title: truncate(s.title, MAX_TITLE), sub, timestamp: ts, color: MAIN_COLOR, above: true, session: s, tooltip });
        bound(titleY - 4, 28);

        // Fork dot
        nodes.push({ kind: 'dot', pos: { x: forkX, y: cY }, color: MAIN_COLOR, size: 'lg', tooltip });

        // One track per individual agent
        visible.forEach((kid, i) => {
          const laneY = topLaneY + i * gap;
          const color = agentColor(kid.role);
          tracks.push({ path: bezierForkJoin(forkX, joinX, cY, laneY), color, width: 1.5 });
          bound(laneY - 2, 4);
        });

        // Join dot
        nodes.push({ kind: 'dot', pos: { x: joinX, y: cY }, color: MAIN_COLOR, size: 'lg', tooltip });

        // Track range for legend
        sessionRanges.push({ session: s, xStart: forkX, xEnd: joinX });
        cx = joinX + SEG_GAP;
      } else {
        // Solo session
        nodes.push({ kind: 'label', pos: { x: cx + 14, y: cY - 28 }, title: truncate(s.title, MAX_TITLE), sub, timestamp: ts, color: MAIN_COLOR, above: true, session: s, tooltip });
        bound(cY - 32, 28);
        nodes.push({ kind: 'dot', pos: { x: cx, y: cY }, color: MAIN_COLOR, size: 'sm', tooltip });
        nodes.push({ kind: 'dot', pos: { x: cx + w, y: cY }, color: MAIN_COLOR, size: 'sm', tooltip });
        tracks.push({ path: `M ${cx} ${cY} L ${cx + w} ${cY}`, color: MAIN_COLOR, width: 3 });
        sessionRanges.push({ session: s, xStart: cx, xEnd: cx + w });
        cx += w + SEG_GAP;
      }
      continue;
    }

    if (seg.type === 'concurrent') {
      // Parallel track layout: sessions on separate Y tracks, X proportional to time
      const sorted = [...seg.sessions].sort((a, b) => sessionStart(a) - sessionStart(b));
      const visible = sorted.slice(0, maxConcurrent);
      const laneMap = assignLanes(visible);
      const laneCount = Math.max(...laneMap.values()) + 1;
      const hidden = sorted.length - visible.length;
      if (hidden > 0) hasConcurrentOverflow = true;

      // Dynamic track gap: scale with the most agent-heavy session
      const maxAgentCount = Math.max(...visible.map(s => getChildren(s).length), 0);
      const dynamicTrackGap = maxAgentCount > 15
        ? Math.max(TRACK_GAP, maxAgentCount * 5 + 60)
        : maxAgentCount > 5
        ? Math.max(TRACK_GAP, maxAgentCount * 8 + 40)
        : TRACK_GAP;

      // Time range and pixel width for this concurrent segment
      const rangeStartMs = seg.startMs;
      const rangeEndMs = seg.endMs;
      const rangeDurMin = (rangeEndMs - rangeStartMs) / 60_000;
      const segW = Math.min(Math.max(rangeDurMin * PX_PER_MIN, MIN_CONCURRENT_W), MAX_CONCURRENT_W);
      const segXStart = cx;
      const segXEnd = cx + segW;

      // Per-lane label collision tracking
      const laneLabelRight: number[] = new Array(laneCount).fill(0);

      for (const s of sorted.slice(0, maxConcurrent)) {
        const lane = laneMap.get(s.id) ?? 0;
        const trackY = cY + lane * dynamicTrackGap;
        const kids = getChildren(s);
        const tooltip = buildTooltip(s);
        const ts = formatTimestamp(s.date);
        const sub = formatDuration(s.durationMinutes);

        // X position from real time; width from active duration
        const sXStart = timeToX(sessionStart(s), rangeStartMs, rangeEndMs, segXStart, segXEnd);
        const barW = Math.min(Math.max(s.durationMinutes * PX_PER_MIN, 20), segW);
        const sXEnd = sXStart + barW;

        if (kids.length > 0) {
          // Session with agents: fork/join curves from track Y
          const agentVisible = kids.slice(0, MAX_AGENTS);
          const n = agentVisible.length;
          const gap = laneGap(n);
          // Centered spread — agents fan out symmetrically above/below track line
          const maxSpread = dynamicTrackGap - 40;
          const totalSpread = Math.min((n - 1) * gap, maxSpread);
          const agentGap = n > 1 ? totalSpread / (n - 1) : 0;
          const topAgentY = trackY - totalSpread / 2;

          // Label above agents — skip if too close to previous label on this lane
          const titleY = topAgentY - 32;
          const hasRoom = laneLabelRight[lane] === 0 || sXStart >= laneLabelRight[lane];
          if (hasRoom) {
            nodes.push({ kind: 'label', pos: { x: sXStart + 8, y: titleY }, title: truncate(s.title, MAX_TITLE), sub, timestamp: ts, color: MAIN_COLOR, above: true, session: s, tooltip });
            laneLabelRight[lane] = sXStart + MIN_LABEL_GAP;
          }
          bound(titleY - 4, 28);

          // Fork dot
          nodes.push({ kind: 'dot', pos: { x: sXStart, y: trackY }, color: MAIN_COLOR, size: 'lg', tooltip });

          // Agent curves relative to trackY — reduce opacity when dense
          const agentOpacity = n > 15 ? 0.4 : n > 8 ? 0.6 : 0.8;
          const agentWidth = n > 15 ? 1 : 1.5;
          agentVisible.forEach((kid, i) => {
            const agentY = topAgentY + i * agentGap;
            const color = agentColor(kid.role);
            tracks.push({ path: bezierForkJoin(sXStart, sXEnd, trackY, agentY), color, width: agentWidth, opacity: agentOpacity });
            bound(agentY - 2, 4);
          });

          // Join dot
          nodes.push({ kind: 'dot', pos: { x: sXEnd, y: trackY }, color: MAIN_COLOR, size: 'lg', tooltip });
          sessionRanges.push({ session: s, xStart: sXStart, xEnd: sXEnd });
        } else {
          // Solo session on track — skip label if too close to previous
          const hasRoom = laneLabelRight[lane] === 0 || sXStart >= laneLabelRight[lane];
          if (hasRoom) {
            nodes.push({ kind: 'label', pos: { x: sXStart + 8, y: trackY - 28 }, title: truncate(s.title, MAX_TITLE), sub, timestamp: ts, color: MAIN_COLOR, above: true, session: s, tooltip });
            laneLabelRight[lane] = sXStart + MIN_LABEL_GAP;
          }
          bound(trackY - 32, 28);

          nodes.push({ kind: 'dot', pos: { x: sXStart, y: trackY }, color: MAIN_COLOR, size: 'sm', tooltip });
          nodes.push({ kind: 'dot', pos: { x: sXEnd, y: trackY }, color: MAIN_COLOR, size: 'sm', tooltip });
          tracks.push({ path: `M ${sXStart} ${trackY} L ${sXEnd} ${trackY}`, color: MAIN_COLOR, width: 3 });
          sessionRanges.push({ session: s, xStart: sXStart, xEnd: sXEnd });
        }

        bound(trackY - 4, 8);
      }

      // Overflow indicator
      if (hidden > 0) {
        const overflowY = cY + laneCount * dynamicTrackGap;
        nodes.push({ kind: 'label', pos: { x: segXStart + 8, y: overflowY }, title: `+${hidden} more sessions`, color: TEXT_MUTED, above: false });
        bound(overflowY, 16);
      }

      cx = segXEnd + SEG_GAP;
    }
  }

  const threadEnd = cx - SEG_GAP;
  const pad = 36;
  const yShift = -minY + pad;
  const totalH = maxY - minY + pad * 2;

  return {
    nodes: nodes.map(n => ({ ...n, pos: { x: n.pos.x, y: n.pos.y + yShift } })),
    tracks,
    sessionRanges,
    hasConcurrentOverflow,
    threadStart,
    threadEnd,
    totalW: cx + 48,
    totalH: Math.max(totalH, 100),
    centerY: cY + yShift,
  };
}

// ── Scroll-aware legend detection ────────────────────────────────

function findFocusedEntry(scrollLeft: number, viewportW: number, entries: LegendEntry[]): LegendEntry | null {
  if (!entries.length) return null;
  const viewCenter = scrollLeft + viewportW / 2;

  let best: LegendEntry | null = null;
  let bestDist = Infinity;

  for (const e of entries) {
    const segCenter = (e.xStart + e.xEnd) / 2;
    const dist = Math.abs(viewCenter - segCenter);
    if (dist < bestDist) {
      bestDist = dist;
      best = e;
    }
  }
  return best;
}

// ── Legend Component ─────────────────────────────────────────────

function Legend({ entry }: { entry: LegendEntry | null }) {
  if (!entry || entry.agents.length === 0) {
    return null;
  }

  const visible = entry.agents.slice(0, MAX_LEGEND_ROLES);
  const hiddenRoles = entry.agents.length - visible.length;
  const isLegendary = entry.totalAgents >= LEGENDARY_THRESHOLD;

  return (
    <div data-testid="wt-legend" style={{
      fontFamily: FONT,
      fontSize: 10,
      display: 'flex',
      alignItems: 'baseline',
      gap: 14,
      padding: '6px 0',
      minHeight: 28,
    }}>
      {isLegendary ? (
        <span style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.06em',
          color: '#d97706',
          flexShrink: 0,
        }}>
          LEGENDARY AGENTIC USE — {entry.totalAgents} agents:
        </span>
      ) : (
        <span style={{ fontSize: 10, color: TEXT_SECONDARY, fontWeight: 600, flexShrink: 0 }}>
          {entry.totalAgents} agents:
        </span>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        {visible.map((a) => (
          <div key={a.role} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: a.color,
              boxShadow: `0 0 4px ${a.color}40`,
              flexShrink: 0,
            }} />
            <span style={{ fontWeight: 600, color: a.color, letterSpacing: '0.03em' }}>
              {a.role.toUpperCase()}
            </span>
            {a.count > 1 && (
              <span style={{ color: TEXT_MUTED }}>&times;{a.count}</span>
            )}
            <span style={{ color: TEXT_MUTED }}>{a.duration}</span>
          </div>
        ))}
        {hiddenRoles > 0 && (
          <span style={{ color: TEXT_MUTED, fontStyle: 'italic' }}>
            +{hiddenRoles} more
          </span>
        )}
      </div>
    </div>
  );
}

// ── Tooltip Component ────────────────────────────────────────────

function Tooltip({ data, pos }: { data: TooltipData; pos: { x: number; y: number } }) {
  return (
    <div style={{
      position: 'absolute',
      left: pos.x,
      top: pos.y - 8,
      transform: 'translateY(-100%)',
      background: '#1f2937',
      color: '#f9fafb',
      borderRadius: 6,
      padding: '10px 14px',
      fontFamily: FONT,
      fontSize: 11,
      lineHeight: 1.5,
      whiteSpace: 'nowrap',
      zIndex: 100,
      pointerEvents: 'none',
      boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
    }}>
      <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 4, color: '#fff' }}>
        {data.title}
      </div>
      <div style={{ color: '#d1d5db' }}>{data.timestamp}</div>
      <div style={{ display: 'flex', gap: 16, marginTop: 4 }}>
        <span>{data.duration}</span>
        <span>{data.linesOfCode.toLocaleString()} lines</span>
        {data.agentCount > 0 && <span>{data.agentCount} agents</span>}
      </div>
    </div>
  );
}

// ── Renderer ─────────────────────────────────────────────────────

export function WorkTimeline({ sessions, onSessionClick, maxHeight }: WorkTimelineProps) {
  const segments = useMemo(() => computeSegments(sessions), [sessions]);
  const [expanded, setExpanded] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const playRef = useRef<number | null>(null);
  const concurrentLimit = expanded ? 999 : DEFAULT_MAX_CONCURRENT;
  const L = useMemo(() => layout(segments, concurrentLimit), [segments, concurrentLimit]);
  const legendEntries = useMemo(() => buildLegendEntries(segments, L.sessionRanges), [segments, L.sessionRanges]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<{ tooltip: TooltipData; pos: Pos } | null>(null);
  const [focusedEntry, setFocusedEntry] = useState<LegendEntry | null>(null);

  // Set initial focused entry
  useEffect(() => {
    const withAgents = legendEntries.filter(e => e.agents.length > 0);
    if (withAgents.length > 0) setFocusedEntry(withAgents[0]);
  }, [legendEntries]);

  // Scroll handler to update legend
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const withAgents = legendEntries.filter(e => e.agents.length > 0);
    const entry = findFocusedEntry(el.scrollLeft, el.clientWidth, withAgents);
    if (entry) setFocusedEntry(entry);
  }, [legendEntries]);

  // Auto-scroll playback
  const togglePlay = useCallback(() => {
    if (playing) {
      if (playRef.current) cancelAnimationFrame(playRef.current);
      playRef.current = null;
      setPlaying(false);
      return;
    }
    setPlaying(true);
    const speed = 1.2;
    const step = () => {
      const s = scrollRef.current;
      if (!s) return;
      if (s.scrollLeft >= s.scrollWidth - s.clientWidth - 1) {
        setPlaying(false);
        playRef.current = null;
        return;
      }
      s.scrollLeft += speed;
      playRef.current = requestAnimationFrame(step);
    };
    playRef.current = requestAnimationFrame(step);
  }, [playing]);

  useEffect(() => {
    return () => { if (playRef.current) cancelAnimationFrame(playRef.current); };
  }, []);

  // Close fullscreen on Escape
  useEffect(() => {
    if (!fullscreen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setFullscreen(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [fullscreen]);

  const handleHover = useCallback((tooltip: TooltipData | undefined, pos: Pos) => {
    if (tooltip) setHovered({ tooltip, pos });
  }, []);
  const clearHover = useCallback(() => setHovered(null), []);

  if (!sessions.length) {
    return (
      <div className="work-timeline" data-testid="work-timeline-empty">
        <p style={{ fontFamily: FONT, fontSize: '0.8125rem', color: TEXT_SECONDARY }}>No sessions to display.</p>
      </div>
    );
  }

  const hasAgents = legendEntries.some(e => e.agents.length > 0);

  const btnStyle = (active?: boolean): React.CSSProperties => ({
    padding: '3px 10px', fontSize: 10, fontWeight: 600,
    border: `1px solid ${THREAD_COLOR}`, borderRadius: 4,
    background: active ? MAIN_COLOR : '#fff',
    color: active ? '#fff' : MAIN_COLOR,
    cursor: 'pointer', fontFamily: FONT, letterSpacing: '0.03em',
    flexShrink: 0,
  });

  const timelineContent = (
    <>
      {/* Controls: legend + buttons */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {hasAgents && <Legend entry={focusedEntry} />}
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          {L.totalW > 600 && (
            <button onClick={togglePlay} style={btnStyle(playing)}>
              {playing ? 'PAUSE' : 'PLAY'}
            </button>
          )}
        </div>
      </div>

      {/* Scrollable timeline */}
      <div ref={scrollRef} onScroll={handleScroll}
        style={{ overflowX: 'auto', overflowY: fullscreen ? 'auto' : 'hidden', WebkitOverflowScrolling: 'touch', paddingBottom: 12, maxHeight: fullscreen ? 'calc(100vh - 80px)' : undefined }}>
        <div style={{ position: 'relative', width: L.totalW, height: L.totalH, fontFamily: FONT }}>

          {/* SVG layer: thread + tracks */}
          <svg style={{ position: 'absolute', inset: 0, width: L.totalW, height: L.totalH, pointerEvents: 'none' }}>
            <line x1={L.threadStart} y1={L.centerY} x2={L.threadEnd} y2={L.centerY}
              stroke={THREAD_COLOR} strokeWidth={1.5} />

            {L.tracks.map((t, i) => (
              <path key={`t-${i}`} d={t.path} fill="none"
                stroke={t.color} strokeWidth={t.width} opacity={t.opacity ?? 0.8}
                strokeDasharray={t.dashed ? '6 4' : undefined}
                transform={`translate(0, ${L.centerY})`} />
            ))}
          </svg>

          {/* Nodes */}
          {L.nodes.map((node, i) => {
            if (node.kind === 'label') {
              return (
                <div key={`l-${i}`} className="wt-label" style={{
                  position: 'absolute', left: node.pos.x, top: node.pos.y,
                  cursor: onSessionClick && node.session ? 'pointer' : 'default',
                  whiteSpace: 'nowrap',
                }}
                  onClick={onSessionClick && node.session ? () => onSessionClick(node.session!) : undefined}
                  onMouseEnter={node.tooltip ? () => handleHover(node.tooltip, node.pos) : undefined}
                  onMouseLeave={node.tooltip ? clearHover : undefined}
                >
                  <span style={{ fontSize: 12, fontWeight: 700, color: node.color, letterSpacing: '0.01em', display: 'block' }}>
                    {node.title}
                  </span>
                  <span style={{ fontSize: 10, color: TEXT_MUTED, display: 'flex', gap: 8, marginTop: 1 }}>
                    {node.sub && <span>{node.sub}</span>}
                    {node.timestamp && <span style={{ color: TEXT_SECONDARY }}>{node.timestamp}</span>}
                  </span>
                </div>
              );
            }

            if (node.kind === 'dot') {
              const r = node.size === 'lg' ? 6 : 4;
              return (
                <div key={`d-${i}`}
                  onMouseEnter={node.tooltip ? () => handleHover(node.tooltip, node.pos) : undefined}
                  onMouseLeave={node.tooltip ? clearHover : undefined}
                  style={{
                    position: 'absolute', left: node.pos.x - r, top: node.pos.y - r,
                    width: r * 2, height: r * 2, borderRadius: '50%',
                    background: node.color,
                    boxShadow: `0 0 ${node.size === 'lg' ? 10 : 5}px ${node.color}50`,
                    zIndex: 2,
                    cursor: node.tooltip ? 'pointer' : 'default',
                  }} />
              );
            }

            if (node.kind === 'gap') {
              return (
                <div key={`g-${i}`} style={{
                  position: 'absolute', left: node.pos.x, top: node.pos.y,
                  width: 72, height: 22,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, color: TEXT_MUTED, letterSpacing: '0.04em',
                }}>
                  {node.label}
                </div>
              );
            }
            return null;
          })}

          {/* Tooltip overlay */}
          {hovered && <Tooltip data={hovered.tooltip} pos={hovered.pos} />}
        </div>
      </div>
    </>
  );

  if (fullscreen) {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 9998,
        background: '#f8f9fb',
        display: 'flex', flexDirection: 'column',
        padding: '16px 24px',
      }}>
        <button onClick={() => setFullscreen(false)} style={{
          position: 'absolute', top: 16, right: 24, zIndex: 1,
          padding: '6px 14px', fontSize: 12, fontWeight: 700,
          border: `1px solid ${THREAD_COLOR}`, borderRadius: 4,
          background: '#fff', color: MAIN_COLOR,
          cursor: 'pointer', fontFamily: FONT,
        }}>
          Close
        </button>
        <div className="work-timeline" data-testid="work-timeline" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {timelineContent}
        </div>
      </div>
    );
  }

  const needsClip = maxHeight && L.totalH > maxHeight;

  return (
    <div className="work-timeline" data-testid="work-timeline" style={{ position: 'relative' }}>
      <div style={needsClip ? { maxHeight, overflow: 'hidden' } : undefined}>
        {timelineContent}
      </div>
      {needsClip && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: 64,
          background: 'linear-gradient(transparent, #f8f9fb)',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          paddingBottom: 10,
        }}>
          <button onClick={() => { setExpanded(true); setFullscreen(true); }} style={{
            padding: '5px 16px', fontSize: 11, fontWeight: 700,
            border: `1px solid ${THREAD_COLOR}`, borderRadius: 4,
            background: '#fff', color: MAIN_COLOR,
            cursor: 'pointer', fontFamily: FONT, letterSpacing: '0.03em',
            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          }}>
            EXPAND TIMELINE
          </button>
        </div>
      )}
    </div>
  );
}
