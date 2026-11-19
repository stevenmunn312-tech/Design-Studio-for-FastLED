// Colour TFT descriptors as test fixtures.
//
// The app resolves a panel's descriptor from its chip (`TFT_CHIPS`) and the
// part's own `tftPanel` and `display` blocks. These are the descriptors the
// golden and geometry suites are written against, kept as literals so those
// goldens do not move when a part's bench values are corrected. `ST7789` is a
// synthetic 240x240 panel with inversion on, which no catalogued part is; it
// exercises the windowed-glass and INVON paths.

import type { TftController } from '../tftSurface'

export const TFT_CONTROLLERS: Record<string, TftController> = {
  ST7789: {
    id: 'ST7789', width: 240, height: 240, ramWidth: 240, ramHeight: 320,
    columnOffset: 0, rowOffset: 0, colorOrder: 'RGB', mirroredColumns: false, invert: true,
  },
  ST7789V: {
    id: 'ST7789V', width: 240, height: 320, ramWidth: 240, ramHeight: 320,
    columnOffset: 0, rowOffset: 0, colorOrder: 'RGB', mirroredColumns: false, invert: false,
  },
  ILI9341: {
    id: 'ILI9341', width: 240, height: 320, ramWidth: 240, ramHeight: 320,
    columnOffset: 0, rowOffset: 0, colorOrder: 'BGR', mirroredColumns: true, invert: false,
  },
}
