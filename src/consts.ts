export const SITE_TITLE = 'Sam Nesler';
export const SITE_DESCRIPTION =
  'Personal website of Sam Nesler, a software engineer specializing in web development and interactive experiences. Explore my projects, blog posts, and more.';
export const PROJECT_CATEGORIES: Record<string, { label: string; defaultOpen: boolean }> = {
  tool: { label: 'Tools', defaultOpen: true },
  interactive: { label: 'Interactive', defaultOpen: true },
  client: { label: 'Client work', defaultOpen: true },
  school: { label: 'School', defaultOpen: false },
  personal: { label: 'Personal', defaultOpen: false },
  cert: { label: 'Certifications', defaultOpen: false }
} as const;
