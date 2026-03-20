import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchProjects } from "../api";
import type { Project } from "../types";
import SessionCard from "./SessionCard";
import { SkeletonCard } from "./Skeleton";

function formatDateRange(sessions: { date: string }[]): string {
  if (sessions.length === 0) return "";
  const dates = sessions.map((s) => new Date(s.date));
  const oldest = new Date(Math.min(...dates.map((d) => d.getTime())));
  const newest = new Date(Math.max(...dates.map((d) => d.getTime())));
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (oldest.toDateString() === newest.toDateString()) return fmt(newest);
  return `${fmt(oldest)} – ${fmt(newest)}`;
}

export default function SessionList() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem("ccs_collapsed_projects") || "{}");
    } catch {
      return {};
    }
  });
  const hasApiKey = !!localStorage.getItem("anthropic_api_key");
  const [bannerDismissed, setBannerDismissed] = useState(
    () => !!localStorage.getItem("ccs_banner_dismissed")
  );

  useEffect(() => {
    fetchProjects()
      .then(setProjects)
      .catch(() => setError("Something went wrong. Try refreshing."))
      .finally(() => setLoading(false));
  }, []);

  function toggleProject(name: string) {
    setCollapsed((prev) => {
      const next = { ...prev, [name]: !prev[name] };
      localStorage.setItem("ccs_collapsed_projects", JSON.stringify(next));
      return next;
    });
  }

  // Sort projects by most recent session
  const sorted = [...projects].sort((a, b) => {
    const aDate = a.sessions[0]?.date ?? "";
    const bDate = b.sessions[0]?.date ?? "";
    return new Date(bDate).getTime() - new Date(aDate).getTime();
  });

  // Auto-expand the most recent project, collapse the rest on first load
  const totalSessions = projects.reduce((n, p) => n + p.sessions.length, 0);

  return (
    <>
      <header className="app-header">
        <span className="app-header__title">heyi<b>.</b>am</span>
        <Link to="/settings" className="app-header__settings" title="Settings">
          &#9881;
        </Link>
      </header>

      {!hasApiKey && !bannerDismissed && (
        <div className="setup-banner">
          <div className="setup-banner__text">
            <strong>Add your Anthropic API key</strong> to enable AI summaries, tutorials, and highlights.
          </div>
          <Link to="/settings" className="setup-banner__action">
            Set up &rarr;
          </Link>
          <button
            className="setup-banner__dismiss"
            onClick={() => {
              setBannerDismissed(true);
              localStorage.setItem("ccs_banner_dismissed", "1");
            }}
          >
            Skip
          </button>
        </div>
      )}

      {loading && (
        <div>
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      )}

      {error && <div className="error-state">{error}</div>}

      {!loading && !error && totalSessions === 0 && (
        <div className="empty-state">
          <div className="empty-state__title">No sessions found</div>
          <div className="empty-state__description">
            Claude Code sessions from ~/.claude/projects will appear here
          </div>
        </div>
      )}

      {!loading && !error && totalSessions > 0 && (
        <div className="browse-layout">
          {/* Sidebar */}
          <div className="browse-sidebar">
            <div className="browse-sidebar__title">Projects</div>
            {sorted.map((project, idx) => (
              <Link
                key={project.name}
                to={`/project/${project.name}`}
                className="browse-sidebar__item"
              >
                <span
                  className="browse-sidebar__dot"
                  style={{ background: ['#7C5CFC', '#06B6A0', '#F9507A', '#F29D0B', '#3B82F6'][idx % 5] }}
                />
                {project.displayName || project.name.split("-").pop()}
              </Link>
            ))}
          </div>

          {/* Main content */}
          <div>
            {sorted.map((project, idx) => {
              const isCollapsed = collapsed[project.name] ?? (idx > 0 && sorted.length > 2);
              const sessions = [...project.sessions].sort(
                (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
              );

              return (
                <div key={project.name} className="project-group">
                  <div className="project-group__header">
                    <button
                      className="project-group__toggle"
                      onClick={() => toggleProject(project.name)}
                      aria-expanded={!isCollapsed}
                      aria-label={isCollapsed ? "Expand" : "Collapse"}
                    >
                      {isCollapsed ? "▸" : "▾"}
                    </button>
                    <Link to={`/project/${project.name}`} className="project-group__name">
                      {project.displayName || project.name.split("-").pop()}
                    </Link>
                    <span className="project-group__meta">
                      {sessions.length} session{sessions.length !== 1 ? "s" : ""}
                      <span className="separator">&middot;</span>
                      {formatDateRange(sessions)}
                    </span>
                  </div>

                  {!isCollapsed && (
                    <div className="project-group__sessions">
                      {sessions.map((s) => (
                        <SessionCard
                          key={s.id}
                          session={s}
                          projectName={project.name}
                          duration={s.duration}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
