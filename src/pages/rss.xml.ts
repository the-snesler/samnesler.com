import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import sanitizeHtml from 'sanitize-html';
import MarkdownIt from 'markdown-it';
import type { APIContext } from 'astro';
import { SITE_DESCRIPTION, SITE_TITLE } from '@/consts';
const parser = new MarkdownIt();

export async function GET(context: APIContext) {
  const blog = await getCollection('blog');
  const posts = await getCollection('blog');
  const sortedPosts = posts.filter(p => p.data.isVisible).sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
  return rss({
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    site: context.site as URL,
    items: sortedPosts.map((post) => ({
      link: `/blog/${post.id}/`,
      // Note: this will not process components or JSX expressions in MDX files.
      content: sanitizeHtml(parser.render(post.body), {
        allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img'])
      }),
      ...post.data,
    })),
  });
}
