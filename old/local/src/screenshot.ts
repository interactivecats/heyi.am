/**
 * Step 8: URL Screenshot Feature
 * Captures a screenshot of a URL using Puppeteer.
 * Used for hero images on share pages.
 */

import { existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const CACHE_DIR = join(homedir(), ".claude", "ccs-screenshots");

/**
 * Capture a screenshot of a URL and return the file path.
 * Caches screenshots by URL hash to avoid re-capturing.
 */
export async function captureScreenshot(url: string): Promise<string> {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });

  // Hash the URL for cache key
  const { createHash } = await import("crypto");
  const hash = createHash("sha256").update(url).digest("hex").slice(0, 16);
  const filePath = join(CACHE_DIR, `${hash}.png`);

  if (existsSync(filePath)) return filePath;

  // Dynamic import — puppeteer is optional
  let puppeteer: any;
  try {
    puppeteer = await import("puppeteer");
  } catch {
    throw new Error(
      "Puppeteer is required for screenshots. Install it with: npm install puppeteer"
    );
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
    await page.screenshot({ path: filePath, type: "png" });
    return filePath;
  } finally {
    await browser.close();
  }
}
