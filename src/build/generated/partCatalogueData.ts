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
  "ili9341-xpt2046-touch-320x240": {
    "partId": "ili9341-xpt2046-touch-320x240",
    "label": "ILI9341 2.8-inch 320x240 TFT with XPT2046 touch",
    "category": "display",
    "dimensionsMm": {
      "width": 80.0,
      "height": 50.0
    },
    "manufacturer": "DFRobot",
    "logicVoltage": "3.3-5.5 V supply; SPI",
    "pinLabelsLeftToRight": [
      "VCC",
      "GND",
      "SCLK",
      "MOSI",
      "MISO",
      "CS",
      "RES",
      "DC",
      "BL",
      "TOUCH_CS",
      "INT",
      "SDCS"
    ],
    "notes": [
      "DFRobot DFR0665 form: ILI9341 display, XPT2046 resistive touch controller and microSD slot.",
      "The landscape render corresponds to the app's 320x240 transport/custom-UI target.",
      "Display, touch and microSD share SPI data lines and use separate chip-select signals."
    ],
    "display": {
      "controller": "ILI9341",
      "resolutionPx": [
        320,
        240
      ],
      "interface": "SPI",
      "touchController": "XPT2046"
    },
    "render": {
      "file": "parts/ili9341-xpt2046-touch-320x240.webp",
      "widthPx": 968,
      "heightPx": 608,
      "pxPerMm": 12.0
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
  "jaycar-xc9044-rtc-module": {
    "partId": "jaycar-xc9044-rtc-module",
    "label": "DS3231 RTC Clock Module for Raspberry Pi",
    "category": "support",
    "dimensionsMm": {
      "width": 14.0,
      "height": 14.0
    },
    "manufacturer": "generic",
    "logicVoltage": "3.3 V I2C / battery-backed",
    "pinLabelsLeftToRight": [
      "3V3",
      "SDA",
      "SCL",
      "SQW",
      "GND"
    ],
    "notes": [
      "Jaycar XC9044 is sold as a DS3231 RTC Clock Module for Raspberry Pi and is read by the app's firmware over the same Wire/I2C address 0x68 as the larger DS3231 module.",
      "The five-pin female header is arranged for the Raspberry Pi GPIO header; for non-Pi controllers it should be wired as an I2C module using 3V3, SDA, SCL and GND. SQW is not used by generated firmware.",
      "The onboard CR927 backup cell keeps the DS3231 ticking while the controller is unpowered.",
      "Unlike the ZS-042 module, this compact board does not expose the AT24C32 EEPROM address jumpers or the long six-pin breakout row.",
      "Jaycar's product copy describes the module as I2C, DS3231-based, battery-backed with CR927 backup cell, and 14 mm by 14 mm."
    ],
    "render": {
      "file": "parts/jaycar-xc9044-rtc-module.webp",
      "widthPx": 400,
      "heightPx": 400,
      "pxPerMm": 26.0
    }
  },
  "max7219-8digit-7segment": {
    "partId": "max7219-8digit-7segment",
    "label": "MAX7219 8-digit 7-segment display",
    "category": "display",
    "dimensionsMm": {
      "width": 82.0,
      "height": 15.0
    },
    "manufacturer": "generic",
    "logicVoltage": "5 V",
    "pinLabelsLeftToRight": [
      "VCC",
      "GND",
      "DIN",
      "CS",
      "CLK"
    ],
    "notes": [
      "Common 82 mm eight-digit module built from two four-digit red common-cathode packages.",
      "MAX7219 uses DIN, CLK and CS/LOAD; the opposite five-pin header provides DOUT for daisy chaining.",
      "The illuminated proof reads 12345678 so every digit position is visible."
    ],
    "display": {
      "controller": "MAX7219",
      "resolutionPx": [
        8,
        7
      ],
      "interface": "SPI-like DIN + CLK + CS/LOAD",
      "touchController": null
    },
    "render": {
      "file": "parts/max7219-8digit-7segment.webp",
      "widthPx": 992,
      "heightPx": 188,
      "pxPerMm": 12.0
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
  "pam8403-3w-stereo-amplifier": {
    "partId": "pam8403-3w-stereo-amplifier",
    "label": "PAM8403 2 x 3 W stereo amplifier module",
    "category": "amplifier",
    "dimensionsMm": {
      "width": 23.0,
      "height": 16.0
    },
    "manufacturer": "generic (PAM8403)",
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
      "Sold by Jaycar/Duinotech as XC4448, which is a distributor SKU rather than a part number; the amplifier on it is a PAM8403.",
      "Modelled on that red 23 x 16 mm eleven-pad revision. The common green five-pad PAM8403 breakout is the same chip on a different board and does not look like this render.",
      "The left-to-right order follows the physical module after rotating its connection row to the required bottom-edge orientation.",
      "The two speaker outputs are bridge-tied: connect each speaker only across its own + and - pads; neither negative output is ground and the channels must not share a return.",
      "SW is the shutdown control. The supplier sheet renders this small silkscreen ambiguously as '5W' in its pinout table, while the product photograph shows SW.",
      "Maximum 2 x 3 W output is specified at 5 V into 4 ohm loads at the PAM8403 datasheet test condition."
    ],
    "render": {
      "file": "parts/pam8403-3w-stereo-amplifier.webp",
      "widthPx": 400,
      "heightPx": 287,
      "pxPerMm": 16.174
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
  "pcm5102a-i2s-dac": {
    "partId": "pcm5102a-i2s-dac",
    "label": "PCM5102A I2S stereo DAC module",
    "category": "amplifier",
    "dimensionsMm": {
      "width": 14.0,
      "height": 32.0
    },
    "manufacturer": "generic (GY-style compact form)",
    "logicVoltage": "5 V VIN; 3.3 V I2S logic",
    "pinLabelsLeftToRight": [
      "SCK",
      "BCK",
      "DIN",
      "LCK",
      "GND",
      "VIN"
    ],
    "notes": [
      "The request named PCM5210A; no documented audio IC or breakout under that designation was found. This package uses the established PCM5102A part and records the correction explicitly.",
      "This is the compact purple 14 x 32 mm GY-style module with a 3.5 mm stereo line-output jack and six primary I2S/power connections.",
      "The analog output is line level and requires powered speakers or a separate power amplifier; it is not a direct 3 W speaker amplifier.",
      "SCK is optional in common three-wire I2S use because PCM5102A can derive its internal clock from BCK through the integrated PLL."
    ],
    "render": {
      "file": "parts/pcm5102a-i2s-dac.webp",
      "widthPx": 400,
      "heightPx": 883,
      "pxPerMm": 26.857
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
  "sh1106-oled-128x64": {
    "partId": "sh1106-oled-128x64",
    "label": "SH1106 1.3-inch 128x64 OLED",
    "category": "display",
    "dimensionsMm": {
      "width": 35.4,
      "height": 33.5
    },
    "manufacturer": "DLC Display / generic module form",
    "logicVoltage": "3.3 V / 5 V",
    "pinLabelsLeftToRight": [
      "GND",
      "VCC",
      "SCL",
      "SDA"
    ],
    "notes": [
      "1.3-inch white SH1106G OLED module with a four-pin I2C interface.",
      "The 29.42 x 14.70 mm active area distinguishes this larger panel from the 0.96-inch SSD1306 asset.",
      "The proof face uses the same app information-display language as SSD1306 while retaining the larger glass and board."
    ],
    "display": {
      "controller": "SH1106G",
      "resolutionPx": [
        128,
        64
      ],
      "interface": "I2C",
      "touchController": null
    },
    "render": {
      "file": "parts/sh1106-oled-128x64.webp",
      "widthPx": 433,
      "heightPx": 410,
      "pxPerMm": 12.006
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
  "ssd1306-oled-128x64": {
    "partId": "ssd1306-oled-128x64",
    "label": "SSD1306 0.96-inch 128x64 OLED",
    "category": "display",
    "dimensionsMm": {
      "width": 29.2,
      "height": 26.7
    },
    "manufacturer": "Adafruit",
    "logicVoltage": "3.3 V / 5 V",
    "pinLabelsLeftToRight": [
      "GND",
      "VIN",
      "3V",
      "CLK",
      "DATA",
      "RST",
      "DC",
      "CS"
    ],
    "notes": [
      "Adafruit Product 326 STEMMA QT revision, configured for I2C by default.",
      "I2C address is selectable between 0x3C and 0x3D; the app target is SSD1306 128x64 I2C.",
      "The eight-pin edge header retains SPI-capable signals while the two side JST-SH sockets provide I2C."
    ],
    "display": {
      "controller": "SSD1306",
      "resolutionPx": [
        128,
        64
      ],
      "interface": "I2C (SPI-capable breakout)",
      "touchController": null
    },
    "render": {
      "file": "parts/ssd1306-oled-128x64.webp",
      "widthPx": 400,
      "heightPx": 366,
      "pxPerMm": 13.425
    }
  },
  "st7789-tft-240x240": {
    "partId": "st7789-tft-240x240",
    "label": "ST7789 1.3-inch 240x240 TFT",
    "category": "display",
    "dimensionsMm": {
      "width": 35.8,
      "height": 35.8
    },
    "manufacturer": "Adafruit",
    "logicVoltage": "3.3 V logic; 3-5 V VIN",
    "pinLabelsLeftToRight": [
      "VIN",
      "3V",
      "GND",
      "SCK",
      "MOSI",
      "CS",
      "DC",
      "RST",
      "LITE",
      "MISO",
      "SDCS",
      "SDDET"
    ],
    "notes": [
      "Adafruit Product 4313 1.3-inch IPS TFT breakout with microSD and 240x240 ST7789 panel.",
      "The screen shows a square now-playing dashboard to make the active area and colour response obvious.",
      "No touch controller is fitted; this is the app's non-interactive colour-display target."
    ],
    "display": {
      "controller": "ST7789",
      "resolutionPx": [
        240,
        240
      ],
      "interface": "SPI",
      "touchController": null
    },
    "render": {
      "file": "parts/st7789-tft-240x240.webp",
      "widthPx": 438,
      "heightPx": 438,
      "pxPerMm": 12.011
    }
  },
  "tm1637-4digit-display": {
    "partId": "tm1637-4digit-display",
    "label": "TM1637 4-digit 7-segment display",
    "category": "display",
    "dimensionsMm": {
      "width": 42.0,
      "height": 24.0
    },
    "manufacturer": "Seeed Studio / Grove",
    "logicVoltage": "3.3 V / 5 V",
    "pinLabelsLeftToRight": [
      "GND",
      "VCC",
      "DIO",
      "CLK"
    ],
    "notes": [
      "Grove 4-Digit Display form with a TM1637 two-wire controller and central colon.",
      "The illuminated example reads 12:34 so all four digits and the colon are visible.",
      "The physical Grove cable order is GND, VCC, DIO, CLK when read left to right in this render."
    ],
    "display": {
      "controller": "TM1637",
      "resolutionPx": [
        4,
        7
      ],
      "interface": "CLK + DIO",
      "touchController": null
    },
    "render": {
      "file": "parts/tm1637-4digit-display.webp",
      "widthPx": 512,
      "heightPx": 296,
      "pxPerMm": 12.0
    }
  },
  "uda1334a-i2s-dac": {
    "partId": "uda1334a-i2s-dac",
    "label": "Adafruit UDA1334A I2S stereo DAC breakout",
    "category": "amplifier",
    "dimensionsMm": {
      "width": 40.0,
      "height": 25.0
    },
    "manufacturer": "Adafruit",
    "logicVoltage": "3-5 V VIN and I2S logic; PLL and SF0 are 3.3 V only",
    "pinLabelsLeftToRight": [
      "VIN",
      "3VO",
      "GND",
      "WSEL",
      "DIN",
      "BCLK",
      "Lout",
      "AGND",
      "Rout"
    ],
    "notes": [
      "The nine primary bottom-edge pins are recorded left-to-right; the separate six-pin upper row exposes SCLK, SF1, MUTE, SF0, PLL and DEEM controls.",
      "This board provides stereo line-level output through Lout/Rout or the 3.5 mm jack and is intended to feed a separate amplifier; 32 ohm headphones can distort.",
      "Only BCLK, WSEL and DIN are required for normal I2S audio; the onboard PLL supports MCLK-less sources.",
      "VIN accepts 3-5 V and the regulator provides 3VO. PLL and SF0 are 3.3 V-only controls according to the Adafruit guide."
    ],
    "render": {
      "file": "parts/uda1334a-i2s-dac.webp",
      "widthPx": 504,
      "heightPx": 324,
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
