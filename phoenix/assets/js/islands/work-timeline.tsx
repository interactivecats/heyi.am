import { createRoot } from 'react-dom/client';
import { WorkTimeline } from '@heyiam/ui';
import type { Session } from '@heyiam/ui';
import { fetchProjectSessions, fetchSessionData } from './fetch-session-data';

export function mount() {
  // Project-level timelines (multiple sessions)
  const projectContainers = document.querySelectorAll<HTMLElement>('[data-work-timeline]');
  projectContainers.forEach(async (container) => {
    const username = container.dataset.username;
    const slug = container.dataset.projectSlug;
    if (!username || !slug) return;

    try {
      const sessions = await fetchProjectSessions(username, slug);
      mountTimeline(container, sessions, (session) => {
        window.location.href = `/s/${session.id}`;
      });
    } catch (err) {
      console.error('[work-timeline] Failed to mount:', err);
      showError(container);
    }
  });

  // Single-session timelines (on session case study page)
  const sessionContainers = document.querySelectorAll<HTMLElement>('[data-work-timeline-session]');
  sessionContainers.forEach(async (container) => {
    const token = container.dataset.token;
    if (!token) return;

    try {
      const session = await fetchSessionData(token);
      mountTimeline(container, [session as Session]);
    } catch (err) {
      console.error('[work-timeline-session] Failed to mount:', err);
      showError(container);
    }
  });
}

function mountTimeline(
  container: HTMLElement,
  sessions: Session[],
  onSessionClick?: (session: Session) => void,
) {
  container.replaceChildren();
  const target = document.createElement('div');
  container.appendChild(target);

  const root = createRoot(target);
  root.render(
    <WorkTimeline sessions={sessions} onSessionClick={onSessionClick} />,
  );
}

function showError(container: HTMLElement) {
  container.replaceChildren();
  const p = document.createElement('p');
  p.style.cssText = 'color: var(--on-surface-variant); font-size: 0.75rem;';
  p.textContent = 'Could not load timeline';
  container.appendChild(p);
}
