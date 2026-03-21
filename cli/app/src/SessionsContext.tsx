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
});

export function useSessionsContext() {
  return useContext(SessionsContext);
}

function toProject(ap: ApiProject): Project & { dirName: string } {
  return {
    name: ap.name,
    dirName: ap.dirName,
    sessionCount: ap.sessionCount,
    description: ap.description,
  };
}

export function SessionsProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Array<Project & { dirName: string }>>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeProject, setActiveProject] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1: Load projects on mount (cheap — just directory listing)
  useEffect(() => {
    let cancelled = false;

    fetchProjects()
      .then((apiProjects) => {
        if (cancelled) return;
        const mapped = apiProjects.map(toProject);
        setProjects(mapped);
        setLoading(false);

        // Auto-select first project
        if (mapped.length > 0) {
          setActiveProject(mapped[0].dirName);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load projects');
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, []);

  // Step 2: Load sessions when active project changes (lazy)
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
    }}>
      {children}
    </SessionsContext.Provider>
  );
}
