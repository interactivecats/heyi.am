/** Base URL for the heyiam.com app API. Must be set via HEYIAM_API_URL env var. */
export const API_URL = process.env.HEYIAM_API_URL ?? '';

/** Current enhancement mode: 'local' if ANTHROPIC_API_KEY is set, 'proxy' otherwise. */
export const ENHANCE_MODE: 'local' | 'proxy' = process.env.ANTHROPIC_API_KEY ? 'local' : 'proxy';
