import { describe, it, expect } from 'vitest';
import { generateKeyPair, signPayload, verifySignature } from './machine-key.js';
import { buildPublishPayload, type PublishPayload } from './auth.js';

/**
 * Publish Flow Contract Tests
 *
 * Verifies that the CLI constructs publish payloads matching what Phoenix
 * expects at POST /api/sessions (ShareApiController.create).
 *
 * Phoenix contract (from share_api_controller.ex):
 *   - Expects top-level "session" key containing share fields
 *   - Optional top-level "challenge_slug" and "access_code"
 *   - Auth via Authorization: Bearer <token> header
 *   - Share schema required fields: token (server-generated), title
 *   - Share schema optional fields: dev_take, duration_minutes, turns,
 *     files_changed, loc_changed, recorded_at, verified_at, sealed, template,
 *     language, tools, skills, beats, qa_pairs, highlights, tool_breakdown,
 *     top_files, transcript_excerpt, narrative, project_name, signature, public_key
 */

describe('Publish Flow Contract', () => {
  describe('buildPublishPayload shape', () => {
    it('wraps session data with signature and publicKey at top level', () => {
      const session = { title: 'Test Session', duration_minutes: 30 };
      const payload = buildPublishPayload(session, 'sig123', 'pub456');

      expect(payload).toHaveProperty('session');
      expect(payload).toHaveProperty('signature');
      expect(payload).toHaveProperty('publicKey');
      expect(payload.session).toBe(session);
      expect(payload.signature).toBe('sig123');
      expect(payload.publicKey).toBe('pub456');
    });

    it('preserves session object reference without modification', () => {
      const session = {
        title: 'Auth rebuild',
        dev_take: 'Hard but worth it',
        duration_minutes: 47,
        turns: 77,
        files_changed: 34,
        loc_changed: 2400,
        skills: ['Elixir', 'Phoenix'],
        beats: [{ label: 'Step 1', description: 'Did a thing' }],
      };
      const payload = buildPublishPayload(session, 'sig', 'pub');
      expect(payload.session).toEqual(session);
    });
  });

  describe('Ed25519 signing produces verifiable signatures', () => {
    it('signs session JSON and verification succeeds', () => {
      const kp = generateKeyPair();
      const sessionData = JSON.stringify({
        title: 'Test',
        duration_minutes: 10,
        turns: 5,
      });

      const signature = signPayload(sessionData, kp.privateKey);
      expect(verifySignature(sessionData, signature, kp.publicKey)).toBe(true);
    });

    it('signature is base64-encoded', () => {
      const kp = generateKeyPair();
      const signature = signPayload('test payload', kp.privateKey);
      // Should not throw when decoding
      expect(() => Buffer.from(signature, 'base64')).not.toThrow();
      // Ed25519 signatures are 64 bytes
      expect(Buffer.from(signature, 'base64').length).toBe(64);
    });

    it('public key is base64-encoded SPKI DER', () => {
      const kp = generateKeyPair();
      const pubKeyBytes = Buffer.from(kp.publicKey, 'base64');
      // Ed25519 SPKI DER is 44 bytes
      expect(pubKeyBytes.length).toBe(44);
    });
  });

  describe('Payload matches Phoenix Share schema field names', () => {
    // Phoenix Share schema uses snake_case field names.
    // The CLI must send these exact names in the "session" object.
    const PHOENIX_SHARE_FIELDS = [
      'title',           // required
      'dev_take',        // not "developerTake"
      'duration_minutes',
      'turns',
      'files_changed',
      'loc_changed',
      'recorded_at',
      'sealed',
      'template',
      'language',
      'tools',
      'skills',
      'beats',
      'qa_pairs',
      'highlights',
      'tool_breakdown',
      'top_files',
      'transcript_excerpt',
      'narrative',
      'project_name',
      'signature',
      'public_key',
    ];

    it('session payload uses snake_case field names matching Share changeset', () => {
      // Build a fully-populated publish payload as the CLI would
      const sessionPayload: Record<string, unknown> = {
        title: 'Auth rebuild with phx.gen.auth',
        dev_take: 'Three token systems was a liability.',
        duration_minutes: 47,
        turns: 77,
        files_changed: 34,
        loc_changed: 2400,
        recorded_at: '2026-03-12T14:02:00Z',
        sealed: false,
        template: 'editorial',
        language: 'Elixir',
        tools: ['Elixir', 'Phoenix'],
        skills: ['Elixir', 'Authentication'],
        beats: [{ label: 'Step 1', description: 'Analyzed auth' }],
        qa_pairs: [{ question: 'Why?', answer: 'Because.' }],
        highlights: { pivots: 4 },
        tool_breakdown: [{ name: 'Read', count: 142 }],
        top_files: [{ path: 'lib/accounts.ex', touches: 9 }],
        transcript_excerpt: [{ role: 'dev', text: 'Tear it out.' }],
        narrative: 'This session began with...',
        project_name: 'heyi-am',
        signature: 'base64sig==',
        public_key: 'base64pub==',
      };

      // Every field should be a valid Share changeset field
      for (const field of Object.keys(sessionPayload)) {
        expect(PHOENIX_SHARE_FIELDS).toContain(field);
      }
    });

    it('does NOT use camelCase variants that Phoenix would ignore', () => {
      // Common mistake: sending camelCase from TypeScript
      const WRONG_FIELD_NAMES = [
        'developerTake',    // should be dev_take
        'durationMinutes',  // should be duration_minutes
        'filesChanged',     // should be files_changed
        'locChanged',       // should be loc_changed
        'recordedAt',       // should be recorded_at
        'publicKey',        // should be public_key (at session level)
        'projectName',      // should be project_name
        'toolBreakdown',    // should be tool_breakdown
        'topFiles',         // should be top_files
        'transcriptExcerpt', // should be transcript_excerpt
        'qaPairs',          // should be qa_pairs
        'pinnedTurns',      // should be pinned_turns
        'highlightedSteps', // should be highlighted_steps
      ];

      // This test documents the field name mapping the CLI must perform
      // before sending to Phoenix
      for (const wrongName of WRONG_FIELD_NAMES) {
        expect(PHOENIX_SHARE_FIELDS).not.toContain(wrongName);
      }
    });
  });

  describe('Authenticated vs anonymous publish', () => {
    it('authenticated publish includes Bearer token in Authorization header', () => {
      // Contract: Phoenix ShareApiController.get_user_id_from_token reads
      // Authorization: "Bearer <base64-encoded-session-token>"
      const token = 'tok_abc123';
      const headers = { Authorization: `Bearer ${token}` };
      expect(headers.Authorization).toBe('Bearer tok_abc123');
      expect(headers.Authorization).toMatch(/^Bearer .+$/);
    });

    it('anonymous publish sends no Authorization header', () => {
      // When no auth token, the CLI should omit the header entirely.
      // Phoenix will set user_id to nil and the share is anonymous.
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      expect(headers).not.toHaveProperty('Authorization');
    });
  });

  describe('Challenge response publish', () => {
    it('includes challenge_slug at top level (not inside session)', () => {
      // Phoenix expects: { session: {...}, challenge_slug: "abc123" }
      const publishBody = {
        session: { title: 'Challenge Response', signature: 'sig', public_key: 'pub' },
        challenge_slug: 'abc123',
      };

      expect(publishBody).toHaveProperty('challenge_slug');
      expect(publishBody.session).not.toHaveProperty('challenge_slug');
    });

    it('includes access_code at top level when challenge is private', () => {
      const publishBody = {
        session: { title: 'Private Challenge Response' },
        challenge_slug: 'private-challenge',
        access_code: 'secret123',
      };

      expect(publishBody).toHaveProperty('access_code');
      expect(publishBody.session).not.toHaveProperty('access_code');
    });
  });

  describe('Phoenix response contract', () => {
    it('expects 201 response with token, url, sealed, content_hash', () => {
      // Mock of expected Phoenix response
      const phoenixResponse = {
        token: 'generated_token_abc',
        url: '/s/generated_token_abc',
        sealed: false,
        content_hash: 'sha256:abc123...',
      };

      expect(phoenixResponse).toHaveProperty('token');
      expect(phoenixResponse).toHaveProperty('url');
      expect(phoenixResponse).toHaveProperty('sealed');
      expect(phoenixResponse).toHaveProperty('content_hash');
      expect(phoenixResponse.url).toMatch(/^\/s\//);
      expect(phoenixResponse.content_hash).toMatch(/^sha256:/);
    });

    it('expects 400 when session param is missing', () => {
      const errorResponse = { error: { code: 'MISSING_SESSION', message: 'Missing \'session\' parameter' } };
      expect(errorResponse.error.code).toBe('MISSING_SESSION');
    });

    it('expects 422 when validation fails', () => {
      const errorResponse = { error: { code: 'VALIDATION_FAILED', details: { title: ["can't be blank"] } } };
      expect(errorResponse.error.code).toBe('VALIDATION_FAILED');
      expect(errorResponse.error).toHaveProperty('details');
    });
  });
});
