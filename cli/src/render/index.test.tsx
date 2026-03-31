import { describe, it, expect } from 'vitest';
import {
  renderProjectHtml,
  renderSessionHtml,
  RenderError,
} from './index.js';
import type {
  ProjectRenderData,
  SessionRenderData,
} from './types.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeProjectData(overrides?: Partial<ProjectRenderData>): ProjectRenderData {
  return {
    user: { username: 'testuser', accent: '#084471' },
    project: {
      slug: 'my-project',
      title: 'My Project',
      narrative: 'Building something useful',
      timeline: [],
      skills: ['TypeScript'],
      totalSessions: 5,
      totalLoc: 800,
      totalDurationMinutes: 120,
      totalFilesChanged: 30,
    },
    sessions: [
      {
        token: 'abc123',
        slug: 'first-session',
        title: 'First Session',
        devTake: 'Got the basics working',
        durationMinutes: 45,
        turns: 12,
        locChanged: 200,
        filesChanged: 8,
        skills: ['TypeScript'],
        recordedAt: '2026-03-20T14:00:00Z',
        sourceTool: 'claude',
      },
    ],
    ...overrides,
  };
}

function makeSessionData(overrides?: Partial<SessionRenderData>): SessionRenderData {
  return {
    user: { username: 'testuser', accent: '#084471' },
    projectSlug: 'my-project',
    session: {
      token: 'abc123',
      title: 'Adding render pipeline',
      devTake: 'Built the static HTML renderer',
      durationMinutes: 90,
      turns: 25,
      filesChanged: 12,
      locChanged: 450,
      skills: ['TypeScript', 'React'],
      recordedAt: '2026-03-23T10:00:00Z',
      sourceTool: 'claude',
      template: 'case-study',
      beats: [
        { stepNumber: 1, title: 'Setup', body: 'Created render directory' },
        { stepNumber: 2, title: 'Components', body: 'Built three page components' },
      ],
      qaPairs: [
        { question: 'Why static rendering?', answer: 'Phoenix serves pre-rendered HTML' },
      ],
      highlights: ['Clean separation of concerns'],
      toolBreakdown: [
        { tool: 'Read', count: 15 },
        { tool: 'Write', count: 8 },
      ],
      topFiles: [
        { path: 'src/render/index.tsx', additions: 100, deletions: 0 },
      ],
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Project rendering
// ---------------------------------------------------------------------------

describe('renderProjectHtml', () => {
  it('returns HTML with project title and narrative', () => {
    const html = renderProjectHtml(makeProjectData());
    expect(html).toContain('My Project');
    expect(html).toContain('Building something useful');
  });

  it('renders session cards', () => {
    const html = renderProjectHtml(makeProjectData());
    expect(html).toContain('First Session');
    expect(html).toContain('session-card');
  });

  it('renders skill chips', () => {
    const html = renderProjectHtml(makeProjectData());
    expect(html).toContain('TypeScript');
    expect(html).toContain('chip');
  });

  it('renders optional links when provided', () => {
    const data = makeProjectData();
    data.project.repoUrl = 'https://github.com/test/repo';
    data.project.projectUrl = 'https://example.com';
    const html = renderProjectHtml(data);
    expect(html).toContain('https://github.com/test/repo');
    expect(html).toContain('https://example.com');
  });

  it('omits links section when no URLs provided', () => {
    const html = renderProjectHtml(makeProjectData());
    expect(html).not.toContain('project-link');
  });

  it('renders screenshot img when screenshotUrl is provided', () => {
    const data = makeProjectData();
    data.project.screenshotUrl = '/testuser/my-project/screenshot.png';
    const html = renderProjectHtml(data);
    expect(html).toContain('<img');
    expect(html).toContain('/testuser/my-project/screenshot.png');
    expect(html).toContain('browser-chrome');
  });

  it('omits screenshot when screenshotUrl is not provided', () => {
    const html = renderProjectHtml(makeProjectData());
    expect(html).not.toContain('browser-chrome');
  });

  it('produces a fragment, not a full HTML document', () => {
    const html = renderProjectHtml(makeProjectData());
    expect(html).not.toContain('<html');
    expect(html).not.toContain('<head>');
    expect(html).not.toContain('<body');
  });

  it('throws VALIDATION_ERROR when project slug is missing', () => {
    const bad = makeProjectData();
    (bad.project as any).slug = '';
    expect(() => renderProjectHtml(bad)).toThrow(RenderError);
  });
});

// ---------------------------------------------------------------------------
// Session rendering
// ---------------------------------------------------------------------------

describe('renderSessionHtml', () => {
  it('returns HTML with session title and dev take', () => {
    const html = renderSessionHtml(makeSessionData());
    expect(html).toContain('Adding render pipeline');
    expect(html).toContain('Built the static HTML renderer');
  });

  it('renders beats', () => {
    const html = renderSessionHtml(makeSessionData());
    expect(html).toContain('Setup');
    expect(html).toContain('Created render directory');
    expect(html).toContain('beats-list');
  });

  it('renders Q&A pairs', () => {
    const html = renderSessionHtml(makeSessionData());
    expect(html).toContain('Why static rendering?');
    expect(html).toContain('Phoenix serves pre-rendered HTML');
  });

  it('renders highlights', () => {
    const html = renderSessionHtml(makeSessionData());
    expect(html).toContain('Clean separation of concerns');
  });

  it('renders tool breakdown', () => {
    const html = renderSessionHtml(makeSessionData());
    expect(html).toContain('Read');
    expect(html).toContain('15');
  });

  it('renders top files with additions and deletions', () => {
    const html = renderSessionHtml(makeSessionData());
    expect(html).toContain('src/render/index.tsx');
    expect(html).toContain('+100');
    expect(html).toContain('-0');
  });

  it('renders breadcrumb with project slug', () => {
    const html = renderSessionHtml(makeSessionData());
    expect(html).toContain('my-project');
    expect(html).toContain('breadcrumb');
  });

  it('omits project from breadcrumb when projectSlug is undefined', () => {
    const data = makeSessionData({ projectSlug: undefined });
    const html = renderSessionHtml(data);
    expect(html).toContain('testuser');
    expect(html).not.toContain('my-project');
  });

  it('omits optional sections when data is absent', () => {
    const minimal = makeSessionData();
    minimal.session.beats = undefined;
    minimal.session.qaPairs = undefined;
    minimal.session.highlights = undefined;
    minimal.session.toolBreakdown = undefined;
    minimal.session.topFiles = undefined;
    minimal.session.narrative = undefined;
    const html = renderSessionHtml(minimal);
    expect(html).not.toContain('beats-list');
    expect(html).not.toContain('qa-pair');
    expect(html).not.toContain('highlights-list');
    expect(html).not.toContain('tool-list');
    expect(html).not.toContain('file-list');
  });

  it('throws VALIDATION_ERROR when session token is missing', () => {
    const bad = makeSessionData();
    (bad.session as any).token = '';
    expect(() => renderSessionHtml(bad)).toThrow(RenderError);
    try {
      renderSessionHtml(bad);
    } catch (e) {
      expect((e as RenderError).code).toBe('VALIDATION_ERROR');
      expect((e as RenderError).message).toContain('session.token');
    }
  });

  it('throws VALIDATION_ERROR when template is missing', () => {
    const bad = makeSessionData();
    (bad.session as any).template = '';
    expect(() => renderSessionHtml(bad)).toThrow(RenderError);
  });

  it('HTML-encodes user content to prevent XSS', () => {
    const data = makeSessionData();
    data.session.devTake = '<script>alert("xss")</script>';
    const html = renderSessionHtml(data);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

// ---------------------------------------------------------------------------
// Template-specific rendering (kinetic, terminal, minimal)
// ---------------------------------------------------------------------------

const CUSTOM_TEMPLATES = ['kinetic', 'terminal', 'minimal'] as const;

describe.each(CUSTOM_TEMPLATES)('%s template — project', (templateName) => {
  it('renders with data-template and data-render-version attributes', () => {
    const html = renderProjectHtml(makeProjectData(), undefined, templateName);
    expect(html).toContain(`data-template="${templateName}"`);
    expect(html).toContain('data-render-version="2"');
  });

  it('renders project title', () => {
    const html = renderProjectHtml(makeProjectData(), undefined, templateName);
    expect(html).toContain('My Project');
  });

  it('renders stats data', () => {
    const html = renderProjectHtml(makeProjectData(), undefined, templateName);
    expect(html).toContain('5'); // totalSessions
  });

  it('renders narrative', () => {
    const html = renderProjectHtml(makeProjectData(), undefined, templateName);
    expect(html).toContain('Building something useful');
  });

  it('renders skills', () => {
    const html = renderProjectHtml(makeProjectData(), undefined, templateName);
    expect(html).toContain('TypeScript');
  });

  it('renders session entries', () => {
    const html = renderProjectHtml(makeProjectData(), undefined, templateName);
    expect(html).toContain('First Session');
  });

  it('produces a fragment, not a full document', () => {
    const html = renderProjectHtml(makeProjectData(), undefined, templateName);
    expect(html).not.toContain('<html');
    expect(html).not.toContain('<head>');
  });
});

describe.each(CUSTOM_TEMPLATES)('%s template — session', (templateName) => {
  it('renders with data-template and data-render-version attributes', () => {
    const html = renderSessionHtml(makeSessionData(), templateName);
    expect(html).toContain(`data-template="${templateName}"`);
    expect(html).toContain('data-render-version="2"');
  });

  it('renders session title', () => {
    const html = renderSessionHtml(makeSessionData(), templateName);
    expect(html).toContain('Adding render pipeline');
  });

  it('renders dev take', () => {
    const html = renderSessionHtml(makeSessionData(), templateName);
    expect(html).toContain('Built the static HTML renderer');
  });

  it('renders stats', () => {
    const html = renderSessionHtml(makeSessionData(), templateName);
    expect(html).toContain('25'); // turns
  });

  it('renders tools inline', () => {
    const html = renderSessionHtml(makeSessionData(), templateName);
    expect(html).toContain('Read');
    expect(html).toContain('15');
  });

  it('renders top files', () => {
    const html = renderSessionHtml(makeSessionData(), templateName);
    expect(html).toContain('src/render/index.tsx');
    expect(html).toContain('+100');
  });

  it('renders beats', () => {
    const html = renderSessionHtml(makeSessionData(), templateName);
    expect(html).toContain('Setup');
    expect(html).toContain('Created render directory');
  });

  it('renders Q&amp;A', () => {
    const html = renderSessionHtml(makeSessionData(), templateName);
    expect(html).toContain('Why static rendering?');
  });

  it('omits optional sections when data is absent', () => {
    const data = makeSessionData();
    data.session.beats = undefined;
    data.session.qaPairs = undefined;
    data.session.highlights = undefined;
    data.session.toolBreakdown = undefined;
    data.session.topFiles = undefined;
    data.session.narrative = undefined;
    const html = renderSessionHtml(data, templateName);
    // Should still render without errors
    expect(html).toContain(`data-template="${templateName}"`);
    expect(html).toContain('Adding render pipeline');
  });
});
