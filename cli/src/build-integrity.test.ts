/**
 * Build integrity tests — verify the npm package will work correctly after publish.
 * These tests check that build outputs exist and the server can resolve them.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, statSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const DIST_DIR = resolve(__dirname, '..', 'dist');
const PUBLIC_DIR = join(DIST_DIR, 'public');

describe('build output integrity', () => {
  it('dist/ directory exists', () => {
    expect(existsSync(DIST_DIR)).toBe(true);
  });

  it('dist/index.js exists and is executable entry point', () => {
    const indexPath = join(DIST_DIR, 'index.js');
    expect(existsSync(indexPath)).toBe(true);
    // Check shebang line
    const content = readFileSync(indexPath, 'utf-8');
    expect(content.startsWith('#!/')).toBe(true);
  });

  it('dist/server.js exists', () => {
    expect(existsSync(join(DIST_DIR, 'server.js'))).toBe(true);
  });

  it('dist/public/ directory exists (frontend build)', () => {
    expect(existsSync(PUBLIC_DIR)).toBe(true);
  });

  it('dist/public/index.html exists (SPA entry point)', () => {
    const indexHtml = join(PUBLIC_DIR, 'index.html');
    expect(existsSync(indexHtml)).toBe(true);
    // Should be a valid HTML file
    const content = readFileSync(indexHtml, 'utf-8');
    expect(content).toContain('<!doctype html>');
    expect(content).toContain('<div id="root">');
  });

  it('dist/public/assets/ contains JS and CSS bundles', () => {
    const assetsDir = join(PUBLIC_DIR, 'assets');
    expect(existsSync(assetsDir)).toBe(true);

    const files = require('node:fs').readdirSync(assetsDir) as string[];
    const jsFiles = files.filter((f: string) => f.endsWith('.js'));
    const cssFiles = files.filter((f: string) => f.endsWith('.css'));

    expect(jsFiles.length).toBeGreaterThan(0);
    expect(cssFiles.length).toBeGreaterThan(0);
  });

  it('dist/render/templates/ contains Liquid templates and CSS', () => {
    const templatesDir = join(DIST_DIR, 'render', 'templates');
    expect(existsSync(templatesDir)).toBe(true);
    expect(existsSync(join(templatesDir, 'project.liquid'))).toBe(true);
    expect(existsSync(join(templatesDir, 'session.liquid'))).toBe(true);
    expect(existsSync(join(templatesDir, 'styles.css'))).toBe(true);
  });

  it('frontend bundle is not trivially small (> 10KB)', () => {
    const assetsDir = join(PUBLIC_DIR, 'assets');
    const files = require('node:fs').readdirSync(assetsDir) as string[];
    const jsFiles = files.filter((f: string) => f.endsWith('.js'));

    for (const jsFile of jsFiles) {
      const size = statSync(join(assetsDir, jsFile)).size;
      // Main bundle should be substantial — a near-empty file signals a broken build
      if (jsFile.includes('index')) {
        expect(size).toBeGreaterThan(10_000);
      }
    }
  });
});

describe('package.json correctness', () => {
  const pkg = JSON.parse(readFileSync(resolve(__dirname, '..', 'package.json'), 'utf-8'));

  it('bin points to dist/index.js', () => {
    expect(pkg.bin.heyiam).toBe('./dist/index.js');
  });

  it('files includes dist', () => {
    expect(pkg.files).toContain('dist');
  });

  it('type is module (ESM)', () => {
    expect(pkg.type).toBe('module');
  });

  it('build script includes frontend build and copy', () => {
    expect(pkg.scripts.build).toContain('vite build');
    expect(pkg.scripts.build).toContain('cp -r');
    expect(pkg.scripts.build).toContain('dist/public');
  });

  it('build script copies render templates', () => {
    expect(pkg.scripts.build).toContain('templates');
  });
});
