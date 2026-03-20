import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  generateKeyPair,
  loadOrCreateKeyPair,
  signPayload,
  verifySignature,
  getFingerprint,
} from './machine-key.js';

describe('machine-key', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'heyiam-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('generateKeyPair', () => {
    it('returns base64-encoded keys and ISO timestamp', () => {
      const kp = generateKeyPair();
      expect(kp.publicKey).toBeTruthy();
      expect(kp.privateKey).toBeTruthy();
      expect(() => Buffer.from(kp.publicKey, 'base64')).not.toThrow();
      expect(() => Buffer.from(kp.privateKey, 'base64')).not.toThrow();
      expect(new Date(kp.createdAt).toISOString()).toBe(kp.createdAt);
    });

    it('generates unique keypairs each call', () => {
      const kp1 = generateKeyPair();
      const kp2 = generateKeyPair();
      expect(kp1.publicKey).not.toBe(kp2.publicKey);
      expect(kp1.privateKey).not.toBe(kp2.privateKey);
    });
  });

  describe('loadOrCreateKeyPair', () => {
    it('creates keypair file when missing', () => {
      const configDir = join(tmpDir, 'config');
      const kp = loadOrCreateKeyPair(configDir);
      expect(kp.publicKey).toBeTruthy();
      expect(existsSync(join(configDir, 'machine-key.json'))).toBe(true);
    });

    it('returns same keypair on subsequent calls', () => {
      const configDir = join(tmpDir, 'config');
      const kp1 = loadOrCreateKeyPair(configDir);
      const kp2 = loadOrCreateKeyPair(configDir);
      expect(kp1.publicKey).toBe(kp2.publicKey);
      expect(kp1.privateKey).toBe(kp2.privateKey);
    });

    it('stores valid JSON with correct shape', () => {
      const configDir = join(tmpDir, 'config');
      loadOrCreateKeyPair(configDir);
      const raw = readFileSync(join(configDir, 'machine-key.json'), 'utf-8');
      const parsed = JSON.parse(raw);
      expect(parsed).toHaveProperty('publicKey');
      expect(parsed).toHaveProperty('privateKey');
      expect(parsed).toHaveProperty('createdAt');
    });
  });

  describe('signPayload / verifySignature', () => {
    it('round-trips: sign then verify succeeds', () => {
      const kp = generateKeyPair();
      const payload = 'hello world';
      const sig = signPayload(payload, kp.privateKey);
      expect(verifySignature(payload, sig, kp.publicKey)).toBe(true);
    });

    it('rejects tampered payload', () => {
      const kp = generateKeyPair();
      const sig = signPayload('original', kp.privateKey);
      expect(verifySignature('tampered', sig, kp.publicKey)).toBe(false);
    });

    it('rejects wrong public key', () => {
      const kp1 = generateKeyPair();
      const kp2 = generateKeyPair();
      const sig = signPayload('data', kp1.privateKey);
      expect(verifySignature('data', sig, kp2.publicKey)).toBe(false);
    });

    it('handles JSON payloads', () => {
      const kp = generateKeyPair();
      const payload = JSON.stringify({ session: { title: 'test' }, timestamp: Date.now() });
      const sig = signPayload(payload, kp.privateKey);
      expect(verifySignature(payload, sig, kp.publicKey)).toBe(true);
    });
  });

  describe('getFingerprint', () => {
    it('returns colon-separated hex string', () => {
      const kp = generateKeyPair();
      const fp = getFingerprint(kp.publicKey);
      expect(fp).toMatch(/^[0-9a-f]{2}(:[0-9a-f]{2}){31}$/);
    });

    it('is deterministic for same key', () => {
      const kp = generateKeyPair();
      expect(getFingerprint(kp.publicKey)).toBe(getFingerprint(kp.publicKey));
    });

    it('differs for different keys', () => {
      const kp1 = generateKeyPair();
      const kp2 = generateKeyPair();
      expect(getFingerprint(kp1.publicKey)).not.toBe(getFingerprint(kp2.publicKey));
    });
  });
});
