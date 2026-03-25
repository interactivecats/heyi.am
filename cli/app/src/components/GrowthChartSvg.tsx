import type { Session } from '../api'

interface Props {
  sessions: Session[]
}

export function GrowthChartSvg({ sessions }: Props) {
  if (sessions.length === 0) {
    return <div className="text-sm text-on-surface-variant p-4">No data to display.</div>
  }

  const sorted = [...sessions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  // Build cumulative LOC points
  let cumulative = 0
  const points = sorted.map((s) => {
    cumulative += s.linesOfCode
    return { date: s.date, loc: cumulative }
  })

  const maxLoc = points[points.length - 1].loc
  const startTime = new Date(sorted[0].date).getTime()
  const endTime = new Date(sorted[sorted.length - 1].date).getTime()
  const range = Math.max(endTime - startTime, 1)

  const w = 400
  const h = 100

  function px(date: string): number {
    return ((new Date(date).getTime() - startTime) / range) * w
  }

  function py(loc: number): number {
    return h - (loc / maxLoc) * (h - 5) - 5
  }

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${px(p.date).toFixed(1)},${py(p.loc).toFixed(1)}`).join(' ')
  const areaPath = `${linePath} L${w},${h} L0,${h} Z`

  // Date labels
  function formatDate(date: string): string {
    return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const tickCount = Math.min(4, points.length)
  const ticks: typeof points = []
  for (let i = 0; i < tickCount; i++) {
    const idx = Math.round((i / (tickCount - 1)) * (points.length - 1))
    ticks.push(points[idx])
  }

  return (
    <div className="bg-surface-lowest border border-ghost rounded-sm p-3">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: 100 }} preserveAspectRatio="none">
        <defs>
          <linearGradient id="growthFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#084471" stopOpacity={0.15} />
            <stop offset="100%" stopColor="#084471" stopOpacity={0.02} />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        <line x1={0} y1={25} x2={w} y2={25} stroke="#e7e8ea" strokeWidth={0.5} />
        <line x1={0} y1={50} x2={w} y2={50} stroke="#e7e8ea" strokeWidth={0.5} />
        <line x1={0} y1={75} x2={w} y2={75} stroke="#e7e8ea" strokeWidth={0.5} />

        {/* Area fill */}
        <path d={areaPath} fill="url(#growthFill)" />

        {/* Line */}
        <path d={linePath} fill="none" stroke="#084471" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

        {/* Dots at key points */}
        {ticks.map((p, i) => (
          <circle key={i} cx={px(p.date)} cy={py(p.loc)} r={3} fill="#084471" />
        ))}
      </svg>
      <div className="flex justify-between pt-1.5 font-mono text-[9px] text-on-surface-variant">
        {ticks.map((p, i) => (
          <span key={i}>{formatDate(p.date)}</span>
        ))}
      </div>
    </div>
  )
}
