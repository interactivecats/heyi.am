export interface MachineKeyPair {
    publicKey: string;
    privateKey: string;
    createdAt: string;
}
export declare function generateKeyPair(): MachineKeyPair;
export declare function loadOrCreateKeyPair(configDir?: string): MachineKeyPair;
export declare function signPayload(payload: string, privateKeyBase64: string): string;
export declare function verifySignature(payload: string, signatureBase64: string, publicKeyBase64: string): boolean;
export declare function getFingerprint(publicKeyBase64: string): string;
