import { describe, it, expect } from 'vitest';
import {
  scanTextSync,
  redactText,
  stripHomePath,
  stripHomePathsInText,
  redactSession,
  formatFindings,
  deduplicateFindings,
  type Finding,
} from './redact.js';

// ── Secret detection ───────────────────────────────────────────

describe('scanTextSync — secrets', () => {
  it('detects AWS access key IDs', () => {
    const findings = scanTextSync('key is AKIAZ7TCBMQAWD5NPXRU');
    expect(findings).toHaveLength(1);
    expect(findings[0].pattern).toBe('AWS Access Key');
    expect(findings[0].severity).toBe('high');
  });

  it('detects all AWS key prefixes', () => {
    for (const prefix of ['AKIA', 'AGPA', 'AIDA', 'AROA', 'AIPA', 'ANPA', 'ANVA', 'ASIA']) {
      const key = prefix + 'XXXXXXXXXXXXXXXX';
      const findings = scanTextSync(key);
      expect(findings.length).toBeGreaterThanOrEqual(1);
      expect(findings.some(f => f.pattern === 'AWS Access Key')).toBe(true);
    }
  });

  it('detects GitHub personal access tokens', () => {
    const findings = scanTextSync('ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij12');
    expect(findings.some(f => f.pattern === 'GitHub Token')).toBe(true);
  });

  it('detects GitHub fine-grained PATs', () => {
    const findings = scanTextSync('github_pat_11ABCDEFG0123456789_abcdefghijklmnopqrstuvwxyz0123456789ABCDEF');
    expect(findings.some(f => f.pattern === 'GitHub Token')).toBe(true);
  });

  it('detects Anthropic API keys', () => {
    const findings = scanTextSync('sk-ant-api03-abc123def456ghi789jkl');
    expect(findings.some(f => f.pattern === 'Anthropic API Key')).toBe(true);
  });

  it('detects OpenAI API keys', () => {
    const findings = scanTextSync('sk-proj-abcdefghijklmnopqrstuvwxyz12345678');
    expect(findings.some(f => f.pattern === 'OpenAI API Key')).toBe(true);
  });

  it('detects OpenAI keys without proj prefix', () => {
    const findings = scanTextSync('sk-abcdefghijklmnopqrstuvwxyz12345678');
    expect(findings.some(f => f.pattern === 'OpenAI API Key')).toBe(true);
  });

  it('detects Slack tokens', () => {
    const findings = scanTextSync('xoxb-123456789012-1234567890123-abcdefghijklmnop');
    expect(findings.some(f => f.pattern === 'Slack Token')).toBe(true);
  });

  it('detects Stripe live keys', () => {
    const findings = scanTextSync('sk_live_abcdefghijklmnopqrstuvwxyz1234');
    expect(findings.some(f => f.pattern === 'Stripe Key')).toBe(true);
  });

  it('detects Stripe test keys', () => {
    const findings = scanTextSync('sk_test_abcdefghijklmnopqrstuvwxyz1234');
    expect(findings.some(f => f.pattern === 'Stripe Key')).toBe(true);
  });

  it('detects Google API keys', () => {
    const findings = scanTextSync('AIzaSyA1234567890abcdefghijklmnopqrstuv');
    expect(findings.some(f => f.pattern === 'Google API Key')).toBe(true);
  });

  it('detects Twilio auth tokens', () => {
    const findings = scanTextSync('SK0123456789abcdef0123456789abcdef');
    expect(findings.some(f => f.pattern === 'Twilio Auth Token')).toBe(true);
  });

  it('detects SendGrid keys', () => {
    const findings = scanTextSync('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');
    expect(findings.some(f => f.pattern === 'SendGrid Key')).toBe(true);
  });

  it('detects PEM private keys', () => {
    const pem = '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA2mX3aCbRgz5Brl1D\n-----END RSA PRIVATE KEY-----';
    const findings = scanTextSync(pem);
    expect(findings.some(f => f.pattern === 'Private Key')).toBe(true);
  });

  it('detects EC private keys', () => {
    const pem = '-----BEGIN EC PRIVATE KEY-----\nMHQCAQEEIKZv0123456789abcdef\n-----END EC PRIVATE KEY-----';
    const findings = scanTextSync(pem);
    expect(findings.some(f => f.pattern === 'Private Key')).toBe(true);
  });

  it('detects database connection strings', () => {
    const findings = scanTextSync('postgres://admin:s3cretP4ss@db.host:5432/prod');
    expect(findings.some(f => f.pattern === 'Database Connection String')).toBe(true);
  });

  it('detects MongoDB connection strings', () => {
    const findings = scanTextSync('mongodb+srv://user:p4ss@cluster.mongodb.net/mydb');
    expect(findings.some(f => f.pattern === 'Database Connection String')).toBe(true);
  });

  it('detects Redis connection strings', () => {
    const findings = scanTextSync('redis://default:password@redis.host:6379');
    expect(findings.some(f => f.pattern === 'Database Connection String')).toBe(true);
  });

  it('detects JWT tokens', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
    const findings = scanTextSync(jwt);
    expect(findings.some(f => f.pattern === 'JWT Token')).toBe(true);
  });

  it('detects secret assignments', () => {
    const cases = [
      'API_KEY=sk_live_1234567890abcdef',
      'PASSWORD: mySecretPassword123',
      'SECRET_KEY="long_secret_value_here"',
      'CLIENT_SECRET=abcdefghijklmnop',
    ];
    for (const text of cases) {
      const findings = scanTextSync(text);
      expect(findings.some(f => f.pattern === 'Secret Assignment'), `failed: ${text}`).toBe(true);
    }
  });

  it('detects Bearer tokens', () => {
    const findings = scanTextSync('Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6Ik');
    expect(findings.some(f => f.pattern === 'Bearer Token')).toBe(true);
  });
});

// ── PII detection ──────────────────────────────────────────────

describe('scanTextSync — PII', () => {
  it('detects email addresses', () => {
    const findings = scanTextSync('contact jane.doe@gmail.com for info');
    expect(findings.some(f => f.pattern === 'Email Address')).toBe(true);
    expect(findings[0].severity).toBe('medium');
  });

  it('skips example emails', () => {
    const examples = [
      'user@example.com',
      'test@test.com',
      'noreply@service.com',
      'foo@bar.com',
      'admin@example.org',
      'bot@users.noreply.github.com',
    ];
    for (const email of examples) {
      const findings = scanTextSync(email);
      expect(findings.filter(f => f.pattern === 'Email Address'), `should skip: ${email}`).toHaveLength(0);
    }
  });

  it('detects SSNs', () => {
    const findings = scanTextSync('SSN is 123-45-6789');
    expect(findings.some(f => f.pattern === 'SSN')).toBe(true);
    expect(findings.find(f => f.pattern === 'SSN')!.severity).toBe('high');
  });
});

// ── False positive avoidance ───────────────────────────────────

describe('scanTextSync — no false positives', () => {
  it('ignores normal code', () => {
    const code = 'const x = 42; function foo() { return bar; }';
    expect(scanTextSync(code)).toHaveLength(0);
  });

  it('ignores short strings', () => {
    expect(scanTextSync('sk-abc')).toHaveLength(0);
    expect(scanTextSync('ghp_short')).toHaveLength(0);
  });

  it('ignores import statements', () => {
    expect(scanTextSync("import { foo } from 'bar';")).toHaveLength(0);
  });

  it('ignores common identifiers', () => {
    expect(scanTextSync('const userId = "abc123"')).toHaveLength(0);
  });
});

// ── Redaction ──────────────────────────────────────────────────

describe('redactText', () => {
  it('replaces high-severity secrets', () => {
    const text = 'key AKIAZ7TCBMQAWD5NPXRU in config';
    const result = redactText(text);
    expect(result).toContain('[REDACTED AWS ACCESS KEY]');
    expect(result).not.toContain('AKIAZ7TCBMQAWD5NPXRU');
  });

  it('replaces GitHub tokens', () => {
    const text = 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij12';
    expect(redactText(text)).toBe('[REDACTED GITHUB TOKEN]');
  });

  it('replaces Anthropic keys', () => {
    const text = 'sk-ant-api03-abc123def456ghi789jkl';
    expect(redactText(text)).toBe('[REDACTED ANTHROPIC API KEY]');
  });

  it('replaces database connection strings', () => {
    const text = 'postgres://admin:secret@host:5432/db';
    expect(redactText(text)).toBe('[REDACTED DATABASE CONNECTION STRING]');
  });

  it('preserves emails in high-only mode', () => {
    const text = 'email: alex@gmail.com key: AKIAZ7TCBMQAWD5NPXRU';
    const result = redactText(text, 'high');
    expect(result).toContain('alex@gmail.com');
    expect(result).toContain('[REDACTED AWS ACCESS KEY]');
  });

  it('redacts emails in all mode', () => {
    const text = 'email: alex@gmail.com';
    const result = redactText(text, 'all');
    expect(result).toContain('[REDACTED EMAIL ADDRESS]');
  });

  it('skips allowlisted emails even in all mode', () => {
    const text = 'user@example.com';
    expect(redactText(text, 'all')).toBe('user@example.com');
  });

  it('handles multiple secrets in one string', () => {
    const text = 'aws: AKIAZ7TCBMQAWD5NPXRU github: ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij12';
    const result = redactText(text);
    expect(result).toContain('[REDACTED AWS ACCESS KEY]');
    expect(result).toContain('[REDACTED GITHUB TOKEN]');
  });
});

// ── Path stripping ─────────────────────────────────────────────

describe('stripHomePath', () => {
  it('strips cwd prefix to make project-relative paths', () => {
    expect(stripHomePath('/Users/ben/Dev/project/src/foo.ts', '/Users/ben/Dev/project')).toBe('src/foo.ts');
  });

  it('strips home dir to ~/rest', () => {
    const home = process.env.HOME ?? '/Users/test';
    expect(stripHomePath(`${home}/.config/something`)).toBe('~/.config/something');
  });

  it('leaves non-home paths unchanged', () => {
    expect(stripHomePath('/tmp/foo.txt')).toBe('/tmp/foo.txt');
  });

  it('prefers cwd stripping over home stripping', () => {
    const home = process.env.HOME ?? '/Users/test';
    const cwd = `${home}/Dev/project`;
    expect(stripHomePath(`${cwd}/lib/auth.ex`, cwd)).toBe('lib/auth.ex');
  });
});

describe('stripHomePathsInText', () => {
  it('strips cwd from tool output strings', () => {
    const home = process.env.HOME ?? '/Users/test';
    const cwd = `${home}/Dev/project`;
    const text = `[Read] ${cwd}/lib/auth.ex`;
    expect(stripHomePathsInText(text, cwd)).toBe('[Read] lib/auth.ex');
  });

  it('strips home dir from paths without cwd', () => {
    const home = process.env.HOME ?? '/Users/test';
    const text = `file at ${home}/.claude/projects/foo`;
    expect(stripHomePathsInText(text)).toBe('file at ~/.claude/projects/foo');
  });
});

// ── Session-level redaction ────────────────────────────────────

describe('redactSession', () => {
  it('deep-redacts all string fields', () => {
    const session = {
      title: 'Fix auth',
      rawLog: ['> set AKIAZ7TCBMQAWD5NPXRU as the key', 'Done'],
      nested: { devTake: 'Used ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij12 for access' },
      count: 42,
    };
    const result = redactSession(session) as Record<string, unknown>;
    expect(result.title).toBe('Fix auth');
    expect((result.rawLog as string[])[0]).toContain('[REDACTED AWS ACCESS KEY]');
    expect((result.nested as Record<string, string>).devTake).toContain('[REDACTED GITHUB TOKEN]');
    expect(result.count).toBe(42);
  });

  it('strips home paths from file references', () => {
    const home = process.env.HOME ?? '/Users/test';
    const cwd = `${home}/Dev/project`;
    const session = {
      topFiles: [{ path: `${cwd}/src/foo.ts`, additions: 10 }],
    };
    const result = redactSession(session, 'high', cwd);
    expect((result.topFiles as Array<{ path: string }>)[0].path).toBe('src/foo.ts');
  });

  it('returns a new object without mutating input', () => {
    const original = { text: 'AKIAZ7TCBMQAWD5NPXRU' };
    const result = redactSession(original);
    expect(original.text).toBe('AKIAZ7TCBMQAWD5NPXRU');
    expect((result as Record<string, string>).text).toContain('[REDACTED');
  });
});

// ── Helpers ────────────────────────────────────────────────────

describe('deduplicateFindings', () => {
  it('removes duplicate (pattern, match) pairs', () => {
    const findings: Finding[] = [
      { pattern: 'AWS Access Key', severity: 'high', category: 'secret', match: 'AKIA...', index: 0 },
      { pattern: 'AWS Access Key', severity: 'high', category: 'secret', match: 'AKIA...', index: 100 },
      { pattern: 'GitHub Token', severity: 'high', category: 'secret', match: 'ghp_...', index: 50 },
    ];
    expect(deduplicateFindings(findings)).toHaveLength(2);
  });
});

describe('formatFindings', () => {
  it('formats high and medium findings separately', () => {
    const findings: Finding[] = [
      { pattern: 'AWS Access Key', severity: 'high', category: 'secret', match: 'AKIA...', index: 0 },
      { pattern: 'Email Address', severity: 'medium', category: 'pii', match: 'ben@...', index: 50 },
    ];
    const output = formatFindings(findings);
    expect(output).toContain('secret(s) auto-redacted');
    expect(output).toContain('potential PII flagged');
  });

  it('returns empty string for no findings', () => {
    expect(formatFindings([])).toBe('');
  });
});
