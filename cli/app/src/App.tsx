import { BrowserRouter, Routes, Route, Link, useParams } from 'react-router-dom'
import { AppShell } from './components/shared'
import { FirstRun } from './components/FirstRun'
import { SourceAudit } from './components/SourceAudit'
import { ArchiveView } from './components/ArchiveView'
import { Projects } from './components/Projects'
import { ProjectDetail } from './components/ProjectDetail'
import { Boundaries } from './components/Boundaries'
import { ProjectUploadFlow } from './components/ProjectUploadFlow'
import { SaveExport } from './components/SaveExport'
import { PublishReview } from './components/PublishReview'
import { Settings } from './components/Settings'
import { Search } from './components/Search'
import { SessionView } from './components/SessionView'

function ProjectDetailWrapper() {
  const { dirName } = useParams<{ dirName: string }>()
  return (
    <AppShell
      back={{ label: 'Projects', to: '/projects' }}
      chips={[{ label: dirName ?? 'Project' }]}
      actions={
        <>
          <Link
            to={`/project/${encodeURIComponent(dirName ?? '')}/enhance`}
            className="inline-flex items-center gap-1.5 font-semibold text-[0.8125rem] px-3.5 py-1.5 rounded-sm bg-primary text-on-primary hover:bg-primary-hover transition-colors"
          >
            Enhance project
          </Link>
          <Link
            to={`/project/${encodeURIComponent(dirName ?? '')}/output`}
            className="inline-flex items-center gap-1.5 font-semibold text-[0.8125rem] px-3.5 py-1.5 rounded-sm border border-ghost text-primary hover:border-outline transition-colors"
          >
            Export
          </Link>
          <Link
            to={`/project/${encodeURIComponent(dirName ?? '')}/publish`}
            className="text-xs text-on-surface-variant hover:text-on-surface transition-colors"
          >
            Publish public version
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
        <Route path="/project/:dirName/boundaries" element={<Boundaries />} />
        <Route path="/project/:dirName/enhance" element={<ProjectUploadFlow />} />

        {/* Workstream D: Search + Session view */}
        <Route path="/search" element={<Search />} />
        <Route path="/session/:sessionId" element={<SessionView />} />

        {/* Workstream C: Save/Export + Publish + Settings */}
        <Route path="/project/:dirName/output" element={<SaveExport />} />
        <Route path="/project/:dirName/publish" element={<PublishReview />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </BrowserRouter>
  )
}
