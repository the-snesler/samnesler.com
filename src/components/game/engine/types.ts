export type RunnerStatus = 'ready' | 'playing' | 'dying' | 'dead';

export type DeathCause = 'fell' | 'crashed';

/** Everything the renderer needs to know about the runner. */
export interface RunnerState {
  status: RunnerStatus;
  /** Distance travelled along the tunnel, in world units. Doubles as the score. */
  z: number;
  /** Continuous lane coordinate; `Math.round` of it is the lane being stood on. */
  lane: number;
  laneVelocity: number;
  /** Height above the floor plane. Negative once the runner has dropped through a hole. */
  height: number;
  verticalVelocity: number;
  grounded: boolean;
  /** Advances with distance so the run cycle stays in step with speed. */
  runPhase: number;
  speed: number;
  cause: DeathCause | null;
}

export interface HudSnapshot {
  distance: number;
  best: number;
  speed: number;
  status: RunnerStatus;
  isNewBest: boolean;
  cause: DeathCause | null;
}
