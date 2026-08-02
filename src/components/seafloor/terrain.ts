import { Geometry } from 'ogl';
import type { OGLRenderingContext } from 'ogl';

/**
 * The seafloor heightfield lives here and only here.
 *
 * Rock/flora placement is a CPU operation, so a GLSL copy of this function would be a second
 * home for the same knowledge — and float precision differs enough between JS doubles and
 * `highp` that instances would visibly float or sink. Instead the grid is evaluated once on
 * the CPU and handed to the vertex shader as an `aHeight` attribute, so there is exactly one
 * authority for "how high is the floor at (x, y)".
 */

export interface TerrainBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export const SEAFLOOR_BOUNDS: TerrainBounds = { minX: -48, maxX: 48, minY: -7, maxY: 20 };

/** Integer hash — exact in JS, no `sin` precision games. */
function hash2i(ix: number, iy: number, seed: number): number {
  let h = Math.imul(ix | 0, 374761393) ^ Math.imul(iy | 0, 668265263) ^ Math.imul(seed | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function vnoise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2i(ix, iy, seed);
  const b = hash2i(ix + 1, iy, seed);
  const c = hash2i(ix, iy + 1, seed);
  const d = hash2i(ix + 1, iy + 1, seed);
  return (a * (1 - ux) + b * ux) * (1 - uy) + (c * (1 - ux) + d * ux) * uy;
}

function fbm(x: number, y: number, seed: number, octaves: number): number {
  let amp = 0.5;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * vnoise(x * freq, y * freq, seed + i * 977);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

/** Static height of the floor at a world XY, in world units. */
export type HeightField = (x: number, y: number) => number;

export function makeHeightField(seed: number, amplitude: number): HeightField {
  return (x, y) => {
    const dunes = fbm(x * 0.075, y * 0.075, seed, 4);
    const detail = fbm(x * 0.34, y * 0.34, seed + 4099, 3);
    // Short-wavelength lumps: these are what break the silhouette so the floor stops reading
    // as a tilted plane. Kept small so plants and rocks still sit convincingly.
    const bumps = fbm(x * 1.05, y * 1.05, seed + 8191, 2);
    const ripples = Math.sin(x * 0.85 + dunes * 7) * Math.sin(y * 0.62 + detail * 4);
    return ((dunes - 0.5) * 2.6 + (detail - 0.5) * 1.15 + (bumps - 0.5) * 0.5 + ripples * 0.2) * amplitude;
  };
}

/**
 * Flat grid in XY (this scene family is Z-up, +Y forward — see WaterEffect's camera).
 * `aHeight` carries the static displacement; the vertex shader applies it so the mesh stays
 * a plain grid and the deformation is visible where it is read.
 */
export function buildTerrainGeometry(gl: OGLRenderingContext, bounds: TerrainBounds, segX: number, segY: number, height: HeightField): Geometry {
  const nx = segX + 1;
  const ny = segY + 1;
  const count = nx * ny;
  const position = new Float32Array(count * 3);
  const normal = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  const aHeight = new Float32Array(count);
  const index = new Uint32Array(segX * segY * 6);

  const spanX = bounds.maxX - bounds.minX;
  const spanY = bounds.maxY - bounds.minY;
  const eps = 0.25;

  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      const x = bounds.minX + (spanX * i) / segX;
      const y = bounds.minY + (spanY * j) / segY;

      position[k * 3] = x;
      position[k * 3 + 1] = y;
      position[k * 3 + 2] = 0;
      uv[k * 2] = i / segX;
      uv[k * 2 + 1] = j / segY;
      aHeight[k] = height(x, y);

      // Analytic-ish normal from central differences of the same field.
      const dx = height(x + eps, y) - height(x - eps, y);
      const dy = height(x, y + eps) - height(x, y - eps);
      const nxv = -dx / (2 * eps);
      const nyv = -dy / (2 * eps);
      const len = Math.hypot(nxv, nyv, 1);
      normal[k * 3] = nxv / len;
      normal[k * 3 + 1] = nyv / len;
      normal[k * 3 + 2] = 1 / len;
    }
  }

  let t = 0;
  for (let j = 0; j < segY; j++) {
    for (let i = 0; i < segX; i++) {
      const a = j * nx + i;
      const b = a + 1;
      const c = a + nx;
      const d = c + 1;
      index[t++] = a;
      index[t++] = c;
      index[t++] = b;
      index[t++] = b;
      index[t++] = c;
      index[t++] = d;
    }
  }

  return new Geometry(gl, {
    position: { size: 3, data: position },
    normal: { size: 3, data: normal },
    uv: { size: 2, data: uv },
    aHeight: { size: 1, data: aHeight },
    index: { data: index }
  });
}

/** Deterministic PRNG so every visitor sees the same seafloor. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface RockInstances {
  offset: Float32Array;
  scale: Float32Array;
  seed: Float32Array;
  count: number;
}

export function scatterRocks(count: number, rand: () => number, bounds: TerrainBounds, height: HeightField): RockInstances {
  const offset = new Float32Array(count * 3);
  const scale = new Float32Array(count * 3);
  const seed = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const x = bounds.minX * 0.8 + rand() * (bounds.maxX - bounds.minX) * 0.8;
    const y = bounds.minY + 1 + rand() * (bounds.maxY - bounds.minY - 3);
    // Biased small: a field of pebbles with the occasional boulder. A seagrass tuft is
    // ~1.1 world units tall, so anything past ~0.8 across already reads as a landmark.
    const r = 0.13 + rand() * rand() * 0.62;
    const sx = r * (0.85 + rand() * 0.5);
    const sy = r * (0.85 + rand() * 0.5);
    const sz = r * (0.6 + rand() * 0.5);

    offset[i * 3] = x;
    offset[i * 3 + 1] = y;
    offset[i * 3 + 2] = height(x, y) - sz * 0.3; // partially buried
    scale[i * 3] = sx;
    scale[i * 3 + 1] = sy;
    scale[i * 3 + 2] = sz;
    seed[i] = rand() * 100;
  }

  return { offset, scale, seed, count };
}

export interface FloraInstances {
  offset: Float32Array;
  scale: Float32Array;
  phase: Float32Array;
  frame: Float32Array;
  /** How many times the atlas frame repeats up the quad (1 = frame is the whole plant). */
  tiles: Float32Array;
  count: number;
}

export interface FloraScatterOptions {
  minY: number;
  maxY: number;
  spreadX: number;
  /** Height of the plant in texture blocks. */
  minBlocks: number;
  maxBlocks: number;
  /** How many texture blocks one atlas frame covers (seagrass: 2, kelp: 1). */
  blocksPerFrame: number;
  /** World units per texture block. */
  blockSize: number;
  frameCount: number;
  /** Grouped tufts look planted; 1 = fully uniform scatter. */
  clumpSize: number;
}

export function scatterFlora(count: number, rand: () => number, height: HeightField, opts: FloraScatterOptions): FloraInstances {
  const offset = new Float32Array(count * 3);
  const scale = new Float32Array(count * 2);
  const phase = new Float32Array(count);
  const frame = new Float32Array(count);
  const tiles = new Float32Array(count);

  let clumpLeft = 0;
  let cx = 0;
  let cy = 0;

  for (let i = 0; i < count; i++) {
    if (clumpLeft === 0) {
      cx = (rand() * 2 - 1) * opts.spreadX;
      cy = opts.minY + rand() * (opts.maxY - opts.minY);
      clumpLeft = 1 + Math.floor(rand() * opts.clumpSize);
    }
    clumpLeft--;

    const x = cx + (rand() * 2 - 1) * 1.7;
    const y = cy + (rand() * 2 - 1) * 1.0;
    const blocks = opts.minBlocks + Math.floor(rand() * (opts.maxBlocks - opts.minBlocks + 1));
    const jitter = 0.85 + rand() * 0.32;

    offset[i * 3] = x;
    offset[i * 3 + 1] = y;
    offset[i * 3 + 2] = height(x, y) - 0.06; // sink the root a hair so it never hovers
    scale[i * 2] = opts.blockSize * jitter * (0.85 + rand() * 0.4);
    scale[i * 2 + 1] = blocks * opts.blockSize * jitter;
    phase[i] = rand() * Math.PI * 2;
    frame[i] = Math.floor(rand() * opts.frameCount);
    tiles[i] = blocks / opts.blocksPerFrame;
  }

  return { offset, scale, phase, frame, tiles, count };
}
