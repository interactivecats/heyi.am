import type { VibeStats } from "./types.js";
import type { ArchetypeMatch } from "./archetypes.js";
import { SOURCE_DISPLAY_NAMES } from "./parsers/types.js";

const NARRATIVE_URL = "https://howdoyouvibe.com/api/vibes/narrative";

/**
 * Fetch a 2-sentence narrative from the server (Gemini Flash).
 * Falls back to a simple template if the server is unreachable.
 */
export async function fetchNarrative(
  stats: VibeStats,
  match: ArchetypeMatch,
): Promise<string> {
  try {
    const res = await fetch(NARRATIVE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stats,
        archetype_id: match.primary.id,
        modifier_id: match.modifier?.id ?? null,
      }),
      signal: AbortSignal.timeout(5000),
    });

    if (res.ok) {
      const data = (await res.json()) as { narrative?: string };
      if (data.narrative) return data.narrative;
    }
  } catch {
    // Server unreachable — fall through to template
  }

  return templateNarrative(stats, match);
}

/**
 * Simple template fallback when server is unreachable.
 */
export function templateNarrative(
  stats: VibeStats,
  match: ArchetypeMatch,
): string {
  const names = stats.sources.map((s) => SOURCE_DISPLAY_NAMES[s] ?? s);
  const sources = names.length <= 2
    ? names.join(" and ")
    : `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
  return `${match.primary.tagline} ${stats.session_count} sessions across ${sources}.`;
}
