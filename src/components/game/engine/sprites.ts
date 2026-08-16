// Sprite loading and drawing. Sheets are single-row PNGs of equally sized frames; see
// `public/game/README.md`. A sheet that fails to load is not fatal — everything it would have drawn
// falls back to a flat rectangle, so replacing (or breaking) the placeholder art can never take the
// hero down with it.

import type { SpriteSheet } from './config';

export interface LoadedSheet {
  spec: SpriteSheet;
  image: HTMLImageElement | null;
}

export function loadSheet(spec: SpriteSheet): Promise<LoadedSheet> {
  return new Promise(resolve => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve({ spec, image });
    image.onerror = () => resolve({ spec, image: null });
    image.src = spec.src;
  });
}

export interface Point {
  x: number;
  y: number;
}

/** Draws one frame axis-aligned, `x`/`y` being the top-left corner of the destination box. */
export function drawFrame(
  ctx: CanvasRenderingContext2D,
  sheet: LoadedSheet,
  frame: number,
  x: number,
  y: number,
  w: number,
  h: number,
  fallback: string
): void {
  const { spec, image } = sheet;
  if (!image) {
    ctx.fillStyle = fallback;
    ctx.fillRect(x, y, w, h);
    return;
  }
  const index = Math.min(Math.max(0, frame | 0), spec.frames - 1);
  ctx.drawImage(image, index * spec.frameWidth, 0, spec.frameWidth, spec.frameHeight, x, y, w, h);
}

/**
 * Maps one frame onto a quad given three of its corners. The transform is affine, so it cannot
 * reproduce perspective foreshortening exactly — it is only used for block faces, which point at
 * the camera and distort too little for the difference to show.
 */
export function drawFrameQuad(
  ctx: CanvasRenderingContext2D,
  sheet: LoadedSheet,
  frame: number,
  topLeft: Point,
  topRight: Point,
  bottomLeft: Point,
  fallback: string
): void {
  const { spec, image } = sheet;
  if (!image) {
    ctx.fillStyle = fallback;
    ctx.beginPath();
    ctx.moveTo(topLeft.x, topLeft.y);
    ctx.lineTo(topRight.x, topRight.y);
    ctx.lineTo(topRight.x + (bottomLeft.x - topLeft.x), topRight.y + (bottomLeft.y - topLeft.y));
    ctx.lineTo(bottomLeft.x, bottomLeft.y);
    ctx.closePath();
    ctx.fill();
    return;
  }
  const index = Math.min(Math.max(0, frame | 0), spec.frames - 1);
  const w = spec.frameWidth;
  const h = spec.frameHeight;
  ctx.save();
  ctx.transform(
    (topRight.x - topLeft.x) / w,
    (topRight.y - topLeft.y) / w,
    (bottomLeft.x - topLeft.x) / h,
    (bottomLeft.y - topLeft.y) / h,
    topLeft.x,
    topLeft.y
  );
  ctx.drawImage(image, index * w, 0, w, h, 0, 0, w, h);
  ctx.restore();
}
