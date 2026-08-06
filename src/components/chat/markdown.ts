import MarkdownIt from 'markdown-it';

/**
 * Renderer for model-generated markdown.
 *
 * `html: false` (the default) makes markdown-it escape any raw HTML in the source rather than pass
 * it through, and its built-in `validateLink` already rejects javascript:, vbscript:, file: and
 * non-image data: URLs. That covers the XSS surface for untrusted markdown without pulling
 * sanitize-html into the browser bundle — the server-side rss.xml.ts route still uses it, where
 * weight doesn't matter.
 */
const md = new MarkdownIt({ html: false, linkify: false, breaks: true });

const defaultLinkOpen = md.renderer.rules.link_open ?? ((tokens, index, options, _env, self) => self.renderToken(tokens, index, options));

md.renderer.rules.link_open = (tokens, index, options, env, self) => {
  tokens[index].attrSet('target', '_blank');
  tokens[index].attrSet('rel', 'nofollow noopener noreferrer');
  return defaultLinkOpen(tokens, index, options, env, self);
};

export function renderMarkdown(source: string): string {
  return md.render(source);
}
