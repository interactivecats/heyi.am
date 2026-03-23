// Shared fetch utility for React islands on the project page.
// All islands share one fetch per project — deduplicated via a cache.

const cache = new Map<string, Promise<any>>();

/** Convert snake_case keys to camelCase, recursively */
function camelizeKeys(obj: any): any {
  if (Array.isArray(obj)) return obj.map(camelizeKeys);
  if (obj !== null && typeof obj === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(obj)) {
      const camel = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
      out[camel] = camelizeKeys(v);
    }
    return out;
  }
  return obj;
}

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
  const data = await res.json();
  return camelizeKeys(data);
}
