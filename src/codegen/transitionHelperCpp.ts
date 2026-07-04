// The 16 A→B transition styles as one self-contained C++ function operating on
// generic CRGB buffers, plus the particle hash — shared verbatim by the
// music-sync player (playerSketchGenerator) and the generative pattern show
// (showGenerator) so both composite transitions the same way the browser
// preview does (compositeTransition in graphEvaluator.ts). The style ids match
// TRANSITION_IDS / SHOW_TRANSITIONS in performanceGenerator.ts. A caller passes
// only the style id + progress, so direction/axis/tile/count/turns use the same
// defaults the preview falls back to. `out` must differ from `a` and `b`.
// Requires WIDTH / HEIGHT / NUM_LEDS #defines in the host sketch.
export const TRANSITION_HELPER_CPP = `// ── Transitions ─────────────────────────────────────────────────────────────
void compositeTransition(uint8_t type, CRGB* out, const CRGB* a, const CRGB* b, float tt) {
  switch (type) {
    case 1: {  // wipe (rightward)
      ::memmove(out, a, sizeof(CRGB) * NUM_LEDS);
      int thr = (int)(tt * WIDTH);
      for (int y = 0; y < HEIGHT; y++) for (int x = 0; x < WIDTH; x++)
        if (x < thr) out[y*WIDTH+x] = b[y*WIDTH+x];
      break;
    }
    case 2: {  // dissolve
      ::memmove(out, a, sizeof(CRGB) * NUM_LEDS);
      for (int i = 0; i < NUM_LEDS; i++) {
        uint32_t h = ((uint32_t)i * 1664525u + 1013904223u);
        if ((h & 0xFFFF) < (uint32_t)(tt * 65535)) out[i] = b[i];
      }
      break;
    }
    case 3: {  // iris
      ::memmove(out, a, sizeof(CRGB) * NUM_LEDS);
      float cx = WIDTH*0.5f, cy = HEIGHT*0.5f, r = tt * sqrtf(cx*cx + cy*cy);
      for (int y = 0; y < HEIGHT; y++) for (int x = 0; x < WIDTH; x++) {
        float dx = x - cx, dy = y - cy;
        if (sqrtf(dx*dx + dy*dy) < r) out[y*WIDTH+x] = b[y*WIDTH+x];
      }
      break;
    }
    case 4: {  // clockwipe
      ::memmove(out, a, sizeof(CRGB) * NUM_LEDS);
      float cx = WIDTH*0.5f, cy = HEIGHT*0.5f;
      for (int y = 0; y < HEIGHT; y++) for (int x = 0; x < WIDTH; x++) {
        float n = (atan2f(x - cx, -(y - cy)) + 3.14159265f) / 6.2831853f;
        if (n < tt) out[y*WIDTH+x] = b[y*WIDTH+x];
      }
      break;
    }
    case 5: {  // push (rightward)
      fill_solid(out, NUM_LEDS, CRGB::Black);
      for (int y = 0; y < HEIGHT; y++) for (int x = 0; x < WIDTH; x++) {
        int ax = (int)roundf(x + tt*WIDTH), bx = (int)roundf(x - (1.0f-tt)*WIDTH);
        if (bx >= 0 && bx < WIDTH) out[y*WIDTH+x] = b[y*WIDTH+bx];
        else if (ax >= 0 && ax < WIDTH) out[y*WIDTH+x] = a[y*WIDTH+ax];
      }
      break;
    }
    case 6: {  // checkerboard (tile 4)
      ::memmove(out, a, sizeof(CRGB) * NUM_LEDS);
      for (int y = 0; y < HEIGHT; y++) for (int x = 0; x < WIDTH; x++) {
        float thr = ((x/4 + y/4) % 2 == 0) ? tt*2.0f : tt*2.0f - 1.0f;
        if (thr >= 1.0f) out[y*WIDTH+x] = b[y*WIDTH+x];
      }
      break;
    }
    case 7: {  // diagonal
      ::memmove(out, a, sizeof(CRGB) * NUM_LEDS);
      for (int y = 0; y < HEIGHT; y++) for (int x = 0; x < WIDTH; x++) {
        float n = ((float)x/WIDTH + (float)y/HEIGHT) * 0.5f;
        if (n < tt) out[y*WIDTH+x] = b[y*WIDTH+x];
      }
      break;
    }
    case 8: {  // fadeblack
      float al = tt < 0.5f ? 1.0f - tt*2.0f : (tt - 0.5f)*2.0f;
      for (int i = 0; i < NUM_LEDS; i++) { CRGB s = tt < 0.5f ? a[i] : b[i];
        out[i] = CRGB((uint8_t)(s.r*al), (uint8_t)(s.g*al), (uint8_t)(s.b*al)); }
      break;
    }
    case 9: {  // fadewhite
      float al = tt < 0.5f ? 1.0f - tt*2.0f : (tt - 0.5f)*2.0f, w = (1.0f - al)*255.0f;
      for (int i = 0; i < NUM_LEDS; i++) { CRGB s = tt < 0.5f ? a[i] : b[i];
        out[i] = CRGB((uint8_t)(s.r*al+w), (uint8_t)(s.g*al+w), (uint8_t)(s.b*al+w)); }
      break;
    }
    case 10: {  // blinds (4, horizontal)
      ::memmove(out, a, sizeof(CRGB) * NUM_LEDS);
      int slat = max(1, HEIGHT / 4);
      for (int y = 0; y < HEIGHT; y++) for (int x = 0; x < WIDTH; x++)
        if ((float)(y % slat) / slat < tt) out[y*WIDTH+x] = b[y*WIDTH+x];
      break;
    }
    case 11: {  // ripple
      ::memmove(out, a, sizeof(CRGB) * NUM_LEDS);
      float cx = WIDTH*0.5f, cy = HEIGHT*0.5f, maxR = sqrtf(cx*cx+cy*cy), e = 0.08f;
      for (int y = 0; y < HEIGHT; y++) for (int x = 0; x < WIDTH; x++) {
        float dx = x-cx, dy = y-cy, n = sqrtf(dx*dx+dy*dy) / maxR;
        int idx = y*WIDTH+x;
        if (n < tt - e) out[idx] = b[idx];
        else if (n < tt) { float bl = (tt - n) / e; out[idx] = blend(a[idx], b[idx], (uint8_t)(bl*255)); }
      }
      break;
    }
    case 12: {  // spiral (2 turns)
      ::memmove(out, a, sizeof(CRGB) * NUM_LEDS);
      float cx = WIDTH*0.5f, cy = HEIGHT*0.5f, maxR = sqrtf(cx*cx+cy*cy), k = 1.0f + 1.0f/2.0f;
      for (int y = 0; y < HEIGHT; y++) for (int x = 0; x < WIDTH; x++) {
        float dx = x-cx, dy = y-cy, r = sqrtf(dx*dx+dy*dy) / maxR;
        float na = (atan2f(dy, dx) + 3.14159265f) / 6.2831853f;
        if ((r + na/2.0f) / k < tt) out[y*WIDTH+x] = b[y*WIDTH+x];
      }
      break;
    }
    case 13: {  // curtain (horizontal)
      ::memmove(out, a, sizeof(CRGB) * NUM_LEDS);
      for (int y = 0; y < HEIGHT; y++) for (int x = 0; x < WIDTH; x++)
        if (fabsf(2.0f*y/HEIGHT - 1.0f) < tt) out[y*WIDTH+x] = b[y*WIDTH+x];
      break;
    }
    case 14: {  // scanlines
      ::memmove(out, a, sizeof(CRGB) * NUM_LEDS);
      for (int y = 0; y < HEIGHT; y++) for (int x = 0; x < WIDTH; x++) {
        float thr = (y % 2 == 0) ? ((float)y/HEIGHT)*0.5f : 0.5f + ((float)(y-1)/HEIGHT)*0.5f;
        if (tt > thr) out[y*WIDTH+x] = b[y*WIDTH+x];
      }
      break;
    }
    case 15: {  // zoom
      ::memmove(out, a, sizeof(CRGB) * NUM_LEDS);
      float cx = WIDTH*0.5f, cy = HEIGHT*0.5f, sc = max(0.01f, tt);
      for (int y = 0; y < HEIGHT; y++) for (int x = 0; x < WIDTH; x++) {
        int bx = (int)((x-cx)/sc + cx), by = (int)((y-cy)/sc + cy), idx = y*WIDTH+x;
        if (bx >= 0 && bx < WIDTH && by >= 0 && by < HEIGHT)
          out[idx] = blend(out[idx], b[by*WIDTH+bx], (uint8_t)(tt*255));
        else out[idx].nscale8((uint8_t)((1.0f-tt)*255));
      }
      break;
    }
    default: {  // crossfade (0)
      ::memmove(out, a, sizeof(CRGB) * NUM_LEDS);
      nblend(out, b, NUM_LEDS, (uint8_t)(tt * 255));
      break;
    }
  }
}

// Hash → [0,1) (GLSL fract(sin(...)) — mirrors prnd() in showPreview.ts so the
// device spawns the same particle sparks as the browser preview).
float prnd(float n) { float s = sinf(n * 12.9898f) * 43758.5453f; return s - floorf(s); }
`
