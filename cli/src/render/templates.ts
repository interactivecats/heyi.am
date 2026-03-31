/**
 * Template registry for heyi.am project/session rendering.
 *
 * Templates are split into two dimensions:
 * - **Layout**: Liquid template structure (section order, card style, sidebar vs not)
 * - **Theme**: CSS color scheme (light/dark mode + accent color)
 *
 * Each theme has a default layout. Selecting a theme auto-selects its layout
 * unless the user has explicitly overridden the layout.
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
  /** Liquid template directory name */
  templateDir: string;
}

export const LAYOUTS: LayoutInfo[] = [
  { name: 'classic', label: 'Classic', description: 'Card-based with sidebar session detail', templateDir: 'editorial' },
  { name: 'stats-forward', label: 'Stats-Forward', description: 'Hero stats row, full-width sections', templateDir: 'kinetic' },
  { name: 'command-line', label: 'Command Line', description: 'Terminal-style with tree phases and log entries', templateDir: 'terminal' },
  { name: 'typography', label: 'Typography', description: 'Pure typography, no cards, ruled sections', templateDir: 'minimal' },
];

const LAYOUT_NAMES = new Set(LAYOUTS.map((l) => l.name));

export const DEFAULT_LAYOUT = 'classic';

export function isValidLayout(name: string): boolean {
  return LAYOUT_NAMES.has(name);
}

export function getLayoutInfo(name: string): LayoutInfo | undefined {
  return LAYOUTS.find((l) => l.name === name);
}

/** Map layout name to the Liquid template directory. */
export function getTemplateDir(layoutName: string): string {
  const layout = getLayoutInfo(layoutName);
  return layout?.templateDir ?? 'editorial';
}

// ── Themes ──────────────────────────────────────────────────

export interface ThemeInfo {
  name: string;
  label: string;
  mode: 'light' | 'dark';
  accent: string;
  bg: string;
  text: string;
  /** Default layout for this theme */
  defaultLayout: string;
}

export const THEMES: ThemeInfo[] = [
  { name: 'seal-blue', label: 'Seal Blue', mode: 'light', accent: '#084471', bg: '#ffffff', text: '#191c1e', defaultLayout: 'classic' },
  { name: 'warm-stone', label: 'Warm Stone', mode: 'light', accent: '#1c1917', bg: '#fafaf9', text: '#1c1917', defaultLayout: 'typography' },
  { name: 'ember', label: 'Ember', mode: 'dark', accent: '#f97316', bg: '#09090b', text: '#fafafa', defaultLayout: 'stats-forward' },
  { name: 'matrix', label: 'Matrix', mode: 'dark', accent: '#4ade80', bg: '#0a0a0a', text: '#d4d4d8', defaultLayout: 'command-line' },
  { name: 'midnight', label: 'Midnight', mode: 'dark', accent: '#3b82f6', bg: '#09090b', text: '#fafafa', defaultLayout: 'stats-forward' },
  { name: 'twilight', label: 'Twilight', mode: 'dark', accent: '#a78bfa', bg: '#09090b', text: '#fafafa', defaultLayout: 'classic' },
];

const THEME_NAMES = new Set(THEMES.map((t) => t.name));

export const DEFAULT_THEME = 'seal-blue';

export function isValidTheme(name: string): boolean {
  return THEME_NAMES.has(name);
}

export function getThemeInfo(name: string): ThemeInfo | undefined {
  return THEMES.find((t) => t.name === name);
}

// ── Resolution ──────────────────────────────────────────────

export function resolveLayout(projectLayout?: string, userDefault?: string): string {
  if (projectLayout && isValidLayout(projectLayout)) return projectLayout;
  if (userDefault && isValidLayout(userDefault)) return userDefault;
  return DEFAULT_LAYOUT;
}

export function resolveTheme(projectTheme?: string, userDefault?: string): string {
  if (projectTheme && isValidTheme(projectTheme)) return projectTheme;
  if (userDefault && isValidTheme(userDefault)) return userDefault;
  return DEFAULT_THEME;
}

// Backward compat: server validates "template" field against layout template dirs
export function isValidTemplate(name: string): boolean {
  return LAYOUTS.some((l) => l.templateDir === name);
}

export function resolveTemplate(projectTemplate?: string, userDefault?: string): string {
  return resolveLayout(projectTemplate, userDefault);
}

// ── CSS loading ─────────────────────────────────────────────

export function getTemplateCss(layoutName: string): string {
  try {
    return readFileSync(resolve(TEMPLATES_DIR, 'styles.css'), 'utf-8');
  } catch {
    return '';
  }
}

export function getTemplateNames(): string[] {
  return LAYOUTS.map((l) => l.templateDir);
}
