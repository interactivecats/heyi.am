import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  ensureConfigDir,
  readConfig,
  writeConfig,
  getAuthToken,
  saveAuthToken,
  checkAuthStatus,
  deviceAuthFlow,
  normalizeUsername,
} from './auth.js';

describe('auth', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'heyiam-auth-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('ensureConfigDir', () => {
    it('creates nested directories', () => {
      const nested = join(tmpDir, 'a', 'b', 'c');
      ensureConfigDir(nested);
      expect(existsSync(nested)).toBe(true);
    });

    it('is idempotent', () => {
      ensureConfigDir(tmpDir);
      ensureConfigDir(tmpDir);
      expect(existsSync(tmpDir)).toBe(true);
    });
  });

  describe('readConfig / writeConfig', () => {
    it('round-trips JSON data', () => {
      writeConfig('test.json', { key: 'value' }, tmpDir);
      const data = readConfig<{ key: string }>('test.json', tmpDir);
      expect(data).toEqual({ key: 'value' });
    });

    it('returns null for missing files', () => {
      expect(readConfig('missing.json', tmpDir)).toBeNull();
    });

    it('creates config dir if missing', () => {
      const nested = join(tmpDir, 'sub');
      writeConfig('test.json', { a: 1 }, nested);
      expect(existsSync(join(nested, 'test.json'))).toBe(true);
    });
  });

  describe('getAuthToken / saveAuthToken', () => {
    it('returns null when no token saved', () => {
      expect(getAuthToken(tmpDir)).toBeNull();
    });

    it('saves and retrieves auth token', () => {
      saveAuthToken('tok_abc123', 'ben', tmpDir);
      const auth = getAuthToken(tmpDir);
      expect(auth).not.toBeNull();
      expect(auth!.token).toBe('tok_abc123');
      expect(auth!.username).toBe('ben');
      expect(auth!.savedAt).toBeTruthy();
    });

    it('overwrites previous token', () => {
      saveAuthToken('old_token', 'ben', tmpDir);
      saveAuthToken('new_token', 'ben', tmpDir);
      const auth = getAuthToken(tmpDir);
      expect(auth!.token).toBe('new_token');
    });
  });

  describe('normalizeUsername', () => {
    it('lowercases mixed-case input', () => {
      expect(normalizeUsername('Ben')).toBe('ben');
      expect(normalizeUsername('BEN')).toBe('ben');
      expect(normalizeUsername('bEn')).toBe('ben');
    });

    it('trims whitespace', () => {
      expect(normalizeUsername('  ben  ')).toBe('ben');
      expect(normalizeUsername('\tBen\n')).toBe('ben');
    });

    it('is idempotent on already-lowercase input', () => {
      expect(normalizeUsername('ben-cates')).toBe('ben-cates');
      expect(normalizeUsername('user-42')).toBe('user-42');
    });
  });

  describe('username normalization on save', () => {
    it('stores lowercase when Phoenix returns mixed-case "Ben"', () => {
      saveAuthToken('tok', 'Ben', tmpDir);
      const auth = getAuthToken(tmpDir);
      expect(auth!.username).toBe('ben');
    });

    it('stores lowercase for uppercase username', () => {
      saveAuthToken('tok', 'BEN', tmpDir);
      const auth = getAuthToken(tmpDir);
      expect(auth!.username).toBe('ben');
    });

    it('preserves already-lowercase usernames unchanged', () => {
      saveAuthToken('tok', 'ben-cates', tmpDir);
      const auth = getAuthToken(tmpDir);
      expect(auth!.username).toBe('ben-cates');
    });

    it('normalizes legacy mixed-case auth.json on read', () => {
      // Simulate a config written before normalization was added.
      writeConfig(
        'auth.json',
        { token: 'tok', username: 'Ben', savedAt: new Date().toISOString() },
        tmpDir,
      );
      const auth = getAuthToken(tmpDir);
      expect(auth!.username).toBe('ben');
    });
  });

  describe('checkAuthStatus normalizes server responses', () => {
    it('lowercases username returned by /api/auth/status', async () => {
      saveAuthToken('valid_token', 'ben', tmpDir);
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ username: 'Ben' }),
      });

      const result = await checkAuthStatus('http://localhost:4000', tmpDir, mockFetch);
      expect(result).toEqual({ authenticated: true, username: 'ben' });
    });
  });

  describe('deviceAuthFlow normalizes Phoenix response', () => {
    it('persists lowercase username when Phoenix returns mixed-case', async () => {
      const mockFetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.endsWith('/api/device/code') && init?.method === 'POST') {
          return {
            ok: true,
            json: async () => ({
              device_code: 'dev_123',
              user_code: 'ABCD-1234',
              verification_uri: 'http://localhost:4000/device',
              expires_in: 300,
              interval: 1,
            }),
          };
        }
        if (url.endsWith('/api/device/token') && init?.method === 'POST') {
          return {
            ok: true,
            json: async () => ({ access_token: 'tok_granted', username: 'Ben' }),
          };
        }
        throw new Error(`Unexpected fetch: ${url}`);
      });

      const result = await deviceAuthFlow('http://localhost:4000', tmpDir, {
        fetchFn: mockFetch,
        pollIntervalMs: 10,
      });
      expect(result.username).toBe('ben');
      expect(getAuthToken(tmpDir)!.username).toBe('ben');
    });
  });

  describe('checkAuthStatus', () => {
    it('returns unauthenticated when no token stored', async () => {
      const mockFetch = vi.fn();
      const result = await checkAuthStatus('http://localhost:4000', tmpDir, mockFetch);
      expect(result).toEqual({ authenticated: false });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('returns authenticated when server confirms', async () => {
      saveAuthToken('valid_token', 'ben', tmpDir);
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ username: 'ben' }),
      });

      const result = await checkAuthStatus('http://localhost:4000', tmpDir, mockFetch);
      expect(result).toEqual({ authenticated: true, username: 'ben' });
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:4000/api/auth/status',
        { headers: { Authorization: 'Bearer valid_token' } },
      );
    });

    it('returns unauthenticated on 401', async () => {
      saveAuthToken('expired_token', 'ben', tmpDir);
      const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 401 });

      const result = await checkAuthStatus('http://localhost:4000', tmpDir, mockFetch);
      expect(result).toEqual({ authenticated: false });
    });
  });

  describe('deviceAuthFlow', () => {
    it('completes flow: request code, poll, save token', async () => {
      let pollCount = 0;
      const mockFetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.endsWith('/api/device/code') && init?.method === 'POST') {
          return {
            ok: true,
            json: async () => ({
              device_code: 'dev_123',
              user_code: 'ABCD-1234',
              verification_uri: 'http://localhost:4000/device',
              expires_in: 300,
              interval: 1,
            }),
          };
        }
        if (url.endsWith('/api/device/token') && init?.method === 'POST') {
          pollCount++;
          if (pollCount < 3) {
            return {
              ok: false,
              json: async () => ({ error: 'authorization_pending' }),
            };
          }
          return {
            ok: true,
            json: async () => ({ access_token: 'tok_granted', username: 'ben' }),
          };
        }
        throw new Error(`Unexpected fetch: ${url}`);
      });

      const onUserCode = vi.fn();
      const openBrowser = vi.fn().mockResolvedValue(undefined);

      const result = await deviceAuthFlow('http://localhost:4000', tmpDir, {
        fetchFn: mockFetch,
        openBrowser,
        onUserCode,
        pollIntervalMs: 10,
      });

      expect(onUserCode).toHaveBeenCalledWith('ABCD-1234', 'http://localhost:4000/device');
      expect(openBrowser).toHaveBeenCalledWith('http://localhost:4000/device');
      expect(result.token).toBe('tok_granted');
      expect(result.username).toBe('ben');
      expect(pollCount).toBe(3);

      // Verify token was persisted
      const saved = getAuthToken(tmpDir);
      expect(saved!.token).toBe('tok_granted');
    });

    it('throws on access_denied', async () => {
      const mockFetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.endsWith('/api/device/code')) {
          return {
            ok: true,
            json: async () => ({
              device_code: 'dev_x',
              user_code: 'XXXX',
              verification_uri: 'http://localhost:4000/device',
              expires_in: 300,
              interval: 1,
            }),
          };
        }
        if (url.endsWith('/api/device/token')) {
          return {
            ok: false,
            json: async () => ({ error: 'access_denied' }),
          };
        }
        throw new Error(`Unexpected fetch: ${url}`);
      });

      await expect(
        deviceAuthFlow('http://localhost:4000', tmpDir, { fetchFn: mockFetch, pollIntervalMs: 10 }),
      ).rejects.toThrow('Authorization was denied');
    });

    it('throws on expired_token', async () => {
      const mockFetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.endsWith('/api/device/code')) {
          return {
            ok: true,
            json: async () => ({
              device_code: 'dev_exp',
              user_code: 'XXXX',
              verification_uri: 'http://localhost:4000/device',
              expires_in: 300,
              interval: 1,
            }),
          };
        }
        if (url.endsWith('/api/device/token')) {
          return {
            ok: false,
            json: async () => ({ error: 'expired_token' }),
          };
        }
        throw new Error(`Unexpected fetch: ${url}`);
      });

      await expect(
        deviceAuthFlow('http://localhost:4000', tmpDir, { fetchFn: mockFetch, pollIntervalMs: 10 }),
      ).rejects.toThrow('expired');
    });

    it('throws when device code request fails', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });

      await expect(
        deviceAuthFlow('http://localhost:4000', tmpDir, { fetchFn: mockFetch }),
      ).rejects.toThrow('Failed to request device code');
    });
  });

});
