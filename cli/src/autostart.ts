/**
 * Auto-start registration for the heyiam daemon.
 *
 * Supports:
 *   - macOS: ~/Library/LaunchAgents/com.heyiam.daemon.plist
 *   - Linux: ~/.config/autostart/heyiam-daemon.desktop
 *   - Windows: TODO (not implemented)
 */

import { createInterface } from 'node:readline';
import { writeFileSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, platform } from 'node:os';
import { getDaemonDir, getDaemonBinaryPath } from './daemon-install.js';

// ── Path constants ──────────────────────────────────────────

const DAEMON_DIR = getDaemonDir();
const DAEMON_BINARY = getDaemonBinaryPath();
const DAEMON_LOG = join(DAEMON_DIR, 'daemon.log');

const LAUNCHD_PLIST_DIR = join(homedir(), 'Library', 'LaunchAgents');
const LAUNCHD_PLIST_PATH = join(LAUNCHD_PLIST_DIR, 'com.heyiam.daemon.plist');

const LINUX_AUTOSTART_DIR = join(homedir(), '.config', 'autostart');
const LINUX_DESKTOP_PATH = join(LINUX_AUTOSTART_DIR, 'heyiam-daemon.desktop');

// ── Prompt helper ───────────────────────────────────────────

export function askYesNo(question: string): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question(question, (answer) => {
      rl.close();
      const normalized = answer.trim().toLowerCase();
      resolve(normalized === 'y' || normalized === 'yes');
    });
  });
}

// ── Plist generation ────────────────────────────────────────

export function generateLaunchdPlist(binaryPath: string, logPath: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.heyiam.daemon</string>
  <key>ProgramArguments</key>
  <array>
    <string>${binaryPath}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <false/>
  <key>StandardOutPath</key>
  <string>${logPath}</string>
  <key>StandardErrorPath</key>
  <string>${logPath}</string>
</dict>
</plist>
`;
}

// ── Desktop entry generation ────────────────────────────────

export function generateLinuxDesktopEntry(binaryPath: string): string {
  return `[Desktop Entry]
Type=Application
Name=heyiam Daemon
Exec=${binaryPath}
Hidden=false
NoDisplay=true
X-GNOME-Autostart-enabled=true
Comment=Background archiving daemon for heyiam
`;
}

// ── Registration ────────────────────────────────────────────

export function registerAutostart(): { registered: boolean; method: string } {
  const os = platform();

  if (os === 'darwin') {
    mkdirSync(LAUNCHD_PLIST_DIR, { recursive: true });
    const plist = generateLaunchdPlist(DAEMON_BINARY, DAEMON_LOG);
    writeFileSync(LAUNCHD_PLIST_PATH, plist, 'utf-8');
    return { registered: true, method: 'launchd' };
  }

  if (os === 'linux') {
    mkdirSync(LINUX_AUTOSTART_DIR, { recursive: true });
    const desktop = generateLinuxDesktopEntry(DAEMON_BINARY);
    writeFileSync(LINUX_DESKTOP_PATH, desktop, 'utf-8');
    return { registered: true, method: 'XDG autostart' };
  }

  // TODO: Windows auto-start via registry or startup folder
  return { registered: false, method: 'unsupported' };
}

// ── Unregistration ──────────────────────────────────────────

export function unregisterAutostart(): { removed: boolean; files: string[] } {
  const removed: string[] = [];

  if (existsSync(LAUNCHD_PLIST_PATH)) {
    unlinkSync(LAUNCHD_PLIST_PATH);
    removed.push(LAUNCHD_PLIST_PATH);
  }

  if (existsSync(LINUX_DESKTOP_PATH)) {
    unlinkSync(LINUX_DESKTOP_PATH);
    removed.push(LINUX_DESKTOP_PATH);
  }

  return { removed: removed.length > 0, files: removed };
}

