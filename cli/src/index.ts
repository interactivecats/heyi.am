#!/usr/bin/env node

import { Command } from 'commander';
import { startServer } from './server.js';
import open from 'open';
import { getAnthropicApiKey } from './settings.js';
import { listSessions, parseSession, type SessionMeta } from './parsers/index.js';
import { bridgeToAnalyzer } from './bridge.js';
import { archiveSessionFiles } from './archive.js';
import { analyzeSession } from './analyzer.js';
import { openDatabase, getSessionRow, getContextSummary } from './db.js';
import { searchSessions, decodeProjectName } from './search.js';
import { exportSessionContext, type ExportTier } from './context-export.js';
import { SOURCE_DISPLAY_NAMES, type SessionSource } from './parsers/types.js';
import { syncSessionIndex, fullReindex } from './sync.js';
import { formatLoc } from './format-utils.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __pkg_dir = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(__pkg_dir, '..', 'package.json'), 'utf-8'));

const program = new Command();

program
  .name('heyiam')
  .description('Turn AI coding sessions into portfolio case studies')
  .version(pkg.version);

program
  .command('open')
  .description('Start the local server and open the browser')
  .option('-p, --port <number>', 'Port to run on', '17845')
  .option('--no-open', 'Start server without opening browser')
  .option('--demo', 'Start with fake data for screenshots and recordings')
  .action(async (opts) => {
    const port = parseInt(opts.port, 10);

    if (opts.demo) {
      const { seedDemoMode } = await import('./demo-seed.js');
      const demoDir = seedDemoMode();
      process.env.HEYIAM_CONFIG_DIR = demoDir;
      console.log('\n🎬 Demo mode — using fake data, no real sessions loaded.\n');
    }

    const apiKey = getAnthropicApiKey();
    if (!apiKey && !opts.demo) {
      console.log('\n⚠  No Anthropic API key found.');
      console.log('   AI enhancement requires an API key. Add one in Settings after the app opens.');
      console.log('   Or set ANTHROPIC_API_KEY in your environment.\n');
    }

    const server = await startServer(port, { demo: !!opts.demo });
    const url = `http://localhost:${port}`;
    console.log(`\nheyiam running at ${url}`);
    if (!apiKey && !opts.demo) {
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
    // Archive on every CLI command — don't lose sessions between opens
    const searchSessions2 = await listSessions();
    await archiveSessionFiles(searchSessions2);
    await syncSessionIndex(db, undefined, (p) => {
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
    // Archive on every CLI command
    const ctxSessions = await listSessions();
    await archiveSessionFiles(ctxSessions);
    await syncSessionIndex(db);

    const row = getSessionRow(db, sessionId);
    if (!row) {
      console.error(`\n  Session not found: ${sessionId}\n`);
      db.close();
      process.exit(1);
    }

    const tier: ExportTier = opts.compact ? 'compact' : opts.full ? 'full' : 'summary';

    let result!: { content: string; tokens: number; tier: ExportTier };

    // Try to load the source file; fall back to stored context summary if unavailable
    let sourceAvailable = false;
    if (row.file_path) {
      try {
        const parsed = await parseSession(row.file_path);
        const projectName = decodeProjectName(row.project_dir).split('/').pop() ?? row.project_dir;
        const analysis = bridgeToAnalyzer(parsed, { sessionId: row.id, projectName });
        const session = analyzeSession(analysis);
        result = exportSessionContext(session, analysis.turns, { tier });
        sourceAvailable = true;
      } catch {
        // Source file is gone or unreadable — fall through to stored summary
      }
    }

    if (!sourceAvailable) {
      const stored = getContextSummary(db, sessionId);
      if (stored) {
        // Stored summary is always compact tier — inform user if they requested a richer tier
        const { estimateTokens } = await import('./context-export.js');
        if (tier !== 'compact') {
          console.error(`\n  Source file unavailable — using stored compact summary (${tier} tier requires source data).\n`);
        }
        result = { content: stored, tokens: estimateTokens(stored), tier: 'compact' };
      } else {
        console.error(`\n  Session source file is unavailable and no stored summary exists.\n  Re-index while the source file exists to store a summary.\n`);
        db.close();
        process.exit(1);
      }
    }

    if (opts.clipboard) {
      try {
        const { default: clipboardy } = await import('clipboardy' as string) as { default: { write: (text: string) => Promise<void> } };
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

// ── Archive command (standalone) ─────────────────────────────

program
  .command('archive')
  .description('Discover and archive sessions from all sources')
  .action(async () => {
    console.log('\n  Discovering sessions...');
    const allSessions = await listSessions();

    // Count by source
    const bySource = new Map<string, number>();
    for (const s of allSessions) {
      bySource.set(s.source, (bySource.get(s.source) || 0) + 1);
    }

    const result = await archiveSessionFiles(allSessions);

    const total = result.archived + result.alreadyArchived;
    console.log(`  Archived ${result.archived} new (${total} total across ${bySource.size} sources)`);
    for (const [source, count] of bySource) {
      const name = SOURCE_DISPLAY_NAMES[source as SessionSource] ?? source;
      console.log(`    ${name.padEnd(15)} ${count} sessions`);
    }
    if (result.cursorExported > 0) {
      console.log(`  Exported ${result.cursorExported} Cursor sessions as JSONL`);
    }
    if (result.failed > 0) {
      console.log(`  ${result.failed} failed`);
    }
    console.log('');
  });

// ── Sync command (standalone) ───────────────────────────────

program
  .command('sync')
  .description('Index sessions into SQLite search database')
  .action(async () => {
    const db = openDatabase();
    console.log('\n  Syncing index...');

    // Also archive while we're at it
    const allSessions = await listSessions();
    await archiveSessionFiles(allSessions);

    const result = await syncSessionIndex(db, undefined, (p) => {
      if (p.phase === 'indexing' && p.current && p.total) {
        if (p.current % 50 === 0 || p.current === p.total) {
          process.stdout.write(`\r  Indexing: ${p.current}/${p.total}`);
        }
      }
    });

    const { countPreservedSessions } = await import('./db.js');
    const preserved = countPreservedSessions(db);

    console.log('');
    console.log(`  Indexed ${result.indexed} sessions (${result.indexed + result.skipped} total, ${preserved} preserved)`);
    console.log('');
    db.close();
  });

// ── Status command ──────────────────────────────────────────

program
  .command('status')
  .description('Show archive health, session counts, and daemon status')
  .action(async () => {
    const db = openDatabase();
    await syncSessionIndex(db);

    const { getSessionCount, countPreservedSessions } = await import('./db.js');
    const { getAllProjectStats } = await import('./db.js');

    const totalSessions = getSessionCount(db);
    const preserved = countPreservedSessions(db);
    const projects = getAllProjectStats(db);

    // Source breakdown
    const bySource = new Map<string, number>();
    const rows = db.prepare('SELECT source, COUNT(*) as c FROM sessions GROUP BY source').all() as Array<{ source: string; c: number }>;
    for (const row of rows) bySource.set(row.source, row.c);

    // Daemon status
    const { existsSync, readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { homedir } = await import('node:os');
    const pidFile = join(homedir(), '.config', 'heyiam', 'daemon', 'daemon.pid');
    let daemonRunning = false;
    if (existsSync(pidFile)) {
      const pid = parseInt(readFileSync(pidFile, 'utf-8').trim(), 10);
      try { process.kill(pid, 0); daemonRunning = true; } catch { /* not running */ }
    }

    // Status file
    const statusFile = join(homedir(), '.config', 'heyiam', 'daemon', 'status.json');
    let lastSync = 'never';
    if (existsSync(statusFile)) {
      try {
        const status = JSON.parse(readFileSync(statusFile, 'utf-8'));
        if (status.lastSync) {
          const ago = Math.round((Date.now() - new Date(status.lastSync).getTime()) / 60000);
          lastSync = ago < 1 ? 'just now' : `${ago}m ago`;
        }
      } catch { /* ignore */ }
    }

    console.log('');
    console.log('  heyi.am status');
    console.log('  ' + '─'.repeat(50));
    console.log(`  Sessions:    ${totalSessions} indexed`);
    console.log(`  Preserved:   ${preserved} (source file deleted, DB has content)`);
    console.log(`  Projects:    ${projects.length}`);
    console.log('');
    console.log('  Sources:');
    for (const [source, count] of bySource) {
      const name = SOURCE_DISPLAY_NAMES[source as SessionSource] ?? source;
      console.log(`    ${name.padEnd(15)} ${count} sessions`);
    }
    console.log('');
    console.log(`  Daemon:      ${daemonRunning ? '● running' : '○ stopped'}`);
    console.log(`  Last sync:   ${lastSync}`);
    console.log('');

    db.close();
  });

// ── Daemon management ───────────────────────────────────────

const daemon = program
  .command('daemon')
  .description('Manage the background archiving daemon');

daemon
  .command('start')
  .description('Start the background tray daemon')
  .action(async () => {
    const { existsSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { homedir } = await import('node:os');
    const { spawn } = await import('node:child_process');
    const { writeFileSync, mkdirSync } = await import('node:fs');

    const daemonDir = join(homedir(), '.config', 'heyiam', 'daemon');
    const binaryPath = join(daemonDir, 'heyiam-tray');
    const pidFile = join(daemonDir, 'daemon.pid');

    if (!existsSync(binaryPath)) {
      console.log('\n  Daemon not installed. Run: heyiam daemon install\n');
      return;
    }

    // Check if already running
    if (existsSync(pidFile)) {
      const pid = parseInt(await import('node:fs').then(fs => fs.readFileSync(pidFile, 'utf-8').trim()), 10);
      try { process.kill(pid, 0); console.log('\n  Daemon is already running.\n'); return; } catch { /* stale pid */ }
    }

    const child = spawn(binaryPath, [], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();

    mkdirSync(daemonDir, { recursive: true });
    writeFileSync(pidFile, String(child.pid));
    console.log(`\n  Daemon started (PID ${child.pid})\n`);
  });

daemon
  .command('stop')
  .description('Stop the background tray daemon')
  .action(async () => {
    const { existsSync, readFileSync, unlinkSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { homedir } = await import('node:os');

    const pidFile = join(homedir(), '.config', 'heyiam', 'daemon', 'daemon.pid');

    if (!existsSync(pidFile)) {
      console.log('\n  Daemon is not running.\n');
      return;
    }

    const pid = parseInt(readFileSync(pidFile, 'utf-8').trim(), 10);
    try {
      process.kill(pid, 'SIGTERM');
      unlinkSync(pidFile);
      console.log('\n  Daemon stopped.\n');
    } catch {
      unlinkSync(pidFile);
      console.log('\n  Daemon was not running (stale PID file removed).\n');
    }
  });

daemon
  .command('status')
  .description('Show daemon status')
  .action(async () => {
    const { existsSync, readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { homedir } = await import('node:os');

    const daemonDir = join(homedir(), '.config', 'heyiam', 'daemon');
    const pidFile = join(daemonDir, 'daemon.pid');
    const statusFile = join(daemonDir, 'status.json');
    const binaryPath = join(daemonDir, 'heyiam-tray');

    const installed = existsSync(binaryPath);
    let running = false;
    let pid: number | null = null;

    if (existsSync(pidFile)) {
      pid = parseInt(readFileSync(pidFile, 'utf-8').trim(), 10);
      try { process.kill(pid, 0); running = true; } catch { /* not running */ }
    }

    console.log('');
    console.log(`  Installed:  ${installed ? 'yes' : 'no'}`);
    console.log(`  Running:    ${running ? `yes (PID ${pid})` : 'no'}`);

    if (existsSync(statusFile)) {
      try {
        const status = JSON.parse(readFileSync(statusFile, 'utf-8'));
        if (status.lastSync) {
          const ago = Math.round((Date.now() - new Date(status.lastSync).getTime()) / 60000);
          console.log(`  Last sync:  ${ago < 1 ? 'just now' : `${ago}m ago`}`);
        }
        if (status.sessionCount) console.log(`  Sessions:   ${status.sessionCount}`);
        if (status.warnings?.length > 0) {
          console.log(`  Warnings:   ${status.warnings.join(', ')}`);
        }
      } catch { /* ignore */ }
    }
    console.log('');
  });

daemon
  .command('install')
  .description('Download and install the background tray daemon')
  .option('--force', 'Reinstall even if already installed')
  .action(async (opts) => {
    const { installDaemon, getDaemonBinaryPath } = await import('./daemon-install.js');
    const { existsSync } = await import('node:fs');

    const binaryPath = getDaemonBinaryPath();
    if (existsSync(binaryPath) && !opts.force) {
      console.log('\n  Daemon is already installed.');
      console.log('  To reinstall, run: heyiam daemon install --force\n');
      return;
    }

    try {
      const result = await installDaemon((msg) => console.log(msg));
      console.log(`\n  Daemon installed (${result.version})`);
      console.log(`  Binary: ${result.binaryPath}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`\n  Failed to install daemon: ${message}\n`);
      process.exit(1);
    }

    // Auto-start registration prompt
    const { askYesNo, registerAutostart } = await import('./autostart.js');
    const wantAutostart = await askYesNo('  Start daemon automatically on login? (y/n) ');

    if (wantAutostart) {
      const result = registerAutostart();
      if (result.registered) {
        console.log(`\n  Auto-start registered via ${result.method}.`);
        console.log('  The daemon will start automatically on your next login.\n');
      } else {
        console.log('\n  Auto-start is not supported on this platform yet.');
        console.log('  You can start the daemon manually with: heyiam daemon start\n');
      }
    } else {
      console.log('\n  Skipped auto-start. You can start manually with: heyiam daemon start\n');
    }
  });

daemon
  .command('uninstall')
  .description('Remove the background tray daemon')
  .action(async () => {
    const { existsSync, unlinkSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { homedir } = await import('node:os');

    // Stop first
    const pidFile = join(homedir(), '.config', 'heyiam', 'daemon', 'daemon.pid');
    if (existsSync(pidFile)) {
      const pid = parseInt((await import('node:fs')).readFileSync(pidFile, 'utf-8').trim(), 10);
      try { process.kill(pid, 'SIGTERM'); } catch { /* already dead */ }
      unlinkSync(pidFile);
    }

    // Remove binary
    const binaryPath = join(homedir(), '.config', 'heyiam', 'daemon', 'heyiam-tray');
    if (existsSync(binaryPath)) unlinkSync(binaryPath);

    // Remove auto-start registration (macOS launchd, Linux XDG)
    const { unregisterAutostart } = await import('./autostart.js');
    const autostart = unregisterAutostart();
    if (autostart.removed) {
      console.log('  Auto-start registration removed.');
    }

    console.log('\n  Daemon uninstalled.\n');
  });

// ── Helpers ──────────────────────────────────────────────────

function formatDateShort(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

export { program };

// Only run if this is the entry point (not imported for testing)
import { realpathSync } from 'node:fs';

const resolvedArgv = process.argv[1] ? realpathSync(process.argv[1]) : '';
const isDirectRun = resolvedArgv.endsWith('/dist/index.js') ||
  resolvedArgv.endsWith('/src/index.ts');

if (isDirectRun) {
  const args = process.argv.slice(2);
  const knownCommands = ['open', 'time', 'search', 'context', 'reindex', 'archive', 'sync', 'status', 'daemon'];
  if (args.length === 0 || !knownCommands.includes(args[0])) {
    process.argv.splice(2, 0, 'open');
  }
  program.parseAsync(process.argv).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
