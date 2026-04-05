import { describe, it, expect } from 'vitest';
import { program } from './index.js';

describe('CLI commands', () => {
  it('registers the open command', () => {
    const openCmd = program.commands.find((c) => c.name() === 'open');
    expect(openCmd).toBeDefined();
    expect(openCmd!.description()).toBe('Start the local server and open the browser');
  });

  it('registers the time command', () => {
    const cmd = program.commands.find((c) => c.name() === 'time');
    expect(cmd).toBeDefined();
    expect(cmd!.description()).toBe('Show your time vs agent time per project');
  });

  it('registers the search command', () => {
    const cmd = program.commands.find((c) => c.name() === 'search');
    expect(cmd).toBeDefined();
    expect(cmd!.description()).toBe('Search across all AI sessions');
  });

  it('has correct program name and version', () => {
    expect(program.name()).toBe('heyiam');
    expect(program.version()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('open command accepts --port option', () => {
    const openCmd = program.commands.find((c) => c.name() === 'open');
    const portOpt = openCmd!.options.find((o) => o.long === '--port');
    expect(portOpt).toBeDefined();
    expect(portOpt!.defaultValue).toBe('17845');
  });

  it('open command accepts --no-open option', () => {
    const openCmd = program.commands.find((c) => c.name() === 'open');
    const noOpenOpt = openCmd!.options.find((o) => o.long === '--no-open');
    expect(noOpenOpt).toBeDefined();
  });

  it('registers the archive command', () => {
    const cmd = program.commands.find((c) => c.name() === 'archive');
    expect(cmd).toBeDefined();
    expect(cmd!.description()).toBe('Discover and archive sessions from all sources');
  });

  it('registers the sync command', () => {
    const cmd = program.commands.find((c) => c.name() === 'sync');
    expect(cmd).toBeDefined();
    expect(cmd!.description()).toBe('Index sessions into SQLite search database');
  });

  it('registers the status command', () => {
    const cmd = program.commands.find((c) => c.name() === 'status');
    expect(cmd).toBeDefined();
    expect(cmd!.description()).toBe('Show archive health, session counts, and daemon status');
  });

  it('registers the embed command with options', () => {
    const cmd = program.commands.find((c) => c.name() === 'embed');
    expect(cmd).toBeDefined();
    expect(cmd!.description()).toBe('Generate embeddable widget snippets for your portfolio and projects');
    const projectOpt = cmd!.options.find((o) => o.long === '--project');
    expect(projectOpt).toBeDefined();
    const sectionsOpt = cmd!.options.find((o) => o.long === '--sections');
    expect(sectionsOpt).toBeDefined();
    expect(sectionsOpt!.defaultValue).toBe('stats');
    const themeOpt = cmd!.options.find((o) => o.long === '--theme');
    expect(themeOpt).toBeDefined();
    expect(themeOpt!.defaultValue).toBe('dark');
  });

  it('registers the daemon command with subcommands', () => {
    const cmd = program.commands.find((c) => c.name() === 'daemon');
    expect(cmd).toBeDefined();
    expect(cmd!.description()).toBe('Manage the background archiving daemon');

    // Verify daemon subcommands
    const subcommands = cmd!.commands.map((c) => c.name());
    expect(subcommands).toContain('start');
    expect(subcommands).toContain('stop');
    expect(subcommands).toContain('status');
    expect(subcommands).toContain('install');
    expect(subcommands).toContain('uninstall');
  });
});
