import { describe, it, expect } from 'vitest';
import {
  renderPortfolioHtml,
  renderProjectHtml,
  renderSessionHtml,
  RenderError,
} from './index.js';
import type {
  PortfolioRenderData,
  ProjectRenderData,
  SessionRenderData,
} from './types.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makePortfolioData(overrides?: Partial<PortfolioRenderData>): PortfolioRenderData {
  return {
    user: {
      username: 'testuser',
      displayName: 'Test User',
      bio: 'Builds things',
      location: 'NYC',
      status: 'open to work',
      accent: '#084471',
    },
    projects: [
      {
        slug: 'my-project',
        title: 'My Project',
        narrative: 'A cool project',
        totalSessions: 5,
        totalLoc: 1200,
        totalDurationMinutes: 340,
        totalFilesChanged: 42,
        skills: ['TypeScript', 'React'],
        publishedCount: 3,
      },
    ],
    ...overrides,
  };
}

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
// Portfolio rendering
// ---------------------------------------------------------------------------

describe('renderPortfolioHtml', () => {
  it('returns an HTML string with user info', () => {
    const html = renderPortfolioHtml(makePortfolioData());
    expect(html).toContain('Test User');
    expect(html).toContain('Builds things');
    expect(html).toContain('NYC');
  });

  it('renders project cards', () => {
    const html = renderPortfolioHtml(makePortfolioData());
    expect(html).toContain('My Project');
    expect(html).toContain('A cool project');
    expect(html).toContain('TypeScript');
    expect(html).toContain('React');
  });

  it('renders empty projects array without crashing', () => {
    const html = renderPortfolioHtml(makePortfolioData({ projects: [] }));
    expect(html).toContain('Test User');
    expect(html).not.toContain('portfolio-projects-grid');
  });

  it('produces a fragment, not a full HTML document', () => {
    const html = renderPortfolioHtml(makePortfolioData());
    expect(html).not.toContain('<html');
    expect(html).not.toContain('<head>');
    expect(html).not.toContain('<body');
  });

  it('throws RenderError with VALIDATION_ERROR when user is missing username', () => {
    const bad = makePortfolioData();
    (bad.user as any).username = '';
    expect(() => renderPortfolioHtml(bad)).toThrow(RenderError);
    try {
      renderPortfolioHtml(bad);
    } catch (e) {
      expect((e as RenderError).code).toBe('VALIDATION_ERROR');
      expect((e as RenderError).message).toContain('user.username');
    }
  });

  it('reports all validation errors at once', () => {
    const bad = makePortfolioData();
    (bad.user as any).username = '';
    (bad.user as any).displayName = '';
    try {
      renderPortfolioHtml(bad);
    } catch (e) {
      const msg = (e as RenderError).message;
      expect(msg).toContain('user.username');
      expect(msg).toContain('user.displayName');
    }
  });
});

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
    expect(html).toContain('project-preview__session-card');
  });

  it('includes breadcrumb with username', () => {
    const html = renderProjectHtml(makeProjectData());
    expect(html).toContain('testuser');
    expect(html).toContain('project-preview__breadcrumb');
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
    expect(html).not.toContain('project-preview__link');
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

  it('renders beats as an ordered list', () => {
    const html = renderSessionHtml(makeSessionData());
    expect(html).toContain('Setup');
    expect(html).toContain('Created render directory');
    expect(html).toContain('session-beats');
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
    expect(html).toContain('session-breadcrumb');
  });

  it('omits project from breadcrumb when projectSlug is undefined', () => {
    const data = makeSessionData({ projectSlug: undefined });
    const html = renderSessionHtml(data);
    // Should have username and session title, but no project link
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
    expect(html).not.toContain('session-beats');
    expect(html).not.toContain('session-qa');
    expect(html).not.toContain('session-highlights');
    expect(html).not.toContain('session-tools');
    expect(html).not.toContain('session-files');
    expect(html).not.toContain('session-narrative');
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
