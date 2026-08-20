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
  "ds3231-rtc-module": {
    "partId": "ds3231-rtc-module",
    "label": "DS3231 RTC module (ZS-042)",
    "category": "support",
    "dimensionsMm": {
      "width": 38.0,
      "height": 22.0
    },
    "manufacturer": "generic",
    "logicVoltage": "3.3 V / 5 V",
    "pinLabelsLeftToRight": [
      "32K",
      "SQW",
      "SCL",
      "SDA",
      "VCC",
      "GND"
    ],
    "notes": [
      "Matches the DS3231 option on the RTC Clock node, which reads the chip directly over Wire at I2C address 0x68.",
      "The DS3231 has an integrated temperature-compensated crystal, so unlike a DS1307 module there is no external 32.768 kHz can on the board.",
      "Runs from 3.3 V or 5 V. The onboard pull-ups sit on whichever rail VCC is fed, so powering it from 5 V puts 5 V on SDA/SCL and can damage a 3.3 V-only host such as an ESP32.",
      "The CR2032 backup cell and the AT24C32 A0/A1/A2 address jumpers are on the reverse face and are not visible in this top-down render.",
      "Board revisions ship with a 200 ohm and 1N4148 trickle charger fitted, which is unsafe with a non-rechargeable CR2032; many users cut that track."
    ],
    "render": {
      "file": "parts/ds3231-rtc-module.webp",
      "widthPx": 464,
      "heightPx": 272,
      "pxPerMm": 12.0
    }
  },
  "hc-sr501-pir-sensor": {
    "partId": "hc-sr501-pir-sensor",
    "label": "HC-SR501 PIR motion sensor module",
    "category": "input-control",
    "dimensionsMm": {
      "width": 32.0,
      "height": 24.0
    },
    "manufacturer": "generic",
    "logicVoltage": "4.5-20 V supply; 3.3 V digital output",
    "pinLabelsLeftToRight": [
      "VCC",
      "OUT",
      "GND"
    ],
    "notes": [
      "The OUT pin is a digital motion signal: approximately 3.3 V when active and 0 V when idle.",
      "Sensitivity and output hold time are adjustable; the H/L jumper selects repeatable or single-trigger operation.",
      "Pin order is recorded left-to-right in the normalized lens-up render as VCC, OUT, GND. Supplier clones can mirror the header, so follow the silkscreen on the owned module."
    ],
    "render": {
      "file": "parts/hc-sr501-pir-sensor.webp",
      "widthPx": 400,
      "heightPx": 304,
      "pxPerMm": 12.0
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
  "photosensitive-ldr-module": {
    "partId": "photosensitive-ldr-module",
    "label": "Photosensitive LDR analog light-sensor module",
    "category": "input-control",
    "dimensionsMm": {
      "width": 32.0,
      "height": 23.8
    },
    "manufacturer": "generic (Keyestudio KS6026 form)",
    "logicVoltage": "3.3-5 V supply; analog output follows VCC",
    "pinLabelsLeftToRight": [
      "S",
      "VCC",
      "GND"
    ],
    "notes": [
      "The S pin is an analog voltage from the onboard LDR voltage divider; brighter light raises the documented KS6026 output.",
      "Power the module from 3.3 V when its signal connects to a 3.3 V-only ADC, because the analog output range follows the supply.",
      "This package follows the documented 32 x 23.8 mm KS6026 three-pin form; smaller KY-018/HW-486 modules are a separate mechanical variant."
    ],
    "render": {
      "file": "parts/photosensitive-ldr-module.webp",
      "widthPx": 408,
      "heightPx": 310,
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
  "xc4448-3w-stereo-amplifier": {
    "partId": "xc4448-3w-stereo-amplifier",
    "label": "XC4448 2 x 3 W stereo amplifier module",
    "category": "amplifier",
    "dimensionsMm": {
      "width": 23.0,
      "height": 16.0
    },
    "manufacturer": "Duinotech / Jaycar",
    "logicVoltage": "2.5-5.5 V supply",
    "pinLabelsLeftToRight": [
      "R+",
      "R-",
      "L-",
      "L+",
      "GND",
      "+5V",
      "SW",
      "GND",
      "LIN",
      "GND",
      "RIN"
    ],
    "notes": [
      "This is the red 23 x 16 mm Duinotech/Jaycar XC4448 revision, not the common green five-pad PAM8403 breakout.",
      "The left-to-right order follows the physical module after rotating its connection row to the required bottom-edge orientation.",
      "The two speaker outputs are bridge-tied: connect each speaker only across its own + and - pads; neither negative output is ground and the channels must not share a return.",
      "SW is the shutdown control. The supplier sheet renders this small silkscreen ambiguously as '5W' in its pinout table, while the product photograph shows SW.",
      "Maximum 2 x 3 W output is specified at 5 V into 4 ohm loads at the PAM8403 datasheet test condition."
    ],
    "render": {
      "file": "parts/xc4448-3w-stereo-amplifier.webp",
      "widthPx": 400,
      "heightPx": 287,
      "pxPerMm": 16.174
    }
  },
}
