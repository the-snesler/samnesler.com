// Every tunable for the hero runner lives here so the game can be re-balanced without reading the
// simulation. Distances are in world units; one unit is one tile wide, and the HUD calls a unit a
// "metre". The tunnel is a regular prism the camera flies through from the inside: `SIDES` faces,
// each exactly `TILE_WIDTH` across, so a lane index doubles as a lateral world coordinate.

export const SIDES = 9;
export const TILE_WIDTH = 1;
export const TILE_DEPTH = 1.15;

/** Distance from the tunnel axis to the middle of a face. */
export const APOTHEM = TILE_WIDTH / 2 / Math.tan(Math.PI / SIDES);

/** Shrinks each drawn tile so neighbours read as a grid rather than one continuous surface. */
export const TILE_GAP = 0.035;

export const PLAYER = {
  /** Half of the collision width, in lanes. Narrower than the sprite so near misses feel fair. */
  halfWidth: 0.2,
  spriteWidth: 0.85,
  spriteHeight: 1.05,
  /**
   * Sideways speed is a fraction of forward speed rather than a constant. That keeps "lanes moved
   * per ring passed" fixed at every difficulty, which is what lets the generator promise that a
   * path it carves is actually walkable — see `LANE_SHIFT_RINGS`.
   */
  strafeRatio: 0.5,
  /** Seconds to reach full sideways speed from a standstill. */
  strafeRampTime: 0.09,
  gravity: 30,
  jumpVelocity: 6.6,
  /** Grace period after walking off an edge during which a jump still fires. */
  coyoteTime: 0.1,
  /** A jump pressed this long before landing still fires on touchdown. */
  jumpBufferTime: 0.12,
  /** How far below the floor plane the runner drops before the run is over. */
  fallDeathDepth: 2.4,
  /** Seconds the death animation plays before the game-over panel appears. */
  deathLingerTime: 0.85,
  runCycleRate: 0.55
} as const;

export const BLOCK = {
  /** Comfortably below the jump apex (`jumpVelocity² / 2·gravity` ≈ 0.73). */
  height: 0.55,
  /**
   * Collision half-width. `BLOCK.halfWidth + PLAYER.halfWidth` stays under half a lane on purpose:
   * standing anywhere on a safe tile can never clip a block on the tile next door.
   */
  halfWidth: 0.28,
  /** Drawn slightly wider than it collides, which reads as generous rather than sloppy. */
  drawHalfWidth: 0.36,
  drawHalfDepth: (TILE_DEPTH / 2) * 0.85
} as const;

export const SPEED = {
  start: 9.5,
  max: 23,
  /** Larger = the ramp to `max` is stretched over more distance. */
  ramp: 1400
} as const;

/** Distance at which the section generator is at full difficulty. */
export const DIFFICULTY_RAMP = 1800;

export const CAMERA = {
  /** Height above the floor the camera floats at. */
  height: 1.45,
  /** How far behind the runner the camera trails. */
  distance: 4,
  /** Focal length as a fraction of canvas height. A shorter lens shows more tunnel ahead. */
  fovScale: 0.72,
  /** Camera-space depth at which geometry is clipped away. */
  near: 0.35,
  /** How many rings ahead are drawn. Fog hides the cut-off. */
  drawRings: 48,
  /** Rings behind the runner that are still drawn (they fill the bottom of the frame). */
  trailRings: 4,
  /** Fraction of the draw distance at which fog starts. */
  fogStart: 0.45
} as const;

/**
 * Where a run begins. Starting a few rings in means there is already tunnel *behind* the camera on
 * the very first frame — otherwise the start screen shows the tunnel from outside its mouth.
 */
export const START_Z = TILE_DEPTH * (CAMERA.trailRings + 2);

export function speedAt(distance: number): number {
  return SPEED.start + (SPEED.max - SPEED.start) * (1 - Math.exp(-Math.max(0, distance) / SPEED.ramp));
}

export function difficultyAt(distance: number): number {
  return Math.min(1, Math.max(0, distance) / DIFFICULTY_RAMP);
}

/** Seconds spent in the air on a full jump. */
export const AIR_TIME = (2 * PLAYER.jumpVelocity) / PLAYER.gravity;

/**
 * Rings the generator must leave between two shifts of the guaranteed path, so a runner travelling
 * at any speed can still slide one lane over in time. `strafeRatio · TILE_DEPTH` is lanes-per-ring,
 * which is speed-independent by construction; the 1.5 is margin for reaction time.
 */
export const LANE_SHIFT_RINGS = Math.max(2, Math.ceil(1.5 / (PLAYER.strafeRatio * TILE_DEPTH)));

/** Widest all-lanes-missing gap that is still clearable at `speed`, in rings. */
export function maxJumpRings(speed: number): number {
  return Math.max(1, Math.floor(((AIR_TIME * speed) / TILE_DEPTH) * 0.55));
}

// Sprites are plain PNG sheets under `public/game/` — swap the files (keeping the frame size) and
// the game picks them up with no code change. See `public/game/README.md`.
export interface SpriteSheet {
  src: string;
  frameWidth: number;
  frameHeight: number;
  /** Total frames in the sheet, laid out left to right in a single row. */
  frames: number;
}

export const SPRITES = {
  /** Frames 0-3 are the run cycle, 4 is the rising pose, 5 is the falling pose. */
  player: { src: '/game/player.png', frameWidth: 32, frameHeight: 32, frames: 6 } as SpriteSheet,
  /** Drawn on the face of an obstacle block. */
  block: { src: '/game/block.png', frameWidth: 32, frameHeight: 32, frames: 1 } as SpriteSheet
} as const;

export const PLAYER_FRAMES = { run: [0, 1, 2, 3], rise: 4, fall: 5 } as const;

export interface Hsl {
  h: number;
  s: number;
  l: number;
}

export interface Palette {
  voidTop: string;
  voidBottom: string;
  tile: Hsl;
  homeTile: Hsl;
  fog: Hsl;
  block: Hsl;
  shadow: string;
  fallback: string;
}

export const PALETTES: Record<'light' | 'dark', Palette> = {
  light: {
    voidTop: '#e4e2fb',
    voidBottom: '#c3c7ef',
    tile: { h: 250, s: 40, l: 66 },
    homeTile: { h: 255, s: 88, l: 72 },
    fog: { h: 248, s: 45, l: 90 },
    block: { h: 340, s: 72, l: 62 },
    shadow: 'rgba(40, 30, 90, 0.28)',
    fallback: '#8b7bf0'
  },
  dark: {
    voidTop: '#111634',
    voidBottom: '#05060f',
    tile: { h: 250, s: 30, l: 46 },
    homeTile: { h: 258, s: 85, l: 62 },
    fog: { h: 236, s: 45, l: 9 },
    block: { h: 340, s: 70, l: 55 },
    shadow: 'rgba(0, 0, 0, 0.45)',
    fallback: '#a78bfa'
  }
};
