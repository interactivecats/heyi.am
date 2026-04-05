import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { AppShell, Card, Note, SectionHeader } from './shared'
import { uploadProject, fetchProjectDetail, startLogin, pollDeviceAuth, type UploadEvent } from '../api'
import type { ProjectDetail } from '../types'

type UploadState =
  | { step: 'review' }
  | { step: 'uploading'; messages: string[] }
  | { step: 'done'; projectUrl: string; uploaded: number; failed: number }
  | { step: 'auth'; status: 'opening' | 'waiting' | 'done' | 'error'; error?: string }
  | { step: 'error'; message: string }

/** Extract a short project name from an encoded dir path (e.g. "-Users-ben-Dev-myapp" → "myapp"). */
function projectNameFromDir(encoded: string): string {
  const devIdx = encoded.indexOf('-Dev-')
  if (devIdx !== -1) return encoded.slice(devIdx + 5)
  const segments = encoded.split('-').filter(Boolean)
  return segments.length > 0 ? segments[segments.length - 1] : encoded
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export function PublishReview() {
  const { dirName = '' } = useParams()
  const [state, setState] = useState<UploadState>({ step: 'review' })
  const [detail, setDetail] = useState<ProjectDetail | null>(null)

  useEffect(() => {
    if (!dirName) return
    fetchProjectDetail(dirName).then(setDetail).catch(() => {})
  }, [dirName])

  const handleUpload = useCallback(() => {
    setState({ step: 'uploading', messages: [] })

    const cache = detail?.enhanceCache
    const project = detail?.project
    const name = cache?.title || project?.name || projectNameFromDir(dirName)
    const payload = {
      title: name,
      slug: slugify(name),
      narrative: cache?.result?.narrative ?? '',
      repoUrl: cache?.repoUrl ?? '',
      projectUrl: cache?.projectUrl ?? '',
      timeline: cache?.result?.timeline ?? [],
      skills: cache?.result?.skills ?? [],
      totalSessions: project?.sessionCount ?? 0,
      totalLoc: project?.totalLoc ?? 0,
      totalDurationMinutes: project?.totalDuration ?? 0,
      totalAgentDurationMinutes: project?.totalAgentDuration,
      totalFilesChanged: project?.totalFiles ?? 0,
      totalInputTokens: project?.totalInputTokens ?? 0,
      totalOutputTokens: project?.totalOutputTokens ?? 0,
      skippedSessions: [],
      selectedSessionIds: cache?.selectedSessionIds ?? [],
      screenshotBase64: cache?.screenshotBase64 ?? undefined,
    }

    uploadProject(dirName, payload, (event: UploadEvent) => {
      switch (event.type) {
        case 'project':
          setState((prev) =>
            prev.step === 'uploading'
              ? { ...prev, messages: [...prev.messages, `Project ${event.status}`] }
              : prev,
          )
          break
        case 'session':
          setState((prev) =>
            prev.step === 'uploading'
              ? { ...prev, messages: [...prev.messages, `Session ${event.sessionId}: ${event.status}`] }
              : prev,
          )
          break
        case 'done':
          setState({
            step: 'done',
            projectUrl: event.projectUrl,
            uploaded: event.uploaded,
            failed: event.failed,
          })
          break
        case 'error':
          if (event.message === 'AUTH_REQUIRED') {
            startDeviceLogin()
          } else {
            setState({ step: 'error', message: event.message })
          }
          break
      }
    })
  }, [dirName, detail])

  const startDeviceLogin = useCallback(async () => {
    setState({ step: 'auth', status: 'opening' })
    try {
      const deviceInfo = await startLogin()
      window.open(deviceInfo.verification_uri, '_blank')
      setState({ step: 'auth', status: 'waiting' })

      const startTime = Date.now()
      const poll = async () => {
        try {
          const status = await pollDeviceAuth(deviceInfo.device_code)
          if (status.authenticated) {
            setState({ step: 'auth', status: 'done' })
            setTimeout(() => handleUpload(), 500)
            return
          }
        } catch { /* authorization_pending */ }
        if (Date.now() - startTime < 300_000) {
          setTimeout(poll, 5000)
        } else {
          setState({ step: 'auth', status: 'error', error: 'Timed out. Try again.' })
        }
      }
      setTimeout(poll, 5000)
    } catch {
      setState({ step: 'auth', status: 'error', error: 'Could not connect. Try again later.' })
    }
  }, [handleUpload])

  const uploadButton = (
    <button
      className="inline-flex items-center gap-1.5 font-semibold text-[0.8125rem] px-3.5 py-1.5 rounded-sm bg-primary text-on-primary hover:bg-primary-hover transition-colors"
      onClick={handleUpload}
      disabled={state.step === 'uploading'}
    >
      Upload to heyiam.com
    </button>
  )

  return (
    <AppShell
      back={{ label: 'Project', to: `/project/${dirName}` }}
      chips={[{ label: 'Upload to heyiam.com' }]}
      actions={state.step === 'review' ? uploadButton : undefined}
    >
      <div className="p-6">
        {state.step === 'uploading' && (
          <Card className="max-w-2xl mx-auto">
            <SectionHeader title="Uploading..." meta="in progress" />
            <div className="space-y-1.5 mt-3">
              {state.messages.map((msg, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-on-surface-variant">
                  <span className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin shrink-0" />
                  {msg}
                </div>
              ))}
              {state.messages.length === 0 && (
                <div className="flex items-center gap-2 text-sm text-on-surface-variant">
                  <span className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin shrink-0" />
                  Connecting...
                </div>
              )}
            </div>
          </Card>
        )}

        {state.step === 'done' && (
          <Card className="max-w-2xl mx-auto">
            <SectionHeader title="Uploaded" meta="on heyi.am" />
            <div className="mt-2 space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green shrink-0" />
                <span className="text-sm text-on-surface font-medium">
                  {state.uploaded} session{state.uploaded !== 1 ? 's' : ''} uploaded
                </span>
              </div>
              <p className="text-xs text-on-surface-variant">
                Sessions are unlisted by default. Go to the dashboard to publish them.
              </p>
              <a
                href={state.projectUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 font-semibold text-[0.8125rem] px-3.5 py-1.5 rounded-sm bg-primary text-on-primary hover:bg-primary-hover transition-colors mt-1"
              >
                Open dashboard
              </a>
            </div>
            <EmbedSnippets projectUrl={state.projectUrl} />
          </Card>
        )}

        {state.step === 'auth' && (
          <Card className="max-w-2xl mx-auto">
            {state.status === 'opening' && (
              <>
                <SectionHeader title="Opening browser..." />
                <div className="flex items-center gap-2 mt-3 text-sm text-on-surface-variant">
                  <span className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin shrink-0" />
                  Starting login...
                </div>
              </>
            )}
            {state.status === 'waiting' && (
              <>
                <SectionHeader title="Log in to heyiam.com" />
                <div className="mt-3 space-y-2">
                  <div className="flex items-center gap-2 text-sm text-on-surface-variant">
                    <span className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin shrink-0" />
                    Waiting for you to finish in the browser...
                  </div>
                  <p className="text-xs text-on-surface-variant">
                    Log in or create an account in the browser window that opened, then come back here.
                  </p>
                </div>
              </>
            )}
            {state.status === 'done' && (
              <>
                <SectionHeader title="Logged in" />
                <div className="flex items-center gap-2 mt-3 text-sm text-on-surface">
                  <span className="w-2 h-2 rounded-full bg-green shrink-0" />
                  Uploading...
                </div>
              </>
            )}
            {state.status === 'error' && (
              <>
                <SectionHeader title="Login failed" />
                <p className="text-error text-sm mt-2">{state.error}</p>
                <button
                  className="mt-3 inline-flex items-center gap-1.5 font-semibold text-[0.8125rem] px-3.5 py-1.5 rounded-sm bg-primary text-on-primary hover:bg-primary-hover transition-colors"
                  onClick={startDeviceLogin}
                >
                  Try again
                </button>
              </>
            )}
          </Card>
        )}

        {state.step === 'error' && (
          <Card className="max-w-2xl mx-auto">
            <SectionHeader title="Upload failed" />
            <p className="text-error text-sm mt-2">{state.message}</p>
            <button
              className="mt-3 inline-flex items-center gap-1.5 font-semibold text-[0.8125rem] px-3.5 py-1.5 rounded-sm bg-primary text-on-primary hover:bg-primary-hover transition-colors"
              onClick={handleUpload}
            >
              Retry
            </button>
          </Card>
        )}

        {state.step === 'review' && (
          <div className="grid grid-cols-2 gap-6">
            <Card>
              <SectionHeader title="What gets uploaded" meta="review" />
              <div className="space-y-2">
                <Note>Project title and narrative summary</Note>
                <Note>Selected sessions and stats</Note>
                <Note>Curated decisions, phases, and rendered templates</Note>
              </div>
            </Card>
            <Card>
              <SectionHeader title="What stays local" meta="safety" />
              <div className="space-y-2">
                <Note>Excluded sessions and private notes</Note>
                <Note>Source audit details and archive metadata</Note>
                <Note>Sensitive flagged terms and personal data</Note>
              </div>
              <div className="flex items-center gap-3 mt-4">
                <button
                  className="inline-flex items-center gap-1.5 font-semibold text-[0.8125rem] px-3.5 py-1.5 rounded-sm bg-primary text-on-primary hover:bg-primary-hover transition-colors"
                  onClick={handleUpload}
                >
                  Upload to heyiam.com
                </button>
              </div>
            </Card>
          </div>
        )}
      </div>
    </AppShell>
  )
}

function EmbedSnippets({ projectUrl }: { projectUrl: string }) {
  const [copied, setCopied] = useState<string | null>(null)
  const embedBase = projectUrl.endsWith('/') ? projectUrl.slice(0, -1) : projectUrl

  // Extract username and slug from URL for widget snippet
  const pathParts = (() => {
    try { return new URL(embedBase).pathname.split('/').filter(Boolean) }
    catch { return [] }
  })()
  const username = pathParts[0] || ''
  const projectSlug = pathParts[1] || ''

  const snippets = [
    { label: 'Badge', desc: 'GitHub, markdown', code: `[![heyi.am](${embedBase}/embed.svg)](${embedBase})` },
    { label: 'Widget', desc: 'Personal site', code: `<div class="heyiam-embed" data-username="${username}" data-project="${projectSlug}"></div>\n<script src="${new URL(embedBase).origin}/embed.js"></script>` },
    { label: 'iframe', desc: 'Any site', code: `<iframe src="${embedBase}/embed?sections=stats,skills" width="480" height="200" frameborder="0"></iframe>` },
  ]

  const copy = (code: string, label: string) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(label)
      setTimeout(() => setCopied(null), 2000)
    })
  }

  return (
    <div className="mt-4 pt-4 border-t border-ghost">
      <div className="font-mono text-[9px] uppercase tracking-wider text-outline mb-2">Embed</div>
      <div className="space-y-2">
        {snippets.map((s) => (
          <div key={s.label}>
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[10px] text-on-surface-variant"><strong>{s.label}</strong> <span className="text-outline">{s.desc}</span></span>
              <button onClick={() => copy(s.code, s.label)} className="text-[10px] text-primary hover:underline">
                {copied === s.label ? 'Copied' : 'Copy'}
              </button>
            </div>
            <pre className="text-[10px] font-mono bg-surface-lowest border border-ghost rounded-sm px-2 py-1.5 overflow-x-auto text-on-surface-variant whitespace-pre-wrap break-all">{s.code}</pre>
          </div>
        ))}
      </div>
    </div>
  )
}
