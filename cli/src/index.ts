#!/usr/bin/env node

import { Command } from 'commander';
import { startServer } from './server.js';
import open from 'open';

const program = new Command();

program
  .name('heyiam')
  .description('Turn AI coding sessions into portfolio case studies')
  .version('0.1.0');

program
  .command('open')
  .description('Start the local server and open the browser')
  .option('-p, --port <number>', 'Port to run on', '3457')
  .option('--no-open', 'Start server without opening browser')
  .action(async (opts) => {
    const port = parseInt(opts.port, 10);
    await startServer(port);
    console.log(`heyiam server running at http://localhost:${port}`);
    if (opts.open) {
      await open(`http://localhost:${port}`);
    }
  });

program
  .command('login')
  .description('Authenticate with heyi.am')
  .action(() => {
    console.log('Device auth coming soon');
  });

program
  .command('publish')
  .description('Publish a session to heyi.am')
  .action(() => {
    console.log('Publish coming soon');
  });

// Default to 'open' when no command is given
program.action(async () => {
  await program.parseAsync(['', '', 'open']);
});

export { program };

// Only run if this is the entry point (not imported for testing)
const isDirectRun = process.argv[1] && (
  process.argv[1].endsWith('/dist/index.js') ||
  process.argv[1].endsWith('/src/index.ts')
);

if (isDirectRun) {
  program.parseAsync(process.argv);
}
