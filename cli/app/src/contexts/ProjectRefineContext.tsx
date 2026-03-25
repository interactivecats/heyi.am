import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import type { ProjectEnhanceResult, RefineAnswer } from '../api'

interface RefineState {
  dirName: string | null
  enhanceResult: ProjectEnhanceResult | null
  selectedMomentIds: string[]
  answers: RefineAnswer[]
  draftNarrative: string
  draftTimeline: ProjectEnhanceResult['timeline'] | null
}

interface RefineActions {
  init: (dirName: string, result: ProjectEnhanceResult) => void
  setSelectedMoments: (ids: string[]) => void
  setAnswers: (answers: RefineAnswer[]) => void
  setDraft: (narrative: string, timeline: ProjectEnhanceResult['timeline']) => void
  reset: () => void
}

type RefineContextValue = RefineState & RefineActions

const initial: RefineState = {
  dirName: null,
  enhanceResult: null,
  selectedMomentIds: [],
  answers: [],
  draftNarrative: '',
  draftTimeline: null,
}

const RefineContext = createContext<RefineContextValue | null>(null)

export function ProjectRefineProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<RefineState>(initial)

  const init = useCallback((dirName: string, result: ProjectEnhanceResult) => {
    setState({
      dirName,
      enhanceResult: result,
      selectedMomentIds: [],
      answers: [],
      draftNarrative: result.narrative,
      draftTimeline: result.timeline,
    })
  }, [])

  const setSelectedMoments = useCallback((ids: string[]) => {
    setState((s) => ({ ...s, selectedMomentIds: ids }))
  }, [])

  const setAnswers = useCallback((answers: RefineAnswer[]) => {
    setState((s) => ({ ...s, answers }))
  }, [])

  const setDraft = useCallback(
    (narrative: string, timeline: ProjectEnhanceResult['timeline']) => {
      setState((s) => ({ ...s, draftNarrative: narrative, draftTimeline: timeline }))
    },
    [],
  )

  const reset = useCallback(() => setState(initial), [])

  return (
    <RefineContext value={{ ...state, init, setSelectedMoments, setAnswers, setDraft, reset }}>
      {children}
    </RefineContext>
  )
}

export function useRefine() {
  const ctx = useContext(RefineContext)
  if (!ctx) throw new Error('useRefine must be used within ProjectRefineProvider')
  return ctx
}
