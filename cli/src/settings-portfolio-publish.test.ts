import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  getPortfolioPublishState,
  savePortfolioPublishState,
  updatePortfolioPublishTarget,
  hashPortfolioProfile,
  DEFAULT_PORTFOLIO_TARGET,
  type PortfolioPublishState,
  type PortfolioProfile,
} from './settings.js';

describe('Portfolio publish state', () => {
  let configDir: string;

  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), 'heyiam-pub-state-'));
  });

  afterEach(() => {
    rmSync(configDir, { recursive: true, force: true });
  });

  it('returns empty targets map when no state file exists', () => {
    expect(getPortfolioPublishState(configDir)).toEqual({ targets: {} });
  });

  it('round-trips full state including profile snapshot and hash', () => {
    const profile: PortfolioProfile = {
      displayName: 'Ada Lovelace',
      bio: 'First programmer',
      email: 'ada@example.com',
    };
    const state: PortfolioPublishState = {
      targets: {
        [DEFAULT_PORTFOLIO_TARGET]: {
          lastPublishedAt: '2026-04-07T00:00:00.000Z',
          lastPublishedProfileHash: hashPortfolioProfile(profile),
          lastPublishedProfile: profile,
          config: {},
          url: 'https://heyi.am/ada',
        },
      },
    };
    savePortfolioPublishState(state, configDir);
    const loaded = getPortfolioPublishState(configDir);
    expect(loaded).toEqual(state);
    expect(loaded.targets[DEFAULT_PORTFOLIO_TARGET].lastPublishedProfileHash)
      .toBe(hashPortfolioProfile(profile));
  });

  it('updatePortfolioPublishTarget patches a single target and persists', () => {
    updatePortfolioPublishTarget(
      DEFAULT_PORTFOLIO_TARGET,
      {
        lastPublishedAt: '2026-04-07T00:00:00.000Z',
        lastPublishedProfileHash: 'abc123',
        lastPublishedProfile: { displayName: 'Grace' },
        config: {},
      },
      configDir,
    );
    const loaded = getPortfolioPublishState(configDir);
    expect(loaded.targets[DEFAULT_PORTFOLIO_TARGET].lastPublishedProfileHash).toBe('abc123');

    updatePortfolioPublishTarget(
      DEFAULT_PORTFOLIO_TARGET,
      { lastError: 'network', lastErrorAt: '2026-04-07T01:00:00.000Z' },
      configDir,
    );
    const after = getPortfolioPublishState(configDir);
    expect(after.targets[DEFAULT_PORTFOLIO_TARGET].lastError).toBe('network');
    // previous fields preserved
    expect(after.targets[DEFAULT_PORTFOLIO_TARGET].lastPublishedProfileHash).toBe('abc123');
  });

  it('tolerates a corrupted state file by returning empty targets', () => {
    savePortfolioPublishState({ targets: {} }, configDir);
    // Overwrite with garbage
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('node:fs').writeFileSync(join(configDir, 'portfolio-publish.json'), 'not json');
    expect(getPortfolioPublishState(configDir)).toEqual({ targets: {} });
  });
});

describe('hashPortfolioProfile', () => {
  it('is deterministic for equal profiles regardless of key order', () => {
    const a: PortfolioProfile = { displayName: 'X', bio: 'b', email: 'e@x' };
    const b: PortfolioProfile = { email: 'e@x', bio: 'b', displayName: 'X' };
    expect(hashPortfolioProfile(a)).toBe(hashPortfolioProfile(b));
  });

  it('produces different hashes for different profiles', () => {
    const a: PortfolioProfile = { displayName: 'X' };
    const b: PortfolioProfile = { displayName: 'Y' };
    expect(hashPortfolioProfile(a)).not.toBe(hashPortfolioProfile(b));
  });

  it('ignores undefined fields (treats omitted and undefined as equal)', () => {
    const a: PortfolioProfile = { displayName: 'X' };
    const b: PortfolioProfile = { displayName: 'X', bio: undefined };
    expect(hashPortfolioProfile(a)).toBe(hashPortfolioProfile(b));
  });

  it('returns a short stable-length hex string', () => {
    const h = hashPortfolioProfile({ displayName: 'X' });
    expect(h).toMatch(/^[0-9a-f]{16}$/);
  });
});
