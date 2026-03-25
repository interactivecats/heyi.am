import { useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchProjectDetail } from '../api'
import { useRefine } from '../contexts/ProjectRefineContext'
import { AppShell, Card, Note, SectionHeader } from './shared'
import { PhaseDots } from './PhaseDots'

export function RefineScope() {
  const { dirName } = useParams<{ dirName: string }>()
  const refine = useRefine()

  useEffect(() => {
    if (!dirName || refine.dirName === dirName) return
    fetchProjectDetail(dirName)
      .then((detail) => {
        if (detail.enhanceCache?.result) {
          refine.init(dirName, detail.enhanceCache.result)
        }
      })
      .catch(() => {})
  }, [dirName])

  const result = refine.enhanceResult
  const sessionCount = result?.timeline?.reduce((n, t) => n + t.sessions.length, 0) ?? 0

  return (
    <AppShell
      back={{ label: dirName ?? 'Project', to: `/project/${encodeURIComponent(dirName ?? '')}` }}
      chips={[{ label: 'Refine project · step 1 of 4' }]}
    >
      <div className="p-6">
        <PhaseDots current={1} />

        <div className="grid grid-cols-2 gap-4">
          <Card>
            <SectionHeader title="Scope" meta="what will be used" />
            <div className="flex flex-col gap-3">
              <Note>{sessionCount} included sessions</Note>
              <Note>5 background sessions</Note>
              <Note>2 flagged items that require review before public export</Note>
            </div>
          </Card>

          <Card>
            <SectionHeader title="Privacy checks" meta="default safe" />
            <div className="flex flex-col gap-3">
              <Note>Personal OpenClaw sessions excluded</Note>
              <Note>Project currently marked local only</Note>
              <Note>Publishing still requires a separate review step</Note>
            </div>
            <div className="h-5" />
            <Link
              to={`/project/${encodeURIComponent(dirName ?? '')}/refine/moments`}
              className="inline-flex items-center gap-1.5 font-semibold text-[0.8125rem] px-3.5 py-1.5 rounded-sm bg-primary text-on-primary hover:bg-primary-hover transition-colors"
            >
              Draft from selected sessions &rarr;
            </Link>
          </Card>
        </div>
      </div>
    </AppShell>
  )
}
