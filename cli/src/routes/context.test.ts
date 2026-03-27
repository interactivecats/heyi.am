import { describe, it, expect } from 'vitest';
import { buildAgentSummary } from './context.js';
import type { SessionMeta } from '../parsers/index.js';

function makeMeta(overrides: Partial<SessionMeta> = {}): SessionMeta {
  return {
    path: '/tmp/session.jsonl',
    source: 'claude',
    sessionId: overrides.sessionId ?? 'child-1',
    projectDir: 'test-project',
    isSubagent: true,
    agentRole: overrides.agentRole,
    ...overrides,
  };
}

const defaultResolver = async () => ({ duration: 10, loc: 50 });

describe('buildAgentSummary', () => {
  it('returns null for empty childMetas', async () => {
    const result = await buildAgentSummary([], defaultResolver);
    expect(result).toBeNull();
  });

  it('returns orchestrated summary for a single child', async () => {
    const children = [makeMeta({ agentRole: 'frontend-dev' })];
    const result = await buildAgentSummary(children, defaultResolver);
    expect(result).toEqual({
      is_orchestrated: true,
      agents: [{ role: 'frontend-dev', duration_minutes: 10, loc_changed: 50 }],
    });
  });

  it('uses "agent" as default role when agentRole is missing', async () => {
    const children = [makeMeta({ agentRole: undefined })];
    const result = await buildAgentSummary(children, defaultResolver);
    expect(result).toEqual({
      is_orchestrated: true,
      agents: [{ role: 'agent', duration_minutes: 10, loc_changed: 50 }],
    });
  });

  it('includes all children when deduplicate is false', async () => {
    const children = [
      makeMeta({ sessionId: 'c1', agentRole: 'backend-dev' }),
      makeMeta({ sessionId: 'c2', agentRole: 'backend-dev' }),
    ];
    const result = await buildAgentSummary(children, defaultResolver);
    expect(result?.agents).toHaveLength(2);
    expect(result?.agents[0].role).toBe('backend-dev');
    expect(result?.agents[1].role).toBe('backend-dev');
  });

  it('deduplicates by role when deduplicate is true', async () => {
    const children = [
      makeMeta({ sessionId: 'c1', agentRole: 'backend-dev' }),
      makeMeta({ sessionId: 'c2', agentRole: 'backend-dev' }),
    ];
    const result = await buildAgentSummary(children, defaultResolver, { deduplicate: true });
    expect(result?.agents).toHaveLength(1);
    expect(result?.agents[0].role).toBe('backend-dev');
  });

  it('deduplicates by sessionId when agentRole is undefined', async () => {
    const children = [
      makeMeta({ sessionId: 'same-id', agentRole: undefined }),
      makeMeta({ sessionId: 'same-id', agentRole: undefined }),
    ];
    const result = await buildAgentSummary(children, defaultResolver, { deduplicate: true });
    expect(result?.agents).toHaveLength(1);
  });

  it('passes each child to the resolver and uses its stats', async () => {
    let callCount = 0;
    const resolver = async (child: SessionMeta) => {
      callCount++;
      return child.sessionId === 'c1'
        ? { duration: 5, loc: 20 }
        : { duration: 15, loc: 80 };
    };
    const children = [
      makeMeta({ sessionId: 'c1', agentRole: 'qa' }),
      makeMeta({ sessionId: 'c2', agentRole: 'dev' }),
    ];
    const result = await buildAgentSummary(children, resolver);
    expect(callCount).toBe(2);
    expect(result).toEqual({
      is_orchestrated: true,
      agents: [
        { role: 'qa', duration_minutes: 5, loc_changed: 20 },
        { role: 'dev', duration_minutes: 15, loc_changed: 80 },
      ],
    });
  });
});
