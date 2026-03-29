/**
 * Seeds a demo environment with fake data for marketing recordings.
 *
 * Creates a self-contained directory at ~/.config/heyiam/demo/ with:
 *   - sessions.db       — SQLite database with fake sessions + FTS
 *   - enhanced/          — fake enhanced data for select sessions
 *   - project-enhance/   — cached project narrative
 *   - settings.json      — onboarding complete, fake API key
 *   - sessions/          — minimal JSONL session files
 *
 * The real ~/.config/heyiam/ is never touched.
 */

import { join } from 'node:path';
import { homedir } from 'node:os';
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { openDatabase } from './db.js';
import {
  DEMO_PROJECTS,
  DEMO_SESSIONS,
  DEMO_TRANSCRIPT,
  DEMO_ENHANCE_RESULT,
} from './demo-data.js';

const DEMO_DIR = join(homedir(), '.config', 'heyiam', 'demo');

/**
 * Seed the demo environment. Returns the path so the caller can set
 * HEYIAM_CONFIG_DIR before starting the server.
 */
export function seedDemoMode(): string {
  // Clean slate each time
  if (existsSync(DEMO_DIR)) {
    rmSync(DEMO_DIR, { recursive: true });
  }

  mkdirSync(join(DEMO_DIR, 'enhanced'), { recursive: true });
  mkdirSync(join(DEMO_DIR, 'project-enhance'), { recursive: true });
  mkdirSync(join(DEMO_DIR, 'sessions'), { recursive: true });

  // ── 1. SQLite database ──────────────────────────────────────
  const dbPath = join(DEMO_DIR, 'sessions.db');
  const db = openDatabase(dbPath);

  const insertSession = db.prepare(`
    INSERT INTO sessions (
      id, project_dir, source, title, start_time, end_time,
      duration_minutes, wall_clock_minutes, turns, loc_added, loc_removed, loc_net,
      files_changed, tool_calls, skills, files_touched, models_used,
      cwd, parent_session_id, agent_role, is_subagent,
      file_path, file_mtime, file_size, indexed_at, context_summary
    ) VALUES (
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?
    )
  `);

  const insertFts = db.prepare(
    'INSERT INTO sessions_fts (session_id, role, content) VALUES (?, ?, ?)',
  );

  const insertFile = db.prepare(
    'INSERT INTO session_files (session_id, file_path, additions, deletions) VALUES (?, ?, ?, ?)',
  );

  const insertUuid = db.prepare(
    'INSERT INTO project_uuids (project_dir, uuid) VALUES (?, ?)',
  );

  const tx = db.transaction(() => {
    // Insert project UUIDs
    for (const proj of Object.values(DEMO_PROJECTS)) {
      insertUuid.run(proj.dirName, `proj-${proj.name}-0001`);
    }

    // Insert sessions
    for (const s of DEMO_SESSIONS) {
      const locAdded = s.filesChanged?.reduce((sum, f) => sum + f.additions, 0) ?? s.linesOfCode;
      const locRemoved = s.filesChanged?.reduce((sum, f) => sum + f.deletions, 0) ?? 0;
      const filePaths = s.filesChanged?.map((f) => f.path) ?? [];
      const jsonlPath = join(DEMO_DIR, 'sessions', `${s.id}.jsonl`);

      insertSession.run(
        s.id,
        s.projectName,
        s.source ?? 'claude',
        s.title,
        s.date,
        s.endTime ?? null,
        s.durationMinutes,
        s.wallClockMinutes ?? 0,
        s.turns,
        locAdded,
        locRemoved,
        locAdded - locRemoved,
        s.filesChanged?.length ?? 0,
        s.toolCalls ?? 0,
        JSON.stringify(s.skills ?? []),
        JSON.stringify(filePaths),
        JSON.stringify(['claude-sonnet-4-20250514']),
        s.cwd ?? null,
        s.parentSessionId ?? null,
        s.agentRole ?? null,
        s.parentSessionId ? 1 : 0,
        jsonlPath,
        Date.now(),
        1000,
        new Date().toISOString(),
        null,
      );

      // FTS: index the title and raw log for search
      insertFts.run(s.id, 'assistant', s.title);
      for (const line of s.rawLog) {
        insertFts.run(s.id, 'assistant', line);
      }
      // Add some user content for search
      if (s.turnTimeline) {
        for (const t of s.turnTimeline) {
          if (t.type === 'prompt') {
            insertFts.run(s.id, 'user', t.content);
          }
        }
      }

      // File changes — use explicit data or generate realistic ones
      const files = s.filesChanged?.length
        ? s.filesChanged
        : generateFileChanges(s.title, s.linesOfCode, s.skills ?? []);
      for (const f of files) {
        insertFile.run(s.id, f.path, f.additions, f.deletions);
      }

      // Also insert children as subagent sessions
      if (s.children) {
        for (const child of s.children) {
          insertSession.run(
            child.sessionId,
            s.projectName,
            s.source ?? 'claude',
            child.role,
            child.date ?? s.date,
            null,
            child.durationMinutes,
            child.durationMinutes,
            Math.round(child.durationMinutes * 0.8),
            child.linesOfCode,
            0,
            child.linesOfCode,
            0,
            0,
            JSON.stringify([]),
            JSON.stringify([]),
            JSON.stringify(['claude-sonnet-4-20250514']),
            s.cwd ?? null,
            s.id,           // parent_session_id
            child.role,     // agent_role
            1,              // is_subagent
            join(DEMO_DIR, 'sessions', `${child.sessionId}.jsonl`),
            Date.now(),
            500,
            new Date().toISOString(),
            null,
          );
          insertFts.run(child.sessionId, 'assistant', child.role);

          // Write a minimal JSONL for the child
          writeMinimalJsonl(join(DEMO_DIR, 'sessions', `${child.sessionId}.jsonl`), child.role, s.date);
        }
      }
    }
  });
  tx();

  // ── 2. JSONL session files ──────────────────────────────────
  // Write minimal JSONL that the parser can read for transcript/context
  for (const s of DEMO_SESSIONS) {
    const jsonlPath = join(DEMO_DIR, 'sessions', `${s.id}.jsonl`);
    writeSessionJsonl(jsonlPath, s);
  }

  // ── 3. Enhanced data files ──────────────────────────────────
  // Write for ALL sessions so titles, status, and detail overlays look complete
  for (const s of DEMO_SESSIONS) {
    const enhanced = {
      title: s.title,
      developerTake: s.qaPairs?.[0]?.answer
        ?? generateDeveloperTake(s.title, s.skills ?? []),
      context: generateContext(s.title, s.skills ?? []),
      skills: s.skills ?? [],
      questions: [],
      executionSteps: s.executionPath?.length
        ? s.executionPath.map((step) => ({
            stepNumber: step.stepNumber,
            title: step.title,
            body: step.description,
          }))
        : generateExecutionSteps(s.title, s.durationMinutes, s.skills ?? []),
      qaPairs: s.qaPairs ?? [],
      enhancedAt: new Date().toISOString(),
      quickEnhanced: s.status !== 'enhanced',
      uploaded: false,
    };
    writeFileSync(
      join(DEMO_DIR, 'enhanced', `${s.id}.json`),
      JSON.stringify(enhanced, null, 2),
    );
  }

  // ── 4. Project enhance cache ────────────────────────────────
  const budgetwise = DEMO_PROJECTS.budgetwise;
  const selectedIds = DEMO_SESSIONS
    .filter((s) => s.projectName === budgetwise.dirName && s.status === 'enhanced')
    .map((s) => s.id);

  const fingerprint = createHash('sha256')
    .update(selectedIds.sort().join(','))
    .digest('hex')
    .slice(0, 16);

  const projectCache = {
    fingerprint,
    enhancedAt: new Date().toISOString(),
    selectedSessionIds: selectedIds,
    result: DEMO_ENHANCE_RESULT,
  };

  const safeName = budgetwise.dirName.replace(/[^a-zA-Z0-9_-]/g, '_');
  writeFileSync(
    join(DEMO_DIR, 'project-enhance', `${safeName}.json`),
    JSON.stringify(projectCache, null, 2),
  );

  // ── 5. Settings ─────────────────────────────────────────────
  const settings = {
    anthropicApiKey: 'sk-ant-demo-not-a-real-key',
    onboardingCompletedAt: new Date().toISOString(),
  };
  writeFileSync(
    join(DEMO_DIR, 'settings.json'),
    JSON.stringify(settings, null, 2),
  );

  db.close();
  return DEMO_DIR;
}

// ── Helpers ──────────────────────────────────────────────────────

function writeSessionJsonl(path: string, s: (typeof DEMO_SESSIONS)[number]): void {
  // Build from DEMO_TRANSCRIPT if this is the first session, otherwise generate minimal
  if (s.id === 'demo-a1b2-c3d4' && DEMO_TRANSCRIPT.messages.length > 0) {
    const lines: string[] = [];
    for (const msg of DEMO_TRANSCRIPT.messages) {
      const content = msg.blocks.map((b) => {
        if (b.type === 'text') return { type: 'text', text: b.text };
        if (b.type === 'thinking') return { type: 'thinking', thinking: b.text };
        if (b.type === 'tool_call') return {
          type: 'tool_use',
          name: b.toolName,
          id: b.toolCallId,
          input: { file_path: b.input },
        };
        return { type: 'text', text: '' };
      });

      lines.push(JSON.stringify({
        type: msg.role === 'user' ? 'user' : 'assistant',
        message: { role: msg.role === 'user' ? 'human' : 'assistant', content },
        timestamp: msg.timestamp,
      }));
    }
    writeFileSync(path, lines.join('\n') + '\n');
    return;
  }

  writeMinimalJsonl(path, s.title, s.date);
}

function writeMinimalJsonl(path: string, title: string, date: string): void {
  const lines = [
    JSON.stringify({
      type: 'user',
      message: { role: 'human', content: [{ type: 'text', text: title }] },
      timestamp: date,
    }),
    JSON.stringify({
      type: 'assistant',
      message: { role: 'assistant', content: [{ type: 'text', text: `Working on: ${title}` }] },
      timestamp: date,
    }),
  ];
  writeFileSync(path, lines.join('\n') + '\n');
}

// ── Content generators for sessions without explicit enhanced data ──

const DEVELOPER_TAKES: Record<string, string[]> = {
  default: [
    'The AI got the structure right on the first try but missed edge cases around empty states. Had to add null checks manually after the generated tests exposed them.',
    'Went back and forth on the abstraction level — started too generic, then pulled it back to something concrete. The final version is simpler than the first draft.',
    'This was more of a wiring task than a design task. The tricky part was making sure the error states propagated correctly through the async boundary.',
    'The hardest part was deciding what NOT to build. The AI kept suggesting features that would have made this a 3-day task instead of a 1-hour one.',
    'Spent the first 20 minutes debugging a test failure that turned out to be a stale import. Once that was fixed, the actual implementation went fast.',
    'Had to push back on the AI suggesting an ORM for what was really just two SQL queries. Sometimes a raw query is the right call.',
  ],
  TypeScript: [
    'The type narrowing was the main challenge — had to use discriminated unions to get the compiler to stop complaining about nullable fields in the response type.',
    'Started with `any` to get the shape right, then tightened the types once the API contract was stable. The final types caught two bugs the tests missed.',
  ],
  React: [
    'The state management was trickier than expected — lifting state up one more level fixed the stale closure issue in the event handler.',
    'Used useCallback aggressively to prevent re-renders in the list. The profiler showed a 3x improvement after memoization.',
  ],
  Rust: [
    'The borrow checker flagged a lifetime issue I would have missed entirely. Restructured to use owned types at the boundary and references internally.',
    'Went with an enum instead of trait objects for the command types — simpler, faster, and the match exhaustiveness check caught a missing case immediately.',
  ],
  PostgreSQL: [
    'The partial index on the status column was the key insight — full table scan dropped from 800ms to 12ms for the most common query pattern.',
  ],
};

function generateDeveloperTake(title: string, skills: string[]): string {
  // Try to find a skill-specific take first
  for (const skill of skills) {
    const takes = DEVELOPER_TAKES[skill];
    if (takes) {
      const idx = hashStr(title) % takes.length;
      return takes[idx];
    }
  }
  const takes = DEVELOPER_TAKES.default;
  return takes[hashStr(title) % takes.length];
}

function generateContext(title: string, skills: string[]): string {
  const skillStr = skills.slice(0, 3).join(', ');
  return `${title}. Working with ${skillStr || 'the codebase'}. This session focused on implementation and testing.`;
}

function generateExecutionSteps(
  title: string,
  durationMinutes: number,
  skills: string[],
): Array<{ stepNumber: number; title: string; body: string }> {
  // Generate 3-5 steps based on duration
  const stepCount = durationMinutes > 60 ? 5 : durationMinutes > 30 ? 4 : 3;
  const verb = title.split(' ')[0]; // e.g., "Add", "Fix", "Build", "Implement"

  const templates: Array<{ title: string; body: string }>[] = [
    // Template set 1: standard build flow
    [
      { title: 'Research and planning', body: `Reviewed existing code and identified the integration points. Checked how ${skills[0] || 'the framework'} handles this pattern.` },
      { title: 'Core implementation', body: `Built the main logic. ${verb === 'Fix' ? 'Isolated the root cause and applied the fix.' : 'Started with the data model and worked outward to the API layer.'}` },
      { title: 'Edge cases and validation', body: 'Added input validation, error handling, and boundary checks. The AI missed a few null cases that showed up in testing.' },
      { title: 'Testing', body: 'Wrote unit tests for the core logic and integration tests for the API endpoints. Found and fixed two regressions.' },
      { title: 'Cleanup and documentation', body: 'Removed dead code, added JSDoc comments to the public API, and updated the README with usage examples.' },
    ],
    // Template set 2: investigation flow
    [
      { title: 'Reproduce the issue', body: 'Set up a minimal reproduction case. The bug only appeared with concurrent requests, which is why CI never caught it.' },
      { title: 'Root cause analysis', body: `Traced through the ${skills[0] || 'code'} and found the issue — a race condition in the state update path.` },
      { title: 'Implement fix', body: 'Applied the fix with a mutex guard. Considered debouncing but that would have changed the API semantics.' },
      { title: 'Regression testing', body: 'Added a stress test that hammers the endpoint with 50 concurrent requests. Passes consistently now.' },
      { title: 'Monitor and verify', body: 'Deployed to staging and watched the metrics for 30 minutes. No more error spikes in the logs.' },
    ],
    // Template set 3: feature build
    [
      { title: 'API design', body: `Designed the endpoint contract. Went with REST over GraphQL since the data shape is simple and predictable.` },
      { title: 'Database schema', body: `Added the necessary tables and indexes. Used a ${skills.includes('PostgreSQL') ? 'partial index' : 'composite index'} for the most common query.` },
      { title: 'Business logic', body: 'Implemented the core algorithm. The AI suggested a more complex approach but the simpler version benchmarked faster.' },
      { title: 'Frontend integration', body: `Wired up the ${skills.includes('React') ? 'React components' : 'UI'} with optimistic updates and proper error states.` },
      { title: 'End-to-end testing', body: 'Wrote Playwright tests covering the happy path and the three most common error scenarios.' },
    ],
  ];

  const templateIdx = hashStr(title) % templates.length;
  const steps = templates[templateIdx].slice(0, stepCount);
  return steps.map((s, i) => ({ stepNumber: i + 1, ...s }));
}

function generateFileChanges(
  title: string,
  totalLoc: number,
  skills: string[],
): Array<{ path: string; additions: number; deletions: number }> {
  const h = hashStr(title);
  const isTs = skills.some((s) => ['TypeScript', 'React', 'Next.js'].includes(s));
  const isRust = skills.includes('Rust');
  const ext = isRust ? '.rs' : isTs ? '.ts' : '.ts';
  const testExt = isRust ? '.rs' : '.test' + ext;

  // Generate 4-8 files with realistic distribution
  const fileCount = 4 + (h % 5);
  const basePaths = isRust
    ? ['src/main', 'src/lib', 'src/config', 'src/cli', 'src/parser', 'src/hooks', 'src/utils', 'tests/integration']
    : ['src/components/', 'src/lib/', 'src/app/', 'src/api/', 'src/hooks/', 'src/utils/', 'src/types/', 'tests/'];

  const nameFragments = title.toLowerCase().replace(/[^a-z ]/g, '').split(' ').filter((w) => w.length > 3);
  const mainName = nameFragments[0] || 'module';

  const files: Array<{ path: string; additions: number; deletions: number }> = [];
  let remaining = totalLoc;

  for (let i = 0; i < fileCount && remaining > 0; i++) {
    const fraction = i === 0 ? 0.35 : i === 1 ? 0.25 : 1 / (fileCount - 1);
    const loc = Math.max(5, Math.round(remaining * fraction));
    const adds = loc;
    const dels = h % 3 === 0 ? Math.round(loc * 0.2) : 0;
    const base = basePaths[(h + i) % basePaths.length];
    const name = i === 0 ? mainName : i === fileCount - 1 ? `${mainName}${testExt}` : `${nameFragments[i % nameFragments.length] || 'helpers'}`;
    files.push({ path: `${base}${name}${i === fileCount - 1 ? '' : ext}`, additions: adds, deletions: dels });
    remaining -= loc;
  }

  return files.sort((a, b) => (b.additions + b.deletions) - (a.additions + a.deletions));
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
