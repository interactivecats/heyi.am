import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from './server.js';

const app = createApp();

describe('GET /api/projects', () => {
  it('returns a list of projects', async () => {
    const res = await request(app).get('/api/projects');
    expect(res.status).toBe(200);
    expect(res.body.projects).toBeInstanceOf(Array);
    expect(res.body.projects.length).toBeGreaterThan(0);
    expect(res.body.projects[0]).toHaveProperty('name');
    expect(res.body.projects[0]).toHaveProperty('sessionCount');
    expect(res.body.projects[0]).toHaveProperty('description');
  });
});

describe('GET /api/projects/:project/sessions', () => {
  it('returns sessions for an existing project', async () => {
    const res = await request(app).get('/api/projects/auth-service/sessions');
    expect(res.status).toBe(200);
    expect(res.body.sessions).toBeInstanceOf(Array);
    expect(res.body.sessions.length).toBe(2);
    expect(res.body.sessions.every((s: { projectName: string }) => s.projectName === 'auth-service')).toBe(true);
  });

  it('returns empty array for unknown project', async () => {
    const res = await request(app).get('/api/projects/nonexistent/sessions');
    expect(res.status).toBe(200);
    expect(res.body.sessions).toEqual([]);
  });
});

describe('GET /api/projects/:project/sessions/:id', () => {
  it('returns a specific session', async () => {
    const res = await request(app).get('/api/projects/auth-service/sessions/ses-001');
    expect(res.status).toBe(200);
    expect(res.body.session).toBeDefined();
    expect(res.body.session.id).toBe('ses-001');
    expect(res.body.session.projectName).toBe('auth-service');
  });

  it('returns 404 for unknown session', async () => {
    const res = await request(app).get('/api/projects/auth-service/sessions/ses-999');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('SESSION_NOT_FOUND');
  });

  it('returns 404 when project does not match session', async () => {
    const res = await request(app).get('/api/projects/data-pipeline/sessions/ses-001');
    expect(res.status).toBe(404);
  });
});

describe('POST /api/publish', () => {
  it('returns stub response', async () => {
    const res = await request(app).post('/api/publish').send({});
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('stub');
  });
});

describe('GET /api/auth/status', () => {
  it('returns unauthenticated stub', async () => {
    const res = await request(app).get('/api/auth/status');
    expect(res.status).toBe(200);
    expect(res.body.authenticated).toBe(false);
  });
});
