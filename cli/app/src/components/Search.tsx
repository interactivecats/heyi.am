import { useEffect, useState, useCallback } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { searchSessions, type SearchResult } from '../api'
import { AppShell, Card, Chip } from './shared'
import { SearchInput } from './shared/SearchInput'

const SOURCE_FILTERS = ['Claude', 'Cursor', 'Codex', 'Gemini'] as const

function formatDuration(minutes: number): string {
  const hours = minutes / 60
  return hours >= 1 ? `${hours.toFixed(1)}h` : `${Math.round(minutes)}m`
}

function formatLoc(loc: number): string {
  return loc >= 1000 ? `${(loc / 1000).toFixed(1)}k` : String(loc)
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  } catch {
    return iso
  }
}

export function Search() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()

  const queryParam = searchParams.get('q') ?? ''
  const sourceParam = searchParams.get('source') ?? ''
  const projectParam = searchParams.get('project') ?? ''
  const skillParam = searchParams.get('skill') ?? ''

  const [query, setQuery] = useState(queryParam)
  const [results, setResults] = useState<SearchResult[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)

  // Active filters from URL
  const activeSource = sourceParam
  const activeProject = projectParam
  const activeSkill = skillParam

  // Collect unique projects/skills from results for filter chips
  const [availableProjects, setAvailableProjects] = useState<string[]>([])
  const [availableSkills, setAvailableSkills] = useState<string[]>([])

  const doSearch = useCallback(async (q: string, source: string, project: string, skill: string) => {
    if (!q && !source && !project && !skill) {
      setResults([])
      setTotal(0)
      setHasSearched(false)
      return
    }

    setLoading(true)
    setHasSearched(true)
    try {
      const data = await searchSessions(q, {
        source: source || undefined,
        project: project || undefined,
        skill: skill || undefined,
      })
      setResults(data.results)
      setTotal(data.total)

      // Extract available filters from results
      const projects = [...new Set(data.results.map((r) => r.projectName))].sort()
      const skills = [...new Set(data.results.flatMap((r) => r.skills))].sort()
      setAvailableProjects(projects)
      setAvailableSkills(skills)
    } catch {
      setResults([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [])

  // Debounced search on query change
  useEffect(() => {
    const timer = setTimeout(() => {
      const params = new URLSearchParams()
      if (query) params.set('q', query)
      if (activeSource) params.set('source', activeSource)
      if (activeProject) params.set('project', activeProject)
      if (activeSkill) params.set('skill', activeSkill)
      setSearchParams(params, { replace: true })
      doSearch(query, activeSource, activeProject, activeSkill)
    }, 300)
    return () => clearTimeout(timer)
  }, [query, activeSource, activeProject, activeSkill, setSearchParams, doSearch])

  // Run search on mount if URL has params
  useEffect(() => {
    if (queryParam || sourceParam || projectParam || skillParam) {
      setQuery(queryParam)
      doSearch(queryParam, sourceParam, projectParam, skillParam)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function toggleFilter(key: 'source' | 'project' | 'skill', value: string) {
    const params = new URLSearchParams(searchParams)
    if (params.get(key) === value) {
      params.delete(key)
    } else {
      params.set(key, value)
    }
    setSearchParams(params, { replace: true })
  }

  return (
    <AppShell chips={[{ label: 'Search' }]}>
      <div className="p-6 max-w-3xl mx-auto">
        <SearchInput
          value={query}
          onChange={setQuery}
          autoFocus
          placeholder="Search sessions..."
        />

        {/* Filter chips */}
        <div className="flex flex-wrap items-center gap-1.5 mt-3">
          <span className="font-mono text-[9px] uppercase tracking-wider text-outline mr-1">Source</span>
          {SOURCE_FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => toggleFilter('source', s.toLowerCase())}
              className={[
                'font-mono text-[11px] leading-tight py-0.5 px-2 rounded-sm border transition-colors cursor-pointer',
                activeSource === s.toLowerCase()
                  ? 'bg-primary/10 text-primary border-primary/30'
                  : 'bg-surface-low text-on-surface-variant border-ghost hover:border-outline',
              ].join(' ')}
            >
              {s}
            </button>
          ))}

          {availableProjects.length > 0 && (
            <>
              <span className="font-mono text-[9px] uppercase tracking-wider text-outline ml-3 mr-1">Project</span>
              {availableProjects.slice(0, 5).map((p) => (
                <button
                  key={p}
                  onClick={() => toggleFilter('project', p)}
                  className={[
                    'font-mono text-[11px] leading-tight py-0.5 px-2 rounded-sm border transition-colors cursor-pointer',
                    activeProject === p
                      ? 'bg-primary/10 text-primary border-primary/30'
                      : 'bg-surface-low text-on-surface-variant border-ghost hover:border-outline',
                  ].join(' ')}
                >
                  {p}
                </button>
              ))}
            </>
          )}

          {availableSkills.length > 0 && (
            <>
              <span className="font-mono text-[9px] uppercase tracking-wider text-outline ml-3 mr-1">Skill</span>
              {availableSkills.slice(0, 5).map((sk) => (
                <button
                  key={sk}
                  onClick={() => toggleFilter('skill', sk)}
                  className={[
                    'font-mono text-[11px] leading-tight py-0.5 px-2 rounded-sm border transition-colors cursor-pointer',
                    activeSkill === sk
                      ? 'bg-violet-bg text-violet border-violet/30'
                      : 'bg-surface-low text-on-surface-variant border-ghost hover:border-outline',
                  ].join(' ')}
                >
                  {sk}
                </button>
              ))}
            </>
          )}
        </div>

        <div className="h-4" />

        {/* Results */}
        {loading ? (
          <div className="text-sm text-on-surface-variant">Searching...</div>
        ) : hasSearched ? (
          <>
            <div className="font-mono text-[11px] text-on-surface-variant mb-3">
              {total} result{total !== 1 ? 's' : ''}{query ? ` for '${query}'` : ''}
            </div>
            {results.length === 0 ? (
              <Card>
                <p className="text-sm text-on-surface-variant">No sessions found. Try a different query or adjust filters.</p>
              </Card>
            ) : (
              <div className="flex flex-col gap-2">
                {results.map((r) => (
                  <button
                    key={r.sessionId}
                    onClick={() => navigate(`/session/${encodeURIComponent(r.sessionId)}${query ? `?q=${encodeURIComponent(query)}` : ''}`)}
                    className="text-left w-full cursor-pointer"
                  >
                    <Card hover>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <h4 className="font-display text-[0.8125rem] font-semibold text-on-surface truncate">
                            {r.title}
                          </h4>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-on-surface-variant">{r.projectName}</span>
                            <Chip>{r.source}</Chip>
                            <span className="text-xs text-outline">{formatDate(r.date)}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 font-mono text-[0.6875rem] text-outline shrink-0">
                          <span>{formatDuration(r.durationMinutes)}</span>
                          <span>{r.turns} turns</span>
                          <span>{formatLoc(r.linesOfCode)} LOC</span>
                        </div>
                      </div>

                      {r.snippet && (
                        <p className="text-xs text-on-surface-variant mt-2 line-clamp-2 font-mono">
                          {r.snippet}
                        </p>
                      )}

                      {r.skills.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {r.skills.map((sk) => (
                            <Chip key={sk} variant="violet">{sk}</Chip>
                          ))}
                        </div>
                      )}
                    </Card>
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <svg
              className="w-12 h-12 text-outline mb-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <p className="font-display text-sm font-semibold text-on-surface">Search across all your AI sessions</p>
            <p className="text-xs text-on-surface-variant mt-1">Full-text search with source, project, and skill filters</p>
          </div>
        )}
      </div>
    </AppShell>
  )
}
