import { useEffect } from 'react'
import { AppShell } from './shared'
import { PortfolioStoreProvider, usePortfolioStore } from '../hooks/usePortfolioStore'
import { StatusBar } from './PortfolioWorkspace/StatusBar'
import { PreviewPane } from './PortfolioWorkspace/PreviewPane'
import { EditRail } from './PortfolioWorkspace/EditRail'
import { fetchPortfolio, fetchPortfolioPublishState, fetchProjects, type PortfolioProfile, type Project } from '../api'

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
      fetchPortfolio().catch((): PortfolioProfile => ({})),
      fetchPortfolioPublishState().catch(() => ({ targets: {} })),
      fetchProjects().catch((): Project[] => []),
    ]).then(([profile, publishState, projects]) => {
      if (cancelled) return
      // Seed from the persisted curated list when present, otherwise
      // default to the 3 most recently active projects with the rest held
      // in the store as included=false so the user can flip them on.
      //
      // The default-when-empty branch mirrors the backend helper
      // applyPortfolioProjectFilter in cli/src/routes/portfolio-render-data.ts
      // (duplicated because the frontend bundler does not reach into
      // cli/src/). Keep the two in sync.
      const DEFAULT_LIMIT = 3
      const persisted = profile.projectsOnPortfolio ?? []
      let entries: Array<{ projectId: string; included: boolean; order: number }>
      if (persisted.length === 0) {
        const ranked = projects.slice().sort((a, b) => {
          const ra = a.lastSessionDate || ''
          const rb = b.lastSessionDate || ''
          if (ra !== rb) return rb.localeCompare(ra) // descending recency
          return b.dirName.localeCompare(a.dirName) // stable fallback
        })
        const topIds = new Set(ranked.slice(0, DEFAULT_LIMIT).map((p) => p.dirName))
        entries = ranked.map((p, i) => ({
          projectId: p.dirName,
          included: topIds.has(p.dirName),
          order: i,
        }))
      } else {
        const persistedById = new Map(persisted.map((e) => [e.projectId, e]))
        const matched = persisted
          .filter((e) => projects.some((p) => p.dirName === e.projectId))
          .map((e) => ({ projectId: e.projectId, included: e.included, order: e.order }))
        matched.sort((a, b) => a.order - b.order)
        const newcomers = projects
          .filter((p) => !persistedById.has(p.dirName))
          .map((p) => ({ projectId: p.dirName, included: true, order: 0 }))
        entries = [...matched, ...newcomers].map((e, i) => ({ ...e, order: i }))
      }
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
