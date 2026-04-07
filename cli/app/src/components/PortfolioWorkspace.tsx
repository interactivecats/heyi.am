import { useEffect } from 'react'
import { AppShell } from './shared'
import { PortfolioStoreProvider, usePortfolioStore } from '../hooks/usePortfolioStore'
import { StatusBar } from './PortfolioWorkspace/StatusBar'
import { PreviewPane } from './PortfolioWorkspace/PreviewPane'
import { EditRail } from './PortfolioWorkspace/EditRail'
import { fetchPortfolio, fetchPortfolioPublishState } from '../api'

/**
 * Hydrates the portfolio store on mount from the backend. Without this the
 * store.profile starts as `{}`, which means EditRail's projected saves
 * clobber any pre-existing fields on disk and the preview never reflects the
 * persisted values. Failures are non-fatal — the UI stays functional with
 * empty state and the user can re-type their fields.
 */
function HydratePortfolioStore() {
  const { dispatch } = usePortfolioStore()
  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetchPortfolio().catch(() => ({})),
      fetchPortfolioPublishState().catch(() => ({ targets: {} })),
    ]).then(([profile, publishState]) => {
      if (cancelled) return
      dispatch({ type: 'LOAD', profile, publishState, projects: [] })
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
