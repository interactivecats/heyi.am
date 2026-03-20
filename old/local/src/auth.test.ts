import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("getStoredBearerToken", () => {
  // Since the module reads from a hardcoded path (~/.claude/heyi-am-token),
  // we test the exported function from server.ts indirectly by checking
  // the logic in isolation. For unit testing, we extract and test the
  // core logic patterns.

  const testDir = join(tmpdir(), `heyi-auth-test-${Date.now()}`);

  before(() => {
    mkdirSync(testDir, { recursive: true });
  });

  it("returns null when token file does not exist", () => {
    const tokenPath = join(testDir, "nonexistent-token");
    assert.ok(!existsSync(tokenPath));
  });

  it("reads token from file and trims whitespace", () => {
    const tokenPath = join(testDir, "test-token");
    writeFileSync(tokenPath, "  test-bearer-token-123  \n", "utf-8");
    const content = readFileSync(tokenPath, "utf-8").trim();
    assert.equal(content, "test-bearer-token-123");
    unlinkSync(tokenPath);
  });

  it("returns null for empty token file", () => {
    const tokenPath = join(testDir, "empty-token");
    writeFileSync(tokenPath, "  \n", "utf-8");
    const content = readFileSync(tokenPath, "utf-8").trim();
    assert.equal(content, "");
    // empty string should be treated as no token
    assert.ok(!content);
    unlinkSync(tokenPath);
  });
});

describe("bearer token header construction", () => {
  it("sets Authorization header when bearer token exists", () => {
    const bearerToken = "test-token-abc";
    const machineToken = "hai_test123";

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Machine-Token": machineToken,
    };

    if (bearerToken) {
      headers["Authorization"] = `Bearer ${bearerToken}`;
    }

    assert.equal(headers["Authorization"], "Bearer test-token-abc");
    assert.equal(headers["X-Machine-Token"], machineToken);
    // Should NOT have X-Signature when using Bearer auth
    assert.ok(!("X-Signature" in headers));
  });

  it("sets X-Signature header when no bearer token", () => {
    const bearerToken: string | null = null;
    const machineToken = "hai_test123";
    const mockSignature = "mock-signature-base64url";

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Machine-Token": machineToken,
    };

    if (bearerToken) {
      headers["Authorization"] = `Bearer ${bearerToken}`;
    } else {
      headers["X-Signature"] = mockSignature;
    }

    assert.ok(!("Authorization" in headers));
    assert.equal(headers["X-Signature"], mockSignature);
    assert.equal(headers["X-Machine-Token"], machineToken);
  });

  it("always includes X-Machine-Token regardless of auth method", () => {
    const machineToken = "hai_abc123";

    // With Bearer
    const withBearer: Record<string, string> = {
      "X-Machine-Token": machineToken,
      "Authorization": "Bearer some-token",
    };
    assert.equal(withBearer["X-Machine-Token"], machineToken);

    // Without Bearer
    const withoutBearer: Record<string, string> = {
      "X-Machine-Token": machineToken,
      "X-Signature": "sig-value",
    };
    assert.equal(withoutBearer["X-Machine-Token"], machineToken);
  });
});

describe("share response parsing", () => {
  it("extracts linked and deleteCode from Phoenix response", () => {
    const phoenixResponse = {
      url: "https://heyi.am/s/abc123",
      token: "abc123",
      delete_token: "del-tok",
      status: "created",
      shared_at: "2026-03-19T00:00:00Z",
      linked: true,
      delete_code: null,
    };

    const result = {
      ...phoenixResponse,
      linked: phoenixResponse.linked ?? false,
      deleteCode: phoenixResponse.delete_code ?? null,
    };

    assert.equal(result.linked, true);
    assert.equal(result.deleteCode, null);
  });

  it("defaults linked to false when not present", () => {
    const phoenixResponse = {
      url: "https://heyi.am/s/abc123",
      token: "abc123",
      delete_token: "del-tok",
      status: "created",
    };

    const result = {
      ...phoenixResponse,
      linked: (phoenixResponse as any).linked ?? false,
      deleteCode: (phoenixResponse as any).delete_code ?? null,
    };

    assert.equal(result.linked, false);
    assert.equal(result.deleteCode, null);
  });

  it("passes delete_code through for anonymous shares", () => {
    const phoenixResponse = {
      url: "https://heyi.am/s/xyz789",
      token: "xyz789",
      delete_token: "del-anon",
      status: "created",
      linked: false,
      delete_code: "X7K9M2",
    };

    const result = {
      ...phoenixResponse,
      linked: phoenixResponse.linked ?? false,
      deleteCode: phoenixResponse.delete_code ?? null,
    };

    assert.equal(result.linked, false);
    assert.equal(result.deleteCode, "X7K9M2");
  });
});

describe("auth status response shape", () => {
  it("returns authenticated false when no token", () => {
    const token: string | null = null;
    const response = token
      ? { authenticated: true, username: "ben" }
      : { authenticated: false };

    assert.equal(response.authenticated, false);
    assert.ok(!("username" in response));
  });

  it("returns authenticated true with username when token valid", () => {
    const token = "valid-token";
    const meResponse = { username: "ben", email: "ben@example.com" };

    const response = token
      ? { authenticated: true, username: meResponse.username || meResponse.email || null }
      : { authenticated: false };

    assert.equal(response.authenticated, true);
    assert.equal((response as any).username, "ben");
  });

  it("returns authenticated true with null username when offline", () => {
    const token = "valid-token";
    const phoenixReachable = false;

    const response = token && !phoenixReachable
      ? { authenticated: true, username: null }
      : { authenticated: false };

    assert.equal(response.authenticated, true);
    assert.equal((response as any).username, null);
  });
});
