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
