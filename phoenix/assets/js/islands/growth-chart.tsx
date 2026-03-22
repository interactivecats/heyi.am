import { createRoot } from 'react-dom/client';
import { GrowthChart } from '@heyiam/ui';
import type { Session } from '@heyiam/ui';

export function mount() {
  const containers = document.querySelectorAll<HTMLElement>('[data-growth-chart]');

  containers.forEach((container) => {
    const dataScript = container.querySelector('script[type="application/json"]');
    if (!dataScript?.textContent) return;

    try {
      const data = JSON.parse(dataScript.textContent) as {
        sessions: Session[];
        totalLoc: number;
        totalFiles: number;
      };
      const target = document.createElement('div');
      container.appendChild(target);

      const root = createRoot(target);
      root.render(
        <GrowthChart
          sessions={data.sessions}
          totalLoc={data.totalLoc}
          totalFiles={data.totalFiles}
          onSessionClick={(session) => {
            window.location.href = `/s/${session.id}`;
          }}
        />,
      );
    } catch (err) {
      console.error('[growth-chart] Failed to mount:', err);
    }
  });
}
