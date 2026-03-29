import { formatRetryWait } from "./utils.js";
const SHARE_URL = process.env.VIBE_API_URL
    ? `${process.env.VIBE_API_URL}/api/vibes`
    : "https://howdoyouvibe.com/api/vibes";
/**
 * POST computed vibe stats to the server. Returns share URLs on success.
 * Only computed stats leave the machine — never raw session text.
 */
export async function shareVibe(stats, match, headline, narrative) {
    try {
        const res = await fetch(SHARE_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                stats: Object.fromEntries(Object.entries(stats).filter(([, v]) => typeof v === "number")),
                archetype_id: match.primary.id,
                modifier_id: match.modifier?.id ?? null,
                headline,
                narrative,
                sources: stats.sources,
                session_count: stats.session_count,
                total_turns: stats.total_turns,
            }),
            signal: AbortSignal.timeout(10000),
        });
        if (res.status === 429) {
            const retryAfter = res.headers.get("retry-after");
            const wait = retryAfter ? formatRetryWait(Number(retryAfter)) : "later";
            console.log(`\n  Rate limited — try again in ${wait}.`);
            return null;
        }
        if (!res.ok)
            return null;
        return (await res.json());
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=share.js.map