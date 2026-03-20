import { generateKeyPairSync, sign, verify, createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export interface MachineKeyPair {
  publicKey: string;   // base64-encoded raw Ed25519 public key
  privateKey: string;  // base64-encoded raw Ed25519 private key
  createdAt: string;   // ISO 8601
}

const CONFIG_DIR = join(homedir(), '.config', 'heyiam');
const KEY_FILE = 'machine-key.json';

export function generateKeyPair(): MachineKeyPair {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'der' },
  });

  return {
    publicKey: publicKey.toString('base64'),
    privateKey: privateKey.toString('base64'),
    createdAt: new Date().toISOString(),
  };
}

export function loadOrCreateKeyPair(configDir: string = CONFIG_DIR): MachineKeyPair {
  const keyPath = join(configDir, KEY_FILE);

  if (existsSync(keyPath)) {
    const raw = readFileSync(keyPath, 'utf-8');
    return JSON.parse(raw) as MachineKeyPair;
  }

  const keyPair = generateKeyPair();
  mkdirSync(configDir, { recursive: true });
  writeFileSync(keyPath, JSON.stringify(keyPair, null, 2), { mode: 0o600 });
  return keyPair;
}

export function signPayload(payload: string, privateKeyBase64: string): string {
  const privateKeyDer = Buffer.from(privateKeyBase64, 'base64');
  const keyObject = createPrivateKeyFromDer(privateKeyDer);
  const signature = sign(null, Buffer.from(payload, 'utf-8'), keyObject);
  return signature.toString('base64');
}

export function verifySignature(payload: string, signatureBase64: string, publicKeyBase64: string): boolean {
  const publicKeyDer = Buffer.from(publicKeyBase64, 'base64');
  const keyObject = createPublicKeyFromDer(publicKeyDer);
  return verify(null, Buffer.from(payload, 'utf-8'), keyObject, Buffer.from(signatureBase64, 'base64'));
}

export function getFingerprint(publicKeyBase64: string): string {
  const hash = createHash('sha256').update(Buffer.from(publicKeyBase64, 'base64')).digest('hex');
  // Format as colon-separated pairs for display
  return hash.match(/.{2}/g)!.join(':');
}

function createPrivateKeyFromDer(der: Buffer) {
  return { key: der, format: 'der' as const, type: 'pkcs8' as const };
}

function createPublicKeyFromDer(der: Buffer) {
  return { key: der, format: 'der' as const, type: 'spki' as const };
}
