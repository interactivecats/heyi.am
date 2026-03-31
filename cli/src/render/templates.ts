/**
 * Template registry for heyi.am project/session rendering.
 *
 * Built-in templates ship with the CLI. Custom user templates
 * can live in ~/.config/heyiam/templates/{name}/ (Phase 2).
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = resolve(__dirname, 'templates');

export interface TemplateInfo {
  name: string;
  description: string;
  accent: string; // primary accent color
  mode: 'light' | 'dark';
}

export const BUILT_IN_TEMPLATES: TemplateInfo[] = [
  { name: 'editorial', description: 'Classic light theme with card-based layout', accent: '#084471', mode: 'light' },
  { name: 'kinetic', description: 'Dark theme with orange accents and stats-forward layout', accent: '#f97316', mode: 'dark' },
  { name: 'terminal', description: 'Green-on-black terminal aesthetic', accent: '#4ade80', mode: 'dark' },
  { name: 'minimal', description: 'Ultra-clean light mode with serif typography', accent: '#1c1917', mode: 'light' },
  { name: 'showcase', description: 'Dark with scroll animations and violet accents', accent: '#818cf8', mode: 'dark' },
];

const BUILT_IN_NAMES = new Set(BUILT_IN_TEMPLATES.map((t) => t.name));

export const DEFAULT_TEMPLATE = 'editorial';

export function isValidTemplate(name: string): boolean {
  return BUILT_IN_NAMES.has(name);
}

/**
 * Resolve which template to use.
 * Priority: project override → user default → 'editorial'
 */
export function resolveTemplate(projectTemplate?: string, userDefault?: string): string {
  if (projectTemplate && isValidTemplate(projectTemplate)) return projectTemplate;
  if (userDefault && isValidTemplate(userDefault)) return userDefault;
  return DEFAULT_TEMPLATE;
}

/**
 * Load concatenated CSS for a template (base + template-specific).
 * Used by export.ts for standalone HTML and by preview.
 */
export function getTemplateCss(templateName: string): string {
  const name = isValidTemplate(templateName) ? templateName : DEFAULT_TEMPLATE;

  // For now, use the single styles.css until CSS is split (Step 3).
  // This function is the single point to update when CSS is split.
  try {
    const baseCss = readFileSync(resolve(TEMPLATES_DIR, 'styles.css'), 'utf-8');
    return baseCss;
  } catch {
    return '';
  }
}

export function getTemplateNames(): string[] {
  return BUILT_IN_TEMPLATES.map((t) => t.name);
}

export function getTemplateInfo(name: string): TemplateInfo | undefined {
  return BUILT_IN_TEMPLATES.find((t) => t.name === name);
}
