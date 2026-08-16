// The runner itself: fixed-step simulation, run lifecycle, and the glue between input, world and
// renderer. The DOM it owns is exactly one canvas; the surrounding panel is plain markup in
// `RunnerGame.astro` and is driven through the callbacks below.

import { BLOCK as BLOCK_SHAPE, CAMERA, PLAYER, SPRITES, START_Z, TILE_DEPTH, speedAt } from './config';
import { Input, type Control } from './input';
import { Renderer } from './renderer';
import { randomSeed } from './rng';
import { loadSheet } from './sprites';
import { loadBest, saveBest } from './storage';
import type { DeathCause, HudSnapshot, RunnerState, RunnerStatus } from './types';
import { createWorld, ensureGenerated, hasBlock, isSolid, pruneBefore, type World } from './world';

/** Physics runs at a fixed rate so behaviour does not drift with frame rate. */
const STEP = 1 / 120;
/** Longest frame the simulation will catch up on; anything worse is treated as a pause. */
const MAX_FRAME = 0.1;
/** How far below the floor plane counts as "gone through the hole". */
const FALL_THRESHOLD = 0.35;
/** Ignore retry presses for this long after dying, so a held key does not skip the summary. */
const RESTART_LOCK = 0.45;

export interface RunnerOptions {
  canvas: HTMLCanvasElement;
  onHud?: (hud: HudSnapshot) => void;
  onStatus?: (hud: HudSnapshot) => void;
  onRequestClose?: () => void;
}

export class RunnerGame {
  private readonly renderer: Renderer;
  private readonly input: Input;
  private world: World;
  private state: RunnerState;
  private best = loadBest();
  private isNewBest = false;

  private running = false;
  private frameHandle = 0;
  private lastTime = 0;
  private accumulator = 0;
  private coyote = 0;
  private jumpBuffer = 0;
  private deathTimer = 0;
  private restartLock = 0;
  private lastPrunedRing = 0;
  private lastHudDistance = -1;
  private resizeObserver: ResizeObserver | null = null;
  private themeObserver: MutationObserver | null = null;

  constructor(private readonly options: RunnerOptions) {
    this.renderer = new Renderer(options.canvas);
    this.input = new Input({
      onConfirm: () => this.confirm(),
      onClose: () => this.options.onRequestClose?.()
    });
    this.world = createWorld(randomSeed());
    this.state = freshState();
    ensureGenerated(this.world, CAMERA.drawRings + 8);
    this.syncTheme();
  }

  /** Loads sprite sheets. Safe to await after the game is already visible. */
  async load(): Promise<void> {
    const [player, block] = await Promise.all([loadSheet(SPRITES.player), loadSheet(SPRITES.block)]);
    this.renderer.setSprites(player, block);
  }

  get status(): RunnerStatus {
    return this.state.status;
  }

  open(): void {
    if (this.running) return;
    this.running = true;
    this.input.attach();
    this.syncTheme();

    this.resizeObserver ??= new ResizeObserver(() => this.renderer.resize());
    this.resizeObserver.observe(this.options.canvas);
    this.themeObserver ??= new MutationObserver(() => this.syncTheme());
    this.themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    document.addEventListener('visibilitychange', this.onVisibilityChange);

    this.renderer.resize();
    this.lastTime = performance.now();
    this.accumulator = 0;
    this.emitStatus();
    this.frameHandle = requestAnimationFrame(this.frame);
  }

  /** Ends the current run (banking the score) and stops the loop. */
  close(): void {
    if (this.state.status === 'playing' || this.state.status === 'dying') this.bankScore();
    this.pause();
    this.reset();
    this.emitStatus();
  }

  destroy(): void {
    this.pause();
    this.resizeObserver?.disconnect();
    this.themeObserver?.disconnect();
    this.resizeObserver = null;
    this.themeObserver = null;
  }

  /** Used by the on-screen buttons. */
  press(control: Control, pressed: boolean): void {
    this.input.setVirtual(control, pressed);
    if (control === 'jump' && pressed && this.state.status !== 'playing') this.confirm();
  }

  /** Start, or retry after the summary. Ignored while a run is in progress. */
  confirm(): void {
    if (this.state.status === 'ready') {
      this.state.status = 'playing';
      this.emitStatus();
      return;
    }
    if (this.state.status === 'dead' && this.restartLock <= 0) {
      this.reset();
      this.state.status = 'playing';
      this.emitStatus();
    }
  }

  private pause(): void {
    if (!this.running) return;
    this.running = false;
    cancelAnimationFrame(this.frameHandle);
    this.input.detach();
    this.resizeObserver?.unobserve(this.options.canvas);
    this.themeObserver?.disconnect();
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
  }

  private reset(): void {
    this.world = createWorld(randomSeed());
    this.state = freshState();
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.deathTimer = 0;
    this.restartLock = 0;
    this.lastPrunedRing = 0;
    this.lastHudDistance = -1;
    this.isNewBest = false;
    ensureGenerated(this.world, CAMERA.drawRings + 8);
  }

  private readonly onVisibilityChange = (): void => {
    if (!this.running) return;
    if (document.hidden) {
      cancelAnimationFrame(this.frameHandle);
    } else {
      this.lastTime = performance.now();
      this.accumulator = 0;
      this.frameHandle = requestAnimationFrame(this.frame);
    }
  };

  private readonly frame = (now: number): void => {
    if (!this.running) return;
    const elapsed = Math.min(MAX_FRAME, (now - this.lastTime) / 1000);
    this.lastTime = now;
    this.accumulator += elapsed;
    while (this.accumulator >= STEP) {
      this.step(STEP);
      this.accumulator -= STEP;
    }
    this.renderer.draw(this.world, this.state);
    this.emitHud();
    this.frameHandle = requestAnimationFrame(this.frame);
  };

  private step(dt: number): void {
    const state = this.state;
    if (this.restartLock > 0) this.restartLock -= dt;

    if (state.status === 'ready') {
      // Idle pose: the runner jogs on the spot so the start screen is not a still frame.
      state.runPhase += 6 * dt;
      this.input.takeJump();
      return;
    }

    if (state.status === 'dead') return;

    const dying = state.status === 'dying';
    state.speed = dying ? Math.max(0, state.speed - (state.cause === 'crashed' ? 34 : 6) * dt) : speedAt(this.distance);
    state.z += state.speed * dt;
    state.runPhase += state.speed * dt * PLAYER.runCycleRate;

    const ring = Math.floor(state.z / TILE_DEPTH);
    ensureGenerated(this.world, ring + CAMERA.drawRings + 8);
    if (ring - this.lastPrunedRing > 32) {
      pruneBefore(this.world, ring - CAMERA.trailRings - 2);
      this.lastPrunedRing = ring;
    }

    if (dying) {
      this.stepDeath(dt);
      return;
    }

    this.stepStrafe(dt);
    this.stepVertical(dt, ring);
    this.stepHazards(ring);
  }

  private stepStrafe(dt: number): void {
    const state = this.state;
    const direction = (this.input.right ? 1 : 0) - (this.input.left ? 1 : 0);
    const maxLaneSpeed = state.speed * PLAYER.strafeRatio;
    const target = direction * maxLaneSpeed;
    const rate = (maxLaneSpeed / PLAYER.strafeRampTime) * dt;
    const delta = target - state.laneVelocity;
    state.laneVelocity += Math.abs(delta) <= rate ? delta : Math.sign(delta) * rate;
    state.lane += state.laneVelocity * dt;
  }

  private stepVertical(dt: number, ring: number): void {
    const state = this.state;
    if (this.input.takeJump()) this.jumpBuffer = PLAYER.jumpBufferTime;
    if (this.jumpBuffer > 0) this.jumpBuffer -= dt;

    if (this.jumpBuffer > 0 && (state.grounded || this.coyote > 0)) {
      state.verticalVelocity = PLAYER.jumpVelocity;
      state.grounded = false;
      this.coyote = 0;
      this.jumpBuffer = 0;
    }

    const lane = Math.round(state.lane);
    const standing = isSolid(this.world, ring, lane);

    if (state.grounded && !standing) state.grounded = false;

    if (!state.grounded) {
      state.verticalVelocity -= PLAYER.gravity * dt;
      state.height += state.verticalVelocity * dt;
      if (state.height <= 0 && state.verticalVelocity <= 0 && standing) {
        state.height = 0;
        state.verticalVelocity = 0;
        state.grounded = true;
      }
    }

    if (state.grounded) this.coyote = PLAYER.coyoteTime;
    else this.coyote -= dt;

    if (state.height < -FALL_THRESHOLD) this.die('fell');
  }

  private stepHazards(ring: number): void {
    const state = this.state;
    if (state.height >= BLOCK_SHAPE.height - 0.02) return;
    const reach = BLOCK_SHAPE.halfWidth + PLAYER.halfWidth;
    const nearest = Math.round(state.lane);
    for (let lane = nearest - 1; lane <= nearest + 1; lane++) {
      if (Math.abs(state.lane - lane) < reach && hasBlock(this.world, ring, lane)) {
        this.die('crashed');
        return;
      }
    }
  }

  private stepDeath(dt: number): void {
    const state = this.state;
    state.verticalVelocity -= PLAYER.gravity * dt;
    state.height += state.verticalVelocity * dt;
    state.lane += state.laneVelocity * dt;
    this.deathTimer += dt;
    if (this.deathTimer >= PLAYER.deathLingerTime || state.height < -PLAYER.fallDeathDepth * 3) {
      state.status = 'dead';
      this.restartLock = RESTART_LOCK;
      this.bankScore();
      this.emitStatus();
    }
  }

  private die(cause: DeathCause): void {
    const state = this.state;
    if (state.status !== 'playing') return;
    state.status = 'dying';
    state.cause = cause;
    state.grounded = false;
    this.deathTimer = 0;
    // Stop drifting sideways: the camera roll follows the lane, and a spinning tunnel makes the
    // death animation hard to read.
    state.laneVelocity = 0;
    if (cause === 'crashed') state.verticalVelocity = 3;
    this.emitStatus();
  }

  /** Distance run so far, which is the score. The runner starts a few rings in — see `START_Z`. */
  private get distance(): number {
    return Math.max(0, this.state.z - START_Z);
  }

  private bankScore(): void {
    const distance = Math.floor(this.distance);
    this.isNewBest = saveBest(distance);
    this.best = Math.max(this.best, distance);
  }

  private syncTheme(): void {
    this.renderer.setTheme(document.documentElement.classList.contains('dark') ? 'dark' : 'light');
  }

  private snapshot(): HudSnapshot {
    return {
      distance: Math.floor(this.distance),
      best: this.best,
      speed: this.state.speed,
      status: this.state.status,
      isNewBest: this.isNewBest,
      cause: this.state.cause
    };
  }

  private emitHud(): void {
    const distance = Math.floor(this.distance);
    if (distance === this.lastHudDistance) return;
    this.lastHudDistance = distance;
    this.options.onHud?.(this.snapshot());
  }

  private emitStatus(): void {
    this.options.onStatus?.(this.snapshot());
  }
}

function freshState(): RunnerState {
  return {
    status: 'ready',
    z: START_Z,
    lane: 0,
    laneVelocity: 0,
    height: 0,
    verticalVelocity: 0,
    grounded: true,
    runPhase: 0,
    speed: speedAt(0),
    cause: null
  };
}

export async function createRunner(options: RunnerOptions): Promise<RunnerGame> {
  const game = new RunnerGame(options);
  await game.load();
  return game;
}
