/**
 * Mount script for @heyiam/ui visualizations.
 *
 * Finds data-* mount points in the DOM and renders interactive React
 * components into them. Session data is embedded as JSON in data-sessions
 * attributes — no API calls needed. The body HTML is self-contained.
 *
 * Mount points:
 *   <div data-work-timeline data-sessions='[...]' />
 *   <div data-growth-chart data-sessions='[...]' data-total-loc="800" data-total-files="30" />
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import { WorkTimeline } from './WorkTimeline';
import { GrowthChart } from './GrowthChart';
import type { Session } from './types';

function parseSessions(el: HTMLElement): Session[] {
  const raw = el.dataset.sessions;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Mount all visualization components found in the current document.
 */
export function mountVisualizations(): void {
  // Work Timeline
  document.querySelectorAll<HTMLElement>('[data-work-timeline]').forEach((el) => {
    const sessions = parseSessions(el);
    if (sessions.length === 0) return;
    createRoot(el).render(
      React.createElement(WorkTimeline, { sessions, maxHeight: 300 }),
    );
  });

  // Growth Chart
  document.querySelectorAll<HTMLElement>('[data-growth-chart]').forEach((el) => {
    const sessions = parseSessions(el);
    if (sessions.length === 0) return;
    const totalLoc = parseInt(el.dataset.totalLoc || '0', 10);
    const totalFiles = parseInt(el.dataset.totalFiles || '0', 10);
    createRoot(el).render(
      React.createElement(GrowthChart, { sessions, totalLoc, totalFiles }),
    );
  });
}

/**
 * Auto-mount on DOMContentLoaded when loaded as a standalone script.
 */
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountVisualizations);
  } else {
    mountVisualizations();
  }
}
