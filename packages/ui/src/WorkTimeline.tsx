import { useMemo, useState } from 'react';
import type { Session } from './types';

export interface WorkTimelineProps {
  sessions: Session[];
  onSessionClick?: (session: Session) => void;
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
const THREAD_COLOR = '#e5e7eb';
const FONT = "'IBM Plex Mono', monospace";

function agentColor(role?: string): string {
  if (!role) return '#6b7280';
  return AGENT_COLORS[role.toLowerCase()] ?? '#6b7280';
}

// ── Time helpers ─────────────────────────────────────────────────

function sessionStart(s: Session): number { return new Date(s.date).getTime(); }
function sessionEnd(s: Session): number {
  return s.endTime ? new Date(s.endTime).getTime() : sessionStart(s) + s.durationMinutes * 60_000;
}
function formatGap(ms: number): string {
  const h = ms / 3_600_000;
  if (h < 20) return `${Math.round(h)}h`;
  const d = Math.round(h / 24);
  return d === 1 ? '1 day' : `${d} days`;
}

// ── Segment computation ──────────────────────────────────────────

const GAP_MS = 3_600_000;
const MIN_W = 180;
const MAX_W = 400;
const MIN_CW = 140;

function timeToPx(minutes: number): number {
  if (minutes <= 30) return minutes * 5;
  return 150 + Math.log2(minutes / 30) * 80;
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

// ── Children helper ──────────────────────────────────────────────

interface Child { id: string; role?: string; durationMinutes: number; linesOfCode: number }

function getChildren(s: Session): Child[] {
  if (s.childSessions?.length) return s.childSessions.map(c => ({ id: c.id, role: c.agentRole, durationMinutes: c.durationMinutes, linesOfCode: c.linesOfCode }));
  if (s.children?.length) return s.children.map(c => ({ id: c.sessionId, role: c.role, durationMinutes: c.durationMinutes ?? 0, linesOfCode: c.linesOfCode ?? 0 }));
  return [];
}

// ── Layout ───────────────────────────────────────────────────────

const LANE_GAP = 56;
const SEG_GAP = 48;
const CURVE_CP = 50;
const MAX_VISIBLE_AGENTS = 3;
const MAX_TITLE = 28;

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + '\u2026';
}

interface Pos { x: number; y: number }

interface LLabel { kind: 'label'; pos: Pos; title: string; sub?: string; color: string; above: boolean; session?: Session }
interface LPill { kind: 'pill'; pos: Pos; role: string; color: string }
interface LDot { kind: 'dot'; pos: Pos; color: string; size: 'sm' | 'lg' }
interface LGap { kind: 'gap'; pos: Pos; label: string }
type LNode = LLabel | LPill | LDot | LGap;

interface LTrack { path: string; color: string; width: number; dashed?: boolean }

interface Layout {
  nodes: LNode[];
  tracks: LTrack[];
  threadStart: number;
  threadEnd: number;
  totalW: number;
  totalH: number;
  centerY: number;
}

// Cubic bezier: fork from center to a lane Y, then back
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

function layout(segments: Seg[]): Layout {
  const nodes: LNode[] = [];
  const tracks: LTrack[] = [];
  let cx = 40;
  const cY = 0;
  let minY = 0, maxY = 0;
  const threadStart = cx;

  const bound = (y: number, h: number) => { if (y < minY) minY = y; if (y + h > maxY) maxY = y + h; };

  for (const seg of segments) {
    if (seg.type === 'gap') {
      tracks.push({ path: `M ${cx} ${cY} L ${cx + 60} ${cY}`, color: '#94a3b8', width: 2, dashed: true });
      nodes.push({ kind: 'gap', pos: { x: cx, y: cY + 14 }, label: formatGap(seg.durationMs) });
      bound(cY - 6, 36);
      cx += 64 + SEG_GAP;
      continue;
    }

    if (seg.type === 'session') {
      const s = seg.session;
      const kids = getChildren(s);
      const childCount = s.childCount ?? s.children?.length ?? 0;
      const dur = (seg.endMs - seg.startMs) / 60_000;
      const w = Math.min(Math.max(timeToPx(dur), MIN_W), MAX_W);
      const sub = `${s.durationMinutes}m`;

      if (kids.length > 0) {
        const visible = kids.slice(0, MAX_VISIBLE_AGENTS);
        const hidden = kids.length - visible.length;
        const n = visible.length;
        const totalSpread = (n - 1) * LANE_GAP;
        const forkX = cx;
        const joinX = cx + w;
        const topLaneY = cY - totalSpread / 2;

        // Session title — well above topmost lane and its pill
        const titleY = topLaneY - 38;
        const flatStartXTitle = forkX + CURVE_CP * 2;
        nodes.push({ kind: 'label', pos: { x: flatStartXTitle + 8, y: titleY }, title: truncate(s.title, MAX_TITLE), sub, color: MAIN_COLOR, above: true, session: s });
        bound(titleY - 2, 16);

        // Fork dot
        nodes.push({ kind: 'dot', pos: { x: forkX, y: cY }, color: MAIN_COLOR, size: 'lg' });

        // Agent tracks + pill labels
        // Pills go in the FLAT zone (past the S-curve), on the OUTWARD side of each lane
        const flatStartX = forkX + CURVE_CP * 2;

        visible.forEach((kid, i) => {
          const laneY = topLaneY + i * LANE_GAP;
          const color = agentColor(kid.role);

          tracks.push({ path: bezierForkJoin(forkX, joinX, cY, laneY), color, width: 2 });

          // Left-align pill in the flat zone, outward from center
          const onCenter = Math.abs(laneY - cY) < 4;
          const pillX = flatStartX + 8;
          const pillY = (laneY < cY && !onCenter)
            ? laneY - 16   // above-center: pill above the line
            : laneY + 14;  // center or below: pill below the line

          nodes.push({ kind: 'pill', pos: { x: pillX, y: pillY }, role: kid.role ?? 'agent', color });
          const pillTop = Math.min(laneY, pillY);
          const pillBot = Math.max(laneY, pillY + 16);
          bound(pillTop - 2, pillBot - pillTop + 4);
        });

        // "+N more" below the bottom lane's pill
        if (hidden > 0) {
          const bottomLaneY = topLaneY + (n - 1) * LANE_GAP;
          const extraY = Math.max(bottomLaneY + 14 + 18, cY + 30);
          nodes.push({ kind: 'label', pos: { x: flatStartX + 8, y: extraY }, title: `+${hidden} more`, color: '#9ca3af', above: false });
          bound(extraY, 14);
        }

        // Join dot
        nodes.push({ kind: 'dot', pos: { x: joinX, y: cY }, color: MAIN_COLOR, size: 'lg' });
        cx = joinX + SEG_GAP;
      } else {
        // Solo session
        nodes.push({ kind: 'label', pos: { x: cx + 12, y: cY - 22 }, title: truncate(s.title, MAX_TITLE), sub, color: MAIN_COLOR, above: true, session: s });
        bound(cY - 26, 22);
        nodes.push({ kind: 'dot', pos: { x: cx, y: cY }, color: MAIN_COLOR, size: 'sm' });
        nodes.push({ kind: 'dot', pos: { x: cx + w, y: cY }, color: MAIN_COLOR, size: 'sm' });
        tracks.push({ path: `M ${cx} ${cY} L ${cx + w} ${cY}`, color: MAIN_COLOR, width: 3.5 });
        cx += w + SEG_GAP;
      }
      continue;
    }

    if (seg.type === 'concurrent') {
      const sorted = [...seg.sessions].sort((a, b) => sessionStart(a) - sessionStart(b));
      const n = sorted.length;
      const laneWs = sorted.map(s => {
        const dur = (sessionEnd(s) - sessionStart(s)) / 60_000;
        return Math.min(Math.max(timeToPx(dur), MIN_CW), MAX_W);
      });
      const maxLW = Math.max(...laneWs);
      const totalW = maxLW + CURVE_CP * 4 + 32;
      const totalSpread = (n - 1) * LANE_GAP;
      const forkX = cx;
      const joinX = cx + totalW;

      nodes.push({ kind: 'dot', pos: { x: forkX, y: cY }, color: MAIN_COLOR, size: 'lg' });

      sorted.forEach((s, i) => {
        const laneY = cY - totalSpread / 2 + i * LANE_GAP;
        const above = laneY <= cY;

        tracks.push({ path: bezierForkJoin(forkX, joinX, cY, laneY), color: MAIN_COLOR, width: 1.5 });

        const labelOff = above ? laneY - 16 : laneY + 4;
        const labelX = forkX + CURVE_CP * 2 + 12;
        nodes.push({ kind: 'label', pos: { x: labelX, y: labelOff }, title: truncate(s.title, MAX_TITLE), sub: `${s.durationMinutes}m`, color: MAIN_COLOR, above, session: s });
        bound(above ? labelOff - 2 : laneY - 4, above ? 20 : labelOff + 16 - laneY + 4);
      });

      nodes.push({ kind: 'dot', pos: { x: joinX, y: cY }, color: MAIN_COLOR, size: 'lg' });
      cx = joinX + SEG_GAP;
    }
  }

  const threadEnd = cx - SEG_GAP;
  const pad = 28;
  const yShift = -minY + pad;
  const totalH = maxY - minY + pad * 2;

  return {
    nodes: nodes.map(n => ({ ...n, pos: { x: n.pos.x, y: n.pos.y + yShift } })),
    tracks,
    threadStart,
    threadEnd,
    totalW: cx + 40,
    totalH: Math.max(totalH, 80),
    centerY: cY + yShift,
  };
}

// ── Renderer ─────────────────────────────────────────────────────

export function WorkTimeline({ sessions, onSessionClick }: WorkTimelineProps) {
  const L = useMemo(() => layout(computeSegments(sessions)), [sessions]);
  const [hoveredDot, setHoveredDot] = useState<number | null>(null);

  if (!sessions.length) {
    return (
      <div className="work-timeline" data-testid="work-timeline-empty">
        <p style={{ fontFamily: FONT, fontSize: '0.75rem', color: '#6b7280' }}>No sessions to display.</p>
      </div>
    );
  }

  return (
    <div className="work-timeline" data-testid="work-timeline"
      style={{ overflowX: 'auto', overflowY: 'hidden', WebkitOverflowScrolling: 'touch', paddingBottom: 8 }}>
      <div style={{ position: 'relative', width: L.totalW, height: L.totalH, fontFamily: FONT }}>

        {/* SVG layer: grid + thread + tracks */}
        <svg style={{ position: 'absolute', inset: 0, width: L.totalW, height: L.totalH, pointerEvents: 'none' }}>
          {/* Blueprint grid */}
          <defs>
            <pattern id="wt-grid" width="32" height="32" patternUnits="userSpaceOnUse">
              <path d="M 32 0 L 0 0 0 32" fill="none" stroke="#9ca3af" strokeWidth="0.3" opacity="0.3" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#wt-grid)" />

          {/* Main thread */}
          <line x1={L.threadStart} y1={L.centerY} x2={L.threadEnd} y2={L.centerY}
            stroke={THREAD_COLOR} strokeWidth={1.5} />

          {/* Tracks (bezier curves, relative to cY=0, shifted by centerY) */}
          {L.tracks.map((t, i) => (
            <path key={`t-${i}`} d={t.path} fill="none"
              stroke={t.color} strokeWidth={t.width} opacity={0.75}
              strokeDasharray={t.dashed ? '4 4' : undefined}
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
              >
                <span style={{ fontSize: 10, fontWeight: 700, color: node.color, letterSpacing: '0.02em' }}>
                  {node.title}
                </span>
                {node.sub && (
                  <span style={{ fontSize: 8, color: '#9ca3af', marginLeft: 6 }}>
                    {node.sub}
                  </span>
                )}
              </div>
            );
          }

          if (node.kind === 'pill') {
            return (
              <div key={`p-${i}`} className="wt-pill" style={{
                position: 'absolute', left: node.pos.x, top: node.pos.y,
                background: `${node.color}10`,
                border: `1px solid ${node.color}25`,
                borderRadius: 4,
                padding: '1px 7px',
                whiteSpace: 'nowrap',
              }}>
                <span style={{ fontSize: 8, fontWeight: 700, color: node.color, letterSpacing: '0.05em' }}>
                  {node.role.toUpperCase()}
                </span>
              </div>
            );
          }

          if (node.kind === 'dot') {
            const r = node.size === 'lg' ? 6 : 4;
            return (
              <div key={`d-${i}`} style={{
                position: 'absolute', left: node.pos.x - r, top: node.pos.y - r,
                width: r * 2, height: r * 2, borderRadius: '50%',
                background: node.color,
                boxShadow: `0 0 ${node.size === 'lg' ? 12 : 6}px ${node.color}60`,
                zIndex: 2,
              }} />
            );
          }

          if (node.kind === 'gap') {
            return (
              <div key={`g-${i}`} style={{
                position: 'absolute', left: node.pos.x, top: node.pos.y,
                width: 60, height: 20,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 8, color: '#9ca3af', letterSpacing: '0.06em',
                textTransform: 'uppercase' as const,
              }}>
                {node.label}
              </div>
            );
          }
          return null;
        })}
      </div>
    </div>
  );
}
