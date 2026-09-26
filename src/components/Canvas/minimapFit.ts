// The Signal Overview minimap is a fixed 200x150 box in the canvas's bottom
// right corner. The side panels float over the canvas, so between them the
// visible field can be a strip a couple of hundred pixels wide on a laptop,
// and there the minimap covered half the graph being edited. It is only drawn
// when the field leaves real working room beside it.
export const MINIMAP_WIDTH = 200
export const MINIMAP_MIN_FIELD = 560

// `canvasWidth` is null until the canvas has been measured; draw the minimap
// then rather than flashing it in once the first measurement lands.
export function minimapFitsField(canvasWidth: number | null, leftInset: number, rightInset: number): boolean {
  if (canvasWidth === null) return true
  return canvasWidth - leftInset - rightInset >= MINIMAP_MIN_FIELD
}
