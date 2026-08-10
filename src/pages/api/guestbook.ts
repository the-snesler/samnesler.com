import type { APIRoute } from 'astro';
import { GUESTBOOK_SECRET_KEY, GUESTBOOK_WEBHOOK } from 'astro:env/server';
import { env } from 'cloudflare:workers';

const DRAWINGS_KEY = 'drawings.bin';
const BLOCKED_IPS_KEY = 'blocked-ips.json';
const DRAWING_METADATA_KEY = 'drawing-metadata.json';
const delimiter = new Uint8Array([255]);

export const prerender = false;

interface DrawingMetadata {
  id?: string;
  ip?: string;
  timestamp?: number;
}

const getClientIP = (request: Request): string | undefined => {
  // Try Cloudflare's CF-Connecting-IP header first
  const cfIP = request.headers.get('CF-Connecting-IP');
  if (cfIP) return cfIP;

  // Fallback to X-Forwarded-For
  const xForwardedFor = request.headers.get('X-Forwarded-For');
  if (xForwardedFor) {
    return xForwardedFor.split(',')[0].trim();
  }

  // Fallback to X-Real-IP
  const xRealIP = request.headers.get('X-Real-IP');
  if (xRealIP) return xRealIP;

  // Last resort fallback
  return undefined;
};

const getBlockedIPs = async (): Promise<Set<string>> => {
  try {
    const obj = await env.DRAWINGS.get(BLOCKED_IPS_KEY);
    if (!obj) return new Set();
    const blockedList = JSON.parse(await obj.text());
    return new Set(blockedList);
  } catch (e) {
    console.error('Error loading blocked IPs:', e);
    return new Set();
  }
};

const saveBlockedIPs = async (blockedIPs: Set<string>): Promise<void> => {
  try {
    const blockedList = Array.from(blockedIPs);
    await env.DRAWINGS.put(BLOCKED_IPS_KEY, JSON.stringify(blockedList));
  } catch (e) {
    console.error('Error saving blocked IPs:', e);
  }
};

const getDrawingMetadata = async (): Promise<DrawingMetadata[]> => {
  try {
    const obj = await env.DRAWINGS.get(DRAWING_METADATA_KEY);
    if (!obj) return [];
    return JSON.parse(await obj.text());
  } catch (e) {
    console.error('Error loading drawing metadata:', e);
    return [];
  }
};

const backfillMetadata = async (drawingCount: number): Promise<DrawingMetadata[]> => {
  const metadata = await getDrawingMetadata();

  // If metadata is empty or has fewer entries than drawings, backfill
  if (metadata.length < drawingCount) {
    const missingCount = drawingCount - metadata.length;
    const backfillEntries: DrawingMetadata[] = [];

    for (let i = 0; i < missingCount; i++) {
      backfillEntries.push({
        id: undefined,
        ip: undefined,
        timestamp: undefined
      });
    }

    // Add backfill entries at the beginning to match existing drawing indices
    const updatedMetadata = [...backfillEntries, ...metadata];
    await saveDrawingMetadata(updatedMetadata);
    return updatedMetadata;
  }

  return metadata;
};

const saveDrawingMetadata = async (metadata: DrawingMetadata[]): Promise<void> => {
  try {
    await env.DRAWINGS.put(DRAWING_METADATA_KEY, JSON.stringify(metadata));
  } catch (e) {
    console.error('Error saving drawing metadata:', e);
  }
};

const parseDrawings = (fileContent: Uint8Array): Uint8Array[] => {
  const drawingsData: Uint8Array[] = [];
  let startIndex = 0;
  // parse the file content into separate drawings
  for (let i = 0; i < fileContent.length; i++) {
    if (fileContent[i] === delimiter[0]) {
      if (i > startIndex) {
        drawingsData.push(fileContent.slice(startIndex, i));
      }
      startIndex = i + 1;
    }
  }
  // push the last drawing if it exists
  if (startIndex < fileContent.length) {
    drawingsData.push(fileContent.slice(startIndex));
  }
  return drawingsData;
};

const serializeDrawings = (drawingsData: Uint8Array[]): Uint8Array => {
  const totalLength = drawingsData.length * 64 + drawingsData.length - 1;
  const finalBuffer = new Uint8Array(totalLength);
  let offset = 0;
  drawingsData.forEach((drawing, i) => {
    finalBuffer.set(drawing, offset);
    offset += drawing.length;
    if (i < drawingsData.length - 1) {
      finalBuffer.set(delimiter, offset);
      offset += delimiter.length;
    }
  });
  return finalBuffer;
};

export const GET: APIRoute = async () => {
  try {
    const obj = await env.DRAWINGS.get(DRAWINGS_KEY);
    const content = obj ? await obj.arrayBuffer() : new ArrayBuffer(0);
    return new Response(new Uint8Array(content), {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (e) {
    console.error('Error retrieving drawings:', e);
    return new Response('Error retrieving drawings', { status: 500 });
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const clientIP = getClientIP(request);

    // Check if IP is blocked
    const blockedIPs = await getBlockedIPs();
    if (blockedIPs.has(clientIP || '---')) {
      return new Response('Unable to process request at this time', { status: 503 });
    }

    const buffer = new Uint8Array(await request.arrayBuffer());
    const existing = await env.DRAWINGS.get(DRAWINGS_KEY);
    const existingBuffer = existing ? new Uint8Array(await existing.arrayBuffer()) : new Uint8Array(0);
    const drawingsData = parseDrawings(existingBuffer);

    // Add the new drawing
    drawingsData.push(buffer);
    const newBuffer = serializeDrawings(drawingsData);
    await env.DRAWINGS.put(DRAWINGS_KEY, newBuffer);

    // Store drawing metadata with IP
    const metadata = await backfillMetadata(drawingsData.length - 1);
    const drawingId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    metadata.push({
      id: drawingId,
      ip: clientIP,
      timestamp: Date.now()
    });
    await saveDrawingMetadata(metadata);

    // Send notification to Discord webhook
    await fetch(GUESTBOOK_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: `A new drawing has been posted from IP: ${clientIP}` })
    });

    return new Response('Drawing received', { status: 200 });
  } catch (e) {
    console.error('Error saving drawing:', e);
    return new Response('Error saving drawing', { status: 500 });
  }
};

export const DELETE: APIRoute = async ({ request }) => {
  const clientKey = request.headers.get('secret-key');
  const indexHeader = request.headers.get('drawing-index');
  const blockIPHeader = request.headers.get('block-ip');
  const drawingIndexToDelete = indexHeader ? parseInt(indexHeader, 10) : NaN;
  const shouldBlockIP = blockIPHeader === 'true';

  if (!clientKey || isNaN(drawingIndexToDelete) || drawingIndexToDelete < 0) {
    return new Response('Missing or invalid secret key or drawing index.', { status: 400 });
  }
  const serverKey = GUESTBOOK_SECRET_KEY;
  if (clientKey !== serverKey) {
    return new Response('Invalid secret key.', { status: 403 });
  }

  try {
    const obj = await env.DRAWINGS.get(DRAWINGS_KEY);
    if (!obj) {
      return new Response('No drawings found to delete.', { status: 404 });
    }
    const fileContent = new Uint8Array(await obj.arrayBuffer());
    if (fileContent.length === 0) {
      return new Response('Drawings file is empty.', { status: 404 });
    }
    const drawingsData = parseDrawings(fileContent);
    if (drawingIndexToDelete >= drawingsData.length) {
      return new Response('Drawing index out of bounds.', { status: 400 });
    }

    // Get drawing metadata to find the IP address
    const metadata = await backfillMetadata(drawingsData.length);
    let ipToBlock = null;
    if (shouldBlockIP && metadata[drawingIndexToDelete] && metadata[drawingIndexToDelete].ip) {
      ipToBlock = metadata[drawingIndexToDelete].ip;
    }

    // Remove the drawing
    drawingsData.splice(drawingIndexToDelete, 1);
    const newBuffer = serializeDrawings(drawingsData);
    await env.DRAWINGS.put(DRAWINGS_KEY, newBuffer);

    // Remove corresponding metadata
    metadata.splice(drawingIndexToDelete, 1);
    await saveDrawingMetadata(metadata);

    // Block the IP if requested
    if (shouldBlockIP && ipToBlock) {
      const blockedIPs = await getBlockedIPs();
      blockedIPs.add(ipToBlock);
      await saveBlockedIPs(blockedIPs);

      // Send notification about the blocked IP
      await fetch(GUESTBOOK_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: `Drawing deleted and IP blocked: ${ipToBlock}` })
      });

      return new Response(`Drawing deleted successfully and IP ${ipToBlock} has been blocked.`, { status: 200 });
    } else if (shouldBlockIP && !ipToBlock) {
      // Send notification that IP couldn't be blocked (legacy drawing)
      await fetch(GUESTBOOK_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: `Drawing deleted but IP could not be blocked (legacy drawing without IP metadata)` })
      });

      return new Response('Drawing deleted successfully, but IP could not be blocked (legacy drawing).', { status: 200 });
    }

    return new Response('Drawing deleted successfully.', { status: 200 });
  } catch (e) {
    console.error('Error deleting drawing:', e);
    return new Response('Error deleting drawing.', { status: 500 });
  }
};
