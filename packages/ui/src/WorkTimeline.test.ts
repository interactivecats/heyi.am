import { describe, it, expect } from 'vitest';
import { computeSegments, formatTimestamp, timeToPx, assignLanes, timeToX } from './WorkTimeline';
import type { Session } from './types';

function makeSession(overrides: Partial<Session> & { id: string; title: string }): Session {
  return {
    date: '2026-03-01T10:00:00Z',
    durationMinutes: 30,
    turns: 10,
    linesOfCode: 100,
    status: 'draft',
    projectName: 'test',
    rawLog: [],
    ...overrides,
  };
}

describe('computeSegments', () => {
  it('returns empty array for no sessions', () => {
    expect(computeSegments([])).toEqual([]);
  });

  it('returns a single session segment for one session', () => {
    const session = makeSession({ id: '1', title: 'First' });
    const result = computeSegments([session]);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('session');
    if (result[0].type === 'session') {
      expect(result[0].session.id).toBe('1');
    }
  });

  it('returns sequential sessions with gaps between them', () => {
    const s1 = makeSession({
      id: '1',
      title: 'First',
      date: '2026-03-01T10:00:00Z',
      durationMinutes: 30,
    });
    const s2 = makeSession({
      id: '2',
      title: 'Second',
      date: '2026-03-01T14:00:00Z',
      durationMinutes: 45,
    });

    const result = computeSegments([s1, s2]);
    expect(result).toHaveLength(3);
    expect(result[0].type).toBe('session');
    expect(result[1].type).toBe('gap');
    expect(result[2].type).toBe('session');

    if (result[1].type === 'gap') {
      expect(result[1].durationMs).toBeGreaterThan(3 * 3_600_000);
    }
  });

  it('clusters overlapping sessions into a concurrent segment', () => {
    const s1 = makeSession({
      id: '1',
      title: 'First',
      date: '2026-03-01T10:00:00Z',
      durationMinutes: 60,
    });
    const s2 = makeSession({
      id: '2',
      title: 'Second',
      date: '2026-03-01T10:30:00Z',
      durationMinutes: 45,
    });

    const result = computeSegments([s1, s2]);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('concurrent');
    if (result[0].type === 'concurrent') {
      expect(result[0].sessions).toHaveLength(2);
    }
  });

  it('does not insert a gap for sessions close together (within threshold)', () => {
    const s1 = makeSession({
      id: '1',
      title: 'First',
      date: '2026-03-01T10:00:00Z',
      durationMinutes: 30,
    });
    const s2 = makeSession({
      id: '2',
      title: 'Second',
      date: '2026-03-01T10:45:00Z',
      durationMinutes: 30,
    });

    const result = computeSegments([s1, s2]);
    expect(result).toHaveLength(2);
    expect(result[0].type).toBe('session');
    expect(result[1].type).toBe('session');
  });

  it('sorts sessions by start time regardless of input order', () => {
    const s1 = makeSession({
      id: 'late',
      title: 'Late',
      date: '2026-03-01T14:00:00Z',
      durationMinutes: 30,
    });
    const s2 = makeSession({
      id: 'early',
      title: 'Early',
      date: '2026-03-01T10:00:00Z',
      durationMinutes: 30,
    });

    const result = computeSegments([s1, s2]);
    expect(result[0].type).toBe('session');
    if (result[0].type === 'session') {
      expect(result[0].session.id).toBe('early');
    }
  });

  it('uses endTime when available for session end calculation', () => {
    const s1 = makeSession({
      id: '1',
      title: 'First',
      date: '2026-03-01T10:00:00Z',
      endTime: '2026-03-01T12:00:00Z',
      durationMinutes: 30,
    });
    const s2 = makeSession({
      id: '2',
      title: 'Second',
      date: '2026-03-01T11:00:00Z',
      durationMinutes: 30,
    });

    const result = computeSegments([s1, s2]);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('concurrent');
  });

  it('handles a mix of sequential, concurrent, and gap segments', () => {
    const sessions = [
      makeSession({ id: '1', title: 'A', date: '2026-03-01T10:00:00Z', durationMinutes: 30 }),
      makeSession({ id: '2', title: 'B', date: '2026-03-01T10:15:00Z', durationMinutes: 30 }),
      makeSession({ id: '3', title: 'C', date: '2026-03-01T15:00:00Z', durationMinutes: 20 }),
    ];

    const result = computeSegments(sessions);
    expect(result).toHaveLength(3);
    expect(result[0].type).toBe('concurrent');
    expect(result[1].type).toBe('gap');
    expect(result[2].type).toBe('session');
  });
});

describe('formatTimestamp', () => {
  it('formats a morning time correctly', () => {
    const result = formatTimestamp('2026-03-01T10:30:00Z');
    expect(result).toMatch(/Mar/);
    expect(result).toMatch(/[AP]M/);
  });

  it('formats midnight as 12:00 AM', () => {
    const result = formatTimestamp('2026-03-01T00:00:00');
    expect(result).toContain('12:00 AM');
  });

  it('formats noon as 12:00 PM', () => {
    const result = formatTimestamp('2026-03-01T12:00:00');
    expect(result).toContain('12:00 PM');
  });
});

describe('timeToPx', () => {
  it('returns minimum width for very short sessions', () => {
    expect(timeToPx(5)).toBe(160);
  });

  it('scales linearly for medium sessions', () => {
    expect(timeToPx(60)).toBe(180);
    expect(timeToPx(100)).toBe(300);
  });

  it('caps at maximum width for long sessions', () => {
    expect(timeToPx(240)).toBe(480);
    expect(timeToPx(500)).toBe(480);
  });

  it('maintains proportionality within bounds', () => {
    const short = timeToPx(60);
    const long = timeToPx(120);
    expect(long / short).toBe(2);
  });
});

describe('assignLanes', () => {
  it('puts non-overlapping sessions on the same lane', () => {
    const s1 = makeSession({ id: '1', title: 'A', date: '2026-03-01T10:00:00Z', durationMinutes: 30 });
    const s2 = makeSession({ id: '2', title: 'B', date: '2026-03-01T12:00:00Z', durationMinutes: 30 });
    const lanes = assignLanes([s1, s2]);
    expect(lanes.get('1')).toBe(0);
    expect(lanes.get('2')).toBe(0);
  });

  it('puts overlapping sessions on different lanes', () => {
    const s1 = makeSession({ id: '1', title: 'A', date: '2026-03-01T10:00:00Z', durationMinutes: 60 });
    const s2 = makeSession({ id: '2', title: 'B', date: '2026-03-01T10:30:00Z', durationMinutes: 60 });
    const lanes = assignLanes([s1, s2]);
    expect(lanes.get('1')).toBe(0);
    expect(lanes.get('2')).toBe(1);
  });

  it('reuses lanes when sessions end before new ones start', () => {
    const s1 = makeSession({ id: '1', title: 'A', date: '2026-03-01T10:00:00Z', durationMinutes: 30 });
    const s2 = makeSession({ id: '2', title: 'B', date: '2026-03-01T10:00:00Z', durationMinutes: 60 });
    const s3 = makeSession({ id: '3', title: 'C', date: '2026-03-01T12:00:00Z', durationMinutes: 30 });
    const lanes = assignLanes([s1, s2, s3]);
    expect(lanes.get('1')).toBe(0);
    expect(lanes.get('2')).toBe(1);
    // s3 starts well after s1 ends — reuses lane 0
    expect(lanes.get('3')).toBe(0);
  });

  it('handles fully nested sessions', () => {
    const outer = makeSession({ id: 'outer', title: 'Outer', date: '2026-03-01T10:00:00Z', durationMinutes: 120 });
    const inner = makeSession({ id: 'inner', title: 'Inner', date: '2026-03-01T10:30:00Z', durationMinutes: 30 });
    const lanes = assignLanes([outer, inner]);
    expect(lanes.get('outer')).toBe(0);
    expect(lanes.get('inner')).toBe(1);
  });

  it('sorts by start time regardless of input order', () => {
    const s1 = makeSession({ id: 'late', title: 'Late', date: '2026-03-01T14:00:00Z', durationMinutes: 30 });
    const s2 = makeSession({ id: 'early', title: 'Early', date: '2026-03-01T10:00:00Z', durationMinutes: 30 });
    const lanes = assignLanes([s1, s2]);
    expect(lanes.get('early')).toBe(0);
    expect(lanes.get('late')).toBe(0);
  });
});

describe('timeToX', () => {
  it('maps start of range to xStart', () => {
    expect(timeToX(1000, 1000, 2000, 100, 500)).toBe(100);
  });

  it('maps end of range to xEnd', () => {
    expect(timeToX(2000, 1000, 2000, 100, 500)).toBe(500);
  });

  it('maps midpoint to middle of x range', () => {
    expect(timeToX(1500, 1000, 2000, 100, 500)).toBe(300);
  });

  it('handles zero-length range', () => {
    expect(timeToX(1000, 1000, 1000, 100, 500)).toBe(100);
  });

  it('maps linearly for quarter points', () => {
    expect(timeToX(1250, 1000, 2000, 0, 400)).toBe(100);
    expect(timeToX(1750, 1000, 2000, 0, 400)).toBe(300);
  });
});
