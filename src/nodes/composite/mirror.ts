/**
 * Mirror's diagonal fold, shared by the preview and the sketch. The fold is
 * across the line from the top-left corner to the bottom-right one, in
 * normalised coordinates, so a wide panel mirrors across its own diagonal:
 * clamping `min(x, y)` to the matrix had smeared every column past the
 * height into strips. On a square matrix it is exactly (min, max) of x and
 * y. Integer maths both sides; a/b rounds as floor((2a + b) / 2b).
 */

/** The kept pixel (`b`) and its reflected partner (`a`) for (x, y). */
export function diagonalFold(x: number, y: number, W: number, H: number): { bx: number; by: number; ax: number; ay: number } {
  const rx = Math.floor((2 * y * (W - 1) + (H - 1)) / (2 * Math.max(H - 1, 1)))
  const ry = Math.floor((2 * x * (H - 1) + (W - 1)) / (2 * Math.max(W - 1, 1)))
  return x * (H - 1) <= y * (W - 1)
    ? { bx: x, by: y, ax: rx, ay: ry }
    : { bx: rx, by: ry, ax: x, ay: y }
}

/** C++ for `diagonalFold` at (_x, _y): sets the kept `_sx, _sy` and, with `partner`, `_ax, _ay`. */
export function diagonalFoldCpp(partner: boolean): string[] {
  // 32-bit products: a 16-bit int on AVR overflows past a 181-pixel side.
  return [
    `int32_t _rx=(int32_t)((2*(int32_t)_y*(WIDTH-1)+(HEIGHT-1))/(2*max(HEIGHT-1,1))),_ry=(int32_t)((2*(int32_t)_x*(HEIGHT-1)+(WIDTH-1))/(2*max(WIDTH-1,1)));`,
    `bool _dk=(int32_t)_x*(HEIGHT-1)<=(int32_t)_y*(WIDTH-1);`,
    `_sx=_dk?_x:_rx; _sy=_dk?_y:_ry;`,
    ...(partner ? [`int _ax=_dk?_rx:_x,_ay=_dk?_ry:_y;`] : []),
  ]
}
