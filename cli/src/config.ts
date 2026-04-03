/** Base URL for the heyiam.com app API. Override with HEYIAM_API_URL for local dev. */
const DEFAULT_API_URL = 'https://heyiam.com';
export const API_URL = process.env.HEYIAM_API_URL ?? DEFAULT_API_URL;

/** Base URL for the heyi.am public site. Override with HEYIAM_PUBLIC_URL for local dev. */
export const PUBLIC_URL = process.env.HEYIAM_PUBLIC_URL ?? 'https://heyi.am';

/** Warn once to stderr if a non-default API URL is in use (env var override). */
let _apiUrlWarned = false;
export function warnIfNonDefaultApiUrl(): void {
  if (!_apiUrlWarned && API_URL !== DEFAULT_API_URL) {
    console.warn(`[security] API_URL overridden to ${API_URL} — auth tokens will be sent to this host`);
    _apiUrlWarned = true;
  }
}
