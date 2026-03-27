/**
 * Static HTML renderer for portfolio pages.
 *
 * Produces self-contained HTML fragments (no <html>, no <head>) using
 * ReactDOMServer.renderToStaticMarkup(). The output is stored in the DB
 * and served by Phoenix as pre-rendered content.
 *
 * These functions run on the Node.js server, never in the browser.
 */

import React from 'react';
import ReactDOMServer from 'react-dom/server';
import type { PortfolioRenderData, ProjectRenderData, SessionRenderData } from './types.js';
import { PortfolioPage } from './components/PortfolioPage.js';
import { ProjectPage } from './components/ProjectPage.js';
import { ProjectExportPage } from './components/ProjectExportPage.js';
import { SessionPage } from './components/SessionPage.js';

export type { PortfolioRenderData, ProjectRenderData, SessionRenderData } from './types.js';

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

function validatePortfolio(data: PortfolioRenderData): void {
  const errors: ValidationFailure[] = [];

  if (!data.user) {
    errors.push({ field: 'user', message: 'required' });
  } else {
    if (!data.user.username) errors.push({ field: 'user.username', message: 'required' });
    if (!data.user.displayName) errors.push({ field: 'user.displayName', message: 'required' });
  }
  if (!Array.isArray(data.projects)) {
    errors.push({ field: 'projects', message: 'must be an array' });
  }

  if (errors.length > 0) collectErrors(errors);
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
 * Render a portfolio page to a static HTML fragment.
 *
 * @throws {RenderError} with code VALIDATION_ERROR if required fields are missing
 * @throws {RenderError} with code RENDER_FAILED if ReactDOMServer throws
 */
export function renderPortfolioHtml(data: PortfolioRenderData): string {
  validatePortfolio(data);

  try {
    return ReactDOMServer.renderToStaticMarkup(
      React.createElement(PortfolioPage, { data })
    );
  } catch (err: unknown) {
    throw new RenderError(
      'RENDER_FAILED',
      `Failed to render portfolio page for ${data.user.username}`,
      err,
    );
  }
}

/**
 * Render a project page to a static HTML fragment.
 *
 * @throws {RenderError} with code VALIDATION_ERROR if required fields are missing
 * @throws {RenderError} with code RENDER_FAILED if ReactDOMServer throws
 */
export function renderProjectHtml(data: ProjectRenderData): string {
  validateProject(data);

  try {
    return ReactDOMServer.renderToStaticMarkup(
      React.createElement(ProjectPage, { data })
    );
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
 * @throws {RenderError} with code RENDER_FAILED if ReactDOMServer throws
 */
export function renderSessionHtml(data: SessionRenderData): string {
  validateSession(data);

  try {
    return ReactDOMServer.renderToStaticMarkup(
      React.createElement(SessionPage, { data })
    );
  } catch (err: unknown) {
    throw new RenderError(
      'RENDER_FAILED',
      `Failed to render session page for ${data.session.token}`,
      err,
    );
  }
}

/**
 * Render a project page for standalone HTML export.
 *
 * Uses the dashboard-style layout (browser chrome, cards, stat grid)
 * instead of the Phoenix publish layout.
 */
export function renderProjectExportHtml(data: ProjectRenderData): string {
  validateProject(data);

  try {
    return ReactDOMServer.renderToStaticMarkup(
      React.createElement(ProjectExportPage, { data })
    );
  } catch (err: unknown) {
    throw new RenderError(
      'RENDER_FAILED',
      `Failed to render project export page for ${data.project.slug}`,
      err,
    );
  }
}
