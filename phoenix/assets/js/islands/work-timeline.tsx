import { createRoot } from 'react-dom/client';
import { WorkTimeline } from '@heyiam/ui';
import type { Session } from '@heyiam/ui';
import { fetchProjectSessions } from './fetch-session-data';

export function mount() {
  const containers = document.querySelectorAll<HTMLElement>('[data-work-timeline]');

  containers.forEach(async (container) => {
    const username = container.dataset.username;
    const slug = container.dataset.projectSlug;
    if (!username || !slug) return;

    try {
      const sessions = await fetchProjectSessions(username, slug);
      container.replaceChildren();
      const target = document.createElement('div');
      container.appendChild(target);

      const root = createRoot(target);
      root.render(
        <WorkTimeline
          sessions={sessions as Session[]}
          onSessionClick={(session) => {
            window.location.href = `/s/${session.id}`;
          }}
        />,
      );
    } catch (err) {
      console.error('[work-timeline] Failed to mount:', err);
      container.replaceChildren();
      const p = document.createElement('p');
      p.style.cssText = 'color: var(--on-surface-variant); font-size: 0.75rem;';
      p.textContent = 'Could not load timeline';
      container.appendChild(p);
    }
  });
}
