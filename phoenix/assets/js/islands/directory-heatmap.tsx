import { createRoot } from 'react-dom/client';
import { DirectoryHeatmap } from '@heyiam/ui';
import type { Session } from '@heyiam/ui';
import { fetchProjectSessions } from './fetch-session-data';

export function mount() {
  const containers = document.querySelectorAll<HTMLElement>('[data-directory-heatmap]');

  containers.forEach(async (container) => {
    const username = container.dataset.username;
    const slug = container.dataset.projectSlug;
    const dirName = container.dataset.projectDir || '';
    if (!username || !slug) return;

    try {
      const sessions = await fetchProjectSessions(username, slug);
      container.replaceChildren();
      const target = document.createElement('div');
      container.appendChild(target);

      const root = createRoot(target);
      root.render(
        <DirectoryHeatmap
          sessions={sessions as Session[]}
          projectDirName={dirName}
        />,
      );
    } catch (err) {
      console.error('[directory-heatmap] Failed to mount:', err);
      container.replaceChildren();
      const p = document.createElement('p');
      p.style.cssText = 'color: var(--on-surface-variant); font-size: 0.75rem;';
      p.textContent = 'Could not load heatmap';
      container.appendChild(p);
    }
  });
}
