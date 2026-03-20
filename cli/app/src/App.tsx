import './App.css'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { SessionList } from './components/SessionList'
import { Settings } from './components/Settings'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<SessionList />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
