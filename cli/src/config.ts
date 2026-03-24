/** Base URL for the heyiam.com app API. Set HEYIAM_API_URL in env for dev (e.g. http://localhost:4001). */
export const API_URL = process.env.HEYIAM_API_URL ?? 'https://heyiam.com';

/** Current enhancement mode: 'local' if ANTHROPIC_API_KEY is set, 'proxy' otherwise. */
export const ENHANCE_MODE: 'local' | 'proxy' = process.env.ANTHROPIC_API_KEY ? 'local' : 'proxy';
