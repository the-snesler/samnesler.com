import type { ChatEvent } from '@/utils/chat/types';

/**
 * Per-IP rate limiting for /api/chat, backed by Workers KV.
 *
 * Fixed window, not sliding. KV permits at most one write per second to a given key and is
 * eventually consistent, so the read-modify-write a sliding window needs is exactly the pattern
 * that trips those limits. The window is encoded in the key so expiry is automatic and a stale
 * window can never be read.
 */

const WINDOW_SEC = 60 * 60;
const MAX_PER_WINDOW = 20;

/** Same precedence as src/pages/api/guestbook.ts. */
export const getClientIP = (request: Request): string | undefined =>
  request.headers.get('CF-Connecting-IP') ??
  request.headers.get('X-Forwarded-For')?.split(',')[0].trim() ??
  request.headers.get('X-Real-IP') ??
  undefined;

/** Hashed so raw IPs never land in KV. */
async function ipKey(ip: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`chat:${ip}`));
  return (
    'rl:' +
    [...new Uint8Array(digest)]
      .slice(0, 12)
      .map(byte => byte.toString(16).padStart(2, '0'))
      .join('')
  );
}

/**
 * The 429 body is a single valid NDJSON line so the client's stream reader can render it through
 * the same path as any other error event.
 */
function limitResponse(retryAfterSec: number): Response {
  const minutes = Math.ceil(retryAfterSec / 60);
  const event: ChatEvent = {
    t: 'error',
    message: `Rate limit reached — you get ${MAX_PER_WINDOW} messages an hour. Try again in ${minutes} min.`
  };
  return new Response(JSON.stringify(event) + '\n', {
    status: 429,
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Retry-After': String(retryAfterSec),
      'Cache-Control': 'no-store'
    }
  });
}

export async function checkRateLimit(
  kv: Env['CHAT_LIMITS'] | undefined,
  request: Request
): Promise<{ ok: true } | { ok: false; response: Response }> {
  // No binding (e.g. a local `astro dev` without wrangler) shouldn't break the chat.
  if (!kv) return { ok: true };

  const ip = getClientIP(request);
  if (!ip) {
    return { ok: false, response: new Response('Unable to identify client', { status: 400 }) };
  }

  const bucket = Math.floor(Date.now() / 1000 / WINDOW_SEC);
  const key = `${await ipKey(ip)}:${bucket}`;

  const current = Number(await kv.get(key)) || 0;
  if (current >= MAX_PER_WINDOW) {
    const resetAt = (bucket + 1) * WINDOW_SEC;
    return { ok: false, response: limitResponse(Math.max(1, resetAt - Math.floor(Date.now() / 1000))) };
  }

  try {
    // TTL outlives the window so a request landing in its final second is still counted.
    // KV rejects TTLs below 60.
    await kv.put(key, String(current + 1), { expirationTtl: WINDOW_SEC + 120 });
  } catch (error) {
    // A KV 429 here means a legitimate double-submit. Blocking the chat over it is worse than
    // letting one extra request through.
    console.warn('[chat] rate limit write failed', error);
  }

  return { ok: true };
}
