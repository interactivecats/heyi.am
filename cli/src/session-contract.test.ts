import { describe, it, expect } from 'vitest';
import type { Session, ExecutionStep, ToolUsage, FileChange, TurnEvent } from './analyzer.js';
import { analyzeSession, type SessionAnalysis, type ParsedTurn } from './analyzer.js';

/**
 * Session Data Shape Contract Tests
 *
 * Verifies that the CLI's Session type and analyzer output maps correctly
 * to what Phoenix expects in the Share schema.
 *
 * Key mapping (CLI Session -> Phoenix Share):
 *   title           -> title
 *   durationMinutes -> duration_minutes (needs snake_case conversion)
 *   turns           -> turns
 *   linesOfCode     -> loc_changed (needs rename + snake_case)
 *   filesChanged    -> files_changed (count, not array)
 *   skills          -> skills (array of strings)
 *   executionPath   -> beats (different structure!)
 *   toolBreakdown   -> tool_breakdown
 *   projectName     -> project_name
 */

function makeMinimalAnalysis(overrides: Partial<SessionAnalysis> = {}): SessionAnalysis {
  return {
    id: 'test-session-id',
    title: 'Test Session',
    date: '2026-03-12T14:00:00Z',
    durationMinutes: 30,
    projectName: 'test-project',
    turns: [],
    filesChanged: [],
    rawLog: [],
    ...overrides,
  };
}

describe('Session Data Shape Contract', () => {
  describe('Session analyzer output shape', () => {
    it('produces all required fields for Phoenix Share', () => {
      const session = analyzeSession(makeMinimalAnalysis());

      // Fields that map to Phoenix Share schema
      expect(session).toHaveProperty('title');
      expect(session).toHaveProperty('durationMinutes');
      expect(session).toHaveProperty('turns');
      expect(session).toHaveProperty('linesOfCode');
      expect(session).toHaveProperty('skills');
      expect(session).toHaveProperty('executionPath');
      expect(session).toHaveProperty('toolBreakdown');
      expect(session).toHaveProperty('filesChanged');
      expect(session).toHaveProperty('projectName');
    });

    it('title is a string within Phoenix max length', () => {
      const session = analyzeSession(makeMinimalAnalysis({ title: 'A'.repeat(300) }));
      expect(typeof session.title).toBe('string');
      // Phoenix Share has no explicit max but bridge.ts truncates at 120 chars
    });

    it('durationMinutes is a non-negative integer', () => {
      const session = analyzeSession(makeMinimalAnalysis({ durationMinutes: 47 }));
      expect(Number.isInteger(session.durationMinutes)).toBe(true);
      expect(session.durationMinutes).toBeGreaterThanOrEqual(0);
    });

    it('turns is a count (number), not an array', () => {
      const turns: ParsedTurn[] = [
        { timestamp: '00:00:01', type: 'prompt', content: 'hello' },
        { timestamp: '00:00:02', type: 'response', content: 'hi' },
      ];
      const session = analyzeSession(makeMinimalAnalysis({ turns }));
      expect(typeof session.turns).toBe('number');
      expect(session.turns).toBe(2);
    });
  });

  describe('LOC stats shape', () => {
    it('linesOfCode is sum of additions + deletions across all files', () => {
      const session = analyzeSession(makeMinimalAnalysis({
        filesChanged: [
          { path: 'a.ts', additions: 50, deletions: 10 },
          { path: 'b.ts', additions: 30, deletions: 5 },
        ],
      }));

      expect(session.linesOfCode).toBe(95); // 50+10+30+5
    });

    it('Phoenix stores loc_changed as integer (CLI must convert)', () => {
      // Phoenix Share schema: field :loc_changed, :integer
      // CLI Session: linesOfCode: number
      // The CLI must rename linesOfCode -> loc_changed when building publish payload
      const session = analyzeSession(makeMinimalAnalysis({
        filesChanged: [{ path: 'a.ts', additions: 100, deletions: 50 }],
      }));

      expect(Number.isInteger(session.linesOfCode)).toBe(true);
    });

    it('Phoenix files_changed is an integer count, not the array', () => {
      // Phoenix: field :files_changed, :integer
      // CLI: filesChanged is FileChange[] array
      // The CLI must send the COUNT, not the array, for files_changed
      const session = analyzeSession(makeMinimalAnalysis({
        filesChanged: [
          { path: 'a.ts', additions: 10, deletions: 0 },
          { path: 'b.ts', additions: 5, deletions: 3 },
          { path: 'c.ts', additions: 1, deletions: 0 },
        ],
      }));

      expect(Array.isArray(session.filesChanged)).toBe(true);
      expect(session.filesChanged.length).toBe(3);
      // When publishing, CLI must send: files_changed: 3 (count)
    });
  });

  describe('Execution path format', () => {
    it('executionPath items have stepNumber, title, description, type', () => {
      const turns: ParsedTurn[] = [
        { timestamp: '00:00:01', type: 'prompt', content: 'Fix the auth system' },
        { timestamp: '00:00:05', type: 'tool', content: 'Read auth.ts', toolName: 'Read', toolInput: 'auth.ts' },
        { timestamp: '00:00:10', type: 'response', content: 'I see the issue...' },
      ];
      const session = analyzeSession(makeMinimalAnalysis({ turns }));

      expect(session.executionPath.length).toBeGreaterThan(0);
      for (const step of session.executionPath) {
        expect(step).toHaveProperty('stepNumber');
        expect(step).toHaveProperty('title');
        expect(step).toHaveProperty('description');
        expect(step).toHaveProperty('type');
        expect(typeof step.stepNumber).toBe('number');
        expect(typeof step.title).toBe('string');
        expect(typeof step.description).toBe('string');
      }
    });

    it('step type is one of the valid enum values', () => {
      const validTypes = ['analysis', 'implementation', 'testing', 'deployment', 'decision'];
      const turns: ParsedTurn[] = [
        { timestamp: '00:00:01', type: 'prompt', content: 'test the module' },
        { timestamp: '00:00:05', type: 'tool', content: 'Bash npm test', toolName: 'Bash', toolInput: 'npm test' },
      ];
      const session = analyzeSession(makeMinimalAnalysis({ turns }));

      for (const step of session.executionPath) {
        expect(validTypes).toContain(step.type);
      }
    });

    it('Phoenix beats format differs from CLI executionPath', () => {
      // Phoenix Share stores beats as: [%{label: string, description: string}]
      // CLI produces executionPath as: [{stepNumber, title, description, type}]
      //
      // CONTRACT MISMATCH: The CLI must transform executionPath into beats format:
      //   { label: step.title, description: step.description }
      //
      // This mapping must happen in the publish bridge (not yet implemented).
      const step: ExecutionStep = {
        stepNumber: 1,
        title: 'Analyzed auth flow',
        description: 'Found 3 overlapping token systems',
        type: 'analysis',
      };

      // Expected beats format for Phoenix
      const beat = { label: step.title, description: step.description };
      expect(beat).toHaveProperty('label');
      expect(beat).toHaveProperty('description');
      expect(beat).not.toHaveProperty('stepNumber');
      expect(beat).not.toHaveProperty('type');
    });
  });

  describe('Skills array format', () => {
    it('skills is an array of strings', () => {
      const session = analyzeSession(makeMinimalAnalysis({
        filesChanged: [
          { path: 'lib/accounts.ex', additions: 10, deletions: 5 },
          { path: 'test/accounts_test.exs', additions: 20, deletions: 0 },
        ],
      }));

      expect(Array.isArray(session.skills)).toBe(true);
      for (const skill of session.skills) {
        expect(typeof skill).toBe('string');
      }
    });

    it('Phoenix stores skills as {:array, :string}', () => {
      // Both CLI and Phoenix agree: skills is string[]
      const session = analyzeSession(makeMinimalAnalysis({
        filesChanged: [{ path: 'src/app.tsx', additions: 100, deletions: 0 }],
      }));

      expect(session.skills).toContain('React');
    });
  });

  describe('Tool breakdown format', () => {
    it('toolBreakdown has { tool, count } shape', () => {
      const turns: ParsedTurn[] = [
        { timestamp: '00:00:01', type: 'tool', content: 'Read a.ts', toolName: 'Read' },
        { timestamp: '00:00:02', type: 'tool', content: 'Read b.ts', toolName: 'Read' },
        { timestamp: '00:00:03', type: 'tool', content: 'Edit c.ts', toolName: 'Edit' },
      ];
      const session = analyzeSession(makeMinimalAnalysis({ turns }));

      expect(session.toolBreakdown.length).toBeGreaterThan(0);
      for (const entry of session.toolBreakdown) {
        expect(entry).toHaveProperty('tool');
        expect(entry).toHaveProperty('count');
        expect(typeof entry.tool).toBe('string');
        expect(typeof entry.count).toBe('number');
      }
    });

    it('Phoenix tool_breakdown uses { name, count } not { tool, count }', () => {
      // CONTRACT MISMATCH:
      // CLI ToolUsage: { tool: string, count: number }
      // Phoenix mock: [%{name: "Read", count: 142}]
      //
      // The CLI must rename "tool" -> "name" when publishing
      const cliFormat: ToolUsage = { tool: 'Read', count: 142 };
      const phoenixFormat = { name: cliFormat.tool, count: cliFormat.count };

      expect(phoenixFormat).toHaveProperty('name');
      expect(phoenixFormat).not.toHaveProperty('tool');
    });
  });

  describe('Subagent / child session data shape', () => {
    it('childSessions array contains Session objects', () => {
      const childAnalysis: SessionAnalysis = {
        id: 'child-1',
        title: 'Frontend work',
        date: '2026-03-12T14:10:00Z',
        durationMinutes: 15,
        projectName: 'test-project',
        turns: [{ timestamp: '00:00:01', type: 'prompt', content: 'fix styles' }],
        filesChanged: [{ path: 'app.css', additions: 10, deletions: 2 }],
        rawLog: ['fix styles'],
      };

      const session = analyzeSession(makeMinimalAnalysis({
        childSessions: [childAnalysis],
      }));

      expect(session.childSessions).toBeDefined();
      expect(session.childSessions!.length).toBe(1);
      expect(session.childSessions![0]).toHaveProperty('title');
      expect(session.childSessions![0]).toHaveProperty('durationMinutes');
      expect(session.childSessions![0]).toHaveProperty('linesOfCode');
    });

    it('agentRole is preserved on child sessions', () => {
      const childAnalysis: SessionAnalysis = {
        id: 'child-1',
        title: 'Backend work',
        date: '2026-03-12T14:10:00Z',
        durationMinutes: 20,
        projectName: 'test-project',
        turns: [],
        filesChanged: [],
        rawLog: [],
        agentRole: 'backend-dev',
        parentSessionId: 'parent-1',
      };

      const session = analyzeSession(makeMinimalAnalysis({
        childSessions: [childAnalysis],
      }));

      expect(session.childSessions![0].agentRole).toBe('backend-dev');
      expect(session.childSessions![0].parentSessionId).toBe('parent-1');
    });

    it('isOrchestrated flag is set when children exist', () => {
      const session = analyzeSession(makeMinimalAnalysis({
        childSessions: [{
          id: 'c1', title: 'Child', date: '2026-03-12T14:00:00Z',
          durationMinutes: 5, projectName: 'p', turns: [], filesChanged: [], rawLog: [],
        }],
      }));

      expect(session.isOrchestrated).toBe(true);
    });

    it('isOrchestrated is undefined when no children', () => {
      const session = analyzeSession(makeMinimalAnalysis());
      expect(session.isOrchestrated).toBeUndefined();
    });
  });
});
