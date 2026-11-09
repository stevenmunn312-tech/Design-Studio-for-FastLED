/**
 * Frame Transform's scale rate. The integrated phase (the rate in percent a
 * second) swings the zoom between double and half size and back,
 * exponentially so each step looks the same: 100 is one doubling. It once ran
 * `1 + phase/100` into a 1/20x-20x clamp, so a zoom froze after about 21 s at
 * the old default rate, and after 1 s going the other way. A phase of 0 is a
 * factor of exactly 1. The sketch emits the same fold.
 */
export function transformZoom(phase: number): number {
  const w = ((((phase / 100 + 1) % 4) + 4) % 4) - 1
  return 2 ** (w < 1 ? w : 2 - w)
}

/** C++ for `transformZoom`, declaring `_s` from the phase variable `ph`. */
export function transformZoomCpp(ph: string): string {
  return `float _w=fmodf(${ph}/100.0f+1.0f,4.0f); if(_w<0.0f) _w+=4.0f; _w-=1.0f; float _s=powf(2.0f,_w<1.0f?_w:2.0f-_w);`
}
