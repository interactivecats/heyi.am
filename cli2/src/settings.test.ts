import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { existsSync } from 'node:fs';
import {
  getSettings,
  saveAnthropicApiKey,
  clearAnthropicApiKey,
  getAnthropicApiKey,
  saveEnhancedData,
  loadEnhancedData,
  deleteEnhancedData,
  saveProjectEnhanceResult,
  loadProjectEnhanceResult,
  loadFreshProjectEnhanceResult,
  deleteProjectEnhanceResult,
  buildProjectFingerprint,
  saveUploadedState,
  getUploadedState,
} from './settings.js';

describe('settings', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'heyiam-settings-test-'));
    delete process.env.ANTHROPIC_API_KEY;
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.ANTHROPIC_API_KEY;
  });

  describe('getSettings', () => {
    it('returns empty object when no settings file exists', () => {
      expect(getSettings(tmpDir)).toEqual({});
    });
  });

  describe('saveAnthropicApiKey', () => {
    it('saves API key to settings file', () => {
      saveAnthropicApiKey('sk-ant-test123', tmpDir);
      const raw = JSON.parse(readFileSync(join(tmpDir, 'settings.json'), 'utf-8'));
      expect(raw.anthropicApiKey).toBe('sk-ant-test123');
    });

    it('preserves existing settings', () => {
      // Write some initial data
      saveAnthropicApiKey('sk-ant-first', tmpDir);
      saveAnthropicApiKey('sk-ant-second', tmpDir);
      const settings = getSettings(tmpDir);
      expect(settings.anthropicApiKey).toBe('sk-ant-second');
    });
  });

  describe('clearAnthropicApiKey', () => {
    it('removes API key from settings', () => {
      saveAnthropicApiKey('sk-ant-test123', tmpDir);
      clearAnthropicApiKey(tmpDir);
      const settings = getSettings(tmpDir);
      expect(settings.anthropicApiKey).toBeUndefined();
    });
  });

  describe('getAnthropicApiKey', () => {
    it('returns undefined when no key is set', () => {
      expect(getAnthropicApiKey(tmpDir)).toBeUndefined();
    });

    it('returns saved key from config', () => {
      saveAnthropicApiKey('sk-ant-fromfile', tmpDir);
      expect(getAnthropicApiKey(tmpDir)).toBe('sk-ant-fromfile');
    });

    it('prefers env var over saved config', () => {
      saveAnthropicApiKey('sk-ant-fromfile', tmpDir);
      process.env.ANTHROPIC_API_KEY = 'sk-ant-fromenv';
      expect(getAnthropicApiKey(tmpDir)).toBe('sk-ant-fromenv');
    });
  });

  describe('enhanced data persistence', () => {
    const sampleData = {
      title: 'Refactored auth module',
      developerTake: 'HS256 was a liability.',
      context: 'Auth module needed upgrade.',
      skills: ['TypeScript', 'Authentication'],
      questions: [{ text: 'Why this approach?', suggestedAnswer: 'Simpler and more secure.' }],
      executionSteps: [{ stepNumber: 1, title: 'Analyzed auth', body: 'Read auth.ts.' }],
    };

    it('returns null when no enhanced data exists', () => {
      expect(loadEnhancedData('nonexistent', tmpDir)).toBeNull();
    });

    it('saves and loads enhanced data', () => {
      saveEnhancedData('session-123', sampleData, tmpDir);
      const loaded = loadEnhancedData('session-123', tmpDir);
      expect(loaded).not.toBeNull();
      expect(loaded!.title).toBe('Refactored auth module');
      expect(loaded!.skills).toEqual(['TypeScript', 'Authentication']);
      expect(loaded!.enhancedAt).toBeDefined();
    });

    it('creates enhanced/ subdirectory', () => {
      saveEnhancedData('session-456', sampleData, tmpDir);
      expect(existsSync(join(tmpDir, 'enhanced', 'session-456.json'))).toBe(true);
    });

    it('deletes enhanced data', () => {
      saveEnhancedData('session-789', sampleData, tmpDir);
      expect(loadEnhancedData('session-789', tmpDir)).not.toBeNull();
      deleteEnhancedData('session-789', tmpDir);
      expect(loadEnhancedData('session-789', tmpDir)).toBeNull();
    });

    it('delete is idempotent for nonexistent data', () => {
      expect(() => deleteEnhancedData('nonexistent', tmpDir)).not.toThrow();
    });

    it('saves and loads quickEnhanced flag', () => {
      saveEnhancedData('session-quick', { ...sampleData, quickEnhanced: true }, tmpDir);
      const loaded = loadEnhancedData('session-quick', tmpDir);
      expect(loaded).not.toBeNull();
      expect(loaded!.quickEnhanced).toBe(true);
    });

    it('defaults quickEnhanced to false when not provided', () => {
      saveEnhancedData('session-normal', sampleData, tmpDir);
      const loaded = loadEnhancedData('session-normal', tmpDir);
      expect(loaded).not.toBeNull();
      expect(loaded!.quickEnhanced).toBe(false);
    });
  });

  describe('project enhance cache', () => {
    const sampleResult = {
      narrative: 'A test project narrative.',
      arc: [{ phase: 1, title: 'Setup', description: 'Initial setup' }],
      skills: ['TypeScript'],
      timeline: [{
        period: 'Day 1',
        label: 'Getting started',
        sessions: [{ sessionId: 's1', title: 'Init', featured: true }],
      }],
      questions: [{
        id: 'q1',
        category: 'pattern' as const,
        question: 'Why?',
        context: 'Because.',
      }],
    };

    const sessionData = {
      title: 'Test session',
      developerTake: 'A take',
      context: 'Context',
      skills: ['TS'],
      questions: [{ text: 'Q?', suggestedAnswer: 'A.' }],
      executionSteps: [{ stepNumber: 1, title: 'Step', body: 'Body' }],
    };

    it('returns null when no cache exists', () => {
      expect(loadProjectEnhanceResult('my-project', tmpDir)).toBeNull();
    });

    it('saves and loads project enhance result', () => {
      saveProjectEnhanceResult('my-project', ['s1', 's2'], sampleResult, tmpDir);
      const loaded = loadProjectEnhanceResult('my-project', tmpDir);
      expect(loaded).not.toBeNull();
      expect(loaded!.result.narrative).toBe('A test project narrative.');
      expect(loaded!.selectedSessionIds).toEqual(['s1', 's2']);
      expect(loaded!.enhancedAt).toBeDefined();
    });

    it('returns fresh cache when fingerprint matches', () => {
      // Save session data so fingerprint includes enhancedAt timestamps
      saveEnhancedData('s1', sessionData, tmpDir);
      saveEnhancedData('s2', sessionData, tmpDir);
      saveProjectEnhanceResult('my-project', ['s1', 's2'], sampleResult, tmpDir);

      const fresh = loadFreshProjectEnhanceResult('my-project', ['s1', 's2'], tmpDir);
      expect(fresh).not.toBeNull();
      expect(fresh!.result.narrative).toBe('A test project narrative.');
    });

    it('returns null for stale cache when session set changes', () => {
      saveEnhancedData('s1', sessionData, tmpDir);
      saveProjectEnhanceResult('my-project', ['s1'], sampleResult, tmpDir);

      // Request with different session set
      const fresh = loadFreshProjectEnhanceResult('my-project', ['s1', 's2'], tmpDir);
      expect(fresh).toBeNull();
    });

    it('returns null for stale cache when session is re-enhanced', async () => {
      saveEnhancedData('s1', sessionData, tmpDir);
      saveProjectEnhanceResult('my-project', ['s1'], sampleResult, tmpDir);

      // Wait so enhancedAt timestamp differs
      await new Promise((r) => setTimeout(r, 10));

      // Re-enhance the session (changes enhancedAt timestamp)
      saveEnhancedData('s1', { ...sessionData, title: 'Updated' }, tmpDir);

      const fresh = loadFreshProjectEnhanceResult('my-project', ['s1'], tmpDir);
      expect(fresh).toBeNull();
    });

    it('fingerprint is stable for same inputs', () => {
      saveEnhancedData('s1', sessionData, tmpDir);
      saveEnhancedData('s2', sessionData, tmpDir);
      const fp1 = buildProjectFingerprint(['s1', 's2'], tmpDir);
      const fp2 = buildProjectFingerprint(['s2', 's1'], tmpDir); // different order
      expect(fp1).toBe(fp2);
    });

    it('deletes project enhance cache', () => {
      saveProjectEnhanceResult('my-project', ['s1'], sampleResult, tmpDir);
      expect(loadProjectEnhanceResult('my-project', tmpDir)).not.toBeNull();
      deleteProjectEnhanceResult('my-project', tmpDir);
      expect(loadProjectEnhanceResult('my-project', tmpDir)).toBeNull();
    });

    it('delete is idempotent', () => {
      expect(() => deleteProjectEnhanceResult('nonexistent', tmpDir)).not.toThrow();
    });
  });

  describe('uploaded state persistence', () => {
    it('returns null when no uploaded state exists', () => {
      expect(getUploadedState('my-project', tmpDir)).toBeNull();
    });

    it('saves and loads uploaded state', () => {
      saveUploadedState('my-project', {
        slug: 'my-project',
        projectId: 42,
        uploadedSessions: ['s1', 's2'],
      }, tmpDir);
      const loaded = getUploadedState('my-project', tmpDir);
      expect(loaded).not.toBeNull();
      expect(loaded!.slug).toBe('my-project');
      expect(loaded!.projectId).toBe(42);
      expect(loaded!.uploadedSessions).toEqual(['s1', 's2']);
      expect(loaded!.uploadedAt).toBeDefined();
    });

    it('overwrites previous uploaded state', () => {
      saveUploadedState('my-project', {
        slug: 'my-project',
        projectId: 42,
        uploadedSessions: ['s1'],
      }, tmpDir);
      saveUploadedState('my-project', {
        slug: 'my-project',
        projectId: 42,
        uploadedSessions: ['s1', 's2', 's3'],
      }, tmpDir);
      const loaded = getUploadedState('my-project', tmpDir);
      expect(loaded!.uploadedSessions).toEqual(['s1', 's2', 's3']);
    });

    it('creates uploaded/ subdirectory', () => {
      saveUploadedState('my-project', {
        slug: 'my-project',
        projectId: 1,
        uploadedSessions: [],
      }, tmpDir);
      expect(existsSync(join(tmpDir, 'published', 'my-project.json'))).toBe(true);
    });
  });
});
