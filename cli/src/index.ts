#!/usr/bin/env node

import { Command } from 'commander';
import { startServer } from './server.js';
import open from 'open';
import { getAnthropicApiKey } from './settings.js';
import { listSessions, parseSession, type SessionMeta } from './parsers/index.js';
import { bridgeToAnalyzer } from './bridge.js';
import { archiveSessionFiles } from './archive.js';
import { analyzeSession } from './analyzer.js';
import { openDatabase, getSessionRow } from './db.js';
import { searchSessions, decodeProjectName } from './search.js';
import { exportSessionContext, type ExportTier } from './context-export.js';
import { SOURCE_DISPLAY_NAMES, type SessionSource } from './parsers/types.js';
import { quickSync, fullReindex } from './sync.js';

const program = new Command();

program
  .name('heyiam')
  .description('Turn AI coding sessions into portfolio case studies')
  .version('0.1.7');

program
  .command('open')
  .description('Start the local server and open the browser')
  .option('-p, --port <number>', 'Port to run on', '17845')
  .option('--no-open', 'Start server without opening browser')
  .action(async (opts) => {
    const port = parseInt(opts.port, 10);

    const apiKey = getAnthropicApiKey();
    if (!apiKey) {
      console.log('\n⚠  No Anthropic API key found.');
      console.log('   AI enhancement requires an API key. Add one in Settings after the app opens.');
      console.log('   Or set ANTHROPIC_API_KEY in your environment.\n');
    }

    const server = await startServer(port);
    const url = `http://localhost:${port}`;
    console.log(`\nheyiam running at ${url}`);
    if (!apiKey) {
      console.log(`Open ${url}/settings to add your Anthropic API key`);
    }
    console.log('Press Ctrl+C to stop\n');

    if (opts.open) {
      open(url).catch(() => {});
    }

    const shutdown = () => {
      console.log('\nShutting down...');
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 3000);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    setInterval(() => {}, 60_000);
  });

program
  .command('time')
  .description('Show your time vs agent time per project')
  .action(async () => {
    const allSessions = await listSessions();
    await archiveSessionFiles(allSessions);

    const byDir = new Map<string, SessionMeta[]>();
    for (const s of allSessions) {
      const existing = byDir.get(s.projectDir) ?? [];
      existing.push(s);
      byDir.set(s.projectDir, existing);
    }

    const displayName = (dir: string) => {
      const devIdx = dir.indexOf('-Dev-');
      if (devIdx !== -1) return dir.slice(devIdx + 5);
      const parts = dir.replace(/^-/, '').split('-');
      return parts.slice(-2).join('-') || dir;
    };

    type ProjectTime = { name: string; yourMinutes: number; agentMinutes: number; sessions: number };
    const projects: ProjectTime[] = [];

    for (const [dirName, sessions] of byDir) {
      let yourMinutes = 0;
      let agentMinutes = 0;
      const parents = sessions.filter(s => !s.isSubagent);

      for (const meta of parents) {
        try {
          const parsed = await parseSession(meta.path);
          const analysis = bridgeToAnalyzer(parsed, { sessionId: meta.sessionId, projectName: displayName(dirName) });
          const session = analyzeSession(analysis);
          const dur = session.durationMinutes ?? 0;
          yourMinutes += dur;
          agentMinutes += dur;
        } catch {
          // Skip sessions that fail to parse
        }

        for (const child of meta.children ?? []) {
          try {
            const parsed = await parseSession(child.path);
            const analysis = bridgeToAnalyzer(parsed, { sessionId: child.sessionId, projectName: displayName(dirName) });
            const session = analyzeSession(analysis);
            agentMinutes += session.durationMinutes ?? 0;
          } catch {
            // Skip
          }
        }
      }

      if (yourMinutes > 0) {
        projects.push({ name: displayName(dirName), yourMinutes, agentMinutes, sessions: parents.length });
      }
    }

    projects.sort((a, b) => b.agentMinutes - a.agentMinutes);

    const fmtTime = (mins: number) => {
      if (mins >= 60) {
        const h = mins / 60;
        return h >= 10 ? `${Math.round(h)}h` : `${h.toFixed(1)}h`;
      }
      return `${Math.round(mins)}m`;
    };

    const totalYou = projects.reduce((s, p) => s + p.yourMinutes, 0);
    const totalAgent = projects.reduce((s, p) => s + p.agentMinutes, 0);

    console.log('');
    console.log('  PROJECT                          YOU / AGENTS    SESSIONS');
    console.log('  ' + '─'.repeat(60));

    for (const p of projects) {
      const name = p.name.length > 30 ? p.name.slice(0, 27) + '...' : p.name;
      const time = `${fmtTime(p.yourMinutes)} / ${fmtTime(p.agentMinutes)}`;
      console.log(`  ${name.padEnd(33)} ${time.padEnd(15)} ${p.sessions}`);
    }

    console.log('  ' + '─'.repeat(60));
    console.log(`  ${'TOTAL'.padEnd(33)} ${(fmtTime(totalYou) + ' / ' + fmtTime(totalAgent)).padEnd(15)} ${projects.reduce((s, p) => s + p.sessions, 0)}`);
    console.log('');
    console.log('  Detailed view: heyiam open, then visit /time');
    console.log('');
  });

// ── Search command ────────────────────────────────────────────

program
  .command('search [query]')
  .description('Search across all AI sessions')
  .option('--project <name>', 'Filter by project name')
  .option('--source <source>', 'Filter by source (claude, cursor, codex, gemini)')
  .option('--after <date>', 'Sessions after this date (ISO)')
  .option('--before <date>', 'Sessions before this date (ISO)')
  .option('--skill <skill>', 'Filter by skill name')
  .option('--file <path>', 'Filter by file path')
  .option('--min-duration <minutes>', 'Minimum session duration in minutes', parseInt)
  .action(async (query: string | undefined, opts) => {
    const db = openDatabase();
    await quickSync(db, undefined, (p) => {
      if (p.phase === 'indexing' && p.current === 1 && (p.total ?? 0) > 0) {
        console.log(`  Syncing index (${p.total} sessions)...`);
      }
    });

    const filters = {
      project: opts.project,
      source: opts.source,
      after: opts.after,
      before: opts.before,
      skill: opts.skill,
      file: opts.file,
      minDuration: opts.minDuration,
    };

    // Remove undefined values
    for (const key of Object.keys(filters) as Array<keyof typeof filters>) {
      if (filters[key] === undefined) delete filters[key];
    }

    const results = searchSessions(db, query, Object.keys(filters).length > 0 ? filters : undefined);

    if (results.length === 0) {
      console.log('\n  No results found.\n');
      db.close();
      return;
    }

    console.log('');
    for (const r of results) {
      const sourceName = SOURCE_DISPLAY_NAMES[r.source as SessionSource] ?? r.source;
      const date = formatDateShort(r.date);
      const dur = r.durationMinutes > 0 ? `${r.durationMinutes}m` : '';
      const loc = r.linesOfCode > 0 ? formatLoc(r.linesOfCode) + ' LOC' : '';

      const projectName = r.projectName.split('/').pop() ?? r.projectName;
      console.log(`  ${projectName} / ${r.title || 'Untitled'}`);
      console.log(`  ${sourceName} · ${date}${dur ? ' · ' + dur : ''}${r.turns ? ' · ' + r.turns + ' turns' : ''}${loc ? ' · ' + loc : ''}`);
      if (r.snippet) {
        const clean = r.snippet.replace(/<\/?mark>/g, '').replace(/\.\.\./g, '\u2026').trim();
        if (clean) console.log(`  ${clean}`);
      }
      console.log('');
    }
    console.log(`${results.length} result${results.length === 1 ? '' : 's'} found\n`);

    db.close();
  });

// ── Context command ──────────────────────────────────────────

program
  .command('context <sessionId>')
  .description('Export a session as compressed context for AI consumption')
  .option('--full', 'Include all turns (large output)')
  .option('--compact', 'Metadata + execution path only (smallest)')
  .option('--clipboard', 'Copy to clipboard instead of stdout')
  .action(async (sessionId: string, opts) => {
    const db = openDatabase();
    await quickSync(db);

    const row = getSessionRow(db, sessionId);
    if (!row) {
      console.error(`\n  Session not found: ${sessionId}\n`);
      db.close();
      process.exit(1);
    }

    if (!row.file_path) {
      console.error(`\n  Session has no source file path.\n`);
      db.close();
      process.exit(1);
    }

    const parsed = await parseSession(row.file_path);
    const projectName = decodeProjectName(row.project_dir).split('/').pop() ?? row.project_dir;
    const analysis = bridgeToAnalyzer(parsed, { sessionId: row.id, projectName });
    const session = analyzeSession(analysis);

    const tier: ExportTier = opts.compact ? 'compact' : opts.full ? 'full' : 'summary';
    const result = exportSessionContext(session, analysis.turns, { tier });

    if (opts.clipboard) {
      try {
        const { default: clipboardy } = await import('clipboardy');
        await clipboardy.write(result.content);
        console.log(`\n  Session context copied (${result.tokens.toLocaleString()} tokens, ${result.tier} format)\n`);
      } catch {
        // Fallback: try pbcopy on macOS using spawn (no shell injection)
        try {
          const { spawn } = await import('node:child_process');
          await new Promise<void>((resolve, reject) => {
            const proc = spawn('pbcopy', [], { stdio: ['pipe', 'ignore', 'ignore'] });
            proc.stdin.write(result.content);
            proc.stdin.end();
            proc.on('close', (code) => code === 0 ? resolve() : reject(new Error('pbcopy failed')));
            proc.on('error', reject);
          });
          console.log(`\n  Session context copied (${result.tokens.toLocaleString()} tokens, ${result.tier} format)\n`);
        } catch {
          console.error('\n  Could not copy to clipboard. Install clipboardy or use stdout.\n');
          process.stdout.write(result.content);
        }
      }
    } else {
      process.stdout.write(result.content + '\n');
    }

    db.close();
  });

// ── Reindex command ──────────────────────────────────────────

program
  .command('reindex')
  .description('Rebuild the SQLite search index from scratch')
  .action(async () => {
    const db = openDatabase();
    console.log('\n  Clearing existing index...');

    const result = await fullReindex(db, undefined, (p) => {
      if (p.phase === 'indexing' && p.current && p.total) {
        if (p.current === 1) console.log(`  Indexing ${p.total} sessions...`);
        if (p.current % 50 === 0 || p.current === p.total) {
          const pct = Math.round((p.current / p.total) * 100);
          process.stdout.write(`\r  Progress: ${p.current}/${p.total} (${pct}%)`);
        }
      }
    });

    console.log('');
    console.log(`  Done. ${result.indexed} sessions indexed${result.errors > 0 ? `, ${result.errors} errors` : ''}.\n`);
    db.close();
  });

// ── Helpers ──────────────────────────────────────────────────

function formatDateShort(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

function formatLoc(loc: number): string {
  if (loc >= 1000) return `${(loc / 1000).toFixed(1)}k`;
  return String(loc);
}

export { program };

// Only run if this is the entry point (not imported for testing)
import { realpathSync } from 'node:fs';

const resolvedArgv = process.argv[1] ? realpathSync(process.argv[1]) : '';
const isDirectRun = resolvedArgv.endsWith('/dist/index.js') ||
  resolvedArgv.endsWith('/src/index.ts');

if (isDirectRun) {
  const args = process.argv.slice(2);
  const knownCommands = ['open', 'time', 'search', 'context', 'reindex'];
  if (args.length === 0 || !knownCommands.includes(args[0])) {
    process.argv.splice(2, 0, 'open');
  }
  program.parseAsync(process.argv).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
