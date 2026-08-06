import { parse as parseYaml } from 'yaml';

/**
 * Blog posts for the chat agent, inlined at build time.
 *
 * Deliberately NOT `getCollection('blog')`. `astro:content` statically re-exports `renderEntry`,
 * which dynamically imports `astro:content-module-imports` — a map of every posts/*.mdx file.
 * Astro's prerender plugin propagates through dynamic imports, so pulling that into a
 * `prerender = false` route would drag docker.mdx's CodeMirror components into dist/_worker.js.
 * `?raw` sidesteps all of it: Vite bakes the source strings in and MDX compilation never runs
 * (@astrojs/mdx's vite plugin guards on `id.endsWith('.mdx')`, and this id ends in `.mdx?raw`).
 */
const RAW_POSTS = import.meta.glob<string>('/posts/*.mdx', { query: '?raw', import: 'default', eager: true });

export interface PostDoc {
  slug: string;
  title: string;
  subtitle?: string;
  excerpt?: string;
  date: string;
  text: string;
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/**
 * Frontmatter is parsed with a real YAML parser, not a regex — portfolio.mdx has a double-quoted
 * `excerpt` containing an apostrophe, and `date` is an unquoted YAML date.
 */
export function splitFrontmatter(raw: string): { data: Record<string, unknown>; body: string } {
  const match = FRONTMATTER.exec(raw);
  if (!match) return { data: {}, body: raw };
  let data: Record<string, unknown> = {};
  try {
    data = (parseYaml(match[1]) ?? {}) as Record<string, unknown>;
  } catch {
    // A malformed post shouldn't take the whole agent down; it just won't be listed.
  }
  return { data, body: raw.slice(match[0].length) };
}

/**
 * Strip MDX down to something a model can read.
 *
 * Fence tracking is the whole point here: portfolio.mdx is a tutorial *about writing Astro*, so it
 * contains `import Layout from ...`, `<Layout>` and `export const collections = {` inside ```astro
 * fences. A line-prefix stripper would gut the most useful post in the corpus. Code blocks are
 * kept — in a Docker or Astro writeup they carry most of the meaning.
 */
export function mdxToPlainText(body: string): string {
  const out: string[] = [];
  let fence: string | null = null;
  let jsxDepth = 0;

  for (const line of body.split('\n')) {
    const fenceMatch = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fenceMatch) {
      if (fence && line.trimStart().startsWith(fence)) {
        fence = null;
        out.push('```');
        continue;
      }
      if (!fence) {
        fence = fenceMatch[1];
        out.push('```');
        continue;
      }
    }
    if (fence) {
      out.push(line);
      continue;
    }

    const trimmed = line.trim();
    if (/^import\s.+from\s+['"].+['"];?$/.test(trimmed)) continue;
    if (/^export\s+(const|default|async|function)\b/.test(trimmed)) continue;
    if (/^\{\/\*/.test(trimmed) || /^<!--/.test(trimmed)) continue;

    // Block-level JSX spanning one or more lines.
    if (jsxDepth > 0 || /^<[A-Za-z]/.test(trimmed)) {
      const opens = (trimmed.match(/<[A-Za-z][^>]*?(?<!\/)>/g) ?? []).length;
      const closes = (trimmed.match(/<\/[A-Za-z][^>]*>/g) ?? []).length;
      jsxDepth = Math.max(0, jsxDepth + opens - closes);
      continue;
    }

    out.push(line);
  }

  return out
    .join('\n')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
    .replace(/<[A-Za-z][^>]*\/>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function toDateString(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'string') return value.slice(0, 10);
  return '';
}

/**
 * Built once per isolate at module scope. `isVisible: false` posts (cs639-final, the legal pages,
 * test-post) are dropped here so they can reach neither the catalog nor `read_post` — otherwise the
 * agent would discuss unpublished work and cite URLs that may not exist.
 */
export const POSTS: PostDoc[] = Object.entries(RAW_POSTS)
  .map(([path, raw]) => ({ path, ...splitFrontmatter(raw) }))
  .filter(({ data }) => data.isVisible === true && typeof data.title === 'string' && data.title.length > 0)
  .map(({ path, data, body }) => ({
    slug: path.replace(/^\/posts\//, '').replace(/\.mdx$/, ''),
    title: data.title as string,
    subtitle: typeof data.subtitle === 'string' ? data.subtitle : undefined,
    excerpt: typeof data.excerpt === 'string' ? data.excerpt : undefined,
    date: toDateString(data.date),
    text: mdxToPlainText(body)
  }))
  .sort((a, b) => b.date.localeCompare(a.date));

export function findPost(slug: string): PostDoc | undefined {
  return POSTS.find(post => post.slug === slug);
}

/** Case-insensitive substring search, returning short excerpts around each hit. */
export function searchPosts(query: string, maxHits = 5, excerptChars = 300) {
  const needle = query.toLowerCase();
  const hits: Array<{ slug: string; title: string; excerpt: string }> = [];

  for (const post of POSTS) {
    const index = post.text.toLowerCase().indexOf(needle);
    if (index === -1) continue;
    const start = Math.max(0, index - excerptChars / 3);
    hits.push({
      slug: post.slug,
      title: post.title,
      excerpt: (start > 0 ? '…' : '') + post.text.slice(start, start + excerptChars).trim() + '…'
    });
    if (hits.length >= maxHits) break;
  }

  return hits;
}
