import { glob } from 'astro/loaders';
import { defineCollection, z } from 'astro:content';

const blogCollection = defineCollection({
  loader: glob({ pattern: '**/*.(md|mdx)', base: './posts' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      subtitle: z.string().optional(),
      isVisible: z.boolean(),
      date: z.date(),
      excerptImageUrl: image().optional(),
      excerptImageAlt: z.string().optional(),
      excerpt: z.string().optional(),
      postLayout: z.enum(['std', 'wide']).default('std')
    })
});

export const collections = {
  blog: blogCollection
};
