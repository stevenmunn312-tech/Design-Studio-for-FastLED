// GENERATED FILE — do not edit by hand.
// Produced by scripts/import-part-assets.py from the Blender part assets.
//
// Every dimension here is verified against a datasheet or fabrication
// print in the asset's own part.json. Do not replace one with a figure
// measured off a photograph or remembered — the hardware view draws parts
// at true relative scale, so these numbers are load-bearing.

import type { PartCatalogueEntry } from '../../state/partCatalogue'

export const PART_CATALOGUE_DATA: Record<string, PartCatalogueEntry> = {
  "dfplayer-mini": {
    "partId": "dfplayer-mini",
    "label": "DFPlayer Mini MP3 module",
    "category": "audio-source",
    "dimensionsMm": {
      "width": 20.0,
      "height": 20.0
    },
    "manufacturer": "generic",
    "logicVoltage": "3.2–5.0 V supply; 3.3 V UART logic",
    "pinLabelsLeftToRight": [
      "VCC",
      "RX",
      "TX",
      "DAC_R",
      "DAC_L",
      "SPK1",
      "GND",
      "SPK2",
      "IO1",
      "GND",
      "IO2",
      "ADKEY1",
      "ADKEY2",
      "USB+",
      "USB−",
      "BUSY"
    ],
    "notes": [
      "Self-contained UART-controlled MP3 player with onboard microSD socket and mono speaker driver."
    ],
    "render": {
      "file": "parts/dfplayer-mini.webp",
      "widthPx": 400,
      "heightPx": 400,
      "pxPerMm": 19.6
    }
  },
  "hub75-panel-64x64-p4": {
    "partId": "hub75-panel-64x64-p4",
    "label": "HUB75 panel, 64×64 P4",
    "category": "led-output",
    "dimensionsMm": {
      "width": 256.0,
      "height": 256.0
    },
    "manufacturer": "generic",
    "logicVoltage": "5 V",
    "pinLabelsLeftToRight": [
      "R1",
      "G1",
      "B1",
      "GND",
      "R2",
      "G2",
      "B2",
      "E",
      "A",
      "B",
      "C",
      "D",
      "CLK",
      "LAT",
      "OE",
      "GND"
    ],
    "notes": [
      "Front-face model of a 64×64 indoor P4 module; 4 mm pitch gives a 256 × 256 mm active panel.",
      "The standard HUB75E 16-pin signal header and power connector are on the rear and therefore not visible in the orthographic front render."
    ],
    "ledLayout": {
      "form": "hub75",
      "width": 64,
      "height": 64,
      "pitchMm": 4.0
    },
    "render": {
      "file": "parts/hub75-panel-64x64-p4.webp",
      "widthPx": 1200,
      "heightPx": 1200,
      "pxPerMm": 4.656
    }
  },
  "inmp441-i2s-microphone": {
    "partId": "inmp441-i2s-microphone",
    "label": "INMP441 I2S microphone",
    "category": "microphone",
    "dimensionsMm": {
      "width": 15.0,
      "height": 10.5
    },
    "manufacturer": "generic",
    "logicVoltage": "3.3 V",
    "pinLabelsLeftToRight": [
      "L/R",
      "GND",
      "WS",
      "SCK",
      "SD",
      "VDD"
    ],
    "notes": [
      "L/R tied low selects the left channel, matching the app default.",
      "The INMP441 supply and I2S signals are 3.3 V; do not drive it with 5 V logic."
    ],
    "render": {
      "file": "parts/inmp441-i2s-microphone.webp",
      "widthPx": 400,
      "heightPx": 282,
      "pxPerMm": 26.133
    }
  },
  "max98357a-i2s-amplifier": {
    "partId": "max98357a-i2s-amplifier",
    "label": "MAX98357A I2S amplifier",
    "category": "amplifier",
    "dimensionsMm": {
      "width": 17.78,
      "height": 25.4
    },
    "manufacturer": "generic",
    "logicVoltage": "3.3 V / 5 V logic; 2.7–5.5 V supply",
    "pinLabelsLeftToRight": [
      "LRC",
      "BCLK",
      "DIN",
      "GAIN",
      "SD",
      "GND",
      "VIN"
    ],
    "notes": [
      "Bridge-tied class-D speaker output; neither speaker terminal is ground.",
      "Drives 4–8 ohm speakers directly from I2S."
    ],
    "render": {
      "file": "parts/max98357a-i2s-amplifier.webp",
      "widthPx": 400,
      "heightPx": 568,
      "pxPerMm": 22.047
    }
  },
  "microsd-breakout-3v3": {
    "partId": "microsd-breakout-3v3",
    "label": "microSD breakout, 3.3 V bare",
    "category": "storage",
    "dimensionsMm": {
      "width": 20.32,
      "height": 21.59
    },
    "manufacturer": "generic",
    "logicVoltage": "3.3 V",
    "pinLabelsLeftToRight": [
      "CD",
      "DO",
      "GND",
      "SCK",
      "3V3",
      "DI",
      "CS"
    ],
    "notes": [
      "This is a bare 3.3 V breakout with no regulator and no logic-level shifter.",
      "Applying 5 V power or 5 V SPI signals can destroy the microSD card; use only a 3.3 V host or add external level shifting.",
      "It is intentionally a separate part from the protected 5 V module because their wiring is not interchangeable."
    ],
    "render": {
      "file": "parts/microsd-breakout-3v3.webp",
      "widthPx": 400,
      "heightPx": 424,
      "pxPerMm": 19.291
    }
  },
  "microsd-module-5v": {
    "partId": "microsd-module-5v",
    "label": "microSD module, 5 V",
    "category": "storage",
    "dimensionsMm": {
      "width": 24.0,
      "height": 42.0
    },
    "manufacturer": "generic",
    "logicVoltage": "3.3 V / 5 V level shifted",
    "pinLabelsLeftToRight": [
      "GND",
      "VCC",
      "MISO",
      "MOSI",
      "SCK",
      "CS"
    ],
    "notes": [
      "This 5 V module has an onboard 3.3 V regulator and logic-level shifter, so it can be powered from 5 V and used with 5 V SPI hosts.",
      "It is intentionally a separate part from the bare 3.3 V breakout because their safe wiring is different."
    ],
    "render": {
      "file": "parts/microsd-module-5v.webp",
      "widthPx": 400,
      "heightPx": 694,
      "pxPerMm": 16.333
    }
  },
  "pcm1802-line-in-adc": {
    "partId": "pcm1802-line-in-adc",
    "label": "PCM1802 line-in ADC breakout",
    "category": "audio-source",
    "dimensionsMm": {
      "width": 52.0,
      "height": 38.0
    },
    "manufacturer": "generic",
    "logicVoltage": "5 V supply; 3.3 V I2S",
    "pinLabelsLeftToRight": [
      "5V",
      "GND",
      "SCK",
      "BCK",
      "LRCK",
      "DOUT"
    ],
    "notes": [
      "Stereo line-level ADC with left and right RCA inputs and I2S output.",
      "Representative compact PCM1802-class breakout; supplier board revisions vary."
    ],
    "render": {
      "file": "parts/pcm1802-line-in-adc.webp",
      "widthPx": 632,
      "heightPx": 464,
      "pxPerMm": 12.0
    }
  },
  "sn74ahct125n-dip14": {
    "partId": "sn74ahct125n-dip14",
    "label": "74AHCT125 level shifter (DIP-14)",
    "category": "support",
    "dimensionsMm": {
      "width": 11.71,
      "height": 19.3
    },
    "manufacturer": "Texas Instruments compatible",
    "logicVoltage": "5 V supply; TTL-compatible 3.3 V inputs",
    "notes": [
      "Reuses the editable Build Diagram geometry after confirming it matches the required DIP-14 device; re-rendered to the locked Cycles part standard.",
      "One channel is used per 5 V WS2812B data route."
    ],
    "render": {
      "file": "parts/sn74ahct125n-dip14.webp",
      "widthPx": 400,
      "heightPx": 654,
      "pxPerMm": 33.476
    }
  },
  "speaker-4ohm-3w-40mm": {
    "partId": "speaker-4ohm-3w-40mm",
    "label": "Speaker, 4 ohm 3 W",
    "category": "support",
    "dimensionsMm": {
      "width": 40.0,
      "height": 40.0
    },
    "manufacturer": "generic",
    "logicVoltage": "Not applicable",
    "pinLabelsLeftToRight": [
      "+",
      "−"
    ],
    "notes": [
      "40 mm moving-coil loudspeaker rated 4 ohm, 3 W; suitable for the MAX98357A bridge-tied output."
    ],
    "render": {
      "file": "parts/speaker-4ohm-3w-40mm.webp",
      "widthPx": 488,
      "heightPx": 488,
      "pxPerMm": 12.0
    }
  },
  "ws2812b-matrix-16x16": {
    "partId": "ws2812b-matrix-16x16",
    "label": "WS2812B matrix panel, 16×16",
    "category": "led-output",
    "dimensionsMm": {
      "width": 160.0,
      "height": 160.0
    },
    "manufacturer": "generic",
    "logicVoltage": "5 V",
    "pinLabelsLeftToRight": [
      "5V",
      "DIN",
      "GND",
      "DOUT"
    ],
    "notes": [
      "Flexible 16×16 reference geometry with 10 mm pixel pitch and serpentine internal wiring.",
      "The rendered face excludes loose cables so dimensions remain the documented 160 × 160 mm panel body."
    ],
    "ledLayout": {
      "form": "matrix",
      "width": 16,
      "height": 16,
      "pitchMm": 10.0
    },
    "render": {
      "file": "parts/ws2812b-matrix-16x16.webp",
      "widthPx": 1200,
      "heightPx": 1200,
      "pxPerMm": 7.45
    }
  },
  "ws2812b-ring-12": {
    "partId": "ws2812b-ring-12",
    "label": "WS2812B LED ring, 12 pixels",
    "category": "led-output",
    "dimensionsMm": {
      "width": 37.0,
      "height": 37.0
    },
    "manufacturer": "generic",
    "logicVoltage": "5 V",
    "pinLabelsLeftToRight": [
      "5V",
      "DIN",
      "GND",
      "DOUT"
    ],
    "notes": [
      "Reference geometry follows the common Adafruit-compatible 12-pixel ring."
    ],
    "ledLayout": {
      "form": "ring",
      "count": 12,
      "diameterMm": 37.0
    },
    "render": {
      "file": "parts/ws2812b-ring-12.webp",
      "widthPx": 452,
      "heightPx": 452,
      "pxPerMm": 12.0
    }
  },
  "ws2812b-ring-16": {
    "partId": "ws2812b-ring-16",
    "label": "WS2812B LED ring, 16 pixels",
    "category": "led-output",
    "dimensionsMm": {
      "width": 44.5,
      "height": 44.5
    },
    "manufacturer": "generic",
    "logicVoltage": "5 V",
    "pinLabelsLeftToRight": [
      "5V",
      "DIN",
      "GND",
      "DOUT"
    ],
    "notes": [
      "Reference geometry follows the common Adafruit-compatible 16-pixel ring."
    ],
    "ledLayout": {
      "form": "ring",
      "count": 16,
      "diameterMm": 44.5
    },
    "render": {
      "file": "parts/ws2812b-ring-16.webp",
      "widthPx": 542,
      "heightPx": 542,
      "pxPerMm": 12.0
    }
  },
  "ws2812b-ring-24": {
    "partId": "ws2812b-ring-24",
    "label": "WS2812B LED ring, 24 pixels",
    "category": "led-output",
    "dimensionsMm": {
      "width": 65.5,
      "height": 65.5
    },
    "manufacturer": "generic",
    "logicVoltage": "5 V",
    "pinLabelsLeftToRight": [
      "5V",
      "DIN",
      "GND",
      "DOUT"
    ],
    "notes": [
      "Reference geometry follows the common Adafruit-compatible 24-pixel ring."
    ],
    "ledLayout": {
      "form": "ring",
      "count": 24,
      "diameterMm": 65.5
    },
    "render": {
      "file": "parts/ws2812b-ring-24.webp",
      "widthPx": 794,
      "heightPx": 794,
      "pxPerMm": 12.0
    }
  },
  "ws2812b-ring-60": {
    "partId": "ws2812b-ring-60",
    "label": "WS2812B LED ring, 60 pixels",
    "category": "led-output",
    "dimensionsMm": {
      "width": 158.0,
      "height": 158.0
    },
    "manufacturer": "generic",
    "logicVoltage": "5 V",
    "pinLabelsLeftToRight": [
      "5V",
      "DIN",
      "GND",
      "DOUT"
    ],
    "notes": [
      "A complete 60-pixel ring assembled from four 15-pixel quarter arcs; the four soldered seams are visible.",
      "Reference geometry follows the common Adafruit-compatible quarter-ring assembly."
    ],
    "ledLayout": {
      "form": "ring",
      "count": 60,
      "diameterMm": 158.0
    },
    "render": {
      "file": "parts/ws2812b-ring-60.webp",
      "widthPx": 1200,
      "heightPx": 1200,
      "pxPerMm": 7.544
    }
  },
  "ws2812b-ring-8": {
    "partId": "ws2812b-ring-8",
    "label": "WS2812B LED ring, 8 pixels",
    "category": "led-output",
    "dimensionsMm": {
      "width": 32.2,
      "height": 32.2
    },
    "manufacturer": "generic",
    "logicVoltage": "5 V",
    "pinLabelsLeftToRight": [
      "5V",
      "DIN",
      "GND",
      "DOUT"
    ],
    "notes": [
      "Generic 8-pixel WS2812 5050 ring; data input pads are identified at the bottom-left."
    ],
    "ledLayout": {
      "form": "ring",
      "count": 8,
      "diameterMm": 32.2
    },
    "render": {
      "file": "parts/ws2812b-ring-8.webp",
      "widthPx": 400,
      "heightPx": 400,
      "pxPerMm": 12.174
    }
  },
  "ws2812b-strip": {
    "partId": "ws2812b-strip",
    "label": "WS2812B strip — 6 pixels at 60 LEDs/m",
    "category": "led-output",
    "dimensionsMm": {
      "width": 100.2,
      "height": 12.5
    },
    "manufacturer": "generic",
    "logicVoltage": "5 V",
    "pinLabelsLeftToRight": [
      "5V",
      "DIN",
      "GND"
    ],
    "notes": [
      "Six-pixel run at 60 LEDs per metre; crop or tile at the 16.7 mm cut boundaries.",
      "Data-in is on the left and the strip runs horizontally.",
      "A 74AHCT125-class buffer is recommended for reliable 3.3 V controller data into a 5 V strip."
    ],
    "ledLayout": {
      "form": "strip",
      "count": 6,
      "pitchMm": 16.7
    },
    "render": {
      "file": "parts/ws2812b-strip.webp",
      "widthPx": 1200,
      "heightPx": 157,
      "pxPerMm": 11.896
    }
  },
}
