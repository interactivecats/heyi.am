import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getPortfolioProfile, savePortfolioProfile, getSettings, type PortfolioProfile } from './settings.js';

describe('Portfolio profile persistence', () => {
  let configDir: string;

  beforeAll(async () => {
    configDir = join(tmpdir(), `heyiam-portfolio-test-${Date.now()}`);
    await mkdir(configDir, { recursive: true });
  });

  afterAll(async () => {
    await rm(configDir, { recursive: true, force: true });
  });

  it('returns empty object when no portfolio data exists', () => {
    const profile = getPortfolioProfile(configDir);
    expect(profile).toEqual({});
  });

  it('saves and retrieves portfolio data', () => {
    const data: PortfolioProfile = {
      displayName: 'Jane Smith',
      bio: 'Full-stack developer',
      email: 'jane@example.com',
      githubUrl: 'https://github.com/jane',
    };
    savePortfolioProfile(data, configDir);

    const loaded = getPortfolioProfile(configDir);
    expect(loaded).toEqual(data);
  });

  it('portfolio data is nested inside settings', () => {
    const settings = getSettings(configDir);
    expect(settings.portfolio).toBeDefined();
    expect(settings.portfolio?.displayName).toBe('Jane Smith');
  });

  it('overwrites previous portfolio data on save', () => {
    savePortfolioProfile({ displayName: 'Updated Name' }, configDir);

    const loaded = getPortfolioProfile(configDir);
    expect(loaded.displayName).toBe('Updated Name');
    // Previous fields should be gone since we replaced the entire object
    expect(loaded.bio).toBeUndefined();
  });

  it('preserves other settings when saving portfolio', () => {
    // First set some other settings
    const settings = getSettings(configDir);
    // Portfolio was already set in prev test
    expect(settings.portfolio).toBeDefined();

    // Save new portfolio data
    savePortfolioProfile({ displayName: 'Test' }, configDir);

    // Other settings fields should still be intact
    const updated = getSettings(configDir);
    expect(updated.portfolio?.displayName).toBe('Test');
  });
});
