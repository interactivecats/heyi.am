import { AppShell } from './shared'
import { PortfolioStoreProvider } from '../hooks/usePortfolioStore'
import { StatusBar } from './PortfolioWorkspace/StatusBar'
import { PreviewPane } from './PortfolioWorkspace/PreviewPane'

// Phase 3.0 skeleton. EditRail lands in 3.3.

function EditRailPlaceholder() {
  return (
    <aside
      data-testid="portfolio-editrail-placeholder"
      className="w-[360px] shrink-0 border-l border-ghost bg-surface-lowest p-4 text-sm text-on-surface-variant overflow-y-auto"
    >
      EditRail
    </aside>
  )
}

export function PortfolioWorkspace() {
  return (
    <PortfolioStoreProvider>
      <AppShell>
        <div className="flex flex-col h-full min-h-[calc(100vh-3rem)]">
          <StatusBar />
          <div className="flex flex-1 overflow-hidden">
            <PreviewPane />
            <EditRailPlaceholder />
          </div>
        </div>
      </AppShell>
    </PortfolioStoreProvider>
  )
}
