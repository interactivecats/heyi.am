import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  validateEditorData,
  hasValidationErrors,
  buildEditorDataFromSummary,
  getCounterStatus,
  detectAiFilled,
  groupToolCalls,
  formatTimeOffset,
  FIELD_LIMITS,
} from "./editor-utils.js";

describe("validateEditorData", () => {
  const validData = {
    title: "Built a CLI tool",
    context: "Needed to summarize sessions",
    developer_take: "I wanted something I could show recruiters",
    execution_path: [
      { title: "Step 1", body: "Did something", insight: "Learned something" },
    ],
    skills: ["TypeScript"],
  };

  it("returns no errors for valid data", () => {
    const errors = validateEditorData(validData);
    assert.equal(hasValidationErrors(errors), false);
  });

  it("returns error when title is empty", () => {
    const errors = validateEditorData({ ...validData, title: "" });
    assert.ok(errors.title);
    assert.equal(hasValidationErrors(errors), true);
  });

  it("returns error when title is whitespace only", () => {
    const errors = validateEditorData({ ...validData, title: "   " });
    assert.ok(errors.title);
  });

  it("returns warning when developer_take is empty", () => {
    const errors = validateEditorData({ ...validData, developer_take: "" });
    assert.ok(errors.developer_take);
    assert.ok(errors.developer_take.includes("Required"));
  });

  it("returns error when developer_take is too short", () => {
    const errors = validateEditorData({ ...validData, developer_take: "short" });
    assert.ok(errors.developer_take);
    assert.ok(errors.developer_take!.includes("Too short"));
  });

  it("accepts developer_take at minimum length", () => {
    const errors = validateEditorData({ ...validData, developer_take: "1234567890" });
    assert.equal(errors.developer_take, undefined);
  });

  it("returns error when execution_path is empty", () => {
    const errors = validateEditorData({ ...validData, execution_path: [] });
    assert.ok(errors.execution_path);
  });

  it("returns error when title exceeds limit", () => {
    const errors = validateEditorData({
      ...validData,
      title: "a".repeat(FIELD_LIMITS.title + 1),
    });
    assert.ok(errors.title);
    assert.ok(errors.title.includes("exceeds"));
  });

  it("returns error when developer_take exceeds limit", () => {
    const errors = validateEditorData({
      ...validData,
      developer_take: "x".repeat(FIELD_LIMITS.developerTake + 1),
    });
    assert.ok(errors.developer_take);
    assert.ok(errors.developer_take.includes("exceeds"));
  });

  it("returns error when step title exceeds limit", () => {
    const errors = validateEditorData({
      ...validData,
      execution_path: [
        { title: "t".repeat(FIELD_LIMITS.stepTitle + 1), body: "b", insight: "i" },
      ],
    });
    assert.ok(errors.execution_path);
  });

  it("returns all errors at once", () => {
    const errors = validateEditorData({
      title: "",
      context: "",
      developer_take: "",
      execution_path: [],
      skills: [],
    });
    assert.ok(errors.title);
    assert.ok(errors.developer_take);
    assert.ok(errors.execution_path);
  });
});

describe("buildEditorDataFromSummary", () => {
  it("returns fallback data when summary is null", () => {
    const analysis = {
      turns: [{ userPrompt: "Build me a widget" }],
    };
    const data = buildEditorDataFromSummary(null, analysis);
    assert.equal(data.title, "Build me a widget");
    assert.equal(data.context, "");
    assert.equal(data.developer_take, "");
    assert.deepEqual(data.execution_path, []);
    assert.deepEqual(data.skills, []);
  });

  it("returns empty title when analysis has no turns", () => {
    const data = buildEditorDataFromSummary(null, { turns: [] });
    assert.equal(data.title, "");
  });

  it("extracts v2 executionPath from summary", () => {
    const summary = {
      title: "Built a tool",
      context: "Needed automation",
      oneLineSummary: "Built a tool",
      executionPath: [
        { title: "Step 1", body: "Did X because Y", insight: "Learned Z" },
      ],
      skills: ["TypeScript", "Node.js"],
      narrative: "",
      tutorialSteps: [],
      efficiencyInsights: [],
      highlights: [],
      tokensUsed: 100,
      totalTurns: 5,
      toolUsage: {},
      patterns: {
        constraintsSetUpfront: true,
        redirectionCount: 1,
        verificationSteps: 2,
        contextFilesLoaded: 3,
        scopeChanges: 0,
      },
    };
    const data = buildEditorDataFromSummary(summary as any, { turns: [] });
    assert.equal(data.title, "Built a tool");
    assert.equal(data.context, "Needed automation");
    assert.equal(data.execution_path.length, 1);
    assert.equal(data.execution_path[0].title, "Step 1");
    assert.deepEqual(data.skills, ["TypeScript", "Node.js"]);
  });

  it("falls back to tutorialSteps when executionPath is empty", () => {
    const summary = {
      title: "",
      oneLineSummary: "Something",
      executionPath: [],
      tutorialSteps: [
        { title: "Step A", description: "Did A", turnRange: "1-3", keyTakeaway: "Key A" },
      ],
      skills: [],
      extractedSkills: ["React"],
      narrative: "",
      efficiencyInsights: [],
      highlights: [],
      tokensUsed: 50,
      totalTurns: 3,
      toolUsage: {},
      patterns: {
        constraintsSetUpfront: false,
        redirectionCount: 0,
        verificationSteps: 0,
        contextFilesLoaded: 0,
        scopeChanges: 0,
      },
    };
    const data = buildEditorDataFromSummary(summary as any, { turns: [] });
    assert.equal(data.execution_path.length, 1);
    assert.equal(data.execution_path[0].title, "Step A");
    assert.equal(data.execution_path[0].body, "Did A");
    assert.equal(data.execution_path[0].insight, "Key A");
  });

  it("truncates fields to limits", () => {
    const longTitle = "x".repeat(200);
    const summary = {
      title: longTitle,
      oneLineSummary: longTitle,
      context: "y".repeat(500),
      executionPath: [
        {
          title: "t".repeat(200),
          body: "b".repeat(300),
          insight: "i".repeat(300),
        },
      ],
      skills: [],
      narrative: "",
      tutorialSteps: [],
      efficiencyInsights: [],
      highlights: [],
      tokensUsed: 50,
      totalTurns: 3,
      toolUsage: {},
      patterns: {
        constraintsSetUpfront: false,
        redirectionCount: 0,
        verificationSteps: 0,
        contextFilesLoaded: 0,
        scopeChanges: 0,
      },
    };
    const data = buildEditorDataFromSummary(summary as any, { turns: [] });
    assert.ok(data.title.length <= FIELD_LIMITS.title);
    assert.ok(data.context.length <= FIELD_LIMITS.context);
    assert.ok(data.execution_path[0].title.length <= FIELD_LIMITS.stepTitle);
    assert.ok(data.execution_path[0].body.length <= FIELD_LIMITS.stepBody);
    assert.ok(data.execution_path[0].insight.length <= FIELD_LIMITS.stepInsight);
  });

  it("developer_take is always empty (human-only field)", () => {
    const summary = {
      title: "Test",
      oneLineSummary: "Test",
      executionPath: [],
      skills: [],
      narrative: "",
      tutorialSteps: [],
      efficiencyInsights: [],
      highlights: [],
      tokensUsed: 50,
      totalTurns: 3,
      toolUsage: {},
      patterns: {
        constraintsSetUpfront: false,
        redirectionCount: 0,
        verificationSteps: 0,
        contextFilesLoaded: 0,
        scopeChanges: 0,
      },
    };
    const data = buildEditorDataFromSummary(summary as any, { turns: [] });
    assert.equal(data.developer_take, "");
  });

  it("passes through developerQuotes and suggestedTake from summary", () => {
    const quotes = [
      { text: "I think we should refactor", turnIndex: 3, type: "decision" as const },
      { text: "no that's wrong", turnIndex: 7, type: "correction" as const },
    ];
    const summary = {
      title: "Built auth",
      oneLineSummary: "Built auth",
      executionPath: [],
      skills: [],
      narrative: "",
      tutorialSteps: [],
      efficiencyInsights: [],
      highlights: [],
      tokensUsed: 50,
      totalTurns: 10,
      toolUsage: {},
      patterns: {
        constraintsSetUpfront: false,
        redirectionCount: 0,
        verificationSteps: 0,
        contextFilesLoaded: 0,
        scopeChanges: 0,
      },
      developerQuotes: quotes,
      suggestedTake: "Went in thinking JWT was fine. Switched to sessions.",
    };
    const data = buildEditorDataFromSummary(summary as any, { turns: [] });
    assert.deepEqual(data.developerQuotes, quotes);
    assert.equal(data.suggestedTake, "Went in thinking JWT was fine. Switched to sessions.");
    assert.equal(data.developer_take, ""); // still empty, human must fill
  });

  it("handles missing developerQuotes gracefully", () => {
    const summary = {
      title: "Test",
      oneLineSummary: "Test",
      executionPath: [],
      skills: [],
      narrative: "",
      tutorialSteps: [],
      efficiencyInsights: [],
      highlights: [],
      tokensUsed: 50,
      totalTurns: 3,
      toolUsage: {},
      patterns: {
        constraintsSetUpfront: false,
        redirectionCount: 0,
        verificationSteps: 0,
        contextFilesLoaded: 0,
        scopeChanges: 0,
      },
    };
    const data = buildEditorDataFromSummary(summary as any, { turns: [] });
    assert.equal(data.developerQuotes, undefined);
    assert.equal(data.suggestedTake, undefined);
  });

  it("works with enriched summary (regenerated with answers)", () => {
    const summary = {
      title: "Built auth flow",
      oneLineSummary: "Built auth flow",
      executionPath: [
        { title: "Set up middleware", body: "Added auth middleware because the old one was leaking tokens.", insight: "Check token storage early" },
      ],
      skills: ["TypeScript", "Express"],
      narrative: "I started by...",
      context: "Dev said: the old auth was broken",
      tutorialSteps: [],
      efficiencyInsights: [],
      highlights: [],
      tokensUsed: 100,
      totalTurns: 10,
      toolUsage: {},
      patterns: {
        constraintsSetUpfront: true,
        redirectionCount: 1,
        verificationSteps: 2,
        contextFilesLoaded: 3,
        scopeChanges: 0,
      },
      developerQuotes: [
        { text: "the old auth was broken", turnIndex: 1, type: "opinion" as const },
      ],
      suggestedTake: "Rewrote auth because the old system was leaking session tokens.",
    };
    const data = buildEditorDataFromSummary(summary as any, { turns: [] });
    assert.equal(data.title, "Built auth flow");
    assert.equal(data.context, "Dev said: the old auth was broken");
    assert.equal(data.execution_path.length, 1);
    assert.ok(data.execution_path[0].body.includes("leaking tokens"));
    assert.equal(data.suggestedTake, "Rewrote auth because the old system was leaking session tokens.");
    assert.equal(data.developer_take, ""); // still empty, human fills
  });
});

describe("getCounterStatus", () => {
  it("returns ok when under 70%", () => {
    assert.equal(getCounterStatus(0, 100), "ok");
    assert.equal(getCounterStatus(50, 100), "ok");
    assert.equal(getCounterStatus(69, 100), "ok");
  });

  it("returns warning between 70% and 90%", () => {
    assert.equal(getCounterStatus(70, 100), "warning");
    assert.equal(getCounterStatus(80, 100), "warning");
    assert.equal(getCounterStatus(89, 100), "warning");
  });

  it("returns danger at 90% and above", () => {
    assert.equal(getCounterStatus(90, 100), "danger");
    assert.equal(getCounterStatus(100, 100), "danger");
  });

  it("handles edge cases", () => {
    assert.equal(getCounterStatus(0, 80), "ok");
    assert.equal(getCounterStatus(80, 80), "danger");
  });
});

describe("FIELD_LIMITS", () => {
  it("has correct limits from product spec", () => {
    assert.equal(FIELD_LIMITS.title, 80);
    assert.equal(FIELD_LIMITS.context, 200);
    assert.equal(FIELD_LIMITS.developerTake, 300);
    assert.equal(FIELD_LIMITS.stepTitle, 80);
    assert.equal(FIELD_LIMITS.stepBody, 160);
    assert.equal(FIELD_LIMITS.stepInsight, 160);
  });
});

describe("detectAiFilled", () => {
  const emptyData = {
    title: "",
    context: "",
    developer_take: "",
    execution_path: [],
    skills: [],
  };

  it("returns empty set for blank editor data", () => {
    const result = detectAiFilled(emptyData);
    assert.equal(result.size, 0);
  });

  it("detects AI-filled title", () => {
    const result = detectAiFilled({ ...emptyData, title: "Built a CLI tool" });
    assert.ok(result.has("title"));
    assert.equal(result.size, 1);
  });

  it("detects AI-filled context", () => {
    const result = detectAiFilled({ ...emptyData, context: "Needed automation" });
    assert.ok(result.has("context"));
  });

  it("detects AI-filled execution_path", () => {
    const result = detectAiFilled({
      ...emptyData,
      execution_path: [{ title: "Step 1", body: "Did X", insight: "Learned Y" }],
    });
    assert.ok(result.has("execution_path"));
  });

  it("detects AI-filled skills", () => {
    const result = detectAiFilled({ ...emptyData, skills: ["TypeScript"] });
    assert.ok(result.has("skills"));
  });

  it("detects multiple AI-filled fields", () => {
    const result = detectAiFilled({
      title: "Built auth",
      context: "Needed auth",
      developer_take: "My take is awesome",
      execution_path: [{ title: "Step", body: "Body", insight: "Insight" }],
      skills: ["React"],
    });
    assert.ok(result.has("title"));
    assert.ok(result.has("context"));
    assert.ok(result.has("execution_path"));
    assert.ok(result.has("skills"));
    assert.equal(result.size, 4);
  });

  it("never includes developer_take even when populated", () => {
    const result = detectAiFilled({
      ...emptyData,
      developer_take: "This is my human take",
    });
    assert.equal(result.has("developer_take" as any), false);
    assert.equal(result.size, 0);
  });

  it("ignores whitespace-only title", () => {
    const result = detectAiFilled({ ...emptyData, title: "   " });
    assert.equal(result.has("title"), false);
  });
});

describe("groupToolCalls", () => {
  it("returns empty array for no tool calls", () => {
    const result = groupToolCalls([]);
    assert.deepEqual(result, []);
  });

  it("groups tool calls by name with count", () => {
    const result = groupToolCalls([
      { name: "Read" },
      { name: "Edit" },
      { name: "Read" },
      { name: "Read" },
    ]);
    assert.equal(result.length, 2);
    assert.equal(result[0].name, "Read");
    assert.equal(result[0].count, 3);
    assert.equal(result[1].name, "Edit");
    assert.equal(result[1].count, 1);
  });

  it("sorts by count descending", () => {
    const result = groupToolCalls([
      { name: "Bash" },
      { name: "Read" },
      { name: "Bash" },
      { name: "Grep" },
      { name: "Bash" },
      { name: "Read" },
    ]);
    assert.equal(result[0].name, "Bash");
    assert.equal(result[0].count, 3);
    assert.equal(result[1].name, "Read");
    assert.equal(result[1].count, 2);
    assert.equal(result[2].name, "Grep");
    assert.equal(result[2].count, 1);
  });

  it("handles single tool call", () => {
    const result = groupToolCalls([{ name: "Write" }]);
    assert.equal(result.length, 1);
    assert.equal(result[0].name, "Write");
    assert.equal(result[0].count, 1);
  });
});

describe("formatTimeOffset", () => {
  it("returns empty string for empty inputs", () => {
    assert.equal(formatTimeOffset("", ""), "");
    assert.equal(formatTimeOffset("", "2026-03-18T10:00:00Z"), "");
    assert.equal(formatTimeOffset("2026-03-18T10:00:00Z", ""), "");
  });

  it("returns 0m for same timestamp", () => {
    const ts = "2026-03-18T10:00:00Z";
    assert.equal(formatTimeOffset(ts, ts), "0m");
  });

  it("returns correct minute offset", () => {
    const start = "2026-03-18T10:00:00Z";
    const current = "2026-03-18T10:05:00Z";
    assert.equal(formatTimeOffset(start, current), "5m");
  });

  it("rounds to nearest minute", () => {
    const start = "2026-03-18T10:00:00Z";
    const current = "2026-03-18T10:02:45Z";
    assert.equal(formatTimeOffset(start, current), "3m");
  });

  it("handles large offsets", () => {
    const start = "2026-03-18T10:00:00Z";
    const current = "2026-03-18T11:30:00Z";
    assert.equal(formatTimeOffset(start, current), "90m");
  });

  it("returns 0m for sub-minute offset", () => {
    const start = "2026-03-18T10:00:00Z";
    const current = "2026-03-18T10:00:25Z";
    assert.equal(formatTimeOffset(start, current), "0m");
  });
});
