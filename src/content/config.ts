import { TAG_CONFIG } from '@/consts';
import { file, glob } from 'astro/loaders';
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

const projectsCollection = defineCollection({
  loader: file('src/content/projects.json', {
    parser: text => {
      const projects = JSON.parse(text) as Array<Record<string, unknown> & { id: string }>;
      return Object.fromEntries(
        projects.map(project => {
          const { id, ...projectData } = project;
          return [id, projectData];
        })
      );
    }
  }),
  schema: z.object({
    name: z.string(),
    href: z.string().optional(),
    source: z.string().optional(),
    image: z.string(),
    description: z.string(),
    year: z.string(),
    size: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
    hideMobile: z.boolean().default(false),
    containImage: z.boolean().default(false),
    containBackgroundColor: z.string().optional(),
    tags: z.array(z.enum(Object.keys(TAG_CONFIG) as [string, ...string[]])).default([])
  })
});

export const collections = {
  blog: blogCollection,
  projects: projectsCollection
};
