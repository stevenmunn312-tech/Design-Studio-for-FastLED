/**
 * Curl of a scalar noise field: the gradient rotated a quarter turn, so the
 * flow it steers has no sources or sinks and particles swirl instead of
 * piling up. Taken by central differences of the same noise the angle mode
 * reads, `CURL_EPS` apart in noise space. The C++ twin in
 * `nodes/simulations/codegen.ts` writes this arithmetic with `inoise16`.
 */
export const CURL_EPS = 0.05
export const CURL_GAIN = 1.5

/** `n` is the 0–1 noise; returns the flow vector at (x, y) in noise space. */
export function curlFlow(n: (x: number, y: number) => number, x: number, y: number): { x: number; y: number } {
  const gx = (n(x + CURL_EPS, y) - n(x - CURL_EPS, y)) / (2 * CURL_EPS)
  const gy = (n(x, y + CURL_EPS) - n(x, y - CURL_EPS)) / (2 * CURL_EPS)
  return { x: gy * CURL_GAIN, y: -gx * CURL_GAIN }
}
