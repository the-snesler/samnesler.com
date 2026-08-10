/// <reference types="unplugin-icons/types/astro" />
import 'astro/astro-jsx';
type Runtime = import('@astrojs/cloudflare').Runtime<Env>;

declare global {
  namespace JSX {
    // type Element = astroHTML.JSX.Element // We want to use this, but it is defined as any.
    type Element = HTMLElement;
  }
  namespace App {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface Locals extends Runtime {}
  }
}
