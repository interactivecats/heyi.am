import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { fetchProjectDetail, saveProjectSettings } from "../api";
import type { ProjectDetail as ProjectDetailType } from "../types";
import SessionCard from "./SessionCard";

export default function ProjectDetail() {
  const { projectName } = useParams<{ projectName: string }>();
  const [project, setProject] = useState<ProjectDetailType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Editable fields
  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");
  const [visible, setVisible] = useState(true);
  const [featuredSessions, setFeaturedSessions] = useState<string[]>([]);
  const [featuredQuote, setFeaturedQuote] = useState("");

  // Save state
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!projectName) return;
    fetchProjectDetail(projectName)
      .then((data) => {
        setProject(data);
        // Initialize from settings, falling back to detected values
        setDisplayName(data.settings.displayName || data.displayName || "");
        setDescription(data.settings.description || "");
        setVisible(data.settings.visible !== false);
        setFeaturedSessions(data.settings.featuredSessions || []);
        setFeaturedQuote(data.settings.featuredQuote || "");
      })
      .catch(() => setError("Project not found"))
      .finally(() => setLoading(false));
  }, [projectName]);

  function markDirty() {
    setDirty(true);
    setSaveMessage(null);
  }

  async function handleSave() {
    if (!projectName || saving) return;
    setSaving(true);
    try {
      await saveProjectSettings(projectName, {
        displayName,
        description,
        visible,
        featuredSessions,
        featuredQuote,
      });
      setDirty(false);
      setSaveMessage("Saved");
      setTimeout(() => setSaveMessage(null), 3000);
    } catch {
      setSaveMessage("Save failed — try again");
    } finally {
      setSaving(false);
    }
  }

  function toggleFeatured(sessionId: string) {
    markDirty();
    setFeaturedSessions((prev) => {
      if (prev.includes(sessionId)) {
        return prev.filter((id) => id !== sessionId);
      }
      if (prev.length >= 6) return prev;
      return [...prev, sessionId];
    });
  }

  if (loading) {
    return (
      <>
        <header className="app-header">
          <Link to="/" className="app-header__title">heyi<b>.</b>am</Link>
        </header>
        <div className="pd-loading">Loading project...</div>
      </>
    );
  }

  if (error || !project) {
    return (
      <>
        <header className="app-header">
          <Link to="/" className="app-header__title">heyi<b>.</b>am</Link>
        </header>
        <div className="error-state">{error || "Project not found"}</div>
      </>
    );
  }

  const publishedSessions = project.sessions.filter((s) => s.shared);
  const unpublishedSessions = project.sessions.filter((s) => !s.shared);
  const sortedPublished = [...publishedSessions].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
  const sortedUnpublished = [...unpublishedSessions].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  return (
    <>
      <header className="app-header">
        <Link to="/" className="app-header__title">heyi<b>.</b>am</Link>
      </header>

      <Link to="/" className="pd-back">&larr; All projects</Link>

      <div className="pd">
        {/* Stats */}
        <div className="pd-stats">
          <div className="pd-stats__item">
            <div className="pd-stats__value">{project.stats.totalSessions}</div>
            <div className="pd-stats__label">sessions</div>
          </div>
          <div className="pd-stats__item">
            <div className="pd-stats__value">{project.stats.publishedSessions}</div>
            <div className="pd-stats__label">published</div>
          </div>
          <div className="pd-stats__item">
            <div className="pd-stats__value">{project.stats.totalDuration}</div>
            <div className="pd-stats__label">minutes</div>
          </div>
        </div>

        {/* Settings */}
        <div className="pd-settings">
          <div className="pd-field">
            <label className="pd-field__label">Project name</label>
            <input
              className="pd-field__input"
              type="text"
              value={displayName}
              onChange={(e) => { setDisplayName(e.target.value); markDirty(); }}
              maxLength={80}
              placeholder="Project name"
            />
          </div>

          <div className="pd-field">
            <label className="pd-field__label">Description</label>
            <textarea
              className="pd-field__textarea"
              value={description}
              onChange={(e) => { setDescription(e.target.value); markDirty(); }}
              maxLength={300}
              rows={2}
              placeholder="One-liner about this project"
            />
          </div>

          <div className="pd-field pd-field--row">
            <label className="pd-field__label">Show on portfolio</label>
            <button
              className={`pd-toggle ${visible ? "pd-toggle--on" : ""}`}
              onClick={() => { setVisible(!visible); markDirty(); }}
              aria-pressed={visible}
            >
              {visible ? "Visible" : "Hidden"}
            </button>
          </div>

          <div className="pd-field">
            <label className="pd-field__label">Featured quote</label>
            <textarea
              className="pd-field__textarea"
              value={featuredQuote}
              onChange={(e) => { setFeaturedQuote(e.target.value); markDirty(); }}
              maxLength={300}
              rows={2}
              placeholder="A quote from your developer takes"
            />
          </div>
        </div>

        {/* Save bar */}
        {dirty && (
          <div className="pd-save-bar">
            <button
              className="pd-save-bar__btn"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "Saving..." : "Save project settings"}
            </button>
          </div>
        )}
        {saveMessage && (
          <div className={`pd-save-msg ${saveMessage === "Saved" ? "pd-save-msg--ok" : "pd-save-msg--err"}`}>
            {saveMessage}
          </div>
        )}

        {/* Published sessions */}
        {sortedPublished.length > 0 && (
          <div className="pd-section">
            <div className="pd-section__header">
              <span>Published</span>
              <span className="pd-section__count">{sortedPublished.length}</span>
            </div>
            {sortedPublished.map((s) => (
              <div key={s.id} className="pd-session-row">
                <button
                  className={`pd-star ${featuredSessions.includes(s.id) ? "pd-star--on" : ""}`}
                  onClick={() => toggleFeatured(s.id)}
                  title={featuredSessions.includes(s.id) ? "Remove from featured" : "Feature on portfolio"}
                >
                  {featuredSessions.includes(s.id) ? "★" : "☆"}
                </button>
                <SessionCard
                  session={s}
                  projectName={project.name}
                  duration={s.duration}
                />
              </div>
            ))}
            {featuredSessions.length > 0 && (
              <div className="pd-featured-count">
                {featuredSessions.length} of {sortedPublished.length} featured
              </div>
            )}
          </div>
        )}

        {/* Unpublished sessions */}
        {sortedUnpublished.length > 0 && (
          <div className="pd-section">
            <div className="pd-section__header">
              <span>Not published</span>
              <span className="pd-section__count">{sortedUnpublished.length}</span>
            </div>
            {sortedUnpublished.map((s) => (
              <SessionCard
                key={s.id}
                session={s}
                projectName={project.name}
                duration={s.duration}
              />
            ))}
          </div>
        )}

        <div className="pd-path">
          {project.path}
        </div>
      </div>
    </>
  );
}
