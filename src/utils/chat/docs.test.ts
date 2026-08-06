import { beforeEach, describe, expect, it, vi } from 'vitest';

import { loadDocIndex, readDoc } from '@/utils/chat/docs';

const INDEX = {
  version: 1,
  documents: [
    { slug: 'resume', title: 'Résumé', summary: 'Work history.', key: 'docs/resume.md' },
    { slug: 'notes', title: 'Notes', summary: 'Misc.', key: 'docs/notes.md' }
  ]
};

/** Minimal stand-in for the bits of R2Bucket that docs.ts touches. */
function fakeBucket(objects: Record<string, string>) {
  return {
    get: vi.fn(async (key: string, options?: { range?: { offset: number; length: number } }) => {
      const body = objects[key];
      if (body === undefined) return null;
      const sliced = options?.range ? body.slice(options.range.offset, options.range.offset + options.range.length) : body;
      return { size: body.length, text: async () => sliced };
    })
  } as unknown as Env['DOCS'];
}

beforeEach(() => {
  // loadDocIndex memoizes at module scope; advance past the 5 minute TTL between tests.
  vi.useFakeTimers();
  vi.setSystemTime(Date.now() + 10 * 60_000);
});

describe('loadDocIndex', () => {
  it('returns [] when there is no binding', async () => {
    expect(await loadDocIndex(undefined)).toEqual([]);
  });

  it('parses the documents array', async () => {
    const docs = await loadDocIndex(fakeBucket({ 'index.json': JSON.stringify(INDEX) }));
    expect(docs.map(doc => doc.slug)).toEqual(['resume', 'notes']);
  });

  it('drops malformed entries rather than failing wholesale', async () => {
    vi.setSystemTime(Date.now() + 10 * 60_000);
    const docs = await loadDocIndex(
      fakeBucket({ 'index.json': JSON.stringify({ documents: [{ slug: 'ok', title: 'T', summary: 's', key: 'k' }, { slug: 'no-key' }, null] }) })
    );
    expect(docs.map(doc => doc.slug)).toEqual(['ok']);
  });

  it('survives invalid json', async () => {
    vi.setSystemTime(Date.now() + 10 * 60_000);
    await expect(loadDocIndex(fakeBucket({ 'index.json': '{not json' }))).resolves.toEqual(expect.any(Array));
  });
});

describe('readDoc', () => {
  const bucket = () =>
    fakeBucket({
      'index.json': JSON.stringify(INDEX),
      'docs/resume.md': 'Sam Nesler, software developer.',
      'docs/notes.md': 'x'.repeat(20_000),
      'secrets.md': 'should never be reachable'
    });

  it('reads a document listed in the index', async () => {
    const result = await readDoc(bucket(), 'resume');
    expect(result).toMatchObject({ slug: 'resume', title: 'Résumé', truncated: false });
    expect((result as { content: string }).content).toContain('software developer');
  });

  it.each(['../secrets', '../../etc/passwd', '/secrets', 'docs/resume', 'resume%2e%2e', 'RESUME', ''])(
    'rejects the traversal-shaped slug %j',
    async slug => {
      vi.setSystemTime(Date.now() + 10 * 60_000);
      expect(await readDoc(bucket(), slug)).toHaveProperty('error');
    }
  );

  it('refuses a well-formed slug that is not in the index', async () => {
    vi.setSystemTime(Date.now() + 10 * 60_000);
    const result = await readDoc(bucket(), 'secrets');
    expect(result).toHaveProperty('error');
    expect((result as { error: string }).error).toContain('No document');
  });

  it('truncates an oversized document and says so', async () => {
    vi.setSystemTime(Date.now() + 10 * 60_000);
    const result = (await readDoc(bucket(), 'notes')) as { truncated: boolean; content: string };
    expect(result.truncated).toBe(true);
    expect(result.content.length).toBeLessThanOrEqual(8_000);
  });

  it('reports a listed document that is missing from storage', async () => {
    vi.setSystemTime(Date.now() + 10 * 60_000);
    const result = await readDoc(fakeBucket({ 'index.json': JSON.stringify(INDEX) }), 'resume');
    expect((result as { error: string }).error).toContain('missing from storage');
  });

  it('returns an error when there is no binding', async () => {
    expect(await readDoc(undefined, 'resume')).toHaveProperty('error');
  });
});
