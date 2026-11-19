// The LED chipsets this app can drive. Chipset strings are interpolated into
// C++ template arguments, so every generator sanitises against this closed
// list, and a part's `ledOutput.chipset` is checked against it too
// (build/parts/partTypes.ts). Kept in its own module so the part registry can
// read it without importing the whole node library.
//
// 'SK6812-RGBW' is the one non-literal entry: codegen maps it to `SK6812` +
// `.setRgbw(RgbwDefault())`. HUB75 is a form's implied driver, not a wire
// protocol to pick for a strip (see nodeLibrary's ADDRESSABLE_CHIPSET_OPTIONS).
export const CHIPSET_OPTIONS = [
  'WS2812B', 'WS2811', 'WS2815', 'SK6812', 'SK6812-RGBW', 'WS2816', 'SM16824E',
  'NEOPIXEL', 'APA102', 'APA102HD', 'WS2801', 'HD108', 'HUB75',
] as const
