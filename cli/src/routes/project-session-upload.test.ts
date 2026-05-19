import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

vi.mock('../config.js', () => ({
  API_URL: 'https://heyiam.test',
  PUBLIC_URL: 'https://heyi.test',
  warnIfNonDefaultApiUrl: vi.fn(),
}));

const fetchMock = vi.fn();
globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

import { demoteRemovedSessions } from './project-session-upload.js';
import { saveUploadedState, saveEnhancedData, loadEnhancedData } from '../settings.js';

let configDir: string;
const originalDataDir = process.env.HEYIAM_DATA_DIR;
const originalConfigDir = process.env.HEYIAM_CONFIG_DIR;

beforeEach(() => {
  configDir = mkdtempSync(join(tmpdir(), 'heyiam-demote-test-'));
  process.env.HEYIAM_DATA_DIR = configDir;
  process.env.HEYIAM_CONFIG_DIR = configDir;
  fetchMock.mockReset();
});

afterEach(() => {
  rmSync(configDir, { recursive: true, force: true });
  if (originalDataDir !== undefined) process.env.HEYIAM_DATA_DIR = originalDataDir;
  else delete process.env.HEYIAM_DATA_DIR;
  if (originalConfigDir !== undefined) process.env.HEYIAM_CONFIG_DIR = originalConfigDir;
  else delete process.env.HEYIAM_CONFIG_DIR;
});

const auth = { username: 'tester', token: 'tok-abc' };

describe('demoteRemovedSessions', () => {
  it('returns 0/empty when no uploaded state exists', async () => {
    const result = await demoteRemovedSessions(auth, {
      projectDirName: 'never-uploaded',
      selectedSessionIds: ['a', 'b'],
    });

    expect(result).toEqual({ demotedCount: 0, failed: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 0/empty when every previously-uploaded session is still selected', async () => {
    saveUploadedState('proj-a', {
      slug: 'proj-a',
      projectId: 11,
      uploadedSessions: ['a', 'b'],
    });

    const result = await demoteRemovedSessions(auth, {
      projectDirName: 'proj-a',
      selectedSessionIds: ['a', 'b'],
    });

    expect(result).toEqual({ demotedCount: 0, failed: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('DELETEs each session that was previously uploaded but is no longer selected', async () => {
    saveUploadedState('proj-a', {
      slug: 'proj-a',
      projectId: 11,
      uploadedSessions: ['keep', 'drop-one', 'drop-two'],
    });
    saveEnhancedData('drop-one', {
      title: 'Dropped One', developerTake: '', context: '',
      skills: [], questions: [], executionSteps: [],
      uploaded: true,
    });
    saveEnhancedData('drop-two', {
      title: 'Dropped Two', developerTake: '', context: '',
      skills: [], questions: [], executionSteps: [],
      uploaded: true,
    });

    fetchMock.mockResolvedValue({ status: 204, ok: true });

    const result = await demoteRemovedSessions(auth, {
      projectDirName: 'proj-a',
      selectedSessionIds: ['keep'],
    });

    expect(result.demotedCount).toBe(2);
    expect(result.failed).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const urls = fetchMock.mock.calls.map(([url]) => url);
    expect(urls).toContain('https://heyiam.test/api/sessions/drop-one?project_id=11&slug=dropped-one');
    expect(urls).toContain('https://heyiam.test/api/sessions/drop-two?project_id=11&slug=dropped-two');

    // Local enhanced.uploaded should flip off so the next re-publish
    // doesn't try to demote them again.
    expect(loadEnhancedData('drop-one')?.uploaded).toBe(false);
    expect(loadEnhancedData('drop-two')?.uploaded).toBe(false);
  });

  it('treats Phoenix 404 as "already gone" — success path, not failure', async () => {
    saveUploadedState('proj-a', {
      slug: 'proj-a',
      projectId: 11,
      uploadedSessions: ['ghost'],
    });
    saveEnhancedData('ghost', {
      title: 'Ghost', developerTake: '', context: '',
      skills: [], questions: [], executionSteps: [],
      uploaded: true,
    });

    fetchMock.mockResolvedValueOnce({ status: 404, ok: false });

    const result = await demoteRemovedSessions(auth, {
      projectDirName: 'proj-a',
      selectedSessionIds: [],
    });

    expect(result.demotedCount).toBe(1);
    expect(result.failed).toEqual([]);
    expect(loadEnhancedData('ghost')?.uploaded).toBe(false);
  });

  it('records failures for 5xx/network errors without stopping the loop', async () => {
    saveUploadedState('proj-a', {
      slug: 'proj-a',
      projectId: 11,
      uploadedSessions: ['flaky', 'ok'],
    });

    fetchMock
      .mockResolvedValueOnce({ status: 500, ok: false, text: () => Promise.resolve('boom') })
      .mockResolvedValueOnce({ status: 204, ok: true });

    const result = await demoteRemovedSessions(auth, {
      projectDirName: 'proj-a',
      selectedSessionIds: [],
    });

    expect(result.demotedCount).toBe(1);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].sessionId).toBe('flaky');
    expect(result.failed[0].error).toMatch(/HTTP 500/);
  });
});
