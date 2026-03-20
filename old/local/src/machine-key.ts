/**
 * Machine-level Ed25519 key for authenticating shares with heyi.am.
 * Inspired by teamrc's approach: each machine gets its own keypair,
 * the public key is the identity, requests are signed with the private key.
 */

import { generateKeyPairSync, sign, createPublicKey, createPrivateKey } from "crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync, chmodSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const KEY_PATH = join(homedir(), ".claude", "heyi-am.key");

interface MachineKey {
  publicKey: string;   // PEM-encoded Ed25519 public key
  privateKey: string;  // PEM-encoded Ed25519 private key
  token: string;       // hai_<base64url(raw-public-key-bytes)>
}

let cached: MachineKey | null = null;

/**
 * Load or generate the machine's Ed25519 keypair.
 * Stored at ~/.claude/heyi-am.key with 0600 permissions.
 */
export function getMachineKey(): MachineKey {
  if (cached) return cached;

  if (existsSync(KEY_PATH)) {
    try {
      const data = JSON.parse(readFileSync(KEY_PATH, "utf-8"));
      if (data.publicKey && data.privateKey && data.token) {
        cached = data as MachineKey;
        return cached;
      }
    } catch {
      // Corrupt key file — fall through to regenerate
    }
  }

  // Generate new keypair
  const { publicKey, privateKey } = generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

  // Extract raw 32-byte public key for the token
  const pubKeyObj = createPublicKey(publicKey);
  const rawPubKey = pubKeyObj.export({ type: "spki", format: "der" });
  // Ed25519 SPKI DER is 44 bytes: 12-byte header + 32-byte key
  const rawBytes = rawPubKey.subarray(12);
  const token = `hai_${Buffer.from(rawBytes).toString("base64url")}`;

  const key: MachineKey = { publicKey, privateKey, token };

  // Ensure directory exists
  const dir = join(homedir(), ".claude");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  writeFileSync(KEY_PATH, JSON.stringify(key, null, 2), "utf-8");
  chmodSync(KEY_PATH, 0o600);

  cached = key;
  return key;
}

/**
 * Sign a payload string with the machine's private key.
 * Returns base64url-encoded Ed25519 signature.
 */
export function signPayload(payload: string): string {
  const { privateKey } = getMachineKey();
  const privKeyObj = createPrivateKey(privateKey);
  const signature = sign(null, Buffer.from(payload), privKeyObj);
  return signature.toString("base64url");
}
