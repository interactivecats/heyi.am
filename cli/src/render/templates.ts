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
  label: string; // Display name (e.g., "Editorial", "Kinetic")
  description: string;
  accent: string; // primary accent color
  mode: 'light' | 'dark';
  tags: string[]; // For filtering: 'animated', 'minimal', 'data-dense'
}

export const BUILT_IN_TEMPLATES: TemplateInfo[] = [
  // Original 5
  { name: 'editorial', label: 'Editorial', description: 'Classic light theme with card-based layout', accent: '#084471', mode: 'light', tags: [] },
  { name: 'kinetic', label: 'Kinetic', description: 'Matches the heyi.am landing page — orange accent, section tags, narrative cards', accent: '#f97316', mode: 'dark', tags: ['animated'] },
  { name: 'terminal', label: 'Terminal', description: 'Green-on-black terminal aesthetic with ASCII elements', accent: '#4ade80', mode: 'dark', tags: ['minimal'] },
  { name: 'minimal', label: 'Typography', description: 'Ultra-clean light mode with serif typography', accent: '#1c1917', mode: 'light', tags: ['minimal'] },
  { name: 'showcase', label: 'Showcase', description: 'Cinematic scroll animations with animated charts and stat counters', accent: '#818cf8', mode: 'dark', tags: ['animated'] },

  // New templates
  { name: 'parallax', label: 'Parallax', description: 'Fixed floating headshot with full-page parallax — content scrolls around the photo', accent: '#60a5fa', mode: 'dark', tags: ['animated'] },
  { name: 'blueprint', label: 'Blueprint', description: 'Engineering schematic with SVG connector lines, grid background, and dimension annotations', accent: '#64748b', mode: 'light', tags: ['animated'] },
  { name: 'radar', label: 'Radar', description: 'HUD cockpit with radar navigation widget and cyan-tinted luminous elements', accent: '#22d3ee', mode: 'dark', tags: ['animated', 'data-dense'] },
  { name: 'strata', label: 'Strata', description: 'Depth-based parallax with overlapping card layers and warm amber palette', accent: '#d97706', mode: 'light', tags: ['animated'] },
  { name: 'noir', label: 'Noir', description: 'Pure monochrome — black, white, gray only with bold typography and film noir drama', accent: '#e5e5e5', mode: 'dark', tags: ['minimal'] },
  { name: 'verdant', label: 'Verdant', description: 'Nature-inspired with warm earthy palette, leaf motifs, and organic rounded shapes', accent: '#15803d', mode: 'light', tags: [] },
  { name: 'neon', label: 'Neon', description: 'Synthwave aesthetic with pink and cyan dual accent and tasteful neon glow effects', accent: '#f472b6', mode: 'dark', tags: ['animated'] },
  { name: 'paper', label: 'Paper', description: 'Newspaper print aesthetic with multi-column layout, drop caps, and serif typography', accent: '#1a1a1a', mode: 'light', tags: ['minimal'] },
  { name: 'cosmos', label: 'Cosmos', description: 'Starfield background with gold accent and constellation SVG lines connecting elements', accent: '#fbbf24', mode: 'dark', tags: ['animated'] },
  { name: 'bauhaus', label: 'Bauhaus', description: 'De Stijl geometric shapes in red, blue, yellow with thick borders and asymmetric grids', accent: '#dc2626', mode: 'light', tags: ['animated'] },
  { name: 'mono', label: 'Mono', description: '100% monospace terminal — green on black, ASCII bar charts, git-log phases, typing animation', accent: '#4ade80', mode: 'dark', tags: ['minimal', 'data-dense'] },
  { name: 'glacier', label: 'Glacier', description: 'Frosted glassmorphism with backdrop blur cards, cool blue palette, and soft shadows', accent: '#38bdf8', mode: 'light', tags: ['animated'] },
  { name: 'ember', label: 'Ember', description: 'Warm dark theme with orange-to-red fire gradient accents and ember glow on stats', accent: '#f97316', mode: 'dark', tags: ['animated'] },
  { name: 'zen', label: 'Zen', description: 'Japanese minimalism — maximum whitespace, no cards, thin rules, serif display, 640px column', accent: '#78716c', mode: 'light', tags: ['minimal'] },
  { name: 'circuit', label: 'Circuit', description: 'PCB aesthetic with circuit trace patterns, component pads, and lime green accent', accent: '#a3e635', mode: 'dark', tags: ['animated'] },
  { name: 'parchment', label: 'Parchment', description: 'Old book aesthetic with all-serif typography, sepia palette, drop caps, and colophon footer', accent: '#92400e', mode: 'light', tags: ['minimal'] },
  { name: 'aurora', label: 'Aurora', description: 'Northern lights gradient header that slowly shifts — restrained dark with teal magic', accent: '#2dd4bf', mode: 'dark', tags: ['animated'] },
  { name: 'grid', label: 'Grid', description: 'Bento dashboard layout with mixed-size CSS grid cells like iOS widgets', accent: '#6366f1', mode: 'light', tags: ['data-dense'] },
  { name: 'obsidian', label: 'Obsidian', description: 'Deep black with purple gem accent and hover shimmer like light catching a gemstone', accent: '#a855f7', mode: 'dark', tags: ['animated'] },
  { name: 'chalk', label: 'Chalk', description: 'Whiteboard aesthetic with handwritten display font, sketch-style borders, and annotation arrows', accent: '#334155', mode: 'light', tags: [] },
  { name: 'signal', label: 'Signal', description: 'Mission control dashboard — dense data tables, status badges, and fast-updating metrics', accent: '#ef4444', mode: 'dark', tags: ['data-dense'] },
  { name: 'canvas', label: 'Canvas', description: 'Art gallery with extreme whitespace, full-bleed images, and large airy typography', accent: '#fb7185', mode: 'light', tags: ['minimal'] },
  { name: 'meridian', label: 'Meridian', description: 'Topographic map aesthetic with contour line patterns and elevation-style charts', accent: '#34d399', mode: 'dark', tags: ['animated'] },
  { name: 'carbon', label: 'Carbon', description: 'Brushed metal industrial — diagonal stripe texture, silver chrome palette, no color', accent: '#94a3b8', mode: 'dark', tags: ['minimal'] },
  { name: 'daylight', label: 'Daylight', description: 'Bright and airy with soft blue shadows, sky blue accent, and friendly rounded shapes', accent: '#0ea5e9', mode: 'light', tags: ['animated'] },
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
const cssCache = new Map<string, string>();

export function getTemplateCss(templateName: string): string {
  const name = isValidTemplate(templateName) ? templateName : DEFAULT_TEMPLATE;
  const cached = cssCache.get(name);
  if (cached !== undefined) return cached;

  let css = '';
  try {
    css = readFileSync(resolve(TEMPLATES_DIR, 'styles.css'), 'utf-8');
  } catch { /* empty */ }

  try {
    const templateCss = readFileSync(resolve(TEMPLATES_DIR, name, 'styles.css'), 'utf-8');
    css += '\n\n/* === ' + name + ' template styles === */\n' + templateCss;
  } catch { /* no template-specific CSS — fine */ }

  cssCache.set(name, css);
  return css;
}

export function getTemplateNames(): string[] {
  return BUILT_IN_TEMPLATES.map((t) => t.name);
}

export function getTemplateInfo(name: string): TemplateInfo | undefined {
  return BUILT_IN_TEMPLATES.find((t) => t.name === name);
}
