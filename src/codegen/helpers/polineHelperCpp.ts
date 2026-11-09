import { POLINE_POSITIONS } from '../../state/palettes/polinePalette'

/** A position function's firmware id: its place in `POLINE_POSITIONS`, sinusoidal when unknown. */
export function polinePositionId(position: unknown): number {
  const index = POLINE_POSITIONS.indexOf(String(position))
  return index >= 0 ? index : POLINE_POSITIONS.indexOf('sinusoidal')
}

/*
 * The Poline palette built on the board, for anchors that arrive on wires.
 * `polineStops16` in `state/palettes/polinePalette.ts` is its preview twin,
 * which asks the poline library; this is that library's construction written
 * out: each HSL anchor becomes a point in a cylinder (hue the angle, lightness
 * the radius, saturation the height), each pair of neighbours is joined by
 * `points + 2` samples whose spacing the position function sets per axis, the
 * second segment running its easing in reverse, and the joined list is
 * sampled at 16 evenly spaced points, each blended between the two colours
 * either side of it. The point's index and weight come from integer
 * arithmetic, as in the preview, so both pick the same pair.
 * `polineFirmware.test.ts` holds a line-for-line copy of it to the library.
 * The position ids follow `POLINE_POSITIONS`.
 */
export const POLINE_HELPER_CPP = String.raw`static float _polPos(float t, bool rev, uint8_t fn) {
  switch (fn) {
    case 0: return t;
    case 2: return rev ? 1.0f - powf(1.0f - t, 3.0f) : powf(t, 3.0f);
    case 3: return rev ? 1.0f - powf(1.0f - t, 4.0f) : powf(t, 4.0f);
    case 4: return rev ? 1.0f - sqrtf(1.0f - t * t) : 1.0f - sqrtf(1.0f - t);
    case 5: return t * t * (3.0f - 2.0f * t);
    case 6: return rev ? 1.0f - (1.0f - t) * (1.0f - t) : t * t;
    default: return rev ? 1.0f - sinf((1.0f - t) * 1.5707963f) : sinf(t * 1.5707963f);
  }
}
static void _polPoint(CRGB c, float* p) {
  float r = c.r / 255.0f, g = c.g / 255.0f, b = c.b / 255.0f;
  float mx = max(r, max(g, b)), mn = min(r, min(g, b)), l = (mx + mn) * 0.5f, h = 0.0f, s = 0.0f;
  if (mx != mn) {
    float d = mx - mn;
    s = l > 0.5f ? d / (2.0f - mx - mn) : d / (mx + mn);
    if (mx == r) h = (g - b) / d + (g < b ? 6.0f : 0.0f);
    else if (mx == g) h = (b - r) / d + 2.0f;
    else h = (r - g) / d + 4.0f;
    h *= 60.0f;
  }
  float a = h * 0.017453293f;
  p[0] = 0.5f + l * 0.5f * cosf(a); p[1] = 0.5f + l * 0.5f * sinf(a); p[2] = s;
}
static CRGB _polColor(const float* p) {
  float h = fmodf(atan2f(p[1] - 0.5f, p[0] - 0.5f) * 57.29578f + 360.0f, 360.0f);
  float s = p[2], l = sqrtf((p[0] - 0.5f) * (p[0] - 0.5f) + (p[1] - 0.5f) * (p[1] - 0.5f)) / 0.5f;
  if (s == 0.0f) { uint8_t v = (uint8_t)floorf(l * 255.0f + 0.5f); return CRGB(v, v, v); }
  float c = (1.0f - fabsf(2.0f * l - 1.0f)) * s, x = c * (1.0f - fabsf(fmodf(h / 60.0f, 2.0f) - 1.0f)), m = l - c * 0.5f;
  float r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; } else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; } else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
  return CRGB((uint8_t)floorf((r + m) * 255.0f + 0.5f), (uint8_t)floorf((g + m) * 255.0f + 0.5f), (uint8_t)floorf((b + m) * 255.0f + 0.5f));
}
static CRGB _polAt(float anchors[][3], int n, int k, uint8_t fn) {
  int seg = k < n ? 0 : 1, j = seg == 0 ? k : k - n + 1;
  float t = j / (float)(n - 1), e = _polPos(t, seg == 1, fn), p[3];
  for (int ax = 0; ax < 3; ax++) p[ax] = (1.0f - e) * anchors[seg][ax] + e * anchors[seg + 1][ax];
  return _polColor(p);
}
static void _polineStops16(CRGBPalette16& pal, CRGB a, CRGB b, CRGB c, int points, uint8_t fn) {
  float anchors[3][3]; _polPoint(a, anchors[0]); _polPoint(b, anchors[1]); _polPoint(c, anchors[2]);
  const int n = constrain(points, 1, 16) + 2, span = 2 * n - 2;
  for (int i = 0; i < 16; i++) {
    int k = i * span / 15; float f = (i * span % 15) / 15.0f;
    CRGB c0 = _polAt(anchors, n, k, fn), c1 = _polAt(anchors, n, min(k + 1, span), fn);
    pal[i] = CRGB((uint8_t)floorf(c0.r + (c1.r - c0.r) * f + 0.5f), (uint8_t)floorf(c0.g + (c1.g - c0.g) * f + 0.5f), (uint8_t)floorf(c0.b + (c1.b - c0.b) * f + 0.5f));
  }
}`
