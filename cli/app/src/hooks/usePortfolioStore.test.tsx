import { describe, it, expect } from 'vitest'
import {
  portfolioStoreReducer,
  initialPortfolioStoreState,
  type PortfolioProjectEntry,
  type PortfolioStoreState,
} from './usePortfolioStore'

function makeProjects(ids: string[], included = true): PortfolioProjectEntry[] {
  return ids.map((id, i) => ({ projectId: id, included, order: i }))
}

function stateWith(patch: Partial<PortfolioStoreState>): PortfolioStoreState {
  return { ...initialPortfolioStoreState, ...patch }
}

describe('portfolioStoreReducer', () => {
  it('LOAD replaces profile, publishState, projects and clears in-flight flags', () => {
    const next = portfolioStoreReducer(
      stateWith({ isPublishing: true, lastPublishError: 'boom' }),
      {
        type: 'LOAD',
        profile: { displayName: 'Ada' },
        publishState: { targets: {} },
        projects: makeProjects(['a', 'b']),
      },
    )
    expect(next.profile.displayName).toBe('Ada')
    expect(next.publishState).toEqual({ targets: {} })
    expect(next.projects).toHaveLength(2)
    expect(next.isPublishing).toBe(false)
    expect(next.lastPublishError).toBeNull()
  })

  it('LOAD seeds lastSavedAt so PreviewPane does not spuriously reload on hydration', () => {
    const next = portfolioStoreReducer(initialPortfolioStoreState, {
      type: 'LOAD',
      profile: {},
      publishState: { targets: {} },
      projects: [],
    })
    expect(typeof next.lastSavedAt).toBe('number')
    expect(next.lastSavedAt).toBeGreaterThan(0)
  })

  it('BUMP_REFRESH increments refreshTrigger by one', () => {
    const start = stateWith({ refreshTrigger: 4 })
    const next = portfolioStoreReducer(start, { type: 'BUMP_REFRESH' })
    expect(next.refreshTrigger).toBe(5)
    const next2 = portfolioStoreReducer(next, { type: 'BUMP_REFRESH' })
    expect(next2.refreshTrigger).toBe(6)
  })

  it('initial state has refreshTrigger = 0', () => {
    expect(initialPortfolioStoreState.refreshTrigger).toBe(0)
  })

  it('PROFILE_SAVED sets lastSavedAt to a monotonic-ish timestamp', () => {
    const before = Date.now()
    const next = portfolioStoreReducer(initialPortfolioStoreState, { type: 'PROFILE_SAVED' })
    expect(next.lastSavedAt).not.toBeNull()
    expect(next.lastSavedAt!).toBeGreaterThanOrEqual(before)
  })

  it('UPDATE_PROFILE_FIELD patches a single field without touching others', () => {
    const start = stateWith({ profile: { displayName: 'Ada', bio: 'old' } })
    const next = portfolioStoreReducer(start, {
      type: 'UPDATE_PROFILE_FIELD',
      field: 'bio',
      value: 'new',
    })
    expect(next.profile).toEqual({ displayName: 'Ada', bio: 'new' })
  })

  it('TOGGLE_PROJECT_INCLUDED flips only the matching project, keeps order', () => {
    const start = stateWith({ projects: makeProjects(['a', 'b', 'c']) })
    const next = portfolioStoreReducer(start, {
      type: 'TOGGLE_PROJECT_INCLUDED',
      projectId: 'b',
    })
    expect(next.projects.map((p) => [p.projectId, p.included, p.order])).toEqual([
      ['a', true, 0],
      ['b', false, 1],
      ['c', true, 2],
    ])
  })

  it('REORDER_PROJECT moves a project forward and reindexes order 0..n-1', () => {
    const start = stateWith({ projects: makeProjects(['a', 'b', 'c', 'd']) })
    const next = portfolioStoreReducer(start, {
      type: 'REORDER_PROJECT',
      projectId: 'a',
      newIndex: 2,
    })
    expect(next.projects.map((p) => p.projectId)).toEqual(['b', 'c', 'a', 'd'])
    expect(next.projects.map((p) => p.order)).toEqual([0, 1, 2, 3])
  })

  it('REORDER_PROJECT preserves the included flag of the moved project', () => {
    const start = stateWith({
      projects: [
        { projectId: 'a', included: false, order: 0 },
        { projectId: 'b', included: true, order: 1 },
        { projectId: 'c', included: true, order: 2 },
      ],
    })
    const next = portfolioStoreReducer(start, {
      type: 'REORDER_PROJECT',
      projectId: 'a',
      newIndex: 2,
    })
    const moved = next.projects.find((p) => p.projectId === 'a')!
    expect(moved.included).toBe(false)
    expect(moved.order).toBe(2)
  })

  it('REORDER_PROJECT clamps newIndex to [0, len-1]', () => {
    const start = stateWith({ projects: makeProjects(['a', 'b', 'c']) })
    const next = portfolioStoreReducer(start, {
      type: 'REORDER_PROJECT',
      projectId: 'a',
      newIndex: 999,
    })
    expect(next.projects.map((p) => p.projectId)).toEqual(['b', 'c', 'a'])
  })

  it('REORDER_PROJECT is a no-op for unknown project id', () => {
    const start = stateWith({ projects: makeProjects(['a', 'b']) })
    const next = portfolioStoreReducer(start, {
      type: 'REORDER_PROJECT',
      projectId: 'z',
      newIndex: 0,
    })
    expect(next).toBe(start)
  })

  it('PUBLISH_START sets isPublishing and clears lastPublishError', () => {
    const next = portfolioStoreReducer(stateWith({ lastPublishError: 'old' }), {
      type: 'PUBLISH_START',
    })
    expect(next.isPublishing).toBe(true)
    expect(next.lastPublishError).toBeNull()
  })

  it('PUBLISH_SUCCESS stores publishState, clears draft + error, ends in-flight', () => {
    const next = portfolioStoreReducer(
      stateWith({
        isPublishing: true,
        isDraft: true,
        changeList: ['bio'],
        lastPublishError: 'old',
      }),
      { type: 'PUBLISH_SUCCESS', publishState: { targets: { 'heyi.am': {
        lastPublishedAt: 'now',
        lastPublishedProfileHash: 'h',
        lastPublishedProfile: {},
        config: {},
      } } } },
    )
    expect(next.isPublishing).toBe(false)
    expect(next.lastPublishError).toBeNull()
    expect(next.isDraft).toBe(false)
    expect(next.changeList).toEqual([])
    expect(next.publishState?.targets['heyi.am']).toBeDefined()
  })

  it('PUBLISH_FAIL records error and clears in-flight', () => {
    const next = portfolioStoreReducer(stateWith({ isPublishing: true }), {
      type: 'PUBLISH_FAIL',
      error: 'nope',
    })
    expect(next.isPublishing).toBe(false)
    expect(next.lastPublishError).toBe('nope')
  })

  it('RECOMPUTE_DRAFT updates draft flag and changelist', () => {
    const next = portfolioStoreReducer(initialPortfolioStoreState, {
      type: 'RECOMPUTE_DRAFT',
      isDraft: true,
      changeList: ['bio', 'location'],
    })
    expect(next.isDraft).toBe(true)
    expect(next.changeList).toEqual(['bio', 'location'])
  })

  it('SET_ACTIVE_TARGET switches active target', () => {
    const next = portfolioStoreReducer(initialPortfolioStoreState, {
      type: 'SET_ACTIVE_TARGET',
      target: 'github',
    })
    expect(next.activeTarget).toBe('github')
  })

  it('SET_VISIBILITY patches visibility on the named target, creating the target entry if missing', () => {
    const start = stateWith({ publishState: { targets: {} } })
    const next = portfolioStoreReducer(start, {
      type: 'SET_VISIBILITY',
      target: 'heyi.am',
      visibility: 'unlisted',
    })
    expect(next.publishState?.targets['heyi.am']?.visibility).toBe('unlisted')
  })

  it('SET_VISIBILITY is a no-op when publishState is null', () => {
    const next = portfolioStoreReducer(initialPortfolioStoreState, {
      type: 'SET_VISIBILITY',
      target: 'heyi.am',
      visibility: 'unlisted',
    })
    expect(next.publishState).toBeNull()
  })
})
