import { useState, useEffect, useRef, useCallback, type KeyboardEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AppShell, Chip, Card, SectionHeader, StatCard, Note } from './shared'
import { WorkTimeline } from './WorkTimeline'
import { GrowthChart } from './GrowthChart'
import { fetchDashboard, subscribeSyncProgress, completeOnboarding as apiCompleteOnboarding, saveApiKey, checkUsername, startSignup, pollDeviceAuth } from '../api'
import type { DashboardResponse, DashboardProject, SyncProgressEvent, Session } from '../types'

// ── State machine ───────────────────────────────────────────
type OnboardingStep =
  | 'loading'
  | 'syncing'
  | 'reveal'
  | 'prompt_project'
  | 'preview_project'       // shows draft project
  | 'preview_enhanced'      // shows enhanced version of same project
  | 'prompt_enhance'        // API key prompt (enhanced preview stays)
  | 'claim_username'        // claim heyi.am/username
  | 'dashboard'

// Steps that show the right-side preview panel
const PREVIEW_STEPS: OnboardingStep[] = ['preview_project', 'preview_enhanced', 'prompt_enhance']

function formatDuration(minutes: number): string {
  const hours = minutes / 60
  return hours >= 1 ? `${hours.toFixed(1)}h` : `${Math.round(minutes)}m`
}

function formatLoc(loc: number): string {
  return loc >= 1000 ? `${(loc / 1000).toFixed(1)}k` : String(loc)
}

export function FirstRun() {
  const [step, setStep] = useState<OnboardingStep>('loading')
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null)
  const [syncProgress, setSyncProgress] = useState<SyncProgressEvent | null>(null)
  const [discoveredProjects, setDiscoveredProjects] = useState<Set<string>>(new Set())
  const [revealVisible, setRevealVisible] = useState(0)
  const [scrollSection, setScrollSection] = useState(0) // tracks which section is visible in preview
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [apiKeySaved, setApiKeySaved] = useState(false)
  const [selectedMockSession, setSelectedMockSession] = useState<Session | null>(null)

  // Claim username state
  const [usernameInput, setUsernameInput] = useState('')
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'claimed' | 'submitting' | 'error'>('idle')
  const [usernameError, setUsernameError] = useState('')
  const [claimedUsername, setClaimedUsername] = useState('')
  const [authPolling, setAuthPolling] = useState(false)
  const [deviceCode, setDeviceCode] = useState('')
  const usernameCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastCheckedUsername = useRef('')

  const skipToDashboard = useCallback(() => {
    apiCompleteOnboarding().catch(() => {})
    setStep('dashboard')
  }, [])

  // ── Initial load + sync subscription ──────────────────────
  useEffect(() => {
    let cancelled = false
    let cleanupRef: (() => void) | null = null

    fetchDashboard()
      .then((data) => {
        if (cancelled) return
        setDashboard(data)

        if (data.onboardingComplete) {
          setStep('dashboard')
          return
        }

        // Show sync progress whenever sync is running (even if some sessions already indexed)
        if (data.sync.status === 'syncing' || (data.isEmpty && data.sync.status !== 'done')) {
          // Sync still in progress — wait for it before deciding
          setStep('syncing')
          setSyncProgress(data.sync)

          const unsub = subscribeSyncProgress((evt) => {
            if (cancelled) return
            setSyncProgress(evt)

            if (evt.currentProject) {
              setDiscoveredProjects((prev) => new Set(prev).add(evt.currentProject!))
            }

            if (evt.status === 'done') {
              fetchDashboard().then((fresh) => {
                if (cancelled) return
                setDashboard(fresh)
                if (fresh.isEmpty) {
                  skipToDashboard()
                } else {
                  setTimeout(() => {
                    if (!cancelled) setStep('reveal')
                  }, 800)
                }
              })
            }
          })

          cleanupRef = unsub
        } else if (data.isEmpty) {
          setStep('dashboard') // sync done, truly empty
        } else {
          // Sync already done, has data — start from reveal
          setStep('reveal')
        }
      })
      .catch(() => {
        if (!cancelled) setStep('dashboard')
      })

    return () => {
      cancelled = true
      cleanupRef?.()
    }
  }, [skipToDashboard])

  // ── Reveal stats animation ────────────────────────────────
  useEffect(() => {
    if (step !== 'reveal') return
    const timers: ReturnType<typeof setTimeout>[] = []
    for (let i = 1; i <= 4; i++) {
      timers.push(setTimeout(() => setRevealVisible(i), i * 400))
    }
    timers.push(setTimeout(() => setStep('prompt_project'), 4 * 400 + 1500))
    return () => timers.forEach(clearTimeout)
  }, [step])

  const stats = dashboard?.stats
  const projects = dashboard?.projects ?? []
  const biggestProject = projects.length > 0
    ? projects.reduce((a, b) => (b.sessionCount > a.sessionCount ? b : a), projects[0])
    : null

  const isOnboarding = step !== 'dashboard' && step !== 'loading'
  const showPreview = PREVIEW_STEPS.includes(step)

  // Scroll-guided terminal text for the preview states
  const SCROLL_HINTS = [
    'This is what a project looks like.\nScroll down to explore.',
    'The work timeline shows every\nsession as a bar — longer bars\nmean longer sessions.',
    'The growth chart tracks your\ncodebase over time. Green is\nadditions, red is deletions.',
    'Each session is a card you can\nclick to see the full AI\nconversation transcript.',
  ]

  return (
    <AppShell
      chips={[
        { label: 'local-first', variant: 'primary' },
        { label: 'private by default', variant: 'green' },
      ]}
      actions={
        <div className="flex items-center gap-3">
          {isOnboarding ? (
            <button
              onClick={skipToDashboard}
              className="text-xs text-on-surface-variant hover:text-on-surface transition-colors"
            >
              Skip tour
            </button>
          ) : (
            <Link to="/settings" className="text-xs text-on-surface-variant hover:text-on-surface transition-colors">
              Settings
            </Link>
          )}
        </div>
      }
    >
      {/* ── Onboarding ───────────────────────────────────── */}
      {step !== 'dashboard' && (
        <div
          className="flex min-h-[calc(100vh-3rem)]"
          style={{
            justifyContent: showPreview ? 'flex-start' : 'center',
            alignItems: showPreview ? 'flex-start' : 'center',
          }}
        >
          {/* Terminal column */}
          <div
            className="shrink-0 transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]"
            style={{
              width: showPreview ? 340 : '100%',
              maxWidth: showPreview ? 340 : 680,
              padding: showPreview ? '1.5rem 1rem 1.5rem 1.5rem' : '0 1.5rem',
              position: showPreview ? 'sticky' : 'relative',
              top: showPreview ? 48 : 'auto',
              alignSelf: showPreview ? 'flex-start' : 'center',
            }}
          >
            {step === 'loading' && (
              <OnboardingTerminal compact={false}>
                <TermLine variant="prompt">$ heyiam</TermLine>
                <TermLine variant="active">  Connecting...</TermLine>
              </OnboardingTerminal>
            )}

            {step === 'syncing' && syncProgress && (
              <OnboardingTerminal compact={false}>
                <TermLine variant="prompt">$ heyiam</TermLine>
                <TermLine variant="info">  Indexing your AI coding sessions.</TermLine>
                <TermLine variant="info">  Everything stays on your machine.</TermLine>
                <TermLine variant="default">&nbsp;</TermLine>

                {syncProgress.phase === 'discovering' && (
                  <TermLine variant="active">  Discovering sessions...</TermLine>
                )}

                {(syncProgress.phase === 'indexing' || syncProgress.phase === 'done') && (
                  <TermLine variant="passed">  Found {syncProgress.parentCount} sessions</TermLine>
                )}

                {syncProgress.phase === 'indexing' && (
                  <>
                    <TermLine variant="active">
                      {'  '}Indexing... ({syncProgress.current}/{syncProgress.total})
                      {syncProgress.currentProject ? ` — ${syncProgress.currentProject}` : ''}
                    </TermLine>
                    {discoveredProjects.size > 0 && (
                      <>
                        <TermLine variant="default">&nbsp;</TermLine>
                        <TermLine variant="section">  Projects found:</TermLine>
                        {[...discoveredProjects].slice(0, 8).map((name) => (
                          <TermLine key={name} variant="default">    {name}</TermLine>
                        ))}
                        {discoveredProjects.size > 8 && (
                          <TermLine variant="default">    ...and {discoveredProjects.size - 8} more</TermLine>
                        )}
                      </>
                    )}
                  </>
                )}

                {syncProgress.phase === 'done' && (
                  <>
                    <TermLine variant="passed">  Indexed {syncProgress.total} sessions</TermLine>
                    <TermLine variant="passed">  Ready.</TermLine>
                  </>
                )}
              </OnboardingTerminal>
            )}

            {step === 'reveal' && stats && (
              <OnboardingTerminal compact={false}>
                <TermLine variant="prompt">$ heyiam</TermLine>
                <TermLine variant="passed">  Indexed {stats.sessionCount} sessions. Ready.</TermLine>
                <TermLine variant="default">&nbsp;</TermLine>
                <TermLine variant="section">  Your coding in numbers:</TermLine>
                <TermLine variant="default">&nbsp;</TermLine>
                {revealVisible >= 1 && (
                  <TermLine variant="reveal">
                    {'  '}<span className="text-[#9dcaff] font-semibold">{stats.sessionCount}</span> sessions indexed
                  </TermLine>
                )}
                {revealVisible >= 2 && (
                  <TermLine variant="reveal">
                    {'  '}<span className="text-[#9dcaff] font-semibold">{stats.projectCount}</span> projects discovered
                  </TermLine>
                )}
                {revealVisible >= 3 && (
                  <TermLine variant="reveal">
                    {'  '}<span className="text-[#9dcaff] font-semibold">{stats.sourceCount}</span> {stats.sourceCount === 1 ? 'tool' : 'tools'} detected
                  </TermLine>
                )}
                {revealVisible >= 4 && biggestProject && (
                  <TermLine variant="reveal">
                    {'  '}Biggest: <span className="text-[#9dcaff] font-semibold">{biggestProject.projectName}</span> ({biggestProject.sessionCount} sessions)
                  </TermLine>
                )}
              </OnboardingTerminal>
            )}

            {step === 'prompt_project' && (
              <OnboardingTerminal compact={false}>
                <TermLine variant="prompt">$ heyiam</TermLine>
                <TermLine variant="passed">  {stats?.sessionCount} sessions across {stats?.projectCount} projects.</TermLine>
                <TermLine variant="default">&nbsp;</TermLine>
                <TermLine variant="info">  Here's what a project page looks</TermLine>
                <TermLine variant="info">  like — with timeline, growth chart,</TermLine>
                <TermLine variant="info">  and clickable sessions.</TermLine>
                <TermLine variant="default">&nbsp;</TermLine>
                <TermPrompt
                  question="See a demo project?"
                  onYes={() => setStep('preview_project')}
                  onNo={() => setStep('prompt_enhance')}
                />
              </OnboardingTerminal>
            )}

            {/* Draft project preview — scroll-guided */}
            {step === 'preview_project' && (
              <OnboardingTerminal compact>
                <TermLine variant="prompt">$ heyiam project view</TermLine>
                <TermLine variant="default">&nbsp;</TermLine>
                {selectedMockSession ? (
                  <>
                    <TermLine variant="info">  Viewing session detail.</TermLine>
                    <TermLine variant="info">  Click X to go back.</TermLine>
                  </>
                ) : (
                  <>
                    {SCROLL_HINTS[scrollSection]?.split('\n').map((line, i) => (
                      <TermLine key={`${scrollSection}-${i}`} variant="info">  {line}</TermLine>
                    ))}
                    <TermLine variant="default">&nbsp;</TermLine>
                    <TermLine variant="default">
                      {'  '}<span className="text-white/30">section {scrollSection + 1}/4</span>
                    </TermLine>
                  </>
                )}
                <TermLine variant="default">&nbsp;</TermLine>
                <TermPrompt
                  question="Enhance this project?"
                  onYes={() => { setSelectedMockSession(null); setStep('preview_enhanced') }}
                  onNo={() => { setSelectedMockSession(null); setStep('preview_enhanced') }}
                  yesLabel="Enhance"
                  noLabel="Skip"
                />
              </OnboardingTerminal>
            )}

            {/* Enhanced project preview — shows the transformation */}
            {step === 'preview_enhanced' && (
              <OnboardingTerminal compact>
                <TermLine variant="prompt">$ heyiam enhance heyi-am</TermLine>
                <TermLine variant="default">&nbsp;</TermLine>
                <TermLine variant="passed">  Reading 16 sessions...</TermLine>
                <TermLine variant="passed">  Extracting skills...</TermLine>
                <TermLine variant="passed">  Writing narrative...</TermLine>
                <TermLine variant="passed">  Building project arc...</TermLine>
                <TermLine variant="default">&nbsp;</TermLine>
                <TermLine variant="passed">  Enhanced. Scroll to see the</TermLine>
                <TermLine variant="passed">  difference.</TermLine>
                <TermLine variant="default">&nbsp;</TermLine>
                <TermPrompt
                  question="Continue tour?"
                  onYes={() => setStep('prompt_enhance')}
                  onNo={() => skipToDashboard()}
                />
              </OnboardingTerminal>
            )}

            {/* API key prompt — enhanced preview stays visible */}
            {step === 'prompt_enhance' && (
              <OnboardingTerminal compact>
                <TermLine variant="prompt">$ heyiam enhance</TermLine>
                <TermLine variant="default">&nbsp;</TermLine>
                <TermLine variant="info">  To enhance your own projects,</TermLine>
                <TermLine variant="info">  you need an Anthropic API key.</TermLine>
                <TermLine variant="default">&nbsp;</TermLine>

                {apiKeySaved ? (
                  <>
                    <TermLine variant="passed">  API key saved. You're all set.</TermLine>
                    <TermLine variant="default">&nbsp;</TermLine>
                    <TermPrompt
                      question="Continue?"
                      onYes={() => setStep('claim_username')}
                      onNo={() => setStep('claim_username')}
                    />
                  </>
                ) : (
                  <>
                    <TermPrompt
                      question="Add your API key now?"
                      onYes={() => {/* focus the input below */}}
                      onNo={() => setStep('claim_username')}
                      noLabel="I'll do this later"
                    />
                    <TermLine variant="default">&nbsp;</TermLine>
                    <div className="triage-terminal__line opacity-80">  Paste your key:</div>
                    <div className="flex items-center gap-2 mt-1 ml-4">
                      <input
                        type="password"
                        value={apiKeyInput}
                        onChange={(e) => setApiKeyInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && apiKeyInput.startsWith('sk-')) {
                            saveApiKey(apiKeyInput).then(() => setApiKeySaved(true)).catch(() => {})
                          }
                        }}
                        placeholder="sk-ant-..."
                        className="bg-white/10 border border-white/20 rounded px-2 py-1 text-[11px] font-mono text-[#34d399] w-48 outline-none focus:border-[#9dcaff] placeholder:text-white/20"
                      />
                    </div>
                    <TermLine variant="default">&nbsp;</TermLine>
                    <div className="triage-terminal__line opacity-40 text-[10px]">
                      {'  '}You can always add this later in Settings.
                    </div>
                  </>
                )}
              </OnboardingTerminal>
            )}

            {/* ── Claim Username ─────────────────────────────── */}
            {step === 'claim_username' && (
              <OnboardingTerminal compact={false}>
                <TermLine variant="prompt">$ heyiam publish</TermLine>
                <TermLine variant="default">&nbsp;</TermLine>
                <TermLine variant="section">  Claim your portfolio page</TermLine>
                <TermLine variant="default">&nbsp;</TermLine>
                <TermLine variant="info">  Want to show off your AI dev work?</TermLine>
                <TermLine variant="info">  Claim a name and create a public</TermLine>
                <TermLine variant="info">  portfolio on heyi.am — show how</TermLine>
                <TermLine variant="info">  you build, not just what you ship.</TermLine>
                <TermLine variant="default">&nbsp;</TermLine>
                <TermLine variant="info">  Your page: <span className="text-[#9dcaff] font-semibold">heyi.am/{usernameInput || 'your-name'}</span></TermLine>
                <TermLine variant="default">&nbsp;</TermLine>
                <div className="triage-terminal__line opacity-40 text-[10px]">
                  {'  '}Optional — the CLI works fully without an account.
                </div>
                <div className="triage-terminal__line opacity-40 text-[10px]">
                  {'  '}You choose what to publish. Nothing is public by default.
                </div>
                <TermLine variant="default">&nbsp;</TermLine>

                {usernameStatus === 'claimed' ? (
                  <>
                    <TermLine variant="passed">  Welcome, {claimedUsername}!</TermLine>
                    <TermLine variant="passed">  heyi.am/{claimedUsername} is yours.</TermLine>
                    <TermLine variant="default">&nbsp;</TermLine>
                    <TermPrompt
                      question="Ready to explore?"
                      onYes={skipToDashboard}
                      onNo={skipToDashboard}
                      yesLabel="Let's go"
                    />
                  </>
                ) : authPolling ? (
                  <>
                    <TermLine variant="active">  Waiting for signup to complete...</TermLine>
                    <TermLine variant="info">  A browser window should have opened.</TermLine>
                    <TermLine variant="info">  Sign up there, then come back here.</TermLine>
                    <TermLine variant="default">&nbsp;</TermLine>
                    <div className="flex items-center gap-2 ml-4">
                      <button
                        onClick={() => {
                          setAuthPolling(false)
                          setUsernameStatus('idle')
                          setDeviceCode('')
                        }}
                        className="text-[10px] font-mono px-2.5 py-1 rounded text-white/40 hover:text-white/70 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => {
                          setAuthPolling(false)
                          skipToDashboard()
                        }}
                        className="text-[10px] font-mono px-2.5 py-1 rounded text-white/40 hover:text-white/70 transition-colors"
                      >
                        Skip this
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="triage-terminal__line opacity-80">  Choose a username:</div>
                    <div className="flex items-center gap-2 mt-1 ml-4">
                      <span className="text-white/40 text-[11px] font-mono">heyi.am/</span>
                      <input
                        type="text"
                        value={usernameInput}
                        onChange={(e) => {
                          const v = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')
                          setUsernameInput(v)
                          setUsernameStatus('idle')
                          setUsernameError('')

                          // Debounced availability check (500ms)
                          if (usernameCheckTimer.current) clearTimeout(usernameCheckTimer.current)
                          if (v.length >= 3 && v !== lastCheckedUsername.current) {
                            usernameCheckTimer.current = setTimeout(async () => {
                              lastCheckedUsername.current = v
                              setUsernameStatus('checking')
                              try {
                                const result = await checkUsername(v)
                                // Only update if username hasn't changed
                                setUsernameStatus(result.available ? 'available' : 'taken')
                                if (!result.available) setUsernameError(result.reason || 'Taken')
                              } catch {
                                setUsernameStatus('idle')
                              }
                            }, 500)
                          }
                        }}
                        onKeyDown={async (e) => {
                          if (e.key === 'Enter' && usernameInput.length >= 3) {
                            e.preventDefault()
                            // Guard against double-submit
                            if (usernameStatus === 'submitting' || usernameStatus === 'checking' || authPolling) return
                            if (usernameCheckTimer.current) clearTimeout(usernameCheckTimer.current)

                            setUsernameStatus('submitting')
                            setUsernameError('')
                            try {
                              const result = await checkUsername(usernameInput)
                              if (!result.available) {
                                setUsernameStatus('taken')
                                setUsernameError(result.reason || 'Username is taken')
                                return
                              }

                              const deviceInfo = await startSignup(usernameInput)
                              setDeviceCode(deviceInfo.device_code)
                              setAuthPolling(true)
                              setUsernameStatus('available')
                              window.open(deviceInfo.verification_uri, '_blank')

                              const startTime = Date.now()
                              const poll = async () => {
                                try {
                                  const status = await pollDeviceAuth(deviceInfo.device_code)
                                  if (status.authenticated) {
                                    setAuthPolling(false)
                                    setUsernameStatus('claimed')
                                    setClaimedUsername(status.username || usernameInput)
                                    return
                                  }
                                } catch { /* authorization_pending */ }
                                if (Date.now() - startTime < 300000) {
                                  setTimeout(poll, 5000)
                                } else {
                                  setAuthPolling(false)
                                  setUsernameStatus('error')
                                  setUsernameError('Timed out. Try again.')
                                }
                              }
                              setTimeout(poll, 5000)
                            } catch {
                              setUsernameStatus('error')
                              setUsernameError('Could not connect. Try again later.')
                            }
                          }
                        }}
                        placeholder="your-name"
                        className="bg-white/10 border border-white/20 rounded px-2 py-1 text-[11px] font-mono text-[#34d399] w-36 outline-none focus:border-[#9dcaff] placeholder:text-white/20"
                        autoFocus
                      />
                      {usernameStatus === 'checking' && (
                        <span className="text-[10px] text-[#fbbf24] font-mono">checking...</span>
                      )}
                      {usernameStatus === 'available' && (
                        <span className="text-[10px] text-[#34d399] font-mono">available!</span>
                      )}
                      {usernameStatus === 'submitting' && (
                        <span className="text-[10px] text-[#fbbf24] font-mono">claiming...</span>
                      )}
                      {usernameStatus === 'taken' && (
                        <span className="text-[10px] text-[#f87171] font-mono">{usernameError}</span>
                      )}
                      {usernameStatus === 'error' && (
                        <span className="text-[10px] text-[#f87171] font-mono">{usernameError}</span>
                      )}
                    </div>

                    {usernameInput.length >= 3 && usernameStatus === 'idle' && (
                      <div className="triage-terminal__line opacity-40 text-[10px] mt-1">
                        {'    '}Press Enter to check &amp; claim
                      </div>
                    )}

                    <TermLine variant="default">&nbsp;</TermLine>
                    <div className="flex items-center gap-3 mt-1 ml-4">
                      <button
                        disabled={authPolling || usernameStatus === 'submitting'}
                        onClick={async () => {
                          if (authPolling || usernameStatus === 'submitting') return
                          setUsernameStatus('submitting')
                          setUsernameError('')
                          try {
                            const deviceInfo = await startSignup('')
                            setDeviceCode(deviceInfo.device_code)
                            setAuthPolling(true)
                            setUsernameStatus('idle')
                            window.open(deviceInfo.verification_uri, '_blank')
                            const startTime = Date.now()
                            const poll = async () => {
                              try {
                                const status = await pollDeviceAuth(deviceInfo.device_code)
                                if (status.authenticated) {
                                  setAuthPolling(false)
                                  setUsernameStatus('claimed')
                                  setClaimedUsername(status.username || '')
                                  return
                                }
                              } catch { /* keep polling */ }
                              if (Date.now() - startTime < 300000) {
                                setTimeout(poll, 5000)
                              } else {
                                setAuthPolling(false)
                                setUsernameStatus('error')
                                setUsernameError('Timed out.')
                              }
                            }
                            setTimeout(poll, 5000)
                          } catch {
                            setUsernameStatus('error')
                            setUsernameError('Could not connect. Try again later.')
                          }
                        }}
                        className="text-[10px] font-mono px-2.5 py-1 rounded bg-white/10 text-white/70 hover:text-white/90 hover:bg-white/15 transition-colors disabled:opacity-40"
                      >
                        Already have an account? Log in
                      </button>
                      <button
                        onClick={() => skipToDashboard()}
                        className="text-[10px] font-mono px-2.5 py-1 rounded text-white/40 hover:text-white/70 transition-colors"
                      >
                        I'll do this later
                      </button>
                    </div>
                  </>
                )}
              </OnboardingTerminal>
            )}
          </div>

          {/* Preview panel — mock enhanced project visible for project + enhance steps */}
          {showPreview && (
            <div
              className="flex-1 min-w-0 pr-4 pt-6 pb-8 animate-[slideIn_0.6s_cubic-bezier(0.16,1,0.3,1)_forwards]"
            >
              {(step === 'preview_project' || step === 'preview_enhanced' || step === 'prompt_enhance') && (
                <MockProjectPage
                  key={step === 'preview_project' ? 'draft' : 'enhanced'}
                  enhanced={step === 'preview_enhanced' || step === 'prompt_enhance'}
                  onScrollSection={setScrollSection}
                  selectedSession={selectedMockSession}
                  onSelectSession={setSelectedMockSession}
                />
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Dashboard ────────────────────────────────────── */}
      {step === 'dashboard' && (
        <Dashboard
          dashboard={dashboard}
          stats={stats}
          projects={projects}
        />
      )}
    </AppShell>
  )
}

// ═══════════════════════════════════════════════════════════════
// ── Mock Project Page — uses REAL components with mock data ──
// ═══════════════════════════════════════════════════════════════

const DURATION_COLORS = ['bg-primary', 'bg-green', 'bg-violet'] as const

// Generate realistic mock sessions that the real WorkTimeline + GrowthChart can render
function buildMockSessions(): Session[] {
  const titles = [
    'Set up project scaffolding with Vite + React + TypeScript',
    'Build SQLite sync pipeline for session indexing',
    'Implement real-time file watcher with debounce',
    'Design project detail page with work timeline',
    'Add full-text search across all sessions',
    'Fix subagent indexing — children were silently dropped',
    'Add multi-agent orchestration visualization',
    'Build guided onboarding flow with CLI aesthetics',
    'Implement session archiving with hard links',
    'Add Cursor workspace discovery and polling',
    'Design growth chart with cumulative LOC tracking',
    'Build publish flow with streaming SSE upload',
    'Add Ed25519 session sealing for interviews',
    'Implement project-level AI enhancement pipeline',
    'Fix work timeline SVG rendering for long sessions',
    'Add context export in compact/summary/full formats',
  ]

  const skills = ['TypeScript', 'React', 'SQLite', 'Node.js', 'CSS', 'Vite', 'Shell', 'Vitest']
  const sources = ['claude', 'claude', 'claude', 'cursor', 'claude', 'codex']

  const baseDate = new Date('2026-02-15T10:00:00Z')
  const sessions: Session[] = []

  for (let i = 0; i < titles.length; i++) {
    const startDate = new Date(baseDate.getTime() + i * 2.5 * 86400000 + Math.random() * 43200000)
    const durationMin = 15 + Math.floor(Math.random() * 120)
    const endDate = new Date(startDate.getTime() + durationMin * 60000)
    const locAdded = Math.floor(200 + Math.random() * 5000)
    const locRemoved = Math.floor(50 + Math.random() * locAdded * 0.3)

    // Some sessions have children (orchestrated)
    const children = i % 4 === 0 ? [
      { sessionId: `child-${i}-1`, role: 'frontend-dev', durationMinutes: Math.floor(durationMin * 0.6), linesOfCode: Math.floor(locAdded * 0.3), date: startDate.toISOString() },
      { sessionId: `child-${i}-2`, role: 'qa-engineer', durationMinutes: Math.floor(durationMin * 0.4), linesOfCode: Math.floor(locAdded * 0.15), date: startDate.toISOString() },
    ] : i % 3 === 0 ? [
      { sessionId: `child-${i}-1`, role: 'backend-dev', durationMinutes: Math.floor(durationMin * 0.7), linesOfCode: Math.floor(locAdded * 0.4), date: startDate.toISOString() },
    ] : undefined

    sessions.push({
      id: `mock-session-${i}`,
      title: titles[i],
      date: startDate.toISOString(),
      endTime: endDate.toISOString(),
      durationMinutes: durationMin,
      wallClockMinutes: durationMin + Math.floor(Math.random() * 30),
      turns: 10 + Math.floor(Math.random() * 60),
      linesOfCode: locAdded + locRemoved,
      status: 'draft',
      projectName: 'heyi-am',
      rawLog: [],
      skills: [skills[i % skills.length], skills[(i + 3) % skills.length]],
      source: sources[i % sources.length],
      filesChanged: [
        ['src/sync.ts', 'src/db.ts', 'src/parsers/index.ts', 'src/server.ts', 'src/bridge.ts'],
        ['src/analyzer.ts', 'src/search.ts', 'src/settings.ts', 'src/export.ts'],
        ['app/src/components/ProjectDetail.tsx', 'app/src/components/WorkTimeline.tsx', 'app/src/api.ts'],
        ['src/routes/projects.ts', 'src/routes/sessions.ts', 'src/routes/dashboard.ts', 'app/src/types.ts'],
        ['src/parsers/claude.ts', 'src/parsers/cursor.ts', 'src/parsers/codex.ts', 'src/parsers/gemini.ts'],
        ['app/src/components/FirstRun.tsx', 'app/src/index.css', 'src/routes/export.ts'],
        ['src/archive.ts', 'src/context-export.ts', 'app/src/components/Search.tsx'],
        ['app/src/components/GrowthChart.tsx', 'app/src/components/SessionView.tsx', 'src/transcript.ts'],
      ][i % 8].map((path, j) => ({
        path,
        additions: Math.floor(locAdded / (j + 1.5)),
        deletions: Math.floor(locRemoved / (j + 2)),
      })),
      toolBreakdown: [
        { tool: 'Read', count: 15 + Math.floor(Math.random() * 30) },
        { tool: 'Edit', count: 8 + Math.floor(Math.random() * 25) },
        { tool: 'Bash', count: 5 + Math.floor(Math.random() * 20) },
        { tool: 'Write', count: 2 + Math.floor(Math.random() * 10) },
        { tool: 'Grep', count: 3 + Math.floor(Math.random() * 8) },
        { tool: 'Glob', count: 1 + Math.floor(Math.random() * 5) },
      ],
      children,
      childCount: children?.length ?? 0,
      isOrchestrated: !!children,
    })
  }

  return sessions
}

const MOCK_SESSION_DATA = buildMockSessions()

function MockProjectPage({
  enhanced,
  onScrollSection,
  selectedSession,
  onSelectSession,
}: {
  enhanced: boolean
  onScrollSection: (n: number) => void
  selectedSession: Session | null
  onSelectSession: (s: Session | null) => void
}) {
  const sectionRefs = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => {
    const observers: IntersectionObserver[] = []
    sectionRefs.current.forEach((ref, i) => {
      if (!ref) return
      const obs = new IntersectionObserver(
        ([entry]) => { if (entry.isIntersecting) onScrollSection(i) },
        { threshold: 0.3 },
      )
      obs.observe(ref)
      observers.push(obs)
    })
    return () => observers.forEach((o) => o.disconnect())
  }, [onScrollSection])

  const totalLoc = MOCK_SESSION_DATA.reduce((sum, s) => sum + s.linesOfCode, 0)

  return (
    <>
    <BrowserFrame url="localhost:17845/project/heyi-am">
      <div className="bg-surface-mid">
        {/* ── Hero ─────────────────────────────────────────── */}
        <div ref={(el) => { sectionRefs.current[0] = el }} className="p-5 pb-0">
          <div className="flex items-center justify-between mb-1">
            <div>
              <h2 className="font-display text-xl font-bold text-on-surface">heyi-am</h2>
              <span className="text-on-surface-variant text-[0.8125rem]">
                Feb 15 – Mar 25, 2026
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Chip variant={enhanced ? 'green' : 'primary'}>{enhanced ? 'Enhanced' : 'Draft'}</Chip>
              <Chip variant="primary">16 sessions</Chip>
            </div>
          </div>

          {/* Links — always shown */}
          <div className="flex items-center gap-4 mt-1 mb-2">
            <a href="https://heyi.am" target="_blank" rel="noopener noreferrer" className="font-mono text-xs text-primary hover:underline flex items-center gap-1">
              <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
              github.com/interactivecats/heyi.am
            </a>
            <a href="https://heyi.am" target="_blank" rel="noopener noreferrer" className="font-mono text-xs text-primary hover:underline flex items-center gap-1">
              <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M6.5 10.5l3-3m-1.5-2a2.5 2.5 0 013.54 3.54l-1.5 1.5m-4.08-1.08a2.5 2.5 0 01-3.54-3.54l1.5-1.5"/></svg>
              heyi.am
            </a>
          </div>

          {/* Screenshot — always shown */}
          <div className="rounded-md border border-ghost overflow-hidden shadow-sm mb-3">
            <div className="flex items-center gap-1.5 px-3 py-2 bg-surface-low border-b border-ghost">
              <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
              <span className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
              <span className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
            </div>
            <div className="max-h-96 overflow-y-auto">
              <img
                src="/heyi-am-screenshot.png"
                alt="heyi.am — proof-of-work for AI-native developers"
                className="w-full h-auto"
              />
            </div>
          </div>

          {/* Narrative — only when enhanced */}
          {enhanced && (
            <Card className="my-3">
              <SectionHeader title="Narrative summary" meta="AI-generated" />
              <p
                className="leading-relaxed text-on-surface border-l-[3px] border-primary pl-3"
                style={{ fontSize: 'clamp(0.8125rem, 1.2vw, 1rem)' }}
              >
                Built a local-first developer portfolio tool that indexes AI coding sessions across
                Claude Code, Cursor, Codex, and Gemini CLI. Designed a real-time sync pipeline
                with SQLite indexing, implemented multi-agent session visualization, and shipped
                a guided onboarding flow.
              </p>
            </Card>
          )}

          {/* Stats */}
          <div className="grid grid-cols-4 gap-3 mb-4">
            <StatCard label="Sessions" value={16} />
            <StatCard label="You / Agents" value="52h / 78h" />
            <StatCard label="Lines changed" value={formatLoc(totalLoc)} />
            <StatCard label="Files" value={847} />
          </div>
        </div>

        {/* ── Project Arc — only when enhanced ────────────── */}
        {enhanced && (
          <div className="px-5 pb-4">
            <Card>
              <SectionHeader title="Project arc" meta="AI-generated" />
              <div className="relative pl-5">
                <div className="absolute left-1 top-1.5 bottom-1.5 w-0.5 bg-ghost rounded-full" />
                {[
                  { title: 'Foundation', desc: 'Set up project scaffolding, parser pipeline, and SQLite schema' },
                  { title: 'Core features', desc: 'Built sync engine, search, work timeline, and growth chart' },
                  { title: 'Polish', desc: 'Onboarding flow, subagent visualization, export pipeline' },
                ].map((phase) => (
                  <div key={phase.title} className="relative pb-3 last:pb-0">
                    <div className="absolute -left-5 top-1.5 w-2 h-2 rounded-full bg-primary shadow-[0_0_0_3px_rgba(8,68,113,0.1)]" />
                    <div className="font-mono text-[0.6875rem] uppercase tracking-wider text-on-surface-variant">{phase.title}</div>
                    <Note><span className="text-on-surface-variant">{phase.desc}</span></Note>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

        {/* ── Skills — only when enhanced ─────────────────── */}
        {enhanced && (
          <div className="px-5 pb-4">
            <Card>
              <SectionHeader title="Skills extracted" meta="14 skills" />
              <div className="flex gap-1.5 flex-wrap">
                {['TypeScript', 'React', 'SQLite', 'Node.js', 'CSS', 'Vite', 'Vitest', 'Shell', 'HTML', 'Express', 'SSE', 'FTS5', 'Ed25519', 'Docker'].map((s) => (
                  <Chip key={s} variant="violet">{s}</Chip>
                ))}
              </div>
            </Card>
          </div>
        )}

        {/* ── Work Timeline (REAL component) ──────────────── */}
        <div ref={(el) => { sectionRefs.current[1] = el }} className="px-5 pb-4">
          <Card>
            <SectionHeader title="Work timeline" meta="sessions over time" />
            <WorkTimeline sessions={MOCK_SESSION_DATA} maxHeight={280} />
          </Card>
        </div>

        {/* ── Growth Chart (REAL component) ───────────────── */}
        <div ref={(el) => { sectionRefs.current[2] = el }} className="px-5 pb-4">
          <Card>
            <SectionHeader title="Project growth" meta="lines changed" />
            <GrowthChart
              sessions={MOCK_SESSION_DATA}
              totalLoc={totalLoc}
              totalFiles={847}
            />
          </Card>
        </div>

        {/* ── Key Decisions + Source Breakdown ────────────── */}
        <div className="grid grid-cols-2 gap-4 px-5 pb-4">
          <Card>
            <SectionHeader title="Key decisions" meta="signal" />
            <div className="flex flex-col gap-3">
              {enhanced ? (
                <>
                  <Note title="SQLite over filesystem">Chose SQLite for session indexing over raw filesystem scans — 10x faster project listing.</Note>
                  <Note title="Local-first architecture">All data stays on the user's machine. No cloud dependency for core features.</Note>
                  <Note title="Multi-parser pipeline">One bridge layer normalizes data from Claude, Cursor, Codex, and Gemini into a shared schema.</Note>
                </>
              ) : (
                <Note>Enhance this project to extract key decisions.</Note>
              )}
            </div>
          </Card>
          <Card>
            <SectionHeader title="Source breakdown" meta="provenance" />
            <table className="w-full border-collapse text-[0.8125rem]">
              <thead>
                <tr>
                  <th className="text-left py-2 font-mono text-[9px] uppercase tracking-wider text-outline border-b border-ghost">Source</th>
                  <th className="text-left py-2 font-mono text-[9px] uppercase tracking-wider text-outline border-b border-ghost">Count</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { source: 'claude', count: 10 },
                  { source: 'cursor', count: 3 },
                  { source: 'codex', count: 2 },
                  { source: 'gemini', count: 1 },
                ].map((r) => (
                  <tr key={r.source}>
                    <td className="py-2 border-b border-ghost">{r.source}</td>
                    <td className="py-2 border-b border-ghost">{r.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>

        {/* ── Featured Sessions ───────────────────────────── */}
        <div ref={(el) => { sectionRefs.current[3] = el }} className="px-5 pb-5">
          <Card>
            <SectionHeader title={enhanced ? 'Featured sessions' : 'Sessions'} meta={`${MOCK_SESSION_DATA.length} total`} />
            <div className="grid grid-cols-2 gap-3">
              {MOCK_SESSION_DATA.slice(0, 6).map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onSelectSession(s)}
                  className="text-left bg-surface-lowest border border-ghost rounded-sm p-4 cursor-pointer transition-shadow hover:shadow-md"
                >
                  <div className={`h-1 rounded-full mb-3 ${DURATION_COLORS[i % DURATION_COLORS.length]}`} />
                  <h4 className="font-display text-[0.8125rem] font-semibold text-on-surface mb-1 line-clamp-2">
                    {s.title}
                  </h4>
                  <span className="text-on-surface-variant text-xs">
                    {formatDuration(s.durationMinutes)} · {s.turns} turns · {formatLoc(s.linesOfCode)} lines
                  </span>
                  {s.skills?.[0] && (
                    <div className="mt-2">
                      <Chip variant="violet">{s.skills[0]}</Chip>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </BrowserFrame>

    {/* Session detail drawer — overlays on top like the real one */}
    {selectedSession && (
      <div
        className="fixed inset-0 z-50 flex justify-end bg-black/40"
        onClick={(e) => { if (e.target === e.currentTarget) onSelectSession(null) }}
      >
        <div className="w-[600px] max-w-full h-full bg-surface overflow-y-auto shadow-[-8px_0_32px_rgba(25,28,30,0.1)] animate-[slideIn_0.3s_ease_forwards]">
          <div className="p-8">
            {/* Close button */}
            <div className="flex items-center gap-3 mb-6">
              <button
                type="button"
                onClick={() => onSelectSession(null)}
                className="font-mono text-[0.8125rem] text-on-surface-variant bg-surface-low border border-surface-high rounded-md px-3 py-1 cursor-pointer hover:text-on-surface"
              >
                ESC · Close
              </button>
            </div>

            {/* Title + meta */}
            <h2 className="font-display text-2xl font-bold text-on-surface mb-2">
              {selectedSession.title}
            </h2>
            <div className="font-mono text-[0.6875rem] uppercase tracking-wider text-on-surface-variant mb-4">
              {new Date(selectedSession.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              {selectedSession.source && ` · ${selectedSession.source}`}
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-4 gap-3 mb-5">
              <MockStatBox label="Active Time" value={formatDuration(selectedSession.durationMinutes)} primary />
              <MockStatBox label="Turns" value={selectedSession.turns} />
              <MockStatBox label="Files" value={selectedSession.filesChanged?.length ?? '—'} />
              <MockStatBox label="Lines changed" value={formatLoc(selectedSession.linesOfCode)} />
            </div>

            {/* Developer take — only when enhanced */}
            {enhanced && (
              <p className="text-[0.9375rem] leading-relaxed text-on-surface border-l-[3px] border-primary pl-3 mb-5">
                Implemented the core sync pipeline that discovers sessions from the filesystem,
                checks staleness against SQLite, and indexes new or changed sessions with full
                text search support.
              </p>
            )}

            {/* Skills — always shown */}
            {selectedSession.skills && selectedSession.skills.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-5">
                {selectedSession.skills.map((skill) => (
                  <Chip key={skill} variant="violet">{skill}</Chip>
                ))}
              </div>
            )}

            {/* Session WorkTimeline for sessions with many turns */}
            {selectedSession.turns >= 50 && (
              <div className="mb-5">
                <MockSectionLabel>Session Activity · {selectedSession.turns} turns over {formatDuration(selectedSession.durationMinutes)}</MockSectionLabel>
                <WorkTimeline sessions={[selectedSession]} maxHeight={200} />
              </div>
            )}

            {/* Execution path — always shown, richer when enhanced */}
            <div className="mb-5">
              <MockSectionLabel>Execution Path</MockSectionLabel>
              {(enhanced ? [
                { n: 1, title: 'Read existing parsers and DB schema', desc: 'Analyzed the current session discovery pipeline and SQLite schema to understand the data flow' },
                { n: 2, title: 'Build staleness checker', desc: 'Compared file mtime/size against DB records to skip unchanged sessions' },
                { n: 3, title: 'Implement indexing loop', desc: 'Parse → bridge → analyze → upsert for each stale session, with progress reporting' },
              ] : (() => {
                // Generate multi-step execution path from files (like the real app does)
                const files = selectedSession.filesChanged ?? []
                const steps: Array<{ n: number; title: string; desc: string }> = []
                // Group files into 2-3 steps
                const chunkSize = Math.max(1, Math.ceil(files.length / 3))
                for (let i = 0; i < files.length; i += chunkSize) {
                  const chunk = files.slice(i, i + chunkSize)
                  steps.push({
                    n: steps.length + 1,
                    title: `Modified ${chunk.map(f => f.path.split('/').pop()).join(', ')}`,
                    desc: '',
                  })
                }
                return steps.length > 0 ? steps : [{ n: 1, title: 'Modified multiple files', desc: '' }]
              })()).map((step) => (
                <div key={step.n} className="flex gap-3 items-start py-2.5 border-b border-ghost last:border-b-0">
                  <div className="w-6 h-6 rounded-full bg-primary text-white font-mono text-[0.625rem] font-bold flex items-center justify-center flex-shrink-0">
                    {step.n}
                  </div>
                  <div>
                    <div className="font-semibold text-sm text-on-surface mb-0.5">{step.title}</div>
                    {step.desc && <div className="text-[0.8125rem] text-on-surface-variant leading-relaxed">{step.desc}</div>}
                  </div>
                </div>
              ))}
            </div>

            {/* Tool usage */}
            {selectedSession.toolBreakdown && selectedSession.toolBreakdown.length > 0 && (
            <div className="mb-5">
              <MockSectionLabel>Tool Usage</MockSectionLabel>
              {selectedSession.toolBreakdown.map((t) => (
                <div key={t.tool} className="flex justify-between items-center py-1.5 border-b border-ghost last:border-b-0 font-mono text-xs">
                  <span className="text-on-surface">{t.tool}</span>
                  <span className="text-on-surface-variant">{t.count}</span>
                </div>
              ))}
            </div>
            )}

            {/* Top files */}
            {selectedSession.filesChanged && selectedSession.filesChanged.length > 0 && (
            <div className="mb-5">
              <MockSectionLabel>Top Files</MockSectionLabel>
              {selectedSession.filesChanged.slice(0, 10).map((f) => (
                <div key={f.path} className="flex justify-between items-center py-1.5 border-b border-ghost last:border-b-0 font-mono text-xs">
                  <span className="text-on-surface truncate min-w-0">{f.path}</span>
                  <span className="flex-shrink-0 ml-2 whitespace-nowrap">
                    <span className="text-green-600 font-semibold">+{f.additions}</span>
                    <span className="text-red-600 font-semibold ml-1">-{f.deletions}</span>
                  </span>
                </div>
              ))}
            </div>
            )}
          </div>
        </div>
      </div>
    )}
    </>
  )
}

function MockStatBox({ label, value, primary }: { label: string; value: string | number; primary?: boolean }) {
  return (
    <div className="text-center p-3 border border-ghost rounded-sm bg-surface-lowest">
      <div className={`font-mono text-xl font-bold ${primary ? 'text-primary' : 'text-on-surface'}`}>
        {value}
      </div>
      <div className="font-mono text-[9px] uppercase tracking-wider text-on-surface-variant mt-1">
        {label}
      </div>
    </div>
  )
}

function MockSectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="font-mono text-[0.625rem] font-semibold uppercase tracking-wider text-on-surface-variant mb-2.5">
      {children}
    </div>
  )
}

// ── Browser Frame ───────────────────────────────────────────

function BrowserFrame({ url, children }: { url: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-[#d1d5db] bg-white shadow-xl overflow-hidden">
      {/* Chrome */}
      <div className="flex items-center gap-2 px-3 py-2 bg-[#f1f3f5] border-b border-[#d1d5db]">
        <div className="flex gap-1.5">
          <div className="w-[10px] h-[10px] rounded-full bg-[#ff5f57]" />
          <div className="w-[10px] h-[10px] rounded-full bg-[#febc2e]" />
          <div className="w-[10px] h-[10px] rounded-full bg-[#28c840]" />
        </div>
        <div className="flex-1 mx-2">
          <div className="bg-white rounded-md border border-[#d1d5db] px-3 py-1 text-[10px] text-[#6b7280] font-mono">
            {url}
          </div>
        </div>
      </div>
      {/* Page content */}
      <div className="bg-[#f1f5f9] max-h-[70vh] overflow-y-auto">
        {children}
      </div>
    </div>
  )
}

// ── Feature previews ────────────────────────────────────────

// ── Terminal components ─────────────────────────────────────

function OnboardingTerminal({ children, compact }: { children: ReactNode; compact: boolean }) {
  const feedRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight })
  })

  return (
    <div
      className="triage-terminal"
      style={{
        maxWidth: compact ? 340 : 680,
        margin: '0 auto',
        padding: compact ? '0.875rem 1rem 0.625rem' : '1.5rem 1.5rem 1rem',
        fontSize: compact ? '0.6875rem' : '0.8125rem',
      }}
    >
      <div className="flex items-center gap-1.5 mb-3">
        <div className="w-2 h-2 rounded-full bg-[#ff5f57]" />
        <div className="w-2 h-2 rounded-full bg-[#febc2e]" />
        <div className="w-2 h-2 rounded-full bg-[#28c840]" />
      </div>
      <div ref={feedRef} className="triage-terminal__feed">
        {children}
      </div>
    </div>
  )
}

type TermVariant = 'prompt' | 'active' | 'passed' | 'info' | 'default' | 'section' | 'reveal'

function TermLine({ variant, children }: { variant: TermVariant; children: ReactNode }) {
  const cls =
    variant === 'prompt' ? 'triage-terminal__prompt' :
    variant === 'passed' ? 'triage-terminal__line--passed' :
    variant === 'active' ? 'triage-terminal__line--active' :
    variant === 'section' ? 'triage-terminal__section' :
    variant === 'reveal' ? 'triage-terminal__line--passed opacity-0 animate-[fadeIn_0.3s_ease_forwards]' :
    variant === 'info' ? 'opacity-80' :
    ''

  return (
    <div className={`triage-terminal__line ${cls}`}>
      {children}
    </div>
  )
}

interface TermPromptProps {
  question: string
  onYes: () => void
  onNo: () => void
  defaultNo?: boolean
  yesLabel?: string
  noLabel?: string
}

function TermPrompt({ question, onYes, onNo, defaultNo, yesLabel, noLabel }: TermPromptProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState(defaultNo ? '' : 'Y')

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 100)
    return () => clearTimeout(t)
  }, [])

  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      const v = value.trim().toLowerCase()
      if (v === '' || v === 'y' || v === 'yes') {
        onYes()
      } else {
        onNo()
      }
    }
  }

  return (
    <div className="mt-1">
      <div className="triage-terminal__line flex items-center gap-0 flex-wrap">
        <span className="text-[#9dcaff] font-semibold">{'  > '}</span>
        <span>{question} </span>
        <span className="text-white/40">{defaultNo ? '[y/N]' : '[Y/n]'} </span>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKey}
          className="bg-transparent border-none outline-none text-[#34d399] font-mono w-12 caret-[#34d399]"
          style={{ fontSize: 'inherit', lineHeight: 'inherit', padding: 0 }}
        />
      </div>
      <div className="flex items-center gap-2 mt-2 ml-4">
        <button
          onClick={onYes}
          className="text-[10px] font-mono px-2.5 py-1 rounded bg-white/10 text-white/90 hover:bg-white/20 transition-colors"
        >
          {yesLabel ?? 'Yes'} <span className="text-white/30 ml-0.5">↵</span>
        </button>
        <button
          onClick={onNo}
          className="text-[10px] font-mono px-2.5 py-1 rounded text-white/40 hover:text-white/70 transition-colors"
        >
          {noLabel ?? 'No'}
        </button>
      </div>
    </div>
  )
}

// ── Dashboard ───────────────────────────────────────────────

function Dashboard({
  dashboard,
  stats,
  projects,
}: {
  dashboard: DashboardResponse | null
  stats: DashboardResponse['stats'] | undefined
  projects: DashboardProject[]
}) {
  const recentProjects = projects.slice(0, 4)
  const enhancedCount = stats?.enhancedCount ?? 0

  return (
    <div className="p-6">
      <h1 className="font-display text-[1.75rem] leading-[1.1] font-bold text-on-surface">
        Turn your AI sessions into a dev portfolio.
      </h1>

      {stats && (
        <>
          <div className="h-6" />
          <div className="grid grid-cols-4 gap-4">
            <StatBox label="Sessions indexed" value={stats.sessionCount} to="/archive" color="var(--primary)" />
            <StatBox label="Projects" value={stats.projectCount} to="/projects" />
            <StatBox label="Enhanced" value={enhancedCount} to="/projects" color={enhancedCount > 0 ? '#34d399' : undefined} />
            <StatBox label="Sources" value={stats.sourceCount} to="/sources" />
          </div>
        </>
      )}

      <div className="h-6" />

      <div className="flex items-center gap-3 flex-wrap">
        <Link to="/sources" className="inline-flex items-center gap-1.5 font-semibold text-[0.8125rem] px-4 py-2 rounded-sm bg-primary text-on-primary hover:bg-primary-hover transition-colors">
          Sync new sessions
        </Link>
        <Link to="/projects" className="inline-flex items-center gap-1.5 font-semibold text-[0.8125rem] px-4 py-2 rounded-sm text-primary border border-ghost hover:border-outline transition-colors">
          View projects
        </Link>
        <Link to="/search" className="inline-flex items-center gap-1.5 font-semibold text-[0.8125rem] px-4 py-2 rounded-sm text-primary border border-ghost hover:border-outline transition-colors">
          Search sessions
        </Link>

        {dashboard?.sync.status === 'syncing' && (
          <span className="text-xs text-on-surface-variant">
            syncing {dashboard.sync.current}/{dashboard.sync.total}
            {dashboard.sync.currentProject ? ` — ${dashboard.sync.currentProject}` : ''}...
          </span>
        )}
      </div>

      <div className="h-10" />

      {recentProjects.length > 0 && (
        <>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="font-semibold text-sm text-on-surface">Recent projects</h2>
            <Link to="/projects" className="text-xs text-primary hover:underline">View all &rarr;</Link>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {recentProjects.map((p) => (
              <ProjectCard key={p.projectDir} project={p} />
            ))}
          </div>
          <div className="h-10" />
        </>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <FeatureCard to="/archive" label="Archive" title="Back up sessions" desc="Import from local AI tools before they expire. Everything stays on your machine." />
        <FeatureCard to="/projects" label="Build" title="AI case studies" desc="AI reads your sessions, extracts skills, and drafts a narrative for each project." />
        <FeatureCard to="/search" label="Search" title="Find past work" desc="Full-text search across all sessions. Filter by tool, project, or skill." />
        <FeatureCard to="/projects" label="Export" title="HTML, markdown, or publish" desc="Save locally, export markdown, or publish a public portfolio on heyi.am." />
      </div>

      <div className="h-8" />

      <div className="border-t border-ghost pt-4 flex items-start gap-6 text-xs text-on-surface-variant">
        <span>Everything is local by default.</span>
        <span>Nothing is published unless you choose to.</span>
        <span>No account required to archive or export.</span>
      </div>
    </div>
  )
}

// ── Shared sub-components ───────────────────────────────────

function ProjectCard({ project: p }: { project: DashboardProject }) {
  return (
    <Link
      to={`/project/${encodeURIComponent(p.projectDir)}`}
      className="group block bg-white border border-ghost rounded-sm p-3.5 hover:border-outline transition-colors"
    >
      <div className="font-semibold text-sm text-on-surface truncate">{p.projectName}</div>
      <div className="text-xs text-on-surface-variant mt-0.5">
        {p.sessionCount} session{p.sessionCount !== 1 ? 's' : ''}
        {p.enhancedAt && <span className="ml-2" style={{ color: '#34d399' }}>enhanced</span>}
      </div>
      {p.skills.length > 0 && (
        <div className="flex gap-1 mt-2 flex-wrap">
          {p.skills.slice(0, 3).map((s) => (
            <Chip key={s}>{s}</Chip>
          ))}
        </div>
      )}
    </Link>
  )
}

function StatBox({ label, value, to, color }: { label: string; value: number; to: string; color?: string }) {
  return (
    <Link to={to} className="block bg-white border border-ghost rounded-sm px-4 py-3 hover:border-outline transition-colors">
      <div className="text-2xl font-bold" style={color ? { color } : { color: 'var(--on-surface)' }}>{value}</div>
      <div className="text-xs text-on-surface-variant mt-0.5">{label}</div>
    </Link>
  )
}

function FeatureCard({ to, label, title, desc }: { to: string; label: string; title: string; desc: string }) {
  return (
    <Link to={to} className="group block bg-white border border-ghost rounded-sm p-4 hover:border-outline transition-colors">
      <div className="font-mono text-[9px] uppercase tracking-wider text-primary mb-1.5">{label}</div>
      <div className="font-semibold text-sm text-on-surface mb-1">{title}</div>
      <div className="text-xs text-on-surface-variant leading-relaxed">{desc}</div>
    </Link>
  )
}
