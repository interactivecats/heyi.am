import { describe, it, expect } from 'vitest';
import { program } from './index.js';

describe('CLI commands', () => {
  it('registers the open command', () => {
    const openCmd = program.commands.find((c) => c.name() === 'open');
    expect(openCmd).toBeDefined();
    expect(openCmd!.description()).toBe('Start the local server and open the browser');
  });

  it('registers the login command', () => {
    const loginCmd = program.commands.find((c) => c.name() === 'login');
    expect(loginCmd).toBeDefined();
    expect(loginCmd!.description()).toBe('Authenticate with heyi.am');
  });

  it('registers the publish command', () => {
    const publishCmd = program.commands.find((c) => c.name() === 'publish');
    expect(publishCmd).toBeDefined();
    expect(publishCmd!.description()).toBe('Publish a session to heyi.am');
  });

  it('has correct program name and version', () => {
    expect(program.name()).toBe('heyiam');
    expect(program.version()).toBe('0.1.0');
  });

  it('open command accepts --port option', () => {
    const openCmd = program.commands.find((c) => c.name() === 'open');
    const portOpt = openCmd!.options.find((o) => o.long === '--port');
    expect(portOpt).toBeDefined();
    expect(portOpt!.defaultValue).toBe('3457');
  });

  it('open command accepts --no-open option', () => {
    const openCmd = program.commands.find((c) => c.name() === 'open');
    const noOpenOpt = openCmd!.options.find((o) => o.long === '--no-open');
    expect(noOpenOpt).toBeDefined();
  });
});
