// Software 3D for the tunnel, drawn with plain canvas 2D.
//
// The world is a prism around the z axis. Rendering rolls it so the lane the runner is standing on
// is always straight down, which is what produces the Run-3 feeling of the tunnel rotating under
// you as you slide onto a wall — the runner themselves never leaves the middle of the frame.
//
// Everything is drawn back to front (painter's algorithm): rings from the fog line inward, with the
// runner slotted in right after the ring they occupy.

import {
  APOTHEM,
  BLOCK as BLOCK_SHAPE,
  CAMERA,
  PALETTES,
  PLAYER,
  PLAYER_FRAMES,
  SIDES,
  TILE_DEPTH,
  TILE_GAP,
  TILE_WIDTH,
  type Hsl,
  type Palette
} from './config';
import { drawFrame, drawFrameQuad, type LoadedSheet } from './sprites';
import type { RunnerState } from './types';
import { BLOCK, SOLID, laneIndex, tileAt, type World } from './world';

const FOG_STEPS = 12;
/** Half-width of a drawn tile, in world units. */
const TILE_HALF = TILE_WIDTH / 2 - TILE_GAP;

interface LaneView {
  cos: number;
  sin: number;
  base: Hsl;
}

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private width = 1;
  private height = 1;
  private dpr = 1;
  private palette: Palette = PALETTES.dark;
  private background: CanvasGradient | null = null;

  private playerSheet: LoadedSheet | null = null;
  private blockSheet: LoadedSheet | null = null;

  // Scratch buffers. Drawing a frame touches a few hundred quads, so nothing here allocates.
  private readonly poly = new Float64Array(24);
  private readonly clipped = new Float64Array(30);
  private readonly screen = new Float64Array(20);
  private readonly lanes: LaneView[] = Array.from({ length: SIDES }, () => ({ cos: 0, sin: 0, base: { h: 0, s: 0, l: 0 } }));
  private readonly colorCache: string[] = new Array(SIDES * (FOG_STEPS + 1)).fill('');

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('runner: 2d canvas context unavailable');
    this.ctx = ctx;
    this.resize();
  }

  setSprites(player: LoadedSheet, block: LoadedSheet): void {
    this.playerSheet = player;
    this.blockSheet = block;
  }

  setTheme(theme: 'light' | 'dark'): void {
    this.palette = PALETTES[theme];
    this.background = null;
  }

  /** Matches the drawing buffer to the element's box. Cheap to call; only touches the DOM on change. */
  resize(): void {
    const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(this.canvas.clientWidth));
    const height = Math.max(1, Math.round(this.canvas.clientHeight));
    if (width === this.width && height === this.height && dpr === this.dpr) return;
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.background = null;
  }

  draw(world: World, state: RunnerState): void {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    if (!this.background) {
      this.background = ctx.createLinearGradient(0, 0, 0, this.height);
      this.background.addColorStop(0, this.palette.voidTop);
      this.background.addColorStop(1, this.palette.voidBottom);
    }
    ctx.fillStyle = this.background;
    ctx.fillRect(0, 0, this.width, this.height);

    const focal = this.height * CAMERA.fovScale;
    const cx = this.width / 2;
    const cy = this.height / 2;
    const camZ = state.z - CAMERA.distance;
    // The camera drifts with the runner's height so a jump (or a fall through the floor) stays in
    // frame without the whole tunnel lurching.
    const follow = Math.min(1.5, Math.max(-1.2, state.height)) * 0.4;
    const camY = APOTHEM - CAMERA.height - follow;

    this.updateLanes(state.lane);

    const playerRing = Math.floor(state.z / TILE_DEPTH);
    const farRing = playerRing + CAMERA.drawRings;
    const nearRing = playerRing - CAMERA.trailRings;
    const fogStart = CAMERA.drawRings * CAMERA.fogStart;

    for (let ring = farRing; ring >= nearRing; ring--) {
      const fog = Math.min(1, Math.max(0, (ring - playerRing - fogStart) / (CAMERA.drawRings - fogStart)));
      const fogStep = Math.round(fog * FOG_STEPS);
      const z0 = ring * TILE_DEPTH + TILE_GAP;
      const z1 = (ring + 1) * TILE_DEPTH - TILE_GAP;

      for (let lane = 0; lane < SIDES; lane++) {
        const tile = tileAt(world, ring, lane);
        if ((tile & SOLID) === 0) continue;
        this.drawTile(lane, z0, z1, camZ, camY, focal, cx, cy, fogStep);
      }
      for (let lane = 0; lane < SIDES; lane++) {
        if ((tileAt(world, ring, lane) & BLOCK) === 0) continue;
        this.drawBlock(lane, ring, camZ, camY, focal, cx, cy, fogStep);
      }

      if (ring === playerRing) this.drawPlayer(world, state, camY, focal, cx, cy, playerRing);
    }
  }

  // --- geometry -----------------------------------------------------------------------------

  /**
   * Rebuilds the per-lane view for this frame. Rolling the world by the runner's *continuous* lane
   * (rather than the lane index) is what makes the tunnel rotate smoothly while strafing.
   */
  private updateLanes(playerLane: number): void {
    const home = laneIndex(Math.round(playerLane));
    this.colorCache.fill('');
    for (let lane = 0; lane < SIDES; lane++) {
      // ψ = π/2 puts a lane straight down the screen, which is where the runner's lane belongs.
      const psi = Math.PI / 2 + (2 * Math.PI * (lane - playerLane)) / SIDES;
      const view = this.lanes[lane];
      view.cos = Math.cos(psi);
      view.sin = Math.sin(psi);
      // sin(ψ) is 1 on the floor and -1 on the ceiling: free lambert-ish shading.
      const shade = 0.56 + 0.44 * (view.sin * 0.5 + 0.5);
      const source = lane === home ? this.palette.homeTile : this.palette.tile;
      view.base.h = source.h;
      view.base.s = source.s;
      view.base.l = source.l * shade;
    }
  }

  private tileColor(lane: number, fogStep: number): string {
    const key = lane * (FOG_STEPS + 1) + fogStep;
    const cached = this.colorCache[key];
    if (cached) return cached;
    const base = this.lanes[lane].base;
    const t = fogStep / FOG_STEPS;
    const fog = this.palette.fog;
    const color = `hsl(${base.h + (fog.h - base.h) * t} ${base.s + (fog.s - base.s) * t}% ${base.l + (fog.l - base.l) * t}%)`;
    this.colorCache[key] = color;
    return color;
  }

  private drawTile(lane: number, z0: number, z1: number, camZ: number, camY: number, focal: number, cx: number, cy: number, fogStep: number): void {
    const { cos, sin } = this.lanes[lane];
    const ax = APOTHEM * cos - TILE_HALF * sin;
    const ay = APOTHEM * sin + TILE_HALF * cos;
    const bx = APOTHEM * cos + TILE_HALF * sin;
    const by = APOTHEM * sin - TILE_HALF * cos;
    const p = this.poly;
    p[0] = ax;
    p[1] = ay;
    p[2] = z0 - camZ;
    p[3] = bx;
    p[4] = by;
    p[5] = z0 - camZ;
    p[6] = bx;
    p[7] = by;
    p[8] = z1 - camZ;
    p[9] = ax;
    p[10] = ay;
    p[11] = z1 - camZ;
    this.fillPolygon(4, camY, focal, cx, cy, this.tileColor(lane, fogStep));
  }

  private drawBlock(lane: number, ring: number, camZ: number, camY: number, focal: number, cx: number, cy: number, fogStep: number): void {
    const { cos, sin } = this.lanes[lane];
    const zCenter = (ring + 0.5) * TILE_DEPTH;
    const zNear = zCenter - BLOCK_SHAPE.drawHalfDepth - camZ;
    const zFar = zCenter + BLOCK_SHAPE.drawHalfDepth - camZ;
    if (zNear <= CAMERA.near) return;

    const w = BLOCK_SHAPE.drawHalfWidth;
    const top = APOTHEM - BLOCK_SHAPE.height;
    // Left/right and floor/top corners of the box in the tunnel cross-section.
    const lfx = APOTHEM * cos - w * sin;
    const lfy = APOTHEM * sin + w * cos;
    const rfx = APOTHEM * cos + w * sin;
    const rfy = APOTHEM * sin - w * cos;
    const ltx = top * cos - w * sin;
    const lty = top * sin + w * cos;
    const rtx = top * cos + w * sin;
    const rty = top * sin - w * cos;

    const fog = fogStep / FOG_STEPS;
    const block = this.palette.block;
    const fogColor = this.palette.fog;
    const mix = (l: number) =>
      `hsl(${block.h + (fogColor.h - block.h) * fog} ${block.s + (fogColor.s - block.s) * fog}% ${l + (fogColor.l - l) * fog}%)`;

    // Top face, then the near face over it. Sides are skipped: at this scale they are a pixel or
    // two, and leaving them out avoids sorting three faces per block.
    const p = this.poly;
    p[0] = ltx;
    p[1] = lty;
    p[2] = zNear;
    p[3] = rtx;
    p[4] = rty;
    p[5] = zNear;
    p[6] = rtx;
    p[7] = rty;
    p[8] = zFar;
    p[9] = ltx;
    p[10] = lty;
    p[11] = zFar;
    this.fillPolygon(4, camY, focal, cx, cy, mix(block.l * 1.25));

    const sheet = this.blockSheet;
    const tl = this.project(ltx, lty, zNear, camY, focal, cx, cy);
    const tr = this.project(rtx, rty, zNear, camY, focal, cx, cy);
    const bl = this.project(lfx, lfy, zNear, camY, focal, cx, cy);
    const br = this.project(rfx, rfy, zNear, camY, focal, cx, cy);
    if (sheet) {
      drawFrameQuad(this.ctx, sheet, 0, tl, tr, bl, mix(block.l));
    } else {
      const ctx = this.ctx;
      ctx.fillStyle = mix(block.l);
      ctx.beginPath();
      ctx.moveTo(tl.x, tl.y);
      ctx.lineTo(tr.x, tr.y);
      ctx.lineTo(br.x, br.y);
      ctx.lineTo(bl.x, bl.y);
      ctx.closePath();
      ctx.fill();
    }
    if (fog > 0.02) {
      // Fade the sprite into the fog the same way the flat geometry does.
      const ctx = this.ctx;
      ctx.globalAlpha = Math.min(1, fog);
      ctx.fillStyle = mix(fogColor.l);
      ctx.beginPath();
      ctx.moveTo(tl.x, tl.y);
      ctx.lineTo(tr.x, tr.y);
      ctx.lineTo(br.x, br.y);
      ctx.lineTo(bl.x, bl.y);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  private drawPlayer(world: World, state: RunnerState, camY: number, focal: number, cx: number, cy: number, playerRing: number): void {
    const ctx = this.ctx;
    const depth = CAMERA.distance;
    const scale = focal / depth;

    // The roll is centred on the runner, so they sit exactly on the middle of the frame.
    const feetY = cy + (focal * (APOTHEM - Math.max(state.height, -6) - camY)) / depth;

    if (state.height > 0.02 && (tileAt(world, playerRing, Math.round(state.lane)) & SOLID) !== 0) {
      const floorY = cy + (focal * (APOTHEM - camY)) / depth;
      const radius = 0.34 * scale;
      ctx.globalAlpha = Math.max(0.12, 0.5 - state.height * 0.28);
      ctx.fillStyle = this.palette.shadow;
      ctx.beginPath();
      ctx.ellipse(cx, floorY, radius, radius * 0.34, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    const w = PLAYER.spriteWidth * scale;
    const h = PLAYER.spriteHeight * scale;
    const frame = state.grounded
      ? PLAYER_FRAMES.run[Math.floor(state.runPhase) % PLAYER_FRAMES.run.length]
      : state.verticalVelocity > 0
        ? PLAYER_FRAMES.rise
        : PLAYER_FRAMES.fall;

    if (state.cause === 'crashed') ctx.globalAlpha = 0.65;
    if (this.playerSheet) {
      drawFrame(ctx, this.playerSheet, frame, cx - w / 2, feetY - h, w, h, this.palette.fallback);
    } else {
      ctx.fillStyle = this.palette.fallback;
      ctx.fillRect(cx - w / 2, feetY - h, w, h);
    }
    ctx.globalAlpha = 1;
  }

  // --- projection ---------------------------------------------------------------------------

  private project(x: number, y: number, z: number, camY: number, focal: number, cx: number, cy: number): { x: number; y: number } {
    const depth = Math.max(z, CAMERA.near);
    return { x: cx + (focal * x) / depth, y: cy + (focal * (y - camY)) / depth };
  }

  /** Clips `count` camera-space points in `this.poly` against the near plane, projects, and fills. */
  private fillPolygon(count: number, camY: number, focal: number, cx: number, cy: number, color: string): void {
    const clippedCount = this.clipNear(count);
    if (clippedCount < 3) return;
    const src = this.clipped;
    const dst = this.screen;
    for (let i = 0; i < clippedCount; i++) {
      const depth = src[i * 3 + 2];
      dst[i * 2] = cx + (focal * src[i * 3]) / depth;
      dst[i * 2 + 1] = cy + (focal * (src[i * 3 + 1] - camY)) / depth;
    }
    const ctx = this.ctx;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(dst[0], dst[1]);
    for (let i = 1; i < clippedCount; i++) ctx.lineTo(dst[i * 2], dst[i * 2 + 1]);
    ctx.closePath();
    ctx.fill();
  }

  /** Sutherland–Hodgman against the single plane z = near. */
  private clipNear(count: number): number {
    const src = this.poly;
    const dst = this.clipped;
    const near = CAMERA.near;
    let out = 0;
    for (let i = 0; i < count; i++) {
      const j = (i + 1) % count;
      const ax = src[i * 3];
      const ay = src[i * 3 + 1];
      const az = src[i * 3 + 2];
      const bx = src[j * 3];
      const by = src[j * 3 + 1];
      const bz = src[j * 3 + 2];
      const aIn = az >= near;
      const bIn = bz >= near;
      if (aIn) {
        dst[out * 3] = ax;
        dst[out * 3 + 1] = ay;
        dst[out * 3 + 2] = az;
        out++;
      }
      if (aIn !== bIn) {
        const t = (near - az) / (bz - az);
        dst[out * 3] = ax + (bx - ax) * t;
        dst[out * 3 + 1] = ay + (by - ay) * t;
        dst[out * 3 + 2] = near;
        out++;
      }
    }
    return out;
  }
}
