/**
 * Unit tests: DirectoryHeatmap component
 *
 * Tests the directory edit heatmap and top files list used in the
 * ProjectPreview overlay, including aggregation logic, edge cases
 * (no data, single file, duplicate paths across sessions), and rendering.
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
    render(<DirectoryHeatmap sessions={sessions} />);
    expect(screen.getByText('No file data available')).toBeTruthy();
  });

  it('renders empty state when sessions array is empty', () => {
    render(<DirectoryHeatmap sessions={[]} />);
    expect(screen.getByText('No file data available')).toBeTruthy();
  });

  it('renders empty state when filesChanged is an empty array', () => {
    const sessions = [makeSession({ filesChanged: [] })];
    render(<DirectoryHeatmap sessions={sessions} />);
    expect(screen.getByText('No file data available')).toBeTruthy();
  });

  // ---------------------------------------------------------------------------
  // Aggregation and rendering
  // ---------------------------------------------------------------------------

  it('groups files by directory and renders bars', () => {
    const sessions = [
      makeSession({
        filesChanged: [
          { path: 'cli/src/server.ts', additions: 10, deletions: 5, editCount: 30 },
          { path: 'cli/src/utils.ts', additions: 5, deletions: 2, editCount: 20 },
          { path: 'phoenix/lib/router.ex', additions: 8, deletions: 3, editCount: 15 },
        ],
      }),
    ];
    const { container } = render(<DirectoryHeatmap sessions={sessions} />);

    // Should render DIRECTORY HEATMAP heading
    expect(screen.getByText('DIRECTORY HEATMAP')).toBeTruthy();

    // Should render directory rows
    const rows = container.querySelectorAll('.dir-heatmap__row');
    expect(rows.length).toBe(2); // cli/src/ and phoenix/lib/

    // First row should be cli/src/ with 50 edits (30+20)
    const firstDir = rows[0].querySelector('.dir-heatmap__dir');
    expect(firstDir?.textContent).toBe('cli/src/');
    const firstCount = rows[0].querySelector('.dir-heatmap__count');
    expect(firstCount?.textContent).toBe('50 edits');

    // Second row should be phoenix/lib/ with 15 edits
    const secondDir = rows[1].querySelector('.dir-heatmap__dir');
    expect(secondDir?.textContent).toBe('phoenix/lib/');
    const secondCount = rows[1].querySelector('.dir-heatmap__count');
    expect(secondCount?.textContent).toBe('15 edits');
  });

  it('aggregates across multiple sessions', () => {
    const sessions = [
      makeSession({
        id: 'sess-1',
        filesChanged: [
          { path: 'cli/src/server.ts', additions: 10, deletions: 5, editCount: 20 },
        ],
      }),
      makeSession({
        id: 'sess-2',
        filesChanged: [
          { path: 'cli/src/server.ts', additions: 3, deletions: 1, editCount: 12 },
        ],
      }),
    ];
    const { container } = render(<DirectoryHeatmap sessions={sessions} />);

    const rows = container.querySelectorAll('.dir-heatmap__row');
    expect(rows.length).toBe(1);

    const count = rows[0].querySelector('.dir-heatmap__count');
    expect(count?.textContent).toBe('32 edits');
  });

  it('falls back to additions + deletions when editCount is missing', () => {
    const sessions = [
      makeSession({
        filesChanged: [
          { path: 'cli/src/server.ts', additions: 10, deletions: 5 },
        ],
      }),
    ];
    const { container } = render(<DirectoryHeatmap sessions={sessions} />);

    const count = container.querySelector('.dir-heatmap__count');
    expect(count?.textContent).toBe('15 edits');
  });

  it('limits directory list to 10 entries', () => {
    const files = Array.from({ length: 15 }, (_, i) => ({
      path: `dir${i}/sub/file.ts`,
      additions: 10,
      deletions: 5,
      editCount: 100 - i,
    }));
    const sessions = [makeSession({ filesChanged: files })];
    const { container } = render(<DirectoryHeatmap sessions={sessions} />);

    const rows = container.querySelectorAll('.dir-heatmap__row');
    expect(rows.length).toBe(10);
  });

  // ---------------------------------------------------------------------------
  // Top files section
  // ---------------------------------------------------------------------------

  it('renders top files list with correct total count', () => {
    const sessions = [
      makeSession({
        filesChanged: [
          { path: 'cli/src/server.ts', additions: 10, deletions: 5, editCount: 30 },
          { path: 'cli/src/utils.ts', additions: 5, deletions: 2, editCount: 20 },
          { path: 'phoenix/lib/router.ex', additions: 8, deletions: 3, editCount: 15 },
        ],
      }),
    ];
    render(<DirectoryHeatmap sessions={sessions} />);

    // Should show total file count in heading
    expect(screen.getByText(/of 3 total/)).toBeTruthy();

    // Should show file paths
    expect(screen.getByText('cli/src/server.ts')).toBeTruthy();
    expect(screen.getByText('cli/src/utils.ts')).toBeTruthy();
    expect(screen.getByText('phoenix/lib/router.ex')).toBeTruthy();
  });

  it('sorts files by edit count descending', () => {
    const sessions = [
      makeSession({
        filesChanged: [
          { path: 'low.ts', additions: 1, deletions: 0, editCount: 5 },
          { path: 'high.ts', additions: 50, deletions: 10, editCount: 100 },
          { path: 'mid.ts', additions: 10, deletions: 5, editCount: 50 },
        ],
      }),
    ];
    const { container } = render(<DirectoryHeatmap sessions={sessions} />);

    const filePaths = Array.from(container.querySelectorAll('.top-files__path')).map(
      (el) => el.textContent,
    );
    expect(filePaths).toEqual(['high.ts', 'mid.ts', 'low.ts']);
  });

  // ---------------------------------------------------------------------------
  // Directory extraction (3-segment depth)
  // ---------------------------------------------------------------------------

  it('extracts up to 3 directory segments', () => {
    const sessions = [
      makeSession({
        filesChanged: [
          { path: 'cli/app/src/components/File.tsx', additions: 10, deletions: 5, editCount: 20 },
        ],
      }),
    ];
    const { container } = render(<DirectoryHeatmap sessions={sessions} />);

    const dir = container.querySelector('.dir-heatmap__dir');
    expect(dir?.textContent).toBe('cli/app/src/');
  });

  it('handles root-level files gracefully', () => {
    const sessions = [
      makeSession({
        filesChanged: [
          { path: 'README.md', additions: 5, deletions: 0, editCount: 5 },
        ],
      }),
    ];
    const { container } = render(<DirectoryHeatmap sessions={sessions} />);

    const dir = container.querySelector('.dir-heatmap__dir');
    expect(dir?.textContent).toBe('/');
  });

  // ---------------------------------------------------------------------------
  // Accessibility
  // ---------------------------------------------------------------------------

  it('uses role=list and role=listitem for screen readers', () => {
    const sessions = [
      makeSession({
        filesChanged: [
          { path: 'cli/src/server.ts', additions: 10, deletions: 5, editCount: 30 },
        ],
      }),
    ];
    render(<DirectoryHeatmap sessions={sessions} />);

    expect(screen.getByRole('list', { name: 'Directory edit counts' })).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Most edited files' })).toBeTruthy();
  });

  // ---------------------------------------------------------------------------
  // Bar width proportionality
  // ---------------------------------------------------------------------------

  it('sets bar width proportional to max edits', () => {
    const sessions = [
      makeSession({
        filesChanged: [
          { path: 'a/b/file1.ts', additions: 10, deletions: 5, editCount: 100 },
          { path: 'c/d/file2.ts', additions: 5, deletions: 2, editCount: 50 },
        ],
      }),
    ];
    const { container } = render(<DirectoryHeatmap sessions={sessions} />);

    const bars = container.querySelectorAll('.dir-heatmap__bar');
    expect(bars.length).toBe(2);

    // First bar (100 edits) should be 100% width
    const firstWidth = (bars[0] as HTMLElement).style.width;
    expect(firstWidth).toBe('100%');

    // Second bar (50 edits) should be 50% width
    const secondWidth = (bars[1] as HTMLElement).style.width;
    expect(secondWidth).toBe('50%');
  });

  it('skips files with empty or missing paths', () => {
    const sessions = [
      makeSession({
        filesChanged: [
          { path: '', additions: 10, deletions: 5, editCount: 30 },
          { path: 'valid/path/file.ts', additions: 5, deletions: 2, editCount: 20 },
        ],
      }),
    ];
    const { container } = render(<DirectoryHeatmap sessions={sessions} />);

    const rows = container.querySelectorAll('.dir-heatmap__row');
    expect(rows.length).toBe(1);
  });
});
