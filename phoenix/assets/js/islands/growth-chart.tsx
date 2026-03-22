import { createRoot } from 'react-dom/client';
import { GrowthChart } from '@heyiam/ui';
import type { Session } from '@heyiam/ui';
import { fetchProjectSessions } from './fetch-session-data';

export function mount() {
  const containers = document.querySelectorAll<HTMLElement>('[data-growth-chart]');

  containers.forEach(async (container) => {
    const username = container.dataset.username;
    const slug = container.dataset.projectSlug;
    const totalLoc = parseInt(container.dataset.totalLoc || '0', 10);
    const totalFiles = parseInt(container.dataset.totalFiles || '0', 10);
    if (!username || !slug) return;

    try {
      const sessions = await fetchProjectSessions(username, slug);
      container.replaceChildren();
      const target = document.createElement('div');
      container.appendChild(target);

      const root = createRoot(target);
      root.render(
        <GrowthChart
          sessions={sessions as Session[]}
          totalLoc={totalLoc}
          totalFiles={totalFiles}
          onSessionClick={(session) => {
            window.location.href = `/s/${session.id}`;
          }}
        />,
      );
    } catch (err) {
      console.error('[growth-chart] Failed to mount:', err);
      container.replaceChildren();
      const p = document.createElement('p');
      p.style.cssText = 'color: var(--on-surface-variant); font-size: 0.75rem;';
      p.textContent = 'Could not load chart';
      container.appendChild(p);
    }
  });
}
