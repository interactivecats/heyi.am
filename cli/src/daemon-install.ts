// Download and install the heyiam tray daemon binary from GitHub releases.
//
// Detects platform + arch, fetches the correct binary from the latest
// daemon release, and saves it to ~/.local/share/heyiam/daemon/heyiam-tray.

import { createWriteStream, mkdirSync, chmodSync, existsSync, renameSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

const GITHUB_REPO = 'interactivecats/heyi.am';
const RELEASES_API = `https://api.github.com/repos/${GITHUB_REPO}/releases`;

interface GithubAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

interface GithubRelease {
  tag_name: string;
  assets: GithubAsset[];
}

/**
 * Map process.platform + process.arch to the asset name produced by CI.
 * Returns null if the current platform is unsupported.
 */
export function getAssetName(): string | null {
  const platform = process.platform;
  const arch = process.arch;

  if (platform === 'darwin' && arch === 'arm64') return 'heyiam-tray-darwin-arm64';
  if (platform === 'darwin' && arch === 'x64') return 'heyiam-tray-darwin-x64';
  if (platform === 'linux' && arch === 'x64') return 'heyiam-tray-linux-x64';
  if (platform === 'win32' && arch === 'x64') return 'heyiam-tray-windows-x64.exe';

  return null;
}

/**
 * Returns the directory where the daemon binary is stored.
 */
export function getDaemonDir(): string {
  return join(homedir(), '.local', 'share', 'heyiam', 'daemon');
}

/**
 * Returns the full path to the daemon binary.
 */
export function getDaemonBinaryPath(): string {
  const ext = process.platform === 'win32' ? '.exe' : '';
  return join(getDaemonDir(), `heyiam-tray${ext}`);
}

/**
 * Fetch the latest daemon release from GitHub.
 * Only considers releases whose tag starts with "daemon-v".
 */
async function fetchLatestDaemonRelease(): Promise<GithubRelease> {
  const response = await fetch(`${RELEASES_API}?per_page=20`, {
    headers: {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'heyiam-cli',
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub API returned ${response.status}: ${response.statusText}`);
  }

  const releases: GithubRelease[] = await response.json() as GithubRelease[];
  const daemonRelease = releases.find(r => r.tag_name.startsWith('daemon-v'));

  if (!daemonRelease) {
    throw new Error('No daemon release found. Check https://github.com/interactivecats/heyi.am/releases');
  }

  return daemonRelease;
}

/**
 * Download a file from a URL to a local path.
 * Uses a temp file + rename for atomicity -- a partial download
 * never overwrites an existing working binary.
 */
async function downloadFile(url: string, destPath: string, onProgress?: (downloaded: number, total: number) => void): Promise<void> {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'heyiam-cli' },
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`);
  }

  const total = parseInt(response.headers.get('content-length') ?? '0', 10);
  const tmpPath = destPath + '.tmp';

  // Clean up any prior partial download
  if (existsSync(tmpPath)) {
    unlinkSync(tmpPath);
  }

  const fileStream = createWriteStream(tmpPath);
  const body = response.body;
  if (!body) {
    throw new Error('Response body is null');
  }

  let downloaded = 0;
  const reader = body.getReader();
  const nodeStream = new Readable({
    async read() {
      const { done, value } = await reader.read();
      if (done) {
        this.push(null);
        return;
      }
      downloaded += value.byteLength;
      if (onProgress && total > 0) {
        onProgress(downloaded, total);
      }
      this.push(Buffer.from(value));
    },
  });

  await pipeline(nodeStream, fileStream);

  // Atomic rename: only replace the binary once download is fully complete
  renameSync(tmpPath, destPath);
}

export interface InstallResult {
  version: string;
  binaryPath: string;
  assetName: string;
  size: number;
}

/**
 * Download and install the daemon binary for the current platform.
 */
export async function installDaemon(
  onProgress?: (message: string) => void,
): Promise<InstallResult> {
  const assetName = getAssetName();
  if (!assetName) {
    throw new Error(
      `Unsupported platform: ${process.platform}-${process.arch}. ` +
      'Supported: darwin-arm64, darwin-x64, linux-x64, windows-x64',
    );
  }

  const log = onProgress ?? (() => {});

  log('  Checking for latest daemon release...');
  const release = await fetchLatestDaemonRelease();
  const asset = release.assets.find(a => a.name === assetName);

  if (!asset) {
    const available = release.assets.map(a => a.name).join(', ');
    throw new Error(
      `No binary found for ${assetName} in release ${release.tag_name}. ` +
      `Available assets: ${available}`,
    );
  }

  const daemonDir = getDaemonDir();
  mkdirSync(daemonDir, { recursive: true });

  const binaryPath = getDaemonBinaryPath();

  log(`  Downloading ${assetName} (${formatBytes(asset.size)})...`);

  let lastPct = -1;
  await downloadFile(asset.browser_download_url, binaryPath, (downloaded, total) => {
    const pct = Math.floor((downloaded / total) * 100);
    if (pct !== lastPct && pct % 10 === 0) {
      lastPct = pct;
      log(`  Downloading... ${pct}%`);
    }
  });

  // Make executable on unix
  if (process.platform !== 'win32') {
    chmodSync(binaryPath, 0o755);
  }

  return {
    version: release.tag_name,
    binaryPath,
    assetName,
    size: asset.size,
  };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
