import { Routes, Route } from "react-router-dom";
import SessionList from "./components/SessionList";
import ProjectDetail from "./components/ProjectDetail";
import SessionDetail from "./components/SessionDetail";
import SessionEditorPage from "./components/SessionEditorPage";
import Settings from "./components/Settings";

export default function App() {
  return (
    <div className="app-container">
      <Routes>
        <Route path="/" element={<SessionList />} />
        <Route path="/project/:projectName" element={<ProjectDetail />} />
        <Route path="/session/:project/:id" element={<SessionDetail />} />
        <Route path="/session/:project/:id/edit" element={<SessionEditorPage />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </div>
  );
}
