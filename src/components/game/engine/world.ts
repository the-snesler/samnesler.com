// Procedural tunnel generation.
//
// The tunnel is an endless stack of rings; ring `r` covers z ∈ [r·TILE_DEPTH, (r+1)·TILE_DEPTH) and
// holds one flag byte per lane. Rings are generated a section at a time, ahead of the runner, and
// dropped once they are behind the camera.
//
// Fairness comes from one invariant: the generator tracks a *band* of lanes that is solid and
// obstacle-free in every ring it emits, and the band may only change by one lane every
// `LANE_SHIFT_RINGS` rings — the distance a runner can reliably slide sideways in that time at any
// speed (see `config.ts`). A section therefore cannot drop a narrow corridor on the far side of the
// tunnel; it has to funnel there, one lane at a time, in full view. The only exception is a `gap`
// section, whose empty rings are capped at `maxJumpRings` of the current speed.

import { LANE_SHIFT_RINGS, SIDES, TILE_DEPTH, difficultyAt, maxJumpRings, speedAt } from './config';
import { mulberry32, pickWeighted, randInt, type Rng } from './rng';

export const EMPTY = 0;
export const SOLID = 1;
export const BLOCK = 2;

export type SectionKind = 'flat' | 'scatter' | 'corridor' | 'spiral' | 'gap' | 'blocks';

export const SECTION_KINDS: readonly SectionKind[] = ['flat', 'scatter', 'corridor', 'spiral', 'gap', 'blocks'];

/** Rings of fully solid tunnel before the generator is allowed to get creative. */
export const WARMUP_RINGS = 26;

/** Safety valve so a mis-tuned section can never spin forever. */
const MAX_SECTION_RINGS = 96;

export interface World {
  readonly seed: number;
  readonly rings: Map<number, Uint8Array>;
  rng: Rng;
  /** First ring that has not been generated yet. */
  nextRing: number;
  /** Guaranteed-safe lane range, in unwrapped lane coordinates (`bandLo <= bandHi`). */
  bandLo: number;
  bandHi: number;
  ringsSinceBandEdit: number;
  lastSection: SectionKind | null;
}

export function laneIndex(lane: number): number {
  return ((lane % SIDES) + SIDES) % SIDES;
}

export function createWorld(seed: number): World {
  const half = Math.floor(SIDES / 2);
  return {
    seed,
    rings: new Map(),
    rng: mulberry32(seed),
    nextRing: 0,
    bandLo: -half,
    bandHi: SIDES - 1 - half,
    ringsSinceBandEdit: 0,
    lastSection: null
  };
}

export function tileAt(world: World, ring: number, lane: number): number {
  const tiles = world.rings.get(ring);
  return tiles ? tiles[laneIndex(lane)] : EMPTY;
}

export function isSolid(world: World, ring: number, lane: number): boolean {
  return (tileAt(world, ring, lane) & SOLID) !== 0;
}

export function hasBlock(world: World, ring: number, lane: number): boolean {
  return (tileAt(world, ring, lane) & BLOCK) !== 0;
}

/** Generates whole sections until `throughRing` exists. */
export function ensureGenerated(world: World, throughRing: number): void {
  while (world.nextRing <= throughRing) generateSection(world);
}

/** Drops rings the camera has passed so a long run does not grow the ring map without bound. */
export function pruneBefore(world: World, ring: number): void {
  for (const key of world.rings.keys()) {
    if (key < ring) world.rings.delete(key);
  }
}

// --- ring emission -------------------------------------------------------------------------

/**
 * Writes one ring. Lanes inside the band are forced solid and obstacle-free unless `keepBand` is
 * false, which only a full-width gap uses.
 */
function emitRing(world: World, fill: (lane: number) => number, keepBand = true): void {
  const tiles = new Uint8Array(SIDES);
  for (let lane = 0; lane < SIDES; lane++) tiles[lane] = fill(lane);
  if (keepBand) {
    for (let lane = world.bandLo; lane <= world.bandHi; lane++) tiles[laneIndex(lane)] = SOLID;
  }
  world.rings.set(world.nextRing, tiles);
  world.nextRing++;
  world.ringsSinceBandEdit++;
}

/**
 * Nudges the band one step toward `[targetLo, targetHi]`, at most once every `LANE_SHIFT_RINGS`
 * rings. Growing is rate-limited too: a lane the runner cannot reach in time is not a lane the
 * generator may later count on them having reached.
 */
function steerBand(world: World, targetLo: number, targetHi: number): void {
  if (world.ringsSinceBandEdit < LANE_SHIFT_RINGS) return;
  const width = world.bandHi - world.bandLo + 1;
  const targetWidth = targetHi - targetLo + 1;
  const centerDelta = (targetLo + targetHi - world.bandLo - world.bandHi) / 2;

  if (width > targetWidth) {
    // Shrink from whichever end drags the band toward the target centre.
    if (centerDelta > 0) world.bandLo++;
    else world.bandHi--;
  } else if (width < targetWidth) {
    if (centerDelta > 0) world.bandHi++;
    else world.bandLo--;
  } else if (centerDelta !== 0) {
    const step = Math.sign(centerDelta);
    world.bandLo += step;
    world.bandHi += step;
  } else {
    return;
  }
  world.ringsSinceBandEdit = 0;
}

function bandAtTarget(world: World, targetLo: number, targetHi: number): boolean {
  return world.bandLo === targetLo && world.bandHi === targetHi;
}

/**
 * Picks a target band of `width` lanes somewhere near the current one. Staying close keeps the
 * funnel short — the band can only travel one lane per `LANE_SHIFT_RINGS`, so a target on the far
 * side of the tunnel would spend the whole section in transit.
 */
function targetNear(world: World, width: number, rng: Rng): [number, number] {
  const center = Math.round((world.bandLo + world.bandHi) / 2) + randInt(rng, -2, 2);
  const lo = center - Math.floor((width - 1) / 2);
  return [lo, lo + width - 1];
}

/** Lanes between `lane` and the nearest edge of the band, measured the short way around. */
function laneDistanceToBand(world: World, lane: number): number {
  let best = Number.POSITIVE_INFINITY;
  for (let turn = -1; turn <= 1; turn++) {
    const candidate = lane + turn * SIDES;
    const distance = candidate < world.bandLo ? world.bandLo - candidate : candidate > world.bandHi ? candidate - world.bandHi : 0;
    best = Math.min(best, distance);
  }
  return best;
}

/** Rings of solid ground a runner needs to reliably take off again after landing. */
function landingRings(speed: number): number {
  return Math.max(2, Math.ceil((0.18 * speed) / TILE_DEPTH));
}

// --- sections ------------------------------------------------------------------------------

function sectionFlat(world: World, rings: number): void {
  const half = Math.floor(SIDES / 2);
  for (let i = 0; i < rings; i++) {
    const center = Math.round((world.bandLo + world.bandHi) / 2);
    steerBand(world, center - half, center - half + SIDES - 1);
    emitRing(world, () => SOLID);
  }
}

function sectionScatter(world: World, difficulty: number): void {
  const width = Math.max(3, 6 - Math.round(difficulty * 3));
  const [lo, hi] = targetNear(world, width, world.rng);
  const holeChance = 0.45 + 0.45 * difficulty;
  const hold = randInt(world.rng, 8, 14);
  let held = 0;
  for (let i = 0; i < MAX_SECTION_RINGS && held < hold; i++) {
    steerBand(world, lo, hi);
    if (bandAtTarget(world, lo, hi)) held++;
    emitRing(world, () => (world.rng() < holeChance ? EMPTY : SOLID));
  }
}

function sectionCorridor(world: World, difficulty: number): void {
  const width = difficulty > 0.55 ? 2 : 3;
  const [lo, hi] = targetNear(world, width, world.rng);
  const hold = randInt(world.rng, 8, 16);
  let held = 0;
  for (let i = 0; i < MAX_SECTION_RINGS && held < hold; i++) {
    steerBand(world, lo, hi);
    if (bandAtTarget(world, lo, hi)) held++;
    emitRing(world, () => EMPTY);
  }
}

function sectionSpiral(world: World, difficulty: number): void {
  const width = difficulty > 0.6 ? 2 : 3;
  const direction = world.rng() < 0.5 ? 1 : -1;
  let [lo, hi] = targetNear(world, width, world.rng);
  const steps = randInt(world.rng, 4, 9);
  let stepsTaken = 0;
  for (let i = 0; i < MAX_SECTION_RINGS && stepsTaken < steps; i++) {
    steerBand(world, lo, hi);
    if (bandAtTarget(world, lo, hi)) {
      // Keep walking the target around the tunnel so the band chases it forever.
      lo += direction;
      hi += direction;
      stepsTaken++;
    }
    emitRing(world, () => EMPTY);
  }
}

function sectionGap(world: World, difficulty: number, speed: number): void {
  const runway = landingRings(speed);
  const jumps = difficulty > 0.55 && world.rng() < 0.45 ? 2 : 1;
  const maxGap = maxJumpRings(speed);
  for (let j = 0; j < jumps; j++) {
    for (let i = 0; i < runway; i++) emitRing(world, () => SOLID);
    const gap = Math.min(maxGap, randInt(world.rng, 1, 1 + Math.round(difficulty * 3)));
    for (let i = 0; i < gap; i++) emitRing(world, () => EMPTY, false);
  }
  for (let i = 0; i < runway; i++) emitRing(world, () => SOLID);
}

function sectionBlocks(world: World, difficulty: number): void {
  const width = difficulty > 0.6 ? 2 : 3;
  const [lo, hi] = targetNear(world, width, world.rng);
  const hold = randInt(world.rng, 9, 15);
  let held = 0;
  for (let i = 0; i < MAX_SECTION_RINGS && held < hold; i++) {
    steerBand(world, lo, hi);
    if (bandAtTarget(world, lo, hi)) held++;
    // The floor stays whole here: this section is about threading walls at speed, not falling.
    // Walls only reach a couple of lanes past the safe band — blocks further around the tunnel
    // would never be in play, and would just clutter the view.
    const wall = i % 4 === 1;
    emitRing(world, lane => (wall && laneDistanceToBand(world, lane) <= 2 ? SOLID | BLOCK : SOLID));
  }
}

function sectionWeights(world: World, difficulty: number): (readonly [SectionKind, number])[] {
  const weights: (readonly [SectionKind, number])[] = [
    ['scatter', 1 + 1.5 * difficulty],
    ['corridor', 0.9 + 1.0 * difficulty],
    ['spiral', 0.2 + 1.7 * difficulty],
    ['gap', 0.8 + 1.2 * difficulty],
    ['blocks', 0.5 + 1.2 * difficulty]
  ];
  // Discourage, but do not forbid, two of the same section back to back.
  return weights.map(([kind, weight]) => [kind, kind === world.lastSection ? weight * 0.25 : weight] as const);
}

function generateSection(world: World): void {
  if (world.nextRing < WARMUP_RINGS) {
    sectionFlat(world, WARMUP_RINGS - world.nextRing);
    world.lastSection = 'flat';
    return;
  }

  const distance = world.nextRing * TILE_DEPTH;
  const difficulty = difficultyAt(distance);
  const speed = speedAt(distance);
  const kind = pickWeighted(world.rng, sectionWeights(world, difficulty));

  switch (kind) {
    case 'scatter':
      sectionScatter(world, difficulty);
      break;
    case 'corridor':
      sectionCorridor(world, difficulty);
      break;
    case 'spiral':
      sectionSpiral(world, difficulty);
      break;
    case 'gap':
      sectionGap(world, difficulty, speed);
      break;
    case 'blocks':
      sectionBlocks(world, difficulty);
      break;
    default:
      sectionFlat(world, 6);
      break;
  }
  world.lastSection = kind;

  // Every hard section is followed by a breather, which also re-widens the band.
  sectionFlat(world, Math.max(3, Math.round(7 - 4 * difficulty)));
}
