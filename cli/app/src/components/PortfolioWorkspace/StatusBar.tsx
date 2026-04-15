// StatusBar — top bar inside the PortfolioWorkspace pane.
//
// Three regions:
//   left   target pill (heyi.am · Public/Unlisted) with stub chevron
//   middle state dot + phrase (never-published / publishing / error / draft / live)
//   right  primary action button (Publish / Re-publish / Retry)
//
// "View live" intentionally isn't a primary action here — it duplicated the
// PreviewPane's "Open in browser ↗" link and tended to point at a stale URL
// whenever the publish response had been recorded against the wrong env.
// Once the portfolio is live the primary action stays on Re-publish so the
// user always has an obvious way to push the latest edits.

import { useCallback, useEffect, useState } from 'react'
import { usePortfolioStore } from '../../hooks/usePortfolioStore'
import { publishPortfolio, startLogin, pollDeviceAuth, type PortfolioPublishEvent } from '../../api'
import { TargetPickerSheet } from './TargetPickerSheet'

type AuthState =
  | null
  | { step: 'opening' }
  | { step: 'waiting'; deviceCode: string; verificationUri: string }
  | { step: 'done' }
  | { step: 'error'; error: string }

type PrimaryActionKind =
  | 'publish'
  | 'republish'
  | 'publishing'
  | 'retry'

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
  // Already published. Show Re-publish unconditionally (even when there are
  // no pending changes) so the user always has a one-click way to push.
  // Viewing the live site lives on the PreviewPane's "Open in browser ↗".
  return { kind: 'republish', label: 'Re-publish', disabled: false }
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
  latestProgress?: string
}): StatePhrase {
  if (opts.isPublishing) {
    return {
      dotClass: 'bg-amber animate-pulse',
      phrase: opts.latestProgress || 'Publishing…',
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
  const { publishState, isPublishing, lastPublishError, isDraft, changeList, publishProgress } = state
  const [targetPickerOpen, setTargetPickerOpen] = useState(false)
  const [authState, setAuthState] = useState<AuthState>(null)

  const target = publishState?.targets['heyi.am']
  const visibility = target?.visibility ?? 'public'
  const visibilityLabel = visibility === 'unlisted' ? 'Unlisted' : 'Public'

  const primary = derivePrimaryAction({
    isPublishing: isPublishing || authState?.step === 'opening' || authState?.step === 'waiting',
    lastPublishError,
    publishStateExists: Boolean(publishState && target),
    isDraft,
  })

  const latestProgress = publishProgress.length > 0 ? publishProgress[publishProgress.length - 1] : undefined
  const phrase = deriveStatePhrase({
    publishStateExists: Boolean(publishState && target),
    isPublishing: isPublishing || authState?.step === 'opening' || authState?.step === 'waiting',
    lastPublishError,
    isDraft,
    changeCount: changeList.length,
    latestProgress,
  })

  const doPublish = useCallback(() => {
    dispatch({ type: 'PUBLISH_START' })
    publishPortfolio('heyi.am', (event: PortfolioPublishEvent) => {
      switch (event.type) {
        case 'progress':
          dispatch({ type: 'PUBLISH_PROGRESS', message: event.message })
          break
        case 'project':
          dispatch({
            type: 'PUBLISH_PROGRESS',
            message: `${event.project}: ${event.status} (${event.index}/${event.total})`,
          })
          break
        case 'session':
          dispatch({
            type: 'PUBLISH_PROGRESS',
            message: `${event.project ? event.project + ': ' : ''}session ${event.status}`,
          })
          break
        case 'done':
          dispatch({
            type: 'PUBLISH_SUCCESS',
            publishState: {
              targets: {
                ...(publishState?.targets ?? {}),
                'heyi.am': {
                  lastPublishedAt: event.publishedAt ?? new Date().toISOString(),
                  lastPublishedProfileHash: event.hash ?? '',
                  lastPublishedProfile: state.profile,
                  config: target?.config ?? {},
                  visibility: target?.visibility,
                  url: event.url,
                },
              },
            },
          })
          break
        case 'error':
          if (event.message === 'AUTH_REQUIRED' || event.message === 'Authentication required') {
            dispatch({ type: 'PUBLISH_FAIL', error: '' })
            startDeviceLogin()
          } else {
            dispatch({ type: 'PUBLISH_FAIL', error: event.message })
          }
          break
      }
    })
  }, [publishState, dispatch, state.profile, target])

  const startDeviceLogin = useCallback(async () => {
    setAuthState({ step: 'opening' })
    try {
      const deviceInfo = await startLogin()
      window.open(deviceInfo.verification_uri, '_blank')
      setAuthState({ step: 'waiting', deviceCode: deviceInfo.device_code, verificationUri: deviceInfo.verification_uri })

      const startTime = Date.now()
      const poll = async () => {
        try {
          const status = await pollDeviceAuth(deviceInfo.device_code)
          if (status.authenticated) {
            setAuthState({ step: 'done' })
            setTimeout(() => {
              setAuthState(null)
              doPublish()
            }, 500)
            return
          }
        } catch { /* authorization_pending */ }
        if (Date.now() - startTime < 300_000) {
          setTimeout(poll, 5000)
        } else {
          setAuthState({ step: 'error', error: 'Timed out. Try again.' })
        }
      }
      setTimeout(poll, 5000)
    } catch {
      setAuthState({ step: 'error', error: 'Could not connect. Try again later.' })
    }
  }, [doPublish])

  const runPrimary = useCallback(() => {
    if (primary.disabled) return
    doPublish()
  }, [primary.disabled, doPublish])

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
      <TargetPickerSheet
        open={targetPickerOpen}
        onClose={() => setTargetPickerOpen(false)}
      />
      {/* Left: target pill */}
      <button
        type="button"
        data-testid="statusbar-target-pill"
        onClick={() => setTargetPickerOpen(true)}
        className="inline-flex items-center gap-1.5 border border-ghost rounded-sm px-2 py-0.5 text-[0.8125rem] text-on-surface hover:border-outline transition-colors"
      >
        <span>heyi.am · {visibilityLabel}</span>
        <span aria-hidden="true" className="text-on-surface-variant">▾</span>
      </button>

      {/* Middle: state dot + phrase */}
      <div
        data-testid={authState ? 'status-auth' : phrase.testId}
        className="flex items-center gap-2 text-[0.8125rem] text-on-surface-variant"
      >
        {authState?.step === 'opening' && (
          <>
            <span aria-hidden="true" className="inline-block w-2 h-2 rounded-full bg-amber animate-pulse" />
            <span>Starting login...</span>
          </>
        )}
        {authState?.step === 'waiting' && (
          <>
            <span aria-hidden="true" className="inline-block w-2 h-2 rounded-full bg-amber animate-pulse" />
            <span>Waiting for login in browser...</span>
          </>
        )}
        {authState?.step === 'done' && (
          <>
            <span aria-hidden="true" className="inline-block w-2 h-2 rounded-full bg-green" />
            <span>Authenticated — publishing...</span>
          </>
        )}
        {authState?.step === 'error' && (
          <>
            <span aria-hidden="true" className="inline-block w-2 h-2 rounded-full bg-error" />
            <span>{authState.error}</span>
          </>
        )}
        {!authState && (
          <>
            <span
              aria-hidden="true"
              className={`inline-block w-2 h-2 rounded-full ${phrase.dotClass}`}
            />
            <span>{phrase.phrase}</span>
          </>
        )}
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
