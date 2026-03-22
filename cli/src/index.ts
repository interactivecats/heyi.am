#!/usr/bin/env node

import { Command } from 'commander';
import { startServer } from './server.js';
import open from 'open';
import { checkAuthStatus, deviceAuthFlow, getAuthToken, deleteAuthToken, buildPublishPayload } from './auth.js';
import { loadOrCreateKeyPair, signPayload, getFingerprint } from './machine-key.js';
import { getAnthropicApiKey } from './settings.js';

const program = new Command();

program
  .name('heyiam')
  .description('Turn AI coding sessions into portfolio case studies')
  .version('0.1.2');

program
  .command('open')
  .description('Start the local server and open the browser')
  .option('-p, --port <number>', 'Port to run on', '17845')
  .option('--no-open', 'Start server without opening browser')
  .action(async (opts) => {
    const port = parseInt(opts.port, 10);

    // Check for API key before starting
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
      open(url).catch(() => {}); // fire-and-forget, don't crash if browser fails
    }

    // Keep the process alive until Ctrl+C
    const shutdown = () => {
      console.log('\nShutting down...');
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 3000);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    // Keep event loop alive explicitly
    const keepAlive = setInterval(() => {}, 60_000);
    keepAlive.unref = undefined as unknown as typeof keepAlive.unref; // prevent unref
  });

import { API_URL } from './config.js';
const API_BASE = API_URL;

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
  .command('logout')
  .description('Remove saved authentication credentials')
  .action(() => {
    deleteAuthToken();
    console.log('Logged out. Run `heyiam login` to re-authenticate.');
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

export { program };

// Only run if this is the entry point (not imported for testing).
import { realpathSync } from 'node:fs';

const resolvedArgv = process.argv[1] ? realpathSync(process.argv[1]) : '';
const isDirectRun = resolvedArgv.endsWith('/dist/index.js') ||
  resolvedArgv.endsWith('/src/index.ts');

if (isDirectRun) {
  // If no command given (just `heyiam`), default to `open`
  const args = process.argv.slice(2);
  const knownCommands = ['open', 'login', 'logout', 'publish'];
  if (args.length === 0 || !knownCommands.includes(args[0])) {
    process.argv.splice(2, 0, 'open');
  }
  program.parseAsync(process.argv).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
