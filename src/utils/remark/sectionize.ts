// Adapted from https://github.com/johnzanussi/johnzanussi.com/blob/main/src/utils/remark/sectionize.ts
import Slugger from 'github-slugger';
import type { Heading, Root } from 'mdast';
// Augments mdast's `Data` with `hName`/`hProperties`; not re-exported by `@types/mdast`.
import type {} from 'mdast-util-to-hast';
import { toString } from 'mdast-util-to-string';
import type { Parent } from 'unist';
import { findAfter } from 'unist-util-find-after';
import { visitParents } from 'unist-util-visit-parents';

const slugs = new Slugger();

export default function remarkSectionize() {
  const sectionize = (heading: Heading, ancestors: Parent[]) => {
    const start = heading;
    const depth = start.depth;
    const parent = ancestors[ancestors.length - 1];

    if (parent) {
      const end = findAfter(parent, start, node => {
        // Find the next heading or the end of the document
        return node.type === 'heading';
      });

      const startIndex = parent.children.indexOf(start);
      const endIndex = end ? parent.children.indexOf(end) : -1;

      const between = parent.children.slice(startIndex, endIndex > 0 ? endIndex : undefined);

      const headingText = toString(heading);

      const slug = slugs.slug(headingText);

      if (!heading.data) {
        heading.data = {};
      }

      if (!heading.data.hProperties) {
        heading.data.hProperties = {};
      }

      heading.data.hProperties = {
        ...heading.data.hProperties,
        id: slug
      };

      const section = {
        type: 'section',
        depth: depth,
        children: between,
        data: {
          hName: 'section',
          hProperties: {
            id: slug
          }
        }
      };

      parent.children.splice(startIndex, section.children.length, section);
    }
  };

  return function (tree: Root) {
    slugs.reset();
    visitParents(tree, 'heading', sectionize);
  };
}
