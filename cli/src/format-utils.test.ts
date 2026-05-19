import { describe, it, expect } from 'vitest';
import { projectDirFromPath, displayNameFromDir } from './format-utils.js';

describe('projectDirFromPath', () => {
  it('extracts project_dir from a parent session path', () => {
    const p = '/Users/me/.claude/projects/-Users-me-Dev-myapp/abc123.jsonl';
    expect(projectDirFromPath(p, false)).toBe('-Users-me-Dev-myapp');
  });

  it('extracts project_dir from a subagent path', () => {
    const p = '/Users/me/.claude/projects/-Users-me-Dev-myapp/parent-id/subagents/agent-x.jsonl';
    expect(projectDirFromPath(p, true)).toBe('-Users-me-Dev-myapp');
  });

  it('handles nested project dirs (cwd moved into subdirectory)', () => {
    // Claude Code v2.1+ behavior: parent project is "experiments",
    // session moved to "experiments-boring-ops" when cwd shifted.
    const p = '/Users/me/.claude/projects/-Users-me-Dev-experiments-boring-ops/s.jsonl';
    expect(projectDirFromPath(p, false)).toBe('-Users-me-Dev-experiments-boring-ops');
  });
});

describe('displayNameFromDir', () => {
  it('returns the path tail after -Dev-', () => {
    expect(displayNameFromDir('-Users-me-Dev-myapp')).toBe('myapp');
    expect(displayNameFromDir('-Users-me-Dev-experiments-boring-ops')).toBe('experiments-boring-ops');
  });
});
