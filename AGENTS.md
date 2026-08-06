# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a personal portfolio website built with Astro 5, deployed on Cloudflare Workers. The site features:

- MDX blog posts with custom remark/rehype plugins
- Interactive guestbook with canvas drawing functionality
- WebGL water effect background using OGL
- Giscus comments integration
- Preact components with React compatibility layer

## Development Commands

All commands use pnpm as the package manager:

```bash
# Development
pnpm dev                    # Start dev server at localhost:4321
pnpm build                  # Build for production
pnpm preview               # Preview build locally with Cloudflare Workers
pnpm deploy                # Deploy to Cloudflare (includes type checking)

# Code Quality
pnpm lint                  # Run ESLint
pnpm format               # Format code with Prettier

# Testing
pnpm test                 # Run Vitest tests
pnpm test:watch           # Run tests in watch mode
pnpm test:coverage        # Run tests with coverage report

# Cloudflare
pnpm wrangler             # Direct Wrangler CLI access
```

## Architecture

### Core Structure

- **Astro 5**: Static site generator with SSR capabilities
- **Cloudflare Workers**: Edge deployment with R2 bucket integration
- **Preact**: UI components with React compatibility via alias
- **TailwindCSS 4**: Styling with custom CSS variables
- **MDX**: Blog posts with custom remark/rehype processing

### Key Directories

- `src/components/`: Reusable Astro and Preact components
- `src/layouts/`: Page layout templates
- `src/pages/`: File-based routing
- `src/content/`: Content collections configuration
- `posts/`: MDX blog posts
- `src/utils/`: Utility functions and custom remark plugins

### Special Features

#### Guestbook System

- Interactive pixel art drawing canvas (src/components/guestbook/)
- Canvas data stored in Cloudflare R2 bucket
- Drawing state managed with useReducer pattern
- Webhook integration for notifications

#### Water Effect

- WebGL implementation using OGL library (src/components/water/)
- GLSL shaders for realistic water animation
- Dynamic theme-based color switching
- Minified shader compilation via vite-plugin-glsl

#### Content System

- Blog posts use glob loader from `./posts` directory
- Custom remark plugin for content sectionization
- Rehype callouts for enhanced markdown
- GitHub Flavored Markdown support

#### Homepage Chat Agent

A CLI-styled agent on the homepage (`#ask`, above `#projects`) that answers questions about Sam.

- **Model**: Google `gemini-3.5-flash-lite` via the Vercel AI SDK (`ai` + `@ai-sdk/google`).
- **Route**: `src/pages/api/chat.ts` (SSR). Runs a multi-step tool loop and streams NDJSON.
- **Island**: `src/components/chat/` — Preact, custom terminal transcript. Not shadcn: its
  `message-scroller` primitive requires React >= 19 and this repo aliases react to preact/compat 18.
- **Knowledge**: `projects.json` is inlined whole into the system prompt; blog posts and R2
  documents are listed in the prompt and fetched on demand via `search_posts`, `read_post`, and
  `read_document`.

The system prompt is assembled server-side (`src/utils/chat/prompt.ts`) and never accepted from the
client — the request schema's role enum excludes `system`.

**Blog posts must not be loaded with `getCollection` here.** `src/utils/chat/posts.ts` uses
`import.meta.glob('/posts/*.mdx', { query: '?raw' })` instead. Importing `astro:content` from a
`prerender = false` route pulls in `astro:content-module-imports`, which dynamically imports every
MDX file — dragging `docker.mdx`'s CodeMirror components into the Worker bundle. Posts marked
`isVisible: false` are filtered out at module scope so the agent can neither list nor read them.

**Uploading reference documents** to the `site-docs` R2 bucket:

```bash
wrangler r2 object put site-docs/docs/resume.md --file ./resume.md --remote
wrangler r2 object put site-docs/index.json --file ./index.json --content-type application/json --remote
```

`index.json` is the hand-maintained catalog. Each entry needs `slug`, `title`, `summary`, and `key`:

```json
{
  "version": 1,
  "documents": [{ "slug": "resume", "title": "Résumé", "summary": "Work history and skills.", "key": "docs/resume.md" }]
}
```

The `key` is deliberately separate from `slug`: the slug the model supplies is only ever a lookup
into this allowlist, never a path component, so traversal is impossible by construction. The index
is cached per Worker isolate for 5 minutes, so an upload takes up to that long to appear.

## Environment Variables

Required for full functionality:

- `GISCUS_*`: Comment system configuration
- `GUESTBOOK_SECRET_KEY`: API authentication
- `GUESTBOOK_WEBHOOK`: Drawing notification endpoint
- `OPENAI_API_KEY`: Bill splitter receipt parsing
- `GEMINI_API_KEY`: Homepage chat agent

Public `GISCUS_*` values are validated at build time, so `astro build` needs them present in `.env`
(or the environment) even though production reads them from `wrangler.jsonc` vars.

## Bindings

Declared in `wrangler.jsonc`; run `pnpm wrangler types` after changing them.

- `DRAWINGS` (R2) — guestbook drawings
- `DOCS` (R2, `site-docs`) — chat agent reference documents. Marked `"remote": true` so
  `astro dev` reads the real bucket rather than an empty local one.
- `CHAT_LIMITS` (KV) — per-IP chat rate limiting (20 messages/hour, fixed window, hashed IP keys).
  Create with `wrangler kv namespace create CHAT_LIMITS` and paste the id into `wrangler.jsonc`.

## Testing

Uses Vitest with MSW for API mocking. Coverage reports available via `@vitest/coverage-v8`.
Config lives in `vitest.config.ts`; tests are `src/**/*.test.ts`.

## Deployment

Deployment pipeline includes:

1. Wrangler type generation
2. Astro type checking
3. Production build
4. Cloudflare Workers deployment

The site is configured for the custom domain `samnesler.com` with R2 bucket integration for guestbook drawings and chat agent documents.
