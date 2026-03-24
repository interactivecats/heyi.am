const SHARE_URL = process.env.VIBE_API_URL
    ? `${process.env.VIBE_API_URL}/api/vibes`
    : "https://heyi.am/api/vibes";
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
                stats,
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
        if (!res.ok)
            return null;
        return (await res.json());
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=share.js.map