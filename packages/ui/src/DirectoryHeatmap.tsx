import { Fragment } from 'react';
import type { Session } from './types';

// ── Directory Heatmap ──────────────────────────────────────────

interface FileEditData {
  path: string;
  editCount: number;
}

function stripProjectRoot(filePath: string, projectDirName: string, cwd?: string): string {
  if (cwd && filePath.startsWith(cwd)) {
    const relative = filePath.slice(cwd.length).replace(/^\//, '');
    return relative || filePath;
  }
  const root = projectDirName.replace(/^-/, '/').replace(/-/g, '/');
  if (filePath.startsWith(root)) {
    const relative = filePath.slice(root.length).replace(/^\//, '');
    return relative || filePath;
  }
  return filePath;
}

function extractDirectory(filePath: string): string {
  const segments = filePath.split('/').filter(Boolean);
  if (segments.length <= 1) return '/';
  const depth = Math.min(segments.length - 1, 2);
  return segments.slice(0, depth).join('/') + '/';
}

interface HeatmapData {
  directories: string[];
  grid: Map<string, number>;
  maxEdits: number;
  files: FileEditData[];
  totalFiles: number;
}

function buildHeatmapData(sessions: Session[], projectDirName: string): HeatmapData {
  const dirSessionMap = new Map<string, Map<string, number>>();
  const dirTotals = new Map<string, number>();
  const fileMap = new Map<string, number>();

  for (const session of sessions) {
    if (!session.filesChanged) continue;
    for (const fc of session.filesChanged) {
      if (!fc.path || typeof fc.path !== 'string') continue;
      const edits = fc.editCount ?? (fc.additions + fc.deletions);
      const relativePath = stripProjectRoot(fc.path, projectDirName, session.cwd);
      const dir = extractDirectory(relativePath);

      if (!dirSessionMap.has(dir)) dirSessionMap.set(dir, new Map());
      const sessionMap = dirSessionMap.get(dir)!;
      sessionMap.set(session.id, (sessionMap.get(session.id) ?? 0) + edits);
      dirTotals.set(dir, (dirTotals.get(dir) ?? 0) + edits);
      fileMap.set(relativePath, (fileMap.get(relativePath) ?? 0) + edits);
    }
  }

  const directories = Array.from(dirTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([dir]) => dir);

  const grid = new Map<string, number>();
  let maxEdits = 0;
  for (const dir of directories) {
    const sessionMap = dirSessionMap.get(dir);
    if (!sessionMap) continue;
    for (const session of sessions) {
      const edits = sessionMap.get(session.id) ?? 0;
      grid.set(`${dir}|${session.id}`, edits);
      if (edits > maxEdits) maxEdits = edits;
    }
  }

  const files = Array.from(fileMap.entries())
    .map(([path, editCount]) => ({ path, editCount }))
    .sort((a, b) => b.editCount - a.editCount)
    .slice(0, 10);

  return { directories, grid, maxEdits, files, totalFiles: fileMap.size };
}

function getCellOpacity(editCount: number, maxEdits: number): number {
  if (editCount === 0) return 0.02;
  if (maxEdits === 0) return 0.05;
  const ratio = editCount / maxEdits;
  return 0.05 + ratio * 0.65;
}

function truncateTitle(title: string, maxLen: number = 15): string {
  if (title.length <= maxLen) return title;
  return title.slice(0, maxLen - 1) + '\u2026';
}

/** @internal Exported for testing */
export function DirectoryHeatmap({ sessions, projectDirName }: { sessions: Session[]; projectDirName: string }) {
  const { directories, grid, maxEdits, files, totalFiles } = buildHeatmapData(sessions, projectDirName);

  if (directories.length === 0) {
    return (
      <div className="dir-heatmap">
        <div className="project-preview__timeline-heading">EDIT HEATMAP BY DIRECTORY</div>
        <p className="dir-heatmap__empty">No file data available</p>
      </div>
    );
  }

  const sessionCount = sessions.length;

  return (
    <div className="dir-heatmap">
      <div className="project-preview__timeline-heading">EDIT HEATMAP BY DIRECTORY</div>
      <div
        className="dir-heatmap__grid"
        style={{ gridTemplateColumns: `150px repeat(${sessionCount}, 1fr)` }}
        role="table"
        aria-label="Directory edit heatmap"
      >
        <div className="dir-heatmap__corner" role="columnheader" />
        {sessions.map((s) => (
          <div key={s.id} className="dir-heatmap__session-label" role="columnheader" title={s.title}>
            {truncateTitle(s.title)}
          </div>
        ))}

        {directories.map((dir) => (
          <Fragment key={dir}>
            <div className="dir-heatmap__dir-label" role="rowheader" title={dir}>{dir}</div>
            {sessions.map((s) => {
              const edits = grid.get(`${dir}|${s.id}`) ?? 0;
              const opacity = getCellOpacity(edits, maxEdits);
              return (
                <div
                  key={s.id}
                  className="dir-heatmap__cell"
                  style={{ background: `rgba(8,68,113,${opacity})` }}
                  role="cell"
                  title={`${dir} in ${s.title}: ${edits} edits`}
                  aria-label={`${dir} in ${s.title}: ${edits} edits`}
                />
              );
            })}
          </Fragment>
        ))}
      </div>

      <div className="dir-heatmap__legend" aria-hidden="true">
        <span>Intensity = edit count</span>
        <span style={{ display: 'inline-block', width: 12, height: 12, background: 'rgba(8,68,113,0.05)', borderRadius: 2 }} />
        <span style={{ display: 'inline-block', width: 12, height: 12, background: 'rgba(8,68,113,0.35)', borderRadius: 2 }} />
        <span style={{ display: 'inline-block', width: 12, height: 12, background: 'rgba(8,68,113,0.7)', borderRadius: 2 }} />
        <span>low &rarr; high</span>
      </div>

      <details className="dir-heatmap__top-files">
        <summary className="dir-heatmap__top-files-summary">
          Top {files.length} most-edited files (of {totalFiles} total) &rarr;
        </summary>
        <div role="list" aria-label="Most edited files">
          {files.map((f) => (
            <div key={f.path} className="dir-heatmap__file-row" role="listitem">
              <span className="dir-heatmap__file-path" title={f.path}>{f.path}</span>
              <span className="dir-heatmap__file-count">{f.editCount} edits</span>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
