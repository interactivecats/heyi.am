import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { detectProjectDisplayName } from "./parser.js";

describe("detectProjectDisplayName", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "parser-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("reads name from package.json", () => {
    writeFileSync(join(tmpDir, "package.json"), JSON.stringify({ name: "heyi-am" }));
    assert.equal(detectProjectDisplayName(tmpDir), "heyi-am");
  });

  it("reads name from Cargo.toml", () => {
    writeFileSync(join(tmpDir, "Cargo.toml"), '[package]\nname = "my-crate"\nversion = "0.1.0"');
    assert.equal(detectProjectDisplayName(tmpDir), "my-crate");
  });

  it("reads name from pyproject.toml", () => {
    writeFileSync(join(tmpDir, "pyproject.toml"), '[project]\nname = "my-package"');
    assert.equal(detectProjectDisplayName(tmpDir), "my-package");
  });

  it("reads module name from go.mod", () => {
    writeFileSync(join(tmpDir, "go.mod"), "module github.com/user/api-gateway\n\ngo 1.21");
    assert.equal(detectProjectDisplayName(tmpDir), "api-gateway");
  });

  it("falls back to last path segment when no manifest", () => {
    const name = detectProjectDisplayName(tmpDir);
    // tmpDir ends with a random suffix, but basename should be the dir name
    assert.ok(name.length > 0);
    assert.ok(!name.includes("/"));
  });

  it("prefers package.json over other manifests", () => {
    writeFileSync(join(tmpDir, "package.json"), JSON.stringify({ name: "from-npm" }));
    writeFileSync(join(tmpDir, "Cargo.toml"), '[package]\nname = "from-cargo"');
    assert.equal(detectProjectDisplayName(tmpDir), "from-npm");
  });

  it("skips package.json if name field is missing", () => {
    writeFileSync(join(tmpDir, "package.json"), JSON.stringify({ version: "1.0" }));
    const name = detectProjectDisplayName(tmpDir);
    // Should fall back to directory basename, not crash
    assert.ok(name.length > 0);
    assert.notEqual(name, "undefined");
  });

  it("handles malformed package.json gracefully", () => {
    writeFileSync(join(tmpDir, "package.json"), "not json{{{");
    const name = detectProjectDisplayName(tmpDir);
    assert.ok(name.length > 0);
  });
});
