// Shared floating-point frame sampler used by Frame Warp and the 3D
// transitions. Integer coordinates address pixel centres. Edge modes are
// 0=clamp, 1=wrap, 2=black. Mirrors state/evaluator/frames.ts.
export const FRAME_SAMPLE_HELPER_CPP = `// ── Shared frame sampler ─────────────────────────────────────────────────────
static inline int _frameSampleCoord(int v, int size, uint8_t edgeMode) {
  if (edgeMode == 1) return ((v % size) + size) % size;
  if (edgeMode == 2 && (v < 0 || v >= size)) return -1;
  return constrain(v, 0, size - 1);
}
static inline CRGB _frameSamplePixel(const CRGB* f, int x, int y, uint8_t edgeMode) {
  if (!f) return CRGB::Black;
  x = _frameSampleCoord(x, WIDTH, edgeMode);
  y = _frameSampleCoord(y, HEIGHT, edgeMode);
  return x < 0 || y < 0 ? CRGB::Black : f[y * WIDTH + x];
}
static inline CRGB _sampleFrameScaled(const CRGB* f, float fx, float fy, uint8_t edgeMode, bool bilinear, float k) {
  if (!bilinear) {
    CRGB p = _frameSamplePixel(f, (int)floorf(fx + 0.5f), (int)floorf(fy + 0.5f), edgeMode);
    return CRGB((uint8_t)(p.r * k + 0.5f), (uint8_t)(p.g * k + 0.5f), (uint8_t)(p.b * k + 0.5f));
  }
  int x0 = (int)floorf(fx), y0 = (int)floorf(fy);
  float tx = fx - x0, ty = fy - y0;
  CRGB p00 = _frameSamplePixel(f, x0, y0, edgeMode), p10 = _frameSamplePixel(f, x0 + 1, y0, edgeMode);
  CRGB p01 = _frameSamplePixel(f, x0, y0 + 1, edgeMode), p11 = _frameSamplePixel(f, x0 + 1, y0 + 1, edgeMode);
  float w00 = (1.0f - tx) * (1.0f - ty) * k, w10 = tx * (1.0f - ty) * k;
  float w01 = (1.0f - tx) * ty * k, w11 = tx * ty * k;
  return CRGB(
    (uint8_t)(p00.r * w00 + p10.r * w10 + p01.r * w01 + p11.r * w11 + 0.5f),
    (uint8_t)(p00.g * w00 + p10.g * w10 + p01.g * w01 + p11.g * w11 + 0.5f),
    (uint8_t)(p00.b * w00 + p10.b * w10 + p01.b * w01 + p11.b * w11 + 0.5f));
}
static inline CRGB _sampleFrame(const CRGB* f, float fx, float fy, uint8_t edgeMode, bool bilinear) {
  return _sampleFrameScaled(f, fx, fy, edgeMode, bilinear, 1.0f);
}
static inline CRGB _sampleShaded(const CRGB* f, float fx, float fy, float k) {
  return _sampleFrameScaled(f, fx, fy, 0, true, k);
}
`
