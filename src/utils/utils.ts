import type { CollectionEntry } from "astro:content";

export const sortPosts = (posts: CollectionEntry<'blog'>[]) => posts.filter(p => p.data.isVisible).sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
