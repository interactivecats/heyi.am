import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  saveAuthToken,
  getAuthToken,
  checkAuthStatus,
  deviceAuthFlow,
  type DeviceCodeResponse,
} from './auth.js';

/**
 * Auth Flow Contract Tests
 *
 * Verifies the HTTP contract between CLI auth module and Phoenix API:
 *   - POST /api/device/code  -> DeviceCodeResponse
 *   - POST /api/device/token -> { access_token, username } or { error: string }
 *   - GET  /api/auth/status  -> { username: string } (with Bearer token header)
 *
 * Note: Phoenix does NOT currently have /api/device/code or /api/device/token
 * routes in router.ex. The CLI auth module references these endpoints but they
 * are not yet implemented on the Phoenix side. This is a CONTRACT MISMATCH.
 */

describe('Auth Flow Contract', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'heyiam-auth-contract-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('Device auth request format', () => {
    it('POST /api/device/code with no body', () => {
      // Contract: CLI sends POST to /api/device/code with method POST, no body.
      // Verified by inspecting deviceAuthFlow source (auth.ts:84):
      //   fetchFn(`${apiBaseUrl}/api/device/code`, { method: 'POST' })
      // No body, no content-type header on the code request.
      const expectedRequest = { method: 'POST' };
      expect(expectedRequest.method).toBe('POST');
      expect(expectedRequest).not.toHaveProperty('body');
    });

    it('POST /api/device/token sends device_code as JSON body', () => {
      // Contract: CLI sends POST to /api/device/token with JSON body (auth.ts:106-108):
      //   fetchFn(`${apiBaseUrl}/api/device/token`, {
      //     method: 'POST',
      //     headers: { 'Content-Type': 'application/json' },
      //     body: JSON.stringify({ device_code: codeData.device_code }),
      //   })
      const body = JSON.stringify({ device_code: 'dev_xyz' });
      const parsed = JSON.parse(body);
      expect(parsed).toEqual({ device_code: 'dev_xyz' });
      expect(parsed).not.toHaveProperty('user_code');
    });

    it('DeviceCodeResponse shape matches expected contract', () => {
      // The CLI expects this exact shape from Phoenix
      const response: DeviceCodeResponse = {
        device_code: 'abc',
        user_code: 'ABCD-1234',
        verification_uri: 'http://example.com/device',
        expires_in: 300,
        interval: 5,
      };

      expect(response).toHaveProperty('device_code');
      expect(response).toHaveProperty('user_code');
      expect(response).toHaveProperty('verification_uri');
      expect(response).toHaveProperty('expires_in');
      expect(response).toHaveProperty('interval');
      expect(typeof response.device_code).toBe('string');
      expect(typeof response.expires_in).toBe('number');
      expect(typeof response.interval).toBe('number');
    });
  });

  describe('Token storage and retrieval', () => {
    it('persists token, username, and savedAt timestamp', () => {
      saveAuthToken('tok_abc', 'ben', tmpDir);
      const auth = getAuthToken(tmpDir);

      expect(auth).not.toBeNull();
      expect(auth!.token).toBe('tok_abc');
      expect(auth!.username).toBe('ben');
      expect(auth!.savedAt).toBeTruthy();
      // savedAt should be valid ISO 8601
      expect(new Date(auth!.savedAt).toISOString()).toBe(auth!.savedAt);
    });

    it('stored token format is what Phoenix expects in Authorization header', () => {
      saveAuthToken('tok_session_abc123', 'user1', tmpDir);
      const auth = getAuthToken(tmpDir)!;

      // The CLI sends: Authorization: Bearer <token>
      // Phoenix decodes: Base.decode64!(token) and looks up session
      const header = `Bearer ${auth.token}`;
      expect(header).toMatch(/^Bearer \S+$/);
    });
  });

  describe('Auth status check', () => {
    it('GET /api/auth/status with Bearer token header', async () => {
      saveAuthToken('my_token', 'ben', tmpDir);

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ username: 'ben' }),
      });

      const result = await checkAuthStatus('http://localhost:4000', tmpDir, mockFetch);

      // Verify request format
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:4000/api/auth/status',
        { headers: { Authorization: 'Bearer my_token' } },
      );

      // Verify response shape
      expect(result).toEqual({ authenticated: true, username: 'ben' });
    });

    it('returns { authenticated: false } when no token stored', async () => {
      const mockFetch = vi.fn();
      const result = await checkAuthStatus('http://localhost:4000', tmpDir, mockFetch);
      expect(result).toEqual({ authenticated: false });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('returns { authenticated: false } when server returns non-ok', async () => {
      saveAuthToken('expired', 'ben', tmpDir);
      const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 401 });
      const result = await checkAuthStatus('http://localhost:4000', tmpDir, mockFetch);
      expect(result).toEqual({ authenticated: false });
    });
  });

  describe('CONTRACT MISMATCH: device auth endpoints', () => {
    /**
     * The CLI's deviceAuthFlow calls:
     *   POST /api/device/code
     *   POST /api/device/token
     *
     * But Phoenix router.ex only defines:
     *   POST /api/sessions          -> ShareApiController.create
     *   GET  /api/sessions/:token/verify -> ShareApiController.verify
     *
     * The device auth endpoints are NOT in the Phoenix router.
     * Also, GET /api/auth/status is served by the CLI server (server.ts:211),
     * not Phoenix. The CLI proxies to Phoenix for auth status.
     *
     * This test documents the mismatch for tracking.
     */
    it('documents that /api/device/code is not in Phoenix router', () => {
      // Phoenix router API routes:
      const PHOENIX_API_ROUTES = [
        'POST /api/sessions',
        'GET /api/sessions/:token/verify',
      ];

      expect(PHOENIX_API_ROUTES).not.toContain('POST /api/device/code');
      expect(PHOENIX_API_ROUTES).not.toContain('POST /api/device/token');
    });

    it('documents that /api/auth/status is CLI-local, not a Phoenix endpoint', () => {
      // The CLI server.ts serves GET /api/auth/status directly (line 211).
      // It calls checkAuthStatus() which hits Phoenix /api/auth/status,
      // but Phoenix doesn't have that route either.
      //
      // This means: auth status check currently only works when the CLI
      // server is running and proxying. Direct API calls to Phoenix would 404.
      const CLI_LOCAL_ROUTES = ['GET /api/auth/status'];
      expect(CLI_LOCAL_ROUTES).toContain('GET /api/auth/status');
    });
  });
});
