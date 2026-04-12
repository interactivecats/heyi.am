import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  requestDeviceCode,
  pollForTokenOnce,
  storeToken,
  loadToken,
  deleteToken,
  listRepos,
  getAuthenticatedUser,
  pushSiteToRepo,
  enablePages,
  pollPagesBuild,
  GitHubError,
  __setKeytarForTests,
} from './github.js';

// ── fetch mock ────────────────────────────────────────────────────────

const fetchMock = vi.fn();
globalThis.fetch = fetchMock as unknown as typeof fetch;

function jsonResponse(body: unknown, init: { status?: number } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function emptyResponse(status: number): Response {
  return new Response(null, { status });
}

beforeEach(() => {
  fetchMock.mockReset();
  __setKeytarForTests(null);
});

// ── Device code ───────────────────────────────────────────────────────

describe('requestDeviceCode', () => {
  it('POSTs to the device code URL and parses the response', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      device_code: 'DEV123',
      user_code: 'ABCD-1234',
      verification_uri: 'https://github.com/login/device',
      expires_in: 900,
      interval: 5,
    }));
    const result = await requestDeviceCode(['repo']);
    expect(result.user_code).toBe('ABCD-1234');
    expect(result.interval).toBe(5);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://github.com/login/device/code');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body).scope).toBe('repo');
  });

  it('throws DEVICE_CODE_FAILED on non-2xx', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'bad' }, { status: 500 }));
    await expect(requestDeviceCode(['repo'])).rejects.toMatchObject({
      code: 'DEVICE_CODE_FAILED',
    });
  });

  it('throws DEVICE_CODE_FAILED on malformed body', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}));
    await expect(requestDeviceCode(['repo'])).rejects.toBeInstanceOf(GitHubError);
  });
});

// ── pollForTokenOnce (single-poll, non-blocking) ────────────────────

describe('pollForTokenOnce', () => {
  it('returns { status: "success", access_token } when GitHub grants a token', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ access_token: 'gho_TOKEN' }));
    const result = await pollForTokenOnce('DEV');
    expect(result).toEqual({ status: 'success', access_token: 'gho_TOKEN' });
    // Verify it made exactly one fetch — no loop.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns { status: "pending" } on authorization_pending', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'authorization_pending' }));
    const result = await pollForTokenOnce('DEV');
    expect(result).toEqual({ status: 'pending' });
  });

  it('returns { status: "pending" } on slow_down', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'slow_down' }));
    const result = await pollForTokenOnce('DEV');
    expect(result).toEqual({ status: 'pending' });
  });

  it('returns { status: "expired" } on expired_token', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'expired_token' }));
    const result = await pollForTokenOnce('DEV');
    expect(result).toEqual({ status: 'expired' });
  });

  it('returns { status: "denied" } on access_denied', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'access_denied' }));
    const result = await pollForTokenOnce('DEV');
    expect(result).toEqual({ status: 'denied' });
  });

  it('throws TOKEN_POLL_FAILED on unexpected error', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'server_error', error_description: 'oops' }));
    await expect(pollForTokenOnce('DEV')).rejects.toMatchObject({
      code: 'TOKEN_POLL_FAILED',
      message: 'oops',
    });
  });

  it('returns immediately without sleeping (non-blocking)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'authorization_pending' }));
    const start = Date.now();
    await pollForTokenOnce('DEV');
    const elapsed = Date.now() - start;
    // Should complete in well under 100ms — certainly not waiting seconds.
    expect(elapsed).toBeLessThan(100);
  });
});

// ── Keychain ──────────────────────────────────────────────────────────

describe('token storage (keytar)', () => {
  it('store / load / delete roundtrip via mock', async () => {
    const store = new Map<string, string>();
    __setKeytarForTests({
      setPassword: async (s, a, p) => { store.set(`${s}:${a}`, p); },
      getPassword: async (s, a) => store.get(`${s}:${a}`) ?? null,
      deletePassword: async (s, a) => store.delete(`${s}:${a}`),
    });
    await storeToken('gho_ABC');
    expect(await loadToken()).toBe('gho_ABC');
    await deleteToken();
    expect(await loadToken()).toBeNull();
  });

  it('maps keychain failures to KEYCHAIN_UNAVAILABLE', async () => {
    __setKeytarForTests({
      setPassword: async () => { throw new Error('no backend'); },
      getPassword: async () => { throw new Error('no backend'); },
      deletePassword: async () => { throw new Error('no backend'); },
    });
    await expect(storeToken('x')).rejects.toMatchObject({ code: 'KEYCHAIN_UNAVAILABLE' });
    await expect(loadToken()).rejects.toMatchObject({ code: 'KEYCHAIN_UNAVAILABLE' });
    await expect(deleteToken()).rejects.toMatchObject({ code: 'KEYCHAIN_UNAVAILABLE' });
  });
});

// ── User + repos ──────────────────────────────────────────────────────

describe('getAuthenticatedUser', () => {
  it('parses user payload', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      login: 'ben', name: 'Ben', avatar_url: 'https://x/y.png',
    }));
    const user = await getAuthenticatedUser('gho_x');
    expect(user).toEqual({ login: 'ben', name: 'Ben', avatar_url: 'https://x/y.png' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.github.com/user');
    expect((init.headers as Headers).get('Authorization')).toBe('Bearer gho_x');
  });

  it('throws GITHUB_API_FAILED on error', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ message: 'Bad creds' }, { status: 401 }));
    await expect(getAuthenticatedUser('gho_x')).rejects.toMatchObject({
      code: 'GITHUB_API_FAILED',
      status: 401,
    });
  });
});

describe('listRepos', () => {
  it('parses repo summaries', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([
      { name: 'site', full_name: 'ben/site', default_branch: 'main', has_pages: true, private: false },
      { name: 'priv', full_name: 'ben/priv', default_branch: 'develop', has_pages: false, private: true },
    ]));
    const repos = await listRepos('tok');
    expect(repos).toHaveLength(2);
    expect(repos[0]).toEqual({
      name: 'site', full_name: 'ben/site', default_branch: 'main', has_pages: true, private: false,
    });
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('per_page=100');
    expect(url).toContain('type=owner');
  });
});

// ── Tree push ─────────────────────────────────────────────────────────

describe('pushSiteToRepo', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'gh-push-'));
    writeFileSync(join(tmp, 'index.html'), '<html></html>');
    mkdirSync(join(tmp, 'projects', 'a'), { recursive: true });
    writeFileSync(join(tmp, 'projects', 'a', 'index.html'), '<p>a</p>');
  });
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  it('blob per file + tree + commit + ref PATCH for existing branch', async () => {
    // Order: 2 blobs, 1 ref get, 1 tree, 1 commit, 1 ref patch = 6 calls total.
    // Plan spec: "3 API calls typical case" refers to the tail after blobs.
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ sha: 'blob1' }))
      .mockResolvedValueOnce(jsonResponse({ sha: 'blob2' }))
      .mockResolvedValueOnce(jsonResponse({ object: { sha: 'parentSha' } }))
      .mockResolvedValueOnce(jsonResponse({ sha: 'tree1' }))
      .mockResolvedValueOnce(jsonResponse({ sha: 'commit1' }))
      .mockResolvedValueOnce(jsonResponse({ ref: 'refs/heads/gh-pages' }));

    const result = await pushSiteToRepo({
      token: 'tok', owner: 'ben', repo: 'site', branch: 'gh-pages', sourceDir: tmp,
    });
    expect(result.filesUploaded).toBe(2);
    expect(result.commitSha).toBe('commit1');
    expect(result.treeSha).toBe('tree1');

    // After the 2 blob calls, exactly 3 calls for tree-path tail + 1 ref get (= 4).
    // Tail (tree/commit/refs PATCH) is exactly 3, matching the plan.
    const tailCalls = fetchMock.mock.calls.slice(3); // skip blobs(2) + ref-get(1)
    expect(tailCalls).toHaveLength(3);
    expect(tailCalls[0][0]).toContain('/git/trees');
    expect(tailCalls[1][0]).toContain('/git/commits');
    expect(tailCalls[2][0]).toContain('/git/refs/heads/gh-pages');
    expect(tailCalls[2][1].method).toBe('PATCH');
  });

  it('creates new ref if branch does not exist (404)', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ sha: 'blob1' }))
      .mockResolvedValueOnce(jsonResponse({ sha: 'blob2' }))
      .mockResolvedValueOnce(emptyResponse(404))
      .mockResolvedValueOnce(jsonResponse({ sha: 'tree1' }))
      .mockResolvedValueOnce(jsonResponse({ sha: 'commit1' }))
      .mockResolvedValueOnce(jsonResponse({ ref: 'refs/heads/gh-pages' }));
    const result = await pushSiteToRepo({
      token: 'tok', owner: 'ben', repo: 'site', branch: 'gh-pages', sourceDir: tmp,
    });
    expect(result.commitSha).toBe('commit1');
    const refCreate = fetchMock.mock.calls[5];
    expect(refCreate[0]).toContain('/git/refs');
    expect(refCreate[1].method).toBe('POST');
    expect(JSON.parse(refCreate[1].body).ref).toBe('refs/heads/gh-pages');
  });

  it('rejects empty source dir', async () => {
    const empty = mkdtempSync(join(tmpdir(), 'gh-empty-'));
    try {
      await expect(pushSiteToRepo({
        token: 'tok', owner: 'ben', repo: 'site', branch: 'main', sourceDir: empty,
      })).rejects.toMatchObject({ code: 'INVALID_SOURCE_DIR' });
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});

// ── Pages ─────────────────────────────────────────────────────────────

describe('enablePages', () => {
  it('treats 201 as success', async () => {
    fetchMock.mockResolvedValueOnce(emptyResponse(201));
    await expect(enablePages({ token: 't', owner: 'o', repo: 'r', branch: 'main' })).resolves.toBeUndefined();
  });

  it('treats 409 (already enabled) as idempotent success', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ message: 'already enabled' }, { status: 409 }));
    await expect(enablePages({ token: 't', owner: 'o', repo: 'r', branch: 'main' })).resolves.toBeUndefined();
  });

  it('propagates other errors', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ message: 'forbidden' }, { status: 403 }));
    await expect(enablePages({ token: 't', owner: 'o', repo: 'r', branch: 'main' }))
      .rejects.toMatchObject({ code: 'GITHUB_API_FAILED', status: 403 });
  });
});

describe('pollPagesBuild', () => {
  const noSleep = vi.fn(async () => {});

  it('returns immediately when status is built', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ status: 'built', url: 'https://ben.github.io/r/' }));
    const result = await pollPagesBuild({
      token: 't', owner: 'o', repo: 'r', sleep: noSleep, intervalMs: 10, timeoutMs: 1000,
    });
    expect(result.status).toBe('built');
  });

  it('throws on errored', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ status: 'errored', error: { message: 'boom' } }));
    await expect(pollPagesBuild({
      token: 't', owner: 'o', repo: 'r', sleep: noSleep, intervalMs: 10, timeoutMs: 1000,
    })).rejects.toMatchObject({ code: 'PAGES_BUILD_FAILED' });
  });

  it('polls until built', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ status: 'queued' }))
      .mockResolvedValueOnce(jsonResponse({ status: 'building' }))
      .mockResolvedValueOnce(jsonResponse({ status: 'built' }));
    const result = await pollPagesBuild({
      token: 't', owner: 'o', repo: 'r', sleep: noSleep, intervalMs: 10, timeoutMs: 1000,
    });
    expect(result.status).toBe('built');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('times out if never built', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: 'building' }));
    // Use a 0 timeout so the loop exits after one iteration.
    await expect(pollPagesBuild({
      token: 't', owner: 'o', repo: 'r', sleep: noSleep, intervalMs: 1, timeoutMs: 0,
    })).rejects.toMatchObject({ code: 'PAGES_BUILD_TIMEOUT' });
  });

  it('tolerates 404 while the build record does not exist yet', async () => {
    fetchMock
      .mockResolvedValueOnce(emptyResponse(404))
      .mockResolvedValueOnce(jsonResponse({ status: 'built' }));
    const result = await pollPagesBuild({
      token: 't', owner: 'o', repo: 'r', sleep: noSleep, intervalMs: 10, timeoutMs: 1000,
    });
    expect(result.status).toBe('built');
  });
});
