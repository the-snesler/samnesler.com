// @ts-check
import cloudflare from '@astrojs/cloudflare';
import sitemap from '@astrojs/sitemap';
import mdx from '@astrojs/mdx';
import preact from '@astrojs/preact';
import tailwindcss from '@tailwindcss/vite';
import Icons from 'unplugin-icons/vite';
import { defineConfig, envField, fontProviders } from 'astro/config';
import rehypeCallouts from 'rehype-callouts';
import remarkBreaks from 'remark-breaks';
import remarkGFM from 'remark-gfm';
import glsl from 'vite-plugin-glsl';
import { unified } from '@astrojs/markdown-remark';

import devImageEndpoint from './src/utils/vite/devImageEndpoint.js';
import remarkSectionize from './src/utils/remark/sectionize.js';

// https://astro.build/config
export default defineConfig({
  site: 'https://samnesler.com',
  env: {
    schema: {
      GISCUS_REPO: envField.string({ context: 'client', access: 'public' }),
      GISCUS_REPO_ID: envField.string({ context: 'client', access: 'public' }),
      GISCUS_CATEGORY: envField.string({ context: 'client', access: 'public' }),
      GISCUS_CATEGORY_ID: envField.string({ context: 'client', access: 'public' }),
      GUESTBOOK_SECRET_KEY: envField.string({ context: 'server', access: 'secret' }),
      GUESTBOOK_WEBHOOK: envField.string({ context: 'server', access: 'secret' }),
      OPENAI_API_KEY: envField.string({ context: 'server', access: 'secret' }),
      GEMINI_API_KEY: envField.string({ context: 'server', access: 'secret' })
    }
  },

  vite: {
    // `unplugin-icons` inlines each `~icons/*` import as a compile-time SVG component, so nothing
    // from Iconify reaches the Worker bundle. See `src/components/icons.ts` for the registry.
    //
    // `scale: 1` emits `width="1em" height="1em"` so `Icon.astro` can size icons with `font-size`.
    // Passing width/height as props instead would emit them twice: the astro compiler splices
    // `{...props}` in front of the SVG's own attributes rather than merging with them.
    plugins: [tailwindcss(), glsl({ minify: true }), Icons({ compiler: 'astro', scale: 1 }), devImageEndpoint()],
    build: {
      sourcemap: true
    }
  },

  markdown: {
    processor: unified({
      remarkPlugins: [remarkGFM, remarkSectionize, remarkBreaks],
      rehypePlugins: [rehypeCallouts]
    }),
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
      provider: fontProviders.local(),
      name: 'Monaspace Neon',
      cssVariable: '--font-neon',
      fallbacks: ['ui-monospace', 'monospace'],
      options: {
        variants: [
          {
            weight: 400,
            style: 'normal',
            src: ['./src/assets/fonts/MonaspaceNeon-Regular.woff']
          }
        ]
      }
    }
  ],

  integrations: [mdx(), preact({ compat: true }), sitemap()],
  adapter: cloudflare({ imageService: 'custom', prerenderEnvironment: 'node' })
});
