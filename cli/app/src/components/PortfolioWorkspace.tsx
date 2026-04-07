import { useEffect } from 'react'
import { AppShell } from './shared'
import { PortfolioStoreProvider, usePortfolioStore } from '../hooks/usePortfolioStore'
import { StatusBar } from './PortfolioWorkspace/StatusBar'
import { PreviewPane } from './PortfolioWorkspace/PreviewPane'
import { EditRail } from './PortfolioWorkspace/EditRail'
import { fetchPortfolio, fetchPortfolioPublishState, fetchProjects, type Project } from '../api'

/**
 * Hydrates the portfolio store on mount from the backend. Without this the
 * store.profile starts as `{}`, EditRail's projected saves clobber any
 * pre-existing fields on disk, and the EditRail "Projects on portfolio"
 * count shows "0 of 0" even though the rendered iframe contains every
 * project on disk. Failures on each fetch are non-fatal — the UI stays
 * functional with empty state and the user can re-type / re-pick.
 *
 * NOTE: project ordering and inclusion are NOT yet round-tripped to the
 * backend. The portfolio render currently includes every project on disk
 * regardless of `included` / `order`. The hydration here only seeds the
 * count + sortable list so users can interact with the section locally.
 */
function HydratePortfolioStore() {
  const { dispatch } = usePortfolioStore()
  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetchPortfolio().catch(() => ({})),
      fetchPortfolioPublishState().catch(() => ({ targets: {} })),
      fetchProjects().catch((): Project[] => []),
    ]).then(([profile, publishState, projects]) => {
      if (cancelled) return
      const entries = projects.map((p, i) => ({
        projectId: p.dirName,
        included: true,
        order: i,
      }))
      dispatch({ type: 'LOAD', profile, publishState, projects: entries })
    })
    return () => {
      cancelled = true
    }
  }, [dispatch])
  return null
}

export function PortfolioWorkspace() {
  return (
    <PortfolioStoreProvider>
      <HydratePortfolioStore />
      <AppShell>
        <div className="flex flex-col h-[calc(100vh-3rem)] min-h-0">
          <StatusBar />
          <div className="flex flex-1 min-h-0 overflow-hidden">
            <PreviewPane />
            <EditRail />
          </div>
        </div>
      </AppShell>
    </PortfolioStoreProvider>
  )
}
