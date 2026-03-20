#!/usr/bin/env node

import { Command } from 'commander';
import { startServer } from './server.js';
import open from 'open';
import { checkAuthStatus, deviceAuthFlow, getAuthToken, buildPublishPayload } from './auth.js';
import { loadOrCreateKeyPair, signPayload, getFingerprint } from './machine-key.js';

const program = new Command();

program
  .name('heyiam')
  .description('Turn AI coding sessions into portfolio case studies')
  .version('0.1.0');

program
  .command('open')
  .description('Start the local server and open the browser')
  .option('-p, --port <number>', 'Port to run on', '17845')
  .option('--no-open', 'Start server without opening browser')
  .action(async (opts) => {
    const port = parseInt(opts.port, 10);
    await startServer(port);
    console.log(`heyiam server running at http://localhost:${port}`);
    if (opts.open) {
      await open(`http://localhost:${port}`);
    }
  });

const API_BASE = process.env.HEYIAM_API_URL ?? 'https://heyi.am';

program
  .command('login')
  .description('Authenticate with heyi.am')
  .option('--api-url <url>', 'API base URL', API_BASE)
  .action(async (opts) => {
    const status = await checkAuthStatus(opts.apiUrl);
    if (status.authenticated) {
      console.log(`Already logged in as ${status.username}`);
      return;
    }

    console.log('Starting device authorization...');
    try {
      const auth = await deviceAuthFlow(opts.apiUrl, undefined, {
        openBrowser: (url) => open(url).then(() => {}),
        onUserCode: (code, uri) => {
          console.log(`\nOpen ${uri} and enter code: ${code}\n`);
        },
      });
      console.log(`Logged in as ${auth.username}`);
    } catch (err) {
      console.error(`Login failed: ${(err as Error).message}`);
      process.exitCode = 1;
    }
  });

program
  .command('publish')
  .description('Publish a session to heyi.am')
  .option('--api-url <url>', 'API base URL', API_BASE)
  .action(async (opts) => {
    const auth = getAuthToken();
    if (!auth) {
      console.error('Not logged in. Run `heyiam login` first.');
      process.exitCode = 1;
      return;
    }

    const keyPair = loadOrCreateKeyPair();
    const fingerprint = getFingerprint(keyPair.publicKey);
    console.log(`Using machine key: ${fingerprint}`);

    // TODO: session data will come from the parser pipeline once Task 8.3+ are complete
    const sessionData = { placeholder: true };
    const payloadStr = JSON.stringify(sessionData);
    const signature = signPayload(payloadStr, keyPair.privateKey);
    const body = buildPublishPayload(sessionData, signature, keyPair.publicKey);

    try {
      const res = await fetch(`${opts.apiUrl}/api/shares`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${auth.token}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.text();
        console.error(`Publish failed (${res.status}): ${err}`);
        process.exitCode = 1;
        return;
      }

      const result = (await res.json()) as { url?: string };
      console.log(`Published! ${result.url ?? ''}`);
    } catch (err) {
      console.error(`Publish failed: ${(err as Error).message}`);
      process.exitCode = 1;
    }
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
