import { useState, useEffect } from 'react'
import { AppShell, Card, SectionHeader } from './shared'
import {
  fetchApiKeyStatus,
  saveApiKey,
  fetchAuthStatus,
  type ApiKeyStatus,
  type AuthStatus,
} from '../api'

export function Settings() {
  const [apiKey, setApiKey] = useState<ApiKeyStatus>({ hasKey: false })
  const [auth, setAuth] = useState<AuthStatus>({ authenticated: false })
  const [keyInput, setKeyInput] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [saving, setSaving] = useState(false)

  const [privacyDefaults, setPrivacyDefaults] = useState({
    localOnly: true,
    requireReview: true,
    excludeOpenClaw: false,
  })

  useEffect(() => {
    fetchApiKeyStatus().then(setApiKey)
    fetchAuthStatus().then(setAuth)
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

  function togglePrivacy(key: keyof typeof privacyDefaults) {
    setPrivacyDefaults((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  return (
    <AppShell
      back={{ label: 'Projects', to: '/projects' }}
      chips={[{ label: 'Settings' }]}
    >
      <div className="max-w-3xl mx-auto p-6">
        <h2 className="font-display text-2xl font-bold text-on-surface">Settings</h2>

        <div className="grid grid-cols-2 gap-4 mt-6">
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
