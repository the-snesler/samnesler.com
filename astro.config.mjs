// @ts-check
import cloudflare from '@astrojs/cloudflare';
import mdx from '@astrojs/mdx';
import preact from '@astrojs/preact';
import tailwindcss from '@tailwindcss/vite';
import icon from 'astro-icon';
import { defineConfig, envField, fontProviders } from 'astro/config';
import rehypeCallouts from 'rehype-callouts';
import remarkBreaks from 'remark-breaks';
import remarkGFM from 'remark-gfm';
import glsl from 'vite-plugin-glsl';

import remarkSectionize from './src/utils/remark/sectionize.js';

// https://astro.build/config
export default defineConfig({
  site: "https://samnesler.com",
  env: {
    schema: {
      GISCUS_REPO: envField.string({ context: 'client', access: 'public' }),
      GISCUS_REPO_ID: envField.string({ context: 'client', access: 'public' }),
      GISCUS_CATEGORY: envField.string({ context: 'client', access: 'public' }),
      GISCUS_CATEGORY_ID: envField.string({ context: 'client', access: 'public' }),
      GUESTBOOK_SECRET_KEY: envField.string({ context: 'server', access: 'secret' }),
      GUESTBOOK_WEBHOOK: envField.string({ context: 'server', access: 'secret' })
    }
  },

  vite: {
    plugins: [tailwindcss(), glsl({ minify: true })],
    build: {
      sourcemap: true
    }
  },

  markdown: {
    remarkPlugins: [remarkGFM, remarkSectionize, remarkBreaks],
    rehypePlugins: [rehypeCallouts],
    shikiConfig: {
      themes: {
        light: 'catppuccin-latte',
        dark: 'catppuccin-frappe'
      },
      defaultColor: false
    }
  },

  image: {
    service: {
      entrypoint: './src/utils/imageService.ts'
    }
  },

  experimental: {
    fonts: [
      {
        provider: fontProviders.google(),
        name: 'Rubik',
        cssVariable: '--font-rubik',
        weights: ['300 900'],
        fallbacks: ['ui-rounded', 'system-ui', 'sans-serif'],
        optimizedFallbacks: false
      },
      {
        provider: 'local',
        name: 'Monaspace Neon',
        cssVariable: '--font-neon',
        fallbacks: ['ui-monospace', 'monospace'],
        variants: [
          {
            weight: 400,
            style: 'normal',
            src: ['./src/assets/fonts/MonaspaceNeon-Regular.woff']
          }
        ]
      }
    ]
  },

  integrations: [icon(), mdx(), preact({ compat: true })],
  adapter: cloudflare({ imageService: 'custom' })
});
