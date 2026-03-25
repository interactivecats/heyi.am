import { describe, it, expect } from 'vitest';
import {
  extractSkills,
  computeToolBreakdown,
  generateExecutionPath,
  buildTurnTimeline,
  detectContext,
  computeLinesOfCode,
  analyzeSession,
  type SessionAnalysis,
  type ParsedTurn,
  type ParsedFileChange,
} from './analyzer.js';

// ── Test fixtures ──────────────────────────────────────────────

function makeTurn(overrides: Partial<ParsedTurn> = {}): ParsedTurn {
  return {
    timestamp: '14:00:00',
    type: 'tool',
    content: '',
    ...overrides,
  };
}

function makeAnalysis(overrides: Partial<SessionAnalysis> = {}): SessionAnalysis {
  return {
    id: 'test-001',
    title: 'Test session',
    date: '2026-03-20T10:00:00Z',
    durationMinutes: 30,
    projectName: 'test-project',
    turns: [],
    filesChanged: [],
    rawLog: ['> test prompt'],
    ...overrides,
  };
}

// ── extractSkills ──────────────────────────────────────────────

describe('extractSkills', () => {
  it('detects skills from file extensions', () => {
    const analysis = makeAnalysis({
      filesChanged: [
        { path: 'src/app.tsx', additions: 10, deletions: 0 },
        { path: 'src/main.rs', additions: 5, deletions: 2 },
      ],
    });
    const skills = extractSkills(analysis);
    expect(skills).toContain('React');
    expect(skills).toContain('Rust');
  });

  it('detects skills from config files', () => {
    const analysis = makeAnalysis({
      filesChanged: [
        { path: 'package.json', additions: 1, deletions: 0 },
        { path: 'Dockerfile', additions: 5, deletions: 0 },
      ],
    });
    const skills = extractSkills(analysis);
    expect(skills).toContain('Node.js');
    expect(skills).toContain('Docker');
  });

  it('detects skills from import patterns in tool output', () => {
    const analysis = makeAnalysis({
      turns: [
        makeTurn({
          type: 'tool',
          content: 'Read src/app.ts',
          toolOutput: 'import express from \'express\';\nimport { z } from \'zod\';',
        }),
      ],
    });
    const skills = extractSkills(analysis);
    expect(skills).toContain('Express');
    expect(skills).toContain('Zod');
  });

  it('adds Shell when Bash tool is used', () => {
    const analysis = makeAnalysis({
      turns: [makeTurn({ toolName: 'Bash', content: 'npm test' })],
    });
    const skills = extractSkills(analysis);
    expect(skills).toContain('Shell');
  });

  it('deduplicates and sorts skills', () => {
    const analysis = makeAnalysis({
      filesChanged: [
        { path: 'src/a.ts', additions: 1, deletions: 0 },
        { path: 'src/b.ts', additions: 1, deletions: 0 },
        { path: 'tsconfig.json', additions: 1, deletions: 0 },
      ],
    });
    const skills = extractSkills(analysis);
    // TypeScript appears from both .ts extension and tsconfig.json
    const tsCount = skills.filter((s) => s === 'TypeScript').length;
    expect(tsCount).toBe(1);
    // Sorted alphabetically
    const sorted = [...skills].sort();
    expect(skills).toEqual(sorted);
  });

  it('returns empty array when no signals present', () => {
    const analysis = makeAnalysis();
    expect(extractSkills(analysis)).toEqual([]);
  });

  it('detects nested config file paths like prisma/schema.prisma', () => {
    const analysis = makeAnalysis({
      filesChanged: [{ path: 'prisma/schema.prisma', additions: 20, deletions: 0 }],
    });
    const skills = extractSkills(analysis);
    expect(skills).toContain('Prisma');
  });
});

// ── computeToolBreakdown ───────────────────────────────────────

describe('computeToolBreakdown', () => {
  it('counts tools by name', () => {
    const turns: ParsedTurn[] = [
      makeTurn({ toolName: 'Read' }),
      makeTurn({ toolName: 'Read' }),
      makeTurn({ toolName: 'Edit' }),
      makeTurn({ toolName: 'Bash' }),
    ];
    const breakdown = computeToolBreakdown(turns);
    expect(breakdown).toEqual([
      { tool: 'Read', count: 2 },
      { tool: 'Edit', count: 1 },
      { tool: 'Bash', count: 1 },
    ]);
  });

  it('sorts by count descending', () => {
    const turns: ParsedTurn[] = [
      makeTurn({ toolName: 'Bash' }),
      makeTurn({ toolName: 'Read' }),
      makeTurn({ toolName: 'Read' }),
      makeTurn({ toolName: 'Read' }),
      makeTurn({ toolName: 'Bash' }),
    ];
    const breakdown = computeToolBreakdown(turns);
    expect(breakdown[0].tool).toBe('Read');
    expect(breakdown[0].count).toBe(3);
    expect(breakdown[1].tool).toBe('Bash');
  });

  it('ignores non-tool turns', () => {
    const turns: ParsedTurn[] = [
      makeTurn({ type: 'prompt', content: 'hello' }),
      makeTurn({ type: 'response', content: 'world' }),
    ];
    expect(computeToolBreakdown(turns)).toEqual([]);
  });

  it('ignores tool turns without toolName', () => {
    const turns: ParsedTurn[] = [makeTurn({ type: 'tool', content: 'something' })];
    expect(computeToolBreakdown(turns)).toEqual([]);
  });
});

// ── generateExecutionPath ──────────────────────────────────────

describe('generateExecutionPath', () => {
  it('groups turns into execution steps', () => {
    const turns: ParsedTurn[] = [
      makeTurn({ type: 'prompt', content: 'Read the auth module' }),
      makeTurn({ toolName: 'Read', toolInput: 'src/auth.ts', content: 'Read src/auth.ts' }),
      makeTurn({ toolName: 'Grep', toolInput: 'src/', content: 'Grep src/' }),
      makeTurn({ type: 'response', content: 'Found the auth module' }),
      makeTurn({ type: 'prompt', content: 'Now refactor it' }),
      makeTurn({ toolName: 'Edit', toolInput: 'src/auth.ts', content: 'Edit src/auth.ts' }),
    ];
    const path = generateExecutionPath(turns);
    expect(path.length).toBe(2);
    expect(path[0].stepNumber).toBe(1);
    expect(path[1].stepNumber).toBe(2);
  });

  it('classifies read-only groups as analysis', () => {
    const turns: ParsedTurn[] = [
      makeTurn({ type: 'prompt', content: 'Look at the code' }),
      makeTurn({ toolName: 'Read', toolInput: 'src/main.ts', content: 'Read src/main.ts' }),
      makeTurn({ toolName: 'Grep', toolInput: 'src/', content: 'Grep src/' }),
    ];
    const path = generateExecutionPath(turns);
    expect(path[0].type).toBe('analysis');
  });

  it('classifies test-related groups as testing', () => {
    const turns: ParsedTurn[] = [
      makeTurn({ type: 'prompt', content: 'Run the tests' }),
      makeTurn({ toolName: 'Bash', content: 'npm test' }),
    ];
    const path = generateExecutionPath(turns);
    expect(path[0].type).toBe('testing');
  });

  it('classifies deploy-related groups as deployment', () => {
    const turns: ParsedTurn[] = [
      makeTurn({ type: 'prompt', content: 'Deploy to production' }),
      makeTurn({ toolName: 'Bash', content: 'deploy script' }),
    ];
    const path = generateExecutionPath(turns);
    expect(path[0].type).toBe('deployment');
  });

  it('returns empty for empty turns', () => {
    expect(generateExecutionPath([])).toEqual([]);
  });

  it('generates descriptive titles from files', () => {
    const turns: ParsedTurn[] = [
      makeTurn({ type: 'prompt', content: 'Update the config' }),
      makeTurn({ toolName: 'Edit', toolInput: 'src/config.ts', content: 'Edit src/config.ts' }),
    ];
    const path = generateExecutionPath(turns);
    expect(path[0].title).toContain('config.ts');
  });
});

// ── buildTurnTimeline ──────────────────────────────────────────

describe('buildTurnTimeline', () => {
  it('converts parsed turns to timeline events', () => {
    const turns: ParsedTurn[] = [
      makeTurn({ type: 'prompt', timestamp: '14:00:00', content: 'Fix the bug' }),
      makeTurn({ type: 'tool', timestamp: '14:01:00', toolName: 'Read', toolInput: 'src/app.ts', content: 'Read src/app.ts' }),
      makeTurn({ type: 'response', timestamp: '14:02:00', content: 'Found the issue' }),
    ];
    const timeline = buildTurnTimeline(turns);
    expect(timeline).toEqual([
      { timestamp: '14:00:00', type: 'prompt', content: 'Fix the bug' },
      { timestamp: '14:01:00', type: 'tool', content: 'Read src/app.ts' },
      { timestamp: '14:02:00', type: 'response', content: 'Found the issue' },
    ]);
  });

  it('handles tool turns without toolInput', () => {
    const turns: ParsedTurn[] = [
      makeTurn({ type: 'tool', toolName: 'Bash', content: 'npm install' }),
    ];
    const timeline = buildTurnTimeline(turns);
    expect(timeline[0].content).toBe('Bash');
  });
});

// ── detectContext ──────────────────────────────────────────────

describe('detectContext', () => {
  it('detects git branch from checkout command', () => {
    const analysis = makeAnalysis({
      turns: [
        makeTurn({ toolName: 'Bash', content: 'git checkout -b feature/auth' }),
      ],
    });
    const context = detectContext(analysis);
    expect(context).toContain('Branch: feature/auth');
  });

  it('detects git branch from git status output', () => {
    const analysis = makeAnalysis({
      turns: [
        makeTurn({ toolName: 'Bash', content: 'git status', toolOutput: 'On branch main\nnothing to commit' }),
      ],
    });
    const context = detectContext(analysis);
    expect(context).toContain('Branch: main');
  });

  it('detects stack from config files', () => {
    const analysis = makeAnalysis({
      filesChanged: [
        { path: 'package.json', additions: 1, deletions: 0 },
        { path: 'Dockerfile', additions: 5, deletions: 0 },
      ],
    });
    const context = detectContext(analysis);
    expect(context).toContain('Node.js');
    expect(context).toContain('Docker');
  });

  it('returns undefined when no signals present', () => {
    const analysis = makeAnalysis();
    expect(detectContext(analysis)).toBeUndefined();
  });

  it('combines branch and stack', () => {
    const analysis = makeAnalysis({
      turns: [
        makeTurn({ toolName: 'Bash', content: 'git switch main' }),
      ],
      filesChanged: [
        { path: 'package.json', additions: 1, deletions: 0 },
      ],
    });
    const context = detectContext(analysis);
    expect(context).toContain('Branch: main');
    expect(context).toContain('Stack: Node.js');
  });
});

// ── computeLinesOfCode ─────────────────────────────────────────

describe('computeLinesOfCode', () => {
  it('sums additions and deletions', () => {
    const files: ParsedFileChange[] = [
      { path: 'a.ts', additions: 100, deletions: 20 },
      { path: 'b.ts', additions: 50, deletions: 10 },
    ];
    expect(computeLinesOfCode(files)).toBe(180);
  });

  it('returns 0 for empty list', () => {
    expect(computeLinesOfCode([])).toBe(0);
  });
});

// ── analyzeSession (integration) ───────────────────────────────

describe('analyzeSession', () => {
  const fullAnalysis: SessionAnalysis = {
    id: 'ses-integration',
    title: 'Refactor auth middleware',
    date: '2026-03-20T14:00:00Z',
    durationMinutes: 45,
    projectName: 'auth-service',
    turns: [
      makeTurn({ type: 'prompt', timestamp: '14:00:00', content: 'Read the auth module' }),
      makeTurn({ type: 'tool', timestamp: '14:01:00', toolName: 'Read', toolInput: 'src/auth.ts', content: 'Read src/auth.ts' }),
      makeTurn({ type: 'tool', timestamp: '14:02:00', toolName: 'Grep', toolInput: 'src/', content: 'Grep src/' }),
      makeTurn({ type: 'response', timestamp: '14:03:00', content: 'Found HS256 dependency' }),
      makeTurn({ type: 'prompt', timestamp: '14:05:00', content: 'Refactor auth module' }),
      makeTurn({ type: 'tool', timestamp: '14:06:00', toolName: 'Edit', toolInput: 'src/auth.ts', content: 'Edit src/auth.ts' }),
      makeTurn({ type: 'tool', timestamp: '14:07:00', toolName: 'Write', toolInput: 'src/crypto.ts', content: 'Write src/crypto.ts' }),
      makeTurn({ type: 'tool', timestamp: '14:08:00', toolName: 'Bash', content: 'npm test' }),
      makeTurn({ type: 'response', timestamp: '14:09:00', content: 'All tests passing' }),
    ],
    filesChanged: [
      { path: 'src/auth.ts', additions: 150, deletions: 80 },
      { path: 'src/crypto.ts', additions: 60, deletions: 0 },
      { path: 'test/auth.test.ts', additions: 40, deletions: 10 },
    ],
    rawLog: ['> Read the auth module', '...', '> Refactor auth module'],
  };

  it('produces a complete Session object', () => {
    const session = analyzeSession(fullAnalysis);

    expect(session.id).toBe('ses-integration');
    expect(session.title).toBe('Refactor auth middleware');
    expect(session.date).toBe('2026-03-20T14:00:00Z');
    expect(session.durationMinutes).toBe(45);
    expect(session.projectName).toBe('auth-service');
    expect(session.status).toBe('draft');
    expect(session.rawLog).toEqual(fullAnalysis.rawLog);
  });

  it('computes correct turn count', () => {
    const session = analyzeSession(fullAnalysis);
    expect(session.turns).toBe(9);
  });

  it('computes correct lines of code', () => {
    const session = analyzeSession(fullAnalysis);
    expect(session.linesOfCode).toBe(340); // 150+80+60+0+40+10
  });

  it('computes correct tool call count', () => {
    const session = analyzeSession(fullAnalysis);
    expect(session.toolCalls).toBe(5); // Read, Grep, Edit, Write, Bash
  });

  it('generates tool breakdown sorted by count', () => {
    const session = analyzeSession(fullAnalysis);
    expect(session.toolBreakdown.length).toBeGreaterThan(0);
    for (let i = 1; i < session.toolBreakdown.length; i++) {
      expect(session.toolBreakdown[i - 1].count).toBeGreaterThanOrEqual(session.toolBreakdown[i].count);
    }
  });

  it('generates execution path with numbered steps', () => {
    const session = analyzeSession(fullAnalysis);
    expect(session.executionPath.length).toBeGreaterThan(0);
    session.executionPath.forEach((step, i) => {
      expect(step.stepNumber).toBe(i + 1);
      expect(step.title).toBeTruthy();
      expect(step.description).toBeTruthy();
    });
  });

  it('generates turn timeline matching turn count', () => {
    const session = analyzeSession(fullAnalysis);
    expect(session.turnTimeline.length).toBe(9);
  });

  it('extracts skills from the session', () => {
    const session = analyzeSession(fullAnalysis);
    expect(session.skills).toContain('TypeScript');
    expect(session.skills).toContain('Shell');
  });

  it('includes file changes', () => {
    const session = analyzeSession(fullAnalysis);
    expect(session.filesChanged).toEqual(fullAnalysis.filesChanged);
  });
});
