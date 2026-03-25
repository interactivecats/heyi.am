interface PhaseDotsProps {
  current: number
  total?: number
}

export function PhaseDots({ current, total = 4 }: PhaseDotsProps) {
  return (
    <div className="flex items-center gap-1 mb-5">
      {Array.from({ length: total }, (_, i) => {
        const step = i + 1
        let bg = 'bg-outline' // future
        if (step < current) bg = 'bg-green' // done
        if (step === current) bg = 'bg-primary' // active
        return <div key={i} className={`w-2 h-2 rounded-full ${bg}`} />
      })}
    </div>
  )
}
