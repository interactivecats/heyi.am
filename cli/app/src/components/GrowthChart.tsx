import { useEffect, useRef } from 'react'
import type { Session } from '../types'
import { formatLoc } from '../format'

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
  accentColor?: string
  isDark?: boolean
  /** When true, both additions and deletions render as positive upward lines on a shared scale */
  dualPositive?: boolean
  /** Visual variant: 'default' uses step-style paths, 'radar' uses polyline paths with line-draw animation and glow effects */
  variant?: 'default' | 'radar'
}

const FONT = "'IBM Plex Mono', monospace"
const PRIMARY = '#084471'
const TEXT_MUTED = '#9ca3af'
const TEXT_SECONDARY = '#6b7280'
const GRID_COLOR = '#e4e4e7'

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

// ── Component ────────────────────────────────────────────────────

export function GrowthChart({ sessions, totalLoc, totalFiles, keyMoments, onSessionClick, isDark, accentColor, dualPositive, variant = 'default' }: GrowthChartProps) {
  const isRadar = variant === 'radar'

  // Refs for radar line-draw animation
  const addLineRef = useRef<SVGPolylineElement>(null)
  const delLineRef = useRef<SVGPolylineElement>(null)
  const addAreaRef = useRef<SVGPathElement>(null)
  const delAreaRef = useRef<SVGPathElement>(null)
  const chartRef = useRef<HTMLDivElement>(null)

  // Theme-aware colors — deletion uses accent at reduced opacity for monochromatic look
  const accentVal = isRadar ? (isDark ? '#22d3ee' : '#0891b2') : (accentColor || (isDark ? '#f97316' : PRIMARY))
  const colors = isDark ? {
    textMuted: isRadar ? '#94a3b8' : 'rgba(255,255,255,0.4)',
    textSecondary: isRadar ? '#cbd5e1' : 'rgba(255,255,255,0.65)',
    grid: isRadar ? 'rgba(34,211,238,0.04)' : 'rgba(255,255,255,0.06)',
    gridAxis: isRadar ? 'rgba(34,211,238,0.08)' : 'rgba(255,255,255,0.06)',
    text: '#fafafa',
    accent: accentVal,
    dotStroke: 'rgba(0,0,0,0.3)',
  } : {
    textMuted: isRadar ? '#64748b' : TEXT_MUTED,
    textSecondary: isRadar ? '#64748b' : TEXT_SECONDARY,
    grid: isRadar ? 'rgba(100,116,139,0.08)' : GRID_COLOR,
    gridAxis: isRadar ? 'rgba(100,116,139,0.15)' : GRID_COLOR,
    text: '#191c1e',
    accent: accentVal,
    dotStroke: '#fff',
  }

  const points = buildTimeSeries(sessions)

  if (points.length === 0) {
    return (
      <div style={{ fontFamily: FONT, fontSize: '0.75rem', color: colors.textSecondary, padding: 16 }}>
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

  const baseWidth = 700
  // Width based on compressed time, but also ensure minimum spacing per session point
  const timeBasedWidth = Math.round(totalVisualTime / 60000 * 0.8) + 120
  const pointBasedWidth = points.length * 12 + 120
  const svgWidth = Math.max(baseWidth, timeBasedWidth, pointBasedWidth)
  const padLeft = 48
  const padRight = 16
  const padTop = 24
  const padBottom = 36
  const maxVT = totalVisualTime || 1
  const toX = (vt: number) => padLeft + (vt / maxVT) * (svgWidth - padLeft - padRight)

  // Layout depends on mode
  let addChartH: number, delChartH: number, gapH: number, svgHeight: number
  let baseline: number
  let axisMax: number, deleteAxisMax: number
  let ticks: number[], deleteTicks: number[]
  let toYAdd: (val: number) => number
  let toYDel: (val: number) => number

  if (dualPositive) {
    // Both lines share one Y scale, both go upward
    const maxVal = Math.max(totalAdded, totalDeleted, 1)
    ticks = computeAxisTicks(maxVal)
    axisMax = ticks[ticks.length - 1] || 1
    deleteTicks = []
    deleteAxisMax = 0
    addChartH = 160
    delChartH = 0
    gapH = 0
    svgHeight = padTop + addChartH + padBottom
    baseline = padTop + addChartH
    toYAdd = (val: number) => baseline - (val / axisMax) * addChartH
    toYDel = toYAdd // same scale
  } else {
    // Split axis: additions above, deletions below
    const maxVal = Math.max(totalAdded, 1)
    ticks = computeAxisTicks(maxVal)
    axisMax = ticks[ticks.length - 1] || 1
    deleteTicks = hasDeleteData ? computeAxisTicks(totalDeleted) : []
    deleteAxisMax = hasDeleteData ? (deleteTicks[deleteTicks.length - 1] || 1) : 0
    addChartH = 140
    delChartH = hasDeleteData ? 50 : 0
    gapH = hasDeleteData ? 2 : 0
    svgHeight = padTop + addChartH + gapH + delChartH + padBottom
    baseline = padTop + addChartH
    toYAdd = (val: number) => baseline - (val / axisMax) * addChartH
    toYDel = (val: number) => baseline + gapH + (val / deleteAxisMax) * delChartH
  }

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

  // Smooth polyline path: straight lines connecting each data point (no step)
  function smoothPath(coords: Array<{ x: number; y: number }>): string {
    if (coords.length === 0) return ''
    return coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ')
  }

  const buildPath = isRadar ? smoothPath : stepPath

  const addPath = buildPath(addCoords)
  const addAreaPath = addPath +
    ` L${addCoords[addCoords.length - 1].x.toFixed(1)},${baseline}` +
    ` L${addCoords[0].x.toFixed(1)},${baseline} Z`

  const delPath = hasDeleteData ? buildPath(delCoords) : ''
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

  // Radar line-draw animation via IntersectionObserver
  useEffect(() => {
    if (!isRadar) return

    const prefersReducedMotion = typeof window !== 'undefined'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const lines = [addLineRef.current, delLineRef.current].filter(
      (el): el is SVGPolylineElement => el !== null,
    )
    const areas = [addAreaRef.current, delAreaRef.current].filter(
      (el): el is SVGPathElement => el !== null,
    )

    if (prefersReducedMotion) {
      // Show everything immediately, no animation
      for (const area of areas) {
        area.style.opacity = '1'
      }
      return
    }

    // Set initial state: lines hidden via dashoffset, areas invisible
    for (const line of lines) {
      const len = line.getTotalLength()
      line.style.strokeDasharray = `${len}`
      line.style.strokeDashoffset = `${len}`
      line.style.transition = 'none'
    }
    for (const area of areas) {
      area.style.opacity = '0'
      area.style.transition = 'none'
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            requestAnimationFrame(() => {
              for (const line of lines) {
                line.style.transition = 'stroke-dashoffset 1.2s ease-out'
                line.style.strokeDashoffset = '0'
              }
              // Fade in areas after a delay
              setTimeout(() => {
                for (const area of areas) {
                  area.style.transition = 'opacity 0.8s ease-out'
                  area.style.opacity = '1'
                }
              }, 400)
            })
            observer.disconnect()
          }
        }
      },
      { threshold: 0.2 },
    )

    if (chartRef.current) observer.observe(chartRef.current)
    return () => observer.disconnect()
  }, [isRadar, points.length])

  return (
    <div ref={chartRef}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        padding: '8px 12px', borderBottom: `1px solid ${colors.grid}`, fontFamily: FONT,
      }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {dualPositive ? 'Lines Changed' : 'Code Changes Over Time'}
        </span>
        <div style={{ display: 'flex', gap: 16, fontSize: 11, fontWeight: 600 }}>
          <span style={{ color: colors.accent }}>+{formatLoc(totalAdded)}</span>
          {hasDeleteData && <span style={{ color: colors.textSecondary }}>-{formatLoc(totalDeleted)}</span>}
          <span style={{ color: colors.text }}>{formatLoc(totalLoc)} total</span>
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
              <stop offset="0%" stopColor={colors.accent} stopOpacity={isRadar ? 0.05 : 0.12} />
              <stop offset="100%" stopColor={colors.accent} stopOpacity={isRadar ? 0.05 : 0.02} />
            </linearGradient>
            <linearGradient id="delGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={colors.accent} stopOpacity={isRadar ? 0.05 : (dualPositive ? 0.12 : 0.02)} />
              <stop offset="100%" stopColor={colors.accent} stopOpacity={isRadar ? 0.05 : (dualPositive ? 0.02 : 0.1)} />
            </linearGradient>
            {isRadar && (
              <filter id="dotGlow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="2" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            )}
          </defs>

          {/* Y-axis grid */}
          {ticks.map(tick => (
            <g key={`ya-${tick}`}>
              <line x1={padLeft} y1={toYAdd(tick)} x2={svgWidth - padRight} y2={toYAdd(tick)}
                stroke={colors.grid} strokeWidth="0.5" strokeDasharray="4,4" />
              <text x={padLeft - 8} y={toYAdd(tick) + 3} textAnchor="end"
                fontFamily={FONT} fontSize="8" fill={colors.textMuted}>
                {tick === 0 ? '' : dualPositive ? formatLocAxis(tick) : `+${formatLocAxis(tick)}`}
              </text>
            </g>
          ))}

          {/* Y-axis vertical line (radar only) */}
          {isRadar && (
            <line x1={padLeft} y1={padTop} x2={padLeft} y2={baseline + gapH + delChartH}
              stroke={colors.gridAxis} strokeWidth="1" />
          )}

          {/* Baseline */}
          <line x1={padLeft} y1={baseline} x2={svgWidth - padRight} y2={baseline}
            stroke={isRadar ? colors.gridAxis : colors.grid} strokeWidth="1" />
          <text x={padLeft - 8} y={baseline + 3} textAnchor="end"
            fontFamily={FONT} fontSize="8" fill={colors.textSecondary} fontWeight="600">
            0
          </text>

          {/* Y-axis grid — deletions (split mode only) */}
          {!dualPositive && hasDeleteData && deleteTicks.filter(t => t > 0).map(tick => (
            <g key={`yd-${tick}`}>
              <line x1={padLeft} y1={toYDel(tick)} x2={svgWidth - padRight} y2={toYDel(tick)}
                stroke={colors.grid} strokeWidth="0.5" strokeDasharray="4,4" />
              <text x={padLeft - 8} y={toYDel(tick) + 3} textAnchor="end"
                fontFamily={FONT} fontSize="8" fill={colors.textMuted}>
                {`-${formatLocAxis(tick)}`}
              </text>
            </g>
          ))}

          {/* Month dividers (vertical lines only, dates shown per-point) */}
          {monthDividers.map((div, i) => (
            <line key={`m-${i}`} x1={div.x} y1={padTop} x2={div.x} y2={baseline + gapH + delChartH}
              stroke={colors.grid} strokeWidth="0.5" strokeDasharray="2,4" />
          ))}

          {/* Additions area + line */}
          {isRadar ? (
            <>
              <path ref={addAreaRef} d={addAreaPath} fill={`${colors.accent}0D`} />
              <polyline
                ref={addLineRef}
                points={addCoords.map(c => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ')}
                fill="none" stroke={colors.accent} strokeWidth="1.5"
                strokeLinecap="round" strokeLinejoin="round"
              />
            </>
          ) : (
            <>
              <path d={addAreaPath} fill="url(#addGrad)" />
              <path d={addPath} fill="none" stroke={colors.accent} strokeWidth="1.5" />
            </>
          )}

          {/* Deletions area + line — same accent color at 40% opacity */}
          {hasDeleteData && (
            <g opacity="0.4">
              {isRadar ? (
                <>
                  <path ref={delAreaRef} d={delAreaPath} fill={`${colors.accent}0D`} />
                  <polyline
                    ref={delLineRef}
                    points={delCoords.map(c => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ')}
                    fill="none" stroke={colors.accent} strokeWidth="1.5"
                    strokeLinecap="round" strokeLinejoin="round"
                  />
                </>
              ) : (
                <>
                  <path d={delAreaPath} fill="url(#delGrad)" />
                  <path d={delPath} fill="none" stroke={colors.accent} strokeWidth="1.5" />
                </>
              )}
            </g>
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
                    fill={colors.accent} stroke={colors.dotStroke} strokeWidth="2"
                    filter={isRadar ? 'url(#dotGlow)' : undefined} />
                ) : showLabel ? (
                  <circle cx={x} cy={toYAdd(p.cumulativeAdded)} r="3"
                    fill={colors.accent} filter={isRadar ? 'url(#dotGlow)' : undefined} />
                ) : null}

                {/* Deletion dot — 40% opacity to match deletion line */}
                {hasDeleteData && p.cumulativeDeleted > 0 && showLabel && (
                  <circle cx={x} cy={toYDel(p.cumulativeDeleted)} r="2.5" opacity="0.4"
                    fill={colors.accent} filter={isRadar ? 'url(#dotGlow)' : undefined} />
                )}

                {/* Key moment annotation */}
                {isKey && (
                  <text x={x} y={toYAdd(p.cumulativeAdded) - 12}
                    textAnchor="middle" fontFamily={FONT} fontSize="8" fill={colors.textSecondary}>
                    {momentMap.get(p.sessionId)}
                  </text>
                )}

                {/* Date on x-axis */}
                {showLabel && (
                  <text x={x} y={svgHeight - 8} textAnchor="middle"
                    fontFamily={FONT} fontSize="8" fill={colors.textMuted}>
                    {new Date(p.dateMs).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </text>
                )}
              </g>
            )
          })}
        </svg>
      </div>

      {/* Summary bar with legend swatches */}
      <div style={{
        display: 'flex', gap: 24, padding: '8px 12px',
        borderTop: `1px solid ${colors.grid}`,
        fontFamily: FONT, fontSize: 10,
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 16, height: 3, background: colors.accent, borderRadius: 1, flexShrink: 0 }} />
            <span style={{ fontSize: 14, fontWeight: 700, color: colors.accent }}>+{formatLoc(totalAdded)}</span>
          </div>
          <div style={{ color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginTop: 2 }}>Added</div>
        </div>
        {hasDeleteData && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 16, height: 3, background: colors.accent, opacity: 0.4, borderRadius: 1, flexShrink: 0 }} />
              <span style={{ fontSize: 14, fontWeight: 700, color: colors.textSecondary }}>-{formatLoc(totalDeleted)}</span>
            </div>
            <div style={{ color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginTop: 2 }}>Removed</div>
          </div>
        )}
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: colors.text }}>{formatLoc(totalLoc)}</div>
          <div style={{ color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Lines changed</div>
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: colors.text }}>{totalFiles}</div>
          <div style={{ color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Files</div>
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: colors.text }}>{points.length}</div>
          <div style={{ color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Sessions</div>
        </div>
      </div>
    </div>
  )
}
