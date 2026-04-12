// GitHub integration: OAuth device flow, keychain-backed token storage,
// repo listing, and Git Data API tree-push to publish a static site to
// GitHub Pages. All pure logic — no Express. Routes live in
// `routes/github.ts`.
//
// Secret handling rules (see trc-secrets-management):
//   * Tokens are stored ONLY in the OS keychain via keytar. Never written
//     to disk in plaintext, never logged, never returned in responses.
//   * Errors are sanitized before surfacing — if the GitHub API echoes
//     the token back in an error body, we do not propagate that body.
//   * Device codes are short-lived; only the resulting access token is
//     persisted.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep as pathSep } from 'node:path';

// TODO(phase-5-launch): replace with real client_id registered for the
// heyi.am CLI OAuth App before merging to main. Founder owns this.
export const GITHUB_OAUTH_CLIENT_ID = 'Iv1.PLACEHOLDER_CLIENT_ID';

const KEYTAR_SERVICE = 'heyiam';
const KEYTAR_ACCOUNT = 'github';

const GITHUB_API = 'https://api.github.com';
const GITHUB_DEVICE_CODE_URL = 'https://github.com/login/device/code';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';

// ── Types ──────────────────────────────────────────────────────────────

export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

export interface GitHubRepoSummary {
  name: string;
  full_name: string;
  default_branch: string;
  has_pages: boolean;
  private: boolean;
}

export interface GitHubUser {
  login: string;
  name: string | null;
  avatar_url: string;
}

export interface PushSiteArgs {
  token: string;
  owner: string;
  repo: string;
  branch: string;
  sourceDir: string;
}

export interface PushSiteResult {
  commitSha: string;
  treeSha: string;
  filesUploaded: number;
}

export interface EnablePagesArgs {
  token: string;
  owner: string;
  repo: string;
  branch: string;
}

export interface PollPagesArgs {
  token: string;
  owner: string;
  repo: string;
  /** Override for tests (ms). Default 5000. */
  intervalMs?: number;
  /** Override for tests (ms). Default 5 minutes. */
  timeoutMs?: number;
  /** Injectable sleep for fake timers. */
  sleep?: (ms: number) => Promise<void>;
}

export interface PagesBuildStatus {
  status: 'queued' | 'building' | 'built' | 'errored' | (string & {});
  url?: string;
  error?: { message?: string };
}

// ── Structured error ───────────────────────────────────────────────────

export type GitHubErrorCode =
  | 'DEVICE_CODE_FAILED'
  | 'TOKEN_POLL_TIMEOUT'
  | 'TOKEN_POLL_DENIED'
  | 'TOKEN_POLL_FAILED'
  | 'KEYCHAIN_UNAVAILABLE'
  | 'NO_TOKEN'
  | 'GITHUB_API_FAILED'
  | 'PAGES_BUILD_FAILED'
  | 'PAGES_BUILD_TIMEOUT'
  | 'INVALID_SOURCE_DIR';

export class GitHubError extends Error {
  readonly code: GitHubErrorCode;
  readonly status?: number;
  constructor(code: GitHubErrorCode, message: string, status?: number) {
    super(message);
    this.name = 'GitHubError';
    this.code = code;
    this.status = status;
  }
}

function sanitizeMessage(msg: string, token?: string): string {
  let out = msg;
  if (token) out = out.split(token).join('[redacted]');
  return out;
}

// ── Fetch helpers ──────────────────────────────────────────────────────

async function ghFetch(
  url: string,
  init: RequestInit & { token?: string },
): Promise<Response> {
  const { token, ...rest } = init;
  const headers = new Headers(rest.headers);
  headers.set('Accept', 'application/vnd.github+json');
  headers.set('X-GitHub-Api-Version', '2022-11-28');
  headers.set('User-Agent', 'heyiam-cli');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(url, { ...rest, headers });
}

async function ghJson<T>(
  url: string,
  init: RequestInit & { token?: string },
  code: GitHubErrorCode = 'GITHUB_API_FAILED',
): Promise<T> {
  const res = await ghFetch(url, init);
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json() as { message?: string };
      if (body?.message) detail = body.message;
    } catch { /* non-JSON body */ }
    throw new GitHubError(code, sanitizeMessage(detail, init.token), res.status);
  }
  return res.json() as Promise<T>;
}

// ── OAuth device flow ──────────────────────────────────────────────────

export async function requestDeviceCode(scopes: string[]): Promise<DeviceCodeResponse> {
  const res = await fetch(GITHUB_DEVICE_CODE_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'heyiam-cli',
    },
    body: JSON.stringify({
      client_id: GITHUB_OAUTH_CLIENT_ID,
      scope: scopes.join(' '),
    }),
  });
  if (!res.ok) {
    throw new GitHubError(
      'DEVICE_CODE_FAILED',
      `Failed to request device code: HTTP ${res.status}`,
      res.status,
    );
  }
  const body = await res.json() as Partial<DeviceCodeResponse>;
  if (!body.device_code || !body.user_code || !body.verification_uri) {
    throw new GitHubError('DEVICE_CODE_FAILED', 'Malformed device code response');
  }
  return {
    device_code: body.device_code,
    user_code: body.user_code,
    verification_uri: body.verification_uri,
    expires_in: body.expires_in ?? 900,
    interval: body.interval ?? 5,
  };
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

// ── Single-poll result type ───────────────────────────────────────────

export type PollTokenResult =
  | { status: 'success'; access_token: string }
  | { status: 'pending' }
  | { status: 'expired' }
  | { status: 'denied' };

/**
 * Make a single poll attempt against GitHub's device-flow token endpoint.
 *
 * Returns immediately — no sleep, no loop. The caller (frontend) is
 * responsible for retry scheduling so the Express worker is never blocked.
 */
export async function pollForTokenOnce(deviceCode: string): Promise<PollTokenResult> {
  const res = await fetch(GITHUB_TOKEN_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'heyiam-cli',
    },
    body: JSON.stringify({
      client_id: GITHUB_OAUTH_CLIENT_ID,
      device_code: deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    }),
  });
  const body = await res.json().catch(() => ({})) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };
  if (body.access_token) {
    return { status: 'success', access_token: body.access_token };
  }
  switch (body.error) {
    case 'authorization_pending':
    case 'slow_down':
      return { status: 'pending' };
    case 'expired_token':
      return { status: 'expired' };
    case 'access_denied':
      return { status: 'denied' };
    default:
      // Unexpected error from GitHub — surface as a thrown error so the
      // route handler maps it to a 500 via handleGitHubError.
      throw new GitHubError(
        'TOKEN_POLL_FAILED',
        body.error_description || body.error || `HTTP ${res.status}`,
      );
  }
}

// ── Token storage (keychain) ──────────────────────────────────────────

// `keytar` may throw on systems without a keychain backend (e.g. headless
// Linux without libsecret). We wrap every call and re-raise as
// KEYCHAIN_UNAVAILABLE so callers can present a recoverable error.

// Dynamic import so the module can be mocked in tests without native deps.
type KeytarModule = {
  setPassword: (s: string, a: string, p: string) => Promise<void>;
  getPassword: (s: string, a: string) => Promise<string | null>;
  deletePassword: (s: string, a: string) => Promise<boolean>;
};

let keytarOverride: KeytarModule | null = null;

/** Test hook — inject a mock keytar implementation. */
export function __setKeytarForTests(mock: KeytarModule | null): void {
  keytarOverride = mock;
}

async function getKeytar(): Promise<KeytarModule> {
  if (keytarOverride) return keytarOverride;
  try {
    const mod = await import('keytar');
    return mod.default ?? (mod as unknown as KeytarModule);
  } catch (err) {
    throw new GitHubError(
      'KEYCHAIN_UNAVAILABLE',
      `OS keychain unavailable: ${(err as Error).message}`,
    );
  }
}

export async function storeToken(token: string): Promise<void> {
  const keytar = await getKeytar();
  try {
    await keytar.setPassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT, token);
  } catch (err) {
    throw new GitHubError(
      'KEYCHAIN_UNAVAILABLE',
      `Failed to store token in keychain: ${(err as Error).message}`,
    );
  }
}

export async function loadToken(): Promise<string | null> {
  const keytar = await getKeytar();
  try {
    return await keytar.getPassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT);
  } catch (err) {
    throw new GitHubError(
      'KEYCHAIN_UNAVAILABLE',
      `Failed to read token from keychain: ${(err as Error).message}`,
    );
  }
}

export async function deleteToken(): Promise<void> {
  const keytar = await getKeytar();
  try {
    await keytar.deletePassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT);
  } catch (err) {
    throw new GitHubError(
      'KEYCHAIN_UNAVAILABLE',
      `Failed to delete token from keychain: ${(err as Error).message}`,
    );
  }
}

// ── User + repo lookup ────────────────────────────────────────────────

export async function getAuthenticatedUser(token: string): Promise<GitHubUser> {
  const user = await ghJson<GitHubUser>(`${GITHUB_API}/user`, { token });
  return {
    login: user.login,
    name: user.name ?? null,
    avatar_url: user.avatar_url,
  };
}

export async function listRepos(token: string): Promise<GitHubRepoSummary[]> {
  const repos = await ghJson<Array<Record<string, unknown>>>(
    `${GITHUB_API}/user/repos?per_page=100&type=owner&sort=updated`,
    { token },
  );
  return repos.map((r) => ({
    name: String(r.name ?? ''),
    full_name: String(r.full_name ?? ''),
    default_branch: String(r.default_branch ?? 'main'),
    has_pages: Boolean(r.has_pages),
    private: Boolean(r.private),
  }));
}

// ── Tree push ─────────────────────────────────────────────────────────

interface BlobRef {
  path: string;
  sha: string;
  mode: '100644';
  type: 'blob';
}

function walkFiles(root: string): string[] {
  const out: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop()!;
    let entries: string[];
    try {
      entries = readdirSync(current);
    } catch (err) {
      throw new GitHubError('INVALID_SOURCE_DIR', `Cannot read ${current}: ${(err as Error).message}`);
    }
    for (const entry of entries) {
      const abs = join(current, entry);
      const st = statSync(abs);
      if (st.isDirectory()) stack.push(abs);
      else if (st.isFile()) out.push(abs);
    }
  }
  return out;
}

function toPosixRel(root: string, abs: string): string {
  return relative(root, abs).split(pathSep).join('/');
}

/**
 * Push a static site directory to GitHub using the Git Data API.
 *
 * Flow (for ref UPDATE, which is the common case):
 *   1. Create one blob per file (N calls).
 *   2. Get current HEAD commit -> base tree sha.
 *   3. Create a new tree with all blobs.
 *   4. Create a new commit pointing at the tree with HEAD as parent.
 *   5. Update the branch ref to the new commit.
 *
 * For very first push where the branch does not exist yet, we create the
 * ref as a new branch off the default branch (or as an orphan if the
 * repo is empty).
 *
 * "3 API calls typical case" in the plan refers to the tree + commit +
 * ref-update tail; blob uploads are per-file and run first. We keep
 * blob creation sequential to bound memory + rate-limit exposure.
 */
export async function pushSiteToRepo(args: PushSiteArgs): Promise<PushSiteResult> {
  const { token, owner, repo, branch, sourceDir } = args;

  const files = walkFiles(sourceDir);
  if (files.length === 0) {
    throw new GitHubError('INVALID_SOURCE_DIR', `No files to push in ${sourceDir}`);
  }

  // 1. Create blobs (one API call per file).
  const blobs: BlobRef[] = [];
  for (const abs of files) {
    const content = readFileSync(abs);
    const body = {
      content: content.toString('base64'),
      encoding: 'base64',
    };
    const blob = await ghJson<{ sha: string }>(
      `${GITHUB_API}/repos/${owner}/${repo}/git/blobs`,
      {
        token,
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
      },
    );
    blobs.push({
      path: toPosixRel(sourceDir, abs),
      sha: blob.sha,
      mode: '100644',
      type: 'blob',
    });
  }

  // 2. Look up parent commit, if any.
  let parentCommitSha: string | null = null;
  const refRes = await ghFetch(
    `${GITHUB_API}/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`,
    { token },
  );
  if (refRes.ok) {
    const refBody = await refRes.json() as { object?: { sha?: string } };
    parentCommitSha = refBody.object?.sha ?? null;
  } else if (refRes.status !== 404) {
    let detail = `HTTP ${refRes.status}`;
    try {
      const body = await refRes.json() as { message?: string };
      if (body.message) detail = body.message;
    } catch { /* ignore */ }
    throw new GitHubError('GITHUB_API_FAILED', sanitizeMessage(detail, token), refRes.status);
  }

  // 3. Create tree.
  const tree = await ghJson<{ sha: string }>(
    `${GITHUB_API}/repos/${owner}/${repo}/git/trees`,
    {
      token,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tree: blobs }),
    },
  );

  // 4. Create commit.
  const commit = await ghJson<{ sha: string }>(
    `${GITHUB_API}/repos/${owner}/${repo}/git/commits`,
    {
      token,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Publish portfolio (heyi.am)',
        tree: tree.sha,
        parents: parentCommitSha ? [parentCommitSha] : [],
      }),
    },
  );

  // 5. Update or create ref.
  if (parentCommitSha) {
    await ghJson(
      `${GITHUB_API}/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`,
      {
        token,
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sha: commit.sha, force: true }),
      },
    );
  } else {
    await ghJson(
      `${GITHUB_API}/repos/${owner}/${repo}/git/refs`,
      {
        token,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: commit.sha }),
      },
    );
  }

  return {
    commitSha: commit.sha,
    treeSha: tree.sha,
    filesUploaded: blobs.length,
  };
}

// ── Pages enable + poll ───────────────────────────────────────────────

/**
 * Idempotent — 409 "already enabled" is treated as success.
 */
export async function enablePages(args: EnablePagesArgs): Promise<void> {
  const { token, owner, repo, branch } = args;
  const res = await ghFetch(
    `${GITHUB_API}/repos/${owner}/${repo}/pages`,
    {
      token,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: { branch, path: '/' },
      }),
    },
  );
  if (res.ok || res.status === 201 || res.status === 204) return;
  if (res.status === 409) return; // already enabled
  let detail = `HTTP ${res.status}`;
  try {
    const body = await res.json() as { message?: string };
    if (body.message) detail = body.message;
  } catch { /* ignore */ }
  throw new GitHubError('GITHUB_API_FAILED', sanitizeMessage(detail, token), res.status);
}

export async function pollPagesBuild(args: PollPagesArgs): Promise<PagesBuildStatus> {
  const { token, owner, repo } = args;
  const intervalMs = args.intervalMs ?? 5_000;
  const timeoutMs = args.timeoutMs ?? 5 * 60 * 1000;
  const sleep = args.sleep ?? defaultSleep;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const res = await ghFetch(
      `${GITHUB_API}/repos/${owner}/${repo}/pages/builds/latest`,
      { token },
    );
    if (res.ok) {
      const body = await res.json() as PagesBuildStatus;
      if (body.status === 'built') return body;
      if (body.status === 'errored') {
        throw new GitHubError(
          'PAGES_BUILD_FAILED',
          body.error?.message || 'Pages build errored',
        );
      }
      // queued | building — keep polling
    } else if (res.status !== 404) {
      // 404 can occur briefly before the first build record exists.
      let detail = `HTTP ${res.status}`;
      try {
        const body = await res.json() as { message?: string };
        if (body.message) detail = body.message;
      } catch { /* ignore */ }
      throw new GitHubError('GITHUB_API_FAILED', sanitizeMessage(detail, token), res.status);
    }
    await sleep(intervalMs);
  }
  throw new GitHubError('PAGES_BUILD_TIMEOUT', 'Timed out waiting for Pages build');
}
