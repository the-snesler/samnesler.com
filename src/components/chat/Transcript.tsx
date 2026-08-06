import { useMemo } from 'react';

import styles from '@/components/chat/chat.module.css';
import { renderMarkdown } from '@/components/chat/markdown';
import type { Row } from '@/components/chat/useChatStream';

const TOOL_LABELS: Record<string, string> = {
  search_posts: 'search_posts',
  read_post: 'read_post',
  read_document: 'read_document'
};

/** `read_post({ slug: "docker" })` reads better in a transcript as `read_post docker`. */
function formatArgs(input: unknown): string {
  if (!input || typeof input !== 'object') return '';
  return Object.values(input as Record<string, unknown>)
    .filter(value => typeof value === 'string' || typeof value === 'number')
    .join(' ');
}

function AssistantRow({ text, streaming }: { text: string; streaming: boolean }) {
  const html = useMemo(() => renderMarkdown(text), [text]);
  return (
    <div class={`${styles.answer} ${streaming ? styles.cursor : ''} max-w-prose text-sm leading-relaxed sm:text-base`}>
      <span dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

function ToolRow({ row }: { row: Extract<Row, { kind: 'tool' }> }) {
  const args = formatArgs(row.input);
  const glyph = row.status === 'running' ? '◌' : row.status === 'ok' ? '⏺' : '✗';
  const tone = row.status === 'err' ? 'text-red-500 dark:text-red-400' : 'text-content/50';

  return (
    <details class={`group ${tone} text-xs sm:text-sm`}>
      <summary class="hover:text-content/80 flex cursor-pointer list-none items-baseline gap-2 transition-colors">
        <span aria-hidden="true" class={row.status === 'running' ? 'animate-pulse' : ''}>
          {glyph}
        </span>
        <span class="font-mono">
          {TOOL_LABELS[row.name] ?? row.name}
          {args && <span class="text-content/40"> {args}</span>}
        </span>
        {row.detail && <span class="ml-auto shrink-0 font-mono text-[0.85em] opacity-70">{row.detail}</span>}
      </summary>
      <pre class="text-content/50 mt-1 ml-6 overflow-x-auto font-mono text-[0.8em] whitespace-pre-wrap">{JSON.stringify(row.input, null, 2)}</pre>
    </details>
  );
}

export default function Transcript({ rows, streaming }: { rows: Row[]; streaming: boolean }) {
  const lastKey = rows[rows.length - 1]?.key;

  return (
    <ol role="log" aria-live="polite" aria-label="Conversation" class="flex flex-col gap-4">
      {rows.map(row => {
        switch (row.kind) {
          case 'user':
            return (
              <li key={row.key} class="flex gap-2 font-mono text-sm break-words sm:text-base">
                <span aria-hidden="true" class={`${styles.caret} shrink-0 font-bold`}>
                  &gt;
                </span>
                <span class="min-w-0 whitespace-pre-wrap">{row.text}</span>
              </li>
            );
          case 'assistant':
            return (
              <li key={row.key}>
                <AssistantRow text={row.text} streaming={streaming && row.key === lastKey} />
              </li>
            );
          case 'tool':
            return (
              <li key={row.key}>
                <ToolRow row={row} />
              </li>
            );
          case 'error':
            return (
              <li key={row.key} class="flex gap-2 font-mono text-sm text-red-500 dark:text-red-400">
                <span aria-hidden="true" class="shrink-0">
                  ✗
                </span>
                <span class="min-w-0">{row.text}</span>
              </li>
            );
        }
      })}
    </ol>
  );
}
