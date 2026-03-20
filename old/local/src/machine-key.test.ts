import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, unlinkSync, readFileSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { verify, createPublicKey } from "crypto";

// We test the module's core logic by temporarily overriding the key path.
// Since the module caches and uses a hardcoded path, we'll test the functions directly.

describe("machine-key", () => {
  const testDir = join(tmpdir(), `heyi-test-${Date.now()}`);
  const testKeyPath = join(testDir, "heyi-am.key");

  before(() => {
    mkdirSync(testDir, { recursive: true });
  });

  after(() => {
    if (existsSync(testKeyPath)) unlinkSync(testKeyPath);
  });

  it("getMachineKey generates valid Ed25519 keypair", async () => {
    // Import dynamically so it doesn't interfere with the real key
    const { getMachineKey } = await import("./machine-key.js");
    const key = getMachineKey();

    // Token format: hai_<base64url>
    assert.ok(key.token.startsWith("hai_"), "Token should start with hai_");

    // Public key is valid PEM
    assert.ok(key.publicKey.includes("BEGIN PUBLIC KEY"), "Should have PEM public key");
    assert.ok(key.privateKey.includes("BEGIN PRIVATE KEY"), "Should have PEM private key");

    // Token contains 32 bytes of key data
    const encoded = key.token.slice(4); // Remove "hai_"
    const raw = Buffer.from(encoded, "base64url");
    assert.equal(raw.length, 32, "Raw public key should be 32 bytes");
  });

  it("getMachineKey returns same key on subsequent calls", async () => {
    const { getMachineKey } = await import("./machine-key.js");
    const key1 = getMachineKey();
    const key2 = getMachineKey();

    assert.equal(key1.token, key2.token, "Should return cached key");
  });

  it("signPayload produces valid Ed25519 signature", async () => {
    const { getMachineKey, signPayload } = await import("./machine-key.js");
    const key = getMachineKey();

    const payload = '{"title":"test share"}';
    const sig = signPayload(payload);

    // Verify the signature using the public key
    const pubKeyObj = createPublicKey(key.publicKey);
    const sigBuf = Buffer.from(sig, "base64url");
    const valid = verify(null, Buffer.from(payload), pubKeyObj, sigBuf);

    assert.ok(valid, "Signature should verify against the public key");
  });

  it("signPayload rejects tampered payload", async () => {
    const { getMachineKey, signPayload } = await import("./machine-key.js");
    const key = getMachineKey();

    const sig = signPayload('{"title":"original"}');
    const pubKeyObj = createPublicKey(key.publicKey);
    const sigBuf = Buffer.from(sig, "base64url");

    const valid = verify(null, Buffer.from('{"title":"tampered"}'), pubKeyObj, sigBuf);
    assert.ok(!valid, "Signature should NOT verify against tampered payload");
  });
});
