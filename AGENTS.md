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

## Environment Variables

Required for full functionality:

- `GISCUS_*`: Comment system configuration
- `GUESTBOOK_SECRET_KEY`: API authentication
- `GUESTBOOK_WEBHOOK`: Drawing notification endpoint

## Testing

Uses Vitest with MSW for API mocking. Coverage reports available via `@vitest/coverage-v8`.

## Deployment

Deployment pipeline includes:

1. Wrangler type generation
2. Astro type checking
3. Production build
4. Cloudflare Workers deployment

The site is configured for the custom domain `tsuni.dev` with R2 bucket integration for guestbook drawings.
