# Runner sprites

Placeholder art for the hero minigame (`src/components/game/`). Replace these files with real
sprites whenever — nothing but the file names and frame layout is baked into the code, and the
frame size is declared in `SPRITES` in `src/components/game/engine/config.ts`.

Each sheet is a **single row of equally sized frames**, left to right, with transparency.

| File         | Size (px) | Frames | Layout                                                                                              |
| ------------ | --------- | ------ | --------------------------------------------------------------------------------------------------- |
| `player.png` | 192 × 32  | 6      | `0-3` run cycle, `4` rising (jump), `5` falling. Seen from behind, feet at the bottom of the frame. |
| `block.png`  | 32 × 32   | 1      | Face of an obstacle block; drawn on the side facing the camera.                                     |

Notes:

- The runner is drawn `0.85 × 1.05` world units, anchored at its **feet**, so keep the character
  standing on the bottom edge of the frame (a couple of pixels of bob between run frames is fine —
  that is what makes the cycle read).
- Frames `0-3` are also what the launch button in the hero icon row animates through on hover, so
  the run cycle should loop cleanly.
- Art is drawn with `image-rendering: pixelated`; a bigger frame size works fine, just update
  `frameWidth` / `frameHeight` in `config.ts` to match.
- If a sheet is missing or fails to load the game keeps running and draws flat rectangles instead.
