import { AppShell } from './shared'
import { PortfolioStoreProvider } from '../hooks/usePortfolioStore'

// Phase 3.0 skeleton. Real StatusBar/PreviewPane/EditRail land in 3.1–3.3.
function StatusBarPlaceholder() {
  return (
    <div
      data-testid="portfolio-statusbar-placeholder"
      className="border-b border-ghost bg-surface-lowest px-4 py-2 text-xs text-on-surface-variant"
    >
      StatusBar
    </div>
  )
}

function PreviewPanePlaceholder() {
  return (
    <div
      data-testid="portfolio-preview-placeholder"
      className="flex-1 bg-surface-mid p-6 text-sm text-on-surface-variant"
    >
      PreviewPane
    </div>
  )
}

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
          <StatusBarPlaceholder />
          <div className="flex flex-1 overflow-hidden">
            <PreviewPanePlaceholder />
            <EditRailPlaceholder />
          </div>
        </div>
      </AppShell>
    </PortfolioStoreProvider>
  )
}
