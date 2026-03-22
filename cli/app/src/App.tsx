import './App.css'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { SessionsProvider } from './SessionsContext'
import { AuthProvider } from './AuthContext'
import { Settings } from './components/Settings'
import { ProjectDashboard } from './components/ProjectDashboard'

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <SessionsProvider>
          <Routes>
            <Route path="/" element={<ProjectDashboard />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/project/:dirName/upload" element={<UploadPlaceholder />} />
          </Routes>
        </SessionsProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}

function UploadPlaceholder() {
  return (
    <div style={{ padding: '2rem', textAlign: 'center', color: '#888' }}>
      <h2>ProjectUploadFlow coming soon</h2>
      <p>Phase 2-4 will build the triage, enhance, and publish flow here.</p>
    </div>
  )
}

export default App
