// Shared fetch utility for React islands on the project page.
// All islands share one fetch per project — deduplicated via a cache.

const cache = new Map<string, Promise<any>>();

export async function fetchProjectSessions(username: string, slug: string): Promise<any[]> {
  const key = `${username}/${slug}`;

  if (!cache.has(key)) {
    const promise = fetch(`/api/projects/${encodeURIComponent(username)}/${encodeURIComponent(slug)}/sessions-data`)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(data => data.sessions || []);

    cache.set(key, promise);
  }

  return cache.get(key)!;
}

export async function fetchSessionData(token: string): Promise<any> {
  const res = await fetch(`/api/sessions/${encodeURIComponent(token)}/data`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
