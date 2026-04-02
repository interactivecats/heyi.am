import { describe, it, expect } from 'vitest';
import {
  BUILT_IN_TEMPLATES,
  DEFAULT_TEMPLATE,
  isValidTemplate,
  resolveTemplate,
  getTemplateNames,
  getTemplateInfo,
  getTemplateCss,
} from './templates.js';

describe('templates', () => {
  describe('BUILT_IN_TEMPLATES', () => {
    it('has at least one template', () => {
      expect(BUILT_IN_TEMPLATES.length).toBeGreaterThan(0);
    });

    it('every template has required fields', () => {
      for (const t of BUILT_IN_TEMPLATES) {
        expect(typeof t.name).toBe('string');
        expect(t.name.length).toBeGreaterThan(0);
        expect(typeof t.label).toBe('string');
        expect(t.label.length).toBeGreaterThan(0);
        expect(typeof t.description).toBe('string');
        expect(typeof t.accent).toBe('string');
        expect(t.accent).toMatch(/^#[0-9a-fA-F]{6}$/);
        expect(['light', 'dark']).toContain(t.mode);
        expect(Array.isArray(t.tags)).toBe(true);
      }
    });

    it('label is a capitalized form of name', () => {
      for (const t of BUILT_IN_TEMPLATES) {
        expect(t.label[0]).toBe(t.label[0].toUpperCase());
      }
    });

    it('tags contain only known values', () => {
      const KNOWN_TAGS = ['animated', 'minimal', 'data-dense'];
      for (const t of BUILT_IN_TEMPLATES) {
        for (const tag of t.tags) {
          expect(KNOWN_TAGS).toContain(tag);
        }
      }
    });

    it('has unique names', () => {
      const names = BUILT_IN_TEMPLATES.map((t) => t.name);
      expect(new Set(names).size).toBe(names.length);
    });
  });

  describe('isValidTemplate', () => {
    it('returns true for built-in template names', () => {
      expect(isValidTemplate('editorial')).toBe(true);
      expect(isValidTemplate('kinetic')).toBe(true);
    });

    it('returns false for unknown names', () => {
      expect(isValidTemplate('nonexistent')).toBe(false);
      expect(isValidTemplate('')).toBe(false);
    });
  });

  describe('resolveTemplate', () => {
    it('uses project override when valid', () => {
      expect(resolveTemplate('kinetic', 'editorial')).toBe('kinetic');
    });

    it('falls back to user default when project override is invalid', () => {
      expect(resolveTemplate('bad', 'terminal')).toBe('terminal');
    });

    it('falls back to DEFAULT_TEMPLATE when both are invalid', () => {
      expect(resolveTemplate('bad', 'also-bad')).toBe(DEFAULT_TEMPLATE);
    });

    it('falls back to DEFAULT_TEMPLATE when both are undefined', () => {
      expect(resolveTemplate(undefined, undefined)).toBe(DEFAULT_TEMPLATE);
    });
  });

  describe('getTemplateNames', () => {
    it('returns array of all template names', () => {
      const names = getTemplateNames();
      expect(names).toContain('editorial');
      expect(names.length).toBe(BUILT_IN_TEMPLATES.length);
    });
  });

  describe('getTemplateInfo', () => {
    it('returns info for a known template', () => {
      const info = getTemplateInfo('editorial');
      expect(info).toBeDefined();
      expect(info!.label).toBe('Editorial');
      expect(info!.mode).toBe('light');
    });

    it('returns undefined for unknown template', () => {
      expect(getTemplateInfo('nonexistent')).toBeUndefined();
    });
  });

  describe('getTemplateCss', () => {
    it('returns base + editorial CSS', () => {
      const css = getTemplateCss('editorial');
      expect(css.length).toBeGreaterThan(0);
      expect(css).toContain('editorial template styles');
      expect(css).not.toContain('kinetic template styles');
    });

    it('returns base + template CSS for templates with styles.css', () => {
      const TEMPLATES_WITH_CSS = [
        'aurora', 'bauhaus', 'blueprint', 'canvas', 'carbon', 'chalk', 'circuit', 'cosmos',
        'daylight', 'editorial', 'ember', 'glacier', 'grid', 'kinetic', 'meridian', 'mono', 'neon',
        'noir', 'obsidian', 'paper', 'parallax', 'parchment', 'radar', 'showcase',
        'signal', 'strata', 'verdant', 'zen',
      ];
      for (const name of TEMPLATES_WITH_CSS) {
        const css = getTemplateCss(name);
        expect(css).toContain(`${name} template styles`);
      }
    });

    it('falls back to editorial for invalid template name', () => {
      const css = getTemplateCss('nonexistent');
      const editorialCss = getTemplateCss('editorial');
      expect(css).toBe(editorialCss);
    });
  });
});
