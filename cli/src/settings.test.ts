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
      title: 'Refactored auth to Ed25519',
      developerTake: 'HS256 was a liability.',
      context: 'Auth module needed upgrade.',
      skills: ['TypeScript', 'Cryptography'],
      questions: [{ text: 'Why Ed25519?', suggestedAnswer: 'Smaller keys, faster.' }],
      executionSteps: [{ stepNumber: 1, title: 'Analyzed auth', body: 'Read auth.ts.' }],
    };

    it('returns null when no enhanced data exists', () => {
      expect(loadEnhancedData('nonexistent', tmpDir)).toBeNull();
    });

    it('saves and loads enhanced data', () => {
      saveEnhancedData('session-123', sampleData, tmpDir);
      const loaded = loadEnhancedData('session-123', tmpDir);
      expect(loaded).not.toBeNull();
      expect(loaded!.title).toBe('Refactored auth to Ed25519');
      expect(loaded!.skills).toEqual(['TypeScript', 'Cryptography']);
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
});
