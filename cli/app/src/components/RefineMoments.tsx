import { Link, useParams } from 'react-router-dom'
import { useRefine } from '../contexts/ProjectRefineContext'
import { AppShell, Card } from './shared'
import { Chip } from './shared/Chip'
import { PhaseDots } from './PhaseDots'

const tagVariant: Record<string, 'violet' | 'amber' | 'green'> = {
  Pivotal: 'violet',
  'High override': 'amber',
  Shipped: 'green',
}

export function RefineMoments() {
  const { dirName } = useParams<{ dirName: string }>()
  const refine = useRefine()

  const result = refine.enhanceResult
  const moments = result?.timeline?.flatMap((t) =>
    t.sessions
      .filter((s) => s.featured)
      .map((s) => ({
        sessionId: s.sessionId,
        title: s.title,
        tag: s.tag ?? 'Featured',
        period: t.label,
      }))
  ) ?? []

  return (
    <AppShell
      back={{ label: 'Scope', to: `/project/${encodeURIComponent(dirName ?? '')}/refine/scope` }}
      chips={[{ label: 'Refine project · step 2 of 4' }]}
    >
      <div className="p-6">
        <PhaseDots current={2} />

        <h2 className="font-display text-xl font-bold text-on-surface">Suggested key moments</h2>
        <p className="text-on-surface-variant text-sm mt-1">Editorial suggestions, not uneditable truth.</p>

        <div className="h-4" />

        <div className="grid grid-cols-3 gap-4">
          {moments.length > 0
            ? moments.map((m) => (
                <Card key={m.sessionId}>
                  <Chip variant={tagVariant[m.tag] ?? 'violet'}>{m.tag}</Chip>
                  <h3 className="font-display text-[0.9375rem] font-semibold text-on-surface mt-2.5">{m.title}</h3>
                  <p className="text-on-surface-variant text-[0.8125rem] mt-1.5">
                    Selected from the {m.period} phase.
                  </p>
                </Card>
              ))
            : [
                { tag: 'Pivotal', title: 'Rendering architecture', reason: 'Selected because it changes both trust boundaries and product identity.' },
                { tag: 'High override', title: 'Auth rebuild', reason: 'Selected because it shows you choosing reset over incremental patching.' },
                { tag: 'Shipped', title: 'Security hardening', reason: 'Selected because it closes the loop between architecture and trust.' },
              ].map((m) => (
                <Card key={m.title}>
                  <Chip variant={tagVariant[m.tag] ?? 'violet'}>{m.tag}</Chip>
                  <h3 className="font-display text-[0.9375rem] font-semibold text-on-surface mt-2.5">{m.title}</h3>
                  <p className="text-on-surface-variant text-[0.8125rem] mt-1.5">{m.reason}</p>
                </Card>
              ))}
        </div>

        <div className="h-5" />

        <Link
          to={`/project/${encodeURIComponent(dirName ?? '')}/refine/questions`}
          className="inline-flex items-center gap-1.5 font-semibold text-[0.8125rem] px-3.5 py-1.5 rounded-sm bg-primary text-on-primary hover:bg-primary-hover transition-colors"
        >
          Use selected moments &rarr;
        </Link>
      </div>
    </AppShell>
  )
}
