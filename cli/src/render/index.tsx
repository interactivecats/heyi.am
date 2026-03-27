/**
 * Static HTML renderer for portfolio pages.
 *
 * Produces self-contained HTML fragments (no <html>, no <head>) using
 * Liquid templates. The output is stored in the DB and served by Phoenix
 * as pre-rendered content, or written to standalone HTML files for export.
 *
 * These functions run on the Node.js server, never in the browser.
 */

import type { ProjectRenderData, SessionRenderData } from './types.js';
import { renderProject, renderSession } from './liquid.js';

export type { ProjectRenderData, SessionRenderData } from './types.js';

/** Errors from the render pipeline carry a machine-readable code. */
export class RenderError extends Error {
  readonly code: string;

  constructor(code: string, message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'RenderError';
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Validation helpers — validate at the boundary, trust internally
// ---------------------------------------------------------------------------

interface ValidationFailure {
  field: string;
  message: string;
}

function collectErrors(failures: ValidationFailure[]): never {
  const detail = failures.map((f) => `${f.field}: ${f.message}`).join('; ');
  throw new RenderError('VALIDATION_ERROR', `Render data validation failed: ${detail}`);
}

function validateProject(data: ProjectRenderData): void {
  const errors: ValidationFailure[] = [];

  if (!data.user) {
    errors.push({ field: 'user', message: 'required' });
  } else {
    if (!data.user.username) errors.push({ field: 'user.username', message: 'required' });
  }
  if (!data.project) {
    errors.push({ field: 'project', message: 'required' });
  } else {
    if (!data.project.slug) errors.push({ field: 'project.slug', message: 'required' });
    if (!data.project.title) errors.push({ field: 'project.title', message: 'required' });
  }
  if (!Array.isArray(data.sessions)) {
    errors.push({ field: 'sessions', message: 'must be an array' });
  }

  if (errors.length > 0) collectErrors(errors);
}

function validateSession(data: SessionRenderData): void {
  const errors: ValidationFailure[] = [];

  if (!data.user) {
    errors.push({ field: 'user', message: 'required' });
  } else {
    if (!data.user.username) errors.push({ field: 'user.username', message: 'required' });
  }
  if (!data.session) {
    errors.push({ field: 'session', message: 'required' });
  } else {
    if (!data.session.token) errors.push({ field: 'session.token', message: 'required' });
    if (!data.session.title) errors.push({ field: 'session.title', message: 'required' });
    if (!data.session.template) errors.push({ field: 'session.template', message: 'required' });
  }

  if (errors.length > 0) collectErrors(errors);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Render a project page to a static HTML fragment.
 *
 * @throws {RenderError} with code VALIDATION_ERROR if required fields are missing
 * @throws {RenderError} with code RENDER_FAILED if Liquid rendering fails
 */
export function renderProjectHtml(
  data: ProjectRenderData,
  extras?: {
    arc?: Array<{ phase: number; title: string; description: string }>;
    fullSessions?: Array<Record<string, unknown>>;
  },
): string {
  validateProject(data);

  try {
    return renderProject(data, extras);
  } catch (err: unknown) {
    throw new RenderError(
      'RENDER_FAILED',
      `Failed to render project page for ${data.project.slug}`,
      err,
    );
  }
}

/**
 * Render a session page to a static HTML fragment.
 *
 * @throws {RenderError} with code VALIDATION_ERROR if required fields are missing
 * @throws {RenderError} with code RENDER_FAILED if Liquid rendering fails
 */
export function renderSessionHtml(data: SessionRenderData): string {
  validateSession(data);

  try {
    return renderSession(data);
  } catch (err: unknown) {
    throw new RenderError(
      'RENDER_FAILED',
      `Failed to render session page for ${data.session.token}`,
      err,
    );
  }
}
