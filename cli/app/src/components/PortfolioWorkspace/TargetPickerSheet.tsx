// TargetPickerSheet — modal shown when the StatusBar target pill chevron is
// clicked. Lets the user pick which target ("heyi.am", "Download as zip",
// or "GitHub Pages") the Publish button should push to, and configure each
// target inline.
//
// Phase 5 scope:
//   • "Download as zip" — single-click action that streams the rendered
//     portfolio as a zip attachment via /api/portfolio/export. No path
//     picker, no persistent active state — downloading IS the action.
//   • "heyi.am" shows a Public/Unlisted radio (v1 visibility control).
//   • "GitHub Pages" — full device-auth flow + repo picker + publish.
//
// The sheet closes on Escape, click outside its body, or the ✕ button.

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  usePortfolioStore,
  type PortfolioTargetId,
} from '../../hooks/usePortfolioStore'
import {
  downloadPortfolioZip,
  requestGithubDeviceCode,
  pollGithubToken,
  fetchGithubAccount,
  fetchGithubRepos,
  publishToGithub,
  GithubApiError,
  type GithubAccount,
  type GithubRepo,
  type GithubDeviceCode,
  type GithubPollResponse,
} from '../../api'

interface TargetPickerSheetProps {
  open: boolean
  onClose: () => void
}

type GithubFlowState =
  | { kind: 'loading' }
  | { kind: 'idle' }
  | { kind: 'awaiting'; deviceCode: GithubDeviceCode }
  | { kind: 'connected'; account: GithubAccount }
  | { kind: 'error'; message: string }
  | { kind: 'timeout' }

export function TargetPickerSheet({ open, onClose }: TargetPickerSheetProps) {
  const { state, dispatch } = usePortfolioStore()
  const { activeTarget, publishState } = state
  const bodyRef = useRef<HTMLDivElement | null>(null)

  const heyiamTarget = publishState?.targets['heyi.am']
  const heyiamVisibility = heyiamTarget?.visibility ?? 'public'

  // Export download state
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const [downloadedFilename, setDownloadedFilename] = useState<string | null>(null)

  // Escape closes.
  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  const onOverlayMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (bodyRef.current && e.target instanceof Node && !bodyRef.current.contains(e.target)) {
        onClose()
      }
    },
    [onClose],
  )

  const setActiveTarget = useCallback(
    (target: PortfolioTargetId) => {
      dispatch({ type: 'SET_ACTIVE_TARGET', target })
    },
    [dispatch],
  )

  const setHeyiamVisibility = useCallback(
    (value: 'public' | 'unlisted') => {
      dispatch({ type: 'SET_VISIBILITY', target: 'heyi.am', visibility: value })
    },
    [dispatch],
  )

  const onDownloadZip = useCallback(async () => {
    setDownloadError(null)
    setDownloadedFilename(null)
    setDownloading(true)
    try {
      const result = await downloadPortfolioZip()
      setDownloadedFilename(result.filename)
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'Download failed')
    } finally {
      setDownloading(false)
    }
  }, [])

  // ── GitHub flow ────────────────────────────────────────────
  const [githubFlow, setGithubFlow] = useState<GithubFlowState>({ kind: 'loading' })
  const [repos, setRepos] = useState<GithubRepo[]>([])
  const [reposLoading, setReposLoading] = useState(false)
  const [selectedRepo, setSelectedRepo] = useState<string>('')
  const [publishing, setPublishing] = useState(false)
  const [publishError, setPublishError] = useState<string | null>(null)
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null)
  const [copiedCode, setCopiedCode] = useState(false)

  // Initial probe: are we already connected?
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setGithubFlow({ kind: 'loading' })
    fetchGithubAccount()
      .then((account) => {
        if (cancelled) return
        if (account) {
          setGithubFlow({ kind: 'connected', account })
        } else {
          setGithubFlow({ kind: 'idle' })
        }
      })
      .catch((err) => {
        if (cancelled) return
        // 401 from auth-required server means treat as idle, not error.
        if (err instanceof GithubApiError && err.status === 401) {
          setGithubFlow({ kind: 'idle' })
        } else {
          setGithubFlow({
            kind: 'error',
            message: err instanceof Error ? err.message : 'Failed to load GitHub account',
          })
        }
      })
    return () => {
      cancelled = true
    }
  }, [open])

  // Fetch repos when we transition into "connected".
  useEffect(() => {
    if (githubFlow.kind !== 'connected') return
    let cancelled = false
    setReposLoading(true)
    fetchGithubRepos()
      .then((list) => {
        if (cancelled) return
        setRepos(list)
        // Auto-select the first non-fork-ish repo if any.
        if (list.length > 0 && !selectedRepo) {
          setSelectedRepo(list[0].full_name)
        }
      })
      .catch((err) => {
        if (cancelled) return
        setPublishError(err instanceof Error ? err.message : 'Failed to load repos')
      })
      .finally(() => {
        if (!cancelled) setReposLoading(false)
      })
    return () => {
      cancelled = true
    }
    // selectedRepo intentionally excluded — we only auto-select on first load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [githubFlow.kind])

  // Polling effect: when in awaiting state, poll for token at the device
  // flow's specified interval. Each tick is a single non-blocking request.
  // Stops on success/error/timeout/unmount.
  useEffect(() => {
    if (githubFlow.kind !== 'awaiting') return
    const { deviceCode } = githubFlow
    const intervalMs = Math.max(deviceCode.interval, 1) * 1000
    const deadline = Date.now() + deviceCode.expires_in * 1000
    let cancelled = false

    async function tick() {
      if (cancelled) return
      if (Date.now() >= deadline) {
        setGithubFlow({ kind: 'timeout' })
        return
      }
      try {
        const result: GithubPollResponse = await pollGithubToken({
          device_code: deviceCode.device_code,
        })
        if (cancelled) return
        switch (result.status) {
          case 'success':
            setGithubFlow({ kind: 'connected', account: result.account })
            break
          case 'pending':
            // Keep polling — next tick will fire on the interval.
            break
          case 'expired':
            setGithubFlow({ kind: 'timeout' })
            break
          case 'denied':
            setGithubFlow({ kind: 'error', message: 'Authorization denied by user' })
            break
        }
      } catch (err) {
        if (cancelled) return
        const message = err instanceof Error ? err.message : 'Authorization failed'
        setGithubFlow({ kind: 'error', message })
      }
    }

    const id = window.setInterval(() => { void tick() }, intervalMs)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [githubFlow])

  const onConnectGithub = useCallback(async () => {
    setPublishError(null)
    setPublishedUrl(null)
    setGithubFlow({ kind: 'loading' })
    try {
      const deviceCode = await requestGithubDeviceCode()
      setGithubFlow({ kind: 'awaiting', deviceCode })
    } catch (err) {
      setGithubFlow({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Failed to start device auth',
      })
    }
  }, [])

  const onCopyCode = useCallback(async (code: string) => {
    try {
      await navigator.clipboard.writeText(code)
      setCopiedCode(true)
      window.setTimeout(() => setCopiedCode(false), 1500)
    } catch {
      // Clipboard API may be unavailable in test envs — silent.
    }
  }, [])

  const onPublishToGithub = useCallback(async () => {
    if (!selectedRepo || githubFlow.kind !== 'connected') return
    const [owner, repo] = selectedRepo.split('/')
    if (!owner || !repo) return
    setPublishing(true)
    setPublishError(null)
    setPublishedUrl(null)
    try {
      const result = await publishToGithub({ owner, repo })
      setPublishedUrl(result.url)
      dispatch({ type: 'SET_ACTIVE_TARGET', target: 'github' })
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : 'Publish failed')
    } finally {
      setPublishing(false)
    }
  }, [dispatch, githubFlow, selectedRepo])

  if (!open) return null

  const overlayClass =
    'fixed inset-0 z-50 flex items-center justify-center bg-black/40'
  const bodyClass =
    'w-[560px] max-w-[92vw] max-h-[90vh] overflow-y-auto bg-surface-low border border-ghost rounded-md p-6 relative'

  return (
    <div
      data-testid="target-picker-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Choose publish target"
      className={overlayClass}
      onMouseDown={onOverlayMouseDown}
    >
      <div ref={bodyRef} className={bodyClass} data-testid="target-picker-sheet">
        <button
          type="button"
          data-testid="target-picker-close"
          onClick={onClose}
          aria-label="Close target picker"
          className="absolute top-3 right-3 text-on-surface-variant hover:text-on-surface text-lg leading-none"
        >
          ×
        </button>

        <h2 className="text-[0.9375rem] font-semibold text-on-surface mb-1">
          Publish target
        </h2>
        <p className="text-[0.8125rem] text-on-surface-variant mb-5">
          Where should the Publish button push your portfolio?
        </p>

        <div className="flex flex-col gap-3">
          {/* ── Download as zip ───────────────────────────────────── */}
          <section
            data-testid="target-card-export"
            className="border border-ghost rounded-sm p-4 bg-surface-lowest"
          >
            <div className="mb-2">
              <h3 className="text-[0.875rem] font-semibold text-on-surface">
                Download as .zip
              </h3>
              <p className="text-[0.75rem] text-on-surface-variant mt-0.5">
                Render the full portfolio as a static site and download it as a zip. Host it anywhere.
              </p>
            </div>

            <div className="mt-3 flex items-center gap-3">
              <button
                type="button"
                data-testid="target-export-download"
                onClick={() => void onDownloadZip()}
                disabled={downloading}
                className="text-[0.8125rem] px-3 py-1 rounded-sm bg-primary text-on-primary hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {downloading ? 'Building zip…' : 'Download as .zip'}
              </button>
              {downloadedFilename ? (
                <span
                  data-testid="target-export-downloaded-filename"
                  className="text-[0.75rem] text-on-surface-variant truncate"
                >
                  Downloaded {downloadedFilename}
                </span>
              ) : null}
            </div>
            {downloadError ? (
              <p
                data-testid="target-export-download-error"
                className="text-[0.75rem] text-error mt-2"
              >
                {downloadError}
              </p>
            ) : null}
          </section>

          {/* ── heyi.am ───────────────────────────────────────────── */}
          <section
            data-testid="target-card-heyiam"
            className="border border-ghost rounded-sm p-4 bg-surface-lowest"
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <div>
                <h3 className="text-[0.875rem] font-semibold text-on-surface">heyi.am</h3>
                <p className="text-[0.75rem] text-on-surface-variant mt-0.5">
                  Hosted at heyi.am/your-handle. No DNS, no config.
                </p>
              </div>
              {activeTarget === 'heyi.am' ? (
                <span
                  data-testid="target-heyiam-active-badge"
                  className="text-[0.6875rem] uppercase tracking-wide text-primary border border-primary rounded-sm px-1.5 py-0.5 shrink-0"
                >
                  Active
                </span>
              ) : null}
            </div>

            <fieldset className="mt-3 flex items-center gap-4">
              <legend className="sr-only">Visibility</legend>
              <label className="flex items-center gap-1.5 text-[0.8125rem] text-on-surface cursor-pointer">
                <input
                  type="radio"
                  name="heyiam-visibility"
                  value="public"
                  data-testid="target-heyiam-visibility-public"
                  checked={heyiamVisibility === 'public'}
                  onChange={() => setHeyiamVisibility('public')}
                />
                <span>Public</span>
              </label>
              <label className="flex items-center gap-1.5 text-[0.8125rem] text-on-surface cursor-pointer">
                <input
                  type="radio"
                  name="heyiam-visibility"
                  value="unlisted"
                  data-testid="target-heyiam-visibility-unlisted"
                  checked={heyiamVisibility === 'unlisted'}
                  onChange={() => setHeyiamVisibility('unlisted')}
                />
                <span>Unlisted</span>
              </label>
            </fieldset>

            <div className="mt-4">
              <button
                type="button"
                data-testid="target-heyiam-set-active"
                onClick={() => setActiveTarget('heyi.am')}
                disabled={activeTarget === 'heyi.am'}
                className="text-[0.8125rem] px-3 py-1 rounded-sm bg-primary text-on-primary hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {activeTarget === 'heyi.am' ? 'Active target' : 'Set as active target'}
              </button>
            </div>
          </section>

          {/* ── GitHub Pages ──────────────────────────────────────── */}
          <section
            data-testid="target-card-github"
            className="border border-ghost rounded-sm p-4 bg-surface-lowest"
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <div>
                <h3 className="text-[0.875rem] font-semibold text-on-surface">GitHub Pages</h3>
                <p className="text-[0.75rem] text-on-surface-variant mt-0.5">
                  Push rendered HTML to a gh-pages branch of a repo you own.
                </p>
              </div>
              {activeTarget === 'github' ? (
                <span
                  data-testid="target-github-active-badge"
                  className="text-[0.6875rem] uppercase tracking-wide text-primary border border-primary rounded-sm px-1.5 py-0.5 shrink-0"
                >
                  Active
                </span>
              ) : null}
            </div>

            <GithubCardBody
              flow={githubFlow}
              onConnect={onConnectGithub}
              onCopyCode={onCopyCode}
              copiedCode={copiedCode}
              repos={repos}
              reposLoading={reposLoading}
              selectedRepo={selectedRepo}
              onSelectRepo={setSelectedRepo}
              publishing={publishing}
              publishError={publishError}
              publishedUrl={publishedUrl}
              onPublish={onPublishToGithub}
              onRetry={onConnectGithub}
            />
          </section>
        </div>
      </div>
    </div>
  )
}

// ── GitHub card body ───────────────────────────────────────────

interface GithubCardBodyProps {
  flow: GithubFlowState
  onConnect: () => void
  onCopyCode: (code: string) => void
  copiedCode: boolean
  repos: GithubRepo[]
  reposLoading: boolean
  selectedRepo: string
  onSelectRepo: (full: string) => void
  publishing: boolean
  publishError: string | null
  publishedUrl: string | null
  onPublish: () => void
  onRetry: () => void
}

function GithubCardBody(props: GithubCardBodyProps) {
  const {
    flow, onConnect, onCopyCode, copiedCode,
    repos, reposLoading, selectedRepo, onSelectRepo,
    publishing, publishError, publishedUrl, onPublish, onRetry,
  } = props

  if (flow.kind === 'loading') {
    return (
      <div data-testid="github-loading" className="mt-3 text-[0.75rem] text-on-surface-variant">
        Checking GitHub connection…
      </div>
    )
  }

  if (flow.kind === 'idle') {
    return (
      <div className="mt-3">
        <button
          type="button"
          data-testid="github-connect"
          onClick={onConnect}
          className="text-[0.8125rem] px-3 py-1 rounded-sm bg-primary text-on-primary hover:bg-primary-hover"
        >
          Connect GitHub
        </button>
      </div>
    )
  }

  if (flow.kind === 'awaiting') {
    const { user_code, verification_uri } = flow.deviceCode
    return (
      <div data-testid="github-awaiting" className="mt-3 flex flex-col gap-3">
        <div
          data-testid="github-user-code"
          className="font-mono text-2xl tracking-widest text-on-surface bg-surface-low border border-ghost rounded-sm py-2 px-3 inline-block"
        >
          {user_code}
        </div>
        <div className="flex items-center gap-3">
          <a
            href={verification_uri}
            target="_blank"
            rel="noreferrer"
            data-testid="github-verification-link"
            className="text-[0.8125rem] text-primary underline"
          >
            Open {verification_uri.replace(/^https?:\/\//, '')} ↗
          </a>
          <button
            type="button"
            data-testid="github-copy-code"
            onClick={() => onCopyCode(user_code)}
            className="text-[0.75rem] px-2 py-0.5 rounded-sm border border-ghost hover:border-outline text-on-surface-variant"
          >
            {copiedCode ? 'Copied' : 'Copy code'}
          </button>
        </div>
        <div className="flex items-center gap-2 text-[0.75rem] text-on-surface-variant">
          <span
            data-testid="github-spinner"
            aria-hidden
            className="inline-block w-3 h-3 rounded-full border border-on-surface-variant border-t-transparent animate-spin"
          />
          Waiting for you to authorize…
        </div>
      </div>
    )
  }

  if (flow.kind === 'error') {
    return (
      <div data-testid="github-error" className="mt-3 flex flex-col gap-2">
        <p className="text-[0.75rem] text-error">{flow.message}</p>
        <button
          type="button"
          data-testid="github-retry"
          onClick={onRetry}
          className="self-start text-[0.8125rem] px-3 py-1 rounded-sm border border-ghost hover:border-outline text-on-surface"
        >
          Try again
        </button>
      </div>
    )
  }

  if (flow.kind === 'timeout') {
    return (
      <div data-testid="github-timeout" className="mt-3 flex flex-col gap-2">
        <p className="text-[0.75rem] text-on-surface-variant">Code expired.</p>
        <button
          type="button"
          data-testid="github-new-code"
          onClick={onRetry}
          className="self-start text-[0.8125rem] px-3 py-1 rounded-sm border border-ghost hover:border-outline text-on-surface"
        >
          Get a new code
        </button>
      </div>
    )
  }

  // Connected
  const account = flow.account
  return (
    <div data-testid="github-connected" className="mt-3 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <img
          src={account.avatarUrl}
          alt=""
          data-testid="github-account-avatar"
          className="w-6 h-6 rounded-full border border-ghost"
        />
        <span className="text-[0.8125rem] text-on-surface">
          Connected as <strong>{account.login}</strong>
          {account.name ? <span className="text-on-surface-variant"> ({account.name})</span> : null}
        </span>
      </div>

      <label className="flex flex-col gap-1 text-[0.75rem] text-on-surface-variant">
        Repository
        <select
          data-testid="github-repo-select"
          value={selectedRepo}
          onChange={(e) => onSelectRepo(e.target.value)}
          disabled={reposLoading || repos.length === 0}
          className="bg-surface-low border border-ghost rounded-sm px-2 py-1 text-on-surface text-[0.8125rem]"
        >
          {reposLoading ? (
            <option value="">Loading repos…</option>
          ) : repos.length === 0 ? (
            <option value="">No repos available</option>
          ) : (
            repos.map((r) => (
              <option key={r.id} value={r.full_name}>
                {r.full_name}
                {r.private ? ' (private)' : ''}
              </option>
            ))
          )}
        </select>
      </label>

      <button
        type="button"
        data-testid="github-publish"
        onClick={onPublish}
        disabled={publishing || !selectedRepo}
        className="self-start text-[0.8125rem] px-3 py-1 rounded-sm bg-primary text-on-primary hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {publishing
          ? 'Publishing…'
          : selectedRepo
            ? `Publish to ${selectedRepo}`
            : 'Publish'}
      </button>

      {publishError ? (
        <p data-testid="github-publish-error" className="text-[0.75rem] text-error">
          {publishError}
        </p>
      ) : null}
      {publishedUrl ? (
        <p data-testid="github-published-url" className="text-[0.75rem] text-on-surface-variant">
          Published at{' '}
          <a
            href={publishedUrl}
            target="_blank"
            rel="noreferrer"
            className="text-primary underline"
          >
            {publishedUrl} ↗
          </a>
        </p>
      ) : null}
    </div>
  )
}
