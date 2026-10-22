// The sketch's twin of the preview's `_snoise2` (state/evaluator/random.ts):
// the same 2D simplex noise, permutation table and gradient set, so a Noise
// node's simplex, 3D, 4D, fBm and plasma types draw the same field on the LEDs
// as in the preview. The firmware once drew these with sine sums or FastLED's
// inoise8/inoise16, which only shared the names. The table sits in PROGMEM
// and every index is taken mod 256, which is what the preview's doubled
// 512-entry table does.

import { SIMPLEX_PERM } from '../../state/evaluator/random'

export const SIMPLEX_HELPER_CPP = `// 2D simplex noise, -1..1, matching the preview's _snoise2.
static const uint8_t _snPerm[256] PROGMEM = { ${SIMPLEX_PERM.join(',')} };
static inline uint8_t _snP(int k) { return pgm_read_byte(&_snPerm[k & 255]); }
static inline float _snDot(uint8_t h, float x, float y) {
  switch (h & 7) {
    case 0: return x + y;  case 1: return -x + y; case 2: return x - y;  case 3: return -x - y;
    case 4: return x;      case 5: return -x;     case 6: return y;      default: return -y;
  }
}
float _snoise2(float x, float y) {
  const float F2 = 0.366025403784f, G2 = 0.211324865405f;
  float s = (x + y) * F2;
  int i = (int)floorf(x + s), j = (int)floorf(y + s);
  float t0 = (i + j) * G2, x0 = x - i + t0, y0 = y - j + t0;
  int i1 = x0 > y0 ? 1 : 0, j1 = x0 > y0 ? 0 : 1;
  float x1 = x0 - i1 + G2, y1 = y0 - j1 + G2, x2 = x0 - 1.0f + 2.0f * G2, y2 = y0 - 1.0f + 2.0f * G2;
  int ii = i & 255, jj = j & 255;
  float n = 0.0f, a;
  a = 0.5f - x0 * x0 - y0 * y0; if (a > 0.0f) { a *= a; n += a * a * _snDot(_snP(ii + _snP(jj)), x0, y0); }
  a = 0.5f - x1 * x1 - y1 * y1; if (a > 0.0f) { a *= a; n += a * a * _snDot(_snP(ii + i1 + _snP(jj + j1)), x1, y1); }
  a = 0.5f - x2 * x2 - y2 * y2; if (a > 0.0f) { a *= a; n += a * a * _snDot(_snP(ii + 1 + _snP(jj + 1)), x2, y2); }
  return 70.0f * n;
}`
