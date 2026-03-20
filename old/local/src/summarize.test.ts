import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  stripBannedWords,
  normalizePatterns,
  normalizeToSessionSummary,
  analyzeWritingStyle,
  truncate,
  tryParseJson,
  buildQuestionContext,
  cleanPrompt,
  isHumanPrompt,
  BANNED_WORDS,
} from "./summarize.js";

describe("stripBannedWords", () => {
  it("replaces leverage with use", () => {
    assert.equal(stripBannedWords("We leverage the API"), "We use the API");
  });

  it("replaces utilize with use", () => {
    assert.equal(stripBannedWords("Utilize the cache layer"), "Use the cache layer");
  });

  it("replaces streamline with simplify", () => {
    assert.equal(stripBannedWords("Streamline the process"), "Simplify the process");
  });

  it("replaces enhance with improve", () => {
    assert.equal(stripBannedWords("Enhance the output"), "Improve the output");
  });

  it("replaces robust with solid", () => {
    assert.equal(stripBannedWords("A robust solution"), "A solid solution");
  });

  it("replaces seamless with smooth", () => {
    assert.equal(stripBannedWords("A seamless integration"), "A smooth integration");
  });

  it("is case-insensitive", () => {
    assert.equal(stripBannedWords("LEVERAGE the API"), "Use the API");
    assert.equal(stripBannedWords("Robust systems"), "Solid systems");
  });

  it("handles multiple banned words in one string", () => {
    const input = "Leverage robust APIs to streamline the workflow";
    const result = stripBannedWords(input);
    assert.equal(result, "Use solid APIs to simplify the workflow");
  });

  it("processes nested objects recursively", () => {
    const input = {
      title: "Leverage the cache",
      steps: [
        { body: "Utilize the API", insight: "Robust patterns" },
      ],
    };
    const result = stripBannedWords(input);
    assert.equal(result.title, "Use the cache");
    assert.equal(result.steps[0].body, "Use the API");
    assert.equal(result.steps[0].insight, "Solid patterns");
  });

  it("processes arrays", () => {
    const input = ["Leverage this", "Enhance that"];
    const result = stripBannedWords(input);
    assert.deepEqual(result, ["Use this", "Improve that"]);
  });

  it("passes through non-string primitives unchanged", () => {
    assert.equal(stripBannedWords(42), 42);
    assert.equal(stripBannedWords(true), true);
    assert.equal(stripBannedWords(null), null);
  });

  it("leaves clean text unchanged", () => {
    const input = "Built a CLI tool to parse session data";
    assert.equal(stripBannedWords(input), input);
  });
});

describe("normalizePatterns", () => {
  it("returns defaults for null input", () => {
    const result = normalizePatterns(null);
    assert.deepEqual(result, {
      constraintsSetUpfront: false,
      redirectionCount: 0,
      verificationSteps: 0,
      contextFilesLoaded: 0,
      scopeChanges: 0,
    });
  });

  it("returns defaults for non-object input", () => {
    const result = normalizePatterns("not an object");
    assert.deepEqual(result, {
      constraintsSetUpfront: false,
      redirectionCount: 0,
      verificationSteps: 0,
      contextFilesLoaded: 0,
      scopeChanges: 0,
    });
  });

  it("normalizes valid pattern data", () => {
    const result = normalizePatterns({
      constraintsSetUpfront: true,
      redirectionCount: 3,
      verificationSteps: 5,
      contextFilesLoaded: 10,
      scopeChanges: 2,
    });
    assert.deepEqual(result, {
      constraintsSetUpfront: true,
      redirectionCount: 3,
      verificationSteps: 5,
      contextFilesLoaded: 10,
      scopeChanges: 2,
    });
  });

  it("coerces non-number counts to 0", () => {
    const result = normalizePatterns({
      constraintsSetUpfront: true,
      redirectionCount: "three",
      verificationSteps: null,
      contextFilesLoaded: undefined,
      scopeChanges: false,
    });
    assert.equal(result.redirectionCount, 0);
    assert.equal(result.verificationSteps, 0);
    assert.equal(result.contextFilesLoaded, 0);
    assert.equal(result.scopeChanges, 0);
  });

  it("coerces truthy values to boolean for constraintsSetUpfront", () => {
    assert.equal(normalizePatterns({ constraintsSetUpfront: 1 }).constraintsSetUpfront, true);
    assert.equal(normalizePatterns({ constraintsSetUpfront: 0 }).constraintsSetUpfront, false);
    assert.equal(normalizePatterns({ constraintsSetUpfront: "" }).constraintsSetUpfront, false);
  });
});

describe("truncate", () => {
  it("returns short text unchanged", () => {
    assert.equal(truncate("hello", 10), "hello");
  });

  it("truncates text that exceeds maxLen", () => {
    const result = truncate("a very long string that should be truncated", 20);
    assert.equal(result.length, 20);
    assert.ok(result.endsWith("\u2026"));
  });

  it("returns text at exactly maxLen unchanged", () => {
    assert.equal(truncate("12345", 5), "12345");
  });
});

describe("tryParseJson", () => {
  it("parses valid JSON", () => {
    const result = tryParseJson('{"key": "value"}');
    assert.deepEqual(result, { key: "value" });
  });

  it("parses JSON with markdown fences", () => {
    const result = tryParseJson('```json\n{"key": "value"}\n```');
    assert.deepEqual(result, { key: "value" });
  });

  it("extracts JSON from surrounding text", () => {
    const result = tryParseJson('Here is the result: {"key": "value"} and more text');
    assert.deepEqual(result, { key: "value" });
  });

  it("returns null for invalid input", () => {
    assert.equal(tryParseJson("not json at all"), null);
  });

  it("returns null for empty string", () => {
    assert.equal(tryParseJson(""), null);
  });
});

describe("BANNED_WORDS", () => {
  it("contains exactly the expected banned words", () => {
    assert.deepEqual(
      BANNED_WORDS.sort(),
      ["enhance", "leverage", "robust", "seamless", "streamline", "utilize"].sort()
    );
  });
});

describe("analyzeWritingStyle", () => {
  it("detects short and blunt prompts", () => {
    const turns = [
      { i: 0, prompt: "fix the bug", tools: [], errors: [], response: "", model: "" },
      { i: 1, prompt: "now test it", tools: [], errors: [], response: "", model: "" },
      { i: 2, prompt: "ship it", tools: [], errors: [], response: "", model: "" },
    ];
    const result = analyzeWritingStyle(turns);
    assert.ok(result.includes("short and blunt"), `Expected 'short and blunt' in: ${result}`);
  });

  it("detects casual tone from casual markers", () => {
    const turns = [
      { i: 0, prompt: "yeah let's do that, cool stuff honestly", tools: [], errors: [], response: "", model: "" },
      { i: 1, prompt: "nice, gonna refactor this thing basically", tools: [], errors: [], response: "", model: "" },
    ];
    const result = analyzeWritingStyle(turns);
    assert.ok(result.includes("casual"), `Expected 'casual' in: ${result}`);
  });

  it("detects contraction usage", () => {
    const turns = [
      { i: 0, prompt: "I'm not sure if that's right, it doesn't look correct and we're behind", tools: [], errors: [], response: "", model: "" },
      { i: 1, prompt: "I can't figure out why it won't work, but I'll try again", tools: [], errors: [], response: "", model: "" },
    ];
    const result = analyzeWritingStyle(turns);
    assert.ok(result.includes("contractions frequently"), `Expected 'contractions frequently' in: ${result}`);
  });

  it("detects heavy technical jargon", () => {
    const turns = [
      { i: 0, prompt: "refactor the API endpoint to use async middleware with OAuth and JWT auth", tools: [], errors: [], response: "", model: "" },
      { i: 1, prompt: "deploy the container to the cluster, update the CI pipeline and schema migration", tools: [], errors: [], response: "", model: "" },
    ];
    const result = analyzeWritingStyle(turns);
    assert.ok(result.includes("heavy technical jargon"), `Expected 'heavy technical jargon' in: ${result}`);
  });

  it("handles empty turns", () => {
    const result = analyzeWritingStyle([]);
    assert.ok(typeof result === "string");
    assert.ok(result.length > 0);
  });
});

const minimalAnalysis = {
  sessionId: "test",
  project: "test",
  projectPath: "/test",
  duration: { start: "2026-01-01T00:00:00Z", end: "2026-01-01T00:30:00Z", minutes: 30 },
  turns: [{ index: 0, userPrompt: "test prompt", userTimestamp: "", assistantText: "", assistantTimestamp: "", toolCalls: [], model: "" }],
  totalToolCalls: 0,
  toolUsage: {},
  filesChanged: [],
  rejectedToolCalls: 0,
  retries: 0,
  idleGaps: [],
  funnyMoments: [],
  gitBranch: "main",
};

describe("cleanPrompt", () => {
  it("strips XML system tags", () => {
    const result = cleanPrompt('<local-command-caveat>Caveat: system text</local-command-caveat>Fix the auth bug');
    assert.equal(result, "Fix the auth bug");
  });

  it("strips self-closing tags", () => {
    const result = cleanPrompt('Hello <system-reminder /> world');
    assert.equal(result, "Hello world");
  });

  it("strips multiple nested tags", () => {
    const result = cleanPrompt('<foo>bar</foo> real text <baz>qux</baz>');
    assert.equal(result, "real text");
  });

  it("leaves clean text unchanged", () => {
    assert.equal(cleanPrompt("fix the auth bug"), "fix the auth bug");
  });

  it("collapses whitespace", () => {
    const result = cleanPrompt("  lots   of   spaces  ");
    assert.equal(result, "lots of spaces");
  });
});

describe("isHumanPrompt", () => {
  it("rejects empty strings", () => {
    assert.equal(isHumanPrompt(""), false);
  });

  it("rejects system tags", () => {
    assert.equal(isHumanPrompt("<local-command-caveat>stuff</local-command-caveat>"), false);
  });

  it("rejects very short prompts", () => {
    assert.equal(isHumanPrompt("ok"), false);
    assert.equal(isHumanPrompt("yes"), false);
  });

  it("rejects bracketed system messages", () => {
    assert.equal(isHumanPrompt("[Request interrupted by user]"), false);
    assert.equal(isHumanPrompt("[Request interrupted by user for tool use]"), false);
  });

  it("rejects pasted plan prompts", () => {
    assert.equal(isHumanPrompt("Implement the following plan: # Session Questions Flow"), false);
    assert.equal(isHumanPrompt("Execute the following steps"), false);
  });

  it("accepts real prompts", () => {
    assert.equal(isHumanPrompt("fix the auth bug"), true);
    assert.equal(isHumanPrompt("I think we should refactor this"), true);
  });
});

describe("buildQuestionContext", () => {
  it("includes correction-like prompts from turns", () => {
    const analysis = {
      ...minimalAnalysis,
      turns: [
        { index: 0, userPrompt: "build the widget", userTimestamp: "", assistantText: "", assistantTimestamp: "", toolCalls: [], model: "" },
        { index: 5, userPrompt: "no that's wrong, revert that change", userTimestamp: "", assistantText: "", assistantTimestamp: "", toolCalls: [], model: "" },
      ],
    };
    const result = buildQuestionContext(analysis as any);
    assert.ok(result.includes("Correction moments"));
    assert.ok(result.includes("wrong"));
  });

  it("strips system tags from prompts", () => {
    const analysis = {
      ...minimalAnalysis,
      turns: [
        { index: 0, userPrompt: '<local-command-caveat>system stuff</local-command-caveat>Fix the auth bug', userTimestamp: "", assistantText: "", assistantTimestamp: "", toolCalls: [], model: "" },
      ],
    };
    const result = buildQuestionContext(analysis as any);
    assert.ok(result.includes("Fix the auth bug"));
    assert.ok(!result.includes("local-command"));
    assert.ok(!result.includes("system stuff"));
  });

  it("filters out system-only prompts", () => {
    const analysis = {
      ...minimalAnalysis,
      turns: [
        { index: 0, userPrompt: '<local-command>run tests</local-command>', userTimestamp: "", assistantText: "", assistantTimestamp: "", toolCalls: [], model: "" },
        { index: 1, userPrompt: "I think we should refactor the auth module", userTimestamp: "", assistantText: "", assistantTimestamp: "", toolCalls: [], model: "" },
      ],
    };
    const result = buildQuestionContext(analysis as any);
    assert.ok(result.includes("refactor the auth"));
    assert.ok(!result.includes("local-command"));
  });

  it("includes idle gaps without raw timestamps", () => {
    const analysis = {
      ...minimalAnalysis,
      idleGaps: [{ after: "debugging auth flow", minutes: 12 }],
    };
    const result = buildQuestionContext(analysis as any);
    assert.ok(result.includes("Pauses"));
    assert.ok(result.includes("12 min pause"));
    assert.ok(!result.includes("T12:")); // no ISO timestamps
  });

  it("skips short idle gaps under 5 min", () => {
    const analysis = {
      ...minimalAnalysis,
      idleGaps: [
        { after: "quick check", minutes: 3 },
        { after: "deep thinking", minutes: 8 },
      ],
    };
    const result = buildQuestionContext(analysis as any);
    assert.ok(!result.includes("quick check"));
    assert.ok(result.includes("deep thinking"));
  });

  it("includes first human prompt", () => {
    const result = buildQuestionContext(minimalAnalysis as any);
    assert.ok(result.includes("First prompt"));
    assert.ok(result.includes("test prompt"));
  });

  it("includes files changed", () => {
    const analysis = {
      ...minimalAnalysis,
      filesChanged: [{ filePath: "src/auth.ts", tool: "Edit", count: 3 }],
    };
    const result = buildQuestionContext(analysis as any);
    assert.ok(result.includes("Files changed"));
    assert.ok(result.includes("auth.ts"));
  });

  it("includes decision-like prompts", () => {
    const analysis = {
      ...minimalAnalysis,
      turns: [
        { index: 0, userPrompt: "I think we should use Redis for caching", userTimestamp: "", assistantText: "", assistantTimestamp: "", toolCalls: [], model: "" },
      ],
    };
    const result = buildQuestionContext(analysis as any);
    assert.ok(result.includes("Decision moments"));
    assert.ok(result.includes("Redis"));
  });
});

describe("normalizeToSessionSummary with developerQuotes", () => {

  it("creates summary without developerQuotes when not provided", () => {
    const result = normalizeToSessionSummary(
      { title: "Test", executionPath: [], narrative: "" },
      minimalAnalysis as any,
      100
    );
    assert.equal(result.developerQuotes, undefined);
    assert.equal(result.suggestedTake, undefined);
  });

  it("preserves title and context in normalized output", () => {
    const result = normalizeToSessionSummary(
      { title: "Built auth flow", context: "Needed device auth", executionPath: [], narrative: "" },
      minimalAnalysis as any,
      100
    );
    assert.equal(result.title, "Built auth flow");
    assert.equal(result.context, "Needed device auth");
  });

  it("questions field is undefined by default (set by Pass 4)", () => {
    const result = normalizeToSessionSummary(
      { title: "Test", executionPath: [], narrative: "" },
      minimalAnalysis as any,
      100
    );
    assert.equal(result.questions, undefined);
  });
});
