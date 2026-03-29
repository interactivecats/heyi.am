import type { Session } from '../types'

// ── Growth Chart ─────────────────────────────────────────────────
// Time-sorted cumulative additions + deletions.
// One point per session, sorted by date. No session-level bucketing —
// parallel sessions just land at their start time.

interface GrowthChartProps {
  sessions: Session[]
  totalLoc: number
  totalFiles: number
  keyMoments?: Array<{ sessionId: string; label: string }>
  onSessionClick?: (session: Session) => void
}

const FONT = "'IBM Plex Mono', monospace"
const PRIMARY = '#084471'
const GREEN = '#16a34a'
const RED = '#dc2626'
const TEXT_MUTED = '#9ca3af'
const TEXT_SECONDARY = '#6b7280'
const GRID_COLOR = '#e4e4e7'

function formatLoc(loc: number): string {
  if (loc < 1000) return String(loc)
  return `${(loc / 1000).toFixed(1)}k`
}

function formatLocAxis(n: number): string {
  if (n === 0) return '0'
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`
  return String(n)
}

function computeAxisTicks(maxVal: number): number[] {
  if (maxVal <= 0) return [0]
  const rawStep = maxVal / 4
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)))
  const nice = [1, 2, 2.5, 5, 10]
  let step = magnitude
  for (const n of nice) {
    if (n * magnitude >= rawStep) { step = n * magnitude; break }
  }
  const ticks: number[] = []
  for (let v = 0; v <= maxVal + step * 0.1; v += step) ticks.push(Math.round(v))
  if (ticks[ticks.length - 1] < maxVal) ticks.push(ticks[ticks.length - 1] + Math.round(step))
  return ticks
}

// ── Build time series ────────────────────────────────────────────

interface DataPoint {
  dateMs: number
  cumulativeAdded: number
  cumulativeDeleted: number
  sessionIndex: number
  sessionId: string
  title: string
  added: number
  deleted: number
}

function buildTimeSeries(sessions: Session[]): DataPoint[] {
  const sorted = [...sessions]
    .filter(s => s.date)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  if (sorted.length === 0) return []

  let cumAdded = 0
  let cumDeleted = 0

  return sorted.map((s, i) => {
    let added = 0
    let deleted = 0

    if (s.filesChanged && s.filesChanged.length > 0) {
      for (const f of s.filesChanged) {
        added += f.additions
        deleted += f.deletions
      }
    } else {
      // Fallback: treat linesOfCode as net additions
      added = Math.max(0, s.linesOfCode)
    }

    cumAdded += added
    cumDeleted += deleted

    return {
      dateMs: new Date(s.date).getTime(),
      cumulativeAdded: cumAdded,
      cumulativeDeleted: cumDeleted,
      sessionIndex: i,
      sessionId: s.id,
      title: s.title,
      added,
      deleted,
    }
  })
}

// ── Gap compression ──────────────────────────────────────────────
// Compress gaps > 1h to a fixed visual width so the chart isn't dominated by idle time

const GAP_THRESHOLD_MS = 60 * 60 * 1000
const COMPRESSED_GAP_MS = 10 * 60 * 1000

function compressTime(points: DataPoint[]): { visualTimes: number[]; totalVisualTime: number } {
  if (points.length === 0) return { visualTimes: [], totalVisualTime: 0 }

  const visualTimes: number[] = [0]
  let vt = 0

  for (let i = 1; i < points.length; i++) {
    const gap = points[i].dateMs - points[i - 1].dateMs
    vt += gap > GAP_THRESHOLD_MS ? COMPRESSED_GAP_MS : Math.max(gap, 0)
    visualTimes.push(vt)
  }

  return { visualTimes, totalVisualTime: vt }
}

// ── Month dividers ───────────────────────────────────────────────

function computeMonthDividers(
  points: DataPoint[],
  visualTimes: number[],
  toX: (vt: number) => number,
): Array<{ x: number; label: string }> {
  if (points.length < 2) return []

  const firstMs = points[0].dateMs
  const lastMs = points[points.length - 1].dateMs
  if (lastMs - firstMs < 14 * 86400000) return []

  const dividers: Array<{ x: number; label: string }> = []
  const firstDate = new Date(firstMs)
  const lastDate = new Date(lastMs)

  const d = new Date(firstDate.getFullYear(), firstDate.getMonth() + 1, 1)
  while (d <= lastDate) {
    const targetMs = d.getTime()
    // Find closest point
    let closestIdx = 0
    let closestDist = Infinity
    for (let i = 0; i < points.length; i++) {
      const dist = Math.abs(points[i].dateMs - targetMs)
      if (dist < closestDist) { closestDist = dist; closestIdx = i }
    }
    dividers.push({
      x: toX(visualTimes[closestIdx]),
      label: d.toLocaleString('en-US', { month: 'short' }).toUpperCase(),
    })
    d.setMonth(d.getMonth() + 1)
  }
  return dividers
}

function truncTitle(t: string, max: number = 14): string {
  return t.length > max ? t.slice(0, max - 1) + '\u2026' : t
}

// ── Component ────────────────────────────────────────────────────

export function GrowthChart({ sessions, totalLoc, totalFiles, keyMoments, onSessionClick }: GrowthChartProps) {
  const points = buildTimeSeries(sessions)

  if (points.length === 0) {
    return (
      <div style={{ fontFamily: FONT, fontSize: '0.75rem', color: TEXT_SECONDARY, padding: 16 }}>
        No session data available for growth chart.
      </div>
    )
  }

  const { visualTimes, totalVisualTime } = compressTime(points)

  // Build key moment index
  const momentMap = new Map<string, string>()
  if (keyMoments) {
    for (const m of keyMoments) momentMap.set(m.sessionId, m.label)
  }

  const totalAdded = points[points.length - 1].cumulativeAdded
  const totalDeleted = points[points.length - 1].cumulativeDeleted
  const hasDeleteData = totalDeleted > 0
  const maxVal = Math.max(totalAdded, 1)
  const ticks = computeAxisTicks(maxVal)
  const axisMax = ticks[ticks.length - 1] || 1

  // Deletion ticks (separate scale below baseline)
  const deleteTicks = hasDeleteData ? computeAxisTicks(totalDeleted) : []
  const deleteAxisMax = hasDeleteData ? (deleteTicks[deleteTicks.length - 1] || 1) : 0

  const baseWidth = 700
  const svgWidth = Math.max(baseWidth, Math.round(totalVisualTime / 60000 * 0.8) + 120)
  const padLeft = 48
  const padRight = 16
  const padTop = 24
  const addChartH = 140
  const delChartH = hasDeleteData ? 50 : 0
  const gapH = hasDeleteData ? 2 : 0
  const padBottom = 36
  const svgHeight = padTop + addChartH + gapH + delChartH + padBottom

  const baseline = padTop + addChartH // zero line for additions

  const maxVT = totalVisualTime || 1
  const toX = (vt: number) => padLeft + (vt / maxVT) * (svgWidth - padLeft - padRight)
  const toYAdd = (val: number) => baseline - (val / axisMax) * addChartH
  const toYDel = (val: number) => baseline + gapH + (val / deleteAxisMax) * delChartH

  // Build paths — straight line segments (monotonic, no bezier loops)
  const addCoords = points.map((p, i) => ({ x: toX(visualTimes[i]), y: toYAdd(p.cumulativeAdded) }))
  const delCoords = hasDeleteData
    ? points.map((p, i) => ({ x: toX(visualTimes[i]), y: toYDel(p.cumulativeDeleted) }))
    : []

  // Step-style path: horizontal then vertical (shows when code was added, not interpolated)
  function stepPath(coords: Array<{ x: number; y: number }>): string {
    if (coords.length === 0) return ''
    let path = `M${coords[0].x.toFixed(1)},${coords[0].y.toFixed(1)}`
    for (let i = 1; i < coords.length; i++) {
      // Horizontal to new x, then vertical to new y
      path += ` L${coords[i].x.toFixed(1)},${coords[i - 1].y.toFixed(1)}`
      path += ` L${coords[i].x.toFixed(1)},${coords[i].y.toFixed(1)}`
    }
    return path
  }

  const addPath = stepPath(addCoords)
  const addAreaPath = addPath +
    ` L${addCoords[addCoords.length - 1].x.toFixed(1)},${baseline}` +
    ` L${addCoords[0].x.toFixed(1)},${baseline} Z`

  const delPath = hasDeleteData ? stepPath(delCoords) : ''
  const delAreaPath = hasDeleteData
    ? delPath +
      ` L${delCoords[delCoords.length - 1].x.toFixed(1)},${baseline + gapH}` +
      ` L${delCoords[0].x.toFixed(1)},${baseline + gapH} Z`
    : ''

  // Session label spacing
  const MIN_LABEL_GAP = 90
  const labelledIndices = new Set<number>()
  let lastLabelX = -Infinity
  for (let i = 0; i < points.length; i++) {
    const x = toX(visualTimes[i])
    if (x - lastLabelX >= MIN_LABEL_GAP) {
      labelledIndices.add(i)
      lastLabelX = x
    }
  }
  // Always include last
  if (points.length > 1) labelledIndices.add(points.length - 1)

  const monthDividers = computeMonthDividers(points, visualTimes, toX)
  const isScrollable = svgWidth > baseWidth
  const sortedSessions = [...sessions].filter(s => s.date).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  return (
    <div>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        padding: '8px 12px', borderBottom: `1px solid ${GRID_COLOR}`, fontFamily: FONT,
      }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Code Changes Over Time
        </span>
        <div style={{ display: 'flex', gap: 16, fontSize: 11, fontWeight: 600 }}>
          <span style={{ color: GREEN }}>+{formatLoc(totalAdded)}</span>
          {hasDeleteData && <span style={{ color: RED }}>-{formatLoc(totalDeleted)}</span>}
          <span style={{ color: '#191c1e' }}>{formatLoc(totalLoc)} total</span>
        </div>
      </div>

      {/* Chart */}
      <div style={isScrollable ? { overflowX: 'auto' } : { padding: '4px 0' }}>
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          width={isScrollable ? svgWidth : '100%'}
          height={isScrollable ? svgHeight : undefined}
          preserveAspectRatio="xMidYMid meet"
          style={{ display: 'block' }}
        >
          <defs>
            <linearGradient id="addGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={GREEN} stopOpacity={0.12} />
              <stop offset="100%" stopColor={GREEN} stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="delGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={RED} stopOpacity={0.02} />
              <stop offset="100%" stopColor={RED} stopOpacity={0.1} />
            </linearGradient>
          </defs>

          {/* Y-axis grid — additions */}
          {ticks.map(tick => (
            <g key={`ya-${tick}`}>
              <line x1={padLeft} y1={toYAdd(tick)} x2={svgWidth - padRight} y2={toYAdd(tick)}
                stroke={GRID_COLOR} strokeWidth="0.5" strokeDasharray="4,4" />
              <text x={padLeft - 8} y={toYAdd(tick) + 3} textAnchor="end"
                fontFamily={FONT} fontSize="8" fill={TEXT_MUTED}>
                {tick === 0 ? '' : `+${formatLocAxis(tick)}`}
              </text>
            </g>
          ))}

          {/* Baseline */}
          <line x1={padLeft} y1={baseline} x2={svgWidth - padRight} y2={baseline}
            stroke={GRID_COLOR} strokeWidth="1" />
          <text x={padLeft - 8} y={baseline + 3} textAnchor="end"
            fontFamily={FONT} fontSize="8" fill={TEXT_SECONDARY} fontWeight="600">
            0
          </text>

          {/* Y-axis grid — deletions */}
          {hasDeleteData && deleteTicks.filter(t => t > 0).map(tick => (
            <g key={`yd-${tick}`}>
              <line x1={padLeft} y1={toYDel(tick)} x2={svgWidth - padRight} y2={toYDel(tick)}
                stroke={GRID_COLOR} strokeWidth="0.5" strokeDasharray="4,4" />
              <text x={padLeft - 8} y={toYDel(tick) + 3} textAnchor="end"
                fontFamily={FONT} fontSize="8" fill={TEXT_MUTED}>
                {`-${formatLocAxis(tick)}`}
              </text>
            </g>
          ))}

          {/* Month dividers (vertical lines only, dates shown per-point) */}
          {monthDividers.map((div, i) => (
            <line key={`m-${i}`} x1={div.x} y1={padTop} x2={div.x} y2={baseline + gapH + delChartH}
              stroke={GRID_COLOR} strokeWidth="0.5" strokeDasharray="2,4" />
          ))}

          {/* Additions area + line */}
          <path d={addAreaPath} fill="url(#addGrad)" />
          <path d={addPath} fill="none" stroke={GREEN} strokeWidth="1.5" />

          {/* Deletions area + line */}
          {hasDeleteData && (
            <>
              <path d={delAreaPath} fill="url(#delGrad)" />
              <path d={delPath} fill="none" stroke={RED} strokeWidth="1.5" />
            </>
          )}

          {/* Session dots + labels */}
          {points.map((p, i) => {
            const x = toX(visualTimes[i])
            const isKey = momentMap.has(p.sessionId)
            const showLabel = labelledIndices.has(i)

            return (
              <g key={`pt-${i}`}
                style={onSessionClick ? { cursor: 'pointer' } : undefined}
                onClick={onSessionClick ? () => onSessionClick(sortedSessions[i]) : undefined}
              >
                {/* Addition dot */}
                {isKey ? (
                  <circle cx={x} cy={toYAdd(p.cumulativeAdded)} r="5"
                    fill={GREEN} stroke="#fff" strokeWidth="2" />
                ) : showLabel ? (
                  <circle cx={x} cy={toYAdd(p.cumulativeAdded)} r="3" fill={GREEN} />
                ) : null}

                {/* Deletion dot */}
                {hasDeleteData && p.cumulativeDeleted > 0 && showLabel && (
                  <circle cx={x} cy={toYDel(p.cumulativeDeleted)} r="2.5" fill={RED} />
                )}

                {/* Key moment annotation */}
                {isKey && (
                  <text x={x} y={toYAdd(p.cumulativeAdded) - 12}
                    textAnchor="middle" fontFamily={FONT} fontSize="8" fill={TEXT_SECONDARY}>
                    {momentMap.get(p.sessionId)}
                  </text>
                )}

                {/* Date on x-axis */}
                {showLabel && (
                  <text x={x} y={svgHeight - 8} textAnchor="middle"
                    fontFamily={FONT} fontSize="8" fill={TEXT_MUTED}>
                    {new Date(p.dateMs).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </text>
                )}
              </g>
            )
          })}
        </svg>
      </div>

      {/* Summary bar */}
      <div style={{
        display: 'flex', gap: 24, padding: '8px 12px',
        borderTop: `1px solid ${GRID_COLOR}`,
        fontFamily: FONT, fontSize: 10,
      }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: GREEN }}>+{formatLoc(totalAdded)}</div>
          <div style={{ color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Added</div>
        </div>
        {hasDeleteData && (
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: RED }}>-{formatLoc(totalDeleted)}</div>
            <div style={{ color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Deleted</div>
          </div>
        )}
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#191c1e' }}>{formatLoc(totalLoc)}</div>
          <div style={{ color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Lines changed</div>
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#191c1e' }}>{totalFiles}</div>
          <div style={{ color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Files</div>
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#191c1e' }}>{points.length}</div>
          <div style={{ color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Sessions</div>
        </div>
      </div>
    </div>
  )
}
