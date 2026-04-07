// StatusBar — top bar inside the PortfolioWorkspace pane.
//
// Three regions:
//   left   target pill (heyi.am · Public/Unlisted) with stub chevron
//   middle state dot + phrase (never-published / publishing / error / draft / live)
//   right  primary action button (Publish / Re-publish / Retry / View live)
//
// Phase 3.1 only — target picker (chevron) is wired in Phase 4.

import { useCallback, useEffect } from 'react'
import { usePortfolioStore } from '../../hooks/usePortfolioStore'
import { publishPortfolio } from '../../api'

type PrimaryActionKind =
  | 'publish'
  | 'republish'
  | 'publishing'
  | 'retry'
  | 'viewLive'

interface PrimaryAction {
  kind: PrimaryActionKind
  label: string
  disabled: boolean
}

function derivePrimaryAction(opts: {
  isPublishing: boolean
  lastPublishError: string | null
  publishStateExists: boolean
  isDraft: boolean
}): PrimaryAction {
  if (opts.isPublishing) return { kind: 'publishing', label: 'Publishing…', disabled: true }
  if (opts.lastPublishError) return { kind: 'retry', label: 'Retry publish', disabled: false }
  if (!opts.publishStateExists) return { kind: 'publish', label: 'Publish to heyi.am', disabled: false }
  if (opts.isDraft) return { kind: 'republish', label: 'Re-publish', disabled: false }
  return { kind: 'viewLive', label: 'View live ↗', disabled: false }
}

interface StatePhrase {
  dotClass: string
  phrase: string
  testId: string
}

function deriveStatePhrase(opts: {
  publishStateExists: boolean
  isPublishing: boolean
  lastPublishError: string | null
  isDraft: boolean
  changeCount: number
}): StatePhrase {
  if (opts.isPublishing) {
    return {
      dotClass: 'bg-amber animate-pulse',
      phrase: 'Publishing…',
      testId: 'status-publishing',
    }
  }
  if (opts.lastPublishError) {
    return {
      dotClass: 'bg-error',
      phrase: `Publish failed: ${opts.lastPublishError}`,
      testId: 'status-error',
    }
  }
  if (!opts.publishStateExists) {
    return {
      dotClass: 'bg-outline',
      phrase: 'Not yet published',
      testId: 'status-never',
    }
  }
  if (opts.isDraft) {
    const n = opts.changeCount
    return {
      dotClass: 'bg-amber',
      phrase: `Draft — ${n} ${n === 1 ? 'change' : 'changes'}`,
      testId: 'status-draft',
    }
  }
  return { dotClass: 'bg-green', phrase: 'Live', testId: 'status-live' }
}

function isEditableElement(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (el.isContentEditable) return true
  return false
}

export function StatusBar() {
  const { state, dispatch } = usePortfolioStore()
  const { publishState, isPublishing, lastPublishError, isDraft, changeList } = state

  const target = publishState?.targets['heyi.am']
  const visibility = target?.visibility ?? 'public'
  const visibilityLabel = visibility === 'unlisted' ? 'Unlisted' : 'Public'

  const primary = derivePrimaryAction({
    isPublishing,
    lastPublishError,
    publishStateExists: Boolean(publishState && target),
    isDraft,
  })

  const phrase = deriveStatePhrase({
    publishStateExists: Boolean(publishState && target),
    isPublishing,
    lastPublishError,
    isDraft,
    changeCount: changeList.length,
  })

  const runPrimary = useCallback(async () => {
    if (primary.disabled) return
    if (primary.kind === 'viewLive') {
      const url = target?.url
      if (url) window.open(url, '_blank', 'noopener,noreferrer')
      return
    }
    dispatch({ type: 'PUBLISH_START' })
    try {
      const result = await publishPortfolio('heyi.am')
      dispatch({
        type: 'PUBLISH_SUCCESS',
        publishState: {
          targets: {
            ...(publishState?.targets ?? {}),
            'heyi.am': {
              lastPublishedAt: result.publishedAt ?? new Date().toISOString(),
              lastPublishedProfileHash: result.hash ?? '',
              lastPublishedProfile: state.profile,
              config: target?.config ?? {},
              visibility: target?.visibility,
              url: result.url,
            },
          },
        },
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      dispatch({ type: 'PUBLISH_FAIL', error: message })
    }
  }, [primary.disabled, primary.kind, target, publishState, dispatch, state.profile])

  // ⌘↵ / Ctrl+↵ shortcut
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Enter') return
      if (!(e.metaKey || e.ctrlKey)) return
      if (isEditableElement(e.target)) return
      if (primary.disabled) return
      e.preventDefault()
      void runPrimary()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [runPrimary, primary.disabled])

  return (
    <div
      data-testid="portfolio-statusbar"
      className="flex items-center justify-between h-11 px-4 border-b border-ghost bg-surface-lowest shrink-0"
    >
      {/* Left: target pill */}
      <button
        type="button"
        data-testid="statusbar-target-pill"
        onClick={() => console.log('open target picker')}
        className="inline-flex items-center gap-1.5 border border-ghost rounded-sm px-2 py-0.5 text-[0.8125rem] text-on-surface hover:border-outline transition-colors"
      >
        <span>heyi.am · {visibilityLabel}</span>
        <span aria-hidden="true" className="text-on-surface-variant">▾</span>
      </button>

      {/* Middle: state dot + phrase */}
      <div
        data-testid={phrase.testId}
        className="flex items-center gap-2 text-[0.8125rem] text-on-surface-variant"
      >
        <span
          aria-hidden="true"
          className={`inline-block w-2 h-2 rounded-full ${phrase.dotClass}`}
        />
        <span>{phrase.phrase}</span>
      </div>

      {/* Right: primary action */}
      <button
        type="button"
        data-testid="statusbar-primary-action"
        data-action-kind={primary.kind}
        onClick={() => void runPrimary()}
        disabled={primary.disabled}
        className="inline-flex items-center gap-1.5 font-semibold text-[0.8125rem] px-3.5 py-1.5 rounded-sm bg-primary text-on-primary hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {primary.label}
      </button>
    </div>
  )
}
