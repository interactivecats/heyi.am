/**
 * Find the first available Chrome binary on the system.
 * Returns the path or null if not found.
 */
export declare function findChrome(): string | null;
/**
 * Capture a screenshot of a URL using headless Chrome.
 * Returns the local file path on success, or null if Chrome is unavailable or capture fails.
 */
export declare function captureScreenshot(url: string, slug: string): Promise<string | null>;
