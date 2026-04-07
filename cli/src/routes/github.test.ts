import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ── Mocks ────────────────────────────────────────────────────────────

vi.mock('../auth.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../auth.js')>();
  return {
    ...actual,
    getAuthToken: vi.fn(() => ({ username: 'testuser', token: 'heyiam-session-abc' })),
  };
});

// Capture per-fn so we can override behavior per test.
const requestDeviceCode = vi.fn();
const pollForToken = vi.fn();
const storeToken = vi.fn();
const loadToken = vi.fn();
const deleteToken = vi.fn();
const listRepos = vi.fn();
const getAuthenticatedUser = vi.fn();
const pushSiteToRepo = vi.fn();
const enablePages = vi.fn();
const pollPagesBuild = vi.fn();

vi.mock('../github.js', async () => {
  const actual = await vi.importActual<typeof import('../github.js')>('../github.js');
  return {
    ...actual,
    requestDeviceCode: (...a: unknown[]) => requestDeviceCode(...a),
    pollForToken: (...a: unknown[]) => pollForToken(...a),
    storeToken: (...a: unknown[]) => storeToken(...a),
    loadToken: (...a: unknown[]) => loadToken(...a),
    deleteToken: (...a: unknown[]) => deleteToken(...a),
    listRepos: (...a: unknown[]) => listRepos(...a),
    getAuthenticatedUser: (...a: unknown[]) => getAuthenticatedUser(...a),
    pushSiteToRepo: (...a: unknown[]) => pushSiteToRepo(...a),
    enablePages: (...a: unknown[]) => enablePages(...a),
    pollPagesBuild: (...a: unknown[]) => pollPagesBuild(...a),
  };
});

vi.mock('./portfolio-render-data.js', () => ({
  buildPortfolioRenderData: vi.fn(async () => ({ renderData: { projects: [] } })),
}));

vi.mock('../export.js', () => ({
  generatePortfolioSite: vi.fn(async () => ({ files: [], totalBytes: 0, outputPath: '/tmp' })),
}));

vi.mock('./preview.js', () => ({
  invalidatePortfolioPreviewCache: vi.fn(),
}));

import { createGithubRouter } from './github.js';
import type { RouteContext } from './context.js';
import { getAuthToken } from '../auth.js';
import { GitHubError } from '../github.js';
import { getPortfolioPublishState } from '../settings.js';

let configDir: string;
const originalDataDir = process.env.HEYIAM_DATA_DIR;
const originalConfigDir = process.env.HEYIAM_CONFIG_DIR;

function makeApp(): express.Express {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  const ctx = {
    db: {} as RouteContext['db'],
    sessionsBasePath: '/tmp',
    getProjects: vi.fn().mockResolvedValue([]),
    getProjectWithStats: vi.fn(),
    loadSession: vi.fn(),
    getSessionStats: vi.fn(),
    buildPreviewPage: vi.fn(),
  } as unknown as RouteContext;
  app.use(createGithubRouter(ctx));
  return app;
}

beforeEach(() => {
  configDir = mkdtempSync(join(tmpdir(), 'heyiam-gh-route-'));
  process.env.HEYIAM_DATA_DIR = configDir;
  process.env.HEYIAM_CONFIG_DIR = configDir;

  requestDeviceCode.mockReset();
  pollForToken.mockReset();
  storeToken.mockReset();
  loadToken.mockReset();
  deleteToken.mockReset();
  listRepos.mockReset();
  getAuthenticatedUser.mockReset();
  pushSiteToRepo.mockReset();
  enablePages.mockReset();
  pollPagesBuild.mockReset();

  vi.mocked(getAuthToken).mockReturnValue(
    { username: 'testuser', token: 'heyiam-session-abc' } as ReturnType<typeof getAuthToken>,
  );
});

afterEach(() => {
  rmSync(configDir, { recursive: true, force: true });
  if (originalDataDir !== undefined) process.env.HEYIAM_DATA_DIR = originalDataDir;
  else delete process.env.HEYIAM_DATA_DIR;
  if (originalConfigDir !== undefined) process.env.HEYIAM_CONFIG_DIR = originalConfigDir;
  else delete process.env.HEYIAM_CONFIG_DIR;
});

// ── /api/github/device-code ──────────────────────────────────────────

describe('POST /api/github/device-code', () => {
  it('401 when not authenticated', async () => {
    vi.mocked(getAuthToken).mockReturnValueOnce(null);
    const res = await request(makeApp()).post('/api/github/device-code').send({});
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('returns device code payload on success', async () => {
    requestDeviceCode.mockResolvedValueOnce({
      device_code: 'DEV', user_code: 'ABCD-1234',
      verification_uri: 'https://github.com/login/device',
      expires_in: 900, interval: 5,
    });
    const res = await request(makeApp()).post('/api/github/device-code').send({});
    expect(res.status).toBe(200);
    expect(res.body.user_code).toBe('ABCD-1234');
    expect(res.body.verification_uri).toBe('https://github.com/login/device');
  });

  it('surfaces GitHubError with structured code', async () => {
    requestDeviceCode.mockRejectedValueOnce(new GitHubError('DEVICE_CODE_FAILED', 'nope', 500));
    const res = await request(makeApp()).post('/api/github/device-code').send({});
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('DEVICE_CODE_FAILED');
  });
});

// ── /api/github/poll-token ───────────────────────────────────────────

describe('POST /api/github/poll-token', () => {
  it('rejects missing device_code with 400', async () => {
    const res = await request(makeApp()).post('/api/github/poll-token').send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_DEVICE_CODE');
  });

  it('stores token and returns account on success', async () => {
    pollForToken.mockResolvedValueOnce({ access_token: 'gho_TOKEN' });
    storeToken.mockResolvedValueOnce(undefined);
    getAuthenticatedUser.mockResolvedValueOnce({
      login: 'ben', name: 'Ben', avatar_url: 'https://x/y.png',
    });
    const res = await request(makeApp())
      .post('/api/github/poll-token')
      .send({ device_code: 'DEV', interval: 1 });
    expect(res.status).toBe(200);
    expect(res.body.account).toEqual({ login: 'ben', name: 'Ben', avatarUrl: 'https://x/y.png' });
    // Token itself must NEVER appear in the response.
    expect(JSON.stringify(res.body)).not.toContain('gho_TOKEN');
    expect(storeToken).toHaveBeenCalledWith('gho_TOKEN');
  });

  it('maps KEYCHAIN_UNAVAILABLE to 503', async () => {
    pollForToken.mockResolvedValueOnce({ access_token: 'gho_X' });
    storeToken.mockRejectedValueOnce(new GitHubError('KEYCHAIN_UNAVAILABLE', 'no keychain'));
    const res = await request(makeApp())
      .post('/api/github/poll-token')
      .send({ device_code: 'DEV', interval: 1 });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('KEYCHAIN_UNAVAILABLE');
  });

  it('surfaces access_denied as TOKEN_POLL_DENIED', async () => {
    pollForToken.mockRejectedValueOnce(new GitHubError('TOKEN_POLL_DENIED', 'denied'));
    const res = await request(makeApp())
      .post('/api/github/poll-token')
      .send({ device_code: 'DEV' });
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('TOKEN_POLL_DENIED');
  });
});

// ── /api/github/account ──────────────────────────────────────────────

describe('GET /api/github/account', () => {
  it('returns null account when no token stored', async () => {
    loadToken.mockResolvedValueOnce(null);
    const res = await request(makeApp()).get('/api/github/account');
    expect(res.status).toBe(200);
    expect(res.body.account).toBeNull();
  });

  it('returns account when token stored', async () => {
    loadToken.mockResolvedValueOnce('gho_X');
    getAuthenticatedUser.mockResolvedValueOnce({
      login: 'ben', name: null, avatar_url: 'https://x/y.png',
    });
    const res = await request(makeApp()).get('/api/github/account');
    expect(res.status).toBe(200);
    expect(res.body.account.login).toBe('ben');
    expect(JSON.stringify(res.body)).not.toContain('gho_X');
  });
});

describe('DELETE /api/github/account', () => {
  it('deletes token', async () => {
    deleteToken.mockResolvedValueOnce(undefined);
    const res = await request(makeApp()).delete('/api/github/account');
    expect(res.status).toBe(200);
    expect(deleteToken).toHaveBeenCalled();
  });
});

// ── /api/github/repos ────────────────────────────────────────────────

describe('GET /api/github/repos', () => {
  it('401 when not authenticated', async () => {
    vi.mocked(getAuthToken).mockReturnValueOnce(null);
    const res = await request(makeApp()).get('/api/github/repos');
    expect(res.status).toBe(401);
  });

  it('401 NO_GITHUB_TOKEN when token missing', async () => {
    loadToken.mockResolvedValueOnce(null);
    const res = await request(makeApp()).get('/api/github/repos');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('NO_GITHUB_TOKEN');
  });

  it('returns repo list when token present', async () => {
    loadToken.mockResolvedValueOnce('gho_X');
    listRepos.mockResolvedValueOnce([
      { name: 'site', full_name: 'ben/site', default_branch: 'main', has_pages: true, private: false },
    ]);
    const res = await request(makeApp()).get('/api/github/repos');
    expect(res.status).toBe(200);
    expect(res.body.repos).toHaveLength(1);
    expect(res.body.repos[0].name).toBe('site');
  });
});

// ── /api/github/publish ──────────────────────────────────────────────

describe('POST /api/github/publish', () => {
  it('400 when owner or repo missing', async () => {
    const res = await request(makeApp()).post('/api/github/publish').send({ owner: 'ben' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_TARGET');
  });

  it('401 NO_GITHUB_TOKEN when no stored token', async () => {
    loadToken.mockResolvedValueOnce(null);
    const res = await request(makeApp())
      .post('/api/github/publish')
      .send({ owner: 'ben', repo: 'site' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('NO_GITHUB_TOKEN');
  });

  it('happy path renders, pushes, enables Pages, polls build, and persists state', async () => {
    loadToken.mockResolvedValueOnce('gho_X');
    pushSiteToRepo.mockResolvedValueOnce({ commitSha: 'c1', treeSha: 't1', filesUploaded: 3 });
    enablePages.mockResolvedValueOnce(undefined);
    pollPagesBuild.mockResolvedValueOnce({ status: 'built' });

    const res = await request(makeApp())
      .post('/api/github/publish')
      .send({ owner: 'ben', repo: 'site', branch: 'gh-pages' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.url).toBe('https://ben.github.io/site/');

    // Token must not leak into response.
    expect(JSON.stringify(res.body)).not.toContain('gho_X');

    // State persisted.
    const state = getPortfolioPublishState();
    expect(state.targets.github).toBeDefined();
    expect(state.targets.github.url).toBe('https://ben.github.io/site/');
    expect(state.targets.github.config).toEqual({ owner: 'ben', repo: 'site', branch: 'gh-pages' });
    expect(state.targets.github.lastError).toBeUndefined();
  });

  it('records lastError on push failure', async () => {
    loadToken.mockResolvedValueOnce('gho_X');
    pushSiteToRepo.mockRejectedValueOnce(new GitHubError('GITHUB_API_FAILED', 'forbidden', 403));

    const res = await request(makeApp())
      .post('/api/github/publish')
      .send({ owner: 'ben', repo: 'site' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('GITHUB_API_FAILED');

    const state = getPortfolioPublishState();
    expect(state.targets.github.lastError).toBe('forbidden');
  });

  it('maps KEYCHAIN_UNAVAILABLE from loadToken to 503', async () => {
    loadToken.mockRejectedValueOnce(new GitHubError('KEYCHAIN_UNAVAILABLE', 'no keychain'));
    const res = await request(makeApp())
      .post('/api/github/publish')
      .send({ owner: 'ben', repo: 'site' });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('KEYCHAIN_UNAVAILABLE');
  });
});
