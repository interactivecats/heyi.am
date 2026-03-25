import { describe, it, expect } from 'vitest';
import {
  buildSessionRenderData,
  buildSessionCard,
  buildProjectRenderData,
  DEFAULT_ACCENT,
} from './build-render-data.js';
import type { Session } from '../analyzer.js';
import type { EnhancedData } from '../settings.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeSession(overrides?: Partial<Session>): Session {
  return {
    id: 'abc-123',
    title: 'Raw title from analyzer',
    date: '2026-03-23T10:00:00Z',
    durationMinutes: 45,
    turns: 12,
    linesOfCode: 200,
    status: 'enhanced',
    projectName: 'my-project',
    rawLog: ['> hello', 'world'],
    skills: ['TypeScript'],
    executionPath: [
      { stepNumber: 1, title: 'Step one', description: 'Did step one' },
    ],
    toolBreakdown: [
      { tool: 'Read', count: 10 },
      { tool: 'Write', count: 5 },
    ],
    filesChanged: [
      { path: 'src/index.ts', additions: 50, deletions: 10 },
      { path: 'src/utils.ts', additions: 20, deletions: 5 },
    ],
    turnTimeline: [],
    toolCalls: 15,
    source: 'claude',
    ...overrides,
  };
}

function makeEnhanced(overrides?: Partial<EnhancedData>): EnhancedData {
  return {
    title: 'Enhanced title',
    developerTake: 'This is the enhanced dev take',
    context: 'Some context for the session',
    skills: ['TypeScript', 'React'],
    questions: [{ text: 'Why?', suggestedAnswer: 'Because.' }],
    executionSteps: [
      { stepNumber: 1, title: 'Analyzed', body: 'Read the code' },
      { stepNumber: 2, title: 'Implemented', body: 'Wrote the code' },
    ],
    qaPairs: [{ question: 'How?', answer: 'Carefully.' }],
    enhancedAt: '2026-03-23T11:00:00Z',
    ...overrides,
  };
}

const baseOpts = {
  sessionId: 'abc-123',
  session: makeSession(),
  enhanced: makeEnhanced(),
  username: 'testuser',
  projectSlug: 'my-project',
  sessionSlug: 'enhanced-title',
  sourceTool: 'claude',
  agentSummary: null,
};

// ---------------------------------------------------------------------------
// buildSessionRenderData
// ---------------------------------------------------------------------------

describe('buildSessionRenderData', () => {
  it('uses enhanced title over raw session title', () => {
    const data = buildSessionRenderData(baseOpts);
    expect(data.session.title).toBe('Enhanced title');
  });

  it('falls back to raw session title when no enhanced data', () => {
    const data = buildSessionRenderData({ ...baseOpts, enhanced: null });
    expect(data.session.title).toBe('Raw title from analyzer');
  });

  it('sets user with username and default accent', () => {
    const data = buildSessionRenderData(baseOpts);
    expect(data.user.username).toBe('testuser');
    expect(data.user.accent).toBe(DEFAULT_ACCENT);
  });

  it('sets projectSlug from opts', () => {
    const data = buildSessionRenderData(baseOpts);
    expect(data.projectSlug).toBe('my-project');
  });

  it('truncates devTake to 2000 characters', () => {
    const longTake = 'x'.repeat(3000);
    const data = buildSessionRenderData({
      ...baseOpts,
      enhanced: makeEnhanced({ developerTake: longTake }),
    });
    expect(data.session.devTake.length).toBe(2000);
  });

  it('maps enhanced executionSteps to beats', () => {
    const data = buildSessionRenderData(baseOpts);
    expect(data.session.beats).toHaveLength(2);
    expect(data.session.beats![0]).toEqual({
      stepNumber: 1,
      title: 'Analyzed',
      body: 'Read the code',
    });
  });

  it('falls back to session.executionPath for beats when no enhanced data', () => {
    const data = buildSessionRenderData({ ...baseOpts, enhanced: null });
    expect(data.session.beats).toHaveLength(1);
    expect(data.session.beats![0]).toEqual({
      stepNumber: 1,
      title: 'Step one',
      body: 'Did step one',
    });
  });

  it('maps toolBreakdown from session', () => {
    const data = buildSessionRenderData(baseOpts);
    expect(data.session.toolBreakdown).toEqual([
      { tool: 'Read', count: 10 },
      { tool: 'Write', count: 5 },
    ]);
  });

  it('maps topFiles from session.filesChanged (max 20)', () => {
    const data = buildSessionRenderData(baseOpts);
    expect(data.session.topFiles).toHaveLength(2);
    expect(data.session.topFiles![0]).toEqual({
      path: 'src/index.ts',
      additions: 50,
      deletions: 10,
    });
  });

  it('handles string-only filesChanged by adding zero additions/deletions', () => {
    const session = makeSession({
      filesChanged: ['file1.ts', 'file2.ts'] as any,
    });
    const data = buildSessionRenderData({ ...baseOpts, session, enhanced: null });
    expect(data.session.topFiles![0]).toEqual({
      path: 'file1.ts',
      additions: 0,
      deletions: 0,
    });
  });

  it('uses enhanced qaPairs over session qaPairs', () => {
    const data = buildSessionRenderData(baseOpts);
    expect(data.session.qaPairs).toEqual([{ question: 'How?', answer: 'Carefully.' }]);
  });

  it('sets template to editorial', () => {
    const data = buildSessionRenderData(baseOpts);
    expect(data.session.template).toBe('editorial');
  });

  it('includes agentSummary when provided', () => {
    const summary = { is_orchestrated: true, agents: [] };
    const data = buildSessionRenderData({ ...baseOpts, agentSummary: summary });
    expect(data.session.agentSummary).toEqual(summary);
  });

  it('omits agentSummary when null', () => {
    const data = buildSessionRenderData(baseOpts);
    expect(data.session.agentSummary).toBeUndefined();
  });

  it('uses current time for recordedAt when session has no date', () => {
    const session = makeSession({ date: '' });
    const before = new Date().toISOString();
    const data = buildSessionRenderData({ ...baseOpts, session, enhanced: null });
    // Should be a valid ISO string close to now
    expect(new Date(data.session.recordedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(before).getTime() - 1000,
    );
  });
});

// ---------------------------------------------------------------------------
// buildSessionCard
// ---------------------------------------------------------------------------

describe('buildSessionCard', () => {
  it('builds a card with correct fields', () => {
    const card = buildSessionCard(baseOpts);
    expect(card.token).toBe('abc-123');
    expect(card.slug).toBe('enhanced-title');
    expect(card.title).toBe('Enhanced title');
    expect(card.devTake).toBe('This is the enhanced dev take');
    expect(card.durationMinutes).toBe(45);
    expect(card.turns).toBe(12);
    expect(card.locChanged).toBe(200);
    expect(card.filesChanged).toBe(2);
    expect(card.skills).toEqual(['TypeScript', 'React']);
    expect(card.sourceTool).toBe('claude');
  });

  it('falls back to raw session fields when no enhanced data', () => {
    const card = buildSessionCard({ ...baseOpts, enhanced: null });
    expect(card.title).toBe('Raw title from analyzer');
    expect(card.skills).toEqual(['TypeScript']);
  });

  it('truncates devTake to 2000 characters', () => {
    const longTake = 'y'.repeat(3000);
    const card = buildSessionCard({
      ...baseOpts,
      enhanced: makeEnhanced({ developerTake: longTake }),
    });
    expect(card.devTake.length).toBe(2000);
  });
});

// ---------------------------------------------------------------------------
// buildProjectRenderData
// ---------------------------------------------------------------------------

describe('buildProjectRenderData', () => {
  const projectOpts = {
    username: 'testuser',
    slug: 'my-project',
    title: 'My Project',
    narrative: 'A project narrative',
    repoUrl: 'https://github.com/test/repo',
    projectUrl: 'https://example.com',
    timeline: [
      { period: '2026-03', label: 'March 2026', sessions: [{ title: 'S1' }] },
    ],
    skills: ['TypeScript', 'Elixir'],
    totalSessions: 5,
    totalLoc: 1200,
    totalDurationMinutes: 340,
    totalFilesChanged: 42,
    sessionCards: [buildSessionCard(baseOpts)],
  };

  it('sets user with username and default accent', () => {
    const data = buildProjectRenderData(projectOpts);
    expect(data.user.username).toBe('testuser');
    expect(data.user.accent).toBe(DEFAULT_ACCENT);
  });

  it('maps project fields correctly', () => {
    const data = buildProjectRenderData(projectOpts);
    expect(data.project.slug).toBe('my-project');
    expect(data.project.title).toBe('My Project');
    expect(data.project.narrative).toBe('A project narrative');
    expect(data.project.repoUrl).toBe('https://github.com/test/repo');
    expect(data.project.projectUrl).toBe('https://example.com');
    expect(data.project.skills).toEqual(['TypeScript', 'Elixir']);
    expect(data.project.totalSessions).toBe(5);
    expect(data.project.totalLoc).toBe(1200);
    expect(data.project.totalDurationMinutes).toBe(340);
    expect(data.project.totalFilesChanged).toBe(42);
  });

  it('includes session cards', () => {
    const data = buildProjectRenderData(projectOpts);
    expect(data.sessions).toHaveLength(1);
    expect(data.sessions[0].title).toBe('Enhanced title');
  });

  it('includes timeline', () => {
    const data = buildProjectRenderData(projectOpts);
    expect(data.project.timeline).toHaveLength(1);
    expect(data.project.timeline[0].period).toBe('2026-03');
  });

  it('handles optional totalAgentDurationMinutes', () => {
    const data = buildProjectRenderData({
      ...projectOpts,
      totalAgentDurationMinutes: 120,
    });
    expect(data.project.totalAgentDurationMinutes).toBe(120);
  });

  it('omits optional URLs when undefined', () => {
    const data = buildProjectRenderData({
      ...projectOpts,
      repoUrl: undefined,
      projectUrl: undefined,
    });
    expect(data.project.repoUrl).toBeUndefined();
    expect(data.project.projectUrl).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// DEFAULT_ACCENT
// ---------------------------------------------------------------------------

describe('DEFAULT_ACCENT', () => {
  it('is Seal Blue hex', () => {
    expect(DEFAULT_ACCENT).toBe('#084471');
  });
});
