/**
 * Template registry for heyi.am project/session rendering.
 *
 * Templates are split into two dimensions:
 * - **Layout**: Liquid template structure (section order, card style, sidebar vs not)
 * - **Theme**: CSS color scheme (light/dark mode + accent color)
 *
 * The combination of layout + theme produces the final rendered page.
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = resolve(__dirname, 'templates');

// ── Layouts ─────────────────────────────────────────────────

export interface LayoutInfo {
  name: string;
  label: string;
  description: string;
}

export const LAYOUTS: LayoutInfo[] = [
  { name: 'editorial', label: 'Editorial', description: 'Card-based with sidebar session detail' },
  { name: 'kinetic', label: 'Kinetic', description: 'Stats-forward hero row, full-width sections' },
  { name: 'terminal', label: 'Terminal', description: 'Command-output style, tree phases, log entries' },
  { name: 'minimal', label: 'Minimal', description: 'Pure typography, no cards, ruled sections' },
];

const LAYOUT_NAMES = new Set(LAYOUTS.map((l) => l.name));

export const DEFAULT_LAYOUT = 'editorial';

export function isValidLayout(name: string): boolean {
  return LAYOUT_NAMES.has(name);
}

// ── Themes ──────────────────────────────────────────────────

export interface ThemeInfo {
  name: string;
  label: string;
  mode: 'light' | 'dark';
  accent: string;
  bg: string;
  text: string;
}

export const THEMES: ThemeInfo[] = [
  { name: 'light-blue', label: 'Light — Seal Blue', mode: 'light', accent: '#084471', bg: '#ffffff', text: '#191c1e' },
  { name: 'light-neutral', label: 'Light — Neutral', mode: 'light', accent: '#1c1917', bg: '#fafaf9', text: '#1c1917' },
  { name: 'dark-orange', label: 'Dark — Orange', mode: 'dark', accent: '#f97316', bg: '#09090b', text: '#fafafa' },
  { name: 'dark-green', label: 'Dark — Green', mode: 'dark', accent: '#4ade80', bg: '#0a0a0a', text: '#d4d4d8' },
  { name: 'dark-blue', label: 'Dark — Blue', mode: 'dark', accent: '#3b82f6', bg: '#09090b', text: '#fafafa' },
  { name: 'dark-violet', label: 'Dark — Violet', mode: 'dark', accent: '#a78bfa', bg: '#09090b', text: '#fafafa' },
];

const THEME_NAMES = new Set(THEMES.map((t) => t.name));

export const DEFAULT_THEME = 'light-blue';

export function isValidTheme(name: string): boolean {
  return THEME_NAMES.has(name);
}

export function getThemeInfo(name: string): ThemeInfo | undefined {
  return THEMES.find((t) => t.name === name);
}

// ── Resolution ──────────────────────────────────────────────

/**
 * Resolve which layout to use.
 * Priority: project override → user default → 'editorial'
 */
export function resolveLayout(projectLayout?: string, userDefault?: string): string {
  if (projectLayout && isValidLayout(projectLayout)) return projectLayout;
  if (userDefault && isValidLayout(userDefault)) return userDefault;
  return DEFAULT_LAYOUT;
}

/**
 * Resolve which theme to use.
 */
export function resolveTheme(projectTheme?: string, userDefault?: string): string {
  if (projectTheme && isValidTheme(projectTheme)) return projectTheme;
  if (userDefault && isValidTheme(userDefault)) return userDefault;
  return DEFAULT_THEME;
}

// Backward compat: "template" maps to layout name for server validation
export function isValidTemplate(name: string): boolean {
  return isValidLayout(name);
}

export function resolveTemplate(projectTemplate?: string, userDefault?: string): string {
  return resolveLayout(projectTemplate, userDefault);
}

// ── CSS loading ─────────────────────────────────────────────

/**
 * Load concatenated CSS for a layout + theme combination.
 * Used by export.ts for standalone HTML and by preview.
 */
export function getTemplateCss(layoutName: string): string {
  // For now, use the single styles.css until CSS is split.
  try {
    return readFileSync(resolve(TEMPLATES_DIR, 'styles.css'), 'utf-8');
  } catch {
    return '';
  }
}

export function getTemplateNames(): string[] {
  return LAYOUTS.map((l) => l.name);
}

export function getLayoutInfo(name: string): LayoutInfo | undefined {
  return LAYOUTS.find((l) => l.name === name);
}
