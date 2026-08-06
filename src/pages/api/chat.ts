import type { APIRoute } from 'astro';
import { GEMINI_API_KEY } from 'astro:env/server';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { stepCountIs, streamText, tool, type TextStreamPart, type ToolSet } from 'ai';
import { z } from 'zod';

import { loadDocIndex, readDoc } from '@/utils/chat/docs';
import { findPost, POSTS, searchPosts } from '@/utils/chat/posts';
import { buildSystemPrompt } from '@/utils/chat/prompt';
import { checkRateLimit } from '@/utils/chat/rateLimit';
import type { ChatEvent } from '@/utils/chat/types';

export const prerender = false;

const MODEL_ID = 'gemini-3.5-flash-lite';
const MAX_STEPS = 6;
const MAX_OUTPUT_TOKENS = 1200;
const MAX_MESSAGE_CHARS = 1500;
const MAX_HISTORY = 20;
const MAX_BODY_BYTES = 32 * 1024;
// The two longest posts run ~20k characters. 8k would hand the model only the first 40% of them;
// 16k covers most of a post at ~4k input tokens, which is a fraction of a cent on flash-lite.
const MAX_POST_CHARS = 16_000;

/**
 * Note the role enum: no 'system' and no 'tool'. The system prompt is built server-side and
 * prepended, so a client cannot inject or replace it.
 */
const RequestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1).max(MAX_MESSAGE_CHARS)
      })
    )
    .min(1)
    .max(MAX_HISTORY)
});

function truncate(text: string, limit: number) {
  return text.length > limit ? text.slice(0, limit) : text;
}

/** Only a short label crosses the wire — tool payloads are the model's context, not the transcript. */
function summarize(output: unknown): string {
  if (output && typeof output === 'object' && 'error' in output) {
    return String((output as { error: unknown }).error);
  }
  if (Array.isArray(output)) {
    return `${output.length} result${output.length === 1 ? '' : 's'}`;
  }
  if (output && typeof output === 'object' && 'content' in output) {
    const chars = String((output as { content: unknown }).content).length;
    const truncated = (output as { truncated?: boolean }).truncated ? ', truncated' : '';
    return `${(chars / 1024).toFixed(1)} KB${truncated}`;
  }
  return 'ok';
}

function toNdjson(stream: AsyncIterable<TextStreamPart<ToolSet>>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      const emit = (event: ChatEvent) => controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));

      // Flush immediately. When step one is a tool call the model's first token can be seconds
      // out, and the client should not be staring at nothing until then.
      emit({ t: 'ready' });

      try {
        for await (const part of stream) {
          switch (part.type) {
            case 'text-delta':
              emit({ t: 'text', d: part.text });
              break;
            case 'tool-call':
              emit({ t: 'tool', id: part.toolCallId, name: part.toolName, input: part.input });
              break;
            case 'tool-result':
              emit({ t: 'tool_ok', id: part.toolCallId, name: part.toolName, summary: summarize(part.output) });
              break;
            case 'tool-error':
              emit({ t: 'tool_err', id: part.toolCallId, name: part.toolName, message: String(part.error).slice(0, 200) });
              break;
            case 'start-step':
              emit({ t: 'step' });
              break;
            case 'finish':
              emit({ t: 'done', reason: part.finishReason });
              break;
            case 'error':
              console.error('[chat] stream part error', part.error);
              emit({ t: 'error', message: 'The model failed to respond.' });
              break;
            case 'abort':
              emit({ t: 'done', reason: 'abort' });
              break;
          }
        }
      } catch (error) {
        console.error('[chat] fatal stream error', error);
        emit({ t: 'error', message: 'Stream failed.' });
      } finally {
        controller.close();
      }
    }
  });
}

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime?.env;

  const gate = await checkRateLimit(env?.CHAT_LIMITS, request);
  if (!gate.ok) return gate.response;

  const contentLength = Number(request.headers.get('Content-Length') ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return new Response('Request too large', { status: 413 });
  }

  const body = await request.json().catch(() => null);
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: 'Invalid request' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const docs = await loadDocIndex(env?.DOCS);
  const google = createGoogleGenerativeAI({ apiKey: GEMINI_API_KEY });

  const tools = {
    search_posts: tool({
      description: 'Search the full text of every published blog post for a term. Returns matching post slugs with short excerpts.',
      inputSchema: z.object({ query: z.string().min(2).max(120).describe('A word or short phrase to look for.') }),
      execute: async ({ query }) => searchPosts(query)
    }),

    read_post: tool({
      description: 'Read the full plaintext of one published blog post.',
      inputSchema: z.object({ slug: z.string().describe('A post slug from the catalog in your instructions.') }),
      execute: async ({ slug }) => {
        const post = findPost(slug);
        if (!post) {
          return { error: `No published post "${slug}". Known slugs: ${POSTS.map(p => p.slug).join(', ')}` };
        }
        const content = truncate(post.text, MAX_POST_CHARS);
        return { slug, title: post.title, truncated: content.length < post.text.length, content };
      }
    }),

    read_document: tool({
      description: 'Read the full text of one reference document from the catalog in your instructions.',
      inputSchema: z.object({ slug: z.string().describe('A document slug from the catalog in your instructions.') }),
      execute: async ({ slug }) => readDoc(env?.DOCS, slug)
    })
  } satisfies ToolSet;

  const result = streamText({
    model: google(MODEL_ID),
    system: buildSystemPrompt(docs),
    messages: parsed.data.messages,
    tools,
    stopWhen: stepCountIs(MAX_STEPS),
    abortSignal: request.signal,
    temperature: 0.6,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    maxRetries: 1,
    onError: ({ error }) => console.error('[chat] streamText error', error)
  });

  return new Response(toNdjson(result.stream), {
    status: 200,
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      'X-Content-Type-Options': 'nosniff'
    }
  });
};
