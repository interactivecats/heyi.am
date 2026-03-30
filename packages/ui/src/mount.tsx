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
 *
 * Session cards:
 *   Elements with [data-session-id] get click handlers that open the overlay.
 */

import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { WorkTimeline } from './WorkTimeline';
import { GrowthChart } from './GrowthChart';
import { SessionOverlay } from './SessionOverlay';
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

// Global session map + overlay state
let allSessions: Map<string, Session> = new Map();
let showOverlay: ((session: Session) => void) | null = null;

/**
 * Overlay root — mounted once, controlled via showOverlay callback.
 */
function OverlayRoot({ sessions }: { sessions: Map<string, Session> }) {
  const [active, setActive] = useState<Session | null>(null);

  // Expose the show function globally so click handlers can trigger it
  showOverlay = (session: Session) => setActive(session);

  if (!active) return null;

  // Only link to session pages when running in a local HTML export
  // (indicated by data-session-base-url on the project container).
  // On Phoenix-served pages, session HTML files don't exist.
  const projectEl = document.querySelector('[data-session-base-url]');
  const baseUrl = projectEl?.getAttribute('data-session-base-url');
  let sessionPageUrl: string | undefined;
  if (baseUrl) {
    const slug = active.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80) || 'untitled';
    sessionPageUrl = `${baseUrl}/${slug}.html`;
  }

  return (
    <SessionOverlay
      session={active}
      sessionPageUrl={sessionPageUrl}
      onClose={() => setActive(null)}
    />
  );
}

/**
 * Mount all visualization components found in the current document.
 */
export function mountVisualizations(): void {
  // Work Timeline
  document.querySelectorAll<HTMLElement>('[data-work-timeline]').forEach((el) => {
    const sessions = parseSessions(el);
    if (sessions.length === 0) return;
    // Register all sessions
    for (const s of sessions) allSessions.set(s.id, s);
    createRoot(el).render(
      React.createElement(WorkTimeline, {
        sessions,
        maxHeight: 300,
        onSessionClick: (session: Session) => {
          if (showOverlay) showOverlay(session);
        },
      }),
    );
  });

  // Growth Chart
  document.querySelectorAll<HTMLElement>('[data-growth-chart]').forEach((el) => {
    const sessions = parseSessions(el);
    if (sessions.length === 0) return;
    for (const s of sessions) allSessions.set(s.id, s);
    const totalLoc = parseInt(el.dataset.totalLoc || '0', 10);
    const totalFiles = parseInt(el.dataset.totalFiles || '0', 10);
    createRoot(el).render(
      React.createElement(GrowthChart, {
        sessions,
        totalLoc,
        totalFiles,
        onSessionClick: (session: Session) => {
          if (showOverlay) showOverlay(session);
        },
      }),
    );
  });

  // Session card click handlers
  document.querySelectorAll<HTMLElement>('[data-session-id]').forEach((el) => {
    el.style.cursor = 'pointer';
    el.addEventListener('click', (e) => {
      const sessionId = el.dataset.sessionId;
      if (!sessionId) return;
      const session = allSessions.get(sessionId);
      if (session && showOverlay) {
        e.preventDefault();
        showOverlay(session);
      }
    });
  });

  // Mount overlay root
  if (allSessions.size > 0) {
    const overlayEl = document.createElement('div');
    overlayEl.id = 'heyiam-overlay-root';
    document.body.appendChild(overlayEl);
    createRoot(overlayEl).render(
      React.createElement(OverlayRoot, { sessions: allSessions }),
    );
  }
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
