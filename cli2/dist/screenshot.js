import { execFile } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, platform } from 'node:os';
const SCREENSHOTS_DIR = join(homedir(), '.config', 'heyiam', 'screenshots');
/** Known Chrome binary paths by platform */
const CHROME_PATHS = {
    darwin: [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
        '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
    ],
    linux: [
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/snap/bin/chromium',
    ],
    win32: [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    ],
};
/**
 * Find the first available Chrome binary on the system.
 * Returns the path or null if not found.
 */
export function findChrome() {
    const paths = CHROME_PATHS[platform()] ?? [];
    for (const p of paths) {
        if (existsSync(p))
            return p;
    }
    return null;
}
/**
 * Capture a screenshot of a URL using headless Chrome.
 * Returns the local file path on success, or null if Chrome is unavailable or capture fails.
 */
export async function captureScreenshot(url, slug) {
    const chrome = findChrome();
    if (!chrome)
        return null;
    mkdirSync(SCREENSHOTS_DIR, { recursive: true });
    const outPath = join(SCREENSHOTS_DIR, `${slug}.png`);
    try {
        await new Promise((resolve, reject) => {
            execFile(chrome, [
                '--headless=new',
                '--disable-gpu',
                '--no-sandbox',
                '--disable-software-rasterizer',
                `--screenshot=${outPath}`,
                '--window-size=1280,800',
                '--hide-scrollbars',
                '--disable-extensions',
                '--disable-background-networking',
                '--disable-sync',
                '--disable-translate',
                '--disable-default-apps',
                '--mute-audio',
                '--no-first-run',
                url,
            ], { timeout: 30_000 }, (err) => {
                if (err)
                    reject(err);
                else
                    resolve();
            });
        });
        if (existsSync(outPath))
            return outPath;
        return null;
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=screenshot.js.map