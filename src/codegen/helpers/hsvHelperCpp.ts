/*
 * The preview's colour wheel for generated firmware: `hsv()` in
 * state/palettes/ledColor.ts and the RGB→HSV extraction HueShift,
 * Saturation and RGB → HSV share in the preview. FastLED's CHSV is its
 * "rainbow" wheel, which widens yellow (CHSV hue 64 is orange, not 90°),
 * and rgb2hsv_approximate returns hues on that wheel, so nodes that read
 * degrees disagreed with the preview on every hue but the primaries.
 * Plain functions of CRGB and floats, so Arduino's prototype hoisting has
 * nothing generated to trip over.
 */
export const HSV_HELPER_CPP = String.raw`// Standard HSV (hue in degrees), as the preview's hsv() draws it.
static inline uint8_t _hsvByte(float x) { return (uint8_t)constrain(floorf(x * 255.0f + 0.5f), 0.0f, 255.0f); }
CRGB _hsv(float h, float s, float v) {
  h = fmodf(fmodf(h, 360.0f) + 360.0f, 360.0f);
  float c = v * s, x = c * (1.0f - fabsf(fmodf(h / 60.0f, 2.0f) - 1.0f)), m = v - c, r = 0.0f, g = 0.0f, b = 0.0f;
  if (h < 60.0f) { r = c; g = x; } else if (h < 120.0f) { r = x; g = c; } else if (h < 180.0f) { g = c; b = x; }
  else if (h < 240.0f) { g = x; b = c; } else if (h < 300.0f) { r = x; b = c; } else { r = c; b = x; }
  return CRGB(_hsvByte(r + m), _hsvByte(g + m), _hsvByte(b + m));
}
// Hue in degrees (0..360), saturation and value (0..1) of a colour.
float _rgbHue(CRGB c) {
  float r = c.r / 255.0f, g = c.g / 255.0f, b = c.b / 255.0f;
  float mx = fmaxf(r, fmaxf(g, b)), d = mx - fminf(r, fminf(g, b)), h = 0.0f;
  if (d > 0.0f) {
    if (mx == r) h = fmodf((g - b) / d, 6.0f); else if (mx == g) h = (b - r) / d + 2.0f; else h = (r - g) / d + 4.0f;
    h *= 60.0f;
  }
  return fmodf(h + 360.0f, 360.0f);
}
float _rgbSat(CRGB c) {
  float r = c.r / 255.0f, g = c.g / 255.0f, b = c.b / 255.0f, mx = fmaxf(r, fmaxf(g, b));
  return mx > 0.0f ? (mx - fminf(r, fminf(g, b))) / mx : 0.0f;
}
float _rgbVal(CRGB c) { return fmaxf(c.r / 255.0f, fmaxf(c.g / 255.0f, c.b / 255.0f)); }
// Rotate a colour's hue by dh degrees and scale its saturation, held to 0..1.
CRGB _hsvAdjust(CRGB c, float dh, float satMul) {
  return _hsv(_rgbHue(c) + dh, constrain(_rgbSat(c) * satMul, 0.0f, 1.0f), _rgbVal(c));
}`
