import { useCallback, useRef, useState } from 'react';

import { createLineSplitter } from '@/utils/chat/ndjson';
import type { ChatEvent, ChatMessage } from '@/utils/chat/types';

export type Row =
  | { kind: 'user'; key: string; text: string }
  | { kind: 'assistant'; key: string; text: string }
  | { kind: 'tool'; key: string; name: string; input: unknown; status: 'running' | 'ok' | 'err'; detail?: string }
  | { kind: 'error'; key: string; text: string };

let counter = 0;
const nextKey = () => `r${++counter}`;

/** Text deltas arrive per token; batching them keeps markdown re-rendering off the hot path. */
const FLUSH_MS = 40;

export function useChatStream() {
  const [rows, setRows] = useState<Row[]>([]);
  const [streaming, setStreaming] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const pendingText = useRef('');
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // A tool call ends the current assistant block, so the next delta starts a fresh one.
  const breakBlock = useRef(false);

  const appendText = useCallback((chunk: string) => {
    setRows(previous => {
      const last = previous[previous.length - 1];
      if (!breakBlock.current && last?.kind === 'assistant') {
        return [...previous.slice(0, -1), { ...last, text: last.text + chunk }];
      }
      breakBlock.current = false;
      return [...previous, { kind: 'assistant', key: nextKey(), text: chunk }];
    });
  }, []);

  const flush = useCallback(() => {
    if (flushTimer.current) {
      clearTimeout(flushTimer.current);
      flushTimer.current = null;
    }
    if (!pendingText.current) return;
    const chunk = pendingText.current;
    pendingText.current = '';
    appendText(chunk);
  }, [appendText]);

  const queueText = useCallback(
    (delta: string) => {
      pendingText.current += delta;
      if (flushTimer.current) return;
      flushTimer.current = setTimeout(flush, FLUSH_MS);
    },
    [flush]
  );

  const handle = useCallback(
    (event: ChatEvent) => {
      switch (event.t) {
        case 'text':
          queueText(event.d);
          break;
        case 'step':
          break;
        case 'tool':
          flush();
          breakBlock.current = true;
          setRows(previous => [...previous, { kind: 'tool', key: event.id, name: event.name, input: event.input, status: 'running' }]);
          break;
        case 'tool_ok':
          setRows(previous =>
            previous.map(row => (row.kind === 'tool' && row.key === event.id ? { ...row, status: 'ok', detail: event.summary } : row))
          );
          break;
        case 'tool_err':
          setRows(previous =>
            previous.map(row => (row.kind === 'tool' && row.key === event.id ? { ...row, status: 'err', detail: event.message } : row))
          );
          break;
        case 'error':
          flush();
          setRows(previous => [...previous, { kind: 'error', key: nextKey(), text: event.message }]);
          break;
        case 'ready':
        case 'done':
          break;
      }
    },
    [flush, queueText]
  );

  const cancel = useCallback(() => abortRef.current?.abort(), []);

  const send = useCallback(
    async (prompt: string, history: ChatMessage[]) => {
      const controller = new AbortController();
      abortRef.current = controller;
      breakBlock.current = true;
      setRows(previous => [...previous, { kind: 'user', key: nextKey(), text: prompt }]);
      setStreaming(true);

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: [...history, { role: 'user', content: prompt }] }),
          signal: controller.signal
        });

        if (!response.ok || !response.body) {
          // The 429 body is a single NDJSON error line, so it flows through the same path.
          const text = await response.text().catch(() => '');
          let message = `Request failed (${response.status}).`;
          try {
            const parsed = JSON.parse(text.trim().split('\n')[0]) as ChatEvent;
            if (parsed.t === 'error') message = parsed.message;
          } catch {
            /* fall back to the status message */
          }
          setRows(previous => [...previous, { kind: 'error', key: nextKey(), text: message }]);
          return;
        }

        // TextDecoderStream (not a bare TextDecoder) so multi-byte characters split across chunk
        // boundaries are reassembled rather than mangled.
        const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
        const splitter = createLineSplitter();

        const dispatch = (line: string) => {
          try {
            handle(JSON.parse(line) as ChatEvent);
          } catch {
            /* drop a malformed line rather than killing the stream */
          }
        };

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          for (const line of splitter.push(value)) dispatch(line);
        }
        for (const line of splitter.flush()) dispatch(line);
      } catch (error) {
        if ((error as Error)?.name !== 'AbortError') {
          setRows(previous => [...previous, { kind: 'error', key: nextKey(), text: 'Connection lost.' }]);
        }
      } finally {
        flush();
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [flush, handle]
  );

  const reset = useCallback(() => {
    cancel();
    setRows([]);
  }, [cancel]);

  return { rows, streaming, send, cancel, reset };
}
