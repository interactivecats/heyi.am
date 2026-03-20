import './App.css'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { SessionsProvider } from './SessionsContext'
import { SessionList } from './components/SessionList'
import { Settings } from './components/Settings'
import { SessionDetail } from './components/SessionDetail'
import { EnhanceFlow } from './components/EnhanceFlow'
import { SessionEditorPage } from './components/SessionEditorPage'

function App() {
  return (
    <BrowserRouter>
      <SessionsProvider>
        <Routes>
          <Route path="/" element={<SessionList />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/session/:id" element={<SessionDetail />} />
          <Route path="/session/:id/enhance" element={<EnhanceFlow />} />
          <Route path="/session/:id/edit" element={<SessionEditorPage />} />
        </Routes>
      </SessionsProvider>
    </BrowserRouter>
  )
}

export default App
