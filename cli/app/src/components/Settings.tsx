import { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { AppShell, Card, SectionHeader } from './shared'
import {
  fetchApiKeyStatus,
  saveApiKey,
  fetchAuthStatus,
  fetchTemplates,
  fetchTheme,
  fetchProjects,
  fetchPortfolio,
  savePortfolio,
  logout,
  type ApiKeyStatus,
  type AuthStatus,
  type TemplateInfo,
  type PortfolioProfile,
} from '../api'

/** Preview background color derived from template mode */
function previewBgForTemplate(t: TemplateInfo): string {
  if (t.mode === 'dark') return '#09090b'
  return '#ffffff'
}

export function Settings() {
  const [apiKey, setApiKey] = useState<ApiKeyStatus | null>(null)
  const [auth, setAuth] = useState<AuthStatus | null>(null)
  const [keyInput, setKeyInput] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [loading, setLoading] = useState(true)
  const [currentTheme, setCurrentTheme] = useState('editorial')
  const [templates, setTemplates] = useState<TemplateInfo[]>([])
  const [firstProjectDir, setFirstProjectDir] = useState<string | null>(null)

  const [privacyDefaults, setPrivacyDefaults] = useState({
    localOnly: true,
    requireReview: true,
    excludeOpenClaw: false,
  })

  // Portfolio profile state
  const [portfolio, setPortfolio] = useState<PortfolioProfile>({})
  const [portfolioDirty, setPortfolioDirty] = useState(false)
  const [portfolioSaveStatus, setPortfolioSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const portfolioSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const portfolioStatusRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const resumeInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    Promise.all([
      fetchApiKeyStatus().catch(() => ({ hasKey: false }) as ApiKeyStatus),
      fetchAuthStatus().catch(() => ({ authenticated: false }) as AuthStatus),
      fetchTheme().catch(() => ({ template: 'editorial' })),
      fetchTemplates().catch(() => []),
      fetchProjects().catch(() => []),
      fetchPortfolio().catch(() => ({})),
    ]).then(([key, authStatus, theme, templateList, projects, portfolioData]) => {
      setApiKey(key)
      setAuth(authStatus)
      setCurrentTheme(theme.template)
      setTemplates(templateList)
      if (projects.length > 0) {
        setFirstProjectDir(projects[0].dirName)
      }
      setPortfolio(portfolioData)
    }).finally(() => setLoading(false))
  }, [])

  // Debounced portfolio auto-save
  const doSavePortfolio = useCallback((data: PortfolioProfile) => {
    setPortfolioSaveStatus('saving')
    savePortfolio(data)
      .then(() => {
        setPortfolioDirty(false)
        setPortfolioSaveStatus('saved')
        if (portfolioStatusRef.current) clearTimeout(portfolioStatusRef.current)
        portfolioStatusRef.current = setTimeout(() => setPortfolioSaveStatus('idle'), 2000)
      })
      .catch(() => {
        setPortfolioSaveStatus('idle')
      })
  }, [])

  useEffect(() => {
    if (!portfolioDirty) return
    if (portfolioSaveRef.current) clearTimeout(portfolioSaveRef.current)
    portfolioSaveRef.current = setTimeout(() => doSavePortfolio(portfolio), 800)
    return () => { if (portfolioSaveRef.current) clearTimeout(portfolioSaveRef.current) }
  }, [portfolioDirty, portfolio, doSavePortfolio])

  function updatePortfolio(field: keyof PortfolioProfile, value: string) {
    setPortfolio((prev) => ({ ...prev, [field]: value }))
    setPortfolioDirty(true)
  }

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

  const activeTemplate = templates.find((t) => t.name === currentTheme) ?? templates[0]

  return (
    <AppShell
      back={{ label: 'Projects', to: '/projects' }}
      chips={[{ label: 'Settings' }]}
    >
      <div className="max-w-3xl mx-auto p-6">
        <h2 className="font-display text-2xl font-bold text-on-surface">Settings</h2>

        {/* 1. Portfolio theme */}
        <div className="mt-6">
          <Card>
            <SectionHeader title="Portfolio theme" />

            {activeTemplate ? (
              <div className="flex flex-col gap-4">
                {/* Iframe preview of actual portfolio */}
                <div className="relative w-full overflow-hidden rounded-md border border-ghost bg-surface-low" style={{ height: '200px' }}>
                  {firstProjectDir ? (
                    <>
                      <iframe
                        src={`/preview/project/${encodeURIComponent(firstProjectDir)}?template=${activeTemplate.name}`}
                        style={{
                          width: '1200px',
                          height: '900px',
                          transform: 'scale(0.22)',
                          transformOrigin: 'top left',
                          border: 'none',
                          pointerEvents: 'none',
                        }}
                        loading="lazy"
                        tabIndex={-1}
                        aria-hidden="true"
                        title={`${activeTemplate.label} theme preview`}
                      />
                      <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(to bottom, transparent 70%, var(--color-surface-lowest) 100%)' }} />
                    </>
                  ) : (
                    <ThemeWireframe template={activeTemplate} />
                  )}
                </div>

                {/* Theme info + actions */}
                <div className="flex items-center gap-3">
                  <div
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ background: activeTemplate.accent }}
                    aria-label={`Accent color: ${activeTemplate.accent}`}
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-on-surface">{activeTemplate.label}</div>
                    <div className="text-xs text-on-surface-variant truncate">{activeTemplate.description}</div>
                  </div>
                  <div className="ml-auto flex items-center gap-3 shrink-0">
                    {firstProjectDir && (
                      <a
                        href={`/preview/project/${encodeURIComponent(firstProjectDir)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-mono text-on-surface-variant hover:text-primary transition-colors"
                      >
                        Preview site &rarr;
                      </a>
                    )}
                    <Link
                      to="/templates"
                      className="text-xs font-mono text-primary hover:underline"
                    >
                      Change theme &rarr;
                    </Link>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-on-surface-variant">
                No templates available.
              </p>
            )}
          </Card>
        </div>

        {/* 2. Portfolio profile */}
        <div className="mt-4">
          <Card>
            <SectionHeader title="Portfolio profile" meta={
              portfolioSaveStatus === 'saving' ? 'saving...' :
              portfolioSaveStatus === 'saved' ? 'saved' :
              undefined
            } />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
              {/* Display name */}
              <div className="sm:col-span-2">
                <FieldLabel htmlFor="portfolio-name">Display name</FieldLabel>
                <input
                  id="portfolio-name"
                  type="text"
                  value={portfolio.displayName ?? ''}
                  onChange={(e) => updatePortfolio('displayName', e.target.value)}
                  placeholder="Jane Smith"
                  maxLength={200}
                  className="w-full bg-surface-low border border-ghost rounded-md px-3 py-1.5 text-sm text-on-surface placeholder:text-outline"
                />
              </div>

              {/* Bio */}
              <div className="sm:col-span-2">
                <FieldLabel htmlFor="portfolio-bio">Bio / About</FieldLabel>
                <textarea
                  id="portfolio-bio"
                  value={portfolio.bio ?? ''}
                  onChange={(e) => updatePortfolio('bio', e.target.value)}
                  placeholder="A short bio for your portfolio..."
                  maxLength={2000}
                  rows={3}
                  className="w-full bg-surface-low border border-ghost rounded-md px-3 py-1.5 text-sm text-on-surface placeholder:text-outline resize-y"
                />
              </div>

              {/* Profile photo */}
              <div className="sm:col-span-2">
                <FieldLabel>Profile photo</FieldLabel>
                <div className="flex items-center gap-3">
                  {portfolio.photoBase64 ? (
                    <div className="relative w-16 h-16 rounded-full overflow-hidden border border-ghost shrink-0">
                      <img
                        src={portfolio.photoBase64}
                        alt="Profile photo"
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => { updatePortfolio('photoBase64', '') }}
                        className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 hover:opacity-100 transition-opacity text-white text-xs font-medium"
                        aria-label="Remove profile photo"
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-surface-low border border-ghost shrink-0 flex items-center justify-center">
                      <span className="text-on-surface-variant text-xs">No photo</span>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => photoInputRef.current?.click()}
                    className="text-xs font-mono text-primary hover:underline"
                  >
                    {portfolio.photoBase64 ? 'Change photo...' : 'Upload photo...'}
                  </button>
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      if (file.size > 5 * 1024 * 1024) {
                        alert('Photo must be under 5MB')
                        return
                      }
                      const reader = new FileReader()
                      reader.onload = () => {
                        updatePortfolio('photoBase64', reader.result as string)
                      }
                      reader.readAsDataURL(file)
                      e.target.value = ''
                    }}
                  />
                </div>
              </div>

              {/* Location */}
              <div>
                <FieldLabel htmlFor="portfolio-location">Location</FieldLabel>
                <input
                  id="portfolio-location"
                  type="text"
                  value={portfolio.location ?? ''}
                  onChange={(e) => updatePortfolio('location', e.target.value)}
                  placeholder="San Francisco, CA"
                  className="w-full bg-surface-low border border-ghost rounded-md px-3 py-1.5 text-sm text-on-surface placeholder:text-outline"
                />
              </div>

              {/* Email */}
              <div>
                <FieldLabel htmlFor="portfolio-email">Email</FieldLabel>
                <input
                  id="portfolio-email"
                  type="email"
                  value={portfolio.email ?? ''}
                  onChange={(e) => updatePortfolio('email', e.target.value)}
                  placeholder="jane@example.com"
                  className="w-full bg-surface-low border border-ghost rounded-md px-3 py-1.5 text-sm text-on-surface placeholder:text-outline"
                />
              </div>

              {/* Phone */}
              <div>
                <FieldLabel htmlFor="portfolio-phone">Phone</FieldLabel>
                <input
                  id="portfolio-phone"
                  type="tel"
                  value={portfolio.phone ?? ''}
                  onChange={(e) => updatePortfolio('phone', e.target.value)}
                  placeholder="+1 (555) 123-4567"
                  className="w-full bg-surface-low border border-ghost rounded-md px-3 py-1.5 text-sm text-on-surface placeholder:text-outline"
                />
              </div>

              {/* LinkedIn */}
              <div>
                <FieldLabel htmlFor="portfolio-linkedin">LinkedIn URL</FieldLabel>
                <input
                  id="portfolio-linkedin"
                  type="url"
                  value={portfolio.linkedinUrl ?? ''}
                  onChange={(e) => updatePortfolio('linkedinUrl', e.target.value)}
                  placeholder="https://linkedin.com/in/janesmith"
                  className="w-full bg-surface-low border border-ghost rounded-md px-3 py-1.5 text-sm text-on-surface placeholder:text-outline"
                />
              </div>

              {/* GitHub */}
              <div>
                <FieldLabel htmlFor="portfolio-github">GitHub URL</FieldLabel>
                <input
                  id="portfolio-github"
                  type="url"
                  value={portfolio.githubUrl ?? ''}
                  onChange={(e) => updatePortfolio('githubUrl', e.target.value)}
                  placeholder="https://github.com/janesmith"
                  className="w-full bg-surface-low border border-ghost rounded-md px-3 py-1.5 text-sm text-on-surface placeholder:text-outline"
                />
              </div>

              {/* Twitter/X */}
              <div>
                <FieldLabel htmlFor="portfolio-twitter">Twitter / X</FieldLabel>
                <input
                  id="portfolio-twitter"
                  type="text"
                  value={portfolio.twitterHandle ?? ''}
                  onChange={(e) => updatePortfolio('twitterHandle', e.target.value)}
                  placeholder="@janesmith"
                  className="w-full bg-surface-low border border-ghost rounded-md px-3 py-1.5 text-sm text-on-surface placeholder:text-outline"
                />
              </div>

              {/* Website */}
              <div>
                <FieldLabel htmlFor="portfolio-website">Personal website</FieldLabel>
                <input
                  id="portfolio-website"
                  type="url"
                  value={portfolio.websiteUrl ?? ''}
                  onChange={(e) => updatePortfolio('websiteUrl', e.target.value)}
                  placeholder="https://janesmith.dev"
                  className="w-full bg-surface-low border border-ghost rounded-md px-3 py-1.5 text-sm text-on-surface placeholder:text-outline"
                />
              </div>

              {/* Resume */}
              <div className="sm:col-span-2">
                <FieldLabel>Resume (PDF)</FieldLabel>
                <div className="flex items-center gap-3">
                  {portfolio.resumeBase64 ? (
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-surface-low border border-ghost rounded-md text-sm text-on-surface">
                      <span className="font-mono text-xs truncate max-w-[200px]">
                        {portfolio.resumeFilename ?? 'resume.pdf'}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setPortfolio((prev) => ({ ...prev, resumeBase64: undefined, resumeFilename: undefined }))
                          setPortfolioDirty(true)
                        }}
                        className="text-xs text-on-surface-variant hover:text-on-surface transition-colors"
                        aria-label="Remove resume"
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => resumeInputRef.current?.click()}
                      className="text-xs font-mono text-primary hover:underline"
                    >
                      Upload PDF...
                    </button>
                  )}
                  {portfolio.resumeBase64 && (
                    <button
                      type="button"
                      onClick={() => resumeInputRef.current?.click()}
                      className="text-xs font-mono text-primary hover:underline"
                    >
                      Replace...
                    </button>
                  )}
                  <input
                    ref={resumeInputRef}
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      if (file.size > 10 * 1024 * 1024) {
                        alert('Resume must be under 10MB')
                        return
                      }
                      const reader = new FileReader()
                      reader.onload = () => {
                        setPortfolio((prev) => ({
                          ...prev,
                          resumeBase64: reader.result as string,
                          resumeFilename: file.name,
                        }))
                        setPortfolioDirty(true)
                      }
                      reader.readAsDataURL(file)
                      e.target.value = ''
                    }}
                  />
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* 3. API configuration + 4. Privacy defaults */}
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

function FieldLabel({ htmlFor, children }: { htmlFor?: string; children: React.ReactNode }) {
  return (
    <label
      htmlFor={htmlFor}
      className="font-mono text-[11px] uppercase tracking-wider text-on-surface-variant block mb-1"
    >
      {children}
    </label>
  )
}

function ThemeWireframe({ template: t }: { template: TemplateInfo }) {
  const bg = previewBgForTemplate(t)
  const bar = t.mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'
  const block = t.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'

  return (
    <div className="w-full h-full flex flex-col gap-2 p-4" style={{ background: bg }}>
      <div className="h-3 w-1/4 rounded-sm" style={{ background: t.accent, opacity: 0.8 }} />
      <div className="h-2 w-2/3 rounded-sm" style={{ background: bar }} />
      <div className="h-1.5 w-1/2 rounded-sm" style={{ background: bar, opacity: 0.6 }} />
      <div className="flex gap-2 mt-2 flex-1">
        <div className="flex-1 rounded-sm" style={{ background: block }} />
        <div className="flex-1 rounded-sm" style={{ background: block }} />
        <div className="flex-1 rounded-sm" style={{ background: block }} />
      </div>
    </div>
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
