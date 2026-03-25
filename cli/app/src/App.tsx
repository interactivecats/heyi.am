import { BrowserRouter, Routes, Route, Link, useParams } from 'react-router-dom'
import { AppShell } from './components/shared'
import { FirstRun } from './components/FirstRun'
import { SourceAudit } from './components/SourceAudit'
import { ArchiveView } from './components/ArchiveView'
import { Projects } from './components/Projects'
import { ProjectDetail } from './components/ProjectDetail'
import { Boundaries } from './components/Boundaries'
import { RefineScope } from './components/RefineScope'
import { RefineMoments } from './components/RefineMoments'
import { RefineQuestions } from './components/RefineQuestions'
import { RefineDraft } from './components/RefineDraft'
import { ProjectRefineProvider } from './contexts/ProjectRefineContext'
import { SaveExport } from './components/SaveExport'
import { PublishReview } from './components/PublishReview'
import { Settings } from './components/Settings'

function ProjectDetailWrapper() {
  const { dirName } = useParams<{ dirName: string }>()
  return (
    <AppShell
      back={{ label: 'Projects', to: '/projects' }}
      chips={[{ label: dirName ?? 'Project' }]}
      actions={
        <>
          <Link
            to={`/project/${encodeURIComponent(dirName ?? '')}/refine/scope`}
            className="inline-flex items-center gap-1.5 font-semibold text-[0.8125rem] px-3.5 py-1.5 rounded-sm bg-primary text-on-primary hover:bg-primary-hover transition-colors"
          >
            Refine project
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
      <ProjectRefineProvider>
        <Routes>
          {/* Workstream A: Onboarding */}
          <Route path="/" element={<FirstRun />} />
          <Route path="/sources" element={<SourceAudit />} />
          <Route path="/archive" element={<ArchiveView />} />

          {/* Workstream B: Project Detail + Refine */}
          <Route path="/projects" element={<Projects />} />
          <Route path="/project/:dirName" element={<ProjectDetailWrapper />} />
          <Route path="/project/:dirName/boundaries" element={<Boundaries />} />
          <Route path="/project/:dirName/refine/scope" element={<RefineScope />} />
          <Route path="/project/:dirName/refine/moments" element={<RefineMoments />} />
          <Route path="/project/:dirName/refine/questions" element={<RefineQuestions />} />
          <Route path="/project/:dirName/refine/draft" element={<RefineDraft />} />

          {/* Workstream C: Save/Export + Publish + Settings */}
          <Route path="/project/:dirName/output" element={<SaveExport />} />
          <Route path="/project/:dirName/publish" element={<PublishReview />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </ProjectRefineProvider>
    </BrowserRouter>
  )
}
