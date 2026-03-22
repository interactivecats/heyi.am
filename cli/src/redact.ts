// Redact — scans text for secrets, PII, and sensitive file paths before publish.
//
// Two layers:
//   1. secretlint (community-maintained rules for Anthropic, GitHub, Slack, npm, etc.)
//   2. Custom regex (fills gaps: OpenAI, Stripe, Google, JWT, Bearer, PII, paths)
//
// Two severity levels:
//   HIGH   — auto-redacted (known API key prefixes, private keys, connection strings)
//   MEDIUM — flagged for user review (email addresses)
//
// Usage:
//   const findings = await scanText(text);
//   const cleaned  = await redactText(text);
//   const results  = await scanSession(session);

import { homedir } from "node:os";

// ── Types ──────────────────────────────────────────────────────

export type Severity = "high" | "medium";
export type Category = "secret" | "pii" | "path";

export interface Finding {
  pattern: string;
  severity: Severity;
  category: Category;
  match: string;       // the matched text (truncated for display)
  index: number;       // character offset in the scanned string
}

export interface SessionScanResult {
  findings: Finding[];
  fieldsWithFindings: string[];
}

// ── Secretlint integration ─────────────────────────────────────

let _engine: {
  executeOnContent: (opts: { content: string; filePath: string }) => Promise<{ ok: boolean; output: string }>;
} | null = null;
let _engineInitFailed = false;

async function getSecretlintEngine() {
  if (_engine) return _engine;
  if (_engineInitFailed) return null;

  try {
    const { createEngine } = await import("@secretlint/node");
    const preset = await import("@secretlint/secretlint-rule-preset-recommend");
    _engine = await createEngine({
      color: false,
      formatter: "json",
      maskSecrets: false,
      configFileJSON: {
        rules: [{
          id: "@secretlint/secretlint-rule-preset-recommend",
          rule: preset.creator,
        }],
      },
    });
    return _engine;
  } catch {
    _engineInitFailed = true;
    return null;
  }
}

async function secretlintScan(text: string): Promise<Finding[]> {
  const engine = await getSecretlintEngine();
  if (!engine) return [];

  try {
    const { ok, output } = await engine.executeOnContent({ content: text, filePath: "/scan.txt" });
    if (ok) return []; // no findings

    const results = JSON.parse(output) as Array<{ messages: Array<{ ruleId: string; message: string; loc: { start: { offset: number } } }> }>;
    const findings: Finding[] = [];
    for (const file of results) {
      for (const msg of file.messages ?? []) {
        findings.push({
          pattern: msg.ruleId.replace("@secretlint/secretlint-rule-", ""),
          severity: "high",
          category: "secret",
          match: msg.message.length > 60 ? msg.message.slice(0, 50) + "..." : msg.message,
          index: msg.loc?.start?.offset ?? 0,
        });
      }
    }
    return findings;
  } catch {
    return [];
  }
}

// ── Custom regex patterns (fills secretlint gaps) ──────────────

interface PatternDef {
  name: string;
  regex: RegExp;
  severity: Severity;
  category: Category;
}

// All regex patterns — used for both scanning AND redaction (find-and-replace).
// secretlint adds additional detection on top; deduplication prevents double-counting.
const CUSTOM_SECRET_PATTERNS: PatternDef[] = [
  // ─── AWS ───────────────────────────────────────────────
  {
    name: "AWS Access Key",
    regex: /\b(?:A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}\b/g,
    severity: "high",
    category: "secret",
  },
  // ─── GitHub ────────────────────────────────────────────
  {
    name: "GitHub Token",
    regex: /\b(?:ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{36,255}\b/g,
    severity: "high",
    category: "secret",
  },
  // ─── Anthropic ─────────────────────────────────────────
  {
    name: "Anthropic API Key",
    regex: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g,
    severity: "high",
    category: "secret",
  },
  // ─── OpenAI ────────────────────────────────────────────
  {
    name: "OpenAI API Key",
    regex: /\bsk-(?:proj-)?[A-Za-z0-9]{20,}\b/g,
    severity: "high",
    category: "secret",
  },
  // ─── Slack ─────────────────────────────────────────────
  {
    name: "Slack Token",
    regex: /\bxox[bporas]-[A-Za-z0-9-]{10,}\b/g,
    severity: "high",
    category: "secret",
  },
  // ─── Stripe ────────────────────────────────────────────
  {
    name: "Stripe Key",
    regex: /\b[sr]k_(?:live|test)_[A-Za-z0-9]{20,}\b/g,
    severity: "high",
    category: "secret",
  },
  // ─── Google ────────────────────────────────────────────
  {
    name: "Google API Key",
    regex: /\bAIza[0-9A-Za-z_-]{35}\b/g,
    severity: "high",
    category: "secret",
  },
  // ─── Twilio ────────────────────────────────────────────
  {
    name: "Twilio Auth Token",
    regex: /\bSK[0-9a-f]{32}\b/g,
    severity: "high",
    category: "secret",
  },
  // ─── SendGrid ──────────────────────────────────────────
  {
    name: "SendGrid Key",
    regex: /\bSG\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/g,
    severity: "high",
    category: "secret",
  },
  // ─── Private keys (PEM) ────────────────────────────────
  {
    name: "Private Key",
    regex: /-----BEGIN[\s\w]*PRIVATE KEY-----[\s\S]{10,}?-----END[\s\w]*PRIVATE KEY-----/g,
    severity: "high",
    category: "secret",
  },
  // ─── Database connection strings with passwords ────────
  {
    name: "Database Connection String",
    regex: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp|mssql):\/\/[^\s:]+:[^\s@]+@[^\s]+/g,
    severity: "high",
    category: "secret",
  },
  // ─── JWT ───────────────────────────────────────────────
  {
    name: "JWT Token",
    regex: /\beyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/g,
    severity: "high",
    category: "secret",
  },
  // ─── Generic: KEY=value, SECRET=value, TOKEN=value ─────
  {
    name: "Secret Assignment",
    regex: /\b(?:PASSWORD|SECRET|TOKEN|API_KEY|PRIVATE_KEY|ACCESS_KEY|SECRET_KEY|AUTH_TOKEN|CLIENT_SECRET|ENCRYPTION_KEY|SIGNING_KEY)\s{0,5}[=:]\s{0,5}['"]?[A-Za-z0-9/+=_.-]{8,}['"]?/gi,
    severity: "high",
    category: "secret",
  },
  // ─── Bearer tokens ─────────────────────────────────────
  {
    name: "Bearer Token",
    regex: /\bBearer\s+[A-Za-z0-9_.-]{20,}\b/g,
    severity: "high",
    category: "secret",
  },
];

const PII_PATTERNS: PatternDef[] = [
  {
    name: "Email Address",
    regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    severity: "medium",
    category: "pii",
  },
  {
    name: "SSN",
    regex: /\b\d{3}-\d{2}-\d{4}\b/g,
    severity: "high",
    category: "pii",
  },
];

const ALL_CUSTOM_PATTERNS: PatternDef[] = [...CUSTOM_SECRET_PATTERNS, ...PII_PATTERNS];

// Email false positives: example/test/noreply addresses common in code
const EMAIL_ALLOWLIST = [
  /^noreply@/i,
  /^no-reply@/i,
  /^example@/i,
  /^test@/i,
  /^user@example/i,
  /^foo@/i,
  /^bar@/i,
  /^admin@example/i,
  /@example\.(com|org|net)$/i,
  /@test\.(com|org)$/i,
  /@localhost$/i,
  /@users\.noreply\.github\.com$/i,
];

// ── Scanning ───────────────────────────────────────────────────

function regexScan(text: string): Finding[] {
  const findings: Finding[] = [];

  for (const pattern of ALL_CUSTOM_PATTERNS) {
    pattern.regex.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.regex.exec(text)) !== null) {
      const matchStr = match[0];

      if (pattern.name === "Email Address") {
        if (EMAIL_ALLOWLIST.some((re) => re.test(matchStr))) continue;
      }

      findings.push({
        pattern: pattern.name,
        severity: pattern.severity,
        category: pattern.category,
        match: matchStr.length > 40
          ? matchStr.slice(0, 20) + "..." + matchStr.slice(-10)
          : matchStr,
        index: match.index,
      });
    }
  }

  return findings;
}

/** Scan text for secrets and PII using secretlint + custom regex. */
export async function scanText(text: string): Promise<Finding[]> {
  const [slFindings, regexFindings] = await Promise.all([
    secretlintScan(text),
    Promise.resolve(regexScan(text)),
  ]);

  return deduplicateFindings([...slFindings, ...regexFindings]);
}

/** Synchronous scan using only custom regex patterns (no secretlint). */
export function scanTextSync(text: string): Finding[] {
  return regexScan(text);
}

/** Replace detected secrets in text. mode='high' redacts only high-severity. */
export function redactText(text: string, mode: "high" | "all" = "high"): string {
  let result = text;

  for (const pattern of ALL_CUSTOM_PATTERNS) {
    if (mode === "high" && pattern.severity !== "high") continue;

    pattern.regex.lastIndex = 0;
    result = result.replace(pattern.regex, (match) => {
      if (pattern.name === "Email Address") {
        if (EMAIL_ALLOWLIST.some((re) => re.test(match))) return match;
      }
      return `[REDACTED ${pattern.name.toUpperCase()}]`;
    });
  }

  return result;
}

// ── Path stripping ─────────────────────────────────────────────

const HOME = homedir();

/** Strip home directory prefix, returning project-relative or ~/rest. */
export function stripHomePath(filepath: string, cwd?: string): string {
  if (cwd && filepath.startsWith(cwd)) {
    const rel = filepath.slice(cwd.length).replace(/^[/\\]+/, "");
    return rel || filepath;
  }
  if (filepath.startsWith(HOME)) {
    return "~" + filepath.slice(HOME.length);
  }
  return filepath;
}

/** Strip home directory and cwd prefixes from all paths in a string. */
export function stripHomePathsInText(text: string, cwd?: string): string {
  if (cwd) {
    const cwdPattern = escapeRegex(cwd).replace(/\\\//g, "[\\\\/]");
    const cwdRe = new RegExp(cwdPattern + "[/\\\\]?", "g");
    text = text.replace(cwdRe, "");
  }

  const homePattern = escapeRegex(HOME).replace(/\\\//g, "[\\\\/]");
  const homeRe = new RegExp(homePattern + "[/\\\\]?", "g");
  return text.replace(homeRe, "~/");
}

// ── Session-level operations ───────────────────────────────────

/** Scan all string fields in a session object for secrets/PII. */
export async function scanSession(session: Record<string, unknown>): Promise<SessionScanResult> {
  // Collect all string values with their paths
  const strings: Array<{ value: string; path: string }> = [];

  function walk(value: unknown, path: string): void {
    if (typeof value === "string" && value.length > 0) {
      strings.push({ value, path });
    } else if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) walk(value[i], `${path}[${i}]`);
    } else if (value && typeof value === "object") {
      for (const [k, v] of Object.entries(value)) walk(v, path ? `${path}.${k}` : k);
    }
  }

  walk(session, "");

  // Batch all strings into one scan for secretlint efficiency
  const allText = strings.map((s) => s.value).join("\n---FIELD_BOUNDARY---\n");
  const allFindings = await scanText(allText);

  // Map findings back to field paths
  const fieldsWithFindings: string[] = [];
  let offset = 0;
  for (const { value, path } of strings) {
    const endOffset = offset + value.length;
    const fieldFindings = allFindings.filter((f) => f.index >= offset && f.index < endOffset);
    if (fieldFindings.length > 0) fieldsWithFindings.push(path);
    offset = endOffset + "\n---FIELD_BOUNDARY---\n".length;
  }

  return { findings: allFindings, fieldsWithFindings };
}

/** Deep-redact all string fields + strip paths. Returns a new object. */
export function redactSession(
  session: Record<string, unknown>,
  mode: "high" | "all" = "high",
  cwd?: string,
): Record<string, unknown> {
  return deepRedact(session, mode, cwd) as Record<string, unknown>;
}

function deepRedact(value: unknown, mode: "high" | "all", cwd?: string): unknown {
  if (typeof value === "string") {
    let result = redactText(value, mode);
    result = stripHomePathsInText(result, cwd);
    return result;
  }
  if (Array.isArray(value)) {
    return value.map((v) => deepRedact(v, mode, cwd));
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = deepRedact(v, mode, cwd);
    }
    return out;
  }
  return value;
}

// ── Helpers ────────────────────────────────────────────────────

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Deduplicate findings by (pattern, match) pair. */
export function deduplicateFindings(findings: Finding[]): Finding[] {
  const seen = new Set<string>();
  return findings.filter((f) => {
    const key = `${f.pattern}::${f.match}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Format findings for CLI warning output. */
export function formatFindings(findings: Finding[]): string {
  const deduped = deduplicateFindings(findings);
  if (deduped.length === 0) return "";

  const high = deduped.filter((f) => f.severity === "high");
  const medium = deduped.filter((f) => f.severity === "medium");

  const lines: string[] = [];
  if (high.length > 0) {
    lines.push(`  ${high.length} secret(s) auto-redacted:`);
    for (const f of high) {
      lines.push(`    - ${f.pattern}: ${f.match}`);
    }
  }
  if (medium.length > 0) {
    lines.push(`  ${medium.length} potential PII flagged:`);
    for (const f of medium) {
      lines.push(`    - ${f.pattern}: ${f.match}`);
    }
  }
  return lines.join("\n");
}
