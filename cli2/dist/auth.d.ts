export interface AuthConfig {
    token: string;
    username: string;
    savedAt: string;
}
export interface DeviceCodeResponse {
    device_code: string;
    user_code: string;
    verification_uri: string;
    expires_in: number;
    interval: number;
}
export interface PublishPayload {
    session: unknown;
    signature: string;
    publicKey: string;
}
export declare function ensureConfigDir(configDir?: string): void;
export declare function readConfig<T>(filename: string, configDir?: string): T | null;
export declare function writeConfig(filename: string, data: unknown, configDir?: string): void;
export declare function getAuthToken(configDir?: string): AuthConfig | null;
export declare function deleteAuthToken(configDir?: string): void;
export declare function saveAuthToken(token: string, username: string, configDir?: string): void;
export declare function checkAuthStatus(apiBaseUrl: string, configDir?: string, fetchFn?: typeof fetch): Promise<{
    authenticated: boolean;
    username?: string;
}>;
export declare function deviceAuthFlow(apiBaseUrl: string, configDir?: string, options?: {
    fetchFn?: typeof fetch;
    openBrowser?: (url: string) => Promise<void>;
    onUserCode?: (code: string, verificationUri: string) => void;
    pollIntervalMs?: number;
}): Promise<AuthConfig>;
export declare function buildPublishPayload(session: unknown, signature: string, publicKey: string): PublishPayload;
