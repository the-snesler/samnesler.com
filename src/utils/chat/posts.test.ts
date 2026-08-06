import { describe, expect, it } from 'vitest';

import { mdxToPlainText, POSTS, searchPosts, splitFrontmatter } from '@/utils/chat/posts';

describe('splitFrontmatter', () => {
  it('parses quoted values containing apostrophes', () => {
    const { data, body } = splitFrontmatter(
      ['---', 'title: Portfolio', 'excerpt: "Whether you\'re trying to build one or not"', 'isVisible: true', '---', '', 'Body text.'].join('\n')
    );
    expect(data.title).toBe('Portfolio');
    expect(data.excerpt).toBe("Whether you're trying to build one or not");
    expect(body.trim()).toBe('Body text.');
  });

  it('returns the whole input as body when there is no frontmatter', () => {
    const { data, body } = splitFrontmatter('Just prose.');
    expect(data).toEqual({});
    expect(body).toBe('Just prose.');
  });

  it('does not throw on malformed yaml', () => {
    expect(() => splitFrontmatter('---\ntitle: "unterminated\n---\nbody')).not.toThrow();
  });
});

describe('mdxToPlainText', () => {
  it('strips MDX imports and exports outside code fences', () => {
    const result = mdxToPlainText(["import Demo from './Demo.tsx';", '', 'Real prose.', '', 'export const x = 1;'].join('\n'));
    expect(result).toBe('Real prose.');
  });

  it('keeps imports and exports that live inside a code fence', () => {
    // This is the portfolio.mdx case: a tutorial *about* Astro, whose code samples are full of
    // import/export lines. Stripping by line prefix would gut the post.
    const result = mdxToPlainText(
      [
        'Here is the config:',
        '',
        '```astro',
        "import Layout from '../layouts/Layout.astro';",
        'export const collections = {};',
        '```',
        '',
        'Done.'
      ].join('\n')
    );
    expect(result).toContain("import Layout from '../layouts/Layout.astro';");
    expect(result).toContain('export const collections = {};');
    expect(result).toContain('Done.');
  });

  it('drops block-level JSX but keeps surrounding prose', () => {
    const result = mdxToPlainText(['Before.', '', '<DockerTerminal', '  command="ls"', '/>', '', 'After.'].join('\n'));
    expect(result).toContain('Before.');
    expect(result).toContain('After.');
    expect(result).not.toContain('DockerTerminal');
  });

  it('rewrites links to text plus url and images to alt text', () => {
    expect(mdxToPlainText('See [my site](https://samnesler.com).')).toBe('See my site (https://samnesler.com).');
    expect(mdxToPlainText('![a diagram](./diagram.png)')).toBe('a diagram');
  });

  it('handles tilde fences and longer backtick runs', () => {
    const result = mdxToPlainText(['~~~js', "import a from 'b';", '~~~'].join('\n'));
    expect(result).toContain("import a from 'b';");
  });
});

describe('POSTS', () => {
  it('only includes posts marked isVisible', () => {
    const slugs = POSTS.map(post => post.slug);
    expect(slugs).toContain('docker');
    // cs639-final, privacy-policy, terms-of-service and test-post are all isVisible: false.
    expect(slugs).not.toContain('cs639-final');
    expect(slugs).not.toContain('privacy-policy');
    expect(slugs).not.toContain('test-post');
  });

  it('gives every post a title, an ISO date and non-trivial text', () => {
    expect(POSTS.length).toBeGreaterThan(0);
    for (const post of POSTS) {
      expect(post.title).not.toBe('');
      expect(post.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(post.text.length).toBeGreaterThan(200);
    }
  });

  it('leaves no MDX import statements in the extracted text', () => {
    for (const post of POSTS) {
      const outsideFences = post.text
        .split(/```[\s\S]*?```/g)
        .join('\n')
        .split('\n');
      expect(outsideFences.some(line => /^import\s.+from\s+['"]/.test(line.trim()))).toBe(false);
    }
  });

  it('sorts newest first', () => {
    const dates = POSTS.map(post => post.date);
    expect([...dates].sort((a, b) => b.localeCompare(a))).toEqual(dates);
  });
});

describe('searchPosts', () => {
  it('finds a term that appears in a post body', () => {
    const hits = searchPosts('docker');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]).toHaveProperty('slug');
    expect(hits[0].excerpt.length).toBeGreaterThan(0);
  });

  it('returns nothing for a term that is not present', () => {
    expect(searchPosts('zzzznotarealterm')).toEqual([]);
  });

  it('is case insensitive', () => {
    expect(searchPosts('DOCKER').length).toBe(searchPosts('docker').length);
  });
});
