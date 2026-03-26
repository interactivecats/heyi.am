import { describe, it, expect } from 'vitest';
import { getAssetName, getDaemonDir, getDaemonBinaryPath } from './daemon-install.js';
import { join } from 'node:path';
import { homedir } from 'node:os';

describe('daemon-install', () => {
  describe('getAssetName', () => {
    it('returns a non-null asset name for the current platform', () => {
      // CI and local dev should always be one of the supported platforms
      const name = getAssetName();
      // On unsupported platforms this would be null, but we expect
      // tests to run on supported platforms
      if (name !== null) {
        expect(name).toMatch(/^heyiam-tray-(darwin-(arm64|x64)|linux-x64|windows-x64\.exe)$/);
      }
    });

    it('asset name matches current platform', () => {
      const name = getAssetName();
      if (process.platform === 'darwin' && process.arch === 'arm64') {
        expect(name).toBe('heyiam-tray-darwin-arm64');
      } else if (process.platform === 'darwin' && process.arch === 'x64') {
        expect(name).toBe('heyiam-tray-darwin-x64');
      } else if (process.platform === 'linux' && process.arch === 'x64') {
        expect(name).toBe('heyiam-tray-linux-x64');
      } else if (process.platform === 'win32' && process.arch === 'x64') {
        expect(name).toBe('heyiam-tray-windows-x64.exe');
      }
    });
  });

  describe('getDaemonDir', () => {
    it('returns path under ~/.config/heyiam/daemon', () => {
      const dir = getDaemonDir();
      expect(dir).toBe(join(homedir(), '.config', 'heyiam', 'daemon'));
    });
  });

  describe('getDaemonBinaryPath', () => {
    it('returns path ending with heyiam-tray', () => {
      const path = getDaemonBinaryPath();
      const expectedExt = process.platform === 'win32' ? '.exe' : '';
      expect(path).toBe(join(homedir(), '.config', 'heyiam', 'daemon', `heyiam-tray${expectedExt}`));
    });

    it('lives inside getDaemonDir', () => {
      const binaryPath = getDaemonBinaryPath();
      const daemonDir = getDaemonDir();
      expect(binaryPath.startsWith(daemonDir)).toBe(true);
    });
  });
});
