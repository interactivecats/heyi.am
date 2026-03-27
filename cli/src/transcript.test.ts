import { describe, it, expect } from 'vitest';
import { buildTranscript, buildTranscriptResponse } from './transcript.js';
import type { RawEntry } from './parsers/types.js';

function entry(overrides: Partial<RawEntry> & { type: string }): RawEntry {
  return {
    uuid: `uuid-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: '2026-03-26T10:00:00Z',
    sessionId: 'test-session',
    ...overrides,
  };
}

describe('buildTranscript', () => {
  it('converts a simple user + assistant exchange', () => {
    const entries: RawEntry[] = [
      entry({
        type: 'user',
        message: { role: 'user', content: 'Fix the login bug' },
      }),
      entry({
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Let me look at the auth module.' }],
          model: 'claude-sonnet-4-20250514',
        },
      }),
    ];

    const messages = buildTranscript(entries);
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('user');
    expect(messages[0].blocks).toEqual([{ type: 'text', text: 'Fix the login bug' }]);
    expect(messages[1].role).toBe('assistant');
    expect(messages[1].blocks).toEqual([{ type: 'text', text: 'Let me look at the auth module.' }]);
    expect(messages[1].model).toBe('claude-sonnet-4-20250514');
  });

  it('pairs tool_use blocks with tool_result blocks', () => {
    const entries: RawEntry[] = [
      entry({
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Reading the file.' },
            { type: 'tool_use', id: 'tool-1', name: 'Read', input: { file_path: 'src/auth.ts' } },
          ],
        },
      }),
      entry({
        type: 'user',
        message: {
          content: [
            { type: 'tool_result', tool_use_id: 'tool-1', content: 'export function login() {}' },
          ],
        },
      }),
    ];

    const messages = buildTranscript(entries);
    // Should only have 1 message (the assistant), user tool_result is plumbing
    expect(messages).toHaveLength(1);
    expect(messages[0].blocks).toHaveLength(2); // text + tool_call
    expect(messages[0].blocks[1]).toMatchObject({
      type: 'tool_call',
      toolName: 'Read',
      input: 'src/auth.ts',
      output: 'export function login() {}',
      isError: false,
    });
  });

  it('handles thinking blocks', () => {
    const entries: RawEntry[] = [
      entry({
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            { type: 'thinking', thinking: 'I need to check the auth module for null checks.' },
            { type: 'text', text: 'Found the issue.' },
          ],
        },
      }),
    ];

    const messages = buildTranscript(entries);
    expect(messages).toHaveLength(1);
    expect(messages[0].blocks[0]).toMatchObject({
      type: 'thinking',
      text: 'I need to check the auth module for null checks.',
    });
    expect(messages[0].blocks[1]).toMatchObject({
      type: 'text',
      text: 'Found the issue.',
    });
  });

  it('skips system and meta entries', () => {
    const entries: RawEntry[] = [
      entry({ type: 'system', message: { content: 'session started' } }),
      entry({ type: 'progress' }),
      entry({ type: 'file-history-snapshot' }),
      entry({ type: 'user', message: { role: 'user', content: 'Hello' } }),
    ];

    const messages = buildTranscript(entries);
    expect(messages).toHaveLength(1);
    expect(messages[0].blocks[0]).toMatchObject({ type: 'text', text: 'Hello' });
  });

  it('skips sidechain entries', () => {
    const entries: RawEntry[] = [
      entry({
        type: 'user',
        message: { role: 'user', content: 'Main prompt' },
      }),
      entry({
        type: 'assistant',
        isSidechain: true,
        message: { role: 'assistant', content: [{ type: 'text', text: 'Sidechain response' }] },
      }),
    ];

    const messages = buildTranscript(entries);
    expect(messages).toHaveLength(1);
    expect(messages[0].blocks[0]).toMatchObject({ text: 'Main prompt' });
  });

  it('cleans internal XML from text blocks', () => {
    const entries: RawEntry[] = [
      entry({
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Before<system-reminder>hidden</system-reminder>After' }],
        },
      }),
    ];

    const messages = buildTranscript(entries);
    expect(messages[0].blocks[0]).toMatchObject({ type: 'text', text: 'BeforeAfter' });
  });

  it('truncates large tool outputs', () => {
    const longOutput = 'x'.repeat(5000);
    const entries: RawEntry[] = [
      entry({
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            { type: 'tool_use', id: 'tool-big', name: 'Read', input: { file_path: 'big.ts' } },
          ],
        },
      }),
      entry({
        type: 'user',
        message: {
          content: [
            { type: 'tool_result', tool_use_id: 'tool-big', content: longOutput },
          ],
        },
      }),
    ];

    const messages = buildTranscript(entries);
    const toolBlock = messages[0].blocks[0];
    expect(toolBlock.type).toBe('tool_call');
    if (toolBlock.type === 'tool_call') {
      expect(toolBlock.output!.length).toBeLessThan(longOutput.length);
      expect(toolBlock.outputTruncated).toBe(true);
    }
  });

  it('handles multiple tool calls in one assistant message', () => {
    const entries: RawEntry[] = [
      entry({
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            { type: 'tool_use', id: 't1', name: 'Read', input: { file_path: 'a.ts' } },
            { type: 'tool_use', id: 't2', name: 'Read', input: { file_path: 'b.ts' } },
          ],
        },
      }),
      entry({
        type: 'user',
        message: {
          content: [
            { type: 'tool_result', tool_use_id: 't1', content: 'content a' },
            { type: 'tool_result', tool_use_id: 't2', content: 'content b' },
          ],
        },
      }),
    ];

    const messages = buildTranscript(entries);
    expect(messages).toHaveLength(1);
    expect(messages[0].blocks).toHaveLength(2);
    if (messages[0].blocks[0].type === 'tool_call') {
      expect(messages[0].blocks[0].output).toBe('content a');
    }
    if (messages[0].blocks[1].type === 'tool_call') {
      expect(messages[0].blocks[1].output).toBe('content b');
    }
  });

  it('sanitizes Write tool content in inputData', () => {
    const entries: RawEntry[] = [
      entry({
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'w1',
              name: 'Write',
              input: { file_path: 'out.ts', content: 'line1\nline2\nline3' },
            },
          ],
        },
      }),
    ];

    const messages = buildTranscript(entries);
    const block = messages[0].blocks[0];
    if (block.type === 'tool_call') {
      expect(block.inputData?.content).toBe('[3 lines]');
    }
  });

  it('strips home paths from tool inputs', () => {
    const entries: RawEntry[] = [
      entry({
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'r1',
              name: 'Read',
              input: { file_path: '/Users/test/Dev/myapp/src/auth.ts' },
            },
          ],
        },
      }),
    ];

    const messages = buildTranscript(entries, '/Users/test/Dev/myapp');
    const block = messages[0].blocks[0];
    if (block.type === 'tool_call') {
      expect(block.input).toBe('src/auth.ts');
    }
  });

  it('returns empty array for no entries', () => {
    expect(buildTranscript([])).toEqual([]);
  });

  it('skips user entries that are tool-result only', () => {
    const entries: RawEntry[] = [
      entry({
        type: 'user',
        message: {
          content: [
            { type: 'tool_result', tool_use_id: 'orphan', content: 'some output' },
          ],
        },
      }),
    ];

    const messages = buildTranscript(entries);
    expect(messages).toHaveLength(0);
  });
});

describe('buildTranscriptResponse', () => {
  it('wraps messages with metadata', () => {
    const entries: RawEntry[] = [
      entry({
        type: 'user',
        message: { role: 'user', content: 'Hello' },
      }),
    ];

    const response = buildTranscriptResponse(entries, {
      activeMinutes: 15,
      wallClockMinutes: 20,
      tokenUsage: { input_tokens: 1000, output_tokens: 500 },
      modelsUsed: ['claude-sonnet-4-20250514'],
    });

    expect(response.messages).toHaveLength(1);
    expect(response.meta).toEqual({
      totalMessages: 1,
      totalTokens: { input: 1000, output: 500 },
      models: ['claude-sonnet-4-20250514'],
      duration: { activeMinutes: 15, wallClockMinutes: 20 },
    });
  });
});
