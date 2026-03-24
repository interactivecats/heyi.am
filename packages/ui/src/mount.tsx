/**
 * Mount script for @heyiam/ui visualizations.
 *
 * Finds data-* mount points in the DOM and renders interactive
 * React components into them. Used by both CLI preview and Phoenix
 * public_web — the only difference is the API base URL.
 *
 * Mount points in the body HTML:
 *   <div data-work-timeline data-username="ben" data-project-slug="heyi-am" />
 *   <div data-growth-chart data-username="ben" data-project-slug="heyi-am" />
 *   <div data-directory-heatmap data-username="ben" data-project-slug="heyi-am" />
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import { WorkTimeline } from './WorkTimeline';
import { GrowthChart } from './GrowthChart';
import { DirectoryHeatmap } from './DirectoryHeatmap';

interface MountOptions {
  /** Base URL for API calls (e.g., '/api' for CLI, 'https://heyiam.com/api' for Phoenix) */
  apiBase: string;
}

/**
 * Mount all visualization components found in the current document.
 * Call this after the DOM is ready.
 */
export function mountVisualizations({ apiBase }: MountOptions): void {
  // Work Timeline
  document.querySelectorAll<HTMLElement>('[data-work-timeline]').forEach(async (el) => {
    const projectSlug = el.dataset.projectSlug;
    if (!projectSlug) return;

    try {
      const res = await fetch(`${apiBase}/projects/${encodeURIComponent(projectSlug)}/sessions`);
      if (!res.ok) return;
      const sessions = await res.json();
      createRoot(el).render(React.createElement(WorkTimeline, { sessions, maxHeight: 300 }));
    } catch {
      // Viz is non-fatal — mount point stays empty
    }
  });

  // Growth Chart
  document.querySelectorAll<HTMLElement>('[data-growth-chart]').forEach(async (el) => {
    const projectSlug = el.dataset.projectSlug;
    if (!projectSlug) return;

    try {
      const res = await fetch(`${apiBase}/projects/${encodeURIComponent(projectSlug)}/sessions`);
      if (!res.ok) return;
      const { sessions, project } = await res.json();
      if (Array.isArray(sessions)) {
        createRoot(el).render(
          React.createElement(GrowthChart, {
            sessions,
            totalLoc: project?.totalLoc ?? 0,
            totalFiles: project?.totalFiles ?? 0,
          })
        );
      }
    } catch {
      // Non-fatal
    }
  });

  // Directory Heatmap
  document.querySelectorAll<HTMLElement>('[data-directory-heatmap]').forEach(async (el) => {
    const projectSlug = el.dataset.projectSlug;
    if (!projectSlug) return;

    try {
      const res = await fetch(`${apiBase}/projects/${encodeURIComponent(projectSlug)}/sessions`);
      if (!res.ok) return;
      const { sessions, projectDirName } = await res.json();
      if (Array.isArray(sessions)) {
        createRoot(el).render(
          React.createElement(DirectoryHeatmap, { sessions, projectDirName: projectDirName ?? projectSlug })
        );
      }
    } catch {
      // Non-fatal
    }
  });
}

/**
 * Auto-mount on DOMContentLoaded when loaded as a standalone script.
 * The API base URL is read from a meta tag or defaults to '/api'.
 */
if (typeof document !== 'undefined') {
  const autoMount = () => {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="heyiam-api-base"]');
    const apiBase = meta?.content ?? '/api';
    mountVisualizations({ apiBase });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoMount);
  } else {
    autoMount();
  }
}
