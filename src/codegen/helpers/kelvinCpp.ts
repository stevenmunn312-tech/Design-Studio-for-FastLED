/** Black-body white point for a colour temperature, in Kelvin.
 *
 * One string so a collected pattern and a template control chain emit the
 * identical helper and the show's helper set keeps a single copy. The comment
 * stays at the call site: the show lifts this function by its signature, and a
 * comment inside the block would make the two copies differ.
 */
export const KELVIN_TO_RGB_CPP = `CRGB kelvinToRGB(float kelvin) {
  float t = constrain(kelvin, 1000.0f, 40000.0f) / 100.0f, r, g, b;
  if (t <= 66) { r = 255; g = 99.4708025861f * log(t) - 161.1195681661f; }
  else { r = 329.698727446f * pow(t - 60, -0.1332047592f); g = 288.1221695283f * pow(t - 60, -0.0755148492f); }
  if (t >= 66) b = 255; else if (t <= 19) b = 0; else b = 138.5177312231f * log(t - 10) - 305.0447927307f;
  return CRGB(constrain((int)r, 0, 255), constrain((int)g, 0, 255), constrain((int)b, 0, 255));
}`
