import { generateKeyPairSync, sign, verify, createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
const CONFIG_DIR = join(homedir(), '.config', 'heyiam');
const KEY_FILE = 'machine-key.json';
export function generateKeyPair() {
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
export function loadOrCreateKeyPair(configDir = CONFIG_DIR) {
    const keyPath = join(configDir, KEY_FILE);
    if (existsSync(keyPath)) {
        const raw = readFileSync(keyPath, 'utf-8');
        return JSON.parse(raw);
    }
    const keyPair = generateKeyPair();
    mkdirSync(configDir, { recursive: true });
    writeFileSync(keyPath, JSON.stringify(keyPair, null, 2), { mode: 0o600 });
    return keyPair;
}
export function signPayload(payload, privateKeyBase64) {
    const privateKeyDer = Buffer.from(privateKeyBase64, 'base64');
    const keyObject = createPrivateKeyFromDer(privateKeyDer);
    const signature = sign(null, Buffer.from(payload, 'utf-8'), keyObject);
    return signature.toString('base64');
}
export function verifySignature(payload, signatureBase64, publicKeyBase64) {
    const publicKeyDer = Buffer.from(publicKeyBase64, 'base64');
    const keyObject = createPublicKeyFromDer(publicKeyDer);
    return verify(null, Buffer.from(payload, 'utf-8'), keyObject, Buffer.from(signatureBase64, 'base64'));
}
export function getFingerprint(publicKeyBase64) {
    const hash = createHash('sha256').update(Buffer.from(publicKeyBase64, 'base64')).digest('hex');
    // Format as colon-separated pairs for display
    return hash.match(/.{2}/g).join(':');
}
function createPrivateKeyFromDer(der) {
    return { key: der, format: 'der', type: 'pkcs8' };
}
function createPublicKeyFromDer(der) {
    return { key: der, format: 'der', type: 'spki' };
}
//# sourceMappingURL=machine-key.js.map