import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AppShell, Badge, Chip } from './shared'
import {
  fetchTemplates,
  fetchTheme,
  saveTheme,
  fetchProjects,
  type TemplateInfo,
} from '../api'

// ── Constants ────────────────────────────────────────────────

const CATEGORIES = ['all', 'minimal', 'animated', 'data-dense', 'dark', 'light'] as const
type Category = (typeof CATEGORIES)[number]

const SORT_OPTIONS = ['default', 'a-z', 'by-mode'] as const
type SortOption = (typeof SORT_OPTIONS)[number]

const CATEGORY_LABELS: Record<Category, string> = {
  all: 'All',
  minimal: 'Minimal',
  animated: 'Animated',
  'data-dense': 'Data-dense',
  dark: 'Dark',
  light: 'Light',
}

const SORT_LABELS: Record<SortOption, string> = {
  default: 'Default',
  'a-z': 'A-Z',
  'by-mode': 'By mode',
}

export type DataMode = 'mock' | 'mine'

const DATA_MODE_LABELS: Record<DataMode, string> = {
  mock: 'Mock data',
  mine: 'My data',
}

// ── Helpers ──────────────────────────────────────────────────

function previewBgForTemplate(t: TemplateInfo): string {
  return t.mode === 'dark' ? '#09090b' : '#ffffff'
}

function matchesCategory(t: TemplateInfo, category: Category): boolean {
  if (category === 'all') return true
  if (category === 'dark') return t.mode === 'dark'
  if (category === 'light') return t.mode === 'light'
  return (t.tags ?? []).includes(category)
}

function sortTemplates(templates: TemplateInfo[], sort: SortOption): TemplateInfo[] {
  if (sort === 'default') return templates
  if (sort === 'a-z') return [...templates].sort((a, b) => a.label.localeCompare(b.label))
  if (sort === 'by-mode') {
    return [...templates].sort((a, b) => {
      if (a.mode === b.mode) return a.label.localeCompare(b.label)
      return a.mode === 'light' ? -1 : 1
    })
  }
  return templates
}

/**
 * Resolve the iframe src for a template card based on the active data mode.
 *
 * - mock: serves the curated static mockup HTML for the template (fast,
 *   shared across users, never touches DB).
 * - mine: renders the user's real portfolio data through the chosen
 *   template via /preview/portfolio?template=:name. Backend validates the
 *   template name and falls back to the user default if it's invalid.
 */
export function resolveTemplateIframeSrc(templateName: string, dataMode: DataMode): string {
  if (dataMode === 'mine') {
    return `/preview/portfolio?template=${encodeURIComponent(templateName)}`
  }
  return `/preview/template/${templateName}?page=portfolio`
}

// ── Main Component ───────────────────────────────────────────

export interface TemplateBrowserProps {
  /**
   * Where the browser is being rendered.
   * - 'route' (default): full-page surface at /templates.
   * - 'modal': sheet overlay launched from PreviewPane / EditRail.
   */
  mode?: 'route' | 'modal'
  /**
   * In modal mode, called when the user picks a template via the
   * "Use this template" button. The host is responsible for persisting
   * the choice (saveTheme) and dismissing the modal.
   */
  onSelectTemplate?: (templateName: string) => void
  /** Modal-mode close handler. Wired to the close button, Escape, and overlay click. */
  onClose?: () => void
}

export function TemplateBrowser({ mode = 'route', onSelectTemplate, onClose }: TemplateBrowserProps = {}) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [templates, setTemplates] = useState<TemplateInfo[]>([])
  const [currentTheme, setCurrentTheme] = useState('editorial')
  const [firstProjectDir, setFirstProjectDir] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [dataMode, setDataMode] = useState<DataMode>('mock')

  const activeCategory = (searchParams.get('category') as Category) || 'all'
  const activeSort = (searchParams.get('sort') as SortOption) || 'default'

  useEffect(() => {
    Promise.all([
      fetchTemplates().catch(() => []),
      fetchTheme().catch(() => ({ template: 'editorial' })),
      fetchProjects().catch(() => []),
    ]).then(([templateList, theme, projects]) => {
      setTemplates(templateList)
      setCurrentTheme(theme.template)
      if (projects.length > 0) {
        setFirstProjectDir(projects[0].dirName)
      }
    }).finally(() => setLoading(false))
  }, [])

  function setFilter(key: string, value: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if ((key === 'category' && value === 'all') || (key === 'sort' && value === 'default')) {
        next.delete(key)
      } else {
        next.set(key, value)
      }
      return next
    })
  }

  async function handleApply(templateName: string) {
    // In modal mode, the host owns persistence + dismissal — we just
    // forward the choice and stop. This keeps the modal a controlled
    // picker rather than a divergent code path.
    if (mode === 'modal') {
      onSelectTemplate?.(templateName)
      return
    }
    const prev = currentTheme
    setCurrentTheme(templateName)
    try {
      await saveTheme(templateName)
      const t = templates.find((tpl) => tpl.name === templateName)
      setToastMessage(`Theme updated to ${t?.label ?? templateName}`)
      setTimeout(() => setToastMessage(null), 2000)
    } catch {
      setCurrentTheme(prev)
      setToastMessage('Failed to save theme')
      setTimeout(() => setToastMessage(null), 2000)
    }
  }

  const filtered = sortTemplates(
    templates.filter((t) => matchesCategory(t, activeCategory)),
    activeSort,
  )

  const activeTemplate = templates.find((t) => t.name === currentTheme) ?? templates[0]

  // ── Modal mode ─────────────────────────────────────────────
  if (mode === 'modal') {
    return (
      <TemplateBrowserModal onClose={onClose}>
        <div className="px-5 pt-4 pb-3 border-b border-ghost flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-bold text-on-surface">Choose a template</h2>
            <p className="text-xs text-on-surface-variant mt-0.5">
              {templates.length} template{templates.length !== 1 ? 's' : ''} — preview with mock data or your own
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close template browser"
            data-testid="template-browser-close"
            className="text-on-surface-variant hover:text-on-surface text-xl leading-none px-2 py-1 rounded-sm focus-visible:ring-2 focus-visible:ring-primary"
          >
            ×
          </button>
        </div>

        <div className="px-5 pt-3">
          <DataModeToggle value={dataMode} onChange={setDataMode} />
        </div>

        <div className="px-5 pt-3 pb-2">
          <TemplateFiltersInline
            activeCategory={activeCategory}
            activeSort={activeSort}
            onCategoryChange={(c) => setFilter('category', c)}
            onSortChange={(s) => setFilter('sort', s)}
          />
        </div>

        <div className="overflow-y-auto px-5 pb-5 flex-1" data-testid="template-browser-modal-body">
          {loading ? (
            <div className="py-12 text-center">
              <span className="text-sm text-on-surface-variant">Loading templates...</span>
            </div>
          ) : filtered.length === 0 ? (
            <TemplateEmptyState onClear={() => setFilter('category', 'all')} />
          ) : (
            <TemplateGrid
              templates={filtered}
              currentTheme={currentTheme}
              dataMode={dataMode}
              variant="modal"
              onApply={handleApply}
            />
          )}
        </div>
      </TemplateBrowserModal>
    )
  }

  // ── Route mode (existing /templates page) ──────────────────
  if (loading) {
    return (
      <AppShell back={{ label: 'Settings', to: '/settings' }} chips={[{ label: 'Templates' }]}>
        <div className="max-w-6xl mx-auto px-6 py-12">
          <span className="text-sm text-on-surface-variant">Loading templates...</span>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell back={{ label: 'Settings', to: '/settings' }} chips={[{ label: 'Templates' }]}>
      {/* Hero section */}
      <TemplateHero
        activeTemplate={activeTemplate}
        templateCount={templates.length}
        firstProjectDir={firstProjectDir}
      />

      {/* Filter bar */}
      <TemplateFilters
        activeCategory={activeCategory}
        activeSort={activeSort}
        dataMode={dataMode}
        onCategoryChange={(c) => setFilter('category', c)}
        onSortChange={(s) => setFilter('sort', s)}
        onDataModeChange={setDataMode}
      />

      {/* Template grid */}
      <div className="max-w-6xl mx-auto px-6 py-6">
        {filtered.length === 0 ? (
          <TemplateEmptyState onClear={() => setFilter('category', 'all')} />
        ) : (
          <TemplateGrid
            templates={filtered}
            currentTheme={currentTheme}
            dataMode={dataMode}
            variant="route"
            onApply={handleApply}
          />
        )}
      </div>

      {/* Toast */}
      {toastMessage && <TemplateSaveToast message={toastMessage} />}
    </AppShell>
  )
}

// ── Modal shell ──────────────────────────────────────────────

function TemplateBrowserModal({
  children,
  onClose,
}: {
  children: React.ReactNode
  onClose?: () => void
}) {
  // Escape key + click-outside dismissal. The overlay catches clicks; the
  // sheet stops propagation so clicking inside doesn't close.
  useEffect(() => {
    if (!onClose) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose?.()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center pt-12 px-4"
      role="dialog"
      aria-modal="true"
      aria-label="Template browser"
      data-testid="template-browser-modal-overlay"
      onClick={onClose}
    >
      <div
        className="bg-surface-lowest border border-ghost rounded-md shadow-xl w-full max-w-[720px] max-h-[80vh] flex flex-col"
        data-testid="template-browser-modal-sheet"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}

// ── Data mode toggle ─────────────────────────────────────────

function DataModeToggle({
  value,
  onChange,
}: {
  value: DataMode
  onChange: (v: DataMode) => void
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Preview data source"
      className="inline-flex items-center rounded-sm border border-ghost"
      data-testid="template-browser-data-mode"
    >
      {(['mock', 'mine'] as const).map((m) => {
        const active = value === m
        return (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={active}
            data-testid={`template-browser-data-mode-${m}`}
            onClick={() => onChange(m)}
            className={`text-xs font-mono px-3 py-1 first:rounded-l-sm last:rounded-r-sm transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-0 ${
              active
                ? 'bg-primary/10 text-primary'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            {DATA_MODE_LABELS[m]}
          </button>
        )
      })}
    </div>
  )
}

// ── Hero ─────────────────────────────────────────────────────

function TemplateHero({
  activeTemplate,
  templateCount,
  firstProjectDir,
}: {
  activeTemplate: TemplateInfo | undefined
  templateCount: number
  firstProjectDir: string | null
}) {
  return (
    <div className="bg-surface-lowest border-b border-ghost">
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold text-on-surface">
              Portfolio Templates
            </h1>
            <p className="text-sm text-on-surface-variant mt-1">
              Browse themes for your published portfolio
            </p>
            <p className="font-mono text-xs text-on-surface-variant uppercase tracking-wider mt-2">
              {templateCount} template{templateCount !== 1 ? 's' : ''}
            </p>
          </div>

          {activeTemplate && (
            <div className="flex items-start gap-3 sm:text-right">
              <TemplateWireframe template={activeTemplate} className="w-12 aspect-[16/10] shrink-0" />
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-on-surface">
                    {activeTemplate.label}
                  </span>
                  <Badge variant="refined">Active</Badge>
                </div>
                <span className="text-xs text-on-surface-variant">
                  {activeTemplate.description}
                </span>
                {firstProjectDir && (
                  <a
                    href={`/preview/project/${encodeURIComponent(firstProjectDir)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-on-surface-variant hover:text-primary transition-colors font-medium mt-1"
                  >
                    Preview site &rarr;
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Filters ──────────────────────────────────────────────────

function TemplateFilters({
  activeCategory,
  activeSort,
  dataMode,
  onCategoryChange,
  onSortChange,
  onDataModeChange,
}: {
  activeCategory: Category
  activeSort: SortOption
  dataMode: DataMode
  onCategoryChange: (c: Category) => void
  onSortChange: (s: SortOption) => void
  onDataModeChange: (m: DataMode) => void
}) {
  return (
    <div className="sticky top-12 z-40 bg-surface-lowest border-b border-ghost">
      <div className="max-w-6xl mx-auto px-6 py-3">
        <div className="flex items-center gap-1.5 overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch', maskImage: 'linear-gradient(to right, black 85%, transparent)' }}>
          <div role="radiogroup" aria-label="Filter by category" className="flex items-center gap-1.5">
            {CATEGORIES.map((cat) => (
              <FilterPill
                key={cat}
                label={CATEGORY_LABELS[cat]}
                active={activeCategory === cat}
                onClick={() => onCategoryChange(cat)}
              />
            ))}
          </div>

          <div className="border-l border-ghost mx-3 h-4 shrink-0" aria-hidden="true" />

          <div role="radiogroup" aria-label="Sort templates" className="flex items-center gap-1.5">
            {SORT_OPTIONS.map((s) => (
              <FilterPill
                key={s}
                label={SORT_LABELS[s]}
                active={activeSort === s}
                onClick={() => onSortChange(s)}
              />
            ))}
          </div>

          <div className="border-l border-ghost mx-3 h-4 shrink-0" aria-hidden="true" />

          <DataModeToggle value={dataMode} onChange={onDataModeChange} />
        </div>
      </div>
    </div>
  )
}

function TemplateFiltersInline({
  activeCategory,
  activeSort,
  onCategoryChange,
  onSortChange,
}: {
  activeCategory: Category
  activeSort: SortOption
  onCategoryChange: (c: Category) => void
  onSortChange: (s: SortOption) => void
}) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <div role="radiogroup" aria-label="Filter by category" className="flex items-center gap-1.5">
        {CATEGORIES.map((cat) => (
          <FilterPill
            key={cat}
            label={CATEGORY_LABELS[cat]}
            active={activeCategory === cat}
            onClick={() => onCategoryChange(cat)}
          />
        ))}
      </div>
      <div className="border-l border-ghost mx-2 h-4 shrink-0" aria-hidden="true" />
      <div role="radiogroup" aria-label="Sort templates" className="flex items-center gap-1.5">
        {SORT_OPTIONS.map((s) => (
          <FilterPill
            key={s}
            label={SORT_LABELS[s]}
            active={activeSort === s}
            onClick={() => onSortChange(s)}
          />
        ))}
      </div>
    </div>
  )
}

function FilterPill({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={`text-xs font-mono px-3 py-1 rounded-sm whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
        active
          ? 'bg-primary/10 text-primary'
          : 'bg-surface-low text-on-surface-variant hover:bg-surface-high'
      }`}
    >
      {label}
    </button>
  )
}

// ── Grid ─────────────────────────────────────────────────────

function TemplateGrid({
  templates,
  currentTheme,
  dataMode,
  variant,
  onApply,
}: {
  templates: TemplateInfo[]
  currentTheme: string
  dataMode: DataMode
  variant: 'route' | 'modal'
  onApply: (name: string) => void
}) {
  // Modal mode renders only one iframe at a time (the focused card) to keep
  // memory and bandwidth reasonable when "My data" is active and each iframe
  // is a real Liquid render. Route mode keeps the existing eager-load grid
  // because users on /templates expect to scan all options at once.
  const [focusedName, setFocusedName] = useState<string | null>(null)
  const focusCard = useCallback((name: string | null) => setFocusedName(name), [])

  const cols =
    variant === 'modal'
      ? 'grid-cols-1 sm:grid-cols-2 gap-4'
      : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5'

  return (
    <div className={`grid ${cols}`}>
      {templates.map((t, index) => (
        <TemplateCard
          key={t.name}
          template={t}
          isActive={currentTheme === t.name}
          index={index}
          dataMode={dataMode}
          variant={variant}
          singleIframeMode={variant === 'modal'}
          isFocused={focusedName === t.name}
          onFocus={() => focusCard(t.name)}
          onApply={() => onApply(t.name)}
        />
      ))}
    </div>
  )
}

// ── Card ─────────────────────────────────────────────────────

function TemplateCard({
  template: t,
  isActive,
  index,
  dataMode,
  variant,
  singleIframeMode,
  isFocused,
  onFocus,
  onApply,
}: {
  template: TemplateInfo
  isActive: boolean
  index: number
  dataMode: DataMode
  variant: 'route' | 'modal'
  singleIframeMode: boolean
  isFocused: boolean
  onFocus: () => void
  onApply: () => void
}) {
  // In modal mode we only mount the iframe for the focused card (or the
  // active template by default) to avoid spinning up N renders of real
  // portfolio data at once. The wireframe stays visible behind it as a
  // placeholder.
  const shouldMountIframe = !singleIframeMode || isFocused || isActive
  const iframeSrc = resolveTemplateIframeSrc(t.name, dataMode)

  return (
    <article
      className={`group bg-surface-lowest rounded-md overflow-hidden transition-all duration-150 motion-reduce:transition-none ${
        isActive
          ? 'border-2 border-primary ring-1 ring-primary/20'
          : 'border border-ghost hover:border-outline-variant hover:shadow-sm'
      }`}
      aria-label={`${t.label} template`}
      aria-current={isActive ? 'true' : undefined}
      onMouseEnter={singleIframeMode ? onFocus : undefined}
      onFocus={singleIframeMode ? onFocus : undefined}
      style={{
        animationDelay: `${index * 30}ms`,
      }}
    >
      {/* Preview area — wireframe placeholder + iframe overlay */}
      <div className="border-b border-ghost relative overflow-hidden" style={{ height: '220px' }}>
        <TemplateWireframe template={t} className="absolute inset-0 w-full h-full" />
        {shouldMountIframe && (
          <iframe
            src={iframeSrc}
            data-testid={`template-card-iframe-${t.name}`}
            style={{
              width: '1200px',
              height: '900px',
              transform: 'scale(0.2)',
              transformOrigin: 'top left',
              border: 'none',
              pointerEvents: 'none',
              position: 'absolute',
              top: 0,
              left: 0,
            }}
            loading="lazy"
            tabIndex={-1}
            aria-hidden="true"
            title={`${t.label} preview`}
          />
        )}
      </div>

      {/* Info area */}
      <div className="p-3 flex flex-col gap-1.5">
        {/* Row 1: Name + Active badge */}
        <div className="flex items-center justify-between">
          <span className={`text-sm font-medium ${isActive ? 'text-primary' : 'text-on-surface'}`}>
            {t.label}
          </span>
          {isActive && <Badge variant="refined">Active</Badge>}
        </div>

        {/* Row 2: Description */}
        <span className="text-xs text-on-surface-variant leading-snug truncate">
          {t.description}
        </span>

        {/* Row 3: Metadata */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] text-on-surface-variant font-mono uppercase tracking-wider">
            {t.mode === 'dark' ? 'Dark' : 'Light'}
          </span>
          <span className="opacity-30 text-[10px]">&middot;</span>
          <span
            className="inline-block w-2 h-2 rounded-full"
            style={{ background: t.accent }}
            aria-label={`Accent color: ${t.accent}`}
          />
          {(t.tags ?? []).map((tag) => (
            <span key={tag}>
              <span className="opacity-30 text-[10px]">&middot;</span>
              <Chip>{tag}</Chip>
            </span>
          ))}
        </div>

        {/* Row 4: Actions */}
        <div className={`flex items-center gap-3 mt-1 ${variant === 'modal' ? '' : 'sm:opacity-0 sm:group-hover:opacity-100'} transition-opacity duration-150 motion-reduce:transition-none ${isActive ? 'sm:opacity-100' : ''}`}>
          {variant === 'modal' ? (
            <button
              type="button"
              onClick={onApply}
              data-testid={`template-card-use-${t.name}`}
              className="text-xs font-medium px-2.5 py-1 rounded-md bg-primary text-on-primary hover:bg-primary-hover transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              {isActive ? 'Current' : 'Use this template'}
            </button>
          ) : (
            <>
              {!isActive && (
                <button
                  type="button"
                  onClick={onApply}
                  className="text-xs font-medium px-2.5 py-1 rounded-md bg-primary text-on-primary hover:bg-primary-hover transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                >
                  Apply
                </button>
              )}
              <a href={`/preview/template/${t.name}?page=portfolio`} target="_blank" rel="noopener noreferrer" className="text-[11px] text-on-surface-variant hover:text-primary transition-colors font-medium">Portfolio</a>
              <a href={`/preview/template/${t.name}?page=project`} target="_blank" rel="noopener noreferrer" className="text-[11px] text-on-surface-variant hover:text-primary transition-colors font-medium">Project</a>
              <a href={`/preview/template/${t.name}?page=session`} target="_blank" rel="noopener noreferrer" className="text-[11px] text-on-surface-variant hover:text-primary transition-colors font-medium">Session</a>
            </>
          )}
        </div>
      </div>
    </article>
  )
}

// ── Wireframe Thumbnail ──────────────────────────────────────

function TemplateWireframe({
  template: t,
  className = '',
}: {
  template: TemplateInfo
  className?: string
}) {
  const bg = previewBgForTemplate(t)
  const isDark = t.mode === 'dark'
  const text = isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)'
  const textDim = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)'
  const block = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'
  const blockHover = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'

  return (
    <div
      className={`overflow-hidden ${className}`}
      style={{ background: bg, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '10px' }}
    >
      {/* Title bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: block }} />
        <div style={{ height: '10px', width: '35%', borderRadius: '2px', background: text }} />
      </div>

      {/* Accent line */}
      <div style={{ height: '2px', width: '40%', background: t.accent, opacity: 0.8, borderRadius: '1px' }} />

      {/* Stats row */}
      <div style={{ display: 'flex', gap: '6px' }}>
        <div style={{ flex: 1, height: '28px', borderRadius: '4px', background: block, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2px' }}>
          <div style={{ width: '14px', height: '6px', background: t.accent, opacity: 0.6, borderRadius: '1px' }} />
          <div style={{ width: '20px', height: '3px', background: textDim, borderRadius: '1px' }} />
        </div>
        <div style={{ flex: 1, height: '28px', borderRadius: '4px', background: block, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2px' }}>
          <div style={{ width: '14px', height: '6px', background: text, opacity: 0.4, borderRadius: '1px' }} />
          <div style={{ width: '20px', height: '3px', background: textDim, borderRadius: '1px' }} />
        </div>
        <div style={{ flex: 1, height: '28px', borderRadius: '4px', background: block, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2px' }}>
          <div style={{ width: '14px', height: '6px', background: text, opacity: 0.4, borderRadius: '1px' }} />
          <div style={{ width: '20px', height: '3px', background: textDim, borderRadius: '1px' }} />
        </div>
      </div>

      {/* Narrative block */}
      <div style={{ background: block, borderRadius: '4px', padding: '8px', borderLeft: `2px solid ${t.accent}`, opacity: 0.7 }}>
        <div style={{ height: '3px', width: '90%', background: textDim, borderRadius: '1px', marginBottom: '4px' }} />
        <div style={{ height: '3px', width: '75%', background: textDim, borderRadius: '1px', marginBottom: '4px' }} />
        <div style={{ height: '3px', width: '60%', background: textDim, borderRadius: '1px' }} />
      </div>

      {/* Chart area */}
      <div style={{ display: 'flex', gap: '6px', flex: 1, minHeight: '24px' }}>
        <div style={{ flex: 2, background: block, borderRadius: '4px', position: 'relative', overflow: 'hidden' }}>
          {/* Mini bar chart */}
          <div style={{ position: 'absolute', bottom: '3px', left: '4px', right: '4px', display: 'flex', gap: '2px', alignItems: 'flex-end' }}>
            <div style={{ flex: 1, height: '8px', background: t.accent, opacity: 0.5, borderRadius: '1px 1px 0 0' }} />
            <div style={{ flex: 1, height: '14px', background: t.accent, opacity: 0.6, borderRadius: '1px 1px 0 0' }} />
            <div style={{ flex: 1, height: '10px', background: t.accent, opacity: 0.5, borderRadius: '1px 1px 0 0' }} />
            <div style={{ flex: 1, height: '18px', background: t.accent, opacity: 0.7, borderRadius: '1px 1px 0 0' }} />
            <div style={{ flex: 1, height: '12px', background: t.accent, opacity: 0.5, borderRadius: '1px 1px 0 0' }} />
          </div>
        </div>
        <div style={{ flex: 1, background: blockHover, borderRadius: '4px' }} />
      </div>

      {/* Session cards row */}
      <div style={{ display: 'flex', gap: '4px' }}>
        <div style={{ flex: 1, height: '16px', borderRadius: '3px', background: block, borderTop: `2px solid ${t.accent}` }} />
        <div style={{ flex: 1, height: '16px', borderRadius: '3px', background: block, borderTop: `2px solid ${isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)'}` }} />
      </div>
    </div>
  )
}

// ── Empty State ──────────────────────────────────────────────

function TemplateEmptyState({ onClear }: { onClear: () => void }) {
  return (
    <div className="text-center py-12">
      <p className="text-sm text-on-surface-variant">No templates match this filter.</p>
      <button
        type="button"
        onClick={onClear}
        className="mt-3 text-xs font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      >
        Clear filters
      </button>
    </div>
  )
}

// ── Toast ────────────────────────────────────────────────────

function TemplateSaveToast({ message }: { message: string }) {
  return (
    <div
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-surface-lowest border border-ghost rounded-md shadow-lg px-4 py-2 text-sm text-on-surface animate-fade-in motion-reduce:animate-none"
      role="status"
      aria-live="polite"
    >
      {message}
    </div>
  )
}
