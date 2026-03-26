import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { AppShell, Card, FileManifest } from './shared'
import { saveProjectLocally, exportMarkdown, exportHtml } from '../api'
import type { ExportResult } from '../types'

type ExportState = 'idle' | 'loading' | 'done' | 'error'

interface ArtifactState {
  status: ExportState
  result?: ExportResult
  error?: string
}

export function SaveExport() {
  const { dirName = '' } = useParams()
  const navigate = useNavigate()

  const [saveLocal, setSaveLocal] = useState<ArtifactState>({ status: 'idle' })
  const [mdExport, setMdExport] = useState<ArtifactState>({ status: 'idle' })
  const [htmlExport, setHtmlExport] = useState<ArtifactState>({ status: 'idle' })

  async function handleSaveLocally() {
    setSaveLocal({ status: 'loading' })
    try {
      const result = await saveProjectLocally(dirName)
      setSaveLocal({ status: 'done', result })
    } catch (err) {
      setSaveLocal({ status: 'error', error: (err as Error).message })
    }
  }

  async function handleExportMarkdown() {
    setMdExport({ status: 'loading' })
    try {
      const result = await exportMarkdown(dirName)
      setMdExport({ status: 'done', result })
    } catch (err) {
      setMdExport({ status: 'error', error: (err as Error).message })
    }
  }

  async function handleExportHtml() {
    setHtmlExport({ status: 'loading' })
    try {
      const result = await exportHtml(dirName)
      setHtmlExport({ status: 'done', result })
    } catch (err) {
      setHtmlExport({ status: 'error', error: (err as Error).message })
    }
  }

  return (
    <AppShell
      back={{ label: 'Draft', to: `/project/${dirName}/refine/draft` }}
      chips={[{ label: 'Save & export' }]}
    >
      <div className="max-w-3xl mx-auto p-6">
        <h2 className="font-display text-2xl font-bold text-on-surface">
          Your project draft is ready
        </h2>
        <p className="text-on-surface-variant text-sm mt-1">
          Keeping this private is a complete success state.
        </p>

        <div className="mt-6">
          <FileManifest
            path={`~/.config/heyiam/exports/${dirName}/`}
            files={[
              { name: `${dirName}/` },
              { name: 'README.md', desc: 'project narrative', indent: 1 },
              { name: 'sessions/', desc: 'per-session breakdowns', indent: 1 },
              { name: 'project.json', desc: 'structured data', indent: 1 },
              { name: 'index.html', desc: 'standalone preview', indent: 1 },
            ]}
            footer="self-contained, viewable offline"
          />
        </div>

        <div className="grid grid-cols-2 gap-4 mt-6">
          <ArtifactCard
            eyebrow="Recommended"
            eyebrowColor="text-green"
            title="Save locally"
            description="Store the refined project in your local workspace with selected sessions, narrative edits, and privacy settings intact."
            buttonLabel="Save locally"
            buttonVariant="primary"
            state={saveLocal}
            onClick={handleSaveLocally}
          />
          <ArtifactCard
            eyebrow="Portable"
            title="Export Markdown"
            description="Create a version-controlled project writeup you can edit in GitHub, Obsidian, or plain files."
            buttonLabel="Export Markdown"
            buttonVariant="secondary"
            state={mdExport}
            onClick={handleExportMarkdown}
          />
          <ArtifactCard
            eyebrow="Static"
            title="Export static site"
            description="Generate a local artifact or GitHub Pages bundle without needing heyi.am hosting."
            buttonLabel="Export static site"
            buttonVariant="secondary"
            state={htmlExport}
            onClick={handleExportHtml}
          />
          <ArtifactCard
            eyebrow="Optional"
            eyebrowColor="text-on-surface-variant"
            title="Publish to heyi.am"
            description="Create a public version only after reviewing exactly what becomes visible."
            buttonLabel="Review public version"
            buttonVariant="secondary"
            state={{ status: 'idle' }}
            onClick={() => navigate(`/project/${dirName}/publish`)}
          />
        </div>
      </div>
    </AppShell>
  )
}

function ArtifactCard({
  eyebrow,
  eyebrowColor = 'text-on-surface-variant',
  title,
  description,
  buttonLabel,
  buttonVariant,
  state,
  onClick,
}: {
  eyebrow: string
  eyebrowColor?: string
  title: string
  description: string
  buttonLabel: string
  buttonVariant: 'primary' | 'secondary'
  state: ArtifactState
  onClick: () => void
}) {
  const isPrimary = buttonVariant === 'primary'
  const baseBtn = 'text-sm font-medium px-4 py-2 rounded-md transition-colors'
  const btnClass = isPrimary
    ? `${baseBtn} bg-primary text-on-primary hover:bg-primary-hover`
    : `${baseBtn} border border-outline text-on-surface hover:bg-surface-low`

  return (
    <Card>
      <div className={`font-mono text-[9px] uppercase tracking-wider ${eyebrowColor}`}>
        {eyebrow}
      </div>
      <h3 className="font-display text-base font-semibold text-on-surface mt-1">
        {title}
      </h3>
      <p className="text-on-surface-variant text-[13px] mt-1.5">{description}</p>
      <div className="mt-3">
        {state.status === 'done' ? (
          <div className="flex items-center gap-2">
            <span className="text-green text-sm font-medium">Saved</span>
            {state.result?.outputPath && (
              <span className="font-mono text-[11px] text-on-surface-variant truncate">
                {state.result.outputPath}
              </span>
            )}
          </div>
        ) : state.status === 'error' ? (
          <div className="text-error text-sm">{state.error}</div>
        ) : (
          <button
            className={btnClass}
            onClick={onClick}
            disabled={state.status === 'loading'}
          >
            {state.status === 'loading' ? (
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                Working...
              </span>
            ) : (
              buttonLabel
            )}
          </button>
        )}
      </div>
    </Card>
  )
}
