export type Severity = "high" | "medium";
export type Category = "secret" | "pii" | "path";
export interface Finding {
    pattern: string;
    severity: Severity;
    category: Category;
    match: string;
    index: number;
}
export interface SessionScanResult {
    findings: Finding[];
    fieldsWithFindings: string[];
}
/** Scan text for secrets and PII using secretlint + custom regex. */
export declare function scanText(text: string): Promise<Finding[]>;
/** Synchronous scan using only custom regex patterns (no secretlint). */
export declare function scanTextSync(text: string): Finding[];
/** Replace detected secrets in text. mode='high' redacts only high-severity. */
export declare function redactText(text: string, mode?: "high" | "all"): string;
/** Strip home directory prefix, returning project-relative or ~/rest. */
export declare function stripHomePath(filepath: string, cwd?: string): string;
/** Strip home directory and cwd prefixes from all paths in a string. */
export declare function stripHomePathsInText(text: string, cwd?: string): string;
/** Scan all string fields in a session object for secrets/PII. */
export declare function scanSession(session: Record<string, unknown>): Promise<SessionScanResult>;
/** Deep-redact all string fields + strip paths. Returns a new object. */
export declare function redactSession(session: Record<string, unknown>, mode?: "high" | "all", cwd?: string): Record<string, unknown>;
/** Deduplicate findings by (pattern, match) pair. */
export declare function deduplicateFindings(findings: Finding[]): Finding[];
/** Format findings for CLI warning output. */
export declare function formatFindings(findings: Finding[]): string;
