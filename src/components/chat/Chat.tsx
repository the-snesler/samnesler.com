import { ArrowDown, CornerDownLeft, Square } from 'lucide-react';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';

import styles from '@/components/chat/chat.module.css';
import Transcript from '@/components/chat/Transcript';
import { useChatStream } from '@/components/chat/useChatStream';
import { useStickToBottom } from '@/components/chat/useStickToBottom';
import type { ChatMessage } from '@/utils/chat/types';

const MAX_MESSAGE_CHARS = 1500;

const SUGGESTIONS = ['What can you do?', 'Does Sam have any advice?', 'Tell me about their most recent project.'];

export default function Chat() {
  const { rows, streaming, send, cancel } = useChatStream();
  const [draft, setDraft] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { ref: scrollRef, onScroll, atBottom, scrollToBottom } = useStickToBottom<HTMLDivElement>(rows);

  /** History the server will accept: the completed turns, tool rows excluded. */
  const history = useCallback((): ChatMessage[] => {
    const messages: ChatMessage[] = [];
    for (const row of rows) {
      if (row.kind === 'user') messages.push({ role: 'user', content: row.text });
      else if (row.kind === 'assistant' && row.text.trim()) messages.push({ role: 'assistant', content: row.text });
    }
    return messages.slice(-18);
  }, [rows]);

  const submit = useCallback(
    (text: string) => {
      const prompt = text.trim();
      if (!prompt || streaming) return;
      setDraft('');
      void send(prompt, history());
    },
    [history, send, streaming]
  );

  // `field-sizing: content` handles this in Chrome and Safari, but Firefox has no support, so the
  // textarea would otherwise stay one row tall and scroll internally.
  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [draft]);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit(draft);
    }
    if (event.key === 'Escape' && streaming) {
      event.preventDefault();
      cancel();
    }
  };

  const empty = rows.length === 0;

  return (
    <div class={`${styles.shell} border-content/15 bg-bkg/40 mt-4 flex flex-col overflow-hidden rounded-xl border backdrop-blur-sm`}>
      <div class="border-content/10 text-content/40 flex items-center gap-2 border-b px-4 py-2 font-mono text-xs">
        <span aria-hidden="true" class={styles.caret}>
          ●
        </span>
        <span>tsunibot</span>
        <span class="ml-auto">gemini-3.5-flash-lite</span>
      </div>

      <div class="relative">
        <div ref={scrollRef} onScroll={onScroll} class="max-h-104 min-h-48 overflow-y-auto px-4 py-4">
          {empty ? (
            <div class="text-content/60 flex flex-col gap-3 font-mono text-sm">
              <p>Ask about Sam's projects, writing, or background. I can read posts and some private notes to answer.</p>
              <ul class="flex flex-col items-start gap-1.5">
                {SUGGESTIONS.map(suggestion => (
                  <li key={suggestion}>
                    <button type="button" onClick={() => submit(suggestion)} class="hover:text-accent text-left transition-colors hover:underline">
                      <span aria-hidden="true" class={`${styles.caret} mr-2 font-bold`}>
                        &gt;
                      </span>
                      {suggestion}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <Transcript rows={rows} streaming={streaming} />
          )}
        </div>

        {!atBottom && (
          <button
            type="button"
            onClick={scrollToBottom}
            class="border-content/20 bg-bkg text-content/70 hover:text-content absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border p-1.5 shadow-md transition-colors"
          >
            <ArrowDown size={14} aria-hidden="true" />
            <span class="visible-hidden">Scroll to latest</span>
          </button>
        )}
      </div>

      <form
        onSubmit={event => {
          event.preventDefault();
          submit(draft);
        }}
        class="border-content/10 flex items-start gap-2 border-t px-4 py-3"
      >
        <span aria-hidden="true" class={`${styles.caret} pt-0.5 font-mono font-bold`}>
          &gt;
        </span>
        <label class="visible-hidden" for="chat-input">
          Ask about Sam's work
        </label>
        <textarea
          id="chat-input"
          ref={textareaRef}
          value={draft}
          rows={1}
          maxLength={MAX_MESSAGE_CHARS}
          readOnly={streaming}
          aria-readonly={streaming}
          placeholder={streaming ? 'thinking…' : 'ask something'}
          onInput={event => setDraft((event.target as HTMLTextAreaElement).value)}
          onKeyDown={onKeyDown}
          class={`${styles.input} max-h-32 min-w-0 flex-1 bg-transparent font-mono text-sm outline-none sm:text-base ${streaming ? 'opacity-50' : ''}`}
        />
        {streaming ? (
          <button
            type="button"
            onClick={cancel}
            title="Stop (Esc)"
            class="text-content/50 hover:text-content flex shrink-0 items-center gap-1 pt-0.5 font-mono text-xs transition-colors"
          >
            <Square size={12} aria-hidden="true" />
            <span>esc</span>
          </button>
        ) : (
          <button
            type="submit"
            disabled={!draft.trim()}
            title="Send (Enter)"
            class="text-content/50 hover:text-accent flex shrink-0 items-center pt-0.5 transition-colors disabled:opacity-30"
          >
            <CornerDownLeft size={16} aria-hidden="true" />
            <span class="visible-hidden">Send</span>
          </button>
        )}
      </form>
    </div>
  );
}
