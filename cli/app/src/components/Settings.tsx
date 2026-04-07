import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { AppShell, Card, SectionHeader } from './shared'
import {
  fetchApiKeyStatus,
  saveApiKey,
  fetchAuthStatus,
  logout,
  fetchGithubAccount,
  disconnectGithub,
  fetchArchiveStats,
  fetchLocalData,
  GithubApiError,
  type ApiKeyStatus,
  type AuthStatus,
  type GithubAccount,
  type ArchiveStats,
  type LocalDataSummary,
} from '../api'

export function Settings() {
  const [apiKey, setApiKey] = useState<ApiKeyStatus | null>(null)
  const [auth, setAuth] = useState<AuthStatus | null>(null)
  const [keyInput, setKeyInput] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [loading, setLoading] = useState(true)

  const [privacyDefaults, setPrivacyDefaults] = useState({
    localOnly: true,
    requireReview: true,
    excludeOpenClaw: false,
  })

  // ── Connected accounts (Phase 5) ──────────────────────────
  const [githubAccount, setGithubAccount] = useState<GithubAccount | null>(null)
  const [githubLoading, setGithubLoading] = useState(true)
  const [githubError, setGithubError] = useState<string | null>(null)
  const [githubDisconnecting, setGithubDisconnecting] = useState(false)
  const [githubJustDisconnected, setGithubJustDisconnected] = useState(false)

  // ── Local data (Phase 6) ──────────────────────────────────
  const [archiveStats, setArchiveStats] = useState<ArchiveStats | null>(null)
  const [localData, setLocalData] = useState<LocalDataSummary | null>(null)
  const [localDataError, setLocalDataError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetchArchiveStats().catch((err) => {
        if (!cancelled) setLocalDataError(err instanceof Error ? err.message : 'Failed to load archive stats')
        return null
      }),
      fetchLocalData().catch((err) => {
        if (!cancelled) setLocalDataError(err instanceof Error ? err.message : 'Failed to load local data')
        return null
      }),
    ]).then(([stats, ld]) => {
      if (cancelled) return
      setArchiveStats(stats)
      setLocalData(ld)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    setGithubLoading(true)
    fetchGithubAccount()
      .then((account) => {
        if (cancelled) return
        setGithubAccount(account)
        setGithubError(null)
      })
      .catch((err) => {
        if (cancelled) return
        // 401 just means "not connected" — not an error to surface.
        if (err instanceof GithubApiError && err.status === 401) {
          setGithubAccount(null)
        } else {
          setGithubError(err instanceof Error ? err.message : 'Failed to load GitHub account')
        }
      })
      .finally(() => {
        if (!cancelled) setGithubLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function handleDisconnectGithub() {
    setGithubDisconnecting(true)
    setGithubError(null)
    try {
      await disconnectGithub()
      setGithubAccount(null)
      setGithubJustDisconnected(true)
    } catch (err) {
      setGithubError(err instanceof Error ? err.message : 'Disconnect failed')
    } finally {
      setGithubDisconnecting(false)
    }
  }

  useEffect(() => {
    Promise.all([
      fetchApiKeyStatus().catch(() => ({ hasKey: false }) as ApiKeyStatus),
      fetchAuthStatus().catch(() => ({ authenticated: false }) as AuthStatus),
    ]).then(([key, authStatus]) => {
      setApiKey(key)
      setAuth(authStatus)
    }).finally(() => setLoading(false))
  }, [])

  async function handleSaveKey() {
    if (!keyInput.trim()) return
    setSaving(true)
    try {
      await saveApiKey(keyInput.trim())
      setApiKey({ hasKey: true, keyPrefix: keyInput.trim().slice(0, 16) })
      setKeyInput('')
    } finally {
      setSaving(false)
    }
  }

  async function handleRemoveKey() {
    setSaving(true)
    try {
      await saveApiKey('')
      setApiKey({ hasKey: false })
      setKeyInput('')
      setShowKey(false)
    } finally {
      setSaving(false)
    }
  }

  async function handleLogout() {
    setLoggingOut(true)
    try {
      await logout()
      setAuth({ authenticated: false })
    } finally {
      setLoggingOut(false)
    }
  }

  function togglePrivacy(key: keyof typeof privacyDefaults) {
    setPrivacyDefaults((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  if (loading || !apiKey || !auth) {
    return (
      <AppShell back={{ label: 'Projects', to: '/projects' }} chips={[{ label: 'Settings' }]}>
        <div className="max-w-3xl mx-auto p-6">
          <span className="text-sm text-on-surface-variant">Loading settings...</span>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell
      back={{ label: 'Projects', to: '/projects' }}
      chips={[{ label: 'Settings' }]}
    >
      <div className="max-w-3xl mx-auto p-6">
        <h2 className="font-display text-2xl font-bold text-on-surface">Settings</h2>

        {/* API configuration + Privacy defaults */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
          <Card>
            <SectionHeader title="API configuration" meta="local only" />
            <label className="font-mono text-[11px] uppercase tracking-wider text-on-surface-variant block mb-1.5">
              Anthropic API Key
            </label>
            {apiKey.hasKey && !keyInput ? (
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey.keyPrefix ? `${apiKey.keyPrefix}...` : '••••••••••••'}
                readOnly
                className="w-full bg-surface-low border border-ghost rounded-md px-3 py-1.5 text-sm font-mono text-on-surface mb-2"
              />
            ) : (
              <input
                type="password"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder="sk-ant-api03-..."
                className="w-full bg-surface-low border border-ghost rounded-md px-3 py-1.5 text-sm font-mono text-on-surface mb-2"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveKey()
                }}
              />
            )}
            <p className="text-on-surface-variant text-xs mb-3">
              Used for project refinement. Keys stay on your machine.
            </p>
            <div className="flex items-center gap-2">
              {apiKey.hasKey && !keyInput ? (
                <>
                  <button
                    className="text-xs font-medium px-2.5 py-1 rounded-md border border-outline text-on-surface hover:bg-surface-low transition-colors"
                    onClick={() => setShowKey(!showKey)}
                  >
                    {showKey ? 'Hide' : 'Show'}
                  </button>
                  <button
                    className="text-xs font-medium px-2.5 py-1 rounded-md text-on-surface-variant hover:text-on-surface transition-colors"
                    onClick={handleRemoveKey}
                    disabled={saving}
                  >
                    Remove
                  </button>
                </>
              ) : keyInput ? (
                <button
                  className="text-xs font-medium px-2.5 py-1 rounded-md bg-primary text-on-primary hover:bg-primary-hover transition-colors"
                  onClick={handleSaveKey}
                  disabled={saving}
                >
                  {saving ? 'Saving...' : 'Save key'}
                </button>
              ) : null}
            </div>
          </Card>

          <Card>
            <SectionHeader title="Privacy defaults" meta="recommended" />
            <div className="space-y-3">
              <ToggleRow
                label="Mark new projects local only by default"
                checked={privacyDefaults.localOnly}
                onChange={() => togglePrivacy('localOnly')}
              />
              <ToggleRow
                label="Require review before publish"
                checked={privacyDefaults.requireReview}
                onChange={() => togglePrivacy('requireReview')}
              />
              <ToggleRow
                label="Exclude personal OpenClaw sessions by default"
                checked={privacyDefaults.excludeOpenClaw}
                onChange={() => togglePrivacy('excludeOpenClaw')}
              />
            </div>
          </Card>
        </div>

        {/* Connected accounts (Phase 5) */}
        <div className="mt-4">
          <Card>
            <SectionHeader title="Connected accounts" meta="optional" />
            {githubLoading ? (
              <span className="text-[13px] text-on-surface-variant">Loading…</span>
            ) : githubAccount ? (
              <div
                data-testid="settings-github-row"
                className="flex items-center gap-3"
              >
                <img
                  src={githubAccount.avatarUrl}
                  alt=""
                  className="w-7 h-7 rounded-full border border-ghost"
                />
                <div className="flex flex-col">
                  <span className="text-[13px] text-on-surface">
                    GitHub · <strong>{githubAccount.login}</strong>
                  </span>
                  {githubAccount.name ? (
                    <span className="text-xs text-on-surface-variant">
                      {githubAccount.name}
                    </span>
                  ) : null}
                </div>
                <button
                  data-testid="settings-github-disconnect"
                  className="ml-auto text-xs font-medium px-2.5 py-1 rounded-md text-on-surface-variant hover:text-on-surface transition-colors"
                  onClick={handleDisconnectGithub}
                  disabled={githubDisconnecting}
                >
                  {githubDisconnecting ? 'Disconnecting…' : 'Disconnect'}
                </button>
              </div>
            ) : (
              <div data-testid="settings-github-empty" className="flex items-center gap-2">
                <span className="text-[13px] text-on-surface-variant">
                  {githubJustDisconnected ? 'Disconnected.' : 'No accounts connected.'}
                </span>
                <Link
                  to="/portfolio"
                  className="text-xs font-medium px-2.5 py-1 rounded-md border border-ghost hover:border-outline text-on-surface"
                >
                  Connect from Portfolio →
                </Link>
              </div>
            )}
            {githubError ? (
              <p
                data-testid="settings-github-error"
                className="text-xs text-error mt-2"
              >
                {githubError}
              </p>
            ) : null}
          </Card>
        </div>

        {/* Local data (Phase 6) */}
        <div className="mt-4">
          <Card>
            <SectionHeader title="Local data" meta="read-only" />
            <dl
              data-testid="settings-local-data"
              className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-[13px]"
            >
              <div className="flex justify-between gap-3">
                <dt className="text-on-surface-variant">Sessions archived</dt>
                <dd
                  data-testid="settings-local-data-archive-count"
                  className="text-on-surface font-mono"
                >
                  {archiveStats ? archiveStats.total : '—'}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-on-surface-variant">Last archive sync</dt>
                <dd
                  data-testid="settings-local-data-last-sync"
                  className="text-on-surface font-mono truncate"
                >
                  {archiveStats?.lastSync || 'Never'}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-on-surface-variant">Sync daemon</dt>
                <dd
                  data-testid="settings-local-data-daemon"
                  className="text-on-surface font-mono"
                >
                  {localData
                    ? localData.daemon.installed
                      ? 'Installed'
                      : 'Not installed'
                    : '—'}
                </dd>
              </div>
              <div className="flex justify-between gap-3 sm:col-span-2">
                <dt className="text-on-surface-variant shrink-0">Local DB path</dt>
                <dd
                  data-testid="settings-local-data-db-path"
                  className="text-on-surface font-mono text-xs truncate"
                  title={localData?.dbPath ?? ''}
                >
                  {localData?.dbPath ?? '—'}
                </dd>
              </div>
            </dl>
            {localDataError ? (
              <p
                data-testid="settings-local-data-error"
                className="text-xs text-error mt-2"
              >
                {localDataError}
              </p>
            ) : null}
          </Card>
        </div>

        {/* 5. Authentication */}
        <div className="mt-4">
          <Card>
            <SectionHeader title="Authentication" meta="optional" />
            <div className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  auth.authenticated ? 'bg-green' : 'bg-outline'
                }`}
              />
              {auth.authenticated ? (
                <>
                  <span className="text-[13px] text-on-surface">
                    Connected as <strong>@{auth.username}</strong>
                  </span>
                  <span className="text-xs text-on-surface-variant">
                    Authenticated via device auth. Required for publishing.
                  </span>
                  <button
                    className="ml-auto text-xs font-medium px-2.5 py-1 rounded-md text-on-surface-variant hover:text-on-surface transition-colors"
                    onClick={handleLogout}
                    disabled={loggingOut}
                  >
                    {loggingOut ? 'Disconnecting...' : 'Disconnect'}
                  </button>
                </>
              ) : (
                <span className="text-[13px] text-on-surface-variant">
                  Not connected. Authentication is required for publishing.
                </span>
              )}
            </div>
          </Card>
        </div>
      </div>
    </AppShell>
  )
}

// ── Sub-components ─────────────────────────────────────────────

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: () => void
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-on-surface">{label}</span>
      <button
        role="switch"
        aria-checked={checked}
        onClick={onChange}
        className={`relative w-[40px] h-[22px] rounded-full transition-colors ${
          checked ? 'bg-green' : 'bg-surface-high'
        }`}
      >
        <span
          className={`absolute top-[3px] w-4 h-4 rounded-full bg-surface-lowest shadow-sm transition-transform ${
            checked ? 'left-[21px]' : 'left-[3px]'
          }`}
        />
      </button>
    </div>
  )
}
