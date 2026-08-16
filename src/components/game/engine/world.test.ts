import { describe, expect, it } from 'vitest';

import { LANE_SHIFT_RINGS, SIDES, TILE_DEPTH, maxJumpRings, speedAt } from './config';
import { BLOCK, SOLID, WARMUP_RINGS, createWorld, ensureGenerated, laneIndex, pruneBefore, tileAt } from './world';

const RINGS = 2600;

function generate(seed: number, rings = RINGS): Uint8Array[] {
  const world = createWorld(seed);
  ensureGenerated(world, rings);
  return Array.from({ length: rings }, (_, ring) => {
    const tiles = world.rings.get(ring);
    if (!tiles) throw new Error(`ring ${ring} was never generated`);
    return tiles;
  });
}

const isAirRing = (tiles: Uint8Array) => tiles.every(tile => tile === 0);
const solidCount = (tiles: Uint8Array) => tiles.reduce((count, tile) => count + (tile & SOLID ? 1 : 0), 0);

/**
 * Walks a run under a deliberately pessimistic model of what a player can do: shift at most one
 * lane every `LANE_SHIFT_RINGS` rings, never pass through a block (in the real game blocks can be
 * jumped), and land only on solid tiles. If a path exists here, the generated tunnel is beatable.
 */
function findUnsurvivableRing(rings: Uint8Array[]): number | null {
  // Reachable states, keyed by lane, holding the fewest rings left before another shift is allowed.
  let states = new Map<number, number>([[0, 0]]);

  for (let ring = 0; ring < rings.length; ring++) {
    const tiles = rings[ring];
    if (!isAirRing(tiles)) {
      for (const lane of [...states.keys()]) {
        const tile = tiles[laneIndex(lane)];
        if ((tile & SOLID) === 0 || (tile & BLOCK) !== 0) states.delete(lane);
      }
    }
    if (states.size === 0) return ring;

    const next = new Map<number, number>();
    const offer = (lane: number, cooldown: number) => {
      const current = next.get(lane);
      if (current === undefined || cooldown < current) next.set(lane, cooldown);
    };
    for (const [lane, cooldown] of states) {
      offer(lane, Math.max(0, cooldown - 1));
      if (cooldown === 0) {
        offer(lane - 1, LANE_SHIFT_RINGS - 1);
        offer(lane + 1, LANE_SHIFT_RINGS - 1);
      }
    }
    states = next;
  }
  return null;
}

describe('tunnel generation', () => {
  it('is deterministic for a given seed', () => {
    const a = generate(1234, 400);
    const b = generate(1234, 400);
    expect(a.map(tiles => [...tiles])).toEqual(b.map(tiles => [...tiles]));
    expect(a).not.toEqual(generate(4321, 400));
  });

  it('opens with a solid warmup so the first seconds are never lethal', () => {
    const rings = generate(7, WARMUP_RINGS + 5);
    for (let ring = 0; ring < WARMUP_RINGS; ring++) {
      expect(solidCount(rings[ring])).toBe(SIDES);
    }
  });

  it('leaves a survivable path through every generated ring', () => {
    for (const seed of [1, 2, 99, 12345, 987654321]) {
      expect(findUnsurvivableRing(generate(seed))).toBeNull();
    }
  });

  it('never asks for a jump longer than the runner can clear', () => {
    for (const seed of [3, 77, 2024]) {
      const rings = generate(seed);
      let run = 0;
      for (let ring = 0; ring < rings.length; ring++) {
        if (isAirRing(rings[ring])) {
          run++;
          continue;
        }
        if (run > 0) {
          const gapStart = (ring - run) * TILE_DEPTH;
          expect(run).toBeLessThanOrEqual(maxJumpRings(speedAt(gapStart)));
          run = 0;
        }
      }
    }
  });

  it('gets harder with distance', () => {
    const early: number[] = [];
    const late: number[] = [];
    for (const seed of [11, 22, 33, 44]) {
      const rings = generate(seed);
      for (let ring = WARMUP_RINGS; ring < 300; ring++) early.push(solidCount(rings[ring]));
      for (let ring = rings.length - 300; ring < rings.length; ring++) late.push(solidCount(rings[ring]));
    }
    const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
    expect(mean(late)).toBeLessThan(mean(early));
    expect(speedAt(3000)).toBeGreaterThan(speedAt(100));
  });

  it('drops rings the camera has passed', () => {
    const world = createWorld(5);
    ensureGenerated(world, 300);
    const before = world.rings.size;
    pruneBefore(world, 200);
    expect(world.rings.size).toBeLessThan(before);
    expect(tileAt(world, 199, 0)).toBe(0);
    expect(world.rings.has(250)).toBe(true);
  });
});
