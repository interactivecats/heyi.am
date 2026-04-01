import { useState, useEffect, useRef, useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
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

/** Max iframes loading concurrently */
const MAX_CONCURRENT_IFRAMES = 6

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

// ── Main Component ───────────────────────────────────────────

export function TemplateBrowser() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [templates, setTemplates] = useState<TemplateInfo[]>([])
  const [currentTheme, setCurrentTheme] = useState('editorial')
  const [firstProjectDir, setFirstProjectDir] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

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
        onCategoryChange={(c) => setFilter('category', c)}
        onSortChange={(s) => setFilter('sort', s)}
      />

      {/* Template grid */}
      <div className="max-w-6xl mx-auto px-6 py-6">
        {filtered.length === 0 ? (
          <TemplateEmptyState onClear={() => setFilter('category', 'all')} />
        ) : (
          <TemplateGrid
            templates={filtered}
            currentTheme={currentTheme}
            firstProjectDir={firstProjectDir}
            onApply={handleApply}
          />
        )}
      </div>

      {/* Toast */}
      {toastMessage && <TemplateSaveToast message={toastMessage} />}
    </AppShell>
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
  onCategoryChange,
  onSortChange,
}: {
  activeCategory: Category
  activeSort: SortOption
  onCategoryChange: (c: Category) => void
  onSortChange: (s: SortOption) => void
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
        </div>
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
  firstProjectDir,
  onApply,
}: {
  templates: TemplateInfo[]
  currentTheme: string
  firstProjectDir: string | null
  onApply: (name: string) => void
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
      {templates.map((t, index) => (
        <TemplateCard
          key={t.name}
          template={t}
          isActive={currentTheme === t.name}
          firstProjectDir={firstProjectDir}
          index={index}
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
  firstProjectDir,
  index,
  onApply,
}: {
  template: TemplateInfo
  isActive: boolean
  firstProjectDir: string | null
  index: number
  onApply: () => void
}) {
  return (
    <article
      className={`group bg-surface-lowest rounded-md overflow-hidden transition-all duration-150 motion-reduce:transition-none ${
        isActive
          ? 'border-2 border-primary ring-1 ring-primary/20'
          : 'border border-ghost hover:border-outline-variant hover:shadow-sm'
      }`}
      aria-label={`${t.label} template`}
      aria-current={isActive ? 'true' : undefined}
      style={{
        animationDelay: `${index * 30}ms`,
      }}
    >
      {/* Preview area */}
      <div className="border-b border-ghost">
        <LazyIframePreview
          template={t}
          firstProjectDir={firstProjectDir}
        />
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
        <div className={`flex items-center gap-3 mt-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-150 motion-reduce:transition-none ${isActive ? 'sm:opacity-100' : ''}`}>
          {!isActive && (
            <button
              type="button"
              onClick={onApply}
              className="text-xs font-medium px-2.5 py-1 rounded-md bg-primary text-on-primary hover:bg-primary-hover transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              Apply
            </button>
          )}
          {firstProjectDir && (
            <a
              href={`/preview/project/${encodeURIComponent(firstProjectDir)}?template=${t.name}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-on-surface-variant hover:text-primary transition-colors font-medium"
            >
              Full preview &rarr;
            </a>
          )}
        </div>
      </div>
    </article>
  )
}

// ── Lazy Iframe Preview ──────────────────────────────────────

/** Tracks how many iframes are currently loading across all cards */
let loadingCount = 0
const waitingQueue: Array<() => void> = []

function requestIframeSlot(): Promise<void> {
  if (loadingCount < MAX_CONCURRENT_IFRAMES) {
    loadingCount++
    return Promise.resolve()
  }
  return new Promise((resolve) => {
    waitingQueue.push(() => {
      loadingCount++
      resolve()
    })
  })
}

function releaseIframeSlot() {
  loadingCount--
  const next = waitingQueue.shift()
  if (next) next()
}

function LazyIframePreview({
  template,
  firstProjectDir,
}: {
  template: TemplateInfo
  firstProjectDir: string | null
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [shouldLoad, setShouldLoad] = useState(false)
  const [iframeLoaded, setIframeLoaded] = useState(false)
  const [hasSlot, setHasSlot] = useState(false)

  // IntersectionObserver to trigger loading when visible
  useEffect(() => {
    const el = containerRef.current
    if (!el || !firstProjectDir) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setShouldLoad(true)
          observer.disconnect()
        }
      },
      { rootMargin: '200px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [firstProjectDir])

  // Request a slot when we should load
  useEffect(() => {
    if (!shouldLoad || !firstProjectDir) return
    let cancelled = false
    requestIframeSlot().then(() => {
      if (!cancelled) setHasSlot(true)
    })
    return () => {
      cancelled = true
    }
  }, [shouldLoad, firstProjectDir])

  const handleLoad = useCallback(() => {
    setIframeLoaded(true)
    releaseIframeSlot()
  }, [])

  const showIframe = shouldLoad && hasSlot && firstProjectDir

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden bg-surface-low"
      style={{ height: '240px' }}
    >
      {/* Wireframe fallback — shown until iframe loads */}
      <div
        className={`absolute inset-0 transition-opacity duration-150 motion-reduce:transition-none ${
          iframeLoaded ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}
      >
        <TemplateWireframe template={template} className="w-full h-full" />
      </div>

      {/* Iframe preview */}
      {showIframe && (
        <iframe
          src={`/preview/project/${encodeURIComponent(firstProjectDir)}?template=${template.name}`}
          style={{
            width: '1200px',
            height: '900px',
            transform: 'scale(0.25)',
            transformOrigin: 'top left',
            border: 'none',
            pointerEvents: 'none',
          }}
          loading="lazy"
          tabIndex={-1}
          aria-hidden="true"
          title={`${template.label} template preview`}
          onLoad={handleLoad}
        />
      )}
    </div>
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
  const bar = t.mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'
  const block = t.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'
  const footer = t.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)'

  return (
    <div
      className={`rounded-md overflow-hidden border border-ghost ${className}`}
      style={{ background: bg }}
    >
      <div className="p-3 h-full flex flex-col gap-1.5">
        <div className="h-2 w-1/3 rounded-sm" style={{ background: t.accent, opacity: 0.8 }} />
        <div className="h-1.5 w-2/3 rounded-sm" style={{ background: bar }} />
        <div className="flex gap-1 mt-1">
          <div className="flex-1 h-8 rounded-sm" style={{ background: block }} />
          <div className="flex-1 h-8 rounded-sm" style={{ background: block }} />
          <div className="flex-1 h-8 rounded-sm" style={{ background: block }} />
        </div>
        <div className="h-3 rounded-sm mt-auto" style={{ background: footer }} />
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
