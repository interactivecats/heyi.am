import { describe, expect, it } from 'vitest';
import { selectProfileSkills, PROFILE_SKILL_CAP } from './select-profile-skills.js';

describe('selectProfileSkills', () => {
  it('returns empty array when projectSkills is empty', () => {
    expect(selectProfileSkills({ projectSkills: [], sessionSkills: [] })).toEqual([]);
    expect(selectProfileSkills({ projectSkills: [], sessionSkills: [['X']] })).toEqual([]);
  });

  it('caps output at PROFILE_SKILL_CAP', () => {
    const many = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    const result = selectProfileSkills({ projectSkills: many, sessionSkills: [] });
    expect(result.length).toBeLessThanOrEqual(PROFILE_SKILL_CAP);
  });

  it('never returns a skill not present in projectSkills', () => {
    const result = selectProfileSkills({
      projectSkills: ['A', 'B', 'C'],
      sessionSkills: [['X', 'Y']],
    });
    for (const skill of result) {
      expect(['A', 'B', 'C']).toContain(skill);
    }
  });

  it('contains no duplicates', () => {
    const result = selectProfileSkills({
      projectSkills: ['A', 'B', 'C', 'D'],
      sessionSkills: [['A', 'A', 'B'], ['A']],
    });
    expect(new Set(result).size).toBe(result.length);
  });

  it('returns fewer than cap when projectSkills is shorter', () => {
    const result = selectProfileSkills({ projectSkills: ['A', 'B'], sessionSkills: [] });
    expect(result.length).toBeLessThanOrEqual(2);
  });

  it('ranks by number of sessions a skill appears in', () => {
    const result = selectProfileSkills({
      projectSkills: ['Rare', 'Common', 'Mid'],
      sessionSkills: [
        ['Common', 'Mid'],
        ['Common', 'Mid'],
        ['Common'],
        ['Rare'],
      ],
    });
    expect(result).toEqual(['Common', 'Mid', 'Rare']);
  });

  it('counts a skill once per session regardless of duplicates within the session', () => {
    const result = selectProfileSkills({
      projectSkills: ['A', 'B'],
      sessionSkills: [
        ['A', 'A', 'A', 'A', 'A'],
        ['B'],
        ['B'],
      ],
    });
    expect(result).toEqual(['B', 'A']);
  });

  it('breaks ties by order in projectSkills', () => {
    const result = selectProfileSkills({
      projectSkills: ['First', 'Second', 'Third'],
      sessionSkills: [['First', 'Second', 'Third']],
    });
    expect(result).toEqual(['First', 'Second', 'Third']);
  });

  it('ignores session skills not present in projectSkills', () => {
    const result = selectProfileSkills({
      projectSkills: ['A', 'B'],
      sessionSkills: [['Ghost', 'Ghost', 'A'], ['B']],
    });
    expect(result).toContain('A');
    expect(result).toContain('B');
    expect(result).not.toContain('Ghost');
  });

  it('keeps all projectSkills when no session data available (frequency all zero)', () => {
    const result = selectProfileSkills({
      projectSkills: ['A', 'B', 'C', 'D', 'E'],
      sessionSkills: [],
    });
    expect(result).toEqual(['A', 'B', 'C', 'D']);
  });
});
