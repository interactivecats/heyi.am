import './App.css'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { SessionList } from './components/SessionList'
import { Settings } from './components/Settings'
import { SessionDetail } from './components/SessionDetail'
import { EnhanceFlow } from './components/EnhanceFlow'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<SessionList />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/session/:id" element={<SessionDetail />} />
        <Route path="/session/:id/enhance" element={<EnhanceFlow />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
