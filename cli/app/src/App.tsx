import './App.css'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { SessionsProvider } from './SessionsContext'
import { AuthProvider } from './AuthContext'
import { Settings } from './components/Settings'
import { ProjectDashboard } from './components/ProjectDashboard'
import { ProjectUploadFlow } from './components/ProjectUploadFlow'
import { TimePage } from './components/TimePage'

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <SessionsProvider>
          <Routes>
            <Route path="/" element={<ProjectDashboard />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/project/:dirName/upload" element={<ProjectUploadFlow />} />
            <Route path="/time" element={<TimePage />} />
          </Routes>
        </SessionsProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
