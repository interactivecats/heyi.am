import type { TurnEvent } from '../types'

interface SessionActivityTimelineProps {
  turns: TurnEvent[]
  totalTurns: number
  durationMinutes: number
}

const COLORS = {
  read: '#084471',
  edit: '#059669',
  bash: '#d97706',
  thinking: '#7c3aed',
  error: '#ba1a1a',
} as const

const CORRECTION_PATTERN = /\b(actually|wait|no,|wrong|that's not|stop|undo|revert|go back)\b/i

const READ_TOOLS = new Set(['Read', 'Grep', 'Glob', 'Search', 'LS'])
const EDIT_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit'])
const BASH_TOOLS = new Set(['Bash', 'BashOutput', 'RunCommand'])

function getBarColor(turn: TurnEvent): string {
  if (turn.type === 'error') return COLORS.error
  if (turn.type === 'thinking') return COLORS.thinking
  if (turn.type === 'response') return COLORS.thinking

  if (turn.tools && turn.tools.length > 0) {
    const tool = turn.tools[0]
    if (EDIT_TOOLS.has(tool)) return COLORS.edit
    if (READ_TOOLS.has(tool)) return COLORS.read
    if (BASH_TOOLS.has(tool)) return COLORS.bash
  }

  if (turn.type === 'tool') return COLORS.read
  if (turn.type === 'prompt') return COLORS.read
  return COLORS.thinking
}

function getBarHeight(turn: TurnEvent): number {
  const contentLen = turn.content?.length ?? 0
  const toolCount = turn.tools?.length ?? 0
  const complexity = Math.min(contentLen / 500, 1) * 0.6 + Math.min(toolCount / 5, 1) * 0.4
  return Math.max(12, Math.round(complexity * 58 + 12))
}

interface ProcessedBar {
  x: number
  height: number
  color: string
  isCorrection: boolean
}

function processWithTimestamps(turns: TurnEvent[], chartWidth: number): { bars: ProcessedBar[]; timeLabels: Array<{ x: number; label: string }> } {
  const timestamps = turns.map((t) => new Date(t.timestamp).getTime()).filter((t) => !isNaN(t))
  if (timestamps.length < 2) return processSimple(turns, chartWidth)

  const start = Math.min(...timestamps)
  const end = Math.max(...timestamps)
  const totalMs = end - start
  if (totalMs <= 0) return processSimple(turns, chartWidth)

  // Detect idle gaps > 5 min and compress them
  const GAP_THRESHOLD = 5 * 60 * 1000
  const sorted = turns.slice().sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

  // Build segments: active periods with compressed gaps between them
  const segments: Array<{ startMs: number; endMs: number; turns: TurnEvent[] }> = []
  let segStart = new Date(sorted[0].timestamp).getTime()
  let currentTurns: TurnEvent[] = [sorted[0]]

  for (let i = 1; i < sorted.length; i++) {
    const prevMs = new Date(sorted[i - 1].timestamp).getTime()
    const currMs = new Date(sorted[i].timestamp).getTime()
    if (currMs - prevMs > GAP_THRESHOLD) {
      segments.push({ startMs: segStart, endMs: prevMs, turns: currentTurns })
      segStart = currMs
      currentTurns = [sorted[i]]
    } else {
      currentTurns.push(sorted[i])
    }
  }
  segments.push({ startMs: segStart, endMs: new Date(sorted[sorted.length - 1].timestamp).getTime(), turns: currentTurns })

  // Allocate chart width proportionally to active duration, with compressed gap slots
  const GAP_WIDTH = 8
  const totalGaps = Math.max(0, segments.length - 1)
  const availableWidth = chartWidth - totalGaps * GAP_WIDTH
  const totalActiveMs = segments.reduce((sum, seg) => sum + Math.max(seg.endMs - seg.startMs, 1000), 0)

  const bars: ProcessedBar[] = []
  let xOffset = 0

  for (let si = 0; si < segments.length; si++) {
    const seg = segments[si]
    const segDuration = Math.max(seg.endMs - seg.startMs, 1000)
    const segWidth = (segDuration / totalActiveMs) * availableWidth
    const barWidth = 4
    const spacing = Math.max(barWidth + 1, segWidth / seg.turns.length)

    for (let ti = 0; ti < seg.turns.length; ti++) {
      const turn = seg.turns[ti]
      const x = xOffset + ti * spacing
      if (x > chartWidth - barWidth) break
      bars.push({
        x,
        height: getBarHeight(turn),
        color: getBarColor(turn),
        isCorrection: turn.type === 'prompt' && CORRECTION_PATTERN.test(turn.content ?? ''),
      })
    }

    xOffset += segWidth + GAP_WIDTH
  }

  // Time labels
  const durationHours = totalMs / 3600000
  const labelCount = Math.min(6, Math.max(2, Math.floor(durationHours) + 1))
  const timeLabels: Array<{ x: number; label: string }> = []
  for (let i = 0; i <= labelCount; i++) {
    const frac = i / labelCount
    const ms = frac * totalMs
    const hours = Math.floor(ms / 3600000)
    const mins = Math.floor((ms % 3600000) / 60000)
    timeLabels.push({
      x: frac * chartWidth,
      label: `${hours}:${String(mins).padStart(2, '0')}`,
    })
  }

  return { bars, timeLabels }
}

function processSimple(turns: TurnEvent[], chartWidth: number): { bars: ProcessedBar[]; timeLabels: Array<{ x: number; label: string }> } {
  const count = turns.length > 0 ? turns.length : 50
  const barWidth = 4
  const spacing = Math.max(barWidth + 1, chartWidth / count)
  const bars: ProcessedBar[] = []

  if (turns.length > 0) {
    for (let i = 0; i < turns.length; i++) {
      const x = i * spacing
      if (x > chartWidth - barWidth) break
      bars.push({
        x,
        height: getBarHeight(turns[i]),
        color: getBarColor(turns[i]),
        isCorrection: turns[i].type === 'prompt' && CORRECTION_PATTERN.test(turns[i].content ?? ''),
      })
    }
  } else {
    // Generate placeholder bars for sessions without turnTimeline
    for (let i = 0; i < count; i++) {
      const x = i * spacing
      if (x > chartWidth - barWidth) break
      const h = 12 + Math.round(Math.sin(i * 0.3) * 20 + 20)
      const colors = [COLORS.read, COLORS.edit, COLORS.bash, COLORS.thinking]
      bars.push({
        x,
        height: Math.min(h, 58),
        color: colors[i % colors.length],
        isCorrection: false,
      })
    }
  }

  return { bars, timeLabels: [] }
}

const LEGEND_ITEMS = [
  { color: COLORS.read, label: 'Read/Search' },
  { color: COLORS.edit, label: 'Edit/Write' },
  { color: COLORS.bash, label: 'Bash/Test' },
  { color: COLORS.thinking, label: 'Thinking' },
  { color: COLORS.error, label: 'Error' },
]

export function SessionActivityTimeline({ turns, totalTurns, durationMinutes }: SessionActivityTimelineProps) {
  const chartWidth = 860
  const chartHeight = 80
  const barY = 70

  const hasTimestamps = turns.length > 0 && turns.some((t) => !isNaN(new Date(t.timestamp).getTime()))
  const { bars, timeLabels } = hasTimestamps
    ? processWithTimestamps(turns, chartWidth)
    : processSimple(turns, chartWidth)

  const corrections = bars.filter((b) => b.isCorrection)

  return (
    <div className="bg-surface-lowest border border-ghost rounded-md p-4">
      <svg
        viewBox={`0 0 ${chartWidth} ${chartHeight + 10}`}
        width="100%"
        height={chartHeight + 10}
        role="img"
        aria-label={`Session activity: ${totalTurns} turns over ${durationMinutes} minutes`}
      >
        {/* Baseline */}
        <line x1="0" y1={barY} x2={chartWidth} y2={barY} stroke="rgba(194,199,208,0.15)" strokeWidth="1" />

        {/* Bars */}
        {bars.map((bar, i) => (
          <rect
            key={i}
            x={bar.x}
            y={barY - bar.height}
            width={4}
            height={bar.height}
            rx={1}
            fill={bar.color}
            opacity={0.7}
          />
        ))}

        {/* Course correction markers */}
        {corrections.map((bar, i) => (
          <circle
            key={`c-${i}`}
            cx={bar.x + 2}
            cy={barY - bar.height - 6}
            r={4}
            fill={COLORS.error}
            opacity={0.8}
          />
        ))}

        {/* Time axis labels */}
        {timeLabels.map((tl, i) => (
          <text
            key={i}
            x={tl.x}
            y={barY + 10}
            fontFamily="'IBM Plex Mono', monospace"
            fontSize="8"
            fill="#6b7280"
            textAnchor={i === 0 ? 'start' : i === timeLabels.length - 1 ? 'end' : 'middle'}
          >
            {tl.label}
          </text>
        ))}
      </svg>

      {/* Legend */}
      <div className="flex gap-4 mt-2 font-mono text-[9px] text-on-surface-variant">
        {LEGEND_ITEMS.map((item) => (
          <div key={item.label} className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: item.color }} />
            {item.label}
          </div>
        ))}
      </div>

      {/* Course correction count */}
      {corrections.length > 0 && (
        <div className="flex items-center gap-1.5 mt-2 font-mono text-[9px] text-on-surface-variant">
          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS.error }} />
          <span className="font-bold text-primary">{corrections.length}</span> course correction{corrections.length !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  )
}
