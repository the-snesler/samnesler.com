#!/usr/bin/env node
/**
 * Uploads a markdown reference document to the `site-docs` R2 bucket and adds (or updates) its
 * entry in the bucket's `index.json` catalog — the two steps AGENTS.md previously documented as
 * separate manual `wrangler r2 object put` invocations.
 *
 * Usage:
 *   node scripts/upload-doc.mjs <path/to/doc.md> --slug=resume --title="Résumé" \
 *     --summary="Work history and skills." [--key=docs/resume.md] [--dry-run]
 *
 * Plain Node + `wrangler r2 object put/get` only — no TypeScript, no extra dependencies, so it
 * runs the same on every Node version this repo supports (Node's built-in TS stripping is not
 * available on all of them). Bucket name and key layout mirror the `DOCS` binding in
 * wrangler.jsonc; keep them in sync if that binding ever changes.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WRANGLER_BIN = join(REPO_ROOT, 'node_modules', '.bin', 'wrangler');
const BUCKET = 'site-docs';
const INDEX_KEY = 'index.json';
// Mirrors SLUG_RE in src/utils/chat/docs.ts — keep the two in sync.
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
// Mirrors MAX_DOC_BYTES in src/utils/chat/docs.ts. Uploading a larger file still works, but
// readDoc() will silently truncate what the agent ever sees, so we warn instead of failing.
const MAX_DOC_BYTES = 16 * 1024;

function usageError(message) {
  console.error(`error: ${message}`);
  console.error(
    '\nusage: node scripts/upload-doc.mjs <path/to/doc.md> --slug=<slug> --title="<title>" --summary="<summary>" [--key=docs/<slug>.md] [--dry-run]'
  );
  process.exit(1);
}

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
  options: {
    slug: { type: 'string' },
    title: { type: 'string' },
    summary: { type: 'string' },
    key: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
  },
});

const [filePath] = positionals;
if (!filePath) usageError('missing <path/to/doc.md>');
if (!values.slug) usageError('missing --slug');
if (!values.title) usageError('missing --title');
if (!values.summary) usageError('missing --summary');

const { slug, title, summary, 'dry-run': dryRun } = values;

if (!SLUG_RE.test(slug)) {
  usageError(`--slug "${slug}" must match ${SLUG_RE} (lowercase alphanumeric + hyphens, ≤64 chars)`);
}

const key = values.key ?? `docs/${slug}.md`;
if (key.includes('..') || key.startsWith('/')) {
  usageError(`--key "${key}" looks path-traversal-shaped; refusing`);
}
if (key === INDEX_KEY) {
  usageError(`--key "${key}" would overwrite the catalog file itself; refusing`);
}

const absFilePath = resolve(filePath);
if (!existsSync(absFilePath)) usageError(`file not found: ${absFilePath}`);
const fileStat = statSync(absFilePath);
if (!fileStat.isFile()) usageError(`not a file: ${absFilePath}`);
if (fileStat.size > MAX_DOC_BYTES) {
  console.warn(
    `warning: ${filePath} is ${fileStat.size} bytes, over the ${MAX_DOC_BYTES}-byte readDoc() ` +
      'threshold — the agent will only ever see a truncated prefix of it.'
  );
}
if (!existsSync(WRANGLER_BIN)) usageError(`wrangler binary not found at ${WRANGLER_BIN} — run pnpm install`);

function wrangler(args) {
  if (dryRun) {
    console.log(`[dry-run] wrangler ${args.join(' ')}`);
    return;
  }
  execFileSync(WRANGLER_BIN, args, { cwd: REPO_ROOT, stdio: 'inherit' });
}

const workDir = mkdtempSync(join(tmpdir(), 'upload-doc-'));
try {
  console.log(`Uploading ${filePath} -> r2://${BUCKET}/${key}`);
  wrangler(['r2', 'object', 'put', `${BUCKET}/${key}`, '--file', absFilePath, '--content-type', 'text/markdown', '--remote']);

  const indexPath = join(workDir, INDEX_KEY);
  let index = { version: 1, documents: [] };
  if (dryRun) {
    console.log(`[dry-run] wrangler r2 object get ${BUCKET}/${INDEX_KEY} --file ${indexPath} --remote`);
    console.log('[dry-run] (assuming an empty catalog for this preview since nothing was actually fetched)');
  } else {
    let indexFetched = false;
    try {
      execFileSync(WRANGLER_BIN, ['r2', 'object', 'get', `${BUCKET}/${INDEX_KEY}`, '--file', indexPath, '--remote'], {
        cwd: REPO_ROOT,
        stdio: ['ignore', 'ignore', 'pipe'],
      });
      indexFetched = true;
    } catch (error) {
      const stderr = error.stderr?.toString() ?? '';
      if (stderr.includes('The specified key does not exist.')) {
        console.log(`No existing ${INDEX_KEY} found — starting a new catalog.`);
      } else {
        if (stderr) console.error(stderr.trimEnd());
        usageError(`failed to fetch existing ${INDEX_KEY}; aborting to avoid clobbering the catalog`);
      }
    }
    if (indexFetched) {
      try {
        index = JSON.parse(readFileSync(indexPath, 'utf8'));
      } catch {
        usageError(`failed to parse existing ${INDEX_KEY}; aborting to avoid clobbering the catalog`);
      }
      if (!Array.isArray(index.documents)) usageError(`existing ${INDEX_KEY} has no "documents" array; fix it by hand first`);
    }
  }

  const entry = { slug, title, summary, key };
  const existingIndex = index.documents.findIndex(doc => doc.slug === slug);
  if (existingIndex === -1) {
    index.documents.push(entry);
    console.log(`Adding new catalog entry for "${slug}".`);
  } else {
    index.documents[existingIndex] = entry;
    console.log(`Replacing existing catalog entry for "${slug}".`);
  }

  writeFileSync(indexPath, JSON.stringify(index, null, 2) + '\n');
  console.log(`Uploading updated ${INDEX_KEY} -> r2://${BUCKET}/${INDEX_KEY}`);
  wrangler(['r2', 'object', 'put', `${BUCKET}/${INDEX_KEY}`, '--file', indexPath, '--content-type', 'application/json', '--remote']);

  console.log(dryRun ? 'Dry run complete — nothing was uploaded.' : 'Done. index.json is cached per isolate for 5 minutes.');
} finally {
  rmSync(workDir, { recursive: true, force: true });
}
