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

/** Read theme from data attributes injected by the Liquid render engine. */
function detectTheme(): { isDark: boolean; accentColor?: string } {
  const wrapper = document.querySelector('[data-accent]');
  if (wrapper) {
    return {
      isDark: wrapper.getAttribute('data-mode') === 'dark',
      accentColor: wrapper.getAttribute('data-accent') || undefined,
    };
  }
  // Fallback: detect from body background luminance
  const bg = window.getComputedStyle(document.body).backgroundColor;
  const match = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) return { isDark: false };
  const [, r, g, b] = match.map(Number);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return { isDark: luminance < 0.5 };
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

  // Build session page URL based on context:
  // - Local HTML export: data-session-base-url → ./sessions/{slug}.html
  // - Phoenix-served: data-username + data-project-slug → /@user/project/session-slug
  const projectEl = document.querySelector('.heyiam-project');
  const baseUrl = projectEl?.getAttribute('data-session-base-url');
  let sessionPageUrl: string | undefined;
  if (baseUrl) {
    const slug = active.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80) || 'untitled';
    sessionPageUrl = `${baseUrl}/${slug}.html`;
  } else {
    const username = projectEl?.getAttribute('data-username');
    const projectSlug = projectEl?.getAttribute('data-project-slug');
    const sessionSlug = (active as Record<string, unknown>).slug as string | undefined;
    if (username && projectSlug && sessionSlug) {
      sessionPageUrl = `/@${username}/${projectSlug}/${sessionSlug}`;
    }
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
  const { isDark, accentColor } = detectTheme();

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
        isDark,
        accentColor,
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
        isDark,
        accentColor,
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

  // Template animations (replaces inline <script> tags stripped by sanitizer)
  mountCounterAnimations();
  mountScrollReveals();
  mountBarAnimations();

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

// ── Template animation behaviors ────────────────────────────────
// These replace the inline <script> tags that were in each Liquid template.
// The sanitizer strips inline scripts, so these run from the trusted mount.js.

const REDUCED_MOTION = typeof window !== 'undefined'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Counter animation — animate numeric elements from 0 to their target value.
 * Selects: [data-target], [data-count-to] on .counter, .stat-value, .stat-number, etc.
 */
function mountCounterAnimations(): void {
  const selectors = [
    '.counter[data-target]',
    '.stat-value[data-target]',
    '.stat-number[data-target]',
    '.value[data-target]',
    '[data-count-to]',
    '.dl-stat-number[data-target]',
    '[data-animate][data-target]',
  ];
  const els = document.querySelectorAll<HTMLElement>(selectors.join(','));
  if (els.length === 0) return;

  function formatNumber(n: number, fmt: string): string {
    if (fmt === 'comma') return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    if (fmt === 'decimal' || fmt === '1') return n.toFixed(1);
    return Math.round(n).toString();
  }

  function animateCounter(el: HTMLElement) {
    const target = parseFloat(el.getAttribute('data-target') ?? el.getAttribute('data-count-to') ?? '0');
    const fmt = el.getAttribute('data-format') ?? '';
    const suffix = el.getAttribute('data-suffix') ?? '';
    const isDecimal = fmt === 'decimal' || fmt === '1';

    if (REDUCED_MOTION) {
      el.textContent = formatNumber(target, fmt) + suffix;
      return;
    }

    const duration = 1200;
    let startTime: number | null = null;

    function step(timestamp: number) {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
      const current = isDecimal ? (eased * target) : Math.round(eased * target);
      el.textContent = formatNumber(current, fmt) + suffix;
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        animateCounter(entry.target as HTMLElement);
        observer.unobserve(entry.target);
      }
    }
  }, { threshold: 0.3 });

  els.forEach((el) => observer.observe(el));
}

/**
 * Scroll reveal — add .visible class when elements scroll into view.
 * Covers all template-specific reveal classes.
 */
function mountScrollReveals(): void {
  const selectors = [
    '.fade-in', '.fade-up', '.reveal',
    '.section-reveal',
    '.sc-section', '.sc-stagger',
    '.mono-section',
    '.ember-section',
    '.radar-section',
    '.cos-section',
    '.strata-layer',
    '.dl-bounce',
    '.vd-section',
  ];
  const els = document.querySelectorAll<HTMLElement>(selectors.join(','));
  if (els.length === 0) return;

  if (REDUCED_MOTION) {
    els.forEach((el) => el.classList.add('visible'));
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        (entry.target as HTMLElement).classList.add('visible');
        observer.unobserve(entry.target);
      }
    }
  }, { threshold: 0.15 });

  els.forEach((el) => observer.observe(el));
}

/**
 * Bar width animation — animate bar fills to their data-specified width.
 * Selects: [data-width], [data-bar-width], [data-target-width]
 */
function mountBarAnimations(): void {
  const els = document.querySelectorAll<HTMLElement>(
    '[data-width], [data-bar-width], [data-target-width]',
  );
  if (els.length === 0) return;

  if (REDUCED_MOTION) {
    els.forEach((el) => {
      const w = el.getAttribute('data-width') ?? el.getAttribute('data-bar-width') ?? el.getAttribute('data-target-width') ?? '';
      if (w) el.style.width = w.includes('%') ? w : `${w}%`;
    });
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        const el = entry.target as HTMLElement;
        const w = el.getAttribute('data-width') ?? el.getAttribute('data-bar-width') ?? el.getAttribute('data-target-width') ?? '';
        if (w) {
          el.style.transition = 'width 0.6s ease-out';
          el.style.width = w.includes('%') ? w : `${w}%`;
        }
        observer.unobserve(el);
      }
    }
  }, { threshold: 0.2 });

  els.forEach((el) => observer.observe(el));
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
