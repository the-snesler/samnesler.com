/**
 * Reference documents the agent can read, stored in the DOCS R2 bucket.
 *
 * The bucket holds an `index.json` catalog plus the documents themselves. The catalog is
 * hand-maintained and uploaded with `wrangler r2 object put` — see AGENTS.md.
 */

const INDEX_KEY = 'index.json';
const INDEX_TTL_MS = 5 * 60_000;
const MAX_DOC_BYTES = 16 * 1024;
export const MAX_DOC_CHARS = 8_000;

export interface DocEntry {
  slug: string;
  title: string;
  summary: string;
  /**
   * The R2 object key. Kept separate from `slug` on purpose: the slug the model supplies is only
   * ever a lookup into this allowlist, never a component of a key. That makes path traversal
   * impossible by construction rather than by regex.
   */
  key: string;
}

interface DocIndexFile {
  version?: number;
  documents?: unknown;
}

let cache: { at: number; docs: DocEntry[] } | null = null;
let inflight: Promise<DocEntry[]> | null = null;

function isDocEntry(value: unknown): value is DocEntry {
  const doc = value as Partial<DocEntry> | null;
  return !!doc && typeof doc.slug === 'string' && typeof doc.key === 'string' && typeof doc.title === 'string';
}

/**
 * Module scope is per-isolate, so this is a safe cache. Concurrent requests within one isolate
 * share the in-flight promise rather than each issuing their own R2 GET.
 */
export async function loadDocIndex(bucket: Env['DOCS'] | undefined): Promise<DocEntry[]> {
  if (!bucket) return [];
  if (cache && Date.now() - cache.at < INDEX_TTL_MS) return cache.docs;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const object = await bucket.get(INDEX_KEY);
      if (!object) return [];
      const parsed = JSON.parse(await object.text()) as DocIndexFile;
      const docs = Array.isArray(parsed.documents) ? parsed.documents.filter(isDocEntry) : [];
      cache = { at: Date.now(), docs };
      return docs;
    } catch (error) {
      console.error('[chat] doc index load failed', error);
      // Serve stale rather than nothing — an R2 blip shouldn't make the agent forget its documents
      // in the middle of a conversation.
      return cache?.docs ?? [];
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

export interface DocResult {
  slug: string;
  title: string;
  truncated: boolean;
  content: string;
}

export async function readDoc(bucket: Env['DOCS'] | undefined, slug: string): Promise<DocResult | { error: string }> {
  if (!bucket) return { error: 'Document storage is unavailable.' };

  // Cheap early rejection. The real defense is the allowlist lookup below.
  if (!SLUG_RE.test(slug)) {
    return { error: 'Invalid slug. Use list_documents to get valid slugs.' };
  }

  const docs = await loadDocIndex(bucket);
  const entry = docs.find(doc => doc.slug === slug);
  if (!entry) {
    return { error: `No document "${slug}". Available: ${docs.map(doc => doc.slug).join(', ') || 'none'}` };
  }

  // Defense in depth: index.json is hand-maintained, so guard against a typo in it too.
  if (entry.key.includes('..') || entry.key.startsWith('/')) {
    console.error('[chat] rejected suspicious index key', entry.key);
    return { error: 'Document unavailable.' };
  }

  const object = await bucket.get(entry.key);
  if (!object) return { error: `Document "${slug}" is listed but missing from storage.` };

  // Check size before materializing the body — a large object would otherwise land in an isolate
  // with a 128 MB ceiling.
  if (object.size > MAX_DOC_BYTES) {
    const head = await bucket.get(entry.key, { range: { offset: 0, length: MAX_DOC_BYTES } });
    const text = head ? (await head.text()).slice(0, MAX_DOC_CHARS) : '';
    return { slug, title: entry.title, truncated: true, content: text };
  }

  const raw = await object.text();
  const content = raw.slice(0, MAX_DOC_CHARS);
  return { slug, title: entry.title, truncated: content.length < raw.length, content };
}
