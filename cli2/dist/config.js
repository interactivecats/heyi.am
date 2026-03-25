/** Base URL for the heyi.am Phoenix API. Set HEYIAM_API_URL in env for dev. */
export const API_URL = process.env.HEYIAM_API_URL ?? 'https://heyi.am';
/** Current enhancement mode: 'local' if ANTHROPIC_API_KEY is set, 'proxy' otherwise. */
export const ENHANCE_MODE = process.env.ANTHROPIC_API_KEY ? 'local' : 'proxy';
//# sourceMappingURL=config.js.map