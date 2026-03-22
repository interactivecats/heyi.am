import { createRoot } from 'react-dom/client';
import { DirectoryHeatmap } from '@heyiam/ui';
import type { Session } from '@heyiam/ui';

export function mount() {
  const containers = document.querySelectorAll<HTMLElement>('[data-directory-heatmap]');

  containers.forEach((container) => {
    const dataScript = container.querySelector('script[type="application/json"]');
    if (!dataScript?.textContent) return;

    try {
      const data = JSON.parse(dataScript.textContent) as {
        sessions: Session[];
        projectDirName: string;
      };
      const target = document.createElement('div');
      container.appendChild(target);

      const root = createRoot(target);
      root.render(
        <DirectoryHeatmap
          sessions={data.sessions}
          projectDirName={data.projectDirName}
        />,
      );
    } catch (err) {
      console.error('[directory-heatmap] Failed to mount:', err);
    }
  });
}
