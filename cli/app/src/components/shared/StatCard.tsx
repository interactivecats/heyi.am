interface StatCardProps {
  label: string
  value: string | number
  valueSize?: string
}

export function StatCard({ label, value, valueSize = 'text-2xl' }: StatCardProps) {
  return (
    <div className="bg-surface-lowest border border-ghost rounded-md p-4">
      <div className="font-mono text-[9px] uppercase tracking-wider text-on-surface-variant mb-1">
        {label}
      </div>
      <div className={`font-display font-bold text-on-surface ${valueSize}`}>
        {value}
      </div>
    </div>
  )
}
