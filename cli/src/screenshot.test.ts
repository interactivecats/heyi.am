import { describe, it, expect, vi, beforeEach } from 'vitest';
import { findChrome } from './screenshot.js';

// We can only unit-test findChrome (filesystem check).
// captureScreenshot requires a real Chrome install + network, so it's integration-only.

describe('findChrome', () => {
  it('returns a string or null', () => {
    const result = findChrome();
    expect(result === null || typeof result === 'string').toBe(true);
  });

  it('returns a path that exists if non-null', async () => {
    const result = findChrome();
    if (result !== null) {
      const { existsSync } = await import('node:fs');
      expect(existsSync(result)).toBe(true);
    }
  });
});
