/**
 * Unit tests: DirectoryHeatmap component
 *
 * Tests the 2D grid heatmap (directories x sessions) and collapsible top
 * files list used in the ProjectPreview overlay, including aggregation
 * logic, edge cases, and rendering.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DirectoryHeatmap } from './ProjectUploadFlow';
import type { Session } from '../types';

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'sess-1',
    title: 'Test session',
    date: '2026-03-01',
    durationMinutes: 60,
    linesOfCode: 500,
    turns: 10,
    ...overrides,
  } as Session;
}

// ---------------------------------------------------------------------------
// Empty / edge-case states
// ---------------------------------------------------------------------------

describe('DirectoryHeatmap', () => {
  it('renders empty state when sessions have no filesChanged', () => {
    const sessions = [makeSession({ filesChanged: undefined })];
    render(<DirectoryHeatmap sessions={sessions} projectDirName="test" />);
    expect(screen.getByText('No file data available')).toBeTruthy();
  });

  it('renders empty state when sessions array is empty', () => {
    render(<DirectoryHeatmap sessions={[]} projectDirName="test" />);
    expect(screen.getByText('No file data available')).toBeTruthy();
  });

  it('renders empty state when filesChanged is an empty array', () => {
    const sessions = [makeSession({ filesChanged: [] })];
    render(<DirectoryHeatmap sessions={sessions} projectDirName="test" />);
    expect(screen.getByText('No file data available')).toBeTruthy();
  });

  // ---------------------------------------------------------------------------
  // Grid rendering
  // ---------------------------------------------------------------------------

  it('renders a 2D grid with directory rows and session columns', () => {
    const sessions = [
      makeSession({
        id: 'sess-1',
        title: 'S1 Auth',
        filesChanged: [
          { path: 'cli/src/server.ts', additions: 10, deletions: 5, editCount: 30 },
          { path: 'phoenix/lib/router.ex', additions: 8, deletions: 3, editCount: 15 },
        ],
      }),
      makeSession({
        id: 'sess-2',
        title: 'S2 Device',
        filesChanged: [
          { path: 'cli/src/utils.ts', additions: 5, deletions: 2, editCount: 20 },
        ],
      }),
    ];
    const { container } = render(<DirectoryHeatmap sessions={sessions} projectDirName="test" />);

    // Should render heading
    expect(screen.getByText('EDIT HEATMAP BY DIRECTORY')).toBeTruthy();

    // Should render session labels in header
    expect(screen.getByText('S1 Auth')).toBeTruthy();
    expect(screen.getByText('S2 Device')).toBeTruthy();

    // Should render directory labels (2-segment depth now)
    const dirLabels = container.querySelectorAll('.dir-heatmap__dir-label');
    const dirTexts = Array.from(dirLabels).map((el) => el.textContent);
    expect(dirTexts).toContain('cli/src/');
    expect(dirTexts).toContain('phoenix/lib/');

    // Should render cells (2 directories x 2 sessions = 4 cells)
    const cells = container.querySelectorAll('.dir-heatmap__cell');
    expect(cells.length).toBe(4);
  });

  it('renders cells with correct opacity based on edit count', () => {
    const sessions = [
      makeSession({
        id: 'sess-1',
        title: 'S1',
        filesChanged: [
          { path: 'cli/src/server.ts', additions: 10, deletions: 5, editCount: 100 },
        ],
      }),
      makeSession({
        id: 'sess-2',
        title: 'S2',
        filesChanged: [
          { path: 'cli/src/utils.ts', additions: 5, deletions: 2, editCount: 0 },
        ],
      }),
    ];
    const { container } = render(<DirectoryHeatmap sessions={sessions} projectDirName="test" />);

    const cells = container.querySelectorAll('.dir-heatmap__cell');
    // First cell (100 edits = max) should have opacity 0.7
    const firstBg = (cells[0] as HTMLElement).style.background;
    expect(firstBg).toContain('0.7');
  });

  it('shows tooltip with edit count on hover', () => {
    const sessions = [
      makeSession({
        id: 'sess-1',
        title: 'S1 Auth',
        filesChanged: [
          { path: 'cli/src/server.ts', additions: 10, deletions: 5, editCount: 30 },
        ],
      }),
    ];
    const { container } = render(<DirectoryHeatmap sessions={sessions} projectDirName="test" />);

    const cell = container.querySelector('.dir-heatmap__cell') as HTMLElement;
    expect(cell.title).toContain('30 edits');
    expect(cell.title).toContain('cli/src/');
    expect(cell.title).toContain('S1 Auth');
  });

  // ---------------------------------------------------------------------------
  // Aggregation across sessions
  // ---------------------------------------------------------------------------

  it('aggregates edits per directory per session', () => {
    const sessions = [
      makeSession({
        id: 'sess-1',
        title: 'S1',
        filesChanged: [
          { path: 'cli/src/server.ts', additions: 10, deletions: 5, editCount: 20 },
          { path: 'cli/src/utils.ts', additions: 3, deletions: 1, editCount: 12 },
        ],
      }),
    ];
    const { container } = render(<DirectoryHeatmap sessions={sessions} projectDirName="test" />);

    // cli/src/ in sess-1 should have 32 edits total
    const cell = container.querySelector('.dir-heatmap__cell') as HTMLElement;
    expect(cell.title).toContain('32 edits');
  });

  it('falls back to additions + deletions when editCount is missing', () => {
    const sessions = [
      makeSession({
        id: 'sess-1',
        title: 'S1',
        filesChanged: [
          { path: 'cli/src/server.ts', additions: 10, deletions: 5 },
        ],
      }),
    ];
    const { container } = render(<DirectoryHeatmap sessions={sessions} projectDirName="test" />);

    const cell = container.querySelector('.dir-heatmap__cell') as HTMLElement;
    expect(cell.title).toContain('15 edits');
  });

  it('limits directory list to 10 entries', () => {
    const files = Array.from({ length: 15 }, (_, i) => ({
      path: `dir${i}/sub/file.ts`,
      additions: 10,
      deletions: 5,
      editCount: 100 - i,
    }));
    const sessions = [makeSession({ id: 'sess-1', title: 'S1', filesChanged: files })];
    const { container } = render(<DirectoryHeatmap sessions={sessions} projectDirName="test" />);

    const dirLabels = container.querySelectorAll('.dir-heatmap__dir-label');
    expect(dirLabels.length).toBe(10);
  });

  // ---------------------------------------------------------------------------
  // Top files section (collapsible)
  // ---------------------------------------------------------------------------

  it('renders top files in a collapsed details element', () => {
    const sessions = [
      makeSession({
        id: 'sess-1',
        title: 'S1',
        filesChanged: [
          { path: 'cli/src/server.ts', additions: 10, deletions: 5, editCount: 30 },
          { path: 'cli/src/utils.ts', additions: 5, deletions: 2, editCount: 20 },
          { path: 'phoenix/lib/router.ex', additions: 8, deletions: 3, editCount: 15 },
        ],
      }),
    ];
    const { container } = render(<DirectoryHeatmap sessions={sessions} projectDirName="test" />);

    // Should be in a <details> element
    const details = container.querySelector('details');
    expect(details).toBeTruthy();

    // Should be collapsed by default (no "open" attribute)
    expect(details?.hasAttribute('open')).toBe(false);

    // Summary should show total file count
    const summary = container.querySelector('summary');
    expect(summary?.textContent).toContain('of 3 total');

    // Should show file paths
    expect(screen.getByText('cli/src/server.ts')).toBeTruthy();
    expect(screen.getByText('cli/src/utils.ts')).toBeTruthy();
    expect(screen.getByText('phoenix/lib/router.ex')).toBeTruthy();
  });

  it('sorts files by edit count descending', () => {
    const sessions = [
      makeSession({
        id: 'sess-1',
        title: 'S1',
        filesChanged: [
          { path: 'low.ts', additions: 1, deletions: 0, editCount: 5 },
          { path: 'high.ts', additions: 50, deletions: 10, editCount: 100 },
          { path: 'mid.ts', additions: 10, deletions: 5, editCount: 50 },
        ],
      }),
    ];
    const { container } = render(<DirectoryHeatmap sessions={sessions} projectDirName="test" />);

    const filePaths = Array.from(container.querySelectorAll('.dir-heatmap__file-path')).map(
      (el) => el.textContent,
    );
    expect(filePaths).toEqual(['high.ts', 'mid.ts', 'low.ts']);
  });

  // ---------------------------------------------------------------------------
  // Directory extraction (2-segment depth)
  // ---------------------------------------------------------------------------

  it('extracts up to 2 directory segments', () => {
    const sessions = [
      makeSession({
        id: 'sess-1',
        title: 'S1',
        filesChanged: [
          { path: 'cli/app/src/components/File.tsx', additions: 10, deletions: 5, editCount: 20 },
        ],
      }),
    ];
    const { container } = render(<DirectoryHeatmap sessions={sessions} projectDirName="test" />);

    const dir = container.querySelector('.dir-heatmap__dir-label');
    expect(dir?.textContent).toBe('cli/app/');
  });

  it('handles root-level files gracefully', () => {
    const sessions = [
      makeSession({
        id: 'sess-1',
        title: 'S1',
        filesChanged: [
          { path: 'README.md', additions: 5, deletions: 0, editCount: 5 },
        ],
      }),
    ];
    const { container } = render(<DirectoryHeatmap sessions={sessions} projectDirName="test" />);

    const dir = container.querySelector('.dir-heatmap__dir-label');
    expect(dir?.textContent).toBe('/');
  });

  // ---------------------------------------------------------------------------
  // Accessibility
  // ---------------------------------------------------------------------------

  it('uses role=table for the heatmap grid', () => {
    const sessions = [
      makeSession({
        id: 'sess-1',
        title: 'S1',
        filesChanged: [
          { path: 'cli/src/server.ts', additions: 10, deletions: 5, editCount: 30 },
        ],
      }),
    ];
    render(<DirectoryHeatmap sessions={sessions} projectDirName="test" />);

    expect(screen.getByRole('table', { name: 'Directory edit heatmap' })).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Most edited files' })).toBeTruthy();
  });

  it('renders cells with aria-label for screen readers', () => {
    const sessions = [
      makeSession({
        id: 'sess-1',
        title: 'S1 Auth',
        filesChanged: [
          { path: 'cli/src/server.ts', additions: 10, deletions: 5, editCount: 30 },
        ],
      }),
    ];
    const { container } = render(<DirectoryHeatmap sessions={sessions} projectDirName="test" />);

    const cell = container.querySelector('.dir-heatmap__cell') as HTMLElement;
    expect(cell.getAttribute('aria-label')).toBe('cli/src/ in S1 Auth: 30 edits');
  });

  // ---------------------------------------------------------------------------
  // Session title truncation
  // ---------------------------------------------------------------------------

  it('truncates long session titles to ~15 chars', () => {
    const sessions = [
      makeSession({
        id: 'sess-1',
        title: 'A Very Long Session Title That Should Be Truncated',
        filesChanged: [
          { path: 'cli/src/server.ts', additions: 10, deletions: 5, editCount: 30 },
        ],
      }),
    ];
    const { container } = render(<DirectoryHeatmap sessions={sessions} projectDirName="test" />);

    const label = container.querySelector('.dir-heatmap__session-label');
    const text = label?.textContent ?? '';
    expect(text.length).toBeLessThanOrEqual(15);
    expect(text).toContain('\u2026'); // ellipsis
  });

  // ---------------------------------------------------------------------------
  // Edge: skips invalid paths
  // ---------------------------------------------------------------------------

  it('skips files with empty or missing paths', () => {
    const sessions = [
      makeSession({
        id: 'sess-1',
        title: 'S1',
        filesChanged: [
          { path: '', additions: 10, deletions: 5, editCount: 30 },
          { path: 'valid/path/file.ts', additions: 5, deletions: 2, editCount: 20 },
        ],
      }),
    ];
    const { container } = render(<DirectoryHeatmap sessions={sessions} projectDirName="test" />);

    const dirLabels = container.querySelectorAll('.dir-heatmap__dir-label');
    expect(dirLabels.length).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // Grid template columns
  // ---------------------------------------------------------------------------

  it('sets grid-template-columns based on session count', () => {
    const sessions = [
      makeSession({
        id: 'sess-1',
        title: 'S1',
        filesChanged: [
          { path: 'cli/src/server.ts', additions: 10, deletions: 5, editCount: 30 },
        ],
      }),
      makeSession({
        id: 'sess-2',
        title: 'S2',
        filesChanged: [
          { path: 'cli/src/utils.ts', additions: 5, deletions: 2, editCount: 20 },
        ],
      }),
      makeSession({
        id: 'sess-3',
        title: 'S3',
        filesChanged: [],
      }),
    ];
    const { container } = render(<DirectoryHeatmap sessions={sessions} projectDirName="test" />);

    const grid = container.querySelector('.dir-heatmap__grid') as HTMLElement;
    expect(grid.style.gridTemplateColumns).toBe('150px repeat(3, 1fr)');
  });

  // ---------------------------------------------------------------------------
  // Zero-edit cells
  // ---------------------------------------------------------------------------

  it('renders zero-edit cells with very low opacity', () => {
    const sessions = [
      makeSession({
        id: 'sess-1',
        title: 'S1',
        filesChanged: [
          { path: 'cli/src/server.ts', additions: 10, deletions: 5, editCount: 30 },
        ],
      }),
      makeSession({
        id: 'sess-2',
        title: 'S2',
        filesChanged: [
          { path: 'other/dir/file.ts', additions: 5, deletions: 2, editCount: 20 },
        ],
      }),
    ];
    const { container } = render(<DirectoryHeatmap sessions={sessions} projectDirName="test" />);

    // There should be cells where directories don't overlap with sessions
    const cells = container.querySelectorAll('.dir-heatmap__cell');
    // Find a zero-edit cell (cli/src/ in sess-2 should be 0)
    const zeroCell = Array.from(cells).find((cell) => {
      const title = (cell as HTMLElement).title;
      return /:\s*0 edits$/.test(title);
    }) as HTMLElement;
    expect(zeroCell).toBeTruthy();
    expect(zeroCell.style.background).toContain('0.02');
  });
});
