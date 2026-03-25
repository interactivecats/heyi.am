import type { Session } from '../api'

interface Props {
  sessions: Session[]
}

export function WorkTimelineSvg({ sessions }: Props) {
  if (sessions.length === 0) {
    return <div className="text-sm text-on-surface-variant p-4">No sessions to display.</div>
  }

  const sorted = [...sessions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  const startTime = new Date(sorted[0].date).getTime()
  const endTime = new Date(sorted[sorted.length - 1].date).getTime()
  const range = Math.max(endTime - startTime, 1)

  const width = 860
  const height = 180
  const margin = { left: 20, right: 20, top: 26, bottom: 20 }
  const trackWidth = width - margin.left - margin.right

  function x(date: string): number {
    const t = new Date(date).getTime()
    return margin.left + ((t - startTime) / range) * trackWidth
  }

  function formatDate(date: string): string {
    return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  // Generate date ticks
  const tickCount = Math.min(4, sorted.length)
  const ticks: string[] = []
  for (let i = 0; i < tickCount; i++) {
    const idx = Math.round((i / (tickCount - 1)) * (sorted.length - 1))
    ticks.push(sorted[idx].date)
  }

  return (
    <div className="bg-surface-lowest border border-ghost rounded-sm overflow-hidden">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full block" preserveAspectRatio="xMinYMid meet">
        {/* Main timeline */}
        <line x1={margin.left} y1={40} x2={width - margin.right} y2={40} stroke="#d1d5db" strokeWidth={1.5} />

        {/* Session blocks */}
        {sorted.map((s) => {
          const sx = x(s.date)
          const blockWidth = Math.max(20, Math.min(160, (s.durationMinutes / 60) * 40))
          const opacity = 0.7 + (s.linesOfCode / Math.max(...sorted.map((ss) => ss.linesOfCode))) * 0.3

          return (
            <g key={s.id}>
              <rect
                x={Math.min(sx, width - margin.right - blockWidth)}
                y={26}
                width={blockWidth}
                height={28}
                rx={3}
                fill="#084471"
                opacity={opacity}
              />
              <text
                x={Math.min(sx, width - margin.right - blockWidth) + 10}
                y={44}
                fontFamily="'IBM Plex Mono',monospace"
                fontSize={8}
                fill="#fff"
                fontWeight={500}
              >
                {s.title.length > 18 ? s.title.slice(0, 18) + '...' : s.title}
              </text>
              <text
                x={Math.min(sx, width - margin.right - blockWidth)}
                y={68}
                fontFamily="'IBM Plex Mono',monospace"
                fontSize={7}
                fill="#6b7280"
              >
                {Math.round(s.durationMinutes)}m · {s.linesOfCode} LOC
              </text>

              {/* Agent sub-lanes for orchestrated sessions */}
              {s.isOrchestrated && s.children && s.children.length > 0 && (
                <>
                  <path
                    d={`M ${sx + 20},54 Q ${sx + 20},80 ${sx + 40},90`}
                    fill="none"
                    stroke="#7c3aed"
                    strokeWidth={1.2}
                    opacity={0.7}
                  />
                  <rect x={sx + 40} y={82} width={60} height={16} rx={2} fill="#7c3aed" opacity={0.8} />
                  <text x={sx + 46} y={93} fontFamily="'IBM Plex Mono',monospace" fontSize={6.5} fill="#fff">
                    agent
                  </text>
                </>
              )}
            </g>
          )
        })}

        {/* Date axis */}
        <line x1={margin.left} y1={160} x2={width - margin.right} y2={160} stroke="#e7e8ea" strokeWidth={0.5} />
        {ticks.map((tick, i) => (
          <text
            key={i}
            x={x(tick)}
            y={174}
            fontFamily="'IBM Plex Mono',monospace"
            fontSize={7}
            fill="#9ca3af"
          >
            {formatDate(tick)}
          </text>
        ))}
      </svg>
    </div>
  )
}
