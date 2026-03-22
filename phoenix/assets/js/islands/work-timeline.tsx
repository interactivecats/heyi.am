import { createRoot } from 'react-dom/client';
import { WorkTimeline } from '@heyiam/ui';
import type { Session } from '@heyiam/ui';

export function mount() {
  const containers = document.querySelectorAll<HTMLElement>('[data-work-timeline]');

  containers.forEach((container) => {
    const dataScript = container.querySelector('script[type="application/json"]');
    if (!dataScript?.textContent) return;

    try {
      const data = JSON.parse(dataScript.textContent) as { sessions: Session[] };
      const target = document.createElement('div');
      container.appendChild(target);

      const root = createRoot(target);
      root.render(
        <WorkTimeline
          sessions={data.sessions}
          onSessionClick={(session) => {
            window.location.href = `/s/${session.id}`;
          }}
        />,
      );
    } catch {
      // Page still works without the timeline SVG
    }
  });
}
