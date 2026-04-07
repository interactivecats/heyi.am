import { AppShell } from './shared'
import { PortfolioStoreProvider } from '../hooks/usePortfolioStore'
import { StatusBar } from './PortfolioWorkspace/StatusBar'
import { PreviewPane } from './PortfolioWorkspace/PreviewPane'
import { EditRail } from './PortfolioWorkspace/EditRail'

export function PortfolioWorkspace() {
  return (
    <PortfolioStoreProvider>
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
