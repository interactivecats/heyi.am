import { useState, useRef, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Link, useParams } from 'react-router-dom'
import { fetchProjectDetail } from './api'
import { AppShell } from './components/shared'
import { FirstRun } from './components/FirstRun'
import { SourceAudit } from './components/SourceAudit'
import { ArchiveView } from './components/ArchiveView'
import { Projects } from './components/Projects'
import { ProjectDetail } from './components/ProjectDetail'
import { Boundaries } from './components/Boundaries'
import { ProjectUploadFlow } from './components/ProjectUploadFlow'
import { PublishReview } from './components/PublishReview'
import { Settings } from './components/Settings'
import { Search } from './components/Search'
import { SessionView } from './components/SessionView'
import { ProjectSessions } from './components/ProjectSessions'

function ExportDropdown({ dirName }: { dirName: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const enc = encodeURIComponent(dirName)
  const items = [
    { label: 'HTML (.zip)', href: `/api/projects/${enc}/download-html` },
    { label: 'Markdown (.zip)', href: `/api/projects/${enc}/download-markdown` },
    { label: 'JSON', href: `/api/projects/${enc}/download-json` },
  ]

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 font-semibold text-[0.8125rem] px-3.5 py-1.5 rounded-sm border border-ghost text-primary hover:border-outline transition-colors"
      >
        Export
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className={`transition-transform ${open ? 'rotate-180' : ''}`}>
          <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 min-w-[160px] rounded-md border border-outline bg-surface py-1 shadow-lg">
          {items.map((item) => (
            <a
              key={item.label}
              href={item.href}
              className="block px-3 py-1.5 text-[0.8125rem] text-on-surface hover:bg-surface-low transition-colors"
              onClick={() => setOpen(false)}
            >
              {item.label}
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

function ProjectDetailWrapper() {
  const { dirName } = useParams<{ dirName: string }>()
  const [projectName, setProjectName] = useState<string | null>(null)

  useEffect(() => {
    if (!dirName) return
    fetchProjectDetail(dirName).then((d) => {
      setProjectName(d.project.name)
    }).catch(() => {})
  }, [dirName])

  return (
    <AppShell
      back={{ label: 'Projects', to: '/projects' }}
      chips={[{ label: projectName ?? '...' }]}
      actions={
        <>
          <Link
            to={`/project/${encodeURIComponent(dirName ?? '')}/enhance`}
            className="inline-flex items-center gap-1.5 font-semibold text-[0.8125rem] px-3.5 py-1.5 rounded-sm bg-primary text-on-primary hover:bg-primary-hover transition-colors"
          >
            Enhance project
          </Link>
          <ExportDropdown dirName={dirName ?? ''} />
          <Link
            to={`/project/${encodeURIComponent(dirName ?? '')}/publish`}
            className="text-xs text-on-surface-variant hover:text-on-surface transition-colors"
          >
            Upload to heyiam.com
          </Link>
        </>
      }
    >
      <ProjectDetail />
    </AppShell>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Workstream A: Onboarding */}
        <Route path="/" element={<FirstRun />} />
        <Route path="/sources" element={<SourceAudit />} />
        <Route path="/archive" element={<ArchiveView />} />

        {/* Workstream B: Project Detail + Enhance */}
        <Route path="/projects" element={<Projects />} />
        <Route path="/project/:dirName" element={<ProjectDetailWrapper />} />
        <Route path="/project/:dirName/sessions" element={<ProjectSessions />} />
        <Route path="/project/:dirName/boundaries" element={<Boundaries />} />
        <Route path="/project/:dirName/enhance" element={<ProjectUploadFlow />} />

        {/* Workstream D: Search + Session view */}
        <Route path="/search" element={<Search />} />
        <Route path="/session/:sessionId" element={<SessionView />} />

        {/* Workstream C: Publish + Settings */}
        <Route path="/project/:dirName/publish" element={<PublishReview />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </BrowserRouter>
  )
}
