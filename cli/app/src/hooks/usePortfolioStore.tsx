// Portfolio workspace state store.
//
// Lives as a React Context + useReducer pair scoped to <PortfolioWorkspace/>.
// No Zustand/Redux — the CLI app has no state management library, and the
// portfolio workspace state is small enough that a typed reducer is more
// honest than a generic store. If this grows past ~15 fields or starts being
// read outside the workspace, revisit.

import {
  createContext,
  useContext,
  useMemo,
  useReducer,
  type Dispatch,
  type ReactNode,
} from 'react'
import {
  type PortfolioProfile,
  type PortfolioPublishState,
  type PortfolioTargetVisibility,
} from '../api'

export type PortfolioTargetId = 'heyi.am' | 'github'

/** Project entry on the portfolio. Order is user-curated (drag-to-reorder). */
export interface PortfolioProjectEntry {
  projectId: string
  included: boolean
  order: number
}

export interface PortfolioStoreState {
  activeTarget: PortfolioTargetId
  publishState: PortfolioPublishState | null
  profile: PortfolioProfile
  projects: PortfolioProjectEntry[]
  isDraft: boolean
  changeList: string[]
  isPublishing: boolean
  lastPublishError: string | null
  /**
   * Timestamp (ms) of the last successful profile save. PreviewPane keys its
   * iframe reload off this value so the iframe only remounts when the backend
   * actually has fresh HTML to serve — not on every keystroke. `null` means
   * no save has completed yet in this session (fresh mount).
   */
  lastSavedAt: number | null
  /**
   * Monotonically incrementing counter that PreviewPane includes in the
   * iframe key. Bumped after server-side state changes the live DOM patcher
   * cannot reach (project list reorder/toggle, manual Refresh, etc.) so the
   * iframe re-mounts and re-fetches against the latest server render.
   * Profile field updates do NOT bump this — they go through the live
   * patcher instead.
   */
  refreshTrigger: number
}

export const initialPortfolioStoreState: PortfolioStoreState = {
  activeTarget: 'heyi.am',
  publishState: null,
  profile: {},
  projects: [],
  isDraft: false,
  changeList: [],
  isPublishing: false,
  lastPublishError: null,
  lastSavedAt: null,
  refreshTrigger: 0,
}

// ── Actions ──────────────────────────────────────────────────

export type PortfolioStoreAction =
  | {
      type: 'LOAD'
      profile: PortfolioProfile
      publishState: PortfolioPublishState
      projects: PortfolioProjectEntry[]
    }
  | { type: 'UPDATE_PROFILE_FIELD'; field: keyof PortfolioProfile; value: string | undefined }
  | { type: 'PROFILE_SAVED' }
  | { type: 'BUMP_REFRESH' }
  | { type: 'TOGGLE_PROJECT_INCLUDED'; projectId: string }
  | { type: 'REORDER_PROJECT'; projectId: string; newIndex: number }
  | { type: 'PUBLISH_START' }
  | { type: 'PUBLISH_SUCCESS'; publishState: PortfolioPublishState }
  | { type: 'PUBLISH_FAIL'; error: string }
  | { type: 'RECOMPUTE_DRAFT'; isDraft: boolean; changeList: string[] }
  | { type: 'SET_ACTIVE_TARGET'; target: PortfolioTargetId }
  | {
      type: 'SET_VISIBILITY'
      target: PortfolioTargetId
      visibility: PortfolioTargetVisibility
    }

// ── Reducer ──────────────────────────────────────────────────

export function portfolioStoreReducer(
  state: PortfolioStoreState,
  action: PortfolioStoreAction,
): PortfolioStoreState {
  switch (action.type) {
    case 'LOAD':
      return {
        ...state,
        profile: action.profile,
        publishState: action.publishState,
        projects: normalizeOrder(action.projects),
        isPublishing: false,
        lastPublishError: null,
        // Seed lastSavedAt at hydration time so PreviewPane's first-render
        // iframe mount is the baseline — we don't want a spurious reload when
        // null→number transitions after the first real save.
        lastSavedAt: Date.now(),
      }

    case 'UPDATE_PROFILE_FIELD': {
      const nextProfile = { ...state.profile, [action.field]: action.value }
      return { ...state, profile: nextProfile }
    }

    case 'PROFILE_SAVED':
      return { ...state, lastSavedAt: Date.now() }

    case 'BUMP_REFRESH':
      return { ...state, refreshTrigger: state.refreshTrigger + 1 }

    case 'TOGGLE_PROJECT_INCLUDED': {
      const nextProjects = state.projects.map((p) =>
        p.projectId === action.projectId ? { ...p, included: !p.included } : p,
      )
      return { ...state, projects: nextProjects }
    }

    case 'REORDER_PROJECT': {
      const current = state.projects.slice().sort((a, b) => a.order - b.order)
      const fromIdx = current.findIndex((p) => p.projectId === action.projectId)
      if (fromIdx === -1) return state
      const [moved] = current.splice(fromIdx, 1)
      const clampedIdx = Math.max(0, Math.min(action.newIndex, current.length))
      current.splice(clampedIdx, 0, moved)
      return { ...state, projects: current.map((p, i) => ({ ...p, order: i })) }
    }

    case 'PUBLISH_START':
      return { ...state, isPublishing: true, lastPublishError: null }

    case 'PUBLISH_SUCCESS':
      return {
        ...state,
        isPublishing: false,
        lastPublishError: null,
        publishState: action.publishState,
        isDraft: false,
        changeList: [],
      }

    case 'PUBLISH_FAIL':
      return { ...state, isPublishing: false, lastPublishError: action.error }

    case 'RECOMPUTE_DRAFT':
      return { ...state, isDraft: action.isDraft, changeList: action.changeList }

    case 'SET_ACTIVE_TARGET':
      return { ...state, activeTarget: action.target }

    case 'SET_VISIBILITY': {
      if (!state.publishState) return state
      const existing = state.publishState.targets[action.target]
      const baseTarget = existing ?? {
        lastPublishedAt: '',
        lastPublishedProfileHash: '',
        lastPublishedProfile: {},
        config: {},
      }
      return {
        ...state,
        publishState: {
          ...state.publishState,
          targets: {
            ...state.publishState.targets,
            [action.target]: { ...baseTarget, visibility: action.visibility },
          },
        },
      }
    }

    default:
      return state
  }
}

/** Assign monotonic 0..n-1 order values while preserving current sort. */
function normalizeOrder(projects: PortfolioProjectEntry[]): PortfolioProjectEntry[] {
  return projects
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((p, i) => ({ ...p, order: i }))
}

// ── Context + Provider ───────────────────────────────────────

interface PortfolioStoreContextValue {
  state: PortfolioStoreState
  dispatch: Dispatch<PortfolioStoreAction>
}

const PortfolioStoreContext = createContext<PortfolioStoreContextValue | null>(null)

export function PortfolioStoreProvider({
  children,
  initialState,
}: {
  children: ReactNode
  initialState?: Partial<PortfolioStoreState>
}) {
  const [state, dispatch] = useReducer(portfolioStoreReducer, {
    ...initialPortfolioStoreState,
    ...initialState,
  })
  const value = useMemo(() => ({ state, dispatch }), [state])
  return (
    <PortfolioStoreContext.Provider value={value}>{children}</PortfolioStoreContext.Provider>
  )
}

export function usePortfolioStore(): PortfolioStoreContextValue {
  const ctx = useContext(PortfolioStoreContext)
  if (!ctx) {
    throw new Error('usePortfolioStore must be used inside <PortfolioStoreProvider/>')
  }
  return ctx
}
