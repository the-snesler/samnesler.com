import { isRunnableDevEnvironment, type Plugin } from 'vite';

/**
 * Serves `/_image` from Node during `astro dev`.
 *
 * `@astrojs/cloudflare` renders on-demand routes inside workerd, and `/_image` is on-demand.
 * `src/utils/imageService.ts` is built on sharp, which needs native bindings and calls
 * `process.report.getReport()` — unenv stubs that out and throws, so every transform 500s and
 * pages are left showing only their blurred placeholders.
 *
 * `prerenderEnvironment: 'node'` (see astro.config.mjs) gives the dev server a Node-side
 * `prerender` environment. Astro only routes *prerendered* routes through it, so this middleware
 * hands it `/_image` too. It runs Astro's own endpoint rather than reimplementing the transform,
 * so dev output matches what the build produces.
 *
 * Production is unaffected: the site is statically built, images are optimized ahead of time, and
 * `/_image` is never requested.
 */

const IMAGE_ROUTE = '/_image';
const ENDPOINT = 'astro/assets/endpoint/generic';

// `runner.import()` is an untyped module boundary; this is the shape Astro's endpoint exports.
type ImageEndpointModule = { GET: (context: { request: Request }) => Promise<Response> };

export default function devImageEndpoint(): Plugin {
  return {
    name: 'samnesler:dev-image-endpoint',
    apply: 'serve',
    configureServer(server) {
      const environment = server.environments.prerender;
      if (!environment || !isRunnableDevEnvironment(environment)) {
        throw new Error(
          `dev-image-endpoint needs a runnable "prerender" environment. Is the Cloudflare adapter still configured with prerenderEnvironment: 'node'?`
        );
      }

      // Returned hook runs after Astro installs its own middleware, so this lands ahead of the
      // catch-all that would otherwise send `/_image` to workerd.
      return () => {
        server.middlewares.stack.unshift({
          route: '',
          handle: async (req: { url?: string; headers: NodeJS.Dict<string | string[]> }, res: import('node:http').ServerResponse, next: (err?: unknown) => void) => {
            if (!req.url?.startsWith(`${IMAGE_ROUTE}?`)) return next();

            try {
              const { GET } = await environment.runner.import<ImageEndpointModule>(ENDPOINT);
              const response = await GET({
                request: new Request(new URL(req.url, `http://${req.headers.host}`))
              });

              res.statusCode = response.status;
              response.headers.forEach((value, key) => res.setHeader(key, value));
              res.end(Buffer.from(await response.arrayBuffer()));
            } catch (err) {
              next(err);
            }
          }
        });
      };
    }
  };
}
