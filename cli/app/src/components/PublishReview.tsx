import { useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { AppShell, Card, Note, SectionHeader } from './shared'
import { uploadProject, exportHtml, type UploadEvent } from '../api'

type PublishState =
  | { step: 'review' }
  | { step: 'publishing'; messages: string[] }
  | { step: 'done'; projectUrl: string; uploaded: number; failed: number }
  | { step: 'error'; message: string }

export function PublishReview() {
  const { dirName = '' } = useParams()
  const [state, setState] = useState<PublishState>({ step: 'review' })
  const [htmlExporting, setHtmlExporting] = useState(false)

  const handlePublish = useCallback(() => {
    setState({ step: 'publishing', messages: [] })

    const payload = {
      title: dirName,
      slug: dirName,
      narrative: '',
      repoUrl: '',
      projectUrl: '',
      timeline: [],
      skills: [],
      totalSessions: 0,
      totalLoc: 0,
      totalDurationMinutes: 0,
      totalFilesChanged: 0,
      skippedSessions: [],
      selectedSessionIds: [],
    }

    uploadProject(dirName, payload, (event: UploadEvent) => {
      switch (event.type) {
        case 'project':
          setState((prev) =>
            prev.step === 'publishing'
              ? { ...prev, messages: [...prev.messages, `Project ${event.status}`] }
              : prev,
          )
          break
        case 'session':
          setState((prev) =>
            prev.step === 'publishing'
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
  }, [dirName])

  async function handleExportGitHubPages() {
    setHtmlExporting(true)
    try {
      await exportHtml(dirName)
    } catch {
      // handled by export screen
    } finally {
      setHtmlExporting(false)
    }
  }

  const publishButton = (
    <button
      className="text-sm font-medium px-4 py-1.5 rounded-md bg-green text-on-primary hover:opacity-90 transition-opacity"
      onClick={handlePublish}
      disabled={state.step === 'publishing'}
    >
      Publish public version
    </button>
  )

  return (
    <AppShell
      back={{ label: 'Output', to: `/project/${dirName}/output` }}
      chips={[{ label: 'Publish public version' }]}
      actions={state.step === 'review' ? publishButton : undefined}
    >
      <div className="p-6">
        {state.step === 'publishing' && (
          <Card className="max-w-2xl mx-auto">
            <SectionHeader title="Publishing..." meta="in progress" />
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
            <SectionHeader title="Published" meta="live" />
            <div className="mt-2 space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green shrink-0" />
                <span className="text-sm text-on-surface font-medium">
                  {state.uploaded} session{state.uploaded !== 1 ? 's' : ''} uploaded
                </span>
              </div>
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
            <SectionHeader title="Publish failed" />
            <p className="text-error text-sm mt-2">{state.message}</p>
            <button
              className="mt-3 text-sm font-medium px-4 py-1.5 rounded-md bg-green text-on-primary hover:opacity-90 transition-opacity"
              onClick={handlePublish}
            >
              Retry
            </button>
          </Card>
        )}

        {state.step === 'review' && (
          <div className="grid grid-cols-2 gap-6">
            <Card>
              <SectionHeader title="What will be public" meta="review" />
              <div className="space-y-2">
                <Note>Project title and narrative summary</Note>
                <Note>Selected sessions and public-facing stats</Note>
                <Note>Curated decisions, phases, and exported visual template</Note>
              </div>
            </Card>
            <Card>
              <SectionHeader title="What stays local" meta="safety" />
              <div className="space-y-2">
                <Note>Excluded sessions and private notes</Note>
                <Note>Source audit details and archive metadata</Note>
                <Note>Sensitive flagged terms and personal OpenClaw material</Note>
              </div>
              <div className="flex items-center gap-3 mt-4">
                <button
                  className="text-sm font-medium px-4 py-1.5 rounded-md bg-green text-on-primary hover:opacity-90 transition-opacity"
                  onClick={handlePublish}
                >
                  Publish public version
                </button>
                <button
                  className="text-sm font-medium px-4 py-1.5 rounded-md border border-outline text-on-surface hover:bg-surface-low transition-colors"
                  onClick={handleExportGitHubPages}
                  disabled={htmlExporting}
                >
                  {htmlExporting ? 'Exporting...' : 'Export for GitHub Pages'}
                </button>
              </div>
            </Card>
          </div>
        )}
      </div>
    </AppShell>
  )
}
