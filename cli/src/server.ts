import express, { type Request, type Response } from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Server } from 'node:http';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Server-side stub data (mirrors the frontend mock-data structure)
interface Project {
  name: string;
  sessionCount: number;
  description: string;
}

interface Session {
  id: string;
  title: string;
  date: string;
  durationMinutes: number;
  turns: number;
  linesOfCode: number;
  toolCalls: number;
  status: string;
  projectName: string;
  sessionRef?: string;
  context?: string;
  developerTake?: string;
  skills?: string[];
  executionPath?: Array<{ stepNumber: number; title: string; description: string; type?: string }>;
  toolBreakdown?: Array<{ tool: string; count: number }>;
  filesChanged?: Array<{ path: string; additions: number; deletions: number }>;
  turnTimeline?: Array<{ timestamp: string; type: string; content: string }>;
  rawLog?: string[];
}

const PROJECTS: Project[] = [
  { name: 'auth-service', sessionCount: 2, description: 'JWT auth and OAuth provider layer' },
  { name: 'data-pipeline', sessionCount: 2, description: 'Event stream ETL and ingestion' },
  { name: 'ui-components', sessionCount: 1, description: 'Accessible component library' },
  { name: 'api-gateway', sessionCount: 1, description: 'Request validation and routing' },
];

const SESSIONS: Session[] = [
  {
    id: 'ses-001',
    title: 'Refactor JWT middleware to support refresh tokens',
    date: '2026-03-18T14:32:00Z',
    durationMinutes: 47,
    turns: 23,
    linesOfCode: 312,
    toolCalls: 90,
    status: 'published',
    projectName: 'auth-service',
    sessionRef: 'REF_AUTH_042',
    context: 'Legacy auth used symmetric HS256 with single-token expiry.',
    skills: ['Node.js', 'JWT Security', 'Ed25519', 'Redis'],
  },
  {
    id: 'ses-002',
    title: 'Add OAuth2 provider abstraction layer',
    date: '2026-03-17T09:15:00Z',
    durationMinutes: 63,
    turns: 31,
    linesOfCode: 487,
    toolCalls: 72,
    status: 'draft',
    projectName: 'auth-service',
    sessionRef: 'REF_AUTH_041',
    context: 'Hardcoded Google OAuth in auth.controller.ts.',
    skills: ['TypeScript', 'OAuth2', 'Design Patterns'],
  },
  {
    id: 'ses-003',
    title: 'Build ETL pipeline for event stream processing',
    date: '2026-03-16T11:00:00Z',
    durationMinutes: 89,
    turns: 42,
    linesOfCode: 634,
    toolCalls: 118,
    status: 'published',
    projectName: 'data-pipeline',
    sessionRef: 'REF_DATA_017',
    context: 'Kafka event stream had no transform layer.',
    skills: ['Kafka', 'ETL', 'PostgreSQL', 'Batch Processing'],
  },
  {
    id: 'ses-004',
    title: 'Implement accessible dropdown component',
    date: '2026-03-15T16:20:00Z',
    durationMinutes: 34,
    turns: 18,
    linesOfCode: 198,
    toolCalls: 41,
    status: 'draft',
    projectName: 'ui-components',
    context: 'Design system needed an accessible dropdown.',
    skills: ['React', 'Accessibility', 'ARIA', 'CSS'],
  },
  {
    id: 'ses-005',
    title: 'Add request validation and error serialization',
    date: '2026-03-14T13:45:00Z',
    durationMinutes: 52,
    turns: 27,
    linesOfCode: 401,
    toolCalls: 65,
    status: 'archived',
    projectName: 'api-gateway',
    context: '14 route handlers had no input validation.',
    skills: ['Zod', 'Express', 'Error Handling', 'TypeScript'],
  },
  {
    id: 'ses-006',
    title: 'Optimize batch insert performance',
    date: '2026-03-13T10:10:00Z',
    durationMinutes: 71,
    turns: 35,
    linesOfCode: 289,
    toolCalls: 84,
    status: 'published',
    projectName: 'data-pipeline',
    sessionRef: 'REF_DATA_016',
    context: 'Event ingestion dropping events at peak load.',
    skills: ['PostgreSQL', 'Performance', 'COPY Protocol'],
  },
];

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  // API routes
  app.get('/api/projects', (_req: Request, res: Response) => {
    res.json({ projects: PROJECTS });
  });

  app.get('/api/projects/:project/sessions', (req: Request, res: Response) => {
    const { project } = req.params;
    const sessions = SESSIONS.filter((s) => s.projectName === project);
    res.json({ sessions });
  });

  app.get('/api/projects/:project/sessions/:id', (req: Request, res: Response) => {
    const { project, id } = req.params;
    const session = SESSIONS.find((s) => s.projectName === project && s.id === id);
    if (!session) {
      res.status(404).json({ error: { code: 'SESSION_NOT_FOUND', message: 'Session not found' } });
      return;
    }
    res.json({ session });
  });

  app.post('/api/publish', (_req: Request, res: Response) => {
    res.json({ status: 'stub', message: 'Publish coming soon' });
  });

  app.get('/api/auth/status', (_req: Request, res: Response) => {
    res.json({ authenticated: false, message: 'Auth coming soon' });
  });

  // Serve React app static files
  const staticDir = path.resolve(__dirname, '..', 'app', 'dist');
  app.use(express.static(staticDir));

  // SPA fallback — serve index.html for non-API routes
  app.get('/{*splat}', (_req: Request, res: Response) => {
    res.sendFile(path.join(staticDir, 'index.html'));
  });

  return app;
}

export function startServer(port: number = 3457): Promise<Server> {
  const app = createApp();
  return new Promise((resolve) => {
    const server = app.listen(port, () => {
      resolve(server);
    });
  });
}
