import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { AppShell, Card, Note, SectionHeader } from './shared'
import { uploadProject, fetchProjectDetail, type UploadEvent } from '../api'
import type { ProjectDetail } from '../types'

type UploadState =
  | { step: 'review' }
  | { step: 'uploading'; messages: string[] }
  | { step: 'done'; projectUrl: string; uploaded: number; failed: number }
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
    const name = project?.name ?? projectNameFromDir(dirName)
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
      totalFilesChanged: project?.totalFiles ?? 0,
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
          setState({ step: 'error', message: event.message })
          break
      }
    })
  }, [dirName, detail])

  const uploadButton = (
    <button
      className="text-sm font-medium px-4 py-1.5 rounded-md bg-green text-on-primary hover:opacity-90 transition-opacity"
      onClick={handleUpload}
      disabled={state.step === 'uploading'}
    >
      Send to heyiam.com
    </button>
  )

  return (
    <AppShell
      back={{ label: 'Project', to: `/project/${dirName}` }}
      chips={[{ label: 'Send to heyiam.com' }]}
      actions={state.step === 'review' ? uploadButton : undefined}
    >
      <div className="p-6">
        {state.step === 'uploading' && (
          <Card className="max-w-2xl mx-auto">
            <SectionHeader title="Uploading..." meta="in progress" />
            <div className="space-y-1.5 mt-3">
              {state.messages.map((msg, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-on-surface-variant">
                  <span className="w-3 h-3 border-2 border-green border-t-transparent rounded-full animate-spin shrink-0" />
                  {msg}
                </div>
              ))}
              {state.messages.length === 0 && (
                <div className="flex items-center gap-2 text-sm text-on-surface-variant">
                  <span className="w-3 h-3 border-2 border-green border-t-transparent rounded-full animate-spin shrink-0" />
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
                Your project is now on heyiam.com. Sign in there to publish it publicly.
              </p>
              <a
                href={state.projectUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-sm text-primary hover:underline break-all"
              >
                {state.projectUrl}
              </a>
            </div>
          </Card>
        )}

        {state.step === 'error' && (
          <Card className="max-w-2xl mx-auto">
            <SectionHeader title="Upload failed" />
            <p className="text-error text-sm mt-2">{state.message}</p>
            <button
              className="mt-3 text-sm font-medium px-4 py-1.5 rounded-md bg-green text-on-primary hover:opacity-90 transition-opacity"
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
                  className="text-sm font-medium px-4 py-1.5 rounded-md bg-green text-on-primary hover:opacity-90 transition-opacity"
                  onClick={handleUpload}
                >
                  Send to heyiam.com
                </button>
              </div>
            </Card>
          </div>
        )}
      </div>
    </AppShell>
  )
}
