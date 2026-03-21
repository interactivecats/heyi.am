import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  getSettings,
  saveAnthropicApiKey,
  clearAnthropicApiKey,
  getAnthropicApiKey,
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
});
