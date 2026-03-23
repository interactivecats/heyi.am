import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import type { Session, Project } from './types';
import { fetchProjects, fetchSessions } from './api';
import type { ApiProject } from './api';

interface SessionsState {
  projects: Project[];
  /** Sessions for the currently selected project (lazy loaded) */
  sessions: Session[];
  /** Which project's sessions are currently loaded */
  activeProject: string | null;
  loading: boolean;
  loadingSessions: boolean;
  error: string | null;
  /** Load sessions for a specific project */
  selectProject: (projectDirName: string) => void;
  /** Merge partial updates into a session (e.g. enhancement results) */
  updateSession: (sessionId: string, updates: Partial<Session>) => void;
  /** Re-fetch sessions for the active project (e.g. after enhancement saves) */
  refreshSessions: () => void;
}

const SessionsContext = createContext<SessionsState>({
  projects: [],
  sessions: [],
  activeProject: null,
  loading: true,
  loadingSessions: false,
  error: null,
  selectProject: () => {},
  updateSession: () => {},
  refreshSessions: () => {},
});

export function useSessionsContext() {
  return useContext(SessionsContext);
}

function toProject(ap: ApiProject): Project {
  return {
    name: ap.name,
    dirName: ap.dirName,
    sessionCount: ap.sessionCount,
    description: ap.description,
    totalLoc: ap.totalLoc,
    totalDuration: ap.totalDuration,
    totalFiles: ap.totalFiles,
    skills: ap.skills,
    dateRange: ap.dateRange,
    lastSessionDate: ap.lastSessionDate,
    isPublished: ap.isPublished,
    publishedSessionCount: ap.publishedSessionCount,
    publishedSessions: ap.publishedSessions,
    enhancedAt: ap.enhancedAt,
    totalAgentDuration: ap.totalAgentDuration,
  };
}

export function SessionsProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeProject, setActiveProject] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load projects on mount
  useEffect(() => {
    let cancelled = false;

    fetchProjects()
      .then((apiProjects) => {
        if (cancelled) return;
        setProjects(apiProjects.map(toProject));
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load projects');
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, []);

  // Load sessions only when explicitly requested via selectProject
  useEffect(() => {
    if (!activeProject) return;
    let cancelled = false;

    setLoadingSessions(true);
    fetchSessions(activeProject)
      .then((sess) => {
        if (cancelled) return;
        setSessions(sess);
        setLoadingSessions(false);
      })
      .catch(() => {
        if (cancelled) return;
        setSessions([]);
        setLoadingSessions(false);
      });

    return () => { cancelled = true; };
  }, [activeProject]);

  const selectProject = useCallback((projectDirName: string) => {
    setActiveProject(projectDirName);
  }, []);

  const updateSession = useCallback((sessionId: string, updates: Partial<Session>) => {
    setSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, ...updates } : s)),
    );
  }, []);

  const refreshSessions = useCallback(() => {
    if (!activeProject) return;
    fetchSessions(activeProject)
      .then((sess) => setSessions(sess))
      .catch(() => {});
  }, [activeProject]);

  return (
    <SessionsContext.Provider value={{
      projects,
      sessions,
      activeProject,
      loading,
      loadingSessions,
      error,
      selectProject,
      updateSession,
      refreshSessions,
    }}>
      {children}
    </SessionsContext.Provider>
  );
}
