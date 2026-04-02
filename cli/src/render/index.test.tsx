import { describe, it, expect } from 'vitest';
import {
  renderProjectHtml,
  renderSessionHtml,
  renderPortfolioHtml,
  RenderError,
} from './index.js';
import type {
  ProjectRenderData,
  SessionRenderData,
  PortfolioRenderData,
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
    expect(html).toContain('ed-screenshot-card');
  });

  it('omits screenshot when screenshotUrl is not provided', () => {
    const html = renderProjectHtml(makeProjectData());
    expect(html).not.toContain('ed-screenshot-card');
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
    expect(html).toContain('ed-beats');
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
    // deletions=0 may be omitted by the template
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

const CUSTOM_TEMPLATES = ['editorial', 'kinetic', 'terminal', 'minimal', 'zen', 'noir', 'blueprint', 'parallax', 'showcase', 'carbon', 'canvas', 'circuit', 'aurora', 'chalk', 'bauhaus', 'cosmos', 'glacier', 'ember', 'daylight', 'neon', 'mono', 'grid', 'meridian', 'obsidian', 'radar', 'parchment', 'paper', 'signal', 'strata', 'verdant'] as const;

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

// ---------------------------------------------------------------------------
// Portfolio fixtures
// ---------------------------------------------------------------------------

function makePortfolioData(overrides?: Partial<PortfolioRenderData>): PortfolioRenderData {
  return {
    user: {
      username: 'testuser',
      accent: '#084471',
      displayName: 'Test User',
      bio: 'Building things that matter',
      location: 'San Francisco, CA',
      status: 'active',
      email: 'test@example.com',
      githubUrl: 'https://github.com/testuser',
      linkedinUrl: 'https://linkedin.com/in/testuser',
      twitterHandle: 'testuser',
      websiteUrl: 'https://testuser.dev',
    },
    projects: [
      {
        slug: 'my-project',
        title: 'My Project',
        narrative: 'A project about building cool things with TypeScript',
        totalSessions: 5,
        totalLoc: 800,
        totalDurationMinutes: 120,
        totalFilesChanged: 30,
        skills: ['TypeScript', 'React'],
        publishedCount: 3,
      },
      {
        slug: 'second-project',
        title: 'Second Project',
        narrative: 'Another project',
        totalSessions: 3,
        totalLoc: 400,
        totalDurationMinutes: 60,
        totalFilesChanged: 15,
        skills: ['Elixir'],
        publishedCount: 2,
      },
    ],
    totalDurationMinutes: 180,
    totalLoc: 1200,
    totalSessions: 8,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Portfolio rendering (editorial — default)
// ---------------------------------------------------------------------------

describe('renderPortfolioHtml', () => {
  it('returns HTML with user display name', () => {
    const html = renderPortfolioHtml(makePortfolioData());
    expect(html).toContain('Test User');
  });

  it('renders user bio', () => {
    const html = renderPortfolioHtml(makePortfolioData());
    expect(html).toContain('Building things that matter');
  });

  it('renders user location', () => {
    const html = renderPortfolioHtml(makePortfolioData());
    expect(html).toContain('San Francisco, CA');
  });

  it('renders contact links', () => {
    const html = renderPortfolioHtml(makePortfolioData());
    expect(html).toContain('mailto:test@example.com');
    expect(html).toContain('https://github.com/testuser');
    expect(html).toContain('https://linkedin.com/in/testuser');
    expect(html).toContain('@testuser');
    expect(html).toContain('testuser.dev');
  });

  it('renders project cards', () => {
    const html = renderPortfolioHtml(makePortfolioData());
    expect(html).toContain('My Project');
    expect(html).toContain('Second Project');
    expect(html).toContain('project-card');
  });

  it('renders aggregate stats', () => {
    const html = renderPortfolioHtml(makePortfolioData());
    expect(html).toContain('8'); // totalSessions
    expect(html).toContain('1,200'); // totalLoc formatted
  });

  it('renders total time when no agent duration', () => {
    const html = renderPortfolioHtml(makePortfolioData());
    expect(html).toContain('Total Time');
    expect(html).toContain('3.0h'); // 180 min
  });

  it('renders leverage when agent duration is provided', () => {
    const data = makePortfolioData({ totalAgentDurationMinutes: 360 });
    const html = renderPortfolioHtml(data);
    expect(html).toContain('you');
    expect(html).toContain('agents');
  });

  it('renders skill chips on project cards', () => {
    const html = renderPortfolioHtml(makePortfolioData());
    expect(html).toContain('TypeScript');
    expect(html).toContain('chip');
  });

  it('omits optional profile fields gracefully', () => {
    const data = makePortfolioData();
    data.user.bio = '';
    data.user.location = '';
    data.user.email = undefined;
    data.user.githubUrl = undefined;
    data.user.linkedinUrl = undefined;
    data.user.twitterHandle = undefined;
    data.user.websiteUrl = undefined;
    const html = renderPortfolioHtml(data);
    expect(html).toContain('Test User');
    expect(html).not.toContain('portfolio-bio');
    expect(html).not.toContain('portfolio-location');
    expect(html).not.toContain('mailto:');
  });

  it('handles empty projects array', () => {
    const data = makePortfolioData({ projects: [] });
    const html = renderPortfolioHtml(data);
    expect(html).toContain('Test User');
    expect(html).not.toContain('project-card');
  });

  it('produces a fragment, not a full HTML document', () => {
    const html = renderPortfolioHtml(makePortfolioData());
    expect(html).not.toContain('<html');
    expect(html).not.toContain('<head>');
    expect(html).not.toContain('<body');
  });

  it('includes data-template and data-render-version', () => {
    const html = renderPortfolioHtml(makePortfolioData());
    expect(html).toContain('data-template="editorial"');
    expect(html).toContain('data-render-version="2"');
  });

  it('throws VALIDATION_ERROR when user is missing', () => {
    const bad = makePortfolioData();
    (bad as any).user = null;
    expect(() => renderPortfolioHtml(bad)).toThrow(RenderError);
  });

  it('throws VALIDATION_ERROR when username is missing', () => {
    const bad = makePortfolioData();
    (bad.user as any).username = '';
    expect(() => renderPortfolioHtml(bad)).toThrow(RenderError);
  });

  it('throws VALIDATION_ERROR when projects is not an array', () => {
    const bad = makePortfolioData();
    (bad as any).projects = 'not-an-array';
    expect(() => renderPortfolioHtml(bad)).toThrow(RenderError);
  });

  it('HTML-encodes user content to prevent XSS', () => {
    const data = makePortfolioData();
    data.user.bio = '<script>alert("xss")</script>';
    const html = renderPortfolioHtml(data);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('renders project narrative on cards', () => {
    const data = makePortfolioData();
    data.projects[0].narrative = 'A'.repeat(200);
    const html = renderPortfolioHtml(data);
    // Full text is present in DOM; CSS line-clamp handles visual truncation
    expect(html).toContain('ed-project-card-narrative');
  });

  it('renders resume link when resumeUrl is provided', () => {
    const data = makePortfolioData();
    data.user.resumeUrl = 'https://example.com/resume.pdf';
    const html = renderPortfolioHtml(data);
    expect(html).toContain('Download Resume');
    expect(html).toContain('https://example.com/resume.pdf');
  });

  it('renders photo when photoUrl is provided', () => {
    const data = makePortfolioData();
    data.user.photoUrl = 'https://example.com/photo.jpg';
    const html = renderPortfolioHtml(data);
    expect(html).toContain('ed-profile-photo');
    expect(html).toContain('https://example.com/photo.jpg');
  });
});

// ---------------------------------------------------------------------------
// Portfolio — template-specific rendering
// ---------------------------------------------------------------------------

const PORTFOLIO_TEMPLATES = ['editorial', 'kinetic', 'terminal', 'minimal', 'zen', 'noir', 'blueprint', 'parallax', 'showcase', 'carbon', 'canvas', 'circuit', 'aurora', 'chalk', 'bauhaus', 'cosmos', 'glacier', 'ember', 'daylight', 'neon', 'mono', 'grid', 'meridian', 'obsidian', 'radar', 'parchment', 'paper', 'signal', 'strata', 'verdant'] as const;

describe.each(PORTFOLIO_TEMPLATES)('%s template — portfolio', (templateName) => {
  it('renders with data-template and data-render-version attributes', () => {
    const html = renderPortfolioHtml(makePortfolioData(), templateName);
    expect(html).toContain(`data-template="${templateName}"`);
    expect(html).toContain('data-render-version="2"');
  });

  it('renders user display name', () => {
    const html = renderPortfolioHtml(makePortfolioData(), templateName);
    expect(html).toContain('Test User');
  });

  it('renders project titles', () => {
    const html = renderPortfolioHtml(makePortfolioData(), templateName);
    expect(html).toContain('My Project');
    expect(html).toContain('Second Project');
  });

  it('renders stats data', () => {
    const html = renderPortfolioHtml(makePortfolioData(), templateName);
    expect(html).toContain('8'); // totalSessions
  });

  it('produces a fragment, not a full document', () => {
    const html = renderPortfolioHtml(makePortfolioData(), templateName);
    expect(html).not.toContain('<html');
    expect(html).not.toContain('<head>');
  });

  it('renders with empty projects without error', () => {
    const data = makePortfolioData({ projects: [] });
    const html = renderPortfolioHtml(data, templateName);
    expect(html).toContain(`data-template="${templateName}"`);
    expect(html).toContain('Test User');
  });

  it('renders with leverage data when agent duration provided', () => {
    const data = makePortfolioData({ totalAgentDurationMinutes: 360 });
    const html = renderPortfolioHtml(data, templateName);
    expect(html).toContain(`data-template="${templateName}"`);
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
