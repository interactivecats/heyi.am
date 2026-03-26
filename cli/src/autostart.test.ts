import { describe, it, expect } from 'vitest';
import {
  generateLaunchdPlist,
  generateLinuxDesktopEntry,
} from './autostart.js';

describe('autostart', () => {
  describe('generateLaunchdPlist', () => {
    it('generates valid plist XML with correct binary and log paths', () => {
      const plist = generateLaunchdPlist('/path/to/heyiam-tray', '/path/to/daemon.log');

      expect(plist).toContain('<?xml version="1.0"');
      expect(plist).toContain('<string>com.heyiam.daemon</string>');
      expect(plist).toContain('<string>/path/to/heyiam-tray</string>');
      expect(plist).toContain('<key>RunAtLoad</key>');
      expect(plist).toContain('<true/>');
      expect(plist).toContain('<key>KeepAlive</key>');
      expect(plist).toContain('<false/>');
    });

    it('sets StandardOutPath and StandardErrorPath to the log path', () => {
      const plist = generateLaunchdPlist('/bin/daemon', '/var/log/daemon.log');

      expect(plist).toContain('<key>StandardOutPath</key>');
      expect(plist).toContain('<key>StandardErrorPath</key>');
      // Both should point to the same log file
      const logOccurrences = plist.split('/var/log/daemon.log').length - 1;
      expect(logOccurrences).toBe(2);
    });

    it('wraps binary path in ProgramArguments array', () => {
      const plist = generateLaunchdPlist('/usr/local/bin/heyiam-tray', '/tmp/log');

      expect(plist).toContain('<key>ProgramArguments</key>');
      expect(plist).toContain('<array>');
      expect(plist).toContain('<string>/usr/local/bin/heyiam-tray</string>');
    });
  });

  describe('generateLinuxDesktopEntry', () => {
    it('generates a valid desktop entry with Exec path', () => {
      const entry = generateLinuxDesktopEntry('/path/to/heyiam-tray');

      expect(entry).toContain('[Desktop Entry]');
      expect(entry).toContain('Type=Application');
      expect(entry).toContain('Exec=/path/to/heyiam-tray');
      expect(entry).toContain('Name=heyiam Daemon');
    });

    it('sets NoDisplay and autostart enabled', () => {
      const entry = generateLinuxDesktopEntry('/bin/daemon');

      expect(entry).toContain('NoDisplay=true');
      expect(entry).toContain('X-GNOME-Autostart-enabled=true');
    });

    it('includes Hidden=false so the entry is active', () => {
      const entry = generateLinuxDesktopEntry('/bin/daemon');

      expect(entry).toContain('Hidden=false');
    });
  });
});
