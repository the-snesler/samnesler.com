import type { APIRoute } from 'astro';
import { OPENAI_API_KEY } from 'astro:env/server';

import type { ItemCategory, ParsedReceipt } from '@/components/tools/BillSplitter/types';

export const prerender = false;

const OPENAI_MODEL = 'gpt-5-nano';
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif'
]);

const RECEIPT_PROMPT = `Read this restaurant receipt and call the extract_receipt tool.

Rules:
- Include all purchased line items.
- If a line item includes quantity > 1 (for example "2 Tonkotsu Belly $29.90"), split it into separate items with per-item price.
- category must be "entree" for main dishes/meals, "other" for assignable non-entree items, and "shared" for table-wide adjustments (delivery fees, service fees, bundle/discount coupons).
- price must be a numeric per-item amount with no currency symbol. Negative prices are allowed for discounts/coupons.
- subtotal should be pre-tax subtotal when present, otherwise null.
- tax should be tax amount when present, otherwise null.
- total should be post-tax total when present, otherwise null.
`;

interface OpenAICompletion {
  choices?: Array<{
    message?: {
      tool_calls?: Array<{
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
  }>;
  error?: {
    message?: string;
  };
}

const numberOrNullSchema = {
  anyOf: [{ type: 'number' }, { type: 'null' }]
};

const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
};

const roundMoney = (value: number): number => Math.round(value * 100) / 100;

const toMoneyOrNull = (value: unknown): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  return roundMoney(value);
};

const toCategory = (value: unknown): ItemCategory => {
  if (value === 'shared') {
    return 'shared';
  }
  return value === 'entree' ? 'entree' : 'other';
};

const sanitizeReceipt = (raw: unknown): ParsedReceipt => {
  const data = raw && typeof raw === 'object' ? raw : {};
  const rawItems = Array.isArray((data as { items?: unknown[] }).items) ? (data as { items: unknown[] }).items : [];

  const items = rawItems
    .map(item => {
      const entry = item && typeof item === 'object' ? item : {};
      const name = typeof (entry as { name?: unknown }).name === 'string' ? (entry as { name: string }).name.trim() : '';
      const price = toMoneyOrNull((entry as { price?: unknown }).price);

      if (!name || price === null || price === 0) {
        return null;
      }

      return {
        name,
        price,
        category: toCategory((entry as { category?: unknown }).category)
      };
    })
    .filter((item): item is ParsedReceipt['items'][number] => item !== null);

  const fallbackSubtotal = roundMoney(items.reduce((sum, item) => sum + item.price, 0));
  const subtotal = toMoneyOrNull((data as { subtotal?: unknown }).subtotal) ?? fallbackSubtotal;

  return {
    items,
    subtotal,
    tax: toMoneyOrNull((data as { tax?: unknown }).tax),
    total: toMoneyOrNull((data as { total?: unknown }).total)
  };
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const formData = await request.formData();
    const image = formData.get('image');

    if (!(image instanceof File)) {
      return new Response('Missing image file', { status: 400 });
    }

    if (image.size <= 0 || image.size > MAX_IMAGE_BYTES) {
      return new Response('Image must be between 1 byte and 6MB', { status: 413 });
    }

    const mimeType = image.type || 'image/jpeg';
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      return new Response('Unsupported image type', { status: 415 });
    }

    const imageBuffer = await image.arrayBuffer();
    const imageBase64 = arrayBufferToBase64(imageBuffer);

    const openAIResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 1,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: RECEIPT_PROMPT },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${imageBase64}`
                }
              }
            ]
          }
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'extract_receipt',
              description: 'Extract normalized receipt data from an image.',
              strict: true,
              parameters: {
                type: 'object',
                additionalProperties: false,
                required: ['items', 'subtotal', 'tax', 'total'],
                properties: {
                  items: {
                    type: 'array',
                    items: {
                      type: 'object',
                      additionalProperties: false,
                      required: ['name', 'price', 'category'],
                      properties: {
                        name: { type: 'string' },
                        price: { type: 'number' },
                        category: { type: 'string', enum: ['entree', 'other', 'shared'] }
                      }
                    }
                  },
                  subtotal: numberOrNullSchema,
                  tax: numberOrNullSchema,
                  total: numberOrNullSchema
                }
              }
            }
          }
        ],
        tool_choice: {
          type: 'function',
          function: {
            name: 'extract_receipt'
          }
        }
      })
    });

    if (!openAIResponse.ok) {
      const errorBody = await openAIResponse.text();
      console.error('OpenAI parse request failed:', openAIResponse.status, errorBody);
      return new Response('Failed to parse receipt image', { status: 502 });
    }

    const completion = (await openAIResponse.json()) as OpenAICompletion;
    const toolArguments = completion.choices?.[0]?.message?.tool_calls?.find(call => call.function?.name === 'extract_receipt')?.function?.arguments;

    if (!toolArguments) {
      console.error('No extract_receipt tool output', completion);
      return new Response('Failed to parse receipt image', { status: 502 });
    }

    const parsedToolArgs = JSON.parse(toolArguments) as unknown;
    const parsedReceipt = sanitizeReceipt(parsedToolArgs);

    if (parsedReceipt.items.length === 0) {
      return new Response('No receipt items found', { status: 422 });
    }

    return Response.json(parsedReceipt, {
      status: 200,
      headers: {
        'Cache-Control': 'no-store'
      }
    });
  } catch (error) {
    console.error('Receipt parse error:', error);
    return new Response('Error parsing receipt image', { status: 500 });
  }
};
