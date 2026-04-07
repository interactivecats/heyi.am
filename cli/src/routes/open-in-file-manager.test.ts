import { describe, it, expect, vi, beforeEach } from 'vitest';

const spawnMock = vi.fn();
vi.mock('node:child_process', () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}));

import { openInFileManager } from './open-in-file-manager.js';

function fakeChild() {
  return {
    on: vi.fn(),
    unref: vi.fn(),
  };
}

describe('openInFileManager', () => {
  beforeEach(() => {
    spawnMock.mockReset();
    spawnMock.mockReturnValue(fakeChild());
  });

  it('uses `open` on darwin', () => {
    const ok = openInFileManager('/tmp/x', 'darwin');
    expect(ok).toBe(true);
    expect(spawnMock).toHaveBeenCalledWith('open', ['/tmp/x'], { detached: true, stdio: 'ignore' });
  });

  it('uses `xdg-open` on linux', () => {
    const ok = openInFileManager('/tmp/x', 'linux');
    expect(ok).toBe(true);
    expect(spawnMock).toHaveBeenCalledWith('xdg-open', ['/tmp/x'], { detached: true, stdio: 'ignore' });
  });

  it('returns false on win32 without spawning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ok = openInFileManager('C:\\x', 'win32');
    expect(ok).toBe(false);
    expect(spawnMock).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('returns false on unsupported platforms', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ok = openInFileManager('/tmp/x', 'aix');
    expect(ok).toBe(false);
    expect(spawnMock).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('returns false when spawn throws', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    spawnMock.mockImplementationOnce(() => { throw new Error('ENOENT'); });
    const ok = openInFileManager('/tmp/x', 'darwin');
    expect(ok).toBe(false);
    warn.mockRestore();
  });

  it('unrefs the spawned child', () => {
    const child = fakeChild();
    spawnMock.mockReturnValueOnce(child);
    openInFileManager('/tmp/x', 'darwin');
    expect(child.unref).toHaveBeenCalled();
  });
});
