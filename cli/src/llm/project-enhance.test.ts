import { describe, it, expect, vi, beforeEach } from 'vitest';
import { enhanceProject, refineNarrative, type SessionSummary, type ProjectEnhanceResult } from './project-enhance.js';

// ── Mock Anthropic SDK ──────────────────────────────────────────

const { mockCreate, mockStream } = vi.hoisted(() => {
  const mockCreate = vi.fn();
  const mockStream = vi.fn();
  return { mockCreate, mockStream };
});

vi.mock('../settings.js', () => ({
  getAnthropicApiKey: vi.fn().mockReturnValue('sk-ant-test-key'),
}));

vi.mock('@anthropic-ai/sdk', () => {
  // Must be a class (constructor) since code uses `new Anthropic()`
  class MockAnthropic {
    messages = { create: mockCreate, stream: mockStream };
  }
  return { default: MockAnthropic };
});

// ── Fixtures ────────────────────────────────────────────────────

function makeSessionSummary(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    sessionId: 'ses-001',
    title: 'Auth middleware rewrite',
    developerTake: 'Tore out HS256, replaced with Ed25519.',
    skills: ['TypeScript', 'Cryptography'],
    executionSteps: [
      { title: 'Audited legacy auth', body: 'Found three overlapping token systems.' },
      { title: 'Implemented Ed25519', body: 'Replaced HMAC with Ed25519.' },
    ],
    duration: 47,
    loc: 312,
    turns: 23,
    files: 4,
    date: '2026-03-18',
    correctionCount: 3,
    ...overrides,
  };
}

const VALID_ENHANCE_RESULT: ProjectEnhanceResult = {
  narrative: 'A developer identity platform built from scratch with cryptographic verification.',
  arc: [
    { phase: 1, title: 'Foundation', description: 'CLI parser pipeline' },
    { phase: 2, title: 'Identity', description: 'Auth rewrite' },
    { phase: 3, title: 'Trust', description: 'Ed25519 sealing' },
    { phase: 4, title: 'Presentation', description: 'Portfolio rendering' },
  ],
  skills: ['TypeScript', 'Elixir', 'Ed25519'],
  timeline: [{
    period: 'Week 1',
    label: 'Foundation and auth',
    sessions: [
      { sessionId: 'ses-001', title: 'Auth rewrite', featured: true, tag: 'key decision' },
      { sessionId: 'ses-002', title: 'Config setup', featured: false },
    ],
  }],
  questions: [
    {
      id: 'q1',
      category: 'pattern',
      question: 'You overrode the AI 3 times. Was that a conscious strategy?',
      context: 'High correction count in auth session',
    },
    {
      id: 'q2',
      category: 'architecture',
      question: 'Why Ed25519 over RSA?',
      context: 'Crypto implementation detected',
    },
  ],
};

const VALID_REFINE_RESULT = {
  narrative: 'Built from scratch because trust needed to be structural, not bolted on.',
  timeline: VALID_ENHANCE_RESULT.timeline,
};

function mockResponse(json: unknown) {
  mockCreate.mockResolvedValue({
    content: [{ type: 'text', text: JSON.stringify(json) }],
  });
}

function mockResponseText(text: string) {
  mockCreate.mockResolvedValue({
    content: [{ type: 'text', text }],
  });
}

/**
 * Creates a mock async iterable that yields text_delta events for the stream API.
 * Splits text into chunks to simulate streaming.
 */
function mockStreamResponse(json: unknown) {
  const text = JSON.stringify(json);
  mockStreamFromText(text);
}

function mockStreamFromText(text: string) {
  // Split into chunks of ~20 chars to simulate streaming
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += 20) {
    chunks.push(text.slice(i, i + 20));
  }

  const events = chunks.map((chunk) => ({
    type: 'content_block_delta' as const,
    delta: { type: 'text_delta' as const, text: chunk },
  }));

  mockStream.mockReturnValue({
    [Symbol.asyncIterator]: async function* () {
      for (const event of events) {
        yield event;
      }
    },
  });
}

// ── Tests ───────────────────────────────────────────────────────

beforeEach(() => {
  mockCreate.mockReset();
  mockStream.mockReset();
});

describe('enhanceProject', () => {
  it('calls Anthropic stream with correct model and returns parsed result', async () => {
    mockStreamResponse(VALID_ENHANCE_RESULT);

    const sessions = [makeSessionSummary(), makeSessionSummary({ sessionId: 'ses-002', title: 'Config setup' })];
    const result = await enhanceProject(sessions, [{ title: 'Dep update', duration: 3, loc: 12 }]);

    expect(result.narrative).toBe(VALID_ENHANCE_RESULT.narrative);
    expect(result.arc).toHaveLength(4);
    expect(result.skills).toEqual(['TypeScript', 'Elixir', 'Ed25519']);
    expect(result.timeline).toHaveLength(1);
    expect(result.questions).toHaveLength(2);

    // Verify model
    expect(mockStream).toHaveBeenCalledOnce();
    const call = mockStream.mock.calls[0][0];
    expect(call.model).toBe('claude-sonnet-4-6');
  });

  it('includes session data in the prompt', async () => {
    mockStreamResponse(VALID_ENHANCE_RESULT);

    const sessions = [makeSessionSummary()];
    await enhanceProject(sessions, []);

    const call = mockStream.mock.calls[0][0];
    const userContent = call.messages[0].content;
    const parsed = JSON.parse(userContent);

    expect(parsed.sessions).toHaveLength(1);
    expect(parsed.sessions[0].sessionId).toBe('ses-001');
    expect(parsed.sessions[0].title).toBe('Auth middleware rewrite');
    expect(parsed.sessions[0].duration).toBe(47);
    expect(parsed.sessions[0].correctionCount).toBe(3);
  });

  it('includes skipped sessions in prompt', async () => {
    mockStreamResponse(VALID_ENHANCE_RESULT);

    await enhanceProject([makeSessionSummary()], [{ title: 'Dep update', duration: 3, loc: 12 }]);

    const call = mockStream.mock.calls[0][0];
    const parsed = JSON.parse(call.messages[0].content);
    expect(parsed.skippedSessions).toHaveLength(1);
    expect(parsed.skippedSessions[0].title).toBe('Dep update');
    expect(parsed.totalSessions).toBe(2);
  });

  it('assigns IDs to questions if missing', async () => {
    const resultNoIds = {
      ...VALID_ENHANCE_RESULT,
      questions: [
        { category: 'pattern', question: 'Why?', context: 'Signals' },
      ],
    };
    mockStreamResponse(resultNoIds);

    const result = await enhanceProject([makeSessionSummary()], []);
    expect(result.questions[0].id).toBe('q1');
  });

  it('defaults to empty questions array if LLM omits it', async () => {
    const noQuestions = { ...VALID_ENHANCE_RESULT };
    delete (noQuestions as Record<string, unknown>).questions;
    mockStreamResponse(noQuestions);

    const result = await enhanceProject([makeSessionSummary()], []);
    expect(result.questions).toEqual([]);
  });

  it('parses JSON wrapped in markdown code fences', async () => {
    mockStreamFromText('```json\n' + JSON.stringify(VALID_ENHANCE_RESULT) + '\n```');

    const result = await enhanceProject([makeSessionSummary()], []);
    expect(result.narrative).toBe(VALID_ENHANCE_RESULT.narrative);
  });

  it('throws on invalid JSON response', async () => {
    mockStreamFromText('I cannot generate a project narrative.');

    await expect(enhanceProject([makeSessionSummary()], []))
      .rejects.toThrow('No JSON object found');
  });

  it('throws on incomplete result (missing narrative)', async () => {
    mockStreamResponse({ arc: [], skills: [], timeline: [], questions: [] });

    await expect(enhanceProject([makeSessionSummary()], []))
      .rejects.toThrow('incomplete');
  });

  it('system prompt instructs question generation from signals', async () => {
    mockStreamResponse(VALID_ENHANCE_RESULT);
    await enhanceProject([makeSessionSummary()], []);

    const call = mockStream.mock.calls[0][0];
    expect(call.system).toContain('correction');
    expect(call.system).toContain('file overlap');
    expect(call.system).toContain('category');
  });

  it('sends execution step titles (not full bodies) to reduce token count', async () => {
    mockStreamResponse(VALID_ENHANCE_RESULT);
    await enhanceProject([makeSessionSummary()], []);

    const call = mockStream.mock.calls[0][0];
    const parsed = JSON.parse(call.messages[0].content);
    // executionSteps should be title-only strings, not objects
    expect(parsed.sessions[0].executionSteps).toEqual([
      'Audited legacy auth',
      'Implemented Ed25519',
    ]);
  });

  it('streams narrative_chunk events via onProgress callback', async () => {
    mockStreamResponse(VALID_ENHANCE_RESULT);

    const chunks: string[] = [];
    const onProgress = vi.fn((event: { type: string; text: string }) => {
      chunks.push(event.text);
    });

    const result = await enhanceProject([makeSessionSummary()], [], onProgress);

    expect(result.narrative).toBe(VALID_ENHANCE_RESULT.narrative);
    expect(onProgress).toHaveBeenCalled();
    // All chunks concatenated should equal the narrative
    const streamedNarrative = chunks.join('');
    expect(streamedNarrative).toBe(VALID_ENHANCE_RESULT.narrative);
  });

  it('works without onProgress callback (backward compatible)', async () => {
    mockStreamResponse(VALID_ENHANCE_RESULT);

    const result = await enhanceProject([makeSessionSummary()], []);
    expect(result.narrative).toBe(VALID_ENHANCE_RESULT.narrative);
  });
});

describe('refineNarrative', () => {
  it('calls Anthropic with draft + answers and returns refined result', async () => {
    mockResponse(VALID_REFINE_RESULT);

    const result = await refineNarrative(
      'Draft narrative.',
      VALID_ENHANCE_RESULT.timeline,
      [{ questionId: 'q1', question: 'Why override AI?', answer: 'It kept preserving backward compat.' }],
    );

    expect(result.narrative).toBe(VALID_REFINE_RESULT.narrative);
    expect(result.timeline).toHaveLength(1);

    const call = mockCreate.mock.calls[0][0];
    expect(call.model).toBe('claude-sonnet-4-6');
  });

  it('short-circuits when no answers provided', async () => {
    const result = await refineNarrative('Draft.', VALID_ENHANCE_RESULT.timeline, []);

    expect(result.narrative).toBe('Draft.');
    expect(result.timeline).toBe(VALID_ENHANCE_RESULT.timeline);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('short-circuits when all answers are empty strings', async () => {
    const result = await refineNarrative(
      'Draft.',
      VALID_ENHANCE_RESULT.timeline,
      [{ questionId: 'q1', question: 'Why?', answer: '   ' }],
    );

    expect(result.narrative).toBe('Draft.');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('includes answers in prompt to LLM', async () => {
    mockResponse(VALID_REFINE_RESULT);

    await refineNarrative(
      'Draft.',
      [],
      [{ questionId: 'q1', question: 'Why Ed25519?', answer: 'Trust is the product.' }],
    );

    const call = mockCreate.mock.calls[0][0];
    const parsed = JSON.parse(call.messages[0].content);
    expect(parsed.draftNarrative).toBe('Draft.');
    expect(parsed.answers).toHaveLength(1);
    expect(parsed.answers[0].answer).toBe('Trust is the product.');
  });

  it('falls back to draft timeline if LLM omits timeline', async () => {
    mockResponse({ narrative: 'Refined.', timeline: null });

    const result = await refineNarrative('Draft.', VALID_ENHANCE_RESULT.timeline, [
      { questionId: 'q1', question: 'Q?', answer: 'A.' },
    ]);

    expect(result.narrative).toBe('Refined.');
    expect(result.timeline).toEqual(VALID_ENHANCE_RESULT.timeline);
  });

  it('system prompt enforces no-fluff rules', async () => {
    mockResponse(VALID_REFINE_RESULT);

    await refineNarrative('Draft.', [], [
      { questionId: 'q1', question: 'Q?', answer: 'A.' },
    ]);

    const call = mockCreate.mock.calls[0][0];
    expect(call.system).toContain('leverage');
    expect(call.system).toContain('developer thinking out loud');
  });

  it('throws on invalid JSON response', async () => {
    mockResponseText('Sure, here is the refined version...');

    await expect(refineNarrative('Draft.', [], [
      { questionId: 'q1', question: 'Q?', answer: 'A.' },
    ])).rejects.toThrow('No JSON object found');
  });
});
