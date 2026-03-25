#!/usr/bin/env node

import { Command } from 'commander';
import { startServer } from './server.js';
import open from 'open';
import { getAnthropicApiKey } from './settings.js';
import { listSessions, parseSession, type SessionMeta } from './parsers/index.js';
import { bridgeToAnalyzer } from './bridge.js';
import { archiveSessionFiles } from './archive.js';
import { analyzeSession } from './analyzer.js';

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

export { program };

// Only run if this is the entry point (not imported for testing)
import { realpathSync } from 'node:fs';

const resolvedArgv = process.argv[1] ? realpathSync(process.argv[1]) : '';
const isDirectRun = resolvedArgv.endsWith('/dist/index.js') ||
  resolvedArgv.endsWith('/src/index.ts');

if (isDirectRun) {
  const args = process.argv.slice(2);
  const knownCommands = ['open', 'time'];
  if (args.length === 0 || !knownCommands.includes(args[0])) {
    process.argv.splice(2, 0, 'open');
  }
  program.parseAsync(process.argv).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
