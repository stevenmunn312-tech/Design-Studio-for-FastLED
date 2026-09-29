/** Hue-direction gradient mix for generated firmware: `mixGradientColors` in
 *  `state/hueMix.ts` is its preview twin. `longest` picks FastLED's
 *  LONGEST_HUES over SHORTEST_HUES. */
export const HUE_MIX_HELPER_CPP = String.raw`static inline CRGB _hueMix(CRGB a, CRGB b, float t, bool longest) {
  CRGB c; hsv2rgb_spectrum(blend(rgb2hsv_approximate(a), rgb2hsv_approximate(b), (uint8_t)(constrain(t,0.0f,1.0f)*255.0f+0.5f), longest?LONGEST_HUES:SHORTEST_HUES), c);
  return c;
}`
