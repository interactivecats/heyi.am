/**
 * Mock data for template previews.
 *
 * Used by the template browser to render Liquid templates with
 * representative data when no static mockup HTML exists.
 */

import type { PortfolioRenderData, ProjectRenderData, SessionRenderData } from './types.js';

export function getMockPortfolioData(): PortfolioRenderData {
  return {
    user: {
      username: 'alexchen',
      accent: '#084471',
      displayName: 'Alex Chen',
      bio: 'Full-stack engineer who ships fast and thinks deeply. I build tools that make developers more productive — from CLI utilities to AI-powered code assistants.',
      location: 'San Francisco, CA',
      status: 'active',
      email: 'alex@example.com',
      phone: '+1 (555) 123-4567',
      photoUrl: '/preview/template-assets/headshot-man-1-400.jpg',
      githubUrl: 'https://github.com/alexchen',
      linkedinUrl: 'https://linkedin.com/in/alexchen',
      twitterHandle: 'alexchendev',
      websiteUrl: 'https://alexchen.dev',
      resumeUrl: '#',
    },
    projects: [
      {
        slug: 'budgetwise',
        title: 'BudgetWise',
        narrative: 'A personal finance tracker with AI-powered categorization. Built the Prisma schema, REST API, and React dashboard in a single sprint using Claude as a coding partner.',
        totalSessions: 8,
        totalLoc: 3200,
        totalDurationMinutes: 480,
        totalAgentDurationMinutes: 2064,
        totalFilesChanged: 45,
        skills: ['TypeScript', 'React', 'Prisma', 'Node.js'],
        publishedCount: 6,
      },
      {
        slug: 'shellhook',
        title: 'ShellHook',
        narrative: 'Git hooks manager that auto-installs and shares hooks across teams. Zero config, works with any shell, supports pre-commit, pre-push, and custom triggers.',
        totalSessions: 5,
        totalLoc: 1800,
        totalDurationMinutes: 300,
        totalAgentDurationMinutes: 900,
        totalFilesChanged: 22,
        skills: ['Rust', 'Shell', 'Git'],
        publishedCount: 4,
      },
      {
        slug: 'pixelboard',
        title: 'PixelBoard',
        narrative: 'Collaborative pixel art canvas with real-time sync. WebSocket-based with conflict-free replicated data types for seamless multi-user editing.',
        totalSessions: 12,
        totalLoc: 4500,
        totalDurationMinutes: 720,
        totalAgentDurationMinutes: 2160,
        totalFilesChanged: 60,
        skills: ['TypeScript', 'WebSocket', 'Canvas API', 'Redis'],
        publishedCount: 8,
      },
    ],
    totalDurationMinutes: 1500,
    totalAgentDurationMinutes: 5124,
    totalLoc: 9500,
    totalSessions: 25,
  };
}

export function getMockProjectData(): ProjectRenderData {
  return {
    user: { username: 'alexchen', accent: '#084471' },
    project: {
      slug: 'budgetwise',
      title: 'BudgetWise',
      narrative: 'A personal finance tracker with AI-powered transaction categorization. What started as a weekend project grew into a full-stack app with a Prisma-backed API, React dashboard, and ML-powered category suggestions. The key insight was treating each transaction as a classification problem — the model learns from your corrections and gets smarter over time.',
      repoUrl: 'https://github.com/alexchen/budgetwise',
      projectUrl: 'https://budgetwise.app',
      timeline: [],
      skills: ['TypeScript', 'React', 'Prisma', 'Node.js', 'PostgreSQL', 'TailwindCSS'],
      totalSessions: 8,
      totalLoc: 3200,
      totalDurationMinutes: 480,
      totalAgentDurationMinutes: 2064,
      totalFilesChanged: 45,
      totalTokens: 1250000,
    },
    sessions: [
      {
        token: 'session-1',
        slug: 'prisma-schema-setup',
        title: 'Set up Prisma schema and migrations',
        devTake: 'Got the data model right on the first try — accounts, transactions, categories, and budget rules.',
        durationMinutes: 65,
        turns: 18,
        locChanged: 420,
        filesChanged: 8,
        skills: ['Prisma', 'PostgreSQL'],
        recordedAt: '2026-03-15T10:00:00Z',
        sourceTool: 'claude',
      },
      {
        token: 'session-2',
        slug: 'rest-api-endpoints',
        title: 'Build REST API with Express',
        devTake: 'CRUD endpoints for transactions and categories. Added pagination and filtering.',
        durationMinutes: 90,
        turns: 24,
        locChanged: 680,
        filesChanged: 12,
        skills: ['TypeScript', 'Node.js'],
        recordedAt: '2026-03-16T14:00:00Z',
        sourceTool: 'claude',
      },
      {
        token: 'session-3',
        slug: 'react-dashboard',
        title: 'React dashboard with charts',
        devTake: 'Built the spending breakdown and monthly trend charts. Used Recharts for visualization.',
        durationMinutes: 75,
        turns: 20,
        locChanged: 550,
        filesChanged: 10,
        skills: ['React', 'TailwindCSS'],
        recordedAt: '2026-03-17T09:00:00Z',
        sourceTool: 'claude',
      },
      {
        token: 'session-4',
        slug: 'ai-categorization',
        title: 'AI-powered transaction categorization',
        devTake: 'The classifier learns from user corrections. Accuracy jumped from 60% to 92% after 50 labeled transactions.',
        durationMinutes: 120,
        turns: 35,
        locChanged: 800,
        filesChanged: 15,
        skills: ['TypeScript', 'ML'],
        recordedAt: '2026-03-18T11:00:00Z',
        sourceTool: 'claude',
      },
    ],
    sessionBaseUrl: '#',
  };
}

/** Full session objects for chart rendering — includes children for multi-agent display. */
export function getMockFullSessions(): Array<Record<string, unknown>> {
  return [
    {
      id: 'session-1', slug: 'prisma-schema-setup', title: 'Set up Prisma schema and migrations',
      date: '2026-03-15T10:00:00Z', durationMinutes: 65, turns: 18,
      linesOfCode: 420, filesChanged: 8, status: 'enhanced', source: 'claude',
      projectName: 'BudgetWise', skills: ['Prisma', 'PostgreSQL'], rawLog: [],
      children: [
        { sessionId: 'sub-1a', role: 'backend-dev', durationMinutes: 40, linesOfCode: 280, date: '2026-03-15T10:05:00Z' },
        { sessionId: 'sub-1b', role: 'code-reviewer', durationMinutes: 15, linesOfCode: 0, date: '2026-03-15T10:30:00Z' },
      ],
    },
    {
      id: 'session-2', slug: 'rest-api-endpoints', title: 'Build REST API with Express',
      date: '2026-03-16T14:00:00Z', durationMinutes: 90, turns: 24,
      linesOfCode: 680, filesChanged: 12, status: 'enhanced', source: 'claude',
      projectName: 'BudgetWise', skills: ['TypeScript', 'Node.js'], rawLog: [],
      children: [
        { sessionId: 'sub-2a', role: 'backend-dev', durationMinutes: 55, linesOfCode: 450, date: '2026-03-16T14:05:00Z' },
        { sessionId: 'sub-2b', role: 'qa-engineer', durationMinutes: 20, linesOfCode: 120, date: '2026-03-16T14:40:00Z' },
        { sessionId: 'sub-2c', role: 'security-engineer', durationMinutes: 10, linesOfCode: 30, date: '2026-03-16T15:00:00Z' },
      ],
    },
    {
      id: 'session-3', slug: 'react-dashboard', title: 'React dashboard with charts',
      date: '2026-03-17T09:00:00Z', durationMinutes: 75, turns: 20,
      linesOfCode: 550, filesChanged: 10, status: 'enhanced', source: 'claude',
      projectName: 'BudgetWise', skills: ['React', 'TailwindCSS'], rawLog: [],
      children: [
        { sessionId: 'sub-3a', role: 'frontend-dev', durationMinutes: 50, linesOfCode: 380, date: '2026-03-17T09:05:00Z' },
        { sessionId: 'sub-3b', role: 'ux-designer', durationMinutes: 15, linesOfCode: 80, date: '2026-03-17T09:35:00Z' },
      ],
    },
    {
      id: 'session-4', slug: 'ai-categorization', title: 'AI-powered transaction categorization',
      date: '2026-03-18T11:00:00Z', durationMinutes: 120, turns: 35,
      linesOfCode: 800, filesChanged: 15, status: 'enhanced', source: 'claude',
      projectName: 'BudgetWise', skills: ['TypeScript', 'ML'], rawLog: [],
      children: [
        { sessionId: 'sub-4a', role: 'backend-dev', durationMinutes: 70, linesOfCode: 500, date: '2026-03-18T11:05:00Z' },
        { sessionId: 'sub-4b', role: 'qa-engineer', durationMinutes: 25, linesOfCode: 150, date: '2026-03-18T11:50:00Z' },
        { sessionId: 'sub-4c', role: 'code-reviewer', durationMinutes: 15, linesOfCode: 0, date: '2026-03-18T12:15:00Z' },
      ],
    },
  ];
}

export function getMockProjectArc() {
  return [
    { phase: 1, title: 'Foundation', description: 'Set up Prisma schema, database migrations, and seed data. Established the core data model for accounts, transactions, and categories.' },
    { phase: 2, title: 'API & Data Layer', description: 'Built RESTful endpoints with Express. Added pagination, filtering, and input validation. Connected to PostgreSQL via Prisma client.' },
    { phase: 3, title: 'Frontend Dashboard', description: 'Created React components for spending breakdown, monthly trends, and budget tracking. Used Recharts for interactive visualizations.' },
    { phase: 4, title: 'AI Categorization', description: 'Trained a transaction classifier that learns from user corrections. Achieved 92% accuracy after 50 labeled examples using embeddings-based similarity.' },
  ];
}

export function getMockSessionData(): SessionRenderData {
  return {
    user: { username: 'alexchen', accent: '#084471' },
    projectSlug: 'budgetwise',
    session: {
      token: 'session-1',
      title: 'Set up Prisma schema and migrations',
      devTake: 'Got the data model right on the first try — accounts, transactions, categories, and budget rules. The key was thinking about the relationships upfront instead of iterating.',
      context: 'Starting the BudgetWise project from scratch. Need a solid data foundation before building the API.',
      narrative: 'Started by mapping out the core entities: Users own Accounts, Accounts have Transactions, Transactions belong to Categories, and Categories can be nested. Added a BudgetRule model to track monthly spending limits per category. The Prisma schema came together cleanly — the main design decision was whether to use a single Transaction table with a type enum or separate Income/Expense tables. Went with the enum approach for query simplicity.',
      durationMinutes: 65,
      turns: 18,
      filesChanged: 8,
      locChanged: 420,
      skills: ['Prisma', 'PostgreSQL', 'TypeScript'],
      beats: [
        { stepNumber: 1, title: 'Project scaffolding', body: 'Initialized the repo with TypeScript, ESLint, and Prisma CLI.' },
        { stepNumber: 2, title: 'Core schema design', body: 'Defined User, Account, Transaction, Category, and BudgetRule models with proper relations.' },
        { stepNumber: 3, title: 'Migration and seed', body: 'Generated the initial migration and wrote seed data for testing.' },
        { stepNumber: 4, title: 'Type generation', body: 'Generated TypeScript types from the Prisma schema for type-safe queries.' },
      ],
      qaPairs: [
        { question: 'Why Prisma over raw SQL?', answer: 'Type safety and migration management. The generated client catches schema drift at compile time.' },
        { question: 'How do nested categories work?', answer: 'Self-referential relation — each Category has an optional parentId. Queries use recursive CTEs for the full tree.' },
      ],
      highlights: [
        'Clean separation between financial and budget models',
        'Self-referential categories enable unlimited nesting depth',
        'Seed script generates realistic test data',
      ],
      toolBreakdown: [
        { tool: 'Read', count: 15 },
        { tool: 'Write', count: 12 },
        { tool: 'Edit', count: 8 },
        { tool: 'Bash', count: 6 },
        { tool: 'Grep', count: 4 },
      ],
      topFiles: [
        { path: 'prisma/schema.prisma', additions: 120, deletions: 0 },
        { path: 'src/db/seed.ts', additions: 85, deletions: 0 },
        { path: 'src/types/models.ts', additions: 65, deletions: 0 },
        { path: 'prisma/migrations/001_init/migration.sql', additions: 95, deletions: 0 },
        { path: 'src/db/client.ts', additions: 25, deletions: 0 },
      ],
      recordedAt: '2026-03-15T10:00:00Z',
      sourceTool: 'claude',
      template: 'case-study',
      agentSummary: {
        is_orchestrated: true as const,
        agents: [
          { role: 'backend-dev', duration_minutes: 35, loc_changed: 250 },
          { role: 'code-reviewer', duration_minutes: 18, loc_changed: 0 },
          { role: 'qa-engineer', duration_minutes: 12, loc_changed: 80 },
        ],
      },
    },
  };
}
