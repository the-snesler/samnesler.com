export const SITE_TITLE = 'Sam Nesler';
export const SITE_DESCRIPTION =
  'Personal website of Sam Nesler, a software engineer specializing in web development and interactive experiences. Explore my projects, blog posts, and more.';
export const TAG_CONFIG: Record<string, { label: string; defaultActive: boolean; visible?: boolean }> = {
  featured: { label: 'Featured', defaultActive: true },
  personal: { label: 'Personal', defaultActive: true },
  interactive: { label: 'Interactive', defaultActive: true },
  tool: { label: 'Tools', defaultActive: true },
  client: { label: 'Client work', defaultActive: false },
  hackathon: { label: 'Hackathons', defaultActive: false, visible: false },
  backend: { label: 'Backend', defaultActive: false },
  experiment: { label: 'Experiments', defaultActive: false },
  school: { label: 'School', defaultActive: false },
  cert: { label: 'Certifications', defaultActive: false }
} as const;
