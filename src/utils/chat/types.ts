/** Wire types shared between the /api/chat route and the chat island. */

/** A turn the client is allowed to send back as history. */
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * NDJSON events streamed from /api/chat. One JSON object per line.
 * Keys are short because `text` fires once per token.
 */
export type ChatEvent =
  /** Emitted immediately so the client sees bytes before the model's first token. */
  | { t: 'ready' }
  /** A new model turn began — the transcript draws a separator. */
  | { t: 'step' }
  /** Append to the assistant block currently being written. */
  | { t: 'text'; d: string }
  /** The model invoked a tool. `id` ties the later result back to this row. */
  | { t: 'tool'; id: string; name: string; input: unknown }
  /** That tool returned. Only a human-readable summary crosses the wire, never the payload. */
  | { t: 'tool_ok'; id: string; name: string; summary: string }
  | { t: 'tool_err'; id: string; name: string; message: string }
  | { t: 'error'; message: string }
  | { t: 'done'; reason?: string };
