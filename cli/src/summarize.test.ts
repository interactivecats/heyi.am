import { describe, it, expect, vi } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import type { Session } from './analyzer.js';
import {
  containsBannedWords,
  stripBannedWords,
  parseEnhancementResult,
  summarizeSession,
  summarizeSessionStream,
  scoreTurn,
  sampleSession,
  _buildSystemPrompt,
  _buildUserPrompt,
} from './summarize.js';
import type { TurnEvent } from './analyzer.js';

// ── Fixtures ─────────────────────────────────────────────────

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'ses-test-001',
    title: 'Refactor auth middleware',
    date: '2026-03-18T14:32:00Z',
    durationMinutes: 47,
    turns: 23,
    linesOfCode: 312,
    status: 'draft',
    projectName: 'auth-service',
    rawLog: ['> started refactor', '> removed legacy code'],
    skills: ['TypeScript', 'Node.js'],
    executionPath: [
      { stepNumber: 1, title: 'Analyzed auth.ts', description: 'Read existing middleware', type: 'analysis' },
      { stepNumber: 2, title: 'Rewrote token logic', description: 'Switched to Ed25519', type: 'implementation' },
    ],
    toolBreakdown: [
      { tool: 'Read', count: 28 },
      { tool: 'Edit', count: 22 },
    ],
    filesChanged: [
      { path: 'src/middleware/auth.ts', additions: 241, deletions: 112 },
      { path: 'test/auth.test.ts', additions: 156, deletions: 42 },
    ],
    turnTimeline: [
      { timestamp: '14:02:11', type: 'prompt', content: 'Tear out the old auth' },
      { timestamp: '14:08:30', type: 'tool', content: 'Read src/middleware/auth.ts' },
    ],
    toolCalls: 50,
    ...overrides,
  };
}

const VALID_AI_RESPONSE = JSON.stringify({
  title: 'Rebuilt auth middleware with Ed25519 signing',
  context: 'Legacy auth used HS256 with single token. Needed asymmetric signing for microservice verification.',
  developerTake: 'The hard part was getting token rotation right without race conditions on concurrent requests. Ed25519 simplified the verification chain.',
  skills: ['TypeScript', 'Ed25519', 'Node.js'],
  questions: [
    { text: 'Why did you tear out auth entirely instead of patching?', suggestedAnswer: 'Three overlapping token systems — patching would have preserved the mess.' },
    { text: 'What broke during the Ed25519 migration?', suggestedAnswer: 'Key distribution to edge nodes needed a new config path.' },
    { text: 'Would you write migration tests first next time?', suggestedAnswer: 'Yes — manual migration was error-prone.' },
  ],
  executionSteps: [
    { stepNumber: 1, title: 'Audited legacy auth', body: 'Found three overlapping token systems in auth.ts. None properly revocable.' },
    { stepNumber: 2, title: 'Stripped HS256 dependency', body: 'Removed symmetric signing. Replaced with Ed25519 keypair generation.' },
    { stepNumber: 3, title: 'Added refresh token rotation', body: 'Built Redis-backed rotation with 30s grace window for concurrent requests.' },
    { stepNumber: 4, title: 'Fixed edge node verification', body: 'Distributed public keys via config service instead of shared secrets.' },
    { stepNumber: 5, title: 'Ran full test suite', body: '42 specs passing. Zero regressions from the rewrite.' },
  ],
});

// ── Banned word tests ────────────────────────────────────────

describe('banned words', () => {
  it('detects banned words', () => {
    expect(containsBannedWords('We leverage the API to streamline deploys')).toEqual(['leverage', 'streamline']);
  });

  it('returns empty array for clean text', () => {
    expect(containsBannedWords('Removed the old middleware and rewrote it')).toEqual([]);
  });

  it('is case-insensitive', () => {
    expect(containsBannedWords('ROBUST and Seamless')).toEqual(['robust', 'seamless']);
  });

  it('strips banned words from text', () => {
    expect(stripBannedWords('We leverage the robust API')).toBe('We the API');
  });
});

// ── Parse tests ──────────────────────────────────────────────

describe('parseEnhancementResult', () => {
  it('parses valid JSON response', () => {
    const result = parseEnhancementResult(VALID_AI_RESPONSE);
    expect(result.title).toBe('Rebuilt auth middleware with Ed25519 signing');
    expect(result.skills).toEqual(['TypeScript', 'Ed25519', 'Node.js']);
    expect(result.questions).toHaveLength(3);
    expect(result.executionSteps).toHaveLength(5);
  });

  it('parses JSON wrapped in markdown code fences', () => {
    const wrapped = '```json\n' + VALID_AI_RESPONSE + '\n```';
    const result = parseEnhancementResult(wrapped);
    expect(result.title).toBe('Rebuilt auth middleware with Ed25519 signing');
  });

  it('enforces title max length of 80 chars', () => {
    const long = JSON.stringify({
      title: 'A'.repeat(100),
      context: '',
      developerTake: '',
      skills: [],
      questions: [],
      executionSteps: [],
    });
    const result = parseEnhancementResult(long);
    expect(result.title.length).toBeLessThanOrEqual(80);
  });

  it('enforces context max length of 200 chars', () => {
    const long = JSON.stringify({
      title: 'Test',
      context: 'B'.repeat(250),
      developerTake: '',
      skills: [],
      questions: [],
      executionSteps: [],
    });
    const result = parseEnhancementResult(long);
    expect(result.context.length).toBeLessThanOrEqual(200);
  });

  it('enforces developer take max length of 300 chars', () => {
    const long = JSON.stringify({
      title: 'Test',
      context: '',
      developerTake: 'C'.repeat(350),
      skills: [],
      questions: [],
      executionSteps: [],
    });
    const result = parseEnhancementResult(long);
    expect(result.developerTake.length).toBeLessThanOrEqual(300);
  });

  it('limits execution steps to 7', () => {
    const steps = Array.from({ length: 10 }, (_, i) => ({
      stepNumber: i + 1,
      title: `Step ${i + 1}`,
      body: `Did thing ${i + 1}`,
    }));
    const json = JSON.stringify({
      title: 'Test',
      context: '',
      developerTake: '',
      skills: [],
      questions: [],
      executionSteps: steps,
    });
    const result = parseEnhancementResult(json);
    expect(result.executionSteps.length).toBeLessThanOrEqual(7);
  });

  it('limits questions to 3', () => {
    const questions = Array.from({ length: 5 }, (_, i) => ({
      text: `Question ${i + 1}`,
      suggestedAnswer: `Answer ${i + 1}`,
    }));
    const json = JSON.stringify({
      title: 'Test',
      context: '',
      developerTake: '',
      skills: [],
      questions,
      executionSteps: [],
    });
    const result = parseEnhancementResult(json);
    expect(result.questions.length).toBeLessThanOrEqual(3);
  });

  it('strips banned words from all text fields', () => {
    const json = JSON.stringify({
      title: 'We leverage the auth system',
      context: 'A robust system',
      developerTake: 'Seamless integration',
      skills: ['TypeScript'],
      questions: [{ text: 'How to utilize it?', suggestedAnswer: 'Streamline the process' }],
      executionSteps: [{ stepNumber: 1, title: 'Enhance the code', body: 'A robust refactor' }],
    });
    const result = parseEnhancementResult(json);
    expect(containsBannedWords(result.title)).toEqual([]);
    expect(containsBannedWords(result.context)).toEqual([]);
    expect(containsBannedWords(result.developerTake)).toEqual([]);
    expect(containsBannedWords(result.questions[0].text)).toEqual([]);
    expect(containsBannedWords(result.questions[0].suggestedAnswer)).toEqual([]);
    expect(containsBannedWords(result.executionSteps[0].title)).toEqual([]);
    expect(containsBannedWords(result.executionSteps[0].body)).toEqual([]);
  });

  it('throws on invalid JSON', () => {
    expect(() => parseEnhancementResult('not json at all')).toThrow('Failed to parse');
  });

  it('handles missing fields gracefully', () => {
    const result = parseEnhancementResult('{}');
    expect(result.title).toBe('');
    expect(result.skills).toEqual([]);
    expect(result.questions).toEqual([]);
    expect(result.executionSteps).toEqual([]);
  });
});

// ── Prompt construction tests ────────────────────────────────

describe('prompt construction', () => {
  it('system prompt includes all banned words', () => {
    const prompt = _buildSystemPrompt();
    for (const word of ['leverage', 'utilize', 'streamline', 'enhance', 'robust', 'seamless']) {
      expect(prompt).toContain(word);
    }
  });

  it('system prompt specifies max constraints', () => {
    const prompt = _buildSystemPrompt();
    expect(prompt).toContain('80');
    expect(prompt).toContain('200');
    expect(prompt).toContain('300');
    expect(prompt).toContain('20 words');
    expect(prompt).toContain('40 words');
  });

  it('user prompt includes session data', () => {
    const session = makeSession();
    const prompt = _buildUserPrompt(session);
    expect(prompt).toContain('auth-service');
    expect(prompt).toContain('47 min');
    expect(prompt).toContain('23 turns');
    expect(prompt).toContain('TypeScript');
    expect(prompt).toContain('auth.ts');
  });

  it('user prompt includes developer prompts from timeline', () => {
    const session = makeSession();
    const prompt = _buildUserPrompt(session);
    expect(prompt).toContain('Tear out the old auth');
  });
});

// ── Mocked Anthropic client tests ────────────────────────────

function createMockClient(responseText: string) {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: responseText }],
      }),
      stream: vi.fn().mockReturnValue({
        [Symbol.asyncIterator]: async function* () {
          // Simulate streaming in chunks
          const chunks = responseText.match(/.{1,50}/g) ?? [responseText];
          for (const chunk of chunks) {
            yield {
              type: 'content_block_delta' as const,
              delta: { type: 'text_delta' as const, text: chunk },
            };
          }
        },
      }),
    },
  } as unknown as Anthropic;
}

describe('summarizeSession', () => {
  it('calls Anthropic API and returns parsed result', async () => {
    const mockClient = createMockClient(VALID_AI_RESPONSE);
    const session = makeSession();

    const result = await summarizeSession(session, { client: mockClient });

    expect(result.title).toBe('Rebuilt auth middleware with Ed25519 signing');
    expect(result.skills).toContain('Ed25519');
    expect(result.questions).toHaveLength(3);
    expect(result.executionSteps).toHaveLength(5);

    expect(mockClient.messages.create).toHaveBeenCalledOnce();
    const call = (mockClient.messages.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.model).toBe('claude-sonnet-4-6');
    expect(call.system).toContain('leverage');
  });

  it('uses custom model when specified', async () => {
    const mockClient = createMockClient(VALID_AI_RESPONSE);
    const session = makeSession();

    await summarizeSession(session, { client: mockClient, model: 'claude-haiku-4-5-20251001' });

    const call = (mockClient.messages.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.model).toBe('claude-haiku-4-5-20251001');
  });
});

// ── Sampling tests ────────────────────────────────────────────

function makeTurn(
  type: TurnEvent['type'],
  content: string,
  timestamp = '00:00:00',
): TurnEvent {
  return { type, content, timestamp };
}

function makeTimeline(n: number): TurnEvent[] {
  return Array.from({ length: n }, (_, i) => {
    const type: TurnEvent['type'] = i % 4 === 0 ? 'prompt' : i % 4 === 1 ? 'tool' : i % 4 === 2 ? 'response' : 'error';
    return makeTurn(type, `turn ${i} content`, `00:${String(i).padStart(2, '0')}:00`);
  });
}

describe('scoreTurn', () => {
  it('scores prompt type +1', () => {
    const t = makeTurn('prompt', 'do something');
    expect(scoreTurn(t, [t], 0)).toBeGreaterThanOrEqual(1);
  });

  it('scores error type +1', () => {
    const t = makeTurn('error', 'compilation failed');
    expect(scoreTurn(t, [t], 0)).toBeGreaterThanOrEqual(1);
  });

  it('scores self-correction keywords +1', () => {
    const turns = [
      makeTurn('response', 'ok done'),
      makeTurn('prompt', 'wait, that is wrong'),
    ];
    const score = scoreTurn(turns[1], turns, 1);
    // prompt (+1) + self-correction pattern (+1)
    expect(score).toBeGreaterThanOrEqual(2);
  });

  it('scores content length > 200 +1', () => {
    const longContent = 'x'.repeat(201);
    const t = makeTurn('response', longContent);
    expect(scoreTurn(t, [t], 0)).toBeGreaterThanOrEqual(1);
  });

  it('scores recovery after error +1', () => {
    const turns = [
      makeTurn('error', 'crash'),
      makeTurn('prompt', 'fix it'),
    ];
    const score = scoreTurn(turns[1], turns, 1);
    // prompt (+1) + previous was error (+1)
    expect(score).toBeGreaterThanOrEqual(2);
  });

  it('max possible score is 5', () => {
    const prev = makeTurn('error', 'crash');
    const turn = makeTurn('prompt', `actually wait no, that is wrong ${'x'.repeat(201)}`);
    const score = scoreTurn(turn, [prev, turn], 1);
    expect(score).toBeLessThanOrEqual(5);
  });
});

describe('sampleSession', () => {
  it('passes through unchanged when N <= 50', () => {
    const session = makeSession({
      turns: 30,
      turnTimeline: makeTimeline(30),
      rawLog: Array.from({ length: 30 }, (_, i) => `line ${i}`),
    });
    const result = sampleSession(session);
    expect(result.sampled).toBe(false);
    expect(result.totalTurns).toBe(30);
    expect(result.turns).toHaveLength(30);
    expect(result.log).toHaveLength(30);
  });

  it('passes through N=50 (boundary)', () => {
    const session = makeSession({
      turns: 50,
      turnTimeline: makeTimeline(50),
      rawLog: Array.from({ length: 50 }, (_, i) => `line ${i}`),
    });
    const result = sampleSession(session);
    expect(result.sampled).toBe(false);
  });

  it('samples when N=500, sampled=true', () => {
    const session = makeSession({
      turns: 500,
      turnTimeline: makeTimeline(500),
      rawLog: Array.from({ length: 500 }, (_, i) => `line ${i}`),
    });
    const result = sampleSession(session);
    expect(result.sampled).toBe(true);
    expect(result.totalTurns).toBe(500);
  });

  it('selected turns cover all three thirds for N=500', () => {
    const timeline = makeTimeline(500);
    const session = makeSession({ turns: 500, turnTimeline: timeline, rawLog: [] });
    const result = sampleSession(session);

    // Each turn has [T{n}/500] annotation — extract position numbers
    const positions = result.turns.map((t) => {
      const m = t.content.match(/\[T(\d+)\/500\]/);
      return m ? parseInt(m[1], 10) : null;
    }).filter((p): p is number => p !== null);

    const third = Math.floor(500 / 3);
    const fromBeginning = positions.filter((p) => p <= third);
    const fromMiddle = positions.filter((p) => p > third && p <= 2 * third);
    const fromEnd = positions.filter((p) => p > 2 * third);

    expect(fromBeginning.length).toBeGreaterThan(0);
    expect(fromMiddle.length).toBeGreaterThan(0);
    expect(fromEnd.length).toBeGreaterThan(0);
  });

  it('high-signal turns beat low-signal within the same third', () => {
    // Build a 200-turn session where turns 60-80 contain self-correction keywords
    const timeline: TurnEvent[] = Array.from({ length: 200 }, (_, i) => {
      if (i >= 60 && i < 70) {
        return makeTurn('prompt', `wait, actually this is wrong and I need to reconsider ${'x'.repeat(201)}`);
      }
      return makeTurn('response', `turn ${i}`);
    });

    const session = makeSession({ turns: 200, turnTimeline: timeline, rawLog: [] });
    const result = sampleSession(session);

    // The high-signal turns are in the middle third (~67-133). At least some should be selected.
    const positions = result.turns.map((t) => {
      const m = t.content.match(/\[T(\d+)\/200\]/);
      return m ? parseInt(m[1], 10) : null;
    }).filter((p): p is number => p !== null);

    // Turns 61-70 (1-indexed) should appear since they have max signal
    const highSignalSelected = positions.filter((p) => p >= 61 && p <= 70);
    expect(highSignalSelected.length).toBeGreaterThan(0);
  });

  it('annotations use correct T{n}/{total} format', () => {
    const session = makeSession({
      turns: 100,
      turnTimeline: makeTimeline(100),
      rawLog: Array.from({ length: 100 }, (_, i) => `line ${i}`),
    });
    const result = sampleSession(session);
    expect(result.sampled).toBe(true);

    // Every annotated turn should match the pattern
    for (const turn of result.turns) {
      expect(turn.content).toMatch(/\[T\d+\/100\]/);
    }

    for (const line of result.log) {
      expect(line).toMatch(/\[T\d+\/100\]/);
    }
  });

  it('result turns are in chronological order', () => {
    const session = makeSession({
      turns: 200,
      turnTimeline: makeTimeline(200),
      rawLog: Array.from({ length: 200 }, (_, i) => `line ${i}`),
    });
    const result = sampleSession(session);

    const positions = result.turns.map((t) => {
      const m = t.content.match(/\[T(\d+)\/200\]/);
      return m ? parseInt(m[1], 10) : 0;
    });

    for (let i = 1; i < positions.length; i++) {
      expect(positions[i]).toBeGreaterThanOrEqual(positions[i - 1]);
    }
  });
});

describe('buildUserPrompt with sampling', () => {
  it('for a 500-turn session the prompt contains the SAMPLED header', () => {
    const session = makeSession({
      turns: 500,
      turnTimeline: makeTimeline(500),
      rawLog: Array.from({ length: 500 }, (_, i) => `log line ${i}`),
    });
    const prompt = _buildUserPrompt(session);
    expect(prompt).toContain('[SAMPLED:');
    expect(prompt).toContain('500');
  });

  it('for a 500-turn session the prompt is under 32000 characters', () => {
    const session = makeSession({
      turns: 500,
      turnTimeline: makeTimeline(500),
      rawLog: Array.from({ length: 500 }, (_, i) => `log line ${i} with some content to simulate real log output`),
    });
    const prompt = _buildUserPrompt(session);
    expect(prompt.length).toBeLessThan(32000);
  });

  it('for a short session the prompt does not contain SAMPLED header', () => {
    const session = makeSession({
      turns: 20,
      turnTimeline: makeTimeline(20),
      rawLog: Array.from({ length: 20 }, (_, i) => `line ${i}`),
    });
    const prompt = _buildUserPrompt(session);
    expect(prompt).not.toContain('[SAMPLED:');
  });
});

describe('summarizeSessionStream', () => {
  it('emits structured events in correct order', async () => {
    const mockClient = createMockClient(VALID_AI_RESPONSE);
    const session = makeSession();

    const events: Array<{ type: string }> = [];
    for await (const event of summarizeSessionStream(session, { client: mockClient })) {
      events.push(event);
    }

    const types = events.map((e) => e.type);
    expect(types[0]).toBe('title');
    expect(types[1]).toBe('context');
    expect(types[2]).toBe('skills');
    // Steps follow
    expect(types.filter((t) => t === 'step').length).toBe(5);
    expect(types).toContain('developer_take');
    expect(types.filter((t) => t === 'question').length).toBe(3);
    expect(types[types.length - 1]).toBe('done');
  });

  it('emits error event on API failure', async () => {
    const mockClient = {
      messages: {
        stream: vi.fn().mockReturnValue({
          [Symbol.asyncIterator]: async function* () {
            throw new Error('API rate limited');
          },
        }),
      },
    } as unknown as Anthropic;

    const session = makeSession();
    const events: Array<{ type: string; data: unknown }> = [];
    for await (const event of summarizeSessionStream(session, { client: mockClient })) {
      events.push(event);
    }

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('error');
    expect(events[0].data).toBe('API rate limited');
  });
});
