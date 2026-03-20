import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  validateOptions,
  buildCardTree,
  formatStat,
  COLORS,
  WIDTH,
  HEIGHT,
} from "./og-image.js";

describe("validateOptions", () => {
  it("returns valid options unchanged", () => {
    const opts = {
      title: "Built auth with device flow",
      author: "johndoe",
      durationMinutes: 23,
      turnCount: 14,
      toolCalls: 87,
      fileCount: 12,
      skills: ["TypeScript", "Phoenix", "ed25519"],
    };
    const result = validateOptions(opts);
    assert.equal(result.title, "Built auth with device flow");
    assert.equal(result.author, "johndoe");
    assert.equal(result.durationMinutes, 23);
    assert.equal(result.turnCount, 14);
    assert.equal(result.toolCalls, 87);
    assert.equal(result.fileCount, 12);
    assert.deepEqual(result.skills, ["TypeScript", "Phoenix", "ed25519"]);
  });

  it("falls back to default title when empty", () => {
    const result = validateOptions({ title: "" });
    assert.equal(result.title, "Untitled Session");
  });

  it("falls back to default title when whitespace only", () => {
    const result = validateOptions({ title: "   " });
    assert.equal(result.title, "Untitled Session");
  });

  it("truncates long title to 120 chars", () => {
    const result = validateOptions({ title: "x".repeat(200) });
    assert.equal(result.title.length, 120);
  });

  it("truncates long author to 50 chars", () => {
    const result = validateOptions({
      title: "Test",
      author: "u".repeat(100),
    });
    assert.equal(result.author!.length, 50);
  });

  it("caps skills at 6 items", () => {
    const result = validateOptions({
      title: "Test",
      skills: ["a", "b", "c", "d", "e", "f", "g", "h"],
    });
    assert.equal(result.skills!.length, 6);
  });

  it("truncates individual skill names to 30 chars", () => {
    const result = validateOptions({
      title: "Test",
      skills: ["x".repeat(50)],
    });
    assert.equal(result.skills![0].length, 30);
  });

  it("filters out non-string skills", () => {
    const result = validateOptions({
      title: "Test",
      skills: ["valid", "", "  ", 42 as any, null as any, "also-valid"],
    });
    assert.deepEqual(result.skills, ["valid", "also-valid"]);
  });

  it("ignores negative numbers for stats", () => {
    const result = validateOptions({
      title: "Test",
      durationMinutes: -5,
      turnCount: 0,
      toolCalls: -1,
      fileCount: 0,
    });
    assert.equal(result.durationMinutes, undefined);
    assert.equal(result.turnCount, undefined);
    assert.equal(result.toolCalls, undefined);
    assert.equal(result.fileCount, undefined);
  });

  it("rounds fractional numbers", () => {
    const result = validateOptions({
      title: "Test",
      durationMinutes: 23.7,
      turnCount: 14.2,
    });
    assert.equal(result.durationMinutes, 24);
    assert.equal(result.turnCount, 14);
  });
});

describe("formatStat", () => {
  it("returns raw number for small values", () => {
    assert.equal(formatStat(0), "0");
    assert.equal(formatStat(5), "5");
    assert.equal(formatStat(999), "999");
  });

  it("formats thousands with k suffix", () => {
    assert.equal(formatStat(1000), "1.0k");
    assert.equal(formatStat(1500), "1.5k");
    assert.equal(formatStat(12345), "12.3k");
  });
});

describe("buildCardTree", () => {
  it("builds a tree with correct root dimensions", () => {
    const tree = buildCardTree({ title: "Test" });
    assert.equal(tree.type, "div");
    const style = tree.props.style as Record<string, unknown>;
    assert.equal(style.width, "100%");
    assert.equal(style.height, "100%");
    assert.equal(style.backgroundColor, COLORS.bg);
  });

  it("includes stats when provided", () => {
    const tree = buildCardTree({
      title: "Test",
      durationMinutes: 23,
      turnCount: 14,
    });
    // The tree should have children that contain stat chips
    const json = JSON.stringify(tree);
    assert.ok(json.includes("23"));
    assert.ok(json.includes("14"));
    assert.ok(json.includes("min"));
    assert.ok(json.includes("turns"));
  });

  it("includes skills when provided", () => {
    const tree = buildCardTree({
      title: "Test",
      skills: ["TypeScript", "Phoenix"],
    });
    const json = JSON.stringify(tree);
    assert.ok(json.includes("TypeScript"));
    assert.ok(json.includes("Phoenix"));
  });

  it("includes author when provided", () => {
    const tree = buildCardTree({
      title: "Test",
      author: "johndoe",
    });
    const json = JSON.stringify(tree);
    assert.ok(json.includes("@johndoe"));
  });

  it("uses smaller font for long titles", () => {
    const shortTree = buildCardTree({ title: "Short" });
    const longTree = buildCardTree({ title: "x".repeat(70) });

    // Find the h1 in children
    const getH1FontSize = (tree: any): string => {
      const json = JSON.stringify(tree);
      const match = json.match(/"fontSize":"?(\d+)px"?/);
      return match ? match[1] : "";
    };

    // Short title should use 40px, long should use 32px
    const shortJson = JSON.stringify(shortTree);
    const longJson = JSON.stringify(longTree);
    assert.ok(shortJson.includes('"fontSize":"40px"') || shortJson.includes('"fontSize":40'));
    assert.ok(longJson.includes('"fontSize":"32px"') || longJson.includes('"fontSize":32'));
  });

  it("always includes the gradient line", () => {
    const tree = buildCardTree({ title: "Test" });
    const json = JSON.stringify(tree);
    assert.ok(json.includes("linear-gradient"));
    assert.ok(json.includes(COLORS.violet));
    assert.ok(json.includes(COLORS.rose));
    assert.ok(json.includes(COLORS.teal));
  });
});

describe("design constants", () => {
  it("card is 1200x630 (standard og:image)", () => {
    assert.equal(WIDTH, 1200);
    assert.equal(HEIGHT, 630);
  });

  it("uses correct brand colors", () => {
    assert.equal(COLORS.bg, "#FEFDFB");
    assert.equal(COLORS.ink, "#18151E");
    assert.equal(COLORS.gray, "#6B667A");
    assert.equal(COLORS.violet, "#7C5CFC");
    assert.equal(COLORS.rose, "#F9507A");
    assert.equal(COLORS.teal, "#06B6A0");
  });
});
