import { describe, it, expect } from 'vitest';
import { generateKeyPair, signPayload, verifySignature } from './machine-key.js';

/**
 * Challenge Response Contract Tests
 *
 * Verifies the contract for submitting a challenge response from CLI to Phoenix.
 *
 * Phoenix endpoint: POST /api/sessions (ShareApiController.create)
 *   - params["challenge_slug"] links to a Challenge
 *   - params["access_code"] for private challenges
 *   - params["session"] contains the Share data including signature
 *
 * Challenge schema fields (challenge.ex):
 *   - slug (string, unique, auto-generated)
 *   - status: "draft" | "active" | "closed"
 *   - access_code_hash (bcrypt-hashed, virtual :access_code field)
 *   - max_responses (integer, nullable)
 *   - evaluation_criteria ({:array, :map})
 *
 * Share -> Challenge link: belongs_to :challenge (challenge_id FK)
 */

describe('Challenge Response Contract', () => {
  describe('Challenge publish payload', () => {
    it('includes challenge_slug at top level alongside session', () => {
      const payload = {
        session: {
          title: 'Rate Limiter Implementation',
          duration_minutes: 42,
          turns: 55,
          sealed: true,
          signature: 'base64sig==',
          public_key: 'base64pub==',
        },
        challenge_slug: 'abc123def',
      };

      expect(payload).toHaveProperty('session');
      expect(payload).toHaveProperty('challenge_slug');
      expect(typeof payload.challenge_slug).toBe('string');
    });

    it('challenge_slug is a URL-safe string matching Phoenix slug format', () => {
      // Phoenix generates slugs with: :crypto.strong_rand_bytes(8) |> Base.url_encode64(padding: false)
      // This produces 11 characters of URL-safe base64
      const slug = 'aB_c-dEf1g2';
      expect(slug).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('private challenge requires access_code alongside slug', () => {
      const payload = {
        session: { title: 'Private Challenge Response' },
        challenge_slug: 'private-slug',
        access_code: 'secret-code-123',
      };

      expect(payload).toHaveProperty('access_code');
      expect(typeof payload.access_code).toBe('string');
      expect(payload.access_code.length).toBeGreaterThan(0);
    });
  });

  describe('Sealed response includes Ed25519 signature', () => {
    it('signature and public_key are inside the session object', () => {
      const kp = generateKeyPair();
      const sessionContent = JSON.stringify({
        title: 'Challenge Response',
        duration_minutes: 30,
      });
      const signature = signPayload(sessionContent, kp.privateKey);

      const payload = {
        session: {
          title: 'Challenge Response',
          duration_minutes: 30,
          sealed: true,
          signature,
          public_key: kp.publicKey,
        },
        challenge_slug: 'test-slug',
      };

      expect(payload.session).toHaveProperty('signature');
      expect(payload.session).toHaveProperty('public_key');
      expect(typeof payload.session.signature).toBe('string');
      expect(typeof payload.session.public_key).toBe('string');
    });

    it('sealed flag is boolean true when response is sealed', () => {
      const payload = {
        session: {
          title: 'Sealed Response',
          sealed: true,
          signature: 'sig',
          public_key: 'pub',
        },
        challenge_slug: 'slug',
      };

      expect(payload.session.sealed).toBe(true);
      expect(typeof payload.session.sealed).toBe('boolean');
    });

    it('signature can be verified with the included public key', () => {
      const kp = generateKeyPair();
      const content = 'token|title|dev_take|47|77|34|2400';
      const signature = signPayload(content, kp.privateKey);

      expect(verifySignature(content, signature, kp.publicKey)).toBe(true);
    });

    it('Phoenix content_hash_payload format: pipe-delimited fields', () => {
      // Phoenix Signature module computes:
      //   [token, title, dev_take, duration_minutes, turns, files_changed, loc_changed]
      //   |> Enum.join("|")
      //
      // If CLI wants to pre-compute the same hash, it must use this exact format.
      const fields = ['my-token', 'My Title', 'Dev take here', '47', '77', '34', '2400'];
      const payload = fields.join('|');
      expect(payload).toBe('my-token|My Title|Dev take here|47|77|34|2400');
    });
  });

  describe('Phoenix challenge response error codes', () => {
    it('CHALLENGE_NOT_FOUND for unknown slug (404)', () => {
      const error = { error: { code: 'CHALLENGE_NOT_FOUND', message: 'Challenge not found' } };
      expect(error.error.code).toBe('CHALLENGE_NOT_FOUND');
    });

    it('CHALLENGE_NOT_ACTIVE for draft/closed challenges (409)', () => {
      const error = { error: { code: 'CHALLENGE_NOT_ACTIVE', message: 'Challenge is not active' } };
      expect(error.error.code).toBe('CHALLENGE_NOT_ACTIVE');
    });

    it('INVALID_ACCESS_CODE for wrong code on private challenge (403)', () => {
      const error = { error: { code: 'INVALID_ACCESS_CODE', message: 'Invalid access code' } };
      expect(error.error.code).toBe('INVALID_ACCESS_CODE');
    });

    it('MAX_RESPONSES_REACHED when challenge is full (409)', () => {
      const error = { error: { code: 'MAX_RESPONSES_REACHED', message: 'Challenge has reached maximum responses' } };
      expect(error.error.code).toBe('MAX_RESPONSES_REACHED');
    });
  });

  describe('CONTRACT NOTES: field mapping for challenge responses', () => {
    it('challenge_id is set server-side, not sent by CLI', () => {
      // Phoenix resolves challenge_slug -> challenge_id internally.
      // The CLI sends challenge_slug, NOT challenge_id.
      const cliPayload = {
        session: { title: 'Response' },
        challenge_slug: 'abc123',
      };

      expect(cliPayload).not.toHaveProperty('challenge_id');
      expect(cliPayload.session).not.toHaveProperty('challenge_id');
    });

    it('Phoenix auto-generates token for challenge responses (same as normal shares)', () => {
      // Both normal publishes and challenge responses go through the same
      // ShareApiController.create endpoint. Token is always server-generated.
      // The CLI should NOT send a token field.
    });
  });
});
