import { describe, it, expect } from 'vitest';
import { computeSegments } from './WorkTimeline';
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
      date: '2026-03-01T14:00:00Z', // 4 hours later (well above GAP_THRESHOLD_MS)
      durationMinutes: 45,
    });

    const result = computeSegments([s1, s2]);
    expect(result).toHaveLength(3);
    expect(result[0].type).toBe('session');
    expect(result[1].type).toBe('gap');
    expect(result[2].type).toBe('session');

    if (result[1].type === 'gap') {
      // Gap should be about 3.5 hours (4h minus 30min session)
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
      date: '2026-03-01T10:30:00Z', // starts 30min into s1
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
      date: '2026-03-01T10:45:00Z', // 15 min after s1 ends -- within 1h threshold
      durationMinutes: 30,
    });

    const result = computeSegments([s1, s2]);
    // Should be 2 sessions with no gap between them
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
    // Should have early first, gap, then late
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
      date: '2026-03-01T11:00:00Z', // within s1's endTime window
      durationMinutes: 30,
    });

    const result = computeSegments([s1, s2]);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('concurrent');
  });

  it('handles a mix of sequential, concurrent, and gap segments', () => {
    const sessions = [
      makeSession({ id: '1', title: 'A', date: '2026-03-01T10:00:00Z', durationMinutes: 30 }),
      makeSession({ id: '2', title: 'B', date: '2026-03-01T10:15:00Z', durationMinutes: 30 }), // overlaps with A
      makeSession({ id: '3', title: 'C', date: '2026-03-01T15:00:00Z', durationMinutes: 20 }), // hours later
    ];

    const result = computeSegments(sessions);
    expect(result).toHaveLength(3);
    expect(result[0].type).toBe('concurrent'); // A + B
    expect(result[1].type).toBe('gap');
    expect(result[2].type).toBe('session'); // C
  });
});
