import React from 'react';
import type { PortfolioRenderData, PortfolioProject } from '../types.js';

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function ProjectCard({ project }: { project: PortfolioProject }) {
  return (
    <article className="portfolio-project-card">
      <h3 className="project-card-title">
        <a href={`/p/${project.slug}`}>{project.title}</a>
      </h3>
      <p className="project-card-narrative">{project.narrative}</p>
      <div className="project-card-stats">
        <span className="stat">
          <span className="stat-value">{project.publishedCount}</span>
          <span className="stat-label">sessions</span>
        </span>
        <span className="stat">
          <span className="stat-value">{project.totalLoc.toLocaleString()}</span>
          <span className="stat-label">loc</span>
        </span>
        <span className="stat">
          <span className="stat-value">{formatDuration(project.totalDurationMinutes)}</span>
          <span className="stat-label">active</span>
        </span>
        <span className="stat">
          <span className="stat-value">{project.totalFilesChanged}</span>
          <span className="stat-label">files</span>
        </span>
      </div>
      {project.skills.length > 0 && (
        <div className="project-card-skills">
          {project.skills.map((skill) => (
            <span key={skill} className="skill-chip">{skill}</span>
          ))}
        </div>
      )}
    </article>
  );
}

export function PortfolioPage({ data }: { data: PortfolioRenderData }) {
  const { user, projects } = data;

  return (
    <div className="portfolio-page" data-render-version="1" data-template="editorial">
      <header className="portfolio-hero">
        <h1 className="portfolio-display-name">{user.displayName}</h1>
        {user.bio && <p className="portfolio-bio">{user.bio}</p>}
        <div className="portfolio-meta">
          {user.location && (
            <span className="portfolio-location">{user.location}</span>
          )}
          {user.status && (
            <span className="portfolio-status">{user.status}</span>
          )}
        </div>
      </header>

      {projects.length > 0 && (
        <section className="portfolio-projects">
          <h2 className="section-heading">Projects</h2>
          <div className="portfolio-projects-grid">
            {projects.map((project) => (
              <ProjectCard key={project.slug} project={project} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
