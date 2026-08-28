/**
 * Fraction of its cell one LED emitter covers.
 *
 * A 5050 package on a 10 mm pitch covers about half its cell, and that gap is
 * what makes a panel read as discrete LEDs rather than a screen. Shared so the
 * LED output node, the hardware bay and a source node's frame thumbnail all
 * draw the same emitter — a strip laid over a photo of real tape overrides it
 * to 1, because there the tape supplies the gaps.
 */
export const LED_CELL_FILL = 0.5

/*
 * The most cells a source node's frame thumbnail draws.
 *
 * A frame node previews on the same emitter grid the LED output uses, so the
 * chain reads left to right as one picture of one thing. Every ordinary panel
 * (16x16, 32x8, 32x32) is under this cap and therefore drawn cell for cell;
 * only a large panel is sampled down, and it still reads as the same LED look
 * rather than switching renderers halfway along the graph.
 */
export const THUMB_MAX_CELLS = 1024

/** The emitter grid a thumbnail draws for a frame of `w` x `h`, capped without
 *  changing its shape. */
export function thumbGrid(w: number, h: number): { cols: number; rows: number } {
  const cols = Math.max(1, Math.round(w))
  const rows = Math.max(1, Math.round(h))
  if (cols * rows <= THUMB_MAX_CELLS) return { cols, rows }
  const scale = Math.sqrt(THUMB_MAX_CELLS / (cols * rows))
  return { cols: Math.max(1, Math.round(cols * scale)), rows: Math.max(1, Math.round(rows * scale)) }
}

/**
 * The light coming off a lit LED, as layers stacked around the package.
 *
 * A real WS2812B blows its own package out to white and throws its colour into
 * a bloom about a pitch wide, spilling well past the edges of the tape. These
 * layers stand in for that falloff. A blur is the obvious way to draw it and is
 * exactly what must not be used: this content changes every frame, and a filter
 * over content that changes every frame leaks renderer memory in Chromium —
 * the same rule the rest of the preview code follows.
 *
 * `along` and `across` are multiples of the emitter's own size on each of its
 * axes, and `opacity` is how much of the LED's colour that layer carries.
 */
export interface EmitterGlowLayer {
  along: number
  across: number
  opacity: number
}

/**
 * Tape gets the full stack: its light lands on a photographed PCB beside it and
 * has to look like light landing on a PCB.
 */
export const TAPE_GLOW: readonly EmitterGlowLayer[] = [
  { along: 5, across: 3.2, opacity: 0.1 },
  { along: 3, across: 2.2, opacity: 0.18 },
  { along: 1.8, across: 1.5, opacity: 0.34 },
]

/**
 * A panel keeps one soft layer. It draws its own emitters on a fixed grid where
 * the next LED is a millimetre away, so a bloom a pitch wide would simply wash
 * the panel out, and the diffuser above it already supplies the dome.
 */
export const PANEL_GLOW: readonly EmitterGlowLayer[] = [
  { along: 1.8, across: 1.44, opacity: 0.34 },
]
