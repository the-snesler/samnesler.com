// Keyboard and virtual (on-screen / touch) controls.
//
// Key events are captured on `window` only while the game is running, and only the keys the game
// actually uses are swallowed — the page still scrolls with the keyboard when the hero is idle.

export type Control = 'left' | 'right' | 'jump';

export interface InputHandlers {
  /** Fired by jump/enter when the game is not running: start or retry. */
  onConfirm: () => void;
  onClose: () => void;
}

const KEY_MAP: Record<string, Control> = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowUp: 'jump',
  KeyW: 'jump',
  Space: 'jump'
};

export class Input {
  private readonly keys = { left: false, right: false, jump: false };
  private readonly virtual = { left: false, right: false, jump: false };
  private jumpEdge = false;
  private attached = false;

  constructor(private readonly handlers: InputHandlers) {}

  get left(): boolean {
    return this.keys.left || this.virtual.left;
  }

  get right(): boolean {
    return this.keys.right || this.virtual.right;
  }

  /** True once per jump press; the caller decides whether to buffer it. */
  takeJump(): boolean {
    const jump = this.jumpEdge;
    this.jumpEdge = false;
    return jump;
  }

  attach(): void {
    if (this.attached) return;
    this.attached = true;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.releaseAll);
  }

  detach(): void {
    if (!this.attached) return;
    this.attached = false;
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.releaseAll);
    this.releaseAll();
  }

  /** Used by the on-screen buttons. */
  setVirtual(control: Control, pressed: boolean): void {
    if (control === 'jump') {
      if (pressed && !this.virtual.jump) this.press('jump');
      this.virtual.jump = pressed;
      return;
    }
    this.virtual[control] = pressed;
  }

  private press(control: Control): void {
    if (control === 'jump') this.jumpEdge = true;
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.code === 'Escape') {
      this.handlers.onClose();
      return;
    }
    if (event.code === 'Enter') {
      event.preventDefault();
      this.handlers.onConfirm();
      return;
    }
    const control = KEY_MAP[event.code];
    if (!control) return;
    // Arrows and space scroll the page; while the game has focus they belong to the runner.
    event.preventDefault();
    if (event.repeat) return;
    this.keys[control] = true;
    this.press(control);
    if (control === 'jump') this.handlers.onConfirm();
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    const control = KEY_MAP[event.code];
    if (!control) return;
    this.keys[control] = false;
  };

  private readonly releaseAll = (): void => {
    this.keys.left = this.keys.right = this.keys.jump = false;
    this.virtual.left = this.virtual.right = this.virtual.jump = false;
    this.jumpEdge = false;
  };
}
