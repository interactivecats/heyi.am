// Redact — scans text for secrets, PII, and sensitive file paths before publish.
//
// Custom regex patterns for common secret formats (API keys, tokens, PII, paths).
//
// Two severity levels:
//   HIGH   — auto-redacted (known API key prefixes, private keys, connection strings)
//   MEDIUM — flagged for user review (email addresses)
//
// Usage:
//   const findings = scanTextSync(text);
//   const cleaned  = redactText(text);

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

// ── Custom regex patterns ─────────────────────────────────────

interface PatternDef {
  name: string;
  regex: RegExp;
  severity: Severity;
  category: Category;
}

// All regex patterns — used for both scanning AND redaction (find-and-replace).
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

/** Scan text for secrets and PII using custom regex patterns. */
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
