// GENERATED FILE — do not edit by hand.
// Produced by scripts/assets/import-part-assets.py from the Blender part assets
// (measured facts, each part's part.json) merged with the per-part overlays in
// src/build/parts/overlays/ (categories, sources, verification, copy).
//
// Every dimension here is verified against a datasheet or fabrication
// print in the asset's own part.json. Do not replace one with a figure
// measured off a photograph or remembered — the hardware view draws parts
// at true relative scale, so these numbers are load-bearing.

import type { PartManifest } from '../parts/manifest/partManifest'

export const PART_CATALOGUE_DATA: Record<string, PartManifest> = {
  "16v8-2a-4s-liion-charger": {
    "manifestVersion": 1,
    "partId": "16v8-2a-4s-liion-charger",
    "label": "16.8 V 2 A 4S Li-ion mains charger",
    "category": "battery",
    "dimensionsMm": {
      "width": 95.0,
      "height": 50.0
    },
    "manufacturer": "generic",
    "logicVoltage": "none; power only",
    "pinLabelsLeftToRight": [
      "DC+",
      "DC-"
    ],
    "notes": [
      "Selected seller option is 16.8 V 2 A with centre-positive 5.5 x 2.1 mm plug."
    ],
    "batteryModule": {
      "series": 4,
      "chemistries": [
        "li-ion"
      ],
      "charger": {
        "device": "CC/CV mains charger",
        "chargeVPerCell": 4.2,
        "maxChargeMa": 2000,
        "inputMaxW": 35,
        "inputProtocols": "100-240 V AC input; 5.5 x 2.1 mm DC output",
        "bidirectional": false,
        "batteryTerminals": [
          "DC+",
          "DC-"
        ]
      }
    },
    "render": {
      "file": "parts/16v8-2a-4s-liion-charger.webp",
      "widthPx": 1160,
      "heightPx": 620,
      "pxPerMm": 12.0
    },
    "revision": 1,
    "partTypes": [
      "BatteryModule"
    ],
    "categories": [
      "battery-chargers"
    ],
    "verification": "reviewed",
    "sources": [
      {
        "facts": [
          "pinLabelsLeftToRight",
          "render",
          "batteryModule"
        ],
        "ref": "https://www.aliexpress.com/i/1005005354324584.html"
      }
    ],
    "copy": {
      "summary": "4S li-ion · charger"
    }
  },
  "1s-10a-liion-protection-board": {
    "manifestVersion": 1,
    "partId": "1s-10a-liion-protection-board",
    "label": "1S 10 A Li-ion protection board",
    "category": "battery",
    "dimensionsMm": {
      "width": 34.0,
      "height": 15.0
    },
    "manufacturer": "generic (two KIA KND2803A MOSFETs)",
    "logicVoltage": "none; power only",
    "pinLabelsLeftToRight": [
      "B-",
      "B+",
      "C-"
    ],
    "notes": [
      "Three pads: B+ and B- to the cell, C- is the protected negative for both charge and load. The positive is common, so the load and charger positive also land on B+.",
      "10 A is the seller's figure, with a 16 A over-current trip, and remains an HW-14 verification item. The listing gives 4.25-4.35 V over-charge and 2.3-2.5 V over-discharge; the plan uses the outer value of each.",
      "The board outline is estimated from the listing photographs. Measure the part before relying on its drawn size."
    ],
    "batteryModule": {
      "series": 1,
      "chemistries": [
        "li-ion"
      ],
      "protection": {
        "continuousDischargeMa": 10000,
        "continuousChargeMa": 10000,
        "overchargeV": 4.35,
        "overDischargeV": 2.3,
        "port": "common",
        "switchedLine": "negative",
        "temperatureSensor": false,
        "powerTerminals": [
          "B+",
          "B-",
          "C-"
        ]
      }
    },
    "render": {
      "file": "parts/1s-10a-liion-protection-board.webp",
      "widthPx": 428,
      "heightPx": 200,
      "pxPerMm": 12.0
    },
    "revision": 1,
    "partTypes": [
      "BatteryModule"
    ],
    "categories": [
      "battery-protection"
    ],
    "verification": "reviewed",
    "sources": [
      {
        "facts": [
          "pinLabelsLeftToRight",
          "render",
          "batteryModule"
        ],
        "ref": "https://www.aliexpress.com/item/1005006041887055.html"
      }
    ],
    "copy": {
      "summary": "1S li-ion · protection"
    }
  },
  "4s-15a-enhanced-bms": {
    "manifestVersion": 1,
    "partId": "4s-15a-enhanced-bms",
    "label": "4S 15 A enhanced Li-ion BMS",
    "category": "battery",
    "dimensionsMm": {
      "width": 45.0,
      "height": 45.0
    },
    "manufacturer": "generic",
    "logicVoltage": "none; power only",
    "pinLabelsLeftToRight": [
      "B-",
      "B1",
      "B2",
      "B3",
      "B+",
      "P-",
      "P+"
    ],
    "notes": [
      "The selected 15 A Enhanced variant provides protection and temperature sensing. Listing does not substantiate balancing, so pair it with the standalone balancer."
    ],
    "batteryModule": {
      "series": 4,
      "chemistries": [
        "li-ion"
      ],
      "protection": {
        "continuousDischargeMa": 15000,
        "continuousChargeMa": 15000,
        "overchargeV": 4.25,
        "overDischargeV": 2.5,
        "port": "common",
        "switchedLine": "negative",
        "temperatureSensor": true,
        "powerTerminals": [
          "B-",
          "B+",
          "P-",
          "P+"
        ]
      }
    },
    "render": {
      "file": "parts/4s-15a-enhanced-bms.webp",
      "widthPx": 560,
      "heightPx": 560,
      "pxPerMm": 12.0
    },
    "revision": 1,
    "partTypes": [
      "BatteryModule"
    ],
    "categories": [
      "battery-protection"
    ],
    "verification": "reviewed",
    "sources": [
      {
        "facts": [
          "pinLabelsLeftToRight",
          "render",
          "batteryModule"
        ],
        "ref": "https://www.aliexpress.com/item/1005004317506330.html"
      }
    ],
    "copy": {
      "summary": "4S li-ion · protection"
    }
  },
  "4s-5a-active-balancer": {
    "manifestVersion": 1,
    "partId": "4s-5a-active-balancer",
    "label": "4S 5 A active cell balancer",
    "category": "battery",
    "dimensionsMm": {
      "width": 45.0,
      "height": 35.0
    },
    "manufacturer": "Hankzor",
    "logicVoltage": "none; power only",
    "pinLabelsLeftToRight": [
      "B-",
      "B1",
      "B2",
      "B3",
      "B+"
    ],
    "notes": [
      "5 A is the listing's maximum transfer current, not a continuous guaranteed balance current. Connect sense leads in cell order and plug the harness in last."
    ],
    "batteryModule": {
      "series": 4,
      "chemistries": [
        "li-ion",
        "lifepo4"
      ],
      "balance": {
        "type": "active",
        "balanceMa": 5000,
        "balanceTerminals": [
          "B-",
          "B1",
          "B2",
          "B3",
          "B+"
        ],
        "standbyMa": 5,
        "connectionOrder": [
          "B-",
          "B1",
          "B2",
          "B3",
          "B+"
        ]
      }
    },
    "render": {
      "file": "parts/4s-5a-active-balancer.webp",
      "widthPx": 560,
      "heightPx": 440,
      "pxPerMm": 12.0
    },
    "revision": 1,
    "partTypes": [
      "BatteryModule"
    ],
    "categories": [
      "battery-balancers"
    ],
    "verification": "reviewed",
    "sources": [
      {
        "facts": [
          "pinLabelsLeftToRight",
          "render",
          "batteryModule"
        ],
        "ref": "https://www.aliexpress.com/item/1005005050176741.html"
      }
    ],
    "copy": {
      "summary": "4S li-ion/lifepo4 · active balance"
    }
  },
  "adafruit-bh1750-light-sensor": {
    "manifestVersion": 1,
    "partId": "adafruit-bh1750-light-sensor",
    "label": "Adafruit BH1750 ambient light sensor",
    "category": "input-control",
    "dimensionsMm": {
      "width": 25.4,
      "height": 17.78
    },
    "manufacturer": "Adafruit (product 4681) / ROHM BH1750FVI",
    "logicVoltage": "3-5 V VIN; onboard regulator and level shifting make I2C safe at either supply",
    "pinLabelsLeftToRight": [
      "VIN",
      "3Vo",
      "GND",
      "SCL",
      "SDA",
      "ADDR"
    ],
    "notes": [
      "Reports 16-bit ambient-light measurements directly in lux over I2C; Studio uses continuous high-resolution mode.",
      "Power VIN from 3.3 V or 5 V. The breakout has its own regulator and bidirectional level shifting, plus 10 kΩ I2C pull-ups.",
      "The default address is 0x23. Tie ADDR high, or bridge the ADDR jumper, for 0x5C.",
      "The six-pin header ships loose and is rendered unpopulated. The two JST-SH sockets provide the same power and I2C bus."
    ],
    "lightSensor": {
      "device": "BH1750FVI",
      "interface": "I2C",
      "i2cAddresses": [
        35,
        92
      ],
      "defaultI2cAddress": 35,
      "maxLux": 65535
    },
    "render": {
      "file": "parts/adafruit-bh1750-light-sensor.webp",
      "widthPx": 400,
      "heightPx": 286,
      "pxPerMm": 14.961,
      "indicators": [
        {
          "rectPx": [
            57.5,
            77.3,
            11.4,
            21.2
          ],
          "color": [
            26,
            255,
            51
          ],
          "drive": "power"
        }
      ]
    },
    "revision": 1,
    "partTypes": [
      "LightInput"
    ],
    "categories": [
      "light-sensors"
    ],
    "verification": "reviewed",
    "sources": [
      {
        "facts": [
          "dimensionsMm",
          "pinLabelsLeftToRight"
        ],
        "ref": "https://github.com/adafruit/Adafruit-BH1750-PCB"
      },
      {
        "facts": [
          "logicVoltage",
          "render",
          "lightSensor"
        ],
        "ref": "https://www.adafruit.com/product/4681"
      },
      {
        "facts": [
          "lightSensor"
        ],
        "ref": "https://learn.adafruit.com/adafruit-bh1750-ambient-light-sensor/pinouts"
      }
    ],
    "interfaces": [
      "i2c"
    ],
    "copy": {
      "summary": "Calibrated ambient light in lux over I2C",
      "wiringNote": "Power from the controller logic rail. The breakout level-shifts SDA/SCL and answers on 0x23, or 0x5C with ADDR tied high.",
      "optionLabel": "Adafruit BH1750",
      "optionOrder": 2
    },
    "pads": [
      {
        "label": "VIN",
        "xPx": 104.5,
        "yPx": 237.5
      },
      {
        "label": "3Vo",
        "xPx": 142.5,
        "yPx": 237.5
      },
      {
        "label": "GND",
        "xPx": 180.5,
        "yPx": 237.5
      },
      {
        "label": "SCL",
        "xPx": 218.5,
        "yPx": 237.5
      },
      {
        "label": "SDA",
        "xPx": 256.5,
        "yPx": 237.5
      },
      {
        "label": "ADDR",
        "xPx": 294.5,
        "yPx": 237.5
      }
    ],
    "padHoleRadiusPx": 7,
    "supplyRail": "v3v3"
  },
  "adafruit-bme280-environment-sensor": {
    "manifestVersion": 1,
    "partId": "adafruit-bme280-environment-sensor",
    "label": "Adafruit BME280 environment sensor",
    "category": "input-control",
    "dimensionsMm": {
      "width": 19.05,
      "height": 25.4
    },
    "manufacturer": "Adafruit (product 2652) / Bosch Sensortec BME280",
    "logicVoltage": "3-5 V VIN; onboard regulator and level shifting make I2C safe at either supply",
    "pinLabelsLeftToRight": [
      "VIN",
      "3Vo",
      "GND",
      "SCK",
      "SDO",
      "SDI",
      "CS"
    ],
    "notes": [
      "Reports temperature, relative humidity and barometric pressure over I2C; Studio uses the compensated BME280 readings.",
      "Power VIN from 3.3 V for an ESP controller. The breakout has a regulator and level shifting, but using the logic rail keeps every I2C pull-up in the controller domain.",
      "The default I2C address is 0x77. Tie SDO low, or close the ADDR jumper, for 0x76.",
      "The seven-pin header ships loose and is rendered as unpopulated plated holes. SCK is I2C SCL and SDI is I2C SDA; SDO and CS are not wired in I2C mode."
    ],
    "environmentSensor": {
      "device": "BME280",
      "interface": "I2C",
      "i2cAddresses": [
        118,
        119
      ],
      "defaultI2cAddress": 119,
      "temperatureMinC": -40,
      "temperatureMaxC": 85,
      "humidityMinPercent": 0,
      "humidityMaxPercent": 100,
      "pressureMinHpa": 300,
      "pressureMaxHpa": 1100
    },
    "render": {
      "file": "parts/adafruit-bme280-environment-sensor.webp",
      "widthPx": 400,
      "heightPx": 527,
      "pxPerMm": 19.948,
      "indicators": [
        {
          "rectPx": [
            74.2,
            143.6,
            15.2,
            28.3
          ],
          "color": [
            26,
            255,
            51
          ],
          "drive": "power"
        }
      ]
    },
    "revision": 1,
    "partTypes": [
      "EnvironmentInput"
    ],
    "categories": [
      "environment-sensors"
    ],
    "verification": "reviewed",
    "sources": [
      {
        "facts": [
          "dimensionsMm",
          "pinLabelsLeftToRight",
          "render"
        ],
        "ref": "https://github.com/adafruit/Adafruit-BME280-Breakout-PCB"
      },
      {
        "facts": [
          "pinLabelsLeftToRight",
          "label",
          "environmentSensor"
        ],
        "ref": "https://www.adafruit.com/product/2652"
      },
      {
        "facts": [
          "pinLabelsLeftToRight",
          "label",
          "environmentSensor"
        ],
        "ref": "https://learn.adafruit.com/adafruit-bme280-humidity-barometric-pressure-temperature-sensor-breakout/pinouts"
      },
      {
        "facts": [
          "environmentSensor"
        ],
        "ref": "https://www.bosch-sensortec.com/media/boschsensortec/downloads/datasheets/bst-bme280-ds002.pdf"
      }
    ],
    "interfaces": [
      "i2c"
    ],
    "copy": {
      "summary": "Temperature, humidity and pressure over I2C",
      "wiringNote": "Use VIN at 3.3 V; SCK is I2C SCL and SDI is I2C SDA. Leave SDO and CS unwired for the default 0x77 address.",
      "optionLabel": "Adafruit BME280"
    },
    "pads": [
      {
        "label": "VIN",
        "xPx": 49,
        "yPx": 471
      },
      {
        "label": "3Vo",
        "xPx": 99,
        "yPx": 471
      },
      {
        "label": "GND",
        "xPx": 149,
        "yPx": 471
      },
      {
        "label": "SCK",
        "xPx": 200,
        "yPx": 471
      },
      {
        "label": "SDO",
        "xPx": 250,
        "yPx": 471
      },
      {
        "label": "SDI",
        "xPx": 301,
        "yPx": 471
      },
      {
        "label": "CS",
        "xPx": 351,
        "yPx": 471
      }
    ],
    "padHoleRadiusPx": 9.5,
    "supplyRail": "v3v3"
  },
  "adafruit-ina219-current-sensor": {
    "manifestVersion": 1,
    "partId": "adafruit-ina219-current-sensor",
    "label": "Adafruit INA219 current sensor",
    "category": "power-monitor",
    "dimensionsMm": {
      "width": 25.4,
      "height": 20.32
    },
    "manufacturer": "Adafruit (product 904) / Texas Instruments INA219B",
    "logicVoltage": "3-5 V (VIN powers the chip and sets the I2C logic level)",
    "pinLabelsLeftToRight": [
      "VIN",
      "GND",
      "SCL",
      "SDA",
      "VIN-",
      "VIN+"
    ],
    "notes": [
      "Measures the current through its 0.1 ohm shunt and the voltage on the load side of it, over I2C.",
      "High-side sensing: the supply's positive lead goes to Vin+ and the load's positive lead to Vin-. The load and the board share ground; the INA219 reads bus voltage against GND.",
      "Bus voltage up to 26 V. Current up to +/-3.2 A through the fitted shunt; do not pass more, since the shunt and board copper are the limit, not the chip.",
      "VIN powers the chip at 3-5 V and sets the I2C level; a 3.3 V controller powers it from 3.3 V.",
      "Default I2C address 0x40; bridging A0 and/or A1 gives 0x41, 0x44 or 0x45, so up to four can share a bus.",
      "The header pins VIN- and VIN+ duplicate the load terminal for light loads; use the terminal for anything above about 1 A.",
      "External connections are shown unpopulated: the header and the 3.5 mm terminal block ship loose with the board."
    ],
    "powerMonitor": {
      "device": "INA219B",
      "interface": "I2C",
      "i2cAddresses": [
        64,
        65,
        68,
        69
      ],
      "defaultI2cAddress": 64,
      "shuntOhms": 0.1,
      "busVoltageMaxV": 26,
      "currentMaxA": 3.2,
      "senseSide": "high-side"
    },
    "render": {
      "file": "parts/adafruit-ina219-current-sensor.webp",
      "widthPx": 400,
      "heightPx": 324,
      "pxPerMm": 14.961,
      "indicators": [
        {
          "rectPx": [
            57.5,
            87.9,
            11.4,
            22.7
          ],
          "color": [
            26,
            255,
            51
          ],
          "drive": "power"
        }
      ]
    },
    "revision": 1,
    "partTypes": [
      "PowerMonitorInput"
    ],
    "categories": [
      "power-monitoring"
    ],
    "verification": "reviewed",
    "sources": [
      {
        "facts": [
          "dimensionsMm",
          "pinLabelsLeftToRight",
          "render",
          "powerMonitor"
        ],
        "ref": "https://github.com/adafruit/Adafruit-INA219-Current-Sensor-PCB"
      },
      {
        "facts": [
          "pinLabelsLeftToRight",
          "logicVoltage",
          "render",
          "powerMonitor"
        ],
        "ref": "https://www.adafruit.com/product/904"
      },
      {
        "facts": [
          "powerMonitor"
        ],
        "ref": "https://learn.adafruit.com/adafruit-ina219-current-sensor-breakout/pinouts"
      }
    ],
    "interfaces": [
      "i2c"
    ],
    "copy": {
      "summary": "Volts, amps, watts: 26 V, 3.2 A, I2C",
      "wiringNote": "High-side: the supply goes to Vin+ and the load to Vin-, sharing ground with the board.",
      "optionLabel": "Adafruit INA219"
    },
    "pads": [
      {
        "label": "VIN",
        "xPx": 104.5,
        "yPx": 275.5
      },
      {
        "label": "GND",
        "xPx": 142.5,
        "yPx": 275.5
      },
      {
        "label": "SCL",
        "xPx": 180.5,
        "yPx": 275.5
      },
      {
        "label": "SDA",
        "xPx": 218.5,
        "yPx": 275.5
      },
      {
        "label": "VIN-",
        "xPx": 256.5,
        "yPx": 275.5
      },
      {
        "label": "VIN+",
        "xPx": 294.5,
        "yPx": 275.5
      }
    ],
    "padHoleRadiusPx": 7,
    "supplyRail": "v3v3"
  },
  "adafruit-midi-featherwing": {
    "manifestVersion": 1,
    "partId": "adafruit-midi-featherwing",
    "label": "Adafruit MIDI FeatherWing (DIN-5, H11L1MS)",
    "category": "input-control",
    "dimensionsMm": {
      "width": 50.8,
      "height": 22.86
    },
    "manufacturer": "Adafruit",
    "logicVoltage": "3.3 V",
    "pinLabelsLeftToRight": [
      "RESET",
      "3.3V",
      "AREF",
      "GND",
      "A",
      "B",
      "C",
      "D",
      "E",
      "F",
      "SCK",
      "MOSI",
      "MISO",
      "MIDI_RX",
      "MIDI_TX",
      "G",
      "VBAT",
      "EN",
      "USB",
      "N",
      "M",
      "L",
      "K",
      "J",
      "I",
      "H",
      "SCL",
      "SDA"
    ],
    "notes": [
      "Official product 4740 uses H11L1MS, not 6N138.",
      "Both DIN-5 sockets are fitted; all 28 Feather header holes remain unpopulated.",
      "H11L1MS and SMD components are on the opposite PCB face to the DIN sockets.",
      "3V and GND power the wing; Feather RX receives MIDI and TX transmits at 31250 baud.",
      "The canonical view shows MIDI IN on the left and MIDI OUT on the right.",
      "Most Feather header pins are pass-through; only 3V, GND, RX and TX operate this wing.",
      "STEP geometry and Eagle pad coordinates are authoritative. Font contours and material finishes are visual approximations."
    ],
    "render": {
      "file": "parts/adafruit-midi-featherwing.webp",
      "widthPx": 618,
      "heightPx": 283,
      "pxPerMm": 12.008
    },
    "revision": 1,
    "partTypes": [
      "MidiInterface"
    ],
    "categories": [
      "dmx-midi"
    ],
    "verification": "reviewed",
    "sources": [
      {
        "facts": [
          "label",
          "render"
        ],
        "ref": "https://www.adafruit.com/product/4740"
      },
      {
        "facts": [
          "dimensionsMm",
          "pinLabelsLeftToRight",
          "render"
        ],
        "ref": "https://github.com/adafruit/Adafruit-MIDI-FeatherWing-PCB"
      },
      {
        "facts": [
          "dimensionsMm",
          "render"
        ],
        "ref": "https://github.com/adafruit/Adafruit_CAD_Parts/tree/main/4740%20MIDI%20FeatherWing"
      },
      {
        "facts": [
          "pinLabelsLeftToRight",
          "logicVoltage",
          "midiDin"
        ],
        "ref": "https://learn.adafruit.com/adafruit-midi-featherwing/pinouts"
      }
    ],
    "copy": {
      "summary": "Opto-isolated DIN-5 MIDI in, on 3.3 V",
      "wiringNote": "Power from 3.3 V. Only 3.3V, GND and MIDI_RX are wired; the optocoupler output needs no divider. Plug the keyboard into the left socket, MIDI IN.",
      "optionLabel": "Adafruit MIDI FeatherWing"
    },
    "pads": [
      {
        "label": "RESET",
        "xPx": 79.8,
        "yPx": 263
      },
      {
        "label": "3.3V",
        "xPx": 110.1,
        "yPx": 263
      },
      {
        "label": "AREF",
        "xPx": 140.8,
        "yPx": 263
      },
      {
        "label": "GND",
        "xPx": 171.1,
        "yPx": 263
      },
      {
        "label": "A",
        "xPx": 201.8,
        "yPx": 263
      },
      {
        "label": "B",
        "xPx": 232.2,
        "yPx": 263
      },
      {
        "label": "C",
        "xPx": 262.8,
        "yPx": 263
      },
      {
        "label": "D",
        "xPx": 293.2,
        "yPx": 263
      },
      {
        "label": "E",
        "xPx": 323.8,
        "yPx": 263
      },
      {
        "label": "F",
        "xPx": 354.2,
        "yPx": 263
      },
      {
        "label": "SCK",
        "xPx": 384.8,
        "yPx": 263
      },
      {
        "label": "MOSI",
        "xPx": 415.2,
        "yPx": 263
      },
      {
        "label": "MISO",
        "xPx": 445.8,
        "yPx": 263
      },
      {
        "label": "MIDI_RX",
        "xPx": 476.2,
        "yPx": 263
      },
      {
        "label": "MIDI_TX",
        "xPx": 506.8,
        "yPx": 263
      },
      {
        "label": "G",
        "xPx": 537.2,
        "yPx": 263
      },
      {
        "label": "VBAT",
        "xPx": 201.8,
        "yPx": 19
      },
      {
        "label": "EN",
        "xPx": 232.2,
        "yPx": 19
      },
      {
        "label": "USB",
        "xPx": 262.8,
        "yPx": 19
      },
      {
        "label": "N",
        "xPx": 293.2,
        "yPx": 19
      },
      {
        "label": "M",
        "xPx": 323.8,
        "yPx": 19
      },
      {
        "label": "L",
        "xPx": 354.2,
        "yPx": 19
      },
      {
        "label": "K",
        "xPx": 384.8,
        "yPx": 19
      },
      {
        "label": "J",
        "xPx": 415.2,
        "yPx": 19
      },
      {
        "label": "I",
        "xPx": 445.8,
        "yPx": 19
      },
      {
        "label": "H",
        "xPx": 476.2,
        "yPx": 19
      },
      {
        "label": "SCL",
        "xPx": 506.8,
        "yPx": 19
      },
      {
        "label": "SDA",
        "xPx": 537.2,
        "yPx": 19
      }
    ],
    "padHoleRadiusPx": 5.4,
    "supplyRail": "v3v3",
    "midiDin": {
      "device": "H11L1MS",
      "supplyVolts": 3.3,
      "isolated": true,
      "inputSocket": "left"
    }
  },
  "adafruit-mpr121-touch-sensor": {
    "manifestVersion": 1,
    "partId": "adafruit-mpr121-touch-sensor",
    "label": "Adafruit MPR121 12-key touch sensor",
    "category": "input-control",
    "dimensionsMm": {
      "width": 33.0,
      "height": 19.0
    },
    "manufacturer": "Adafruit (product 1982) / NXP MPR121",
    "logicVoltage": "3-5 V supply (Vin); onboard 3.3 V regulator; I2C",
    "pinLabelsLeftToRight": [
      "Vin",
      "3Vo",
      "GND",
      "SCL",
      "SDA",
      "IRQ",
      "ADDR"
    ],
    "notes": [
      "Twelve capacitive-touch electrodes on one I2C device: each electrode hole takes a wire to a pad or foil, and the chip reports a touched or released bit per electrode.",
      "Vin takes 3-5 V and an onboard regulator makes 3Vo for the chip; the I2C lines can be driven at 3.3 V. Do not power the chip from 3Vo with 5 V logic.",
      "ADDR selects the I2C address: left open or tied to GND gives 0x5A, to 3V 0x5B, to SDA 0x5C and to SCL 0x5D, so up to four can share a bus.",
      "IRQ is an open-collector, active-low interrupt that falls when any electrode changes state; a polled driver does not need it.",
      "External connections are shown unpopulated; the header ships loose. The exact hole coordinates and component placement are approximated from the product photographs."
    ],
    "touchPad": {
      "device": "MPR121",
      "interface": "I2C",
      "electrodes": 12,
      "i2cAddresses": [
        90,
        91,
        92,
        93
      ],
      "defaultI2cAddress": 90,
      "touchThreshold": 12,
      "releaseThreshold": 6
    },
    "render": {
      "file": "parts/adafruit-mpr121-touch-sensor.webp",
      "widthPx": 416,
      "heightPx": 248,
      "pxPerMm": 12.0,
      "indicators": [
        {
          "rectPx": [
            349.8,
            95.7,
            9.1,
            18.2
          ],
          "color": [
            26,
            255,
            51
          ],
          "drive": "power"
        }
      ]
    },
    "revision": 1,
    "partTypes": [
      "TouchPadInput"
    ],
    "categories": [
      "buttons-touch"
    ],
    "verification": "reviewed",
    "sources": [
      {
        "facts": [
          "dimensionsMm",
          "pinLabelsLeftToRight",
          "logicVoltage",
          "touchPad"
        ],
        "ref": "https://www.adafruit.com/product/1982"
      },
      {
        "facts": [
          "pinLabelsLeftToRight",
          "touchPad"
        ],
        "ref": "https://learn.adafruit.com/adafruit-mpr121-12-key-capacitive-touch-sensor-breakout-tutorial/pinouts"
      }
    ],
    "interfaces": [
      "i2c"
    ],
    "copy": {
      "summary": "Twelve capacitive-touch electrodes over I2C",
      "wiringNote": "Power Vin from 3.3 V. Tie ADDR to GND for 0x5A, 3V for 0x5B, SDA for 0x5C or SCL for 0x5D; IRQ is not needed.",
      "optionLabel": "Adafruit MPR121 breakout"
    },
    "pads": [
      {
        "label": "Vin",
        "xPx": 116.6,
        "yPx": 207.5
      },
      {
        "label": "3Vo",
        "xPx": 147.1,
        "yPx": 207.5
      },
      {
        "label": "GND",
        "xPx": 177.6,
        "yPx": 207.5
      },
      {
        "label": "SCL",
        "xPx": 208,
        "yPx": 207.5
      },
      {
        "label": "SDA",
        "xPx": 238.4,
        "yPx": 207.5
      },
      {
        "label": "IRQ",
        "xPx": 268.9,
        "yPx": 207.5
      },
      {
        "label": "ADDR",
        "xPx": 299.4,
        "yPx": 207.5
      }
    ],
    "padHoleRadiusPx": 6,
    "supplyRail": "v3v3"
  },
  "adafruit-pca9685-pwm-driver": {
    "manifestVersion": 1,
    "partId": "adafruit-pca9685-pwm-driver",
    "label": "Adafruit PCA9685 16-channel PWM driver",
    "category": "support",
    "dimensionsMm": {
      "width": 25.4,
      "height": 62.5
    },
    "manufacturer": "Adafruit (product 815) / NXP PCA9685",
    "logicVoltage": "2.3-5.5 V logic supply (VCC); separate V+ rail for the outputs",
    "pinLabelsLeftToRight": [
      "GND",
      "OE",
      "SCL",
      "SDA",
      "VCC",
      "V+"
    ],
    "notes": [
      "Sixteen free-running 12-bit PWM outputs on two I2C wires. Each output has three holes in a row: the PWM signal, the V+ rail and ground.",
      "The PCA9685 is a PWM and servo driver, not an addressable-pixel output. It suits analogue dimming of single-colour LEDs, indicators and hobby servos.",
      "VCC powers the chip at 2.3-5.5 V and sets the I2C level. V+ is a separate rail for the outputs, 5-6 V for servos, brought in through the power terminal or the V+ header pin.",
      "OE is an active-low output enable: pull it high to switch every output off without touching the I2C registers.",
      "Default I2C address 0x40. Bridging the A0-A5 pads changes it, and the identical chain header lets several boards share one bus.",
      "The headers are shown unpopulated; the green V+/GND screw terminal is shown fitted, as on the pictured board. Output rows follow the pinout photograph: PWM, V+, GND."
    ],
    "pwmDriver": {
      "device": "PCA9685",
      "interface": "I2C",
      "channels": 16,
      "resolutionBits": 12,
      "i2cAddresses": [
        64,
        65,
        66,
        67,
        68,
        69,
        70,
        71,
        72,
        73,
        74,
        75,
        76,
        77,
        78,
        79,
        80,
        81,
        82,
        83,
        84,
        85,
        86,
        87,
        88,
        89,
        90,
        91,
        92,
        93,
        94,
        95,
        96,
        97,
        98,
        99,
        100,
        101,
        102,
        103,
        104,
        105,
        106,
        107,
        108,
        109,
        110,
        111
      ],
      "defaultI2cAddress": 64,
      "oscillatorMHz": 25,
      "minPwmHz": 24,
      "maxPwmHz": 1526,
      "defaultPwmHz": 1000
    },
    "render": {
      "file": "parts/adafruit-pca9685-pwm-driver.webp",
      "widthPx": 400,
      "heightPx": 955,
      "pxPerMm": 14.961,
      "indicators": [
        {
          "rectPx": [
            56.7,
            576.8,
            11.4,
            22.7
          ],
          "color": [
            26,
            255,
            51
          ],
          "drive": "power"
        }
      ]
    },
    "revision": 1,
    "partTypes": [
      "PwmDriverOutput"
    ],
    "categories": [
      "switching-pwm-drivers"
    ],
    "verification": "reviewed",
    "sources": [
      {
        "facts": [
          "dimensionsMm",
          "pwmDriver"
        ],
        "ref": "https://www.adafruit.com/product/815"
      },
      {
        "facts": [
          "pinLabelsLeftToRight",
          "logicVoltage",
          "pwmDriver"
        ],
        "ref": "https://learn.adafruit.com/16-channel-pwm-servo-driver/pinouts"
      }
    ],
    "interfaces": [
      "i2c"
    ],
    "copy": {
      "summary": "Sixteen 12-bit PWM channels over I2C",
      "wiringNote": "Power VCC from 3.3 V with GND, SDA and SCL to the controller. V+ is the outputs' own supply (5 to 6 V for servos) and is not drawn here. Leave OE unconnected to keep the outputs enabled. A dimming or servo channel takes its signal from the PWM hole, with V+ and ground beside it.",
      "optionLabel": "Adafruit PCA9685"
    },
    "pads": [
      {
        "label": "GND",
        "xPx": 104.5,
        "yPx": 904.8
      },
      {
        "label": "OE",
        "xPx": 142.5,
        "yPx": 904.8
      },
      {
        "label": "SCL",
        "xPx": 180.5,
        "yPx": 904.8
      },
      {
        "label": "SDA",
        "xPx": 218.5,
        "yPx": 904.8
      },
      {
        "label": "VCC",
        "xPx": 256.5,
        "yPx": 904.8
      },
      {
        "label": "V+",
        "xPx": 294.5,
        "yPx": 904.8
      }
    ],
    "padHoleRadiusPx": 7,
    "supplyRail": "v3v3"
  },
  "adafruit-vl53l0x-distance-sensor": {
    "manifestVersion": 1,
    "partId": "adafruit-vl53l0x-distance-sensor",
    "label": "Adafruit VL53L0X distance sensor",
    "category": "input-control",
    "dimensionsMm": {
      "width": 20.32,
      "height": 17.78
    },
    "manufacturer": "Adafruit (product 3317) / STMicroelectronics VL53L0X",
    "logicVoltage": "3-5 V VIN; onboard 2.8 V regulator and level shifting make I2C safe at either supply",
    "pinLabelsLeftToRight": [
      "VIN",
      "2v8",
      "GND",
      "GPIO",
      "SHDN",
      "SCL",
      "SDA"
    ],
    "notes": [
      "Time-of-flight laser distance sensor over I2C: about 30 mm to 1.2 m in the default mode, with 3-12% accuracy depending on light and target.",
      "Power VIN from 3.3 V for an ESP controller so the I2C pull-ups stay in the controller domain. The board has a 2.8 V regulator and level shifting.",
      "The address is 0x29 at power-up and no jumper changes it. Studio can drive each SHDN pin and assign 0x30 to 0x33 so more than one sensor can share the bus.",
      "2v8 is the regulator output (up to 100 mA); GPIO is the sensor's interrupt output and has no level shifting. SHDN holds the sensor in reset when pulled low. None of the three is needed for basic readings.",
      "The seven-pin row ships loose and is rendered as unpopulated plated holes."
    ],
    "distanceSensor": {
      "device": "VL53L0X",
      "interface": "I2C",
      "minMm": 30,
      "maxMm": 1200,
      "i2cAddresses": [
        41
      ],
      "defaultI2cAddress": 41
    },
    "render": {
      "file": "parts/adafruit-vl53l0x-distance-sensor.webp",
      "widthPx": 400,
      "heightPx": 353,
      "pxPerMm": 18.701
    },
    "revision": 1,
    "partTypes": [
      "DistanceInput"
    ],
    "categories": [
      "distance-time-of-flight"
    ],
    "verification": "reviewed",
    "sources": [
      {
        "facts": [
          "dimensionsMm",
          "pinLabelsLeftToRight",
          "distanceSensor"
        ],
        "ref": "https://github.com/adafruit/Adafruit-VL53L0X-ToF-Distance-Sensor-PCB"
      },
      {
        "facts": [
          "logicVoltage",
          "label",
          "distanceSensor"
        ],
        "ref": "https://www.adafruit.com/product/3317"
      },
      {
        "facts": [
          "logicVoltage",
          "label",
          "distanceSensor"
        ],
        "ref": "https://learn.adafruit.com/adafruit-vl53l0x-micro-lidar-distance-sensor-breakout/pinouts"
      },
      {
        "facts": [
          "distanceSensor"
        ],
        "ref": "STMicroelectronics VL53L0X (local copy in the asset workspace)"
      }
    ],
    "interfaces": [
      "i2c"
    ],
    "copy": {
      "summary": "Laser time-of-flight, 3 cm to 1.2 m, over I2C",
      "wiringNote": "Power VIN from 3.3 V. One sensor answers on 0x29; leave 2v8, GPIO and SHDN unconnected. To share the bus, wire each SHDN pin and pick an address from 0x30 to 0x33. The build needs the Pololu VL53L0X library, which Studio installs the first time.",
      "optionLabel": "Adafruit VL53L0X laser",
      "optionOrder": 2
    },
    "pads": [
      {
        "label": "VIN",
        "xPx": 57,
        "yPx": 294.8
      },
      {
        "label": "2v8",
        "xPx": 104.5,
        "yPx": 294.8
      },
      {
        "label": "GND",
        "xPx": 152,
        "yPx": 294.8
      },
      {
        "label": "GPIO",
        "xPx": 199.5,
        "yPx": 294.8
      },
      {
        "label": "SHDN",
        "xPx": 247,
        "yPx": 294.8
      },
      {
        "label": "SCL",
        "xPx": 294.5,
        "yPx": 294.8
      },
      {
        "label": "SDA",
        "xPx": 342,
        "yPx": 294.8
      }
    ],
    "padHoleRadiusPx": 9,
    "supplyRail": "v3v3"
  },
  "adafruit-vl53l1x-distance-sensor": {
    "manifestVersion": 1,
    "partId": "adafruit-vl53l1x-distance-sensor",
    "label": "Adafruit VL53L1X distance sensor",
    "category": "input-control",
    "dimensionsMm": {
      "width": 25.5,
      "height": 17.5
    },
    "manufacturer": "Adafruit (product 3967) / STMicroelectronics VL53L1X",
    "logicVoltage": "3-5 V VIN; I2C and XSHUT are level-shifted to VIN, GPIO is 2.8 V",
    "pinLabelsLeftToRight": [
      "VIN",
      "GND",
      "SDA",
      "SCL",
      "XSHUT",
      "GPIO"
    ],
    "notes": [
      "Time-of-flight laser distance sensor over I2C: about 30 mm to 4 m in long distance mode, with a 27 degree field of view and up to 50 Hz ranging.",
      "Power VIN with the same level as the controller's logic: 3.3 V for an ESP controller. The board has 10 kilohm pull-ups on SDA and SCL, and XSHUT is level-shifted.",
      "The address is 0x29 at power-up and no jumper changes it. Studio can drive each XSHUT pin and assign 0x30 to 0x33 so more than one sensor can share the bus.",
      "GPIO is the sensor's interrupt output at 2.8 V logic and XSHUT holds the sensor in reset when pulled low; neither is needed for basic readings.",
      "The six-hole row ships loose and is rendered as unpopulated plated holes; the two STEMMA QT connectors are shown fitted. Hole and component positions are representative, not measured from a board file."
    ],
    "distanceSensor": {
      "device": "VL53L1X",
      "interface": "I2C",
      "minMm": 30,
      "maxMm": 4000,
      "i2cAddresses": [
        41
      ],
      "defaultI2cAddress": 41
    },
    "render": {
      "file": "parts/adafruit-vl53l1x-distance-sensor.webp",
      "widthPx": 400,
      "heightPx": 281,
      "pxPerMm": 14.902
    },
    "revision": 1,
    "partTypes": [
      "DistanceInput"
    ],
    "categories": [
      "distance-time-of-flight"
    ],
    "verification": "reviewed",
    "sources": [
      {
        "facts": [
          "dimensionsMm",
          "pinLabelsLeftToRight",
          "logicVoltage",
          "label",
          "distanceSensor"
        ],
        "ref": "https://www.adafruit.com/product/3967"
      },
      {
        "facts": [
          "dimensionsMm",
          "pinLabelsLeftToRight",
          "logicVoltage",
          "label",
          "distanceSensor"
        ],
        "ref": "https://learn.adafruit.com/adafruit-vl53l1x/pinouts"
      },
      {
        "facts": [
          "distanceSensor"
        ],
        "ref": "STMicroelectronics VL53L1X (local copy in the asset workspace)"
      }
    ],
    "interfaces": [
      "i2c"
    ],
    "copy": {
      "summary": "Laser time-of-flight, 3 cm to 4 m, over I2C",
      "wiringNote": "Power VIN from 3.3 V. One sensor answers on 0x29; leave XSHUT and GPIO unconnected. To share the bus, wire each XSHUT pin and pick an address from 0x30 to 0x33. It runs in long distance mode, which reaches about 4 m. The build needs the Pololu VL53L1X library, which Studio installs the first time.",
      "optionLabel": "Adafruit VL53L1X laser",
      "optionOrder": 3
    },
    "pads": [
      {
        "label": "VIN",
        "xPx": 104.8,
        "yPx": 232.5
      },
      {
        "label": "GND",
        "xPx": 142.7,
        "yPx": 232.5
      },
      {
        "label": "SDA",
        "xPx": 180.6,
        "yPx": 232.5
      },
      {
        "label": "SCL",
        "xPx": 218.4,
        "yPx": 232.5
      },
      {
        "label": "XSHUT",
        "xPx": 256.3,
        "yPx": 232.5
      },
      {
        "label": "GPIO",
        "xPx": 294.2,
        "yPx": 232.5
      }
    ],
    "padHoleRadiusPx": 7,
    "supplyRail": "v3v3"
  },
  "bm3451-4s-60a-active-balance-bms": {
    "manifestVersion": 1,
    "partId": "bm3451-4s-60a-active-balance-bms",
    "label": "BM3451 4S 60 A BMS with active balancing",
    "category": "battery",
    "dimensionsMm": {
      "width": 55.0,
      "height": 45.0
    },
    "manufacturer": "generic (BM3451)",
    "logicVoltage": "none; power only",
    "pinLabelsLeftToRight": [
      "B-",
      "B1",
      "B2",
      "B3",
      "B+",
      "P-",
      "P+"
    ],
    "notes": [
      "60 A and 1 A active-balance figures come from the listing and remain HW-14 verification items."
    ],
    "batteryModule": {
      "series": 4,
      "chemistries": [
        "li-ion"
      ],
      "protection": {
        "continuousDischargeMa": 60000,
        "continuousChargeMa": 60000,
        "overchargeV": 4.25,
        "overDischargeV": 2.8,
        "port": "common",
        "switchedLine": "negative",
        "temperatureSensor": false,
        "powerTerminals": [
          "B-",
          "B+",
          "P-",
          "P+"
        ]
      },
      "balance": {
        "type": "active",
        "balanceMa": 1000,
        "balanceTerminals": [
          "B-",
          "B1",
          "B2",
          "B3",
          "B+"
        ],
        "connectionOrder": [
          "B-",
          "B1",
          "B2",
          "B3",
          "B+"
        ]
      }
    },
    "render": {
      "file": "parts/bm3451-4s-60a-active-balance-bms.webp",
      "widthPx": 680,
      "heightPx": 560,
      "pxPerMm": 12.0
    },
    "revision": 1,
    "partTypes": [
      "BatteryModule"
    ],
    "categories": [
      "battery-protection"
    ],
    "verification": "reviewed",
    "sources": [
      {
        "facts": [
          "pinLabelsLeftToRight",
          "render",
          "batteryModule"
        ],
        "ref": "https://www.aliexpress.com/item/1005010418508436.html"
      }
    ],
    "copy": {
      "summary": "4S li-ion · protection, active balance"
    }
  },
  "dfplayer-mini": {
    "manifestVersion": 1,
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
      "SPK2",
      "GND",
      "SPK1",
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
      "Self-contained UART-controlled MP3 player with onboard microSD socket and mono speaker driver.",
      "Power from 5 V. The onboard speaker amplifier can draw about 200 mA. Put numbered files in the card's /mp3 folder. Add a 1 kΩ resistor between the controller TX and the module RX."
    ],
    "render": {
      "file": "parts/dfplayer-mini.webp",
      "widthPx": 400,
      "heightPx": 400,
      "pxPerMm": 19.6
    },
    "revision": 1,
    "partTypes": [
      "DFPlayerOutput"
    ],
    "categories": [
      "audio-players"
    ],
    "verification": "reviewed",
    "sources": [
      {
        "facts": [
          "dimensionsMm",
          "pinLabelsLeftToRight",
          "logicVoltage",
          "render",
          "uartPlayer"
        ],
        "ref": "https://wiki.dfrobot.com/dfr0299/"
      }
    ],
    "copy": {
      "summary": "UART-controlled microSD audio player with speaker and line outputs",
      "wiringNote": "Power from 5 V. Put numbered files in the card’s /mp3 folder. Speaker mode uses SPK1/SPK2 directly; Line Out uses DAC_L/DAC_R into a power amplifier or powered speakers. Add a 1 kΩ series resistor from controller TX to module RX if UART noise causes buzzing.",
      "optionLabel": "DFPlayer Mini"
    },
    "pads": [
      {
        "label": "VCC",
        "xPx": 29,
        "yPx": 27
      },
      {
        "label": "RX",
        "xPx": 29,
        "yPx": 76
      },
      {
        "label": "TX",
        "xPx": 29,
        "yPx": 125
      },
      {
        "label": "DAC_R",
        "xPx": 29,
        "yPx": 174
      },
      {
        "label": "DAC_L",
        "xPx": 29,
        "yPx": 224
      },
      {
        "label": "SPK2",
        "xPx": 29,
        "yPx": 273
      },
      {
        "label": "GND",
        "xPx": 29,
        "yPx": 322
      },
      {
        "label": "SPK1",
        "xPx": 29,
        "yPx": 371
      },
      {
        "label": "IO1",
        "xPx": 370,
        "yPx": 371
      },
      {
        "label": "GND",
        "xPx": 370,
        "yPx": 322
      },
      {
        "label": "IO2",
        "xPx": 370,
        "yPx": 273
      },
      {
        "label": "ADKEY1",
        "xPx": 370,
        "yPx": 224
      },
      {
        "label": "ADKEY2",
        "xPx": 370,
        "yPx": 174
      },
      {
        "label": "USB+",
        "xPx": 370,
        "yPx": 125
      },
      {
        "label": "USB−",
        "xPx": 370,
        "yPx": 76
      },
      {
        "label": "BUSY",
        "xPx": 370,
        "yPx": 27
      }
    ],
    "padHoleRadiusPx": 10,
    "supplyRail": "v5",
    "uartPlayer": {
      "device": "DFPlayer",
      "supplyMinV": 3.2,
      "supplyMaxV": 5,
      "maxCurrentMa": 200,
      "baud": 9600,
      "commandGapMs": 100,
      "bootMs": 1000
    }
  },
  "dgxby-20a-5v-buck-converter": {
    "manifestVersion": 1,
    "partId": "dgxby-20a-5v-buck-converter",
    "label": "DGXBY 12/24 V to 5 V 20 A buck converter",
    "category": "power-conversion",
    "dimensionsMm": {
      "width": 74.0,
      "height": 74.0
    },
    "manufacturer": "DGXBY",
    "logicVoltage": "none; power only",
    "pinLabelsLeftToRight": [
      "IN+",
      "IN-",
      "OUT+",
      "OUT-"
    ],
    "notes": [
      "20 A is the selected seller variant and remains an HW-14 continuous-load verification item."
    ],
    "powerConverter": {
      "role": "led-rail",
      "topology": "buck (non-isolated, common negative)",
      "inputMinV": 9,
      "inputMaxV": 36,
      "minHeadroomV": 1.5,
      "outputSetV": 5,
      "continuousCurrentMa": 20000,
      "peakCurrentMa": 20000,
      "typicalEfficiency": 0.92,
      "isolated": false,
      "adjustable": false,
      "outputCurrentLimit": "none",
      "terminals": [
        "IN+",
        "IN-",
        "OUT+",
        "OUT-"
      ],
      "terminalPositions": [
        [
          0.253,
          0.985
        ],
        [
          0.418,
          0.985
        ],
        [
          0.584,
          0.985
        ],
        [
          0.749,
          0.985
        ]
      ]
    },
    "render": {
      "file": "parts/dgxby-20a-5v-buck-converter.webp",
      "widthPx": 908,
      "heightPx": 908,
      "pxPerMm": 12.0
    },
    "revision": 1,
    "partTypes": [
      "PowerConverter"
    ],
    "categories": [
      "power-buck"
    ],
    "verification": "reviewed",
    "sources": [
      {
        "facts": [
          "pinLabelsLeftToRight",
          "render",
          "powerConverter"
        ],
        "ref": "https://www.aliexpress.com/item/1005003512778149.html"
      }
    ],
    "copy": {
      "summary": "LED rail ·9-36 V in, 5 V 20 A at 40 °C"
    }
  },
  "ds18b20-waterproof-probe": {
    "manifestVersion": 1,
    "partId": "ds18b20-waterproof-probe",
    "label": "Waterproof DS18B20 temperature probe",
    "category": "input-control",
    "dimensionsMm": {
      "width": 28.0,
      "height": 72.0
    },
    "manufacturer": "Adafruit (product 381) / Maxim DS18B20",
    "logicVoltage": "3.0-5.5 V VDD; DATA idles at VDD through the 4.7 kohm pull-up, so power it from the controller's 3.3 V rail",
    "pinLabelsLeftToRight": [
      "VCC",
      "GND",
      "DATA"
    ],
    "notes": [
      "A 1-Wire digital thermometer in a sealed 6 x 30 mm stainless tube; reads -55 to +125 C, accurate to 0.5 C from -10 to +85 C.",
      "Red is VDD, black (or blue) is GND and yellow (or white) is DATA. A four-wire cable has a bare shield wire as well, which is left unconnected at the controller.",
      "DATA needs a 4.7 kohm pull-up to VDD. The bare probe has none, so the Build Diagram fits one.",
      "The cable is 0.91 m long; the render shows the first 18 mm of it."
    ],
    "temperatureSensor": {
      "device": "DS18B20",
      "interface": "1-Wire",
      "temperatureMinC": -55,
      "temperatureMaxC": 125,
      "pullUpOhms": 4700
    },
    "render": {
      "file": "parts/ds18b20-waterproof-probe.webp",
      "widthPx": 400,
      "heightPx": 997,
      "pxPerMm": 13.571
    },
    "revision": 1,
    "partTypes": [
      "TemperatureInput"
    ],
    "categories": [
      "environment-sensors"
    ],
    "verification": "reviewed",
    "sources": [
      {
        "facts": [
          "logicVoltage",
          "render",
          "temperatureSensor"
        ],
        "ref": "https://www.adafruit.com/product/381"
      },
      {
        "facts": [
          "temperatureSensor"
        ],
        "ref": "https://www.analog.com/media/en/technical-documentation/data-sheets/DS18B20.pdf"
      }
    ],
    "interfaces": [
      "one-wire"
    ],
    "copy": {
      "summary": "A 1-Wire thermometer in a sealed steel tube, -55 to 125 °C",
      "wiringNote": "Red is VCC (3.3 V), black is GND and yellow is DATA. DATA needs a 4.7 kΩ pull-up to 3.3 V; the bare probe has none.",
      "optionLabel": "Waterproof DS18B20 probe"
    },
    "pads": [
      {
        "label": "VCC",
        "xPx": 104.5,
        "yPx": 948
      },
      {
        "label": "GND",
        "xPx": 199.5,
        "yPx": 948
      },
      {
        "label": "DATA",
        "xPx": 294.5,
        "yPx": 948
      }
    ],
    "padHoleRadiusPx": 6.5,
    "supplyRail": "v3v3"
  },
  "ds3231-rtc-module": {
    "manifestVersion": 1,
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
      "pxPerMm": 12.0,
      "indicators": [
        {
          "rectPx": [
            381.9,
            41.1,
            14.6,
            12.1
          ],
          "color": [
            255,
            15,
            8
          ],
          "drive": "power"
        }
      ]
    },
    "revision": 1,
    "partTypes": [
      "RtcModule"
    ],
    "categories": [
      "clocks"
    ],
    "verification": "reviewed",
    "sources": [
      {
        "facts": [
          "dimensionsMm",
          "notes",
          "rtc"
        ],
        "ref": "https://www.analog.com/media/en/technical-documentation/data-sheets/DS3231.pdf"
      },
      {
        "facts": [
          "logicVoltage",
          "notes"
        ],
        "ref": "https://www.eitkw.com/product/zs-042-rtc-real-time-clock-module/"
      },
      {
        "facts": [
          "notes"
        ],
        "ref": "https://lastminuteengineers.com/ds3231-rtc-arduino-tutorial/"
      },
      {
        "facts": [
          "pinLabelsLeftToRight",
          "logicVoltage"
        ],
        "ref": "https://docs.cirkitdesigner.com/component/957beab0-c127-8e8e-6d32-4ce97d53e9eb/zs-042-rtc-modulea"
      },
      {
        "facts": [
          "notes"
        ],
        "ref": "https://www.onetransistor.eu/2019/07/zs042-ds3231-battery-charging-circuit.html"
      }
    ],
    "copy": {
      "summary": "ZS-042 breakout, six-pin header",
      "optionLabel": "DS3231 RTC module"
    },
    "pads": [
      {
        "label": "32K",
        "xPx": 155.2,
        "yPx": 252.1
      },
      {
        "label": "SQW",
        "xPx": 185.8,
        "yPx": 252.1
      },
      {
        "label": "SCL",
        "xPx": 216.2,
        "yPx": 252.1
      },
      {
        "label": "SDA",
        "xPx": 246.7,
        "yPx": 252.1
      },
      {
        "label": "VCC",
        "xPx": 277.1,
        "yPx": 252.1
      },
      {
        "label": "GND",
        "xPx": 307.7,
        "yPx": 252.1
      }
    ],
    "padHoleRadiusPx": 5.9,
    "supplyRail": "v3v3",
    "rtc": {
      "device": "DS3231",
      "i2cAddress": 104
    }
  },
  "dx-0809-stereo-amplifier": {
    "manifestVersion": 1,
    "partId": "dx-0809-stereo-amplifier",
    "label": "DX-0809 stereo power amplifier",
    "category": "amplifier",
    "dimensionsMm": {
      "width": 130.0,
      "height": 105.0
    },
    "manufacturer": "generic DX-0809 / TDA8944-TDA8946J class",
    "logicVoltage": "12 V power; line-level analog input",
    "pinLabelsLeftToRight": [
      "AUX-L",
      "AUX-GND",
      "AUX-R",
      "+12V",
      "GND",
      "L+",
      "L-",
      "R-",
      "R+"
    ],
    "notes": [
      "Large analog stereo power-amplifier board with line input, volume/tone controls and two 6.35 mm microphone jacks.",
      "Seller claims of 2 x 40 W are peak marketing; the TDA8946J datasheet specifies 2 x 15 W into 8 ohms at 18 V.",
      "A DAC such as PCM5102A or UDA1334A is required when used with ESP32 variants that do not provide analog audio output."
    ],
    "render": {
      "file": "parts/dx-0809-stereo-amplifier.webp",
      "widthPx": 1200,
      "heightPx": 973,
      "pxPerMm": 9.077
    },
    "revision": 1,
    "partTypes": [
      "PowerAmplifier"
    ],
    "categories": [
      "audio-power-amplifiers"
    ],
    "verification": "reviewed",
    "sources": [
      {
        "facts": [
          "logicVoltage",
          "render",
          "label"
        ],
        "ref": "https://www.electronicspartsbd.com/product/china-dx0809-tda8946-40w-dual-channel-audio-amplifier-12v-87"
      },
      {
        "facts": [
          "notes",
          "powerAmp"
        ],
        "ref": "https://www.amazon.com/DX-0809-DC12V-Channel-TDA8944-Amplifier/dp/B09NC6V361"
      },
      {
        "facts": [
          "notes"
        ],
        "ref": "https://www.nxp.com/docs/en/data-sheet/TDA8946J.pdf"
      }
    ],
    "copy": {
      "summary": "2 x 15 W, 12 V — AUX line in",
      "wiringNote": "Needs its own 12 V supply; the controller cannot power it. Feed its AUX input from the line out of a DAC, and share ground with the board.",
      "optionLabel": "DX-0809",
      "optionOrder": 3
    },
    "pads": [
      {
        "label": "AUX-L",
        "xPx": 531.3,
        "yPx": 631.3
      },
      {
        "label": "AUX-GND",
        "xPx": 599.5,
        "yPx": 631.2
      },
      {
        "label": "AUX-R",
        "xPx": 667.5,
        "yPx": 631.1
      },
      {
        "label": "+12V",
        "xPx": 572.5,
        "yPx": 86.8
      },
      {
        "label": "GND",
        "xPx": 626.8,
        "yPx": 86.6
      },
      {
        "label": "L+",
        "xPx": 164,
        "yPx": 86.4
      },
      {
        "label": "L-",
        "xPx": 218.3,
        "yPx": 86.9
      },
      {
        "label": "R-",
        "xPx": 980.8,
        "yPx": 86.6
      },
      {
        "label": "R+",
        "xPx": 1035,
        "yPx": 86.6
      }
    ],
    "padHoleRadiusPx": 6.1,
    "supplyRail": "v12",
    "powerAmp": {
      "device": "DX-0809",
      "supplyVolts": 12,
      "channels": 2,
      "inputKind": "line"
    }
  },
  "generic-300w-9a-buck-module": {
    "manifestVersion": 1,
    "partId": "generic-300w-9a-buck-module",
    "label": "300 W adjustable buck module (9 A)",
    "category": "power-conversion",
    "dimensionsMm": {
      "width": 65.0,
      "height": 48.0
    },
    "manufacturer": "generic",
    "logicVoltage": "none; power only",
    "pinLabelsLeftToRight": [
      "IN+",
      "IN-",
      "OUT+",
      "OUT-"
    ],
    "notes": [
      "Seller states 9 A output and requires forced cooling above 65 C. The 300 W headline is not available at 5 V."
    ],
    "powerConverter": {
      "role": "led-rail",
      "topology": "buck (non-isolated, common negative)",
      "inputMinV": 5,
      "inputMaxV": 40,
      "minHeadroomV": 1.5,
      "outputSetV": 5,
      "continuousCurrentMa": 9000,
      "peakCurrentMa": 9000,
      "typicalEfficiency": 0.9,
      "isolated": false,
      "adjustable": true,
      "outputCurrentLimit": "none",
      "terminals": [
        "IN+",
        "IN-",
        "OUT+",
        "OUT-"
      ],
      "terminalPositions": [
        [
          0.275,
          0.747
        ],
        [
          0.425,
          0.747
        ],
        [
          0.575,
          0.747
        ],
        [
          0.725,
          0.747
        ]
      ]
    },
    "render": {
      "file": "parts/generic-300w-9a-buck-module.webp",
      "widthPx": 800,
      "heightPx": 596,
      "pxPerMm": 12.0
    },
    "revision": 1,
    "partTypes": [
      "PowerConverter"
    ],
    "categories": [
      "power-buck"
    ],
    "verification": "reviewed",
    "sources": [
      {
        "facts": [
          "pinLabelsLeftToRight",
          "render",
          "powerConverter"
        ],
        "ref": "https://www.aliexpress.com/item/33044155995.html"
      }
    ],
    "copy": {
      "summary": "LED rail ·5-40 V in, 5 V 9 A at 40 °C"
    }
  },
  "generic-i2s-mems-microphone": {
    "manifestVersion": 1,
    "partId": "generic-i2s-mems-microphone",
    "label": "Generic I2S MEMS microphone",
    "category": "microphone",
    "dimensionsMm": {
      "width": 15.2,
      "height": 9.1
    },
    "manufacturer": "generic / Sipeed MSM261S4030H0 class",
    "logicVoltage": "3.3 V",
    "pinLabelsLeftToRight": [
      "GND",
      "VDD",
      "SD",
      "SCK",
      "WS",
      "L/R"
    ],
    "notes": [
      "Representative low-cost MSM261S4030H0-class I2S breakout; supplier solder-mask colour and passive placement vary.",
      "The GenericMEMS profile is an average response correction rather than a claim that every clone has identical acoustics."
    ],
    "render": {
      "file": "parts/generic-i2s-mems-microphone.webp",
      "widthPx": 400,
      "heightPx": 248,
      "pxPerMm": 25.0
    },
    "revision": 1,
    "partTypes": [
      "MicInput"
    ],
    "categories": [
      "audio-microphones"
    ],
    "verification": "reviewed",
    "sources": [
      {
        "facts": [
          "dimensionsMm",
          "pinLabelsLeftToRight",
          "label",
          "microphone"
        ],
        "ref": "https://dl.sipeed.com/MAIX/HDK/Sipeed-I2S_MIC/Specifications/Sipeed%20I2S_Mic%20Datasheet%20V1.0.pdf"
      },
      {
        "facts": [
          "pinLabelsLeftToRight"
        ],
        "ref": "https://www.makerhero.com/img/files/download/Microfone-Sipeed-MSM261S4030H0-Datasheet.pdf"
      }
    ],
    "copy": {
      "summary": "Low-cost MSM261S4030H0-class board",
      "wiringNote": "For the unbranded boards often sold as INMP441. The GenericMEMS profile is an average MEMS correction, not this module's measured response.",
      "optionLabel": "Generic I2S MEMS",
      "optionOrder": 3
    },
    "pads": [
      {
        "label": "GND",
        "xPx": 41.7,
        "yPx": 204.4
      },
      {
        "label": "VDD",
        "xPx": 104.1,
        "yPx": 204.4
      },
      {
        "label": "SD",
        "xPx": 168,
        "yPx": 204.4
      },
      {
        "label": "SCK",
        "xPx": 231,
        "yPx": 204.4
      },
      {
        "label": "WS",
        "xPx": 294.8,
        "yPx": 204.4
      },
      {
        "label": "L/R",
        "xPx": 357.2,
        "yPx": 204.4
      }
    ],
    "padHoleRadiusPx": 10.5,
    "supplyRail": "v3v3",
    "microphone": {
      "device": "GenericMEMS",
      "fastledFactory": "CreateGenericMEMS",
      "fastledProfile": "GenericMEMS"
    }
  },
  "gy-521-mpu6050-module": {
    "manifestVersion": 1,
    "partId": "gy-521-mpu6050-module",
    "label": "GY-521 MPU-6050 accelerometer and gyroscope",
    "category": "input-control",
    "dimensionsMm": {
      "width": 21.0,
      "height": 16.0
    },
    "manufacturer": "GY-521 breakout / TDK InvenSense MPU-6050",
    "logicVoltage": "3.3-5 V VCC; onboard 3.3 V regulator. Power from 3.3 V so the I2C pull-ups stay in the controller domain",
    "pinLabelsLeftToRight": [
      "VCC",
      "GND",
      "SCL",
      "SDA",
      "XDA",
      "XCL",
      "AD0",
      "INT"
    ],
    "notes": [
      "Six-axis motion sensor over I2C: a three-axis accelerometer and a three-axis gyroscope, read at plus or minus 2 g and plus or minus 250 degrees per second by default.",
      "Power VCC from 3.3 V for an ESP controller. The board has a 3.3 V regulator, but its I2C pull-ups follow VCC, so a 3.3 V supply keeps the bus inside the controller's logic level.",
      "The default I2C address is 0x68, the same as a DS3231 clock. Tie AD0 high, or bridge the AD0 jumper, for 0x69.",
      "XDA and XCL are the auxiliary I2C master lines for an external sensor, and INT is the interrupt output. None of them is needed for basic readings.",
      "The eight-pin row ships loose and is rendered as unpopulated plated holes. The board's mounting hole is not modelled."
    ],
    "motionVectorSensor": {
      "device": "MPU-6050",
      "interface": "I2C",
      "i2cAddresses": [
        104,
        105
      ],
      "defaultI2cAddress": 104,
      "accelRangeG": 2,
      "gyroRangeDps": 250
    },
    "render": {
      "file": "parts/gy-521-mpu6050-module.webp",
      "widthPx": 400,
      "heightPx": 310,
      "pxPerMm": 18.095,
      "indicators": [
        {
          "rectPx": [
            43.3,
            46.8,
            27.5,
            13.8
          ],
          "color": [
            255,
            15,
            8
          ],
          "drive": "power"
        }
      ]
    },
    "revision": 1,
    "partTypes": [
      "MotionVectorInput"
    ],
    "categories": [
      "inertial-sensors"
    ],
    "verification": "reviewed",
    "sources": [
      {
        "facts": [
          "dimensionsMm",
          "pinLabelsLeftToRight",
          "logicVoltage",
          "motionVectorSensor"
        ],
        "ref": "https://protosupplies.com/product/mpu-6050-gy-521-3-axis-accel-gryo-sensor-module/"
      },
      {
        "facts": [
          "dimensionsMm",
          "pinLabelsLeftToRight"
        ],
        "ref": "https://github.com/cooked/Eagle-Libraries"
      },
      {
        "facts": [
          "motionVectorSensor"
        ],
        "ref": "InvenSense MPU-6050 (local copy in the asset workspace)"
      }
    ],
    "interfaces": [
      "i2c"
    ],
    "copy": {
      "summary": "Three-axis accelerometer and gyroscope over I2C",
      "wiringNote": "Power VCC from 3.3 V. Leave AD0 unwired for 0x68, or tie it high for 0x69 when a DS3231 clock already uses 0x68.",
      "optionLabel": "GY-521 MPU-6050"
    },
    "pads": [
      {
        "label": "VCC",
        "xPx": 39.1,
        "yPx": 263.3
      },
      {
        "label": "GND",
        "xPx": 85.1,
        "yPx": 263.3
      },
      {
        "label": "SCL",
        "xPx": 131.1,
        "yPx": 263.3
      },
      {
        "label": "SDA",
        "xPx": 177,
        "yPx": 263.3
      },
      {
        "label": "XDA",
        "xPx": 222.9,
        "yPx": 263.3
      },
      {
        "label": "XCL",
        "xPx": 268.9,
        "yPx": 263.3
      },
      {
        "label": "AD0",
        "xPx": 314.9,
        "yPx": 263.3
      },
      {
        "label": "INT",
        "xPx": 360.9,
        "yPx": 263.3
      }
    ],
    "padHoleRadiusPx": 9,
    "supplyRail": "v3v3"
  },
  "hc-sr04-ultrasonic-module": {
    "manifestVersion": 1,
    "partId": "hc-sr04-ultrasonic-module",
    "label": "HC-SR04 ultrasonic distance sensor",
    "category": "input-control",
    "dimensionsMm": {
      "width": 45.0,
      "height": 20.0
    },
    "manufacturer": "Elecfreaks HC-SR04 and compatible modules",
    "logicVoltage": "5 V supply; Echo swings to 5 V, so a 3.3 V controller needs a divider on Echo",
    "pinLabelsLeftToRight": [
      "VCC",
      "Trig",
      "Echo",
      "GND"
    ],
    "notes": [
      "Ultrasonic time-of-flight ranging at 40 kHz: 2 cm to 4 m, about 3 mm resolution, roughly a 15 degree cone. Soft or angled surfaces reflect poorly.",
      "Power VCC from 5 V. The module needs 5 V to run reliably, and its Echo pin swings to 5 V, which is above an ESP32's 3.3 V pin limit.",
      "Put a 1 kohm and 2 kohm divider on Echo for a 3.3 V controller, as the Build Diagram shows. Trig is a 10 microsecond pulse and a 3.3 V output triggers it.",
      "The 3.3 V variants (HC-SR04P, RCWL-1601) are different modules and are not modelled here.",
      "The board prints its pin names on the back. The four header holes are rendered as unpopulated plated holes and the pin names are repeated on the transducer face."
    ],
    "distanceSensor": {
      "device": "HC-SR04",
      "interface": "Trig/Echo pulse",
      "minMm": 20,
      "maxMm": 4000,
      "triggerPulseUs": 10,
      "echoVolts": 5
    },
    "render": {
      "file": "parts/hc-sr04-ultrasonic-module.webp",
      "widthPx": 560,
      "heightPx": 260,
      "pxPerMm": 12.0
    },
    "revision": 1,
    "partTypes": [
      "DistanceInput"
    ],
    "categories": [
      "distance-ultrasonic"
    ],
    "verification": "reviewed",
    "sources": [
      {
        "facts": [
          "dimensionsMm",
          "pinLabelsLeftToRight",
          "logicVoltage",
          "distanceSensor"
        ],
        "ref": "https://cdn.sparkfun.com/datasheets/Sensors/Proximity/HCSR04.pdf"
      },
      {
        "facts": [
          "logicVoltage",
          "label",
          "distanceSensor"
        ],
        "ref": "https://www.sparkfun.com/products/15569"
      },
      {
        "facts": [
          "logicVoltage",
          "label",
          "distanceSensor"
        ],
        "ref": "https://www.adafruit.com/product/3942"
      }
    ],
    "interfaces": [
      "pulse-ranging"
    ],
    "copy": {
      "summary": "Ultrasonic ranging, 2 cm to 4 m, on two GPIOs",
      "wiringNote": "Power VCC from 5 V. Echo swings to 5 V, so a 3.3 V controller needs the 1 kΩ / 2 kΩ divider on Echo; Trig can be driven at 3.3 V.",
      "optionLabel": "HC-SR04 ultrasonic",
      "optionOrder": 1
    },
    "pads": [
      {
        "label": "VCC",
        "xPx": 234.3,
        "yPx": 226
      },
      {
        "label": "Trig",
        "xPx": 264.8,
        "yPx": 226
      },
      {
        "label": "Echo",
        "xPx": 295.2,
        "yPx": 226
      },
      {
        "label": "GND",
        "xPx": 325.7,
        "yPx": 226
      }
    ],
    "padHoleRadiusPx": 6,
    "supplyRail": "v5"
  },
  "hc-sr501-pir-sensor": {
    "manifestVersion": 1,
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
    },
    "revision": 1,
    "partTypes": [
      "MotionInput"
    ],
    "categories": [
      "motion-pir"
    ],
    "verification": "reviewed",
    "sources": [
      {
        "facts": [
          "logicVoltage",
          "notes"
        ],
        "ref": "https://okystar.com/wp-content/uploads/2017/07/OKY3270.pdf"
      },
      {
        "facts": [
          "notes"
        ],
        "ref": "https://www.mpja.com/download/31227sc.pdf"
      },
      {
        "facts": [
          "logicVoltage",
          "notes"
        ],
        "ref": "https://wiki.hshl.de/wiki/index.php/Bewegungsmelder%2C_PIR-Sensor_-_HC-SR501"
      }
    ],
    "copy": {
      "summary": "Infrared: sees a warm body move",
      "wiringNote": "Power VCC from 5 V. OUT is 3.3 V logic.",
      "optionLabel": "HC-SR501 PIR",
      "optionOrder": 1
    },
    "pads": [
      {
        "label": "VCC",
        "xPx": 168.8,
        "yPx": 280.6
      },
      {
        "label": "OUT",
        "xPx": 199.5,
        "yPx": 280.6
      },
      {
        "label": "GND",
        "xPx": 230,
        "yPx": 280.6
      }
    ],
    "padHoleRadiusPx": 5.3,
    "supplyRail": "v5",
    "motionSensor": {
      "activeLevel": "high",
      "supplyVolts": 5
    }
  },
  "hlk-ld2410c-presence-sensor": {
    "manifestVersion": 1,
    "partId": "hlk-ld2410c-presence-sensor",
    "label": "HLK-LD2410C mmWave presence sensor",
    "category": "input-control",
    "dimensionsMm": {
      "width": 22.0,
      "height": 16.0
    },
    "manufacturer": "Shenzhen Hi-Link Electronic (HLK-LD2410C)",
    "logicVoltage": "5 V supply (VCC); UART and OUT are 3.3 V logic, safe to wire straight to an ESP32",
    "pinLabelsLeftToRight": [
      "VCC",
      "GND",
      "OUT",
      "RX",
      "TX"
    ],
    "notes": [
      "Detects people by 24 GHz radar, including someone sitting still, which a PIR misses. It streams a frame about ten times a second over UART at 256000 baud with no setup: presence, whether the target is moving or still, and its distance.",
      "Power it from 5 V (more than 200 mA of supply capacity; about 79 mA average). Its UART and OUT pins are 3.3 V, so TX goes straight to an ESP32 RX pin with no divider.",
      "Studio reads the UART: sensor TX to the board's RX pin. RX and OUT are not needed; OUT is a plain 3.3 V presence line if you want one.",
      "Range is eight 0.75 m gates, 6 m by default. The antennas are on the component face: point that face at the room and keep metal, and the LED strip's own supply wiring, out of the way in front of it.",
      "The five holes ship unpopulated; fit a 2.54 mm header or solder wires. The silkscreen prints TX, RX, OUT, GND, VCC with TX on the square pad; turned as drawn here, they read right to left."
    ],
    "presenceSensor": {
      "device": "HLK-LD2410C",
      "interface": "UART",
      "baud": 256000,
      "gateMeters": 0.75,
      "maxRangeMeters": 6
    },
    "render": {
      "file": "parts/hlk-ld2410c-presence-sensor.webp",
      "widthPx": 400,
      "heightPx": 296,
      "pxPerMm": 17.273
    },
    "revision": 1,
    "partTypes": [
      "PresenceInput"
    ],
    "categories": [
      "motion-radar"
    ],
    "verification": "reviewed",
    "sources": [
      {
        "facts": [
          "dimensionsMm",
          "pinLabelsLeftToRight",
          "logicVoltage",
          "presenceSensor"
        ],
        "ref": "https://www.manualslib.com/manual/3299997/Hi-Link-Hlk-Ld2410c.html"
      },
      {
        "facts": [
          "pinLabelsLeftToRight",
          "logicVoltage",
          "render",
          "presenceSensor"
        ],
        "ref": "https://www.espboards.dev/sensors/ld2410c/"
      },
      {
        "facts": [
          "pinLabelsLeftToRight",
          "logicVoltage",
          "presenceSensor"
        ],
        "ref": "https://github.com/ncmreynolds/ld2410"
      }
    ],
    "interfaces": [
      "uart"
    ],
    "copy": {
      "summary": "Someone there, moving or still, and how far: up to 6 m",
      "wiringNote": "Power from 5 V; its UART is 3.3 V, so its TX wires straight to the board's RX pin.",
      "optionLabel": "HLK-LD2410C mmWave"
    },
    "pads": [
      {
        "label": "VCC",
        "xPx": 115.2,
        "yPx": 264.7
      },
      {
        "label": "GND",
        "xPx": 159,
        "yPx": 264.7
      },
      {
        "label": "OUT",
        "xPx": 202.9,
        "yPx": 264.7
      },
      {
        "label": "RX",
        "xPx": 246.7,
        "yPx": 264.7
      },
      {
        "label": "TX",
        "xPx": 290.6,
        "yPx": 264.7
      }
    ],
    "padHoleRadiusPx": 7.2,
    "supplyRail": "v5"
  },
  "hub75-panel-64x64-p4": {
    "manifestVersion": 1,
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
    "render": {
      "file": "parts/hub75-panel-64x64-p4.webp",
      "widthPx": 1200,
      "heightPx": 1200,
      "pxPerMm": 4.656
    },
    "revision": 1,
    "partTypes": [
      "MatrixOutput"
    ],
    "categories": [
      "led-hub75-panels"
    ],
    "verification": "reviewed",
    "sources": [
      {
        "facts": [
          "dimensionsMm"
        ],
        "ref": "https://www.optonicaled.com/led-display-module-indoor-double-sided-p4"
      },
      {
        "facts": [
          "render"
        ],
        "ref": "https://docs.waveshare.com/LED-Matrix"
      },
      {
        "facts": [
          "render"
        ],
        "ref": "https://hackspark.fr/en/led-displays/2913-64x64-rgb-led-matrix-panel-p4-256x256mm.html"
      },
      {
        "facts": [
          "ledOutput"
        ],
        "ref": "https://www.optonicaled.com/led-display-module-indoor-double-sided-p4 (1/16 scan; 33 W module power, which is 6.6 A at 5 V over 4096 pixels, 1.62 mA each)"
      },
      {
        "facts": [
          "ledOutput"
        ],
        "ref": "https://hackspark.fr/en/led-displays/2913-64x64-rgb-led-matrix-panel-p4-256x256mm.html (1:16 scan, driven through 16-bit latches)"
      },
      {
        "facts": [
          "ledOutput"
        ],
        "ref": "UNVERIFIED: no source page lists an input voltage; 5 V is the HUB75 panel convention and the figure the app already sized HUB75 from"
      }
    ],
    "ledOutput": {
      "form": "hub75",
      "width": 64,
      "height": 64,
      "pitchMm": 4.0,
      "chipset": "HUB75",
      "supplyVolts": 5,
      "fullWhiteMa": 1.62,
      "scan": 16
    }
  },
  "hx-4s-f30a-bms-balance": {
    "manifestVersion": 1,
    "partId": "hx-4s-f30a-bms-balance",
    "label": "HX-4S-F30A 4S 30 A BMS with balancing",
    "category": "battery",
    "dimensionsMm": {
      "width": 56.0,
      "height": 48.0
    },
    "manufacturer": "generic",
    "logicVoltage": "none; power only",
    "pinLabelsLeftToRight": [
      "B-",
      "B1",
      "B2",
      "B3",
      "B+",
      "P-",
      "P+"
    ],
    "notes": [
      "30 A is recorded as the seller's continuous figure and remains an HW-14 review item. T1/T2 accept an external temperature sensor."
    ],
    "batteryModule": {
      "series": 4,
      "chemistries": [
        "li-ion"
      ],
      "protection": {
        "continuousDischargeMa": 30000,
        "continuousChargeMa": 30000,
        "overchargeV": 4.25,
        "overDischargeV": 2.55,
        "port": "common",
        "switchedLine": "negative",
        "temperatureSensor": true,
        "powerTerminals": [
          "B-",
          "B+",
          "P-",
          "P+"
        ]
      },
      "balance": {
        "type": "passive",
        "balanceMa": 60,
        "balanceTerminals": [
          "B-",
          "B1",
          "B2",
          "B3",
          "B+"
        ],
        "connectionOrder": [
          "B-",
          "B1",
          "B2",
          "B3",
          "B+"
        ]
      }
    },
    "render": {
      "file": "parts/hx-4s-f30a-bms-balance.webp",
      "widthPx": 692,
      "heightPx": 596,
      "pxPerMm": 12.0
    },
    "revision": 1,
    "partTypes": [
      "BatteryModule"
    ],
    "categories": [
      "battery-protection"
    ],
    "verification": "reviewed",
    "sources": [
      {
        "facts": [
          "pinLabelsLeftToRight",
          "render",
          "batteryModule"
        ],
        "ref": "https://www.aliexpress.com/item/1005010035028251.html"
      }
    ],
    "copy": {
      "summary": "4S li-ion · protection, passive balance"
    }
  },
  "ics-43434-i2s-microphone": {
    "manifestVersion": 1,
    "partId": "ics-43434-i2s-microphone",
    "label": "ICS-43434 I2S microphone",
    "category": "microphone",
    "dimensionsMm": {
      "width": 25.4,
      "height": 17.78
    },
    "manufacturer": "TDK InvenSense / Adafruit breakout form",
    "logicVoltage": "1.5-3.6 V; 3.3 V logic",
    "pinLabelsLeftToRight": [
      "SEL",
      "LRCL",
      "DOUT",
      "BCLK",
      "GND",
      "3V"
    ],
    "notes": [
      "Bottom-port 24-bit I2S MEMS microphone on the recognisable six-pad Adafruit-style breakout.",
      "SEL is the channel select, low by default for the left channel and tied to 3.3 V for the right; LRCL is the word-select clock the controller drives."
    ],
    "render": {
      "file": "parts/ics-43434-i2s-microphone.webp",
      "widthPx": 400,
      "heightPx": 286,
      "pxPerMm": 14.961
    },
    "revision": 1,
    "partTypes": [
      "MicInput"
    ],
    "categories": [
      "audio-microphones"
    ],
    "verification": "reviewed",
    "sources": [
      {
        "facts": [
          "notes",
          "microphone"
        ],
        "ref": "https://www.invensense.tdk.com/en-us/products/microphone/ics-43434"
      },
      {
        "facts": [
          "pinLabelsLeftToRight",
          "render",
          "label",
          "notes"
        ],
        "ref": "https://www.adafruit.com/product/6049"
      },
      {
        "facts": [
          "logicVoltage",
          "render"
        ],
        "ref": "https://ae-pic-a1.aliexpress-media.com/kf/Se306d885f56641879b1a2e02a2ec229e0.pdf"
      }
    ],
    "copy": {
      "summary": "Lower noise floor, same three wires",
      "wiringNote": "Wires exactly like an INMP441 and costs about the same; firmware applies the ICS43434 response correction instead.",
      "optionLabel": "ICS-43434",
      "optionOrder": 2
    },
    "pads": [
      {
        "label": "SEL",
        "xPx": 104.7,
        "yPx": 255.8
      },
      {
        "label": "LRCL",
        "xPx": 142.4,
        "yPx": 255.8
      },
      {
        "label": "DOUT",
        "xPx": 180.7,
        "yPx": 255.8
      },
      {
        "label": "BCLK",
        "xPx": 218.4,
        "yPx": 255.8
      },
      {
        "label": "GND",
        "xPx": 256.6,
        "yPx": 255.8
      },
      {
        "label": "3V",
        "xPx": 294.4,
        "yPx": 255.8
      }
    ],
    "padHoleRadiusPx": 6.4,
    "supplyRail": "v3v3",
    "microphone": {
      "device": "ICS-43434",
      "fastledFactory": "CreateIcs43434",
      "fastledProfile": "ICS43434"
    }
  },
  "ili9341-xc4630-parallel-touch-320x240": {
    "manifestVersion": 1,
    "partId": "ili9341-xc4630-parallel-touch-320x240",
    "label": "XC4630 2.8-inch 320x240 ILI9341 parallel TFT shield",
    "category": "display",
    "dimensionsMm": {
      "width": 77.0,
      "height": 52.0
    },
    "manufacturer": "Duinotech / Jaycar XC4630",
    "logicVoltage": "5 V supply; 3.3 V logic behind two 74LVC245A buffers",
    "pinLabelsLeftToRight": [
      "LCD_D2",
      "LCD_D3",
      "LCD_D4",
      "LCD_D5",
      "LCD_D6",
      "LCD_D7",
      "LCD_D0",
      "LCD_D1",
      "SD_SS",
      "SD_DI",
      "SD_DO",
      "SD_SCK",
      "LCD_RST",
      "LCD_CS",
      "LCD_RS",
      "LCD_WR",
      "LCD_RD",
      "GND",
      "5V",
      "3V3"
    ],
    "notes": [
      "Duinotech XC4630, silkscreened '2.8\"TFT LCD Shield'. Arduino UNO/MEGA shield form factor with an 8-bit parallel LCD bus, not SPI.",
      "Controller identity confirmed by register read on the physical board: reg(0x00D3) returned 93 41, i.e. ILI9341. This product ships with varying controllers between revisions, so the identity is per-board rather than per-model.",
      "Two 74LVC245A octal bus transceivers (U2, U3) buffer the LCD bus and an SOT-223 regulator supplies 3.3 V, so the shield accepts 5 V logic while the panel runs at 3.3 V.",
      "The resistive touch panel has no dedicated controller and no dedicated pins: it shares LCD_CS, LCD_RS, LCD_D0 and LCD_D1, which are read as analog inputs with the pin modes temporarily reversed.",
      "All four headers are rear-mounted because the LCD covers the front, so the render shows the component face and the pin labels it carries.",
      "The microSD slot is wired to the Arduino hardware SPI pins and is independent of the parallel LCD bus.",
      "The 2x10 footprint at the left edge is unpopulated and is rendered as bare plated through-holes."
    ],
    "display": {
      "controller": "ILI9341",
      "resolutionPx": [
        320,
        240
      ],
      "interface": "8-bit parallel",
      "touchController": null,
      "touchSurface": "resistive-shared"
    },
    "render": {
      "file": "parts/ili9341-xc4630-parallel-touch-320x240.webp",
      "widthPx": 944,
      "heightPx": 644,
      "pxPerMm": 12.0
    },
    "revision": 1,
    "partTypes": [
      "TransportDisplay"
    ],
    "categories": [
      "display-tft"
    ],
    "verification": "reviewed",
    "sources": [
      {
        "facts": [
          "dimensionsMm",
          "pinLabelsLeftToRight",
          "render"
        ],
        "ref": "Physical board in hand (local copy in the asset workspace)"
      },
      {
        "facts": [
          "display"
        ],
        "ref": "Register read on the physical board (local copy in the asset workspace)"
      },
      {
        "facts": [
          "dimensionsMm",
          "render",
          "display"
        ],
        "ref": "https://www.jaycar.com.au/240x320-lcd-touch-screen-for-arduino/p/XC4630"
      }
    ],
    "interfaces": [
      "parallel-8080"
    ],
    "copy": {
      "summary": "320x240 ILI9341 over an 8-bit parallel bus",
      "wiringNote": "An Arduino-shield form factor, so it is wired with jumpers rather than seated: thirteen lines for the panel, and no touch header at all. The resistive sheet has no controller and borrows four of those same lines; the two it reads (LCD_CS and LCD_RS) must sit on ADC1 - on ADC2 a press reads fine until something enables Wi-Fi. This product ships different controllers between revisions under identical silkscreen; the driver targets the ILI9341 one.",
      "optionLabel": "XC4630 2.8-inch shield + touch",
      "optionOrder": 2
    },
    "pads": [
      {
        "label": "LCD_D2",
        "xPx": 219.9,
        "yPx": 40
      },
      {
        "label": "LCD_D3",
        "xPx": 250.4,
        "yPx": 40
      },
      {
        "label": "LCD_D4",
        "xPx": 280.8,
        "yPx": 40
      },
      {
        "label": "LCD_D5",
        "xPx": 311.3,
        "yPx": 40
      },
      {
        "label": "LCD_D6",
        "xPx": 341.8,
        "yPx": 40
      },
      {
        "label": "LCD_D7",
        "xPx": 372.3,
        "yPx": 40
      },
      {
        "label": "LCD_D0",
        "xPx": 430.1,
        "yPx": 40
      },
      {
        "label": "LCD_D1",
        "xPx": 460.6,
        "yPx": 40
      },
      {
        "label": "SD_SS",
        "xPx": 491.1,
        "yPx": 40
      },
      {
        "label": "SD_DI",
        "xPx": 521.6,
        "yPx": 40
      },
      {
        "label": "SD_DO",
        "xPx": 552,
        "yPx": 40
      },
      {
        "label": "SD_SCK",
        "xPx": 582.5,
        "yPx": 40
      },
      {
        "label": "LCD_RST",
        "xPx": 182.7,
        "yPx": 590.8
      },
      {
        "label": "LCD_CS",
        "xPx": 213.2,
        "yPx": 590.8
      },
      {
        "label": "LCD_RS",
        "xPx": 243.6,
        "yPx": 590.8
      },
      {
        "label": "LCD_WR",
        "xPx": 274.1,
        "yPx": 590.8
      },
      {
        "label": "LCD_RD",
        "xPx": 304.6,
        "yPx": 590.8
      },
      {
        "label": "GND",
        "xPx": 407.1,
        "yPx": 590.8
      },
      {
        "label": "5V",
        "xPx": 468.1,
        "yPx": 590.8
      },
      {
        "label": "3V3",
        "xPx": 498.5,
        "yPx": 590.8
      }
    ],
    "padHoleRadiusPx": 3,
    "supplyRail": "v5",
    "tftPanel": {
      "colorOrder": "BGR",
      "mirroredColumns": true,
      "invert": false,
      "columnOffset": 0,
      "rowOffset": 0
    }
  },
  "ili9341-xpt2046-touch-320x240": {
    "manifestVersion": 1,
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
      "touchController": "XPT2046",
      "touchSurface": null,
      "screensPx": [
        [
          152.8,
          30.4,
          686.4,
          513.6
        ]
      ]
    },
    "render": {
      "file": "parts/ili9341-xpt2046-touch-320x240.webp",
      "widthPx": 968,
      "heightPx": 608,
      "pxPerMm": 12.0
    },
    "revision": 1,
    "partTypes": [
      "TransportDisplay"
    ],
    "categories": [
      "display-tft"
    ],
    "verification": "reviewed",
    "sources": [
      {
        "facts": [
          "pinLabelsLeftToRight"
        ],
        "ref": "https://wiki.dfrobot.com/dfr0665/"
      }
    ],
    "interfaces": [
      "spi"
    ],
    "copy": {
      "summary": "320x240 colour TFT with XPT2046 touch",
      "wiringNote": "The DFRobot DFR0665 breakout: an ILI9341 panel, an XPT2046 touch controller and a microSD slot, sharing SCLK, MOSI and MISO with a chip select each. The controller scans in portrait, so a 320x240 screen needs the Landscape view. Adding it gives you the panel and its Touch Screen node.",
      "optionLabel": "ILI9341 2.8-inch + touch",
      "optionOrder": 4
    },
    "pads": [
      {
        "label": "VCC",
        "xPx": 316.6,
        "yPx": 586.7
      },
      {
        "label": "GND",
        "xPx": 346.2,
        "yPx": 586.7
      },
      {
        "label": "SCLK",
        "xPx": 376.8,
        "yPx": 586.7
      },
      {
        "label": "MOSI",
        "xPx": 407.6,
        "yPx": 586.7
      },
      {
        "label": "MISO",
        "xPx": 438,
        "yPx": 586.7
      },
      {
        "label": "CS",
        "xPx": 468.3,
        "yPx": 586.7
      },
      {
        "label": "RES",
        "xPx": 498.7,
        "yPx": 586.7
      },
      {
        "label": "DC",
        "xPx": 529.1,
        "yPx": 586.7
      },
      {
        "label": "BL",
        "xPx": 560,
        "yPx": 586.7
      },
      {
        "label": "TOUCH_CS",
        "xPx": 590.4,
        "yPx": 586.7
      },
      {
        "label": "INT",
        "xPx": 621.1,
        "yPx": 586.7
      },
      {
        "label": "SDCS",
        "xPx": 651.2,
        "yPx": 586.7
      }
    ],
    "padHoleRadiusPx": 6,
    "supplyRail": "v3v3",
    "tftPanel": {
      "colorOrder": "BGR",
      "mirroredColumns": true,
      "invert": false,
      "columnOffset": 0,
      "rowOffset": 0
    }
  },
  "ina226-current-sensor-module": {
    "manifestVersion": 1,
    "partId": "ina226-current-sensor-module",
    "label": "INA226 current and voltage monitor module",
    "category": "power-monitor",
    "dimensionsMm": {
      "width": 26.0,
      "height": 22.0
    },
    "manufacturer": "Generic INA226 breakout (blue 26 x 22 mm form) / Texas Instruments INA226",
    "logicVoltage": "2.7-5.5 V supply (VCC); bus voltage 0-36 V on the sense terminal",
    "pinLabelsLeftToRight": [
      "VCC",
      "GND",
      "SCL",
      "SDA",
      "ALE",
      "VBS"
    ],
    "notes": [
      "Measures bus voltage to 36 V and, from a 2 milliohm shunt, current up to about 20 A (the listing quotes 0-36 V and -20 to +20 A), over I2C. It is the larger sibling of the INA219 already in the app.",
      "High-side sensing: the supply's positive lead goes to IN+ and the load's positive lead to IN-. The load and the module share ground; the INA226 reads bus voltage against GND.",
      "VBS is the bus-voltage sense input; it is normally tied to IN- or left to the onboard link, depending on the module. Check the board's own link before changing it.",
      "VCC powers the chip at 2.7-5.5 V and sets the I2C level; a 3.3 V controller powers it from 3.3 V.",
      "ALE is an open-drain alert output (over-current, under-voltage or conversion ready) and needs a pull-up when used.",
      "Default I2C address 0x40; the A0 and A1 pads select sixteen addresses in all.",
      "The header is shown unpopulated; the screw terminal is shown fitted, as the listing ships it. The header order and shunt placement are approximated from product photographs."
    ],
    "powerMonitor": {
      "device": "INA226",
      "interface": "I2C",
      "i2cAddresses": [
        64,
        65,
        66,
        67,
        68,
        69,
        70,
        71,
        72,
        73,
        74,
        75,
        76,
        77,
        78,
        79
      ],
      "defaultI2cAddress": 64,
      "shuntOhms": 0.002,
      "busVoltageMaxV": 36,
      "currentMaxA": 20,
      "senseSide": "high-side"
    },
    "render": {
      "file": "parts/ina226-current-sensor-module.webp",
      "widthPx": 400,
      "heightPx": 342,
      "pxPerMm": 14.615,
      "indicators": [
        {
          "rectPx": [
            74.6,
            203.7,
            11.1,
            22.2
          ],
          "color": [
            255,
            15,
            8
          ],
          "drive": "power"
        }
      ]
    },
    "revision": 1,
    "partTypes": [
      "PowerMonitorInput"
    ],
    "categories": [
      "power-monitoring"
    ],
    "verification": "reviewed",
    "sources": [
      {
        "facts": [
          "dimensionsMm",
          "pinLabelsLeftToRight",
          "logicVoltage",
          "powerMonitor"
        ],
        "ref": "https://www.tinytronics.nl/en/sensors/current-voltage/ina226-i2c-dc-current-and-voltage-meter-20a-module"
      },
      {
        "facts": [
          "pinLabelsLeftToRight",
          "logicVoltage"
        ],
        "ref": "https://how2electronics.com/how-to-use-ina226-dc-current-sensor-with-arduino/"
      },
      {
        "facts": [
          "logicVoltage",
          "powerMonitor"
        ],
        "ref": "https://www.ti.com/lit/ds/symlink/ina226.pdf"
      }
    ],
    "interfaces": [
      "i2c"
    ],
    "copy": {
      "summary": "Volts, amps, watts: 36 V, 20 A, I2C",
      "wiringNote": "High-side: the supply goes to IN+ and the load to IN-, sharing ground with the board. Power VCC from 3.3 V. Sixteen addresses, 0x40 to 0x4F, from the A0 and A1 pads. ALE is not needed.",
      "optionLabel": "INA226 module"
    },
    "pads": [
      {
        "label": "VCC",
        "xPx": 106.7,
        "yPx": 294.1
      },
      {
        "label": "GND",
        "xPx": 143.9,
        "yPx": 294.1
      },
      {
        "label": "SCL",
        "xPx": 181,
        "yPx": 294.1
      },
      {
        "label": "SDA",
        "xPx": 218,
        "yPx": 294.1
      },
      {
        "label": "ALE",
        "xPx": 255.1,
        "yPx": 294.1
      },
      {
        "label": "VBS",
        "xPx": 292.3,
        "yPx": 294.1
      }
    ],
    "padHoleRadiusPx": 7,
    "supplyRail": "v3v3"
  },
  "inmp441-i2s-microphone": {
    "manifestVersion": 1,
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
    },
    "revision": 1,
    "partTypes": [
      "MicInput"
    ],
    "categories": [
      "audio-microphones"
    ],
    "verification": "bench",
    "sources": [
      {
        "facts": [
          "logicVoltage",
          "microphone"
        ],
        "ref": "https://product.tdk.com/system/files/dam/doc/product/sw_piezo/mic/mems-mic/data_sheet/inmp441.pdf"
      },
      {
        "facts": [
          "pinLabelsLeftToRight",
          "render"
        ],
        "ref": "https://shillehtek.com/blogs/shillehtek-product-manuals/inmp441-i2s-omnidirectional-microphone-module-with-soldering-manual"
      }
    ],
    "copy": {
      "summary": "The common three-wire I2S MEMS module",
      "optionLabel": "INMP441",
      "optionOrder": 1
    },
    "pads": [
      {
        "label": "L/R",
        "xPx": 34,
        "yPx": 244.8
      },
      {
        "label": "GND",
        "xPx": 100.4,
        "yPx": 244.8
      },
      {
        "label": "WS",
        "xPx": 166.8,
        "yPx": 244.8
      },
      {
        "label": "SCK",
        "xPx": 233.2,
        "yPx": 244.8
      },
      {
        "label": "SD",
        "xPx": 299.6,
        "yPx": 244.8
      },
      {
        "label": "VDD",
        "xPx": 366,
        "yPx": 244.8
      }
    ],
    "padHoleRadiusPx": 13,
    "supplyRail": "v3v3",
    "microphone": {
      "device": "INMP441",
      "fastledFactory": "CreateInmp441",
      "fastledProfile": "INMP441"
    }
  },
  "ip2368-100w-bidirectional-charger": {
    "manifestVersion": 1,
    "partId": "ip2368-100w-bidirectional-charger",
    "label": "IP2368 100 W bidirectional 4S charger",
    "category": "battery",
    "dimensionsMm": {
      "width": 80.0,
      "height": 40.0
    },
    "manufacturer": "generic (Injoinic IP2368-COUT)",
    "logicVoltage": "none; power only",
    "pinLabelsLeftToRight": [
      "BAT+",
      "BAT-",
      "USB-C"
    ],
    "notes": [
      "Modelled as the listing's 4S Li-ion, 4.2 V/cell, 100 W resistor configuration. USB-C can also discharge the pack; the LED load does not use that path."
    ],
    "batteryModule": {
      "series": 4,
      "chemistries": [
        "li-ion"
      ],
      "charger": {
        "device": "IP2368-COUT",
        "chargeVPerCell": 4.2,
        "maxChargeMa": 5950,
        "inputMaxW": 100,
        "inputProtocols": "USB-C PD 2.0/3.0, AFC and FCP",
        "bidirectional": true,
        "batteryTerminals": [
          "BAT+",
          "BAT-"
        ]
      }
    },
    "render": {
      "file": "parts/ip2368-100w-bidirectional-charger.webp",
      "widthPx": 980,
      "heightPx": 500,
      "pxPerMm": 12.0
    },
    "revision": 1,
    "partTypes": [
      "BatteryModule"
    ],
    "categories": [
      "battery-chargers"
    ],
    "verification": "reviewed",
    "sources": [
      {
        "facts": [
          "pinLabelsLeftToRight",
          "render",
          "batteryModule"
        ],
        "ref": "https://www.aliexpress.com/item/1005009107167897.html"
      }
    ],
    "copy": {
      "summary": "4S li-ion · charger"
    }
  },
  "ip5305t-1s-power-module": {
    "manifestVersion": 1,
    "partId": "ip5305t-1s-power-module",
    "label": "IP5305T 1S boost, charge and protection module",
    "category": "battery",
    "dimensionsMm": {
      "width": 38.1,
      "height": 15.2
    },
    "manufacturer": "generic (Injoinic IP5305T)",
    "logicVoltage": "none; power only",
    "pinLabelsLeftToRight": [
      "+BAT",
      "-BAT",
      "5V+",
      "5V-"
    ],
    "notes": [
      "Four LEDs show approximate state of charge. USB-C is charge input; the green screw terminal is the 5 V output."
    ],
    "batteryModule": {
      "series": 1,
      "chemistries": [
        "li-ion"
      ],
      "protection": {
        "continuousDischargeMa": 1000,
        "continuousChargeMa": 1200,
        "overchargeV": 4.3,
        "overDischargeV": 2.4,
        "port": "common",
        "switchedLine": "negative",
        "temperatureSensor": false,
        "powerTerminals": [
          "+BAT",
          "-BAT",
          "5V+",
          "5V-"
        ]
      },
      "charger": {
        "device": "IP5305T",
        "chargeVPerCell": 4.2,
        "maxChargeMa": 1200,
        "inputMaxW": 6,
        "inputProtocols": "USB-C 5 V",
        "bidirectional": false,
        "batteryTerminals": [
          "+BAT",
          "-BAT"
        ]
      },
      "output": {
        "topology": "boost",
        "outputV": 5,
        "continuousMa": 1000,
        "typicalEfficiency": 0.82,
        "terminals": [
          "5V+",
          "5V-"
        ],
        "usbOutput": false
      }
    },
    "render": {
      "file": "parts/ip5305t-1s-power-module.webp",
      "widthPx": 478,
      "heightPx": 203,
      "pxPerMm": 12.021
    },
    "revision": 1,
    "partTypes": [
      "BatteryModule"
    ],
    "categories": [
      "battery-chargers"
    ],
    "verification": "reviewed",
    "sources": [
      {
        "facts": [
          "pinLabelsLeftToRight",
          "render",
          "batteryModule"
        ],
        "ref": "https://www.aliexpress.com/item/1005012069464300.html"
      },
      {
        "facts": [
          "batteryModule"
        ],
        "ref": "https://ae-pic-a1.aliexpress-media.com/kf/S8861610f552d4edb9706ada884fec3892.pdf"
      }
    ],
    "copy": {
      "summary": "1S li-ion · protection, charger, 5 V output"
    }
  },
  "jaycar-sr1230-rotary-encoder": {
    "manifestVersion": 1,
    "partId": "jaycar-sr1230-rotary-encoder",
    "label": "Jaycar SR1230 rotary encoder with push switch",
    "category": "input-control",
    "dimensionsMm": {
      "width": 14.0,
      "height": 14.9
    },
    "manufacturer": "Jaycar Electronics (SR1230)",
    "logicVoltage": "No supply pin. A, B and SW are switch contacts to ground, read through the controller's internal pull-ups; contacts rated 5 V, 10 mA",
    "pinLabelsLeftToRight": [
      "A",
      "GND1",
      "B",
      "SW",
      "GND2"
    ],
    "notes": [
      "A bare encoder, not a module: there are no pull-up resistors and no supply pin. The firmware always turns on the controller's internal pull-ups for A, B and SW.",
      "C is the common for A and B, and the push switch has two legs of its own. Wire C and one switch leg (GND1 and GND2 here) each to ground; nothing inside the part joins them.",
      "15 pulses and 30 detents per turn, so each click is half a quadrature cycle: two transitions, not the four a KY-040 module makes. The app counts the SR1230 in the same per-click units as the module.",
      "Pin order is the datasheet's shaft-end view: A, C, B left to right on the bottom row, 2.5 mm apart. The switch legs are on the far row, 5 mm apart, and sit just inside the body's top edge, so they cannot be seen from above.",
      "The part has no markings on the face rendered here, so the pad names are functional rather than printed.",
      "The two snap legs fit 2.1 mm slots 13.4 mm apart. The hex nut and washer are the supplied hardware, shown fitted."
    ],
    "encoder": {
      "device": "SR1230",
      "pulsesPerRevolution": 15,
      "detents": 30,
      "switchActive": "low",
      "onboardPullUps": false
    },
    "render": {
      "file": "parts/jaycar-sr1230-rotary-encoder.webp",
      "widthPx": 400,
      "heightPx": 424,
      "pxPerMm": 26.571
    },
    "revision": 1,
    "partTypes": [
      "EncoderInput"
    ],
    "categories": [
      "knobs-joysticks"
    ],
    "verification": "reviewed",
    "sources": [
      {
        "facts": [
          "dimensionsMm",
          "logicVoltage",
          "encoder"
        ],
        "ref": "Jaycar SR1230 datasheet (local copy in the asset workspace)"
      },
      {
        "facts": [
          "dimensionsMm",
          "render",
          "encoder"
        ],
        "ref": "Jaycar SR1230 product photograph (local copy in the asset workspace)"
      }
    ],
    "copy": {
      "summary": "Bare 12 mm encoder with a push switch",
      "wiringNote": "No supply pin. Wire C and one switch leg each to ground; A, B and SW go to GPIOs, which always use the internal pull-up. Each click is two transitions rather than four, which the firmware counts as one click like the module.",
      "optionLabel": "Jaycar SR1230 bare encoder"
    },
    "pads": [
      {
        "label": "A",
        "xPx": 133.6,
        "yPx": 406
      },
      {
        "label": "GND1",
        "xPx": 200,
        "yPx": 406
      },
      {
        "label": "B",
        "xPx": 266.4,
        "yPx": 406
      },
      {
        "label": "SW",
        "xPx": 133.6,
        "yPx": 20.7
      },
      {
        "label": "GND2",
        "xPx": 266.4,
        "yPx": 20.7
      }
    ],
    "padHoleRadiusPx": 9,
    "supplyRail": "none"
  },
  "jaycar-xc9044-rtc-module": {
    "manifestVersion": 1,
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
    },
    "revision": 1,
    "partTypes": [
      "RtcModule"
    ],
    "categories": [
      "clocks"
    ],
    "verification": "bench",
    "sources": [
      {
        "facts": [
          "dimensionsMm",
          "pinLabelsLeftToRight",
          "label"
        ],
        "ref": "https://www.jaycar.com.au/rtc-clock-module-for-raspberry-pi/p/XC9044"
      },
      {
        "facts": [
          "pinLabelsLeftToRight",
          "notes"
        ],
        "ref": "https://www.kogan.com/au/buy/latestbuy-jaycar-raspberry-pi-rtc-clock-module-199150/"
      },
      {
        "facts": [
          "pinLabelsLeftToRight"
        ],
        "ref": "https://thepihut.com/products/mini-rtc-module-for-raspberry-pi"
      },
      {
        "facts": [
          "dimensionsMm",
          "notes",
          "rtc"
        ],
        "ref": "https://www.analog.com/media/en/technical-documentation/data-sheets/DS3231.pdf"
      }
    ],
    "copy": {
      "summary": "Pi-header DS3231, CR927 backup"
    },
    "pads": [
      {
        "label": "3V3",
        "xPx": 67.5,
        "yPx": 349.2
      },
      {
        "label": "SDA",
        "xPx": 133.5,
        "yPx": 349.1
      },
      {
        "label": "SCL",
        "xPx": 199.5,
        "yPx": 349.2
      },
      {
        "label": "SQW",
        "xPx": 265.5,
        "yPx": 349.1
      },
      {
        "label": "GND",
        "xPx": 331.6,
        "yPx": 349.2
      }
    ],
    "padHoleRadiusPx": 12.3,
    "supplyRail": "v3v3",
    "rtc": {
      "device": "DS3231",
      "i2cAddress": 104
    }
  },
  "keyestudio-ks0026-ir-receiver-module": {
    "manifestVersion": 1,
    "partId": "keyestudio-ks0026-ir-receiver-module",
    "label": "Keyestudio KS0026 digital IR receiver module",
    "category": "input-control",
    "dimensionsMm": {
      "width": 20.0,
      "height": 30.0
    },
    "manufacturer": "Keyestudio",
    "logicVoltage": "5 V supply; use a signal divider for a 3.3 V controller input",
    "pinLabelsLeftToRight": [
      "-",
      "+",
      "S"
    ],
    "notes": [
      "38 kHz demodulating digital IR receiver with activity LED.",
      "Header order from the official connection diagram: minus (GND), plus (5 V), S (signal), viewed with the connection header at the bottom.",
      "Keyestudio specifies 5 V operation; 3.3 V operation and the output-high voltage have not been verified. The Build Diagram conservatively divides the signal for the controller input.",
      "30 x 20 mm module outline from Keyestudio KS0349 Project 33; component placement follows the KS0026 product photo. External header shown unpopulated."
    ],
    "render": {
      "file": "parts/keyestudio-ks0026-ir-receiver-module.webp",
      "widthPx": 400,
      "heightPx": 596,
      "pxPerMm": 19.6,
      "indicators": [
        {
          "rectPx": [
            130.8,
            258.6,
            20.8,
            12.2
          ],
          "color": [
            255,
            14,
            10
          ],
          "drive": "signal"
        }
      ]
    },
    "revision": 1,
    "partTypes": [
      "IRRemoteInput"
    ],
    "categories": [
      "remote-receivers"
    ],
    "verification": "reviewed",
    "sources": [
      {
        "facts": [
          "logicVoltage",
          "pinLabelsLeftToRight",
          "render"
        ],
        "ref": "https://docs.keyestudio.com/projects/KS0026/en/latest/docs/KS0026.html"
      },
      {
        "facts": [
          "dimensionsMm"
        ],
        "ref": "https://docs.keyestudio.com/projects/KS0349/en/latest/KS0349.html"
      },
      {
        "facts": [
          "label",
          "manufacturer"
        ],
        "ref": "https://www.keyestudio.com/products/free-shipping-keyestudio-digital-ir-infrared-receiver-module-for-arduino-uno-r3-mega-2560-r3"
      }
    ],
    "copy": {
      "summary": "38 kHz IR receiver module with activity LED, 5 V",
      "wiringNote": "Connect − to GND, + to 5 V and S to the input through the Build Diagram’s signal divider. Keyestudio specifies a 5 V supply; 3.3 V operation is not verified.",
      "optionLabel": "Keyestudio KS0026",
      "optionOrder": 2
    },
    "pads": [
      {
        "label": "-",
        "xPx": 150.2,
        "yPx": 539.1
      },
      {
        "label": "+",
        "xPx": 200,
        "yPx": 539.1
      },
      {
        "label": "S",
        "xPx": 249.8,
        "yPx": 539.1
      }
    ],
    "padHoleRadiusPx": 6.1,
    "supplyRail": "v5",
    "irReceiver": {
      "supplyVolts": 5,
      "carrierKHz": 38
    }
  },
  "ky-006-passive-buzzer-module": {
    "manifestVersion": 1,
    "partId": "ky-006-passive-buzzer-module",
    "label": "KY-006 passive buzzer module",
    "category": "support",
    "dimensionsMm": {
      "width": 15.0,
      "height": 18.5
    },
    "manufacturer": "Keyes / Joy-IT KY-006 and compatible modules",
    "logicVoltage": "3.3-5 V; one GPIO drives the transducer with a square wave, up to about 25 mA",
    "pinLabelsLeftToRight": [
      "S",
      "NC",
      "-"
    ],
    "notes": [
      "A passive buzzer has no oscillator: it sounds only while the controller drives its S pin with a square wave, and the pitch is the wave's frequency. A steady level, high or low, is silent.",
      "Joy-IT specifies tones from 1.5 to 2.5 kHz, and it is loudest near 2 kHz. Lower and higher tones sound too, more quietly; Joy-IT's own examples play 250 to 500 Hz.",
      "The buzzer sits between S and - with no transistor or resistor, so the GPIO drives it directly; listings give 25 mA or less at 3.3-5 V. Some clones fit a coil transducer instead of a piezo one: if the buzzer reads a few tens of ohms on a meter rather than open, drive it through a transistor.",
      "The middle pin is not connected on most boards. Joy-IT labels it +V; the module sounds without it, so it is left unwired.",
      "The header ships soldered on some kits and loose on others, so the holes are shown unpopulated. An active buzzer such as the KY-012 looks alike but sounds at its own fixed pitch."
    ],
    "buzzer": {
      "type": "passive",
      "activeLevel": "high",
      "resonanceKHz": 2.0,
      "soundLevel": "",
      "maxCurrentMa": 25
    },
    "render": {
      "file": "parts/ky-006-passive-buzzer-module.webp",
      "widthPx": 400,
      "heightPx": 489,
      "pxPerMm": 25.333
    },
    "revision": 1,
    "partTypes": [
      "BuzzerOutput"
    ],
    "categories": [
      "audio-buzzers"
    ],
    "verification": "reviewed",
    "sources": [
      {
        "facts": [
          "dimensionsMm",
          "pinLabelsLeftToRight",
          "logicVoltage",
          "render",
          "label",
          "buzzer"
        ],
        "ref": "https://sensorkit.joy-it.net/en/sensors/ky-006"
      },
      {
        "facts": [
          "dimensionsMm",
          "pinLabelsLeftToRight",
          "buzzer"
        ],
        "ref": "https://www.electrokit.com/upload/product/41015/41015714/Passive_Piezo_Buzzer.pdf"
      },
      {
        "facts": [
          "pinLabelsLeftToRight"
        ],
        "ref": "https://arduinomodules.info/ky-006-passive-buzzer-module/"
      },
      {
        "facts": [
          "dimensionsMm",
          "buzzer"
        ],
        "ref": "https://docs.cirkitdesigner.com/component/7f4e8101-f6ea-4a9f-abea-db3207b54942/buzzer-passive"
      }
    ],
    "copy": {
      "summary": "Plays a tone at the pitch you set",
      "wiringNote": "Wire S to the GPIO and - to ground; leave the middle pin unconnected (Joy-IT labels it +V, but the buzzer sounds without it). The controller plays a square wave at Pitch while Sound is true, and the pin rests low otherwise. It is loudest near 2 kHz. It draws 25 mA or less straight from the pin; if your buzzer reads a few tens of ohms on a meter rather than open, it is a coil type and needs a transistor. One passive buzzer per board: the tone generator drives one pin at a time.",
      "optionLabel": "KY-006 passive buzzer",
      "optionOrder": 2
    },
    "pads": [
      {
        "label": "S",
        "xPx": 135.2,
        "yPx": 437.8
      },
      {
        "label": "NC",
        "xPx": 199.5,
        "yPx": 437.8
      },
      {
        "label": "-",
        "xPx": 263.8,
        "yPx": 437.8
      }
    ],
    "padHoleRadiusPx": 11.9,
    "supplyRail": "none"
  },
  "ky-012-active-buzzer-module": {
    "manifestVersion": 1,
    "partId": "ky-012-active-buzzer-module",
    "label": "KY-012 active buzzer module",
    "category": "support",
    "dimensionsMm": {
      "width": 15.5,
      "height": 19.0
    },
    "manufacturer": "Keyes / Joy-IT KY-012 and compatible modules",
    "logicVoltage": "3.5-5.5 V; one GPIO drives it, about 30 mA at 5 V",
    "pinLabelsLeftToRight": [
      "GND",
      "NC",
      "SIG"
    ],
    "notes": [
      "An active buzzer has its own oscillator: drive the signal pin high and it sounds at a fixed tone (about 2.5 kHz), low and it stops. The pitch cannot be changed from the controller.",
      "The middle pin is not connected on this module. The outer pins are ground and signal.",
      "It takes 3.5-5.5 V and about 30 mA at 5 V; a 3.3 V GPIO can drive it but the level is quieter. A passive buzzer, which needs a tone from the controller, looks alike but behaves differently.",
      "The real board lists 19 x 15.5 x 11 mm; it is drawn rotated so the header runs along the bottom. The header ships soldered on some kits and loose on others, so the holes are shown unpopulated."
    ],
    "buzzer": {
      "type": "active",
      "activeLevel": "high",
      "resonanceKHz": 2.5,
      "soundLevel": "85 dB at 10 cm",
      "maxCurrentMa": 30
    },
    "render": {
      "file": "parts/ky-012-active-buzzer-module.webp",
      "widthPx": 400,
      "heightPx": 486,
      "pxPerMm": 24.516
    },
    "revision": 1,
    "partTypes": [
      "BuzzerOutput"
    ],
    "categories": [
      "audio-buzzers"
    ],
    "verification": "reviewed",
    "sources": [
      {
        "facts": [
          "pinLabelsLeftToRight",
          "logicVoltage",
          "label",
          "buzzer"
        ],
        "ref": "https://joy-it.net/en/products/COM-KY012APB"
      },
      {
        "facts": [
          "dimensionsMm",
          "pinLabelsLeftToRight",
          "logicVoltage"
        ],
        "ref": "https://www.espboards.dev/sensors/ky-012/"
      }
    ],
    "copy": {
      "summary": "Beeps at a fixed pitch while its pin is high",
      "wiringNote": "Wire SIG to the GPIO and GND to ground; leave the middle pin unconnected. It sounds at its own fixed pitch (about 2.5 kHz) while SIG is high and the pitch cannot be changed. It draws about 30 mA, more than a GPIO should supply for long or frequent sounds; switch it through a transistor for those. At 3.3 V it is quieter than at 5 V.",
      "optionLabel": "KY-012 active buzzer",
      "optionOrder": 1
    },
    "pads": [
      {
        "label": "GND",
        "xPx": 137.2,
        "yPx": 413.1
      },
      {
        "label": "NC",
        "xPx": 199.5,
        "yPx": 413.1
      },
      {
        "label": "SIG",
        "xPx": 261.8,
        "yPx": 413.1
      }
    ],
    "padHoleRadiusPx": 11.5,
    "supplyRail": "none"
  },
  "ky-022-ir-receiver-module": {
    "manifestVersion": 1,
    "partId": "ky-022-ir-receiver-module",
    "label": "KY-022 infrared receiver module",
    "category": "input-control",
    "dimensionsMm": {
      "width": 22.06,
      "height": 17.13
    },
    "manufacturer": "Keyes (KY-022 / HW-490 form)",
    "logicVoltage": "3.3-5 V supply; demodulated output follows the supply rail",
    "pinLabelsLeftToRight": [
      "-",
      "+",
      "S"
    ],
    "notes": [
      "The board carries a VS1838B receiver, a current-limiting resistor and an indicator LED that blinks while a carrier is being received.",
      "Pin order here is the Keyes layout: minus for ground on the left, the supply in the centre, and S for the demodulated signal on the right.",
      "The centre pin is the supply on every documented variant, but the outer two are not standardised - some clones swap minus and S. Read the silkscreen on the board in hand before wiring it, because a swap puts the supply rail on a GPIO.",
      "This part id names the module design, not the board that arrives in the post. A clone with a mirrored header is the same design wired differently and needs its own check.",
      "Not pin-compatible with a bare TSOP38238, whose centre pin is ground rather than the supply."
    ],
    "render": {
      "file": "parts/ky-022-ir-receiver-module.webp",
      "widthPx": 400,
      "heightPx": 315,
      "pxPerMm": 17.226,
      "indicators": [
        {
          "rectPx": [
            56.0,
            94.1,
            26.2,
            13.1
          ],
          "color": [
            255,
            14,
            10
          ],
          "drive": "signal"
        }
      ]
    },
    "revision": 1,
    "partTypes": [
      "IRRemoteInput"
    ],
    "categories": [
      "remote-receivers"
    ],
    "verification": "reviewed",
    "sources": [
      {
        "facts": [
          "dimensionsMm"
        ],
        "ref": "https://www.pcbway.com/project/shareproject/KY_022_Infrared_Receiver_Module_0a5fd814.html"
      },
      {
        "facts": [
          "pinLabelsLeftToRight",
          "logicVoltage"
        ],
        "ref": "https://www.espboards.dev/sensors/ky-022/"
      },
      {
        "facts": [
          "pinLabelsLeftToRight",
          "logicVoltage"
        ],
        "ref": "https://arduinomodules.info/ky-022-infrared-receiver-module/"
      }
    ],
    "copy": {
      "summary": "IR remote receiver, 3-pin board with LED",
      "wiringNote": "Some clones swap the outer two pins. Check the silkscreen on your board before wiring it — a swap puts the supply rail on a GPIO.",
      "optionLabel": "KY-022 module",
      "optionOrder": 1
    },
    "pads": [
      {
        "label": "-",
        "xPx": 155.6,
        "yPx": 267.5
      },
      {
        "label": "+",
        "xPx": 199.5,
        "yPx": 267.5
      },
      {
        "label": "S",
        "xPx": 243.4,
        "yPx": 267.5
      }
    ],
    "padHoleRadiusPx": 4,
    "supplyRail": "v3v3",
    "irReceiver": {
      "supplyVolts": 3.3,
      "carrierKHz": 38
    }
  },
  "ky-023-joystick-module": {
    "manifestVersion": 1,
    "partId": "ky-023-joystick-module",
    "label": "KY-023 analog joystick module",
    "category": "input-control",
    "dimensionsMm": {
      "width": 26.0,
      "height": 34.0
    },
    "manufacturer": "Joy-IT KY-023 and compatible modules",
    "logicVoltage": "Supply from 3.3 V so both analog outputs stay inside a 3.3 V ADC range; SW pulls to ground when pressed",
    "pinLabelsLeftToRight": [
      "GND",
      "+5V",
      "VRx",
      "VRy",
      "SW"
    ],
    "notes": [
      "Two 10 kohm potentiometers give the X and Y axes as analog voltages, centred at about half the supply. A push on the stick closes the SW switch to ground.",
      "The module is marked +5V, but it is two potentiometers and a switch. Power it from 3.3 V for an ESP controller so the axis voltages never exceed the ADC's 3.3 V range.",
      "VRx and VRy need ADC-capable pins. On a classic ESP32 use ADC1 pins (GPIO 32 to 39), because ADC2 stops working while Wi-Fi is on. SW needs a pin with a pull-up; the controller's internal pull-up is enough.",
      "The 34 x 26 mm board size follows Joy-IT; other suppliers quote 40 x 26 mm. The stick and cap sizes are approximate.",
      "The five-pin row ships loose and is rendered as unpopulated plated holes."
    ],
    "joystick": {
      "device": "KY-023",
      "interface": "2 analog axes and 1 switch",
      "axisPotOhms": 10000,
      "switchActive": "low"
    },
    "render": {
      "file": "parts/ky-023-joystick-module.webp",
      "widthPx": 400,
      "heightPx": 517,
      "pxPerMm": 14.615
    },
    "revision": 1,
    "partTypes": [
      "JoystickInput"
    ],
    "categories": [
      "knobs-joysticks"
    ],
    "verification": "reviewed",
    "sources": [
      {
        "facts": [
          "dimensionsMm",
          "label"
        ],
        "ref": "https://www.joy-it.net/en/products/COM-KY023JM"
      },
      {
        "facts": [
          "dimensionsMm",
          "pinLabelsLeftToRight",
          "logicVoltage"
        ],
        "ref": "https://components101.com/modules/joystick-module"
      }
    ],
    "interfaces": [
      "analog",
      "gpio"
    ],
    "copy": {
      "summary": "A thumb stick with two analog axes and a push switch",
      "wiringNote": "Power it from 3.3 V so the axis voltages stay inside the ADC range. VRx and VRy go to ADC pins, SW to a pin with a pull-up.",
      "optionLabel": "KY-023 joystick"
    },
    "pads": [
      {
        "label": "GND",
        "xPx": 125.8,
        "yPx": 471.8
      },
      {
        "label": "+5V",
        "xPx": 162.9,
        "yPx": 471.8
      },
      {
        "label": "VRx",
        "xPx": 200,
        "yPx": 471.8
      },
      {
        "label": "VRy",
        "xPx": 237.1,
        "yPx": 471.8
      },
      {
        "label": "SW",
        "xPx": 274.2,
        "yPx": 471.8
      }
    ],
    "padHoleRadiusPx": 7.3,
    "supplyRail": "v3v3"
  },
  "lm2596-buck-module": {
    "manifestVersion": 1,
    "partId": "lm2596-buck-module",
    "label": "LM2596 adjustable buck converter module",
    "category": "power-conversion",
    "dimensionsMm": {
      "width": 43.18,
      "height": 21.08
    },
    "manufacturer": "generic (Texas Instruments LM2596S-ADJ regulator)",
    "logicVoltage": "none; power only",
    "pinLabelsLeftToRight": [
      "IN+",
      "IN-",
      "OUT+",
      "OUT-"
    ],
    "notes": [
      "Set the output to 5.0 V with a meter before connecting the controller: every module ships at an arbitrary setting, and a full turn of the trimpot moves it by volts.",
      "The input must be at least 1.5 V above the output: 6.5 V or more for a 5 V output. Keep the input at or below 35 V; the board's output capacitor is rated 35 V and the regulator 40 V.",
      "2 A continuous on the bare board; 3 A needs a heatsink on the regulator.",
      "Non-isolated: IN- and OUT- are the same net. It joins the controller's ground and the common LED ground.",
      "External connections are drilled wire pads, not terminals. Solder the leads, or fit a screw terminal where the pads allow."
    ],
    "powerConverter": {
      "role": "controller",
      "topology": "buck (non-isolated, common negative)",
      "inputMinV": 4.5,
      "inputMaxV": 35,
      "minHeadroomV": 1.5,
      "outputSetV": 5.0,
      "continuousCurrentMa": 2000,
      "peakCurrentMa": 3000,
      "typicalEfficiency": 0.8,
      "isolated": false,
      "adjustable": true,
      "outputCurrentLimit": "fixed",
      "terminals": [
        "IN+",
        "IN-",
        "OUT+",
        "OUT-"
      ]
    },
    "render": {
      "file": "parts/lm2596-buck-module.webp",
      "widthPx": 539,
      "heightPx": 273,
      "pxPerMm": 12.019
    },
    "revision": 1,
    "partTypes": [
      "PowerConverter"
    ],
    "categories": [
      "power-buck"
    ],
    "verification": "reviewed",
    "sources": [
      {
        "facts": [
          "dimensionsMm",
          "pinLabelsLeftToRight",
          "logicVoltage"
        ],
        "ref": "https://www.handsontec.com/dataspecs/LM2596S-DC-DC.pdf"
      },
      {
        "facts": [
          "logicVoltage",
          "powerConverter"
        ],
        "ref": "http://product.ic114.com/PDF/M/MBC2596-01_LM2596_R1.0.pdf"
      },
      {
        "facts": [
          "dimensionsMm",
          "logicVoltage",
          "powerConverter"
        ],
        "ref": "https://www.ti.com/lit/ds/symlink/lm2596.pdf"
      },
      {
        "facts": [
          "dimensionsMm",
          "logicVoltage",
          "render"
        ],
        "ref": "https://www.addicore.com/products/lm2596-step-down-adjustable-dc-dc-switching-buck-converter"
      }
    ],
    "copy": {
      "summary": "Controller ·4.5-35 V in, 5 V 2 A at 40 °C",
      "optionOrder": 1
    },
    "converterPadsMm": {
      "IN+": [
        1.84,
        1.97
      ],
      "IN-": [
        1.84,
        19.11
      ],
      "OUT+": [
        41.34,
        1.97
      ],
      "OUT-": [
        41.34,
        19.11
      ]
    }
  },
  "lr7843-mosfet-module": {
    "manifestVersion": 1,
    "partId": "lr7843-mosfet-module",
    "label": "LR7843 opto-isolated MOSFET module",
    "category": "switching-power",
    "dimensionsMm": {
      "width": 16.0,
      "height": 35.0
    },
    "manufacturer": "generic HW-532 / Infineon IRLR7843 and Sharp PC817",
    "logicVoltage": "2.5-20 V active-high input through a PC817 optocoupler (1 kOhm series resistor)",
    "pinLabelsLeftToRight": [
      "GND",
      "PWM"
    ],
    "notes": [
      "Single-channel low-side DC switch: the load's positive lead goes to +, its negative lead to LOAD, and the load supply across + and -.",
      "The logic input is optocoupler-isolated and active-high; a 3.3 V GPIO drives it directly. The MOSFET gate is driven from the load supply through a 4.7 k / 4.7 k divider, so how hard the switch turns on depends on the load supply (about half of it reaches the gate), not on the logic voltage.",
      "The load supply must be 6-28 V DC. Near the 6 V end the gate sees only about 3 V, so the MOSFET runs warmer at high current; a 12 V or 24 V supply drives it properly.",
      "The board has no flyback diode. Motors, solenoids, relay coils and other inductive loads need an external diode across the load.",
      "15 A continuous is the practical limit on the bare board; the reference measured about 97 C at 15 A. Keep the MOSFET under 80-100 C and add airflow or a heatsink near that current.",
      "External connections are shown as unpopulated plated holes. The board accepts 5 mm screw terminals or direct wires on the power end and a 0.1 in header or screw terminal on the logic end.",
      "Low-cost supplier revisions change silkscreen, board outline and terminal fitment. Follow the markings on the exact board in hand."
    ],
    "mosfet": {
      "channels": 1,
      "device": "IRLR7843 N-channel, low-side",
      "trigger": "active-high",
      "loadSupply": "6-28 V DC",
      "continuousCurrent": "15 A (module guidance; MOSFET die rating 161 A)",
      "optoIsolated": true,
      "flybackDiode": false,
      "loadTerminals": [
        "-",
        "LOAD",
        "+"
      ],
      "pwmHz": 500
    },
    "render": {
      "file": "parts/lr7843-mosfet-module.webp",
      "widthPx": 400,
      "heightPx": 851,
      "pxPerMm": 23.75
    },
    "revision": 1,
    "partTypes": [
      "PowerSwitchOutput"
    ],
    "categories": [
      "switching-mosfet"
    ],
    "verification": "reviewed",
    "sources": [
      {
        "facts": [
          "pinLabelsLeftToRight",
          "logicVoltage",
          "label",
          "mosfet"
        ],
        "ref": "https://protosupplies.com/product/lr7843-mosfet-control-module/"
      },
      {
        "facts": [
          "pinLabelsLeftToRight",
          "logicVoltage",
          "mosfet"
        ],
        "ref": "https://www.botnroll.com/en/solid-state/3139-power-mosfet-module-lr7843-hexfet-30vdc-161a.html"
      },
      {
        "facts": [
          "dimensionsMm",
          "logicVoltage",
          "mosfet"
        ],
        "ref": "https://www.infineon.com/dgdl/irlr7843pbf.pdf?fileId=5546d462533600a40153566de53526d8"
      },
      {
        "facts": [
          "dimensionsMm",
          "pinLabelsLeftToRight",
          "render"
        ],
        "ref": "https://www.farnell.com/datasheets/73758.pdf"
      }
    ],
    "copy": {
      "summary": "One opto-isolated DC switch or dimmer, 6-28 V",
      "wiringNote": "DC loads only. No flyback diode on the board: add one across a motor, solenoid or coil.",
      "optionLabel": "LR7843 MOSFET switch"
    },
    "pads": [
      {
        "label": "GND",
        "xPx": 169.8,
        "yPx": 771.2
      },
      {
        "label": "PWM",
        "xPx": 230.2,
        "yPx": 771.2
      }
    ],
    "padHoleRadiusPx": 12.3,
    "supplyRail": "none"
  },
  "matrix-keypad-4x4": {
    "manifestVersion": 1,
    "partId": "matrix-keypad-4x4",
    "label": "4x4 matrix keypad",
    "category": "input-control",
    "dimensionsMm": {
      "width": 69.0,
      "height": 80.5
    },
    "manufacturer": "Adafruit product 3844 and compatible membrane keypads",
    "logicVoltage": "Passive switch matrix, no supply; each key is a contact between one row and one column line",
    "pinLabelsLeftToRight": [
      "R1",
      "R2",
      "R3",
      "R4",
      "C1",
      "C2",
      "C3",
      "C4"
    ],
    "notes": [
      "Sixteen keys in a 4 by 4 matrix, legended 1 2 3 A / 4 5 6 B / 7 8 9 C / * 0 # D. Each key joins one row line to one column line, so eight GPIOs read all sixteen keys.",
      "The keypad is passive: it needs no power, only eight controller pins. Rows go to pins with an internal pull-up, and the columns are driven low one at a time to find which key closes a row.",
      "The pin order is R1, R2, R3, R4, C1, C2, C3, C4 from left to right, the four rows first and the four columns after them. Cheaper keypads sometimes print the order the other way round, so check the tail's own markings.",
      "The real tail is longer and ends in bare traces or a 2.54 mm header; the render keeps only its end and shows the eight contacts as unpopulated plated holes.",
      "Two keys pressed together can read as a third (ghosting) because the matrix has no diodes; the firmware reports only the first key found."
    ],
    "render": {
      "file": "parts/matrix-keypad-4x4.webp",
      "widthPx": 848,
      "heightPx": 986,
      "pxPerMm": 12.0
    },
    "revision": 1,
    "partTypes": [
      "KeypadInput"
    ],
    "categories": [
      "buttons-touch"
    ],
    "verification": "reviewed",
    "sources": [
      {
        "facts": [
          "dimensionsMm",
          "pinLabelsLeftToRight"
        ],
        "ref": "https://www.adafruit.com/product/3844"
      },
      {
        "facts": [
          "pinLabelsLeftToRight",
          "logicVoltage",
          "notes"
        ],
        "ref": "https://components101.com/misc/4x4-keypad-module-pinout-configuration-features-datasheet"
      }
    ],
    "copy": {
      "summary": "Sixteen keys on eight GPIOs",
      "wiringNote": "Rows R1 to R4 go to pins with a pull-up and columns C1 to C4 to output pins. The keypad is passive and needs no power.",
      "optionLabel": "4x4 matrix keypad",
      "optionOrder": 1
    },
    "pads": [
      {
        "label": "R1",
        "xPx": 317.3,
        "yPx": 947.2
      },
      {
        "label": "R2",
        "xPx": 347.8,
        "yPx": 947.2
      },
      {
        "label": "R3",
        "xPx": 378.3,
        "yPx": 947.2
      },
      {
        "label": "R4",
        "xPx": 408.8,
        "yPx": 947.2
      },
      {
        "label": "C1",
        "xPx": 439.2,
        "yPx": 947.2
      },
      {
        "label": "C2",
        "xPx": 469.7,
        "yPx": 947.2
      },
      {
        "label": "C3",
        "xPx": 500.2,
        "yPx": 947.2
      },
      {
        "label": "C4",
        "xPx": 530.7,
        "yPx": 947.2
      }
    ],
    "padHoleRadiusPx": 6,
    "supplyRail": "none",
    "keypad": {
      "rows": 4,
      "columns": 4,
      "legends": [
        "1",
        "2",
        "3",
        "A",
        "4",
        "5",
        "6",
        "B",
        "7",
        "8",
        "9",
        "C",
        "*",
        "0",
        "#",
        "D"
      ],
      "rowLabels": [
        "R1",
        "R2",
        "R3",
        "R4"
      ],
      "columnLabels": [
        "C1",
        "C2",
        "C3",
        "C4"
      ]
    }
  },
  "max485-rs485-module": {
    "manifestVersion": 1,
    "partId": "max485-rs485-module",
    "label": "MAX485 RS-485 (DMX) transceiver module",
    "category": "communication",
    "dimensionsMm": {
      "width": 15.0,
      "height": 45.0
    },
    "manufacturer": "generic C25B module / Analog Devices (Maxim) MAX485",
    "logicVoltage": "5 V: RO swings to 5 V and R1-R4 pull RO, RE, DE and DI up to 5 V through 10 k, so RO needs a divider into a 3.3 V controller",
    "pinLabelsLeftToRight": [
      "RO",
      "RE",
      "DE",
      "DI",
      "VCC",
      "B",
      "A",
      "GND"
    ],
    "notes": [
      "Half-duplex RS-485 transceiver on 5 V, used here to receive DMX512: DI to the controller's UART TX, RE and DE joined to one enable GPIO, and RO to RX through a 1 k / 2 k divider.",
      "RO swings to 5 V, above an ESP32's 3.6 V pin limit. 1 k from RO to RX and 2 k from RX to GND bring it to 3.3 V (3.5 V at the chip's 5.25 V ceiling); a level-shifter module on RO does the same job.",
      "RE and DE are separate pads. Bridge them with a short wire so one GPIO drives both; driven low, the module listens.",
      "R2-R4 pull RE, DE and DI up to 5 V through 10 k. The controller drives those lines at 3.3 V, so each feeds about 0.17 mA back into its pin.",
      "Until the firmware sets the enable pin, R2 and R3 hold RE and DE high, so the module drives the DMX line briefly at power-up. RS-485 drivers are current-limited, but a receiver sharing a line with a desk does this every boot.",
      "DMX512 on a 5-pin or 3-pin XLR: pin 1 common/shield to GND, pin 2 Data- to B, pin 3 Data+ to A.",
      "R7 (120 ohm) terminates the line and is fitted at the factory. Keep it only on the last device in a DMX chain; remove it on a receiver in the middle of a run.",
      "The logic and bus headers are shown unpopulated; the screw terminal is fitted, as the module ships. B and A on the header and the terminal are the same nets.",
      "Pads are hot-air levelled tin, as on the photographed board. Low-cost supplier revisions change silkscreen and resistor placement; follow the markings on the exact board in hand."
    ],
    "render": {
      "file": "parts/max485-rs485-module.webp",
      "widthPx": 400,
      "heightPx": 1160,
      "pxPerMm": 25.333,
      "indicators": [
        {
          "rectPx": [
            247.9,
            399.3,
            30.9,
            29.4
          ],
          "color": [
            255,
            15,
            8
          ],
          "drive": "power"
        }
      ]
    },
    "revision": 1,
    "partTypes": [
      "DmxTransceiver"
    ],
    "categories": [
      "dmx-midi"
    ],
    "verification": "reviewed",
    "sources": [
      {
        "facts": [
          "pinLabelsLeftToRight",
          "logicVoltage",
          "render",
          "notes",
          "rs485"
        ],
        "ref": "https://protosupplies.com/product/max485-ttl-to-rs-485-interface-module/"
      },
      {
        "facts": [
          "pinLabelsLeftToRight",
          "logicVoltage",
          "render"
        ],
        "ref": "https://hobbycomponents.com/wired-wireless/663-max485-rs485-transceiver-module"
      },
      {
        "facts": [
          "pinLabelsLeftToRight",
          "logicVoltage"
        ],
        "ref": "https://www.analog.com/media/en/technical-documentation/data-sheets/MAX1487-MAX491.pdf"
      },
      {
        "facts": [
          "pinLabelsLeftToRight",
          "logicVoltage"
        ],
        "ref": "https://github.com/someweisguy/esp_dmx"
      }
    ],
    "copy": {
      "summary": "DMX512 in from an XLR line, on 5 V",
      "wiringNote": "Power from 5 V. RO reaches the board through a 1 kΩ / 2 kΩ divider, and RE is bridged to DE so one GPIO drives both. Keep the fitted 120 Ω terminator only on the last device in the DMX chain.",
      "optionLabel": "MAX485 RS-485 module"
    },
    "pads": [
      {
        "label": "RO",
        "xPx": 103,
        "yPx": 1094.3
      },
      {
        "label": "RE",
        "xPx": 167.3,
        "yPx": 1094.3
      },
      {
        "label": "DE",
        "xPx": 231.7,
        "yPx": 1094.3
      },
      {
        "label": "DI",
        "xPx": 296,
        "yPx": 1094.3
      },
      {
        "label": "VCC",
        "xPx": 103,
        "yPx": 64.7
      },
      {
        "label": "B",
        "xPx": 167.3,
        "yPx": 64.7
      },
      {
        "label": "A",
        "xPx": 231.7,
        "yPx": 64.7
      },
      {
        "label": "GND",
        "xPx": 296,
        "yPx": 64.7
      }
    ],
    "padHoleRadiusPx": 11.9,
    "supplyRail": "v5",
    "rs485": {
      "device": "MAX485",
      "supplyVolts": 5,
      "rxLogicVolts": 5,
      "terminationFitted": true,
      "terminationRef": "R7"
    }
  },
  "max7219-8digit-7segment": {
    "manifestVersion": 1,
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
      "The display is intentionally rendered blank, with all eight digits and decimal points unlit."
    ],
    "display": {
      "controller": "MAX7219",
      "resolutionPx": [
        8,
        7
      ],
      "interface": "SPI-like DIN + CLK + CS/LOAD",
      "touchController": null,
      "touchSurface": null,
      "screensPx": [
        [
          134.2,
          19.6,
          354.0,
          148.8
        ],
        [
          503.8,
          19.6,
          354.0,
          148.8
        ]
      ]
    },
    "render": {
      "file": "parts/max7219-8digit-7segment.webp",
      "widthPx": 992,
      "heightPx": 188,
      "pxPerMm": 12.0
    },
    "revision": 1,
    "partTypes": [
      "SegmentDisplay"
    ],
    "categories": [
      "display-segment"
    ],
    "verification": "bench",
    "sources": [
      {
        "facts": [
          "pinLabelsLeftToRight",
          "logicVoltage"
        ],
        "ref": "https://www.elcoteam.com/8-digit-7-segments-display-module-with-max7219"
      },
      {
        "facts": [
          "label"
        ],
        "ref": "https://www.analog.com/media/en/technical-documentation/data-sheets/MAX7219-MAX7221.pdf"
      }
    ],
    "interfaces": [
      "spi"
    ],
    "copy": {
      "summary": "Eight digits on a shared SPI bus",
      "wiringNote": "Eight digits and no colon, clocked as 16-bit frames over CLK and DIN with its own load line. It can share clock and data with other SPI devices given its own load pin, and its sixteen brightness steps are twice the TM1637 range.",
      "optionLabel": "MAX7219 8-digit",
      "optionOrder": 2
    },
    "pads": [
      {
        "label": "VCC",
        "xPx": 18.3,
        "yPx": 33
      },
      {
        "label": "GND",
        "xPx": 18.3,
        "yPx": 63.6
      },
      {
        "label": "DIN",
        "xPx": 18.3,
        "yPx": 94
      },
      {
        "label": "CS",
        "xPx": 18.3,
        "yPx": 124.5
      },
      {
        "label": "CLK",
        "xPx": 18.3,
        "yPx": 154.9
      }
    ],
    "padHoleRadiusPx": 4.7,
    "supplyRail": "v3v3"
  },
  "max98357a-i2s-amplifier": {
    "manifestVersion": 1,
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
    },
    "revision": 1,
    "partTypes": [
      "Amplifier"
    ],
    "categories": [
      "audio-amplifiers"
    ],
    "verification": "bench",
    "sources": [
      {
        "facts": [
          "pinLabelsLeftToRight",
          "render",
          "notes",
          "i2sAudio"
        ],
        "ref": "https://learn.adafruit.com/adafruit-max98357-i2s-class-d-mono-amp/overview"
      },
      {
        "facts": [
          "dimensionsMm"
        ],
        "ref": "https://learn.adafruit.com/adafruit-max98357-i2s-class-d-mono-amp/downloads"
      },
      {
        "facts": [
          "notes"
        ],
        "ref": "https://cdn-shop.adafruit.com/product-files/3006/MAX98357A-MAX98357B.pdf"
      }
    ],
    "copy": {
      "summary": "I2S in, drives a speaker directly",
      "optionLabel": "MAX98357A",
      "optionOrder": 1
    },
    "pads": [
      {
        "label": "LRC",
        "xPx": 32,
        "yPx": 535.7
      },
      {
        "label": "BCLK",
        "xPx": 88,
        "yPx": 535.7
      },
      {
        "label": "DIN",
        "xPx": 144,
        "yPx": 535.7
      },
      {
        "label": "GAIN",
        "xPx": 200,
        "yPx": 535.7
      },
      {
        "label": "SD",
        "xPx": 256,
        "yPx": 535.7
      },
      {
        "label": "GND",
        "xPx": 312,
        "yPx": 535.7
      },
      {
        "label": "VIN",
        "xPx": 368,
        "yPx": 535.7
      }
    ],
    "padHoleRadiusPx": 10.5,
    "supplyRail": "v5",
    "i2sAudio": {
      "device": "MAX98357A",
      "output": "speaker"
    }
  },
  "max98357a-stereo-pair": {
    "manifestVersion": 1,
    "partId": "max98357a-stereo-pair",
    "label": "MAX98357A stereo pair",
    "category": "amplifier",
    "dimensionsMm": {
      "width": 38.56,
      "height": 25.4
    },
    "manufacturer": "generic / Adafruit breakout form",
    "logicVoltage": "3.3 V / 5 V logic; 2.7-5.5 V supply",
    "pinLabelsLeftToRight": [
      "L:LRC",
      "L:BCLK",
      "L:DIN",
      "L:GAIN",
      "L:SD",
      "L:GND",
      "L:VIN",
      "R:LRC",
      "R:BCLK",
      "R:DIN",
      "R:GAIN",
      "R:SD",
      "R:GND",
      "R:VIN"
    ],
    "notes": [
      "Two independent mono MAX98357A breakouts presented as the physical stereo pair used on one shared I2S bus.",
      "The SD/mode resistor on the left module is configured for the left slot and the right module for the right slot.",
      "Both speaker outputs are bridge-tied; neither speaker terminal is ground.",
      "The seven-position logic connection rows are intentionally unpopulated plated through-holes, matching the reference breakout presentation."
    ],
    "render": {
      "file": "parts/max98357a-stereo-pair.webp",
      "widthPx": 483,
      "heightPx": 325,
      "pxPerMm": 12.007
    },
    "revision": 1,
    "partTypes": [
      "Amplifier"
    ],
    "categories": [
      "audio-amplifiers"
    ],
    "verification": "reviewed",
    "sources": [
      {
        "facts": [
          "dimensionsMm",
          "pinLabelsLeftToRight",
          "render",
          "notes",
          "i2sAudio"
        ],
        "ref": "https://learn.adafruit.com/adafruit-max98357-i2s-class-d-mono-amp/overview"
      },
      {
        "facts": [
          "notes"
        ],
        "ref": "https://cdn-shop.adafruit.com/product-files/3006/MAX98357A-MAX98357B.pdf"
      },
      {
        "facts": [
          "dimensionsMm",
          "render"
        ],
        "ref": "Existing Design Studio MAX98357A asset (local copy in the asset workspace)"
      }
    ],
    "copy": {
      "summary": "Two I2S amps, one per channel",
      "wiringNote": "Both boards share BCLK, LRC and DIN. Each plays the channel its SD pin selects (see the SD_MODE table in the MAX98357A datasheet); an unmodified breakout plays the left-plus-right mix, so set one board to left and the other to right.",
      "optionLabel": "MAX98357A stereo pair",
      "optionOrder": 2
    },
    "pads": [
      {
        "label": "L:LRC",
        "xPx": 24.2,
        "yPx": 299.7
      },
      {
        "label": "L:BCLK",
        "xPx": 54.8,
        "yPx": 299.7
      },
      {
        "label": "L:DIN",
        "xPx": 85.3,
        "yPx": 299.7
      },
      {
        "label": "L:GAIN",
        "xPx": 115.9,
        "yPx": 299.7
      },
      {
        "label": "L:SD",
        "xPx": 146.4,
        "yPx": 299.7
      },
      {
        "label": "L:GND",
        "xPx": 177,
        "yPx": 299.7
      },
      {
        "label": "L:VIN",
        "xPx": 207.5,
        "yPx": 299.7
      },
      {
        "label": "R:LRC",
        "xPx": 274.1,
        "yPx": 299.7
      },
      {
        "label": "R:BCLK",
        "xPx": 304.7,
        "yPx": 299.7
      },
      {
        "label": "R:DIN",
        "xPx": 335.2,
        "yPx": 299.7
      },
      {
        "label": "R:GAIN",
        "xPx": 365.8,
        "yPx": 299.7
      },
      {
        "label": "R:SD",
        "xPx": 396.3,
        "yPx": 299.7
      },
      {
        "label": "R:GND",
        "xPx": 426.9,
        "yPx": 299.7
      },
      {
        "label": "R:VIN",
        "xPx": 457.4,
        "yPx": 299.7
      }
    ],
    "padHoleRadiusPx": 5.1,
    "supplyRail": "v5",
    "i2sAudio": {
      "device": "MAX98357A",
      "output": "speaker"
    }
  },
  "mean-well-sd-100a-5": {
    "manifestVersion": 1,
    "partId": "mean-well-sd-100a-5",
    "label": "Mean Well SD-100A-5 DC-DC converter (12 V in, 5 V 18 A)",
    "category": "power-conversion",
    "dimensionsMm": {
      "width": 98.0,
      "height": 199.0
    },
    "manufacturer": "Mean Well Enterprises",
    "logicVoltage": "none; power only",
    "pinLabelsLeftToRight": [
      "+",
      "-",
      "FG",
      "-V",
      "-V",
      "+V",
      "+V"
    ],
    "notes": [
      "Terminals left to right: 1 DC input +, 2 DC input -, 3 FG (protective earth or the metal enclosure), 4-5 output -V, 6-7 output +V. Use both output terminals of each polarity at full load.",
      "Isolated: output -V is not joined to input -. Bond output -V to the common ground at the fuse-block distribution so the controller and LEDs share one reference.",
      "Set the output with V.ADJ before connecting the LEDs; it adjusts 4.5-5.5 V.",
      "Full load needs the input at or above the derating knee; below it the output current is reduced.",
      "Output current derates with ambient temperature; the plan sizes it at a 40 C enclosure.",
      "Mount it on a metal plate with airflow; the perforated case must not be covered."
    ],
    "powerConverter": {
      "role": "led-rail",
      "topology": "isolated DC-DC",
      "inputMinV": 10,
      "inputMaxV": 18,
      "minHeadroomV": 0,
      "outputSetV": 5.0,
      "continuousCurrentMa": 18000,
      "peakCurrentMa": 18000,
      "typicalEfficiency": 0.78,
      "isolated": true,
      "adjustable": true,
      "outputCurrentLimit": "fixed",
      "terminals": [
        "+",
        "-",
        "FG",
        "-V",
        "-V",
        "+V",
        "+V"
      ],
      "deratingCurve": [
        [
          40,
          100
        ],
        [
          60,
          60
        ]
      ]
    },
    "render": {
      "file": "parts/mean-well-sd-100a-5.webp",
      "widthPx": 1196,
      "heightPx": 2408,
      "pxPerMm": 12.0
    },
    "revision": 1,
    "partTypes": [
      "PowerConverter"
    ],
    "categories": [
      "power-chassis-dcdc"
    ],
    "verification": "reviewed",
    "sources": [
      {
        "facts": [
          "pinLabelsLeftToRight",
          "logicVoltage",
          "powerConverter"
        ],
        "ref": "https://www.meanwell.com/Upload/PDF/SD-100/SD-100-SPEC.PDF"
      },
      {
        "facts": [
          "pinLabelsLeftToRight",
          "render",
          "powerConverter"
        ],
        "ref": "https://www.meanwell-web.com/en/mean-well-sd-100b-5-sd-100b-5"
      }
    ],
    "copy": {
      "summary": "LED rail ·10-18 V in, 5 V 18 A at 40 °C",
      "optionOrder": 2
    }
  },
  "mean-well-sd-100b-5": {
    "manifestVersion": 1,
    "partId": "mean-well-sd-100b-5",
    "label": "Mean Well SD-100B-5 DC-DC converter (24 V in, 5 V 20 A)",
    "category": "power-conversion",
    "dimensionsMm": {
      "width": 98.0,
      "height": 199.0
    },
    "manufacturer": "Mean Well Enterprises",
    "logicVoltage": "none; power only",
    "pinLabelsLeftToRight": [
      "+",
      "-",
      "FG",
      "-V",
      "-V",
      "+V",
      "+V"
    ],
    "notes": [
      "Terminals left to right: 1 DC input +, 2 DC input -, 3 FG (protective earth or the metal enclosure), 4-5 output -V, 6-7 output +V. Use both output terminals of each polarity at full load.",
      "Isolated: output -V is not joined to input -. Bond output -V to the common ground at the fuse-block distribution so the controller and LEDs share one reference.",
      "Set the output with V.ADJ before connecting the LEDs; it adjusts 4.5-5.5 V.",
      "Full load needs the input at or above the derating knee; below it the output current is reduced.",
      "Output current derates with ambient temperature; the plan sizes it at a 40 C enclosure.",
      "Mount it on a metal plate with airflow; the perforated case must not be covered."
    ],
    "powerConverter": {
      "role": "led-rail",
      "topology": "isolated DC-DC",
      "inputMinV": 20,
      "inputMaxV": 36,
      "minHeadroomV": 0,
      "outputSetV": 5.0,
      "continuousCurrentMa": 20000,
      "peakCurrentMa": 20000,
      "typicalEfficiency": 0.74,
      "isolated": true,
      "adjustable": true,
      "outputCurrentLimit": "fixed",
      "terminals": [
        "+",
        "-",
        "FG",
        "-V",
        "-V",
        "+V",
        "+V"
      ],
      "deratingCurve": [
        [
          30,
          100
        ],
        [
          60,
          60
        ]
      ]
    },
    "render": {
      "file": "parts/mean-well-sd-100b-5.webp",
      "widthPx": 1196,
      "heightPx": 2408,
      "pxPerMm": 12.0
    },
    "revision": 1,
    "partTypes": [
      "PowerConverter"
    ],
    "categories": [
      "power-chassis-dcdc"
    ],
    "verification": "reviewed",
    "sources": [
      {
        "facts": [
          "pinLabelsLeftToRight",
          "logicVoltage",
          "powerConverter"
        ],
        "ref": "https://www.meanwell.com/Upload/PDF/SD-100/SD-100-SPEC.PDF"
      },
      {
        "facts": [
          "pinLabelsLeftToRight",
          "render",
          "powerConverter"
        ],
        "ref": "https://www.meanwell-web.com/en/mean-well-sd-100b-5-sd-100b-5"
      }
    ],
    "copy": {
      "summary": "LED rail ·20-36 V in, 5 V 17.3 A at 40 °C",
      "optionOrder": 3
    }
  },
  "microsd-breakout-3v3": {
    "manifestVersion": 1,
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
    },
    "revision": 1,
    "partTypes": [
      "SDCard"
    ],
    "categories": [
      "storage"
    ],
    "verification": "reviewed",
    "sources": [
      {
        "facts": [
          "render"
        ],
        "ref": "https://www.sparkfun.com/sparkfun-microsd-transflash-breakout.html"
      },
      {
        "facts": [
          "manufacturer"
        ],
        "ref": "https://www.digikey.com/en/products/detail/sparkfun-electronics/00544/5824094"
      },
      {
        "facts": [
          "logicVoltage",
          "sdCard"
        ],
        "ref": "https://learn.sparkfun.com/tutorials/microsd-shield-and-sd-breakout-hookup-guide/sd-card-breakout-boards"
      }
    ],
    "copy": {
      "summary": "Bare board — 3.3 V only",
      "wiringNote": "Bare board: no regulator, no level shifter. 5 V power or 5 V SPI can destroy the card.",
      "optionLabel": "microSD breakout (3.3 V)",
      "optionOrder": 2
    },
    "pads": [
      {
        "label": "CD",
        "xPx": 53,
        "yPx": 395.6
      },
      {
        "label": "DO",
        "xPx": 102,
        "yPx": 395.6
      },
      {
        "label": "GND",
        "xPx": 151,
        "yPx": 395.6
      },
      {
        "label": "SCK",
        "xPx": 200,
        "yPx": 395.6
      },
      {
        "label": "3V3",
        "xPx": 249,
        "yPx": 395.6
      },
      {
        "label": "DI",
        "xPx": 298,
        "yPx": 395.6
      },
      {
        "label": "CS",
        "xPx": 347,
        "yPx": 395.6
      }
    ],
    "padHoleRadiusPx": 9.6,
    "supplyRail": "v3v3",
    "sdCard": {
      "supplyVolts": 3.3,
      "levelShifted": false
    }
  },
  "microsd-module-5v": {
    "manifestVersion": 1,
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
    },
    "revision": 1,
    "partTypes": [
      "SDCard"
    ],
    "categories": [
      "storage"
    ],
    "verification": "reviewed",
    "sources": [
      {
        "facts": [
          "pinLabelsLeftToRight"
        ],
        "ref": "https://www.tinytronics.nl/en/data-storage/modules/microsd-card-adapter-module-3.3v-5v-with-level-shifter"
      },
      {
        "facts": [
          "logicVoltage",
          "sdCard"
        ],
        "ref": "https://protosupplies.com/product/microsd-card-module-with-level-shifter/"
      },
      {
        "facts": [
          "logicVoltage",
          "render"
        ],
        "ref": "https://www.robogears.in/shop/9216-mini-micro-sd-card-reader-module-high-speed-spi-interface-level-shifter-board-3577"
      }
    ],
    "copy": {
      "summary": "Regulator and level shifter on board",
      "wiringNote": "Has an onboard regulator and level shifter, so it takes 5 V power and 5 V SPI.",
      "optionLabel": "microSD module (5 V)",
      "optionOrder": 1
    },
    "pads": [
      {
        "label": "GND",
        "xPx": 96.2,
        "yPx": 669.1
      },
      {
        "label": "VCC",
        "xPx": 137.8,
        "yPx": 669.1
      },
      {
        "label": "MISO",
        "xPx": 179.2,
        "yPx": 669.1
      },
      {
        "label": "MOSI",
        "xPx": 220.8,
        "yPx": 669.1
      },
      {
        "label": "SCK",
        "xPx": 262.1,
        "yPx": 669.1
      },
      {
        "label": "CS",
        "xPx": 303.8,
        "yPx": 669.1
      }
    ],
    "padHoleRadiusPx": 8.1,
    "supplyRail": "v5",
    "sdCard": {
      "supplyVolts": 5,
      "levelShifted": true
    }
  },
  "monkmakes-mosfetti": {
    "manifestVersion": 1,
    "partId": "monkmakes-mosfetti",
    "label": "MonkMakes Mosfetti 4-channel MOSFET switch",
    "category": "switching-power",
    "dimensionsMm": {
      "width": 65.6,
      "height": 50.3
    },
    "manufacturer": "MonkMakes (SKU00099), board v1b",
    "logicVoltage": "3-5 V active-high: each GPIO drives its MOSFET gate directly (about 2 V on-threshold, 100 kOhm pull-down). Not isolated: the header's GND is the load supply's negative.",
    "pinLabelsLeftToRight": [
      "A",
      "B",
      "C",
      "D",
      "GND"
    ],
    "notes": [
      "Four low-side DC switches, A to D, sharing one supply. The supply goes to the power terminal (+ and GND); each load connects across its channel's pair of output terminals. The left terminal of each pair (the square pad) is the fused supply +, the right one is the switched negative lead.",
      "Not isolated: each GPIO drives its MOSFET gate directly, with a 100 kOhm pull-down holding it off. The controller's GND must connect to the header's fifth pin, which is also the load supply's negative. 3.3 V and 5 V controllers both switch it fully.",
      "3-16 V DC only; never connect AC. One 2 A resettable fuse (T160) protects the whole board, so 2 A is the limit per channel and also in total across all four; up to 2.5 A for under a minute.",
      "Each channel carries its own flyback diode across the output, so pumps, motors, solenoids and relay coils can connect directly.",
      "MonkMakes' examples dim loads with PWM: 1 kHz on the Raspberry Pi Pico and Arduino analogWrite on the Uno. The app dims it at 1 kHz.",
      "The orange LED in the MonkMakes logo shows board power; each channel's green LED lights while that output is on.",
      "Sold as a kit: the 5-pin header and 3.5 mm screw terminals ship loose, so every connection is shown as an unpopulated plated hole. The header's fifth pin is printed with a ground symbol rather than the word GND."
    ],
    "mosfet": {
      "channels": 4,
      "device": "N-channel SOT-23 MOSFET per channel (30 V, 2.1 A), low-side",
      "trigger": "active-high",
      "loadSupply": "3-16 V DC",
      "continuousCurrent": "2 A per channel and 2 A in total through one resettable fuse (2.5 A for under a minute)",
      "optoIsolated": false,
      "flybackDiode": true,
      "channelLabels": [
        "A",
        "B",
        "C",
        "D"
      ],
      "loadTerminals": [
        "A+",
        "A-",
        "B+",
        "B-",
        "C+",
        "C-",
        "D+",
        "D-"
      ],
      "pwmHz": 1000
    },
    "render": {
      "file": "parts/monkmakes-mosfetti.webp",
      "widthPx": 808,
      "heightPx": 624,
      "pxPerMm": 12.012,
      "indicators": [
        {
          "rectPx": [
            47.2,
            561.5,
            14.5,
            14.7
          ],
          "color": [
            255,
            120,
            0
          ],
          "drive": "power"
        },
        {
          "rectPx": [
            258.4,
            208.2,
            14.5,
            14.7
          ],
          "color": [
            40,
            255,
            60
          ],
          "drive": "channel",
          "channel": 1
        },
        {
          "rectPx": [
            379.0,
            208.2,
            14.5,
            14.7
          ],
          "color": [
            40,
            255,
            60
          ],
          "drive": "channel",
          "channel": 2
        },
        {
          "rectPx": [
            535.6,
            208.2,
            14.5,
            14.7
          ],
          "color": [
            40,
            255,
            60
          ],
          "drive": "channel",
          "channel": 3
        },
        {
          "rectPx": [
            656.1,
            208.2,
            14.5,
            14.7
          ],
          "color": [
            40,
            255,
            60
          ],
          "drive": "channel",
          "channel": 4
        }
      ]
    },
    "revision": 1,
    "partTypes": [
      "PowerSwitchOutput"
    ],
    "categories": [
      "switching-mosfet"
    ],
    "verification": "reviewed",
    "sources": [
      {
        "facts": [
          "dimensionsMm",
          "pinLabelsLeftToRight",
          "logicVoltage",
          "render",
          "mosfet"
        ],
        "ref": "https://monkmakes.com/downloads/datasheet_mosfetti.pdf"
      },
      {
        "facts": [
          "dimensionsMm",
          "pinLabelsLeftToRight",
          "logicVoltage",
          "render",
          "mosfet"
        ],
        "ref": "https://cdn-shop.adafruit.com/product-files/5757/datasheet_mosfetti.pdf"
      },
      {
        "facts": [
          "pinLabelsLeftToRight",
          "logicVoltage",
          "mosfet"
        ],
        "ref": "https://monkmakes.com/downloads/instructions_mosfetti.pdf"
      },
      {
        "facts": [
          "label"
        ],
        "ref": "https://monkmakes.com/mosfetti"
      },
      {
        "facts": [
          "dimensionsMm",
          "mosfet"
        ],
        "ref": "https://www.adafruit.com/product/5757"
      }
    ],
    "copy": {
      "summary": "Four DC switches or dimmers, A to D, 3-16 V",
      "wiringNote": "DC only, 2 A for the whole board. Not isolated: join its GND to the board. Flyback diodes are fitted.",
      "optionLabel": "MonkMakes Mosfetti"
    },
    "pads": [
      {
        "label": "A",
        "xPx": 368.2,
        "yPx": 536.5
      },
      {
        "label": "B",
        "xPx": 398.7,
        "yPx": 536.5
      },
      {
        "label": "C",
        "xPx": 429.2,
        "yPx": 536.5
      },
      {
        "label": "D",
        "xPx": 459.7,
        "yPx": 536.5
      },
      {
        "label": "GND",
        "xPx": 490.2,
        "yPx": 536.5
      }
    ],
    "padHoleRadiusPx": 5.6,
    "supplyRail": "none"
  },
  "nled-pixel-data-extender-pair": {
    "manifestVersion": 1,
    "partId": "nled-pixel-data-extender-pair",
    "label": "NLED Pixel Data Extender TX/RX pair",
    "category": "communication",
    "dimensionsMm": {
      "width": 23.0,
      "height": 12.0
    },
    "manufacturer": "Northern Lights Electronic Design LLC",
    "logicVoltage": "3.3-12 V power; 3.3-5 V TTL data",
    "pinLabelsLeftToRight": [
      "TX +",
      "TX A",
      "TX B",
      "TX GND",
      "RX +",
      "RX A",
      "RX B",
      "RX GND"
    ],
    "notes": [
      "A matched transmitter and receiver pair for one-wire asynchronous pixels; both modules are required.",
      "Run A, B and common ground together through twisted conductors; do not use the pair as an Ethernet link.",
      "If separate power supplies feed the two ends, bond their grounds but do not join their positive outputs.",
      "The receiver level-shifts its pixel-data output to 5 V when powered from 5 V or higher.",
      "The tiny solder-pad modules must be kept dry, clean and clear of conductive surfaces."
    ],
    "pixelDataExtender": {
      "mode": "one-wire differential",
      "maxDistanceMeters": 304.8,
      "maxDataRateMbps": 12,
      "supplyMinV": 3.3,
      "supplyMaxV": 12,
      "pairConductors": [
        "A",
        "B",
        "GND"
      ]
    },
    "render": {
      "file": "parts/nled-pixel-data-extender-pair.webp",
      "widthPx": 400,
      "heightPx": 218,
      "pxPerMm": 16.522
    },
    "revision": 1,
    "partTypes": [
      "MatrixOutput"
    ],
    "categories": [
      "led-data-links"
    ],
    "verification": "reviewed",
    "sources": [
      {
        "facts": [
          "render",
          "label",
          "manufacturer"
        ],
        "ref": "https://www.nledshop.com/pixelproducts/"
      },
      {
        "facts": [
          "dimensionsMm",
          "pinLabelsLeftToRight",
          "logicVoltage",
          "pixelDataExtender"
        ],
        "ref": "https://www.nledshop.com/downloads/datasheets/nled-async-ext-set.pdf"
      },
      {
        "facts": [
          "dimensionsMm",
          "render"
        ],
        "ref": "https://www.nledshop.com/downloads/models/nled-async-ext-set-v1a-3d-model.zip"
      }
    ]
  },
  "noctua-nf-a4x10-5v-pwm": {
    "manifestVersion": 1,
    "partId": "noctua-nf-a4x10-5v-pwm",
    "label": "Noctua NF-A4x10 5V PWM fan",
    "category": "support",
    "dimensionsMm": {
      "width": 40.0,
      "height": 40.0
    },
    "manufacturer": "Noctua",
    "logicVoltage": "5 V fan supply; 3.3/5 V PWM input; open-collector tachometer pulled up to controller logic voltage",
    "pinLabelsLeftToRight": [
      "GND",
      "VCC",
      "RPM",
      "PWM"
    ],
    "notes": [
      "A 40 x 40 x 11 mm four-wire 5 V fan. Noctua rates it at 5000 rpm maximum, 0.07 A maximum and 1050 rpm at 20% PWM.",
      "PWM is active-high at 25 kHz. The fan provides its own 3.3/5 V pull-up on PWM, so drive PWM directly from a GPIO and never connect the fan supply to that pin.",
      "RPM is an open-collector tachometer with two pulses per revolution. Pull it up to the controller's logic voltage; the Build Diagram uses the controller's internal pull-up.",
      "At 0% PWM this exact model stops. With no PWM signal it runs at full rated speed.",
      "The render models the 40 mm frame, 32 mm mounting-hole spacing and front rotor from Noctua's published dimensions and CAD envelope. The loose cable and connector are omitted so the image keeps the physical fan footprint."
    ],
    "fan": {
      "supplyVoltageV": 5,
      "maxCurrentA": 0.07,
      "maxRpm": 5000,
      "minRpmAt20Percent": 1050,
      "pwmHz": 25000,
      "tachPulsesPerRevolution": 2,
      "tachOutput": "open-collector, 5 mA maximum"
    },
    "render": {
      "file": "parts/noctua-nf-a4x10-5v-pwm.webp",
      "widthPx": 500,
      "heightPx": 500,
      "pxPerMm": 12.0
    },
    "revision": 1,
    "partTypes": [
      "CoolingFanOutput"
    ],
    "categories": [
      "cooling"
    ],
    "verification": "reviewed",
    "sources": [
      {
        "facts": [
          "dimensionsMm",
          "logicVoltage",
          "fan"
        ],
        "ref": "https://www.noctua.at/en/products/nf-a4x10-5v-pwm/specifications"
      },
      {
        "facts": [
          "fan"
        ],
        "ref": "https://cdn.noctua.at/media/Noctua_PWM_specifications_white_paper.pdf"
      },
      {
        "facts": [
          "render"
        ],
        "ref": "https://cdn.noctua.at/media/46800471/NF-A4x10_Public-CAD.zip"
      }
    ],
    "copy": {
      "summary": "40 mm 5 V fan, 25 kHz PWM control and tachometer feedback",
      "wiringNote": "Power it from 5 V. PWM is a 25 kHz active-high controller signal; RPM is an open-collector tachometer output with two pulses per revolution. This first firmware path supports ESP32-family boards.",
      "optionLabel": "Noctua NF-A4x10 5V PWM"
    },
    "pads": [
      {
        "label": "GND",
        "xPx": 204.25,
        "yPx": 458
      },
      {
        "label": "VCC",
        "xPx": 234.75,
        "yPx": 458
      },
      {
        "label": "RPM",
        "xPx": 265.25,
        "yPx": 458
      },
      {
        "label": "PWM",
        "xPx": 295.75,
        "yPx": 458
      }
    ],
    "padHoleRadiusPx": 6,
    "supplyRail": "v3v3"
  },
  "pam8403-3w-stereo-amplifier": {
    "manifestVersion": 1,
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
    },
    "revision": 1,
    "partTypes": [
      "PowerAmplifier"
    ],
    "categories": [
      "audio-power-amplifiers"
    ],
    "verification": "reviewed",
    "sources": [
      {
        "facts": [
          "dimensionsMm",
          "render",
          "label"
        ],
        "ref": "https://www.jaycar.com.au/arduino-compatible-2-x-3w-amplifier-module/p/XC4448"
      },
      {
        "facts": [
          "logicVoltage",
          "notes",
          "powerAmp"
        ],
        "ref": "https://d3mk240zzrnosz.cloudfront.net/assets/XC4448_datasheetMain_67860.pdf"
      },
      {
        "facts": [
          "logicVoltage",
          "notes"
        ],
        "ref": "https://www.diodes.com/part/view/PAM8403/"
      },
      {
        "facts": [
          "pinLabelsLeftToRight",
          "render"
        ],
        "ref": "https://media.jaycar.com.au/product/images/XC4448_arduino-compatible-2-x-3w-amplifier-module_60446.jpg"
      }
    ],
    "copy": {
      "summary": "2 x 3 W, 5 V — line level in",
      "wiringNote": "Takes line level, not I2S. Fed from a PCM5102A or UDA1334A, or on a classic ESP32 from its own DAC on GPIO25/26.",
      "optionLabel": "PAM8403",
      "optionOrder": 1
    },
    "pads": [
      {
        "label": "R+",
        "xPx": 36.6,
        "yPx": 254.3
      },
      {
        "label": "R-",
        "xPx": 69.4,
        "yPx": 254.3
      },
      {
        "label": "L-",
        "xPx": 102,
        "yPx": 254.3
      },
      {
        "label": "L+",
        "xPx": 134.6,
        "yPx": 254.3
      },
      {
        "label": "GND",
        "xPx": 167.4,
        "yPx": 254.3
      },
      {
        "label": "+5V",
        "xPx": 200.1,
        "yPx": 254.3
      },
      {
        "label": "SW",
        "xPx": 232.6,
        "yPx": 254.3
      },
      {
        "label": "GND",
        "xPx": 265.4,
        "yPx": 254.3
      },
      {
        "label": "LIN",
        "xPx": 298.1,
        "yPx": 254.3
      },
      {
        "label": "GND",
        "xPx": 330.7,
        "yPx": 254.3
      },
      {
        "label": "RIN",
        "xPx": 363.4,
        "yPx": 254.3
      }
    ],
    "padHoleRadiusPx": 5.6,
    "supplyRail": "v5",
    "powerAmp": {
      "device": "PAM8403",
      "supplyVolts": 5,
      "channels": 2,
      "inputKind": "line"
    }
  },
  "pam8610-stereo-amplifier": {
    "manifestVersion": 1,
    "partId": "pam8610-stereo-amplifier",
    "label": "PAM8610 2 x 15 W stereo amplifier",
    "category": "amplifier",
    "dimensionsMm": {
      "width": 30.0,
      "height": 25.0
    },
    "manufacturer": "generic",
    "logicVoltage": "7-15 V power; line-level analog input",
    "pinLabelsLeftToRight": [
      "L+",
      "L-",
      "+12V",
      "GND",
      "R-",
      "R+",
      "INL",
      "AGND",
      "INR",
      "MUTE"
    ],
    "notes": [
      "Compact filterless stereo class-D board, commonly sold as 2 x 15 W for 12 V systems.",
      "Speaker outputs are bridge-tied; no speaker terminal should be connected to ground."
    ],
    "render": {
      "file": "parts/pam8610-stereo-amplifier.webp",
      "widthPx": 400,
      "heightPx": 337,
      "pxPerMm": 12.667
    },
    "revision": 1,
    "partTypes": [
      "PowerAmplifier"
    ],
    "categories": [
      "audio-power-amplifiers"
    ],
    "verification": "reviewed",
    "sources": [
      {
        "facts": [
          "pinLabelsLeftToRight",
          "logicVoltage",
          "notes",
          "powerAmp"
        ],
        "ref": "https://www.diodes.com/assets/Datasheets/PAM8610.pdf"
      },
      {
        "facts": [
          "notes"
        ],
        "ref": "https://www.amazon.com/HiLetgo-PAM8610-Digital-Amplifier-Channel/dp/B00WSN9S4Q"
      }
    ],
    "copy": {
      "summary": "2 x 15 W, 12 V — line level in",
      "wiringNote": "Needs its own 7-15 V supply; the controller cannot power it. Share its ground with the board and the DAC.",
      "optionLabel": "PAM8610",
      "optionOrder": 2
    },
    "pads": [
      {
        "label": "L+",
        "xPx": 66.5,
        "yPx": 55.6
      },
      {
        "label": "L-",
        "xPx": 119.6,
        "yPx": 55.1
      },
      {
        "label": "+12V",
        "xPx": 172.7,
        "yPx": 55.6
      },
      {
        "label": "GND",
        "xPx": 226.5,
        "yPx": 55.2
      },
      {
        "label": "R-",
        "xPx": 279.2,
        "yPx": 55.2
      },
      {
        "label": "R+",
        "xPx": 332.7,
        "yPx": 55.1
      },
      {
        "label": "INL",
        "xPx": 146.2,
        "yPx": 304.5
      },
      {
        "label": "AGND",
        "xPx": 182,
        "yPx": 304.5
      },
      {
        "label": "INR",
        "xPx": 217.3,
        "yPx": 304.6
      },
      {
        "label": "MUTE",
        "xPx": 252.7,
        "yPx": 304.6
      }
    ],
    "padHoleRadiusPx": 4.9,
    "supplyRail": "v12",
    "powerAmp": {
      "device": "PAM8610",
      "supplyVolts": 12,
      "channels": 2,
      "inputKind": "line"
    }
  },
  "pcm1802-line-in-adc": {
    "manifestVersion": 1,
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
    },
    "revision": 1,
    "partTypes": [
      "LineInput"
    ],
    "categories": [
      "audio-line-in"
    ],
    "verification": "reviewed",
    "sources": [
      {
        "facts": [
          "logicVoltage"
        ],
        "ref": "https://www.ti.com/product/PCM1802"
      },
      {
        "facts": [
          "pinLabelsLeftToRight"
        ],
        "ref": "https://www.ti.com/lit/gpn/PCM1802"
      },
      {
        "facts": [
          "notes",
          "lineInput"
        ],
        "ref": "https://www.ti.com/lit/ug/sbau384/sbau384.pdf"
      }
    ],
    "copy": {
      "summary": "Stereo RCA line in to I2S",
      "wiringNote": "Connect a player module's line-level DAC output, not its bridge-tied speaker output, to the RCA inputs.",
      "optionLabel": "PCM1802 line-in ADC",
      "optionOrder": 1
    },
    "pads": [
      {
        "label": "5V",
        "xPx": 239.3,
        "yPx": 444.1
      },
      {
        "label": "GND",
        "xPx": 269.8,
        "yPx": 444.1
      },
      {
        "label": "SCK",
        "xPx": 300.2,
        "yPx": 444.1
      },
      {
        "label": "BCK",
        "xPx": 330.8,
        "yPx": 444.1
      },
      {
        "label": "LRCK",
        "xPx": 361.2,
        "yPx": 444.1
      },
      {
        "label": "DOUT",
        "xPx": 391.7,
        "yPx": 444.1
      }
    ],
    "padHoleRadiusPx": 5.7,
    "supplyRail": "v5",
    "lineInput": {
      "device": "PCM1802",
      "channels": 2
    }
  },
  "pcm5102a-i2s-dac": {
    "manifestVersion": 1,
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
    },
    "revision": 1,
    "partTypes": [
      "Amplifier"
    ],
    "categories": [
      "audio-amplifiers"
    ],
    "verification": "reviewed",
    "sources": [
      {
        "facts": [
          "pinLabelsLeftToRight",
          "render"
        ],
        "ref": "https://probots.co.in/pcm5102a-dac-decode-i2s-audio-player-module.html"
      },
      {
        "facts": [
          "label"
        ],
        "ref": "https://www.ti.com/lit/ds/symlink/pcm5102a.pdf"
      },
      {
        "facts": [
          "pinLabelsLeftToRight",
          "notes",
          "i2sAudio"
        ],
        "ref": "https://manuals.plus/ae/1005006953481088"
      }
    ],
    "copy": {
      "summary": "I2S DAC — line out, needs an amp",
      "wiringNote": "A DAC, not an amplifier — the same three I2S wires, but a line-level output that needs a powered speaker or a power amplifier.",
      "optionLabel": "PCM5102A",
      "optionOrder": 3
    },
    "pads": [
      {
        "label": "SCK",
        "xPx": 55,
        "yPx": 837
      },
      {
        "label": "BCK",
        "xPx": 113,
        "yPx": 837
      },
      {
        "label": "DIN",
        "xPx": 171,
        "yPx": 837
      },
      {
        "label": "LCK",
        "xPx": 229,
        "yPx": 837
      },
      {
        "label": "GND",
        "xPx": 287,
        "yPx": 837
      },
      {
        "label": "VIN",
        "xPx": 345,
        "yPx": 837
      }
    ],
    "padHoleRadiusPx": 11.5,
    "supplyRail": "v5",
    "i2sAudio": {
      "device": "PCM5102A",
      "output": "line"
    }
  },
  "photosensitive-ldr-module": {
    "manifestVersion": 1,
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
    },
    "revision": 1,
    "partTypes": [
      "LightInput"
    ],
    "categories": [
      "light-sensors"
    ],
    "verification": "bench",
    "sources": [
      {
        "facts": [
          "pinLabelsLeftToRight",
          "logicVoltage"
        ],
        "ref": "https://docs.keyestudio.com/projects/KS0576/en/latest/docs/2.KidsBlock/KidsBlock.html#photoresistor"
      },
      {
        "facts": [
          "logicVoltage"
        ],
        "ref": "https://docs.keyestudio.com/projects/KS0597/en/latest/docs/4.Arduino%20Projects/4.3%20Projects/Project%201.html#photoresistor-module"
      }
    ],
    "copy": {
      "summary": "Relative brightness on one analog pin",
      "wiringNote": "An analog divider: Level is relative brightness. It cannot report calibrated lux, so Lux stays at zero.",
      "optionLabel": "LDR light sensor",
      "optionOrder": 1
    },
    "pads": [
      {
        "label": "S",
        "xPx": 172.8,
        "yPx": 281.8
      },
      {
        "label": "VCC",
        "xPx": 203.4,
        "yPx": 281.8
      },
      {
        "label": "GND",
        "xPx": 234,
        "yPx": 281.8
      }
    ],
    "padHoleRadiusPx": 5.6,
    "supplyRail": "v3v3"
  },
  "rcnun-60a-5v-buck-converter": {
    "manifestVersion": 1,
    "partId": "rcnun-60a-5v-buck-converter",
    "label": "RCNUN 12/24 V to 5 V 60 A buck converter",
    "category": "power-conversion",
    "dimensionsMm": {
      "width": 100.0,
      "height": 80.0
    },
    "manufacturer": "RCNUN",
    "logicVoltage": "none; power only",
    "pinLabelsLeftToRight": [
      "IN+",
      "IN-",
      "OUT+",
      "OUT-"
    ],
    "notes": [
      "60 A is the selected seller variant and remains an HW-14 continuous-load verification item."
    ],
    "powerConverter": {
      "role": "led-rail",
      "topology": "buck (non-isolated, common negative)",
      "inputMinV": 9,
      "inputMaxV": 36,
      "minHeadroomV": 1.5,
      "outputSetV": 5,
      "continuousCurrentMa": 60000,
      "peakCurrentMa": 60000,
      "typicalEfficiency": 0.95,
      "isolated": false,
      "adjustable": false,
      "outputCurrentLimit": "none",
      "terminals": [
        "IN+",
        "IN-",
        "OUT+",
        "OUT-"
      ],
      "terminalPositions": [
        [
          0.325,
          0.985
        ],
        [
          0.442,
          0.985
        ],
        [
          0.563,
          0.985
        ],
        [
          0.679,
          0.985
        ]
      ]
    },
    "render": {
      "file": "parts/rcnun-60a-5v-buck-converter.webp",
      "widthPx": 1200,
      "heightPx": 964,
      "pxPerMm": 11.8
    },
    "revision": 1,
    "partTypes": [
      "PowerConverter"
    ],
    "categories": [
      "power-buck"
    ],
    "verification": "reviewed",
    "sources": [
      {
        "facts": [
          "pinLabelsLeftToRight",
          "render",
          "powerConverter"
        ],
        "ref": "https://www.aliexpress.com/item/4000302403286.html"
      }
    ],
    "copy": {
      "summary": "LED rail ·9-36 V in, 5 V 60 A at 40 °C"
    }
  },
  "rcwl-0516-microwave-motion-module": {
    "manifestVersion": 1,
    "partId": "rcwl-0516-microwave-motion-module",
    "label": "RCWL-0516 microwave motion sensor",
    "category": "input-control",
    "dimensionsMm": {
      "width": 36.0,
      "height": 17.0
    },
    "manufacturer": "RCWL-0516 microwave radar module (generic)",
    "logicVoltage": "4-28 V supply on VIN; OUT is 3.3 V logic, high while it senses movement; the 3V3 pin is a regulated output for other parts",
    "pinLabelsLeftToRight": [
      "3V3",
      "GND",
      "OUT",
      "VIN",
      "CDS"
    ],
    "notes": [
      "A 3.2 GHz Doppler radar switch. OUT goes high, at 3.3 V, while it senses movement, and stays high for about two seconds after the last movement, so it re-triggers rather than pulsing.",
      "Power VIN from 5 V. The module accepts 4 to 28 V, and its on-board regulator makes OUT a 3.3 V signal that is safe for an ESP32 pin. Do not power VIN from the 3V3 pin: that pin is an output.",
      "It senses through plastic, glass and thin walls at roughly 5 to 7 m in every direction, so it also trips on a moving object behind it. Keep more than 1 cm of clear space behind the board and away from metal.",
      "3V3 is a regulated output of about 100 mA and CDS disables the sensor when pulled low (or by a light-dependent resistor). Neither is needed to read motion.",
      "The five-pin row ships loose and is rendered as unpopulated plated holes."
    ],
    "render": {
      "file": "parts/rcwl-0516-microwave-motion-module.webp",
      "widthPx": 452,
      "heightPx": 224,
      "pxPerMm": 12.0
    },
    "revision": 1,
    "partTypes": [
      "MotionInput"
    ],
    "categories": [
      "motion-radar"
    ],
    "verification": "reviewed",
    "sources": [
      {
        "facts": [
          "pinLabelsLeftToRight",
          "logicVoltage",
          "notes"
        ],
        "ref": "https://components101.com/sensors/rcwl0516-microwave-diatance-sensor-module-datasheet-pinout-features-working"
      },
      {
        "facts": [
          "pinLabelsLeftToRight",
          "logicVoltage",
          "notes"
        ],
        "ref": "https://github.com/jdesbonnet/RCWL-0516"
      }
    ],
    "copy": {
      "summary": "Radar: senses movement through plastic",
      "wiringNote": "Power VIN from 5 V (4 to 28 V). OUT is 3.3 V logic and stays high about two seconds after the last movement. Leave 3V3 and CDS unwired.",
      "optionLabel": "RCWL-0516 microwave",
      "optionOrder": 2
    },
    "pads": [
      {
        "label": "3V3",
        "xPx": 273,
        "yPx": 187.6
      },
      {
        "label": "GND",
        "xPx": 303.5,
        "yPx": 187.6
      },
      {
        "label": "OUT",
        "xPx": 334,
        "yPx": 187.6
      },
      {
        "label": "VIN",
        "xPx": 364.5,
        "yPx": 187.6
      },
      {
        "label": "CDS",
        "xPx": 395,
        "yPx": 187.6
      }
    ],
    "padHoleRadiusPx": 6,
    "supplyRail": "v5",
    "powerPadLabel": "VIN",
    "motionSensor": {
      "activeLevel": "high",
      "holdSeconds": 2,
      "supplyVolts": 5
    }
  },
  "relay-module-1ch-5v": {
    "manifestVersion": 1,
    "partId": "relay-module-1ch-5v",
    "label": "1-channel 5 V relay module",
    "category": "switching-power",
    "dimensionsMm": {
      "width": 50.0,
      "height": 26.0
    },
    "manufacturer": "generic / Songle SRD-05VDC-SL-C class",
    "logicVoltage": "5 V coil; 3.3-5 V active-low logic",
    "pinLabelsLeftToRight": [
      "GND",
      "IN1",
      "VCC"
    ],
    "notes": [
      "1-channel generic 5 V opto-isolated relay board with active-low inputs and one SPDT NO/COM/NC terminal group per channel.",
      "The external logic connection footprint is shown as unpopulated plated through-holes; solder only the connector style required by the installation.",
      "This single-channel board layout has no separate JD-VCC configuration jumper block.",
      "Relay contact ratings are for resistive loads. Motors, transformers and LED power supplies need derating and suitable suppression.",
      "Mains voltage can kill. Keep hazardous wiring enclosed, fused, strain-relieved and physically separated from the controller-side wiring; use a qualified electrician where required.",
      "Low-cost supplier revisions can change pin order, trigger polarity, terminal order and isolation details. Follow the silkscreen and schematic of the exact board in hand."
    ],
    "relay": {
      "channels": 1,
      "coilVoltage": "5 V DC",
      "trigger": "active-low",
      "contacts": "SPDT (NO/COM/NC)",
      "contactRating": "10 A at 250 VAC or 30 V DC per relay (resistive load)",
      "optoIsolated": true,
      "loadKind": "ac-dc",
      "leakage": "none: open metal contact",
      "isolation": "opto-isolated coil; dry contacts are galvanically open when off"
    },
    "render": {
      "file": "parts/relay-module-1ch-5v.webp",
      "widthPx": 620,
      "heightPx": 332,
      "pxPerMm": 12.0,
      "indicators": [
        {
          "rectPx": [
            553.8,
            88.7,
            16.4,
            10.6
          ],
          "color": [
            26,
            255,
            51
          ],
          "drive": "power"
        },
        {
          "rectPx": [
            477.0,
            182.3,
            16.4,
            10.6
          ],
          "color": [
            255,
            32,
            24
          ],
          "drive": "channel",
          "channel": 1
        }
      ]
    },
    "revision": 1,
    "partTypes": [
      "RelayOutput"
    ],
    "categories": [
      "switching-relays"
    ],
    "verification": "reviewed",
    "sources": [
      {
        "facts": [
          "pinLabelsLeftToRight",
          "label"
        ],
        "ref": "https://shillehtek.com/blogs/shillehtek-product-manuals/1-channel-5v-relay-module-manual"
      },
      {
        "facts": [
          "logicVoltage",
          "relay"
        ],
        "ref": "https://www.songlerelay.com/Public/Uploads/20161104/581c81ac16e68.pdf"
      },
      {
        "facts": [
          "pinLabelsLeftToRight",
          "logicVoltage",
          "render",
          "relay"
        ],
        "ref": "https://arduinomodules.info/download/2-channel-relay-module-datasheet/"
      },
      {
        "facts": [
          "pinLabelsLeftToRight",
          "logicVoltage",
          "relay"
        ],
        "ref": "https://arduinomodules.info/download/4-channel-relay-module-datasheet/"
      },
      {
        "facts": [
          "dimensionsMm",
          "logicVoltage"
        ],
        "ref": "https://forum.arduino.cc/uploads/short-url/f52UGMMTL7XrrUh3XflevnF7MJk.pdf"
      }
    ],
    "copy": {
      "summary": "One active-low 5 V SPDT relay",
      "optionLabel": "1-channel relay",
      "optionOrder": 1
    },
    "pads": [
      {
        "label": "GND",
        "xPx": 279.1,
        "yPx": 302.8
      },
      {
        "label": "IN1",
        "xPx": 309.5,
        "yPx": 302.8
      },
      {
        "label": "VCC",
        "xPx": 339.9,
        "yPx": 302.8
      }
    ],
    "padHoleRadiusPx": 4.9,
    "supplyRail": "v5"
  },
  "relay-module-2ch-5v": {
    "manifestVersion": 1,
    "partId": "relay-module-2ch-5v",
    "label": "2-channel 5 V relay module",
    "category": "switching-power",
    "dimensionsMm": {
      "width": 50.0,
      "height": 41.0
    },
    "manufacturer": "generic / Songle SRD-05VDC-SL-C class",
    "logicVoltage": "5 V coil; 3.3-5 V active-low logic",
    "pinLabelsLeftToRight": [
      "GND",
      "IN1",
      "IN2",
      "VCC"
    ],
    "notes": [
      "2-channel generic 5 V opto-isolated relay board with active-low inputs and one SPDT NO/COM/NC terminal group per channel.",
      "The external logic connection footprint is shown as unpopulated plated through-holes; solder only the connector style required by the installation.",
      "The onboard JD-VCC configuration block retains its fitted three-pin header and jumper cap. The fitted JD-VCC jumper joins the coil supply to VCC; pull it to power the coils from a separate supply, and follow the markings on the owned board.",
      "Relay contact ratings are for resistive loads. Motors, transformers and LED power supplies need derating and suitable suppression.",
      "Mains voltage can kill. Keep hazardous wiring enclosed, fused, strain-relieved and physically separated from the controller-side wiring; use a qualified electrician where required.",
      "Low-cost supplier revisions can change pin order, trigger polarity, terminal order and isolation details. Follow the silkscreen and schematic of the exact board in hand."
    ],
    "relay": {
      "channels": 2,
      "coilVoltage": "5 V DC",
      "trigger": "active-low",
      "contacts": "SPDT (NO/COM/NC)",
      "contactRating": "10 A at 250 VAC or 30 V DC per relay (resistive load)",
      "optoIsolated": true,
      "loadKind": "ac-dc",
      "leakage": "none: open metal contact",
      "isolation": "opto-isolated coil; dry contacts are galvanically open when off"
    },
    "render": {
      "file": "parts/relay-module-2ch-5v.webp",
      "widthPx": 620,
      "heightPx": 512,
      "pxPerMm": 12.0,
      "indicators": [
        {
          "rectPx": [
            523.8,
            421.7,
            16.4,
            10.6
          ],
          "color": [
            26,
            255,
            51
          ],
          "drive": "power"
        },
        {
          "rectPx": [
            162.0,
            349.1,
            16.4,
            10.6
          ],
          "color": [
            255,
            32,
            24
          ],
          "drive": "channel",
          "channel": 1
        },
        {
          "rectPx": [
            360.0,
            349.1,
            16.4,
            10.6
          ],
          "color": [
            255,
            32,
            24
          ],
          "drive": "channel",
          "channel": 2
        }
      ]
    },
    "revision": 1,
    "partTypes": [
      "RelayOutput"
    ],
    "categories": [
      "switching-relays"
    ],
    "verification": "reviewed",
    "sources": [
      {
        "facts": [
          "logicVoltage",
          "relay"
        ],
        "ref": "https://www.songlerelay.com/Public/Uploads/20161104/581c81ac16e68.pdf"
      },
      {
        "facts": [
          "pinLabelsLeftToRight",
          "logicVoltage",
          "render",
          "relay"
        ],
        "ref": "https://arduinomodules.info/download/2-channel-relay-module-datasheet/"
      },
      {
        "facts": [
          "pinLabelsLeftToRight",
          "logicVoltage",
          "relay"
        ],
        "ref": "https://arduinomodules.info/download/4-channel-relay-module-datasheet/"
      },
      {
        "facts": [
          "dimensionsMm",
          "logicVoltage"
        ],
        "ref": "https://forum.arduino.cc/uploads/short-url/f52UGMMTL7XrrUh3XflevnF7MJk.pdf"
      }
    ],
    "copy": {
      "summary": "Two active-low 5 V SPDT relays",
      "optionLabel": "2-channel relay",
      "optionOrder": 2
    },
    "pads": [
      {
        "label": "GND",
        "xPx": 263.7,
        "yPx": 482.9
      },
      {
        "label": "IN1",
        "xPx": 294.4,
        "yPx": 482.9
      },
      {
        "label": "IN2",
        "xPx": 324.7,
        "yPx": 482.9
      },
      {
        "label": "VCC",
        "xPx": 355.3,
        "yPx": 482.9
      }
    ],
    "padHoleRadiusPx": 4.9,
    "supplyRail": "v5"
  },
  "relay-module-4ch-5v": {
    "manifestVersion": 1,
    "partId": "relay-module-4ch-5v",
    "label": "4-channel 5 V relay module",
    "category": "switching-power",
    "dimensionsMm": {
      "width": 76.0,
      "height": 55.0
    },
    "manufacturer": "generic / Songle SRD-05VDC-SL-C class",
    "logicVoltage": "5 V coil; 3.3-5 V active-low logic",
    "pinLabelsLeftToRight": [
      "GND",
      "IN1",
      "IN2",
      "IN3",
      "IN4",
      "VCC"
    ],
    "notes": [
      "4-channel generic 5 V opto-isolated relay board with active-low inputs and one SPDT NO/COM/NC terminal group per channel.",
      "The external logic connection footprint is shown as unpopulated plated through-holes; solder only the connector style required by the installation.",
      "The onboard JD-VCC configuration block retains its fitted three-pin header and jumper cap. The fitted JD-VCC jumper joins the coil supply to VCC; pull it to power the coils from a separate supply, and follow the markings on the owned board.",
      "Relay contact ratings are for resistive loads. Motors, transformers and LED power supplies need derating and suitable suppression.",
      "Mains voltage can kill. Keep hazardous wiring enclosed, fused, strain-relieved and physically separated from the controller-side wiring; use a qualified electrician where required.",
      "Low-cost supplier revisions can change pin order, trigger polarity, terminal order and isolation details. Follow the silkscreen and schematic of the exact board in hand."
    ],
    "relay": {
      "channels": 4,
      "coilVoltage": "5 V DC",
      "trigger": "active-low",
      "contacts": "SPDT (NO/COM/NC)",
      "contactRating": "10 A at 250 VAC or 30 V DC per relay (resistive load)",
      "optoIsolated": true,
      "loadKind": "ac-dc",
      "leakage": "none: open metal contact",
      "isolation": "opto-isolated coil; dry contacts are galvanically open when off"
    },
    "render": {
      "file": "parts/relay-module-4ch-5v.webp",
      "widthPx": 932,
      "heightPx": 680,
      "pxPerMm": 12.0,
      "indicators": [
        {
          "rectPx": [
            835.8,
            589.7,
            16.4,
            10.6
          ],
          "color": [
            26,
            255,
            51
          ],
          "drive": "power"
        },
        {
          "rectPx": [
            120.0,
            454.7,
            16.4,
            10.6
          ],
          "color": [
            255,
            32,
            24
          ],
          "drive": "channel",
          "channel": 1
        },
        {
          "rectPx": [
            318.0,
            454.7,
            16.4,
            10.6
          ],
          "color": [
            255,
            32,
            24
          ],
          "drive": "channel",
          "channel": 2
        },
        {
          "rectPx": [
            516.0,
            454.7,
            16.4,
            10.6
          ],
          "color": [
            255,
            32,
            24
          ],
          "drive": "channel",
          "channel": 3
        },
        {
          "rectPx": [
            714.0,
            454.7,
            16.4,
            10.6
          ],
          "color": [
            255,
            32,
            24
          ],
          "drive": "channel",
          "channel": 4
        }
      ]
    },
    "revision": 1,
    "partTypes": [
      "RelayOutput"
    ],
    "categories": [
      "switching-relays"
    ],
    "verification": "reviewed",
    "sources": [
      {
        "facts": [
          "logicVoltage",
          "relay"
        ],
        "ref": "https://www.songlerelay.com/Public/Uploads/20161104/581c81ac16e68.pdf"
      },
      {
        "facts": [
          "pinLabelsLeftToRight",
          "logicVoltage",
          "render",
          "relay"
        ],
        "ref": "https://arduinomodules.info/download/2-channel-relay-module-datasheet/"
      },
      {
        "facts": [
          "pinLabelsLeftToRight",
          "logicVoltage",
          "relay"
        ],
        "ref": "https://arduinomodules.info/download/4-channel-relay-module-datasheet/"
      },
      {
        "facts": [
          "dimensionsMm",
          "logicVoltage"
        ],
        "ref": "https://forum.arduino.cc/uploads/short-url/f52UGMMTL7XrrUh3XflevnF7MJk.pdf"
      }
    ],
    "copy": {
      "summary": "Four active-low 5 V SPDT relays",
      "optionLabel": "4-channel relay",
      "optionOrder": 3
    },
    "pads": [
      {
        "label": "GND",
        "xPx": 389.4,
        "yPx": 650.9
      },
      {
        "label": "IN1",
        "xPx": 419.7,
        "yPx": 650.9
      },
      {
        "label": "IN2",
        "xPx": 450.4,
        "yPx": 650.9
      },
      {
        "label": "IN3",
        "xPx": 480.6,
        "yPx": 650.9
      },
      {
        "label": "IN4",
        "xPx": 511.4,
        "yPx": 650.9
      },
      {
        "label": "VCC",
        "xPx": 541.6,
        "yPx": 650.9
      }
    ],
    "padHoleRadiusPx": 5,
    "supplyRail": "v5"
  },
  "relay-module-8ch-5v": {
    "manifestVersion": 1,
    "partId": "relay-module-8ch-5v",
    "label": "8-channel 5 V relay module",
    "category": "switching-power",
    "dimensionsMm": {
      "width": 137.0,
      "height": 56.0
    },
    "manufacturer": "generic / Songle SRD-05VDC-SL-C class",
    "logicVoltage": "5 V coil; 3.3-5 V active-low logic",
    "pinLabelsLeftToRight": [
      "GND",
      "IN1",
      "IN2",
      "IN3",
      "IN4",
      "IN5",
      "IN6",
      "IN7",
      "IN8",
      "VCC"
    ],
    "notes": [
      "8-channel generic 5 V opto-isolated relay board with active-low inputs and one SPDT NO/COM/NC terminal group per channel.",
      "The external logic connection footprint is shown as unpopulated plated through-holes; solder only the connector style required by the installation.",
      "The onboard JD-VCC configuration block retains its fitted three-pin header and jumper cap. The fitted JD-VCC jumper joins the coil supply to VCC; pull it to power the coils from a separate supply, and follow the markings on the owned board.",
      "Relay contact ratings are for resistive loads. Motors, transformers and LED power supplies need derating and suitable suppression.",
      "Mains voltage can kill. Keep hazardous wiring enclosed, fused, strain-relieved and physically separated from the controller-side wiring; use a qualified electrician where required.",
      "Low-cost supplier revisions can change pin order, trigger polarity, terminal order and isolation details. Follow the silkscreen and schematic of the exact board in hand."
    ],
    "relay": {
      "channels": 8,
      "coilVoltage": "5 V DC",
      "trigger": "active-low",
      "contacts": "SPDT (NO/COM/NC)",
      "contactRating": "10 A at 250 VAC or 30 V DC per relay (resistive load)",
      "optoIsolated": true,
      "loadKind": "ac-dc",
      "leakage": "none: open metal contact",
      "isolation": "opto-isolated coil; dry contacts are galvanically open when off"
    },
    "render": {
      "file": "parts/relay-module-8ch-5v.webp",
      "widthPx": 1200,
      "heightPx": 502,
      "pxPerMm": 8.613,
      "indicators": [
        {
          "rectPx": [
            1128.1,
            434.5,
            11.8,
            7.6
          ],
          "color": [
            26,
            255,
            51
          ],
          "drive": "power"
        },
        {
          "rectPx": [
            78.7,
            333.3,
            11.8,
            7.6
          ],
          "color": [
            255,
            32,
            24
          ],
          "drive": "channel",
          "channel": 1
        },
        {
          "rectPx": [
            217.6,
            333.3,
            11.8,
            7.6
          ],
          "color": [
            255,
            32,
            24
          ],
          "drive": "channel",
          "channel": 2
        },
        {
          "rectPx": [
            356.5,
            333.3,
            11.8,
            7.6
          ],
          "color": [
            255,
            32,
            24
          ],
          "drive": "channel",
          "channel": 3
        },
        {
          "rectPx": [
            495.4,
            333.3,
            11.8,
            7.6
          ],
          "color": [
            255,
            32,
            24
          ],
          "drive": "channel",
          "channel": 4
        },
        {
          "rectPx": [
            634.3,
            333.3,
            11.8,
            7.6
          ],
          "color": [
            255,
            32,
            24
          ],
          "drive": "channel",
          "channel": 5
        },
        {
          "rectPx": [
            773.1,
            333.3,
            11.8,
            7.6
          ],
          "color": [
            255,
            32,
            24
          ],
          "drive": "channel",
          "channel": 6
        },
        {
          "rectPx": [
            912.0,
            333.3,
            11.8,
            7.6
          ],
          "color": [
            255,
            32,
            24
          ],
          "drive": "channel",
          "channel": 7
        },
        {
          "rectPx": [
            1050.9,
            333.3,
            11.8,
            7.6
          ],
          "color": [
            255,
            32,
            24
          ],
          "drive": "channel",
          "channel": 8
        }
      ]
    },
    "revision": 1,
    "partTypes": [
      "RelayOutput"
    ],
    "categories": [
      "switching-relays"
    ],
    "verification": "reviewed",
    "sources": [
      {
        "facts": [
          "logicVoltage",
          "relay"
        ],
        "ref": "https://www.songlerelay.com/Public/Uploads/20161104/581c81ac16e68.pdf"
      },
      {
        "facts": [
          "pinLabelsLeftToRight",
          "logicVoltage",
          "render",
          "relay"
        ],
        "ref": "https://arduinomodules.info/download/2-channel-relay-module-datasheet/"
      },
      {
        "facts": [
          "pinLabelsLeftToRight",
          "logicVoltage",
          "relay"
        ],
        "ref": "https://arduinomodules.info/download/4-channel-relay-module-datasheet/"
      },
      {
        "facts": [
          "dimensionsMm",
          "logicVoltage"
        ],
        "ref": "https://forum.arduino.cc/uploads/short-url/f52UGMMTL7XrrUh3XflevnF7MJk.pdf"
      }
    ],
    "copy": {
      "summary": "Eight active-low 5 V SPDT relays",
      "optionLabel": "8-channel relay",
      "optionOrder": 4
    },
    "pads": [
      {
        "label": "GND",
        "xPx": 501.1,
        "yPx": 478.3
      },
      {
        "label": "IN1",
        "xPx": 522.9,
        "yPx": 478.3
      },
      {
        "label": "IN2",
        "xPx": 544.9,
        "yPx": 478.3
      },
      {
        "label": "IN3",
        "xPx": 566.8,
        "yPx": 478.3
      },
      {
        "label": "IN4",
        "xPx": 588.6,
        "yPx": 478.3
      },
      {
        "label": "IN5",
        "xPx": 610.3,
        "yPx": 478.3
      },
      {
        "label": "IN6",
        "xPx": 632.2,
        "yPx": 478.3
      },
      {
        "label": "IN7",
        "xPx": 654.2,
        "yPx": 478.3
      },
      {
        "label": "IN8",
        "xPx": 676.1,
        "yPx": 478.3
      },
      {
        "label": "VCC",
        "xPx": 697.9,
        "yPx": 478.3
      }
    ],
    "padHoleRadiusPx": 3.4,
    "supplyRail": "v5"
  },
  "samsung-inr18650-35e": {
    "manifestVersion": 1,
    "partId": "samsung-inr18650-35e",
    "label": "Samsung INR18650-35E Li-ion cell",
    "category": "battery",
    "dimensionsMm": {
      "width": 65.3,
      "height": 18.5
    },
    "manufacturer": "Samsung SDI",
    "logicVoltage": "none; power only",
    "pinLabelsLeftToRight": [
      "positive cap",
      "negative can"
    ],
    "notes": [
      "Use only genuine, matched cells from one batch. Do not mix age, capacity or state of charge.",
      "The 8 A discharge rating and 2 A charge ceiling are cell limits, not recommended normal operating currents."
    ],
    "batteryCell": {
      "chemistry": "li-ion",
      "formFactor": "18650",
      "nominalV": 3.6,
      "chargeV": 4.2,
      "dischargeCutoffV": 2.65,
      "capacityMah": 3350,
      "maxContinuousDischargeMa": 8000,
      "maxChargeMa": 2000,
      "internalResistanceMohm": 35,
      "internalResistanceBasis": "ac-1khz",
      "chargeTempC": [
        0,
        45
      ],
      "dischargeTempC": [
        -20,
        60
      ]
    },
    "render": {
      "file": "parts/samsung-inr18650-35e.webp",
      "widthPx": 804,
      "heightPx": 242,
      "pxPerMm": 12.006
    },
    "revision": 1,
    "partTypes": [
      "BatteryPack"
    ],
    "categories": [
      "battery-cells"
    ],
    "verification": "reviewed",
    "sources": [
      {
        "facts": [
          "dimensionsMm",
          "logicVoltage",
          "batteryCell"
        ],
        "ref": "https://www.batteryspace.com/prod-specs/13103-inr18650-35e.pdf"
      }
    ],
    "copy": {
      "summary": "18650 li-ion · 3.6 V, 3350 mAh, 8 A continuous"
    }
  },
  "seeed-grove-2ch-ssr": {
    "manifestVersion": 1,
    "partId": "seeed-grove-2ch-ssr",
    "label": "Seeed Grove 2-Channel Solid State Relay",
    "category": "switching-power",
    "dimensionsMm": {
      "width": 40.0,
      "height": 40.0
    },
    "manufacturer": "Seeed Studio Grove - 2-Channel Solid State Relay / Omron G3MC-202P",
    "logicVoltage": "5 V module supply (4 to 6 V); 3.3 V or 5 V active-high GPIO",
    "pinLabelsLeftToRight": [
      "GND",
      "VCC",
      "CTR2",
      "CTR1"
    ],
    "notes": [
      "AC-only phototriac, not a dry contact. Each channel switches 0.1 to 2 A at 75 to 264 VAC and turns on at the next voltage zero. A DC load latches on and will not turn off.",
      "The output leaks up to 1.5 mA at 200 VAC, enough to glow a small lamp while off. Isolation is 2,500 VAC for one minute between input and output, and the output is still a phototriac, not an open contact. Supply VCC with 5 V (4 to 6 V). A 3.3 V GPIO can drive CTR because a transistor switches that 5 V input. Do not dim it: it turns on at the next voltage zero and off at the next current zero.",
      "On-state voltage drop is 1.6 V RMS max. Derate above 25 C: 2 A at 25 C, toward 0.5 A at 80 C.",
      "Mains voltage can kill. Keep the load wiring enclosed, fused and separated from the Grove cable. This module does not switch DC.",
      "Seeed Grove 2-Channel Solid State Relay wiki (product p-3129) and the Omron G3MC datasheet, device G3MC-202P."
    ],
    "relay": {
      "channels": 2,
      "coilVoltage": "5 V DC input (4 to 6 V); not a coil",
      "trigger": "active-high",
      "contacts": "phototriac, AC only, not a dry contact",
      "contactRating": "0.1 to 2 A at 75 to 264 VAC; a DC load latches on",
      "optoIsolated": true,
      "loadKind": "ac",
      "leakage": "1.5 mA max at 200 VAC",
      "isolation": "2,500 VAC for 1 minute between input and output; the output is a phototriac, not a dry contact",
      "zeroCross": true,
      "minimumLoad": "0.1 A",
      "channelInputLabels": [
        "CTR1",
        "CTR2"
      ]
    },
    "render": {
      "file": "parts/seeed-grove-2ch-ssr.webp",
      "widthPx": 592,
      "heightPx": 592,
      "pxPerMm": 12.0,
      "indicators": [
        {
          "rectPx": [
            458.6,
            471.0,
            16.2,
            9.6
          ],
          "color": [
            255,
            32,
            24
          ],
          "drive": "channel",
          "channel": 1
        },
        {
          "rectPx": [
            200.3,
            471.0,
            16.2,
            9.6
          ],
          "color": [
            255,
            32,
            24
          ],
          "drive": "channel",
          "channel": 2
        }
      ]
    },
    "revision": 1,
    "partTypes": [
      "RelayOutput"
    ],
    "categories": [
      "switching-ssr"
    ],
    "verification": "reviewed",
    "sources": [
      {
        "facts": [
          "dimensionsMm",
          "pinLabelsLeftToRight",
          "logicVoltage",
          "relay"
        ],
        "ref": "https://wiki.seeedstudio.com/Grove-2-Channel_Solid_State_Relay/"
      },
      {
        "facts": [
          "dimensionsMm",
          "logicVoltage",
          "relay"
        ],
        "ref": "https://files.seeedstudio.com/wiki/Grove-Solid_State_Relay_V2/res/G3MC202p.pdf"
      },
      {
        "facts": [
          "dimensionsMm",
          "pinLabelsLeftToRight",
          "logicVoltage",
          "relay"
        ],
        "ref": "https://files.seeedstudio.com/wiki/Grove-2-Channel_Solid_State_Relay/res/Grove-2-Channel_Solid_State_Relay.zip"
      }
    ],
    "copy": {
      "summary": "Two AC phototriacs, 0.1-2 A, leak 1.5 mA off",
      "wiringNote": "Wire CTR1 and CTR2 to GPIOs and VCC to 5 V. The screw terminals switch the AC load and are not logic pins.",
      "optionLabel": "Seeed Grove 2-channel SSR",
      "optionOrder": 5
    },
    "pads": [
      {
        "label": "GND",
        "xPx": 261.5,
        "yPx": 578
      },
      {
        "label": "VCC",
        "xPx": 285.5,
        "yPx": 578
      },
      {
        "label": "CTR2",
        "xPx": 309.5,
        "yPx": 578
      },
      {
        "label": "CTR1",
        "xPx": 333.5,
        "yPx": 578
      }
    ],
    "padHoleRadiusPx": 6,
    "supplyRail": "v5"
  },
  "seeed-grove-touch-sensor": {
    "manifestVersion": 1,
    "partId": "seeed-grove-touch-sensor",
    "label": "Seeed Studio Grove Touch Sensor",
    "category": "input-control",
    "dimensionsMm": {
      "width": 24.0,
      "height": 20.0
    },
    "manufacturer": "Seeed Studio (SKU 101020037) / TTP223-BA6",
    "logicVoltage": "2.0-5.5 V supply; active-high CMOS digital output",
    "pinLabelsLeftToRight": [
      "SIG",
      "NC",
      "VCC",
      "GND"
    ],
    "notes": [
      "Outputs HIGH while a finger touches or approaches the round electrode, and LOW when released; the board is configured for momentary, active-high operation.",
      "Power from the controller's 3.3 V rail so the CMOS SIG output is natively safe for an ESP GPIO. The TTP223-BA6 itself accepts 2.0-5.5 V.",
      "Use SIG as the one digital input. NC is not connected. The fitted Grove cable carries SIG, NC, VCC and GND in that order.",
      "The sensor auto-calibrates after power-up. Keep fingers and conductive objects away from the electrode while the board settles."
    ],
    "touchSensor": {
      "device": "TTP223-BA6",
      "interface": "digital",
      "activeLevel": "high",
      "mode": "momentary",
      "supplyMinV": 2.0,
      "supplyMaxV": 5.5,
      "responseMinMs": 60,
      "responseMaxMs": 220
    },
    "render": {
      "file": "parts/seeed-grove-touch-sensor.webp",
      "widthPx": 400,
      "heightPx": 337,
      "pxPerMm": 15.833
    },
    "revision": 1,
    "partTypes": [
      "TouchButtonInput"
    ],
    "categories": [
      "buttons-touch"
    ],
    "verification": "reviewed",
    "sources": [
      {
        "facts": [
          "pinLabelsLeftToRight",
          "logicVoltage",
          "render",
          "label",
          "touchSensor"
        ],
        "ref": "https://www.seeedstudio.com/Grove-Touch-Sensor.html"
      },
      {
        "facts": [
          "pinLabelsLeftToRight",
          "logicVoltage",
          "render",
          "label",
          "touchSensor"
        ],
        "ref": "https://wiki.seeedstudio.com/Grove-Touch_Sensor/"
      },
      {
        "facts": [
          "logicVoltage",
          "render"
        ],
        "ref": "https://files.seeedstudio.com/wiki/Grove-Touch_Sensor/res/Touch_sensor_Eagle_File.zip"
      },
      {
        "facts": [
          "dimensionsMm",
          "manufacturer"
        ],
        "ref": "https://www.arrow.com/en/products/101020037/seeed-technology-limited"
      }
    ],
    "interfaces": [
      "gpio"
    ],
    "copy": {
      "summary": "One active-high capacitive touch button",
      "wiringNote": "Power from 3.3 V. SIG is HIGH while touched; NC is not connected.",
      "optionLabel": "Seeed Grove Touch Sensor"
    },
    "pads": [
      {
        "label": "SIG",
        "xPx": 152,
        "yPx": 297.8
      },
      {
        "label": "NC",
        "xPx": 183.6,
        "yPx": 297.8
      },
      {
        "label": "VCC",
        "xPx": 215.4,
        "yPx": 297.8
      },
      {
        "label": "GND",
        "xPx": 247,
        "yPx": 297.8
      }
    ],
    "padHoleRadiusPx": 6.4,
    "supplyRail": "v3v3"
  },
  "sh1106-oled-096-128x64-spi": {
    "manifestVersion": 1,
    "partId": "sh1106-oled-096-128x64-spi",
    "label": "SH1106 0.96-inch 128x64 OLED SPI",
    "category": "display",
    "dimensionsMm": {
      "width": 27.0,
      "height": 28.0
    },
    "manufacturer": "generic seven-pin SPI module form",
    "logicVoltage": "3.3 V / 5 V module supply; 3.3 V logic recommended",
    "pinLabelsLeftToRight": [
      "GND",
      "VCC",
      "CLK",
      "MOSI",
      "RES",
      "DC",
      "CS"
    ],
    "notes": [
      "Common 0.96-inch 128 x 64 OLED breakout configured for four-wire SPI and identified with an SH1106G controller.",
      "Pin labels follow the user's physical module exactly: GND, VCC, CLK, MOSI, RES, DC, CS; RES, DC and CS are separate control inputs.",
      "The connection row is intentionally unpopulated: seven plated through-holes only, with no installed pin posts or plastic housings.",
      "Generic suppliers list 27 x 28 mm and 28 x 28 mm PCB revisions; this asset uses the documented 27 x 28 mm form."
    ],
    "display": {
      "controller": "SH1106G",
      "resolutionPx": [
        128,
        64
      ],
      "interface": "4-wire SPI",
      "touchController": null,
      "touchSurface": null,
      "screensPx": [
        [
          47.0,
          98.9,
          306.0,
          152.8
        ]
      ]
    },
    "render": {
      "file": "parts/sh1106-oled-096-128x64-spi.webp",
      "widthPx": 400,
      "heightPx": 414,
      "pxPerMm": 14.074
    },
    "revision": 1,
    "partTypes": [
      "InfoDisplay"
    ],
    "categories": [
      "display-oled"
    ],
    "verification": "bench",
    "sources": [
      {
        "facts": [
          "render",
          "display"
        ],
        "ref": "https://universal-solder.ca/downloads/canaduino_oled_128x64_spi.pdf"
      },
      {
        "facts": [
          "pinLabelsLeftToRight",
          "label"
        ],
        "ref": "https://fluxworkshop.com/products/bcaa100003-128x64-7p-0-96-white-oled-blue"
      },
      {
        "facts": [
          "pinLabelsLeftToRight",
          "logicVoltage",
          "render"
        ],
        "ref": "https://manuals.plus/m/ba24bf88972c6381fdb194133d72793e5a0145e76f09a3d3f791f4d14f05c764"
      },
      {
        "facts": [
          "label"
        ],
        "ref": "https://www.winstar.com.tw/uploads/editor/files/WEO012864C.pdf"
      }
    ],
    "interfaces": [
      "spi"
    ],
    "copy": {
      "summary": "128x64 white OLED over 4-wire SPI",
      "wiringNote": "Same SH1106G silicon and 2-column RAM offset as the 1.3-inch SPI module, on a smaller 27 x 28 mm board.",
      "optionLabel": "SH1106 0.96-inch",
      "optionOrder": 2
    },
    "pads": [
      {
        "label": "GND",
        "xPx": 92.3,
        "yPx": 371.6
      },
      {
        "label": "VCC",
        "xPx": 128.1,
        "yPx": 371.6
      },
      {
        "label": "CLK",
        "xPx": 163.5,
        "yPx": 371.6
      },
      {
        "label": "MOSI",
        "xPx": 199.3,
        "yPx": 371.6
      },
      {
        "label": "RES",
        "xPx": 235.3,
        "yPx": 371.6
      },
      {
        "label": "DC",
        "xPx": 271.7,
        "yPx": 371.6
      },
      {
        "label": "CS",
        "xPx": 306.8,
        "yPx": 371.6
      }
    ],
    "padHoleRadiusPx": 6.6,
    "supplyRail": "v3v3"
  },
  "sh1106-oled-128x64": {
    "manifestVersion": 1,
    "partId": "sh1106-oled-128x64",
    "label": "SH1106 1.3-inch 128x64 OLED",
    "category": "display",
    "dimensionsMm": {
      "width": 35.5,
      "height": 33.7
    },
    "manufacturer": "generic SPI module form",
    "logicVoltage": "3.3 V / 5 V",
    "pinLabelsLeftToRight": [
      "GND",
      "VCC",
      "CLK",
      "MOSI",
      "RES",
      "DC",
      "CS"
    ],
    "notes": [
      "1.3-inch white SH1106G OLED module with a seven-pin four-wire SPI interface.",
      "The 29.42 x 14.70 mm active area distinguishes this larger panel from the 0.96-inch SSD1306 asset.",
      "The OLED is intentionally rendered blank, with all pixels unlit."
    ],
    "display": {
      "controller": "SH1106G",
      "resolutionPx": [
        128,
        64
      ],
      "interface": "4-wire SPI",
      "touchController": null,
      "touchSurface": null,
      "screensPx": [
        [
          40.5,
          96.2,
          353.0,
          176.4
        ]
      ]
    },
    "render": {
      "file": "parts/sh1106-oled-128x64.webp",
      "widthPx": 434,
      "heightPx": 412,
      "pxPerMm": 12.0
    },
    "revision": 1,
    "partTypes": [
      "InfoDisplay"
    ],
    "categories": [
      "display-oled"
    ],
    "verification": "reviewed",
    "sources": [
      {
        "facts": [
          "pinLabelsLeftToRight",
          "logicVoltage"
        ],
        "ref": "https://manuals.plus/ae/1005001621782442"
      },
      {
        "facts": [
          "logicVoltage",
          "label"
        ],
        "ref": "https://www.lcdwiki.com/1.3inch_SPI_OLED_Module_SH1106_SKU%3AMSP130X"
      },
      {
        "facts": [
          "label",
          "display"
        ],
        "ref": "https://www.waveshare.com/w/upload/e/ee/SH1106.pdf"
      }
    ],
    "interfaces": [
      "spi"
    ],
    "copy": {
      "summary": "128x64 white OLED over 4-wire SPI",
      "wiringNote": "The 1.3-inch SH1106 has 132 columns of controller RAM behind a 128-column panel, so its window starts two columns in. Driving it as an SSD1306 shifts the image two pixels and wraps the remainder down the edge.",
      "optionLabel": "SH1106 1.3-inch",
      "optionOrder": 1
    },
    "pads": [
      {
        "label": "GND",
        "xPx": 125.5,
        "yPx": 391.6
      },
      {
        "label": "VCC",
        "xPx": 155.5,
        "yPx": 391.6
      },
      {
        "label": "CLK",
        "xPx": 186.5,
        "yPx": 391.6
      },
      {
        "label": "MOSI",
        "xPx": 216.5,
        "yPx": 391.6
      },
      {
        "label": "RES",
        "xPx": 247,
        "yPx": 391.6
      },
      {
        "label": "DC",
        "xPx": 277.5,
        "yPx": 391.6
      },
      {
        "label": "CS",
        "xPx": 308,
        "yPx": 391.6
      }
    ],
    "padHoleRadiusPx": 5.9,
    "supplyRail": "v3v3"
  },
  "sh1106-oled-128x64-i2c": {
    "manifestVersion": 1,
    "partId": "sh1106-oled-128x64-i2c",
    "label": "SH1106 1.3-inch 128x64 OLED I2C",
    "category": "display",
    "dimensionsMm": {
      "width": 35.4,
      "height": 33.5
    },
    "manufacturer": "generic four-pin I2C module form",
    "logicVoltage": "3.3 V / 5 V module supply; I2C logic varies by board revision",
    "pinLabelsLeftToRight": [
      "GND",
      "VCC",
      "SCL",
      "SDA"
    ],
    "notes": [
      "Common four-pin 1.3-inch SH1106G I2C OLED breakout with a blue solder-mask PCB.",
      "The 29.42 x 14.70 mm active area and 128 x 64 visible pixels distinguish the panel from a 0.96-inch SSD1306 module.",
      "The default address is commonly 0x3C; supplier revisions may expose or fix 0x3D instead.",
      "Pin order is the common header-down GND, VCC, SCL, SDA arrangement.",
      "The four-pin connection footprint is delivered unpopulated: plated through-holes only, with no installed header pins or plastic housings."
    ],
    "display": {
      "controller": "SH1106G",
      "resolutionPx": [
        128,
        64
      ],
      "interface": "I2C",
      "touchController": null,
      "touchSurface": null,
      "screensPx": [
        [
          45.9,
          101.1,
          353.2,
          176.5
        ]
      ]
    },
    "render": {
      "file": "parts/sh1106-oled-128x64-i2c.webp",
      "widthPx": 445,
      "heightPx": 422,
      "pxPerMm": 12.006
    },
    "revision": 1,
    "partTypes": [
      "InfoDisplay"
    ],
    "categories": [
      "display-oled"
    ],
    "verification": "bench",
    "sources": [
      {
        "facts": [
          "pinLabelsLeftToRight",
          "logicVoltage"
        ],
        "ref": "https://www.scribd.com/document/770137260/Data-Sheet-of-1-3-inch-OLED-Display"
      },
      {
        "facts": [
          "pinLabelsLeftToRight",
          "logicVoltage",
          "render",
          "display"
        ],
        "ref": "https://manuals.plus/ae/1005001621782442"
      },
      {
        "facts": [
          "label",
          "display"
        ],
        "ref": "https://www.waveshare.com/w/upload/e/ee/SH1106.pdf"
      }
    ],
    "interfaces": [
      "i2c"
    ],
    "copy": {
      "summary": "128x64 white OLED over I2C",
      "wiringNote": "Same SH1106G silicon and 2-column RAM offset as the SPI module, on a 4-pin I2C breakout instead. Answers on 0x3C or 0x3D and shares SDA/SCL with other I2C devices, same as the SSD1306.",
      "optionLabel": "SH1106 1.3-inch (I2C)",
      "optionOrder": 3
    },
    "pads": [
      {
        "label": "GND",
        "xPx": 176.5,
        "yPx": 381.5
      },
      {
        "label": "VCC",
        "xPx": 206.6,
        "yPx": 381.5
      },
      {
        "label": "SCL",
        "xPx": 237.4,
        "yPx": 381.5
      },
      {
        "label": "SDA",
        "xPx": 267.6,
        "yPx": 381.5
      }
    ],
    "padHoleRadiusPx": 6.1,
    "supplyRail": "v3v3"
  },
  "sn74ahct125n-dip14": {
    "manifestVersion": 1,
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
    },
    "revision": 1,
    "partTypes": [
      "MatrixOutput"
    ],
    "categories": [
      "led-data-links"
    ],
    "verification": "reviewed",
    "sources": [
      {
        "facts": [
          "dimensionsMm",
          "logicVoltage"
        ],
        "ref": "https://www.ti.com/lit/ds/symlink/sn74ahct125.pdf"
      },
      {
        "facts": [
          "render"
        ],
        "ref": "Design Studio Build Diagram asset (local copy in the asset workspace)"
      }
    ]
  },
  "speaker-4ohm-3w-40mm": {
    "manifestVersion": 1,
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
    },
    "revision": 1,
    "partTypes": [
      "PowerAmplifier"
    ],
    "categories": [
      "audio-speakers"
    ],
    "verification": "reviewed",
    "sources": [
      {
        "facts": [
          "dimensionsMm",
          "notes"
        ],
        "ref": "https://www.mouser.com/datasheet/2/737/Adafruit_3968_Web-3358305.pdf"
      },
      {
        "facts": [
          "pinLabelsLeftToRight",
          "render"
        ],
        "ref": "https://hunston.com.hk/product/Speaker/Mylar%20Speaker/MIU40R-20H3.0W4"
      }
    ],
    "supplyRail": "v5"
  },
  "sph0645lm4h-i2s-microphone": {
    "manifestVersion": 1,
    "partId": "sph0645lm4h-i2s-microphone",
    "label": "SPH0645LM4H I2S microphone",
    "category": "microphone",
    "dimensionsMm": {
      "width": 16.7,
      "height": 12.7
    },
    "manufacturer": "Knowles / Adafruit breakout form",
    "logicVoltage": "1.6-3.6 V; 3.3 V logic",
    "pinLabelsLeftToRight": [
      "SEL",
      "LRCL",
      "DOUT",
      "BCLK",
      "GND",
      "3V"
    ],
    "notes": [
      "Knowles bottom-port I2S microphone on the compact Adafruit Product 3421 breakout form.",
      "On the ESP32 each sample arrives shifted one bit because the microphone changes DOUT on the clock edge the receiver samples; generated firmware applies the published classic-ESP32 timing fix, and ESP32-S3 support awaits a measured capture."
    ],
    "render": {
      "file": "parts/sph0645lm4h-i2s-microphone.webp",
      "widthPx": 400,
      "heightPx": 309,
      "pxPerMm": 22.754
    },
    "revision": 1,
    "partTypes": [
      "MicInput"
    ],
    "categories": [
      "audio-microphones"
    ],
    "verification": "reviewed",
    "sources": [
      {
        "facts": [
          "dimensionsMm",
          "pinLabelsLeftToRight",
          "render"
        ],
        "ref": "https://www.adafruit.com/product/3421"
      },
      {
        "facts": [
          "notes",
          "microphone"
        ],
        "ref": "https://www.knowles.com/docs/default-source/model-downloads/sph0645lm4h-b-datasheet-rev-c.pdf"
      }
    ],
    "copy": {
      "summary": "Knowles I2S mic, classic ESP32 only",
      "wiringNote": "Captured by the app with the published ESP32 timing fix, not by FastLED, so no response correction is applied. Classic ESP32 only: the fix is documented for the I2S receiver of that chip, not for the ESP32-S3. SEL to ground selects the left channel.",
      "optionLabel": "SPH0645LM4H",
      "optionOrder": 4
    },
    "pads": [
      {
        "label": "SEL",
        "xPx": 55.5,
        "yPx": 268.5
      },
      {
        "label": "LRCL",
        "xPx": 113.2,
        "yPx": 268.5
      },
      {
        "label": "DOUT",
        "xPx": 170.4,
        "yPx": 268.5
      },
      {
        "label": "BCLK",
        "xPx": 228.7,
        "yPx": 268.5
      },
      {
        "label": "GND",
        "xPx": 285.8,
        "yPx": 268.5
      },
      {
        "label": "3V",
        "xPx": 343.6,
        "yPx": 268.5
      }
    ],
    "padHoleRadiusPx": 9.6,
    "supplyRail": "v3v3",
    "microphone": {
      "device": "SPH0645LM4H",
      "captureAdapter": "sph0645-classic-esp32"
    }
  },
  "ssd1306-oled-096-128x64-i2c": {
    "manifestVersion": 1,
    "partId": "ssd1306-oled-096-128x64-i2c",
    "label": "SSD1306 0.96-inch 128x64 OLED I2C (4-pin)",
    "category": "display",
    "dimensionsMm": {
      "width": 27.3,
      "height": 27.8
    },
    "manufacturer": "generic four-pin I2C module form",
    "logicVoltage": "3.3 V / 5 V module supply; 3.3 V logic",
    "pinLabelsLeftToRight": [
      "GND",
      "VCC",
      "SCL",
      "SDA"
    ],
    "notes": [
      "Common four-pin 0.96-inch SSD1306 I2C OLED breakout, distinct from the eight-pin Adafruit I2C/SPI board.",
      "Pin order is the common header-down GND, VCC, SCL, SDA arrangement; supplier variants sometimes swap GND and VCC.",
      "The default seven-bit I2C address is commonly 0x3C; some revisions expose or fix 0x3D instead.",
      "The connection row is intentionally unpopulated: four plated through-holes are shown without header pins."
    ],
    "display": {
      "controller": "SSD1306",
      "resolutionPx": [
        128,
        64
      ],
      "interface": "I2C",
      "touchController": null,
      "touchSurface": null,
      "screensPx": [
        [
          47.0,
          99.1,
          306.0,
          152.9
        ]
      ]
    },
    "render": {
      "file": "parts/ssd1306-oled-096-128x64-i2c.webp",
      "widthPx": 400,
      "heightPx": 414,
      "pxPerMm": 14.652
    },
    "revision": 1,
    "partTypes": [
      "InfoDisplay"
    ],
    "categories": [
      "display-oled"
    ],
    "verification": "reviewed",
    "sources": [
      {
        "facts": [
          "pinLabelsLeftToRight",
          "logicVoltage",
          "display"
        ],
        "ref": "https://www.scribd.com/document/770137261/Data-Sheet-of-0-96-inch-Blue-OLED-Display"
      },
      {
        "facts": [
          "pinLabelsLeftToRight",
          "logicVoltage",
          "display"
        ],
        "ref": "https://www.electrokit.com/upload/quick/42/32/fb04_41035586-tds.pdf"
      },
      {
        "facts": [
          "label",
          "display"
        ],
        "ref": "https://cdn-shop.adafruit.com/datasheets/SSD1306.pdf"
      }
    ],
    "interfaces": [
      "i2c"
    ],
    "copy": {
      "summary": "128x64 white OLED over I2C",
      "wiringNote": "The generic four-pin module, silkscreened GND, VCC, SCL, SDA — the commonest 0.96-inch OLED, and the one to pick unless the board in hand is the Adafruit breakout. Answers on 0x3C or 0x3D and shares SDA/SCL with other I2C devices.",
      "optionLabel": "SSD1306 0.96-inch (4-pin)",
      "optionOrder": 4
    },
    "pads": [
      {
        "label": "GND",
        "xPx": 145.7,
        "yPx": 370.8
      },
      {
        "label": "VCC",
        "xPx": 181.5,
        "yPx": 370.8
      },
      {
        "label": "SCL",
        "xPx": 217.5,
        "yPx": 370.8
      },
      {
        "label": "SDA",
        "xPx": 253.1,
        "yPx": 370.8
      }
    ],
    "padHoleRadiusPx": 6.6,
    "supplyRail": "v3v3"
  },
  "ssd1306-oled-128x64": {
    "manifestVersion": 1,
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
      "touchController": null,
      "touchSurface": null,
      "screensPx": [
        [
          54.6,
          69.9,
          290.8,
          143.9
        ]
      ]
    },
    "render": {
      "file": "parts/ssd1306-oled-128x64.webp",
      "widthPx": 400,
      "heightPx": 366,
      "pxPerMm": 13.425
    },
    "revision": 1,
    "partTypes": [
      "InfoDisplay"
    ],
    "categories": [
      "display-oled"
    ],
    "verification": "reviewed",
    "sources": [
      {
        "facts": [
          "dimensionsMm"
        ],
        "ref": "https://www.adafruit.com/product/326"
      },
      {
        "facts": [
          "render",
          "display"
        ],
        "ref": "https://learn.adafruit.com/monochrome-oled-breakouts"
      },
      {
        "facts": [
          "render",
          "label",
          "display"
        ],
        "ref": "https://cdn-shop.adafruit.com/datasheets/SSD1306.pdf"
      }
    ],
    "interfaces": [
      "i2c",
      "spi"
    ],
    "copy": {
      "summary": "128x64 white OLED over I2C",
      "wiringNote": "The Adafruit eight-pin STEMMA QT breakout, strapped for I2C: it prints the SPI names CLK and DATA on the two lines it answers I2C on. Answers on 0x3C or 0x3D and shares SDA/SCL with other I2C devices.",
      "optionLabel": "SSD1306 0.96-inch (Adafruit)",
      "optionOrder": 5
    },
    "pads": [
      {
        "label": "GND",
        "xPx": 80,
        "yPx": 346.2
      },
      {
        "label": "VIN",
        "xPx": 114.3,
        "yPx": 346.2
      },
      {
        "label": "3V",
        "xPx": 148.6,
        "yPx": 346.2
      },
      {
        "label": "CLK",
        "xPx": 182.9,
        "yPx": 346.2
      },
      {
        "label": "DATA",
        "xPx": 217.1,
        "yPx": 346.2
      },
      {
        "label": "RST",
        "xPx": 251.4,
        "yPx": 346.2
      },
      {
        "label": "DC",
        "xPx": 285.7,
        "yPx": 346.2
      },
      {
        "label": "CS",
        "xPx": 320,
        "yPx": 346.2
      }
    ],
    "padHoleRadiusPx": 6.7,
    "supplyRail": "v5"
  },
  "st7789-tft-240x240": {
    "manifestVersion": 1,
    "partId": "st7789-tft-240x240",
    "label": "ST7789 1.54-inch 240x240 TFT",
    "category": "display",
    "dimensionsMm": {
      "width": 32.0,
      "height": 43.72
    },
    "manufacturer": "generic M154-240240-RGB-8 module form",
    "logicVoltage": "3.0-3.3 V supply and logic",
    "pinLabelsLeftToRight": [
      "GND",
      "VCC",
      "SCL",
      "SDA",
      "RST",
      "DC",
      "CS",
      "BL"
    ],
    "notes": [
      "Common 1.54-inch 240 x 240 IPS TFT breakout using an ST7789V controller and four-wire SPI.",
      "Pin labels follow the user's physical module exactly: GND, VCC, SCL, SDA, RST, DC, CS, BL. On this module SCL is the SPI clock and SDA is the SPI data input, not an I2C bus.",
      "The eight 2.54 mm connection positions are intentionally unpopulated plated through-holes, with no installed header posts or plastic strip.",
      "The previous Adafruit-style square carrier and microSD/header details were removed; this replacement follows the 32.00 x 43.72 mm eight-pin module drawing."
    ],
    "display": {
      "controller": "ST7789V",
      "resolutionPx": [
        240,
        240
      ],
      "interface": "4-wire SPI",
      "touchController": null,
      "touchSurface": null,
      "screensPx": [
        [
          35.7,
          91.8,
          332.6,
          332.6
        ]
      ]
    },
    "render": {
      "file": "parts/st7789-tft-240x240.webp",
      "widthPx": 404,
      "heightPx": 545,
      "pxPerMm": 12.0
    },
    "revision": 1,
    "partTypes": [
      "TransportDisplay"
    ],
    "categories": [
      "display-tft"
    ],
    "verification": "bench",
    "sources": [
      {
        "facts": [
          "pinLabelsLeftToRight",
          "logicVoltage",
          "label"
        ],
        "ref": "https://akizukidenshi.com/goodsaffix/M154-240240-RGB-8.pdf"
      },
      {
        "facts": [
          "display"
        ],
        "ref": "https://www.waveshare.com/product/displays/lcd-oled/1.54inch-lcd-module.htm"
      },
      {
        "facts": [
          "display"
        ],
        "ref": "https://www.winstar.com.tw/products/tft-lcd/ips-tft/square-lcd-screen.html"
      }
    ],
    "interfaces": [
      "spi"
    ],
    "copy": {
      "summary": "240x240 colour TFT over SPI",
      "wiringNote": "A square 240x240 colour display with no touch controller.",
      "optionLabel": "ST7789 1.54-inch",
      "optionOrder": 1
    },
    "pads": [
      {
        "label": "GND",
        "xPx": 94.5,
        "yPx": 505
      },
      {
        "label": "VCC",
        "xPx": 125.5,
        "yPx": 505
      },
      {
        "label": "SCL",
        "xPx": 155.5,
        "yPx": 505
      },
      {
        "label": "SDA",
        "xPx": 186.5,
        "yPx": 505
      },
      {
        "label": "RST",
        "xPx": 216.5,
        "yPx": 505
      },
      {
        "label": "DC",
        "xPx": 247.5,
        "yPx": 505
      },
      {
        "label": "CS",
        "xPx": 277.5,
        "yPx": 505
      },
      {
        "label": "BL",
        "xPx": 308.5,
        "yPx": 505
      }
    ],
    "padHoleRadiusPx": 5.9,
    "supplyRail": "v3v3",
    "tftPanel": {
      "colorOrder": "RGB",
      "mirroredColumns": false,
      "invert": false,
      "columnOffset": 0,
      "rowOffset": 0
    }
  },
  "st7789v-xpt2046-touch-240x320": {
    "manifestVersion": 1,
    "partId": "st7789v-xpt2046-touch-240x320",
    "label": "ST7789V 2.4-inch 240x320 TFT with XPT2046 touch and SD",
    "category": "display",
    "dimensionsMm": {
      "width": 42.72,
      "height": 77.18
    },
    "manufacturer": "generic MSP2402-form module",
    "logicVoltage": "3.3-5 V supply; 3.3 V SPI logic",
    "pinLabelsLeftToRight": [
      "VCC",
      "GND",
      "CS",
      "RESET",
      "DC",
      "MOSI",
      "SCK",
      "LED",
      "MISO",
      "T_CLK",
      "T_CS",
      "T_DIN",
      "T_DO",
      "T_IRQ"
    ],
    "notes": [
      "Common 2.4-inch 240x320 SPI TFT module using ST7789V with XPT2046 resistive touch and an onboard microSD slot.",
      "The board is shown in its 42.72 x 77.18 mm portrait orientation with the fourteen-pin header along the bottom edge.",
      "Display, touch and microSD share SPI data/clock lines and use separate chip-select signals.",
      "Fourteen main header positions expose display and touch signals; the microSD chip-select pads are represented beside the socket."
    ],
    "display": {
      "controller": "ST7789V",
      "resolutionPx": [
        240,
        320
      ],
      "interface": "4-wire SPI shared with XPT2046 and microSD",
      "touchController": "XPT2046",
      "touchSurface": null,
      "screensPx": [
        [
          66.9,
          219.2,
          547.2,
          730.7
        ]
      ]
    },
    "render": {
      "file": "parts/st7789v-xpt2046-touch-240x320.webp",
      "widthPx": 651,
      "heightPx": 1169,
      "pxPerMm": 15.0
    },
    "revision": 1,
    "partTypes": [
      "TransportDisplay"
    ],
    "categories": [
      "display-tft"
    ],
    "verification": "bench",
    "sources": [
      {
        "facts": [
          "logicVoltage",
          "label"
        ],
        "ref": "https://robu-prod-media.s3.ap-south-1.amazonaws.com/uploads/2025/02/2.4_inch_ResistiveTouch_manual.pdf"
      },
      {
        "facts": [
          "logicVoltage"
        ],
        "ref": "https://curtocircuito.com.br/display-tft-2-4-spi-touch-screen-st7735.html"
      },
      {
        "facts": [
          "pinLabelsLeftToRight",
          "render"
        ],
        "ref": "https://www.lcdwiki.com/res/MSP2402/2.4inch_SPI_Module_MSP2402_User_Manual_EN.pdf"
      }
    ],
    "interfaces": [
      "spi"
    ],
    "copy": {
      "summary": "240x320 colour TFT with XPT2046 touch",
      "wiringNote": "The XPT2046 touch controller exposes its own SPI pins, so it can share the display bus or use a separate bus. Adding this module gives you two nodes: the panel, and the Touch Screen node whose Controls output is what a finger on the glass publishes.",
      "optionLabel": "ST7789V 2.4-inch + touch",
      "optionOrder": 3
    },
    "pads": [
      {
        "label": "VCC",
        "xPx": 78.1,
        "yPx": 1073.2
      },
      {
        "label": "GND",
        "xPx": 116.2,
        "yPx": 1073.2
      },
      {
        "label": "CS",
        "xPx": 154.3,
        "yPx": 1073.2
      },
      {
        "label": "RESET",
        "xPx": 192.3,
        "yPx": 1073.2
      },
      {
        "label": "DC",
        "xPx": 230.4,
        "yPx": 1073.2
      },
      {
        "label": "MOSI",
        "xPx": 268.4,
        "yPx": 1073.2
      },
      {
        "label": "SCK",
        "xPx": 306.5,
        "yPx": 1073.2
      },
      {
        "label": "LED",
        "xPx": 344.5,
        "yPx": 1073.2
      },
      {
        "label": "MISO",
        "xPx": 382.6,
        "yPx": 1073.2
      },
      {
        "label": "T_CLK",
        "xPx": 420.6,
        "yPx": 1073.2
      },
      {
        "label": "T_CS",
        "xPx": 458.7,
        "yPx": 1073.2
      },
      {
        "label": "T_DIN",
        "xPx": 496.7,
        "yPx": 1073.2
      },
      {
        "label": "T_DO",
        "xPx": 534.8,
        "yPx": 1073.2
      },
      {
        "label": "T_IRQ",
        "xPx": 572.9,
        "yPx": 1073.2
      }
    ],
    "padHoleRadiusPx": 7.2,
    "supplyRail": "v3v3",
    "tftPanel": {
      "colorOrder": "RGB",
      "mirroredColumns": false,
      "invert": false,
      "columnOffset": 0,
      "rowOffset": 0
    }
  },
  "tm1637-4digit-display": {
    "manifestVersion": 1,
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
      "The display is intentionally rendered blank, with all four digits and the colon unlit.",
      "The four-pin connection header is left unpopulated; its plated holes read GND, VCC, DIO, CLK left to right in this render."
    ],
    "display": {
      "controller": "TM1637",
      "resolutionPx": [
        4,
        7
      ],
      "interface": "CLK + DIO",
      "touchController": null,
      "touchSurface": null,
      "screensPx": [
        [
          101.2,
          57.4,
          357.6,
          152.4
        ]
      ]
    },
    "render": {
      "file": "parts/tm1637-4digit-display.webp",
      "widthPx": 512,
      "heightPx": 296,
      "pxPerMm": 12.0
    },
    "revision": 1,
    "partTypes": [
      "SegmentDisplay"
    ],
    "categories": [
      "display-segment"
    ],
    "verification": "bench",
    "sources": [
      {
        "facts": [
          "logicVoltage",
          "label"
        ],
        "ref": "https://wiki.seeedstudio.com/Grove-4-Digit_Display/"
      }
    ],
    "interfaces": [
      "two-wire-clk-dio"
    ],
    "copy": {
      "summary": "Two-wire 7-segment with a colon",
      "wiringNote": "Four digits and a centre colon, driven over CLK and DIO. Not I2C despite the two wires: the TM1637 has no addresses, so each module needs its own pair of pins.",
      "optionLabel": "TM1637 4-digit",
      "optionOrder": 1
    },
    "pads": [
      {
        "label": "GND",
        "xPx": 210,
        "yPx": 259
      },
      {
        "label": "VCC",
        "xPx": 240,
        "yPx": 259
      },
      {
        "label": "DIO",
        "xPx": 271,
        "yPx": 259
      },
      {
        "label": "CLK",
        "xPx": 301,
        "yPx": 259
      }
    ],
    "padHoleRadiusPx": 5.6,
    "supplyRail": "v3v3"
  },
  "tp4056-usbc-charge-protect-module": {
    "manifestVersion": 1,
    "partId": "tp4056-usbc-charge-protect-module",
    "label": "TP4056 USB-C 1S charge and protection module",
    "category": "battery",
    "dimensionsMm": {
      "width": 28.0,
      "height": 17.0
    },
    "manufacturer": "generic (TP4056, DW01A and FS8205A)",
    "logicVoltage": "none; power only",
    "pinLabelsLeftToRight": [
      "B+",
      "B-",
      "OUT+",
      "OUT-"
    ],
    "notes": [
      "The listing combines TP4056 charging with DW01A/FS8205A protection. OUT- is the protected negative."
    ],
    "batteryModule": {
      "series": 1,
      "chemistries": [
        "li-ion"
      ],
      "protection": {
        "continuousDischargeMa": 3000,
        "continuousChargeMa": 1000,
        "overchargeV": 4.28,
        "overDischargeV": 2.5,
        "port": "common",
        "switchedLine": "negative",
        "temperatureSensor": false,
        "powerTerminals": [
          "B+",
          "B-",
          "OUT+",
          "OUT-"
        ]
      },
      "charger": {
        "device": "TP4056",
        "chargeVPerCell": 4.2,
        "maxChargeMa": 1000,
        "inputMaxW": 5,
        "inputProtocols": "USB-C 5 V",
        "bidirectional": false,
        "batteryTerminals": [
          "B+",
          "B-"
        ]
      }
    },
    "render": {
      "file": "parts/tp4056-usbc-charge-protect-module.webp",
      "widthPx": 400,
      "heightPx": 251,
      "pxPerMm": 13.571
    },
    "revision": 1,
    "partTypes": [
      "BatteryModule"
    ],
    "categories": [
      "battery-chargers"
    ],
    "verification": "reviewed",
    "sources": [
      {
        "facts": [
          "pinLabelsLeftToRight",
          "render",
          "batteryModule"
        ],
        "ref": "https://www.aliexpress.com/item/1005007089641829.html"
      }
    ],
    "copy": {
      "summary": "1S li-ion · protection, charger"
    }
  },
  "tps61023-1s-5v-boost-module": {
    "manifestVersion": 1,
    "partId": "tps61023-1s-5v-boost-module",
    "label": "TPS61023 1S 5 V boost module",
    "category": "power-conversion",
    "dimensionsMm": {
      "width": 17.8,
      "height": 13.5
    },
    "manufacturer": "generic (Texas Instruments TPS61023)",
    "logicVoltage": "none; power only",
    "pinLabelsLeftToRight": [
      "VIN+",
      "VIN-",
      "VOUT+",
      "VOUT-"
    ],
    "notes": [
      "Seller rates 1 A output; higher figures describe peak switch current, not continuous 5 V load current."
    ],
    "powerConverter": {
      "role": "led-rail",
      "topology": "boost (non-isolated, common negative)",
      "inputMinV": 2.3,
      "inputMaxV": 5.5,
      "minHeadroomV": 0,
      "outputSetV": 5,
      "continuousCurrentMa": 1000,
      "peakCurrentMa": 1500,
      "typicalEfficiency": 0.9,
      "isolated": false,
      "adjustable": false,
      "outputCurrentLimit": "none",
      "terminals": [
        "VIN+",
        "VIN-",
        "VOUT+",
        "VOUT-"
      ],
      "roles": [
        "led-rail",
        "controller"
      ],
      "terminalPositions": [
        [
          0.204,
          0.851
        ],
        [
          0.396,
          0.851
        ],
        [
          0.604,
          0.851
        ],
        [
          0.798,
          0.851
        ]
      ]
    },
    "render": {
      "file": "parts/tps61023-1s-5v-boost-module.webp",
      "widthPx": 400,
      "heightPx": 308,
      "pxPerMm": 21.348
    },
    "revision": 1,
    "partTypes": [
      "PowerConverter"
    ],
    "categories": [
      "power-boost"
    ],
    "verification": "reviewed",
    "sources": [
      {
        "facts": [
          "pinLabelsLeftToRight",
          "render",
          "powerConverter"
        ],
        "ref": "https://www.aliexpress.com/item/1005008387293839.html"
      }
    ],
    "copy": {
      "summary": "LEDs or board ·2.3-5.5 V in, 5 V 1 A at 40 °C"
    }
  },
  "tsop38238-ir-receiver": {
    "manifestVersion": 1,
    "partId": "tsop38238-ir-receiver",
    "label": "TSOP38238 38 kHz IR receiver",
    "category": "input-control",
    "dimensionsMm": {
      "width": 8.25,
      "height": 12.45
    },
    "manufacturer": "Vishay Semiconductors",
    "logicVoltage": "2.0-5.5 V supply; demodulated output drives a logic input directly",
    "pinLabelsLeftToRight": [
      "OUT",
      "GND",
      "VS"
    ],
    "notes": [
      "Pin order is the manufacturer's: viewed from the lens side with the leads pointing down, pin 1 (left) is OUT, pin 2 (centre) is GND, pin 3 (right) is VS.",
      "The package carries no silkscreen, so the pad names here are functional rather than printed. Identity comes from the lens face and the lead order, which is why the render is taken from that face.",
      "Not interchangeable with a VS1838B by position: the common clone puts its supply on the centre pin. Check the part in hand before wiring one in place of the other.",
      "38 kHz is the carrier NEC-family remotes use, which is the protocol the app learns first. Vishay's own \"best choice for NEC\" footnote is against the AGC4 sibling TSOP38438 rather than this AGC2 part, so the two are worth comparing on a bench before one is promoted.",
      "Lead length is shown trimmed for breadboard use; the datasheet dimensions the uncut lead, so only the body dimensions are datasheet-exact."
    ],
    "render": {
      "file": "parts/tsop38238-ir-receiver.webp",
      "widthPx": 400,
      "heightPx": 589,
      "pxPerMm": 45.091
    },
    "revision": 1,
    "partTypes": [
      "IRRemoteInput"
    ],
    "categories": [
      "remote-receivers"
    ],
    "verification": "reviewed",
    "sources": [
      {
        "facts": [
          "logicVoltage",
          "dimensionsMm"
        ],
        "ref": "https://www.vishay.com/docs/82491/tsop382.pdf"
      },
      {
        "facts": [
          "pinLabelsLeftToRight",
          "logicVoltage"
        ],
        "ref": "https://www.adafruit.com/product/157"
      }
    ],
    "copy": {
      "summary": "Bare 38 kHz IR receiver, datasheet pin order",
      "wiringNote": "Its centre pin is ground, not the supply. Do not wire it to a KY-022 footprint without rechecking.",
      "optionLabel": "TSOP38238",
      "optionOrder": 3
    },
    "pads": [
      {
        "label": "OUT",
        "xPx": 85,
        "yPx": 578
      },
      {
        "label": "GND",
        "xPx": 199.5,
        "yPx": 578
      },
      {
        "label": "VS",
        "xPx": 314,
        "yPx": 578
      }
    ],
    "padHoleRadiusPx": 14,
    "supplyRail": "v3v3",
    "irReceiver": {
      "supplyVolts": 3.3,
      "carrierKHz": 38
    }
  },
  "uda1334a-i2s-dac": {
    "manifestVersion": 1,
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
    },
    "revision": 1,
    "partTypes": [
      "Amplifier"
    ],
    "categories": [
      "audio-amplifiers"
    ],
    "verification": "reviewed",
    "sources": [
      {
        "facts": [
          "dimensionsMm",
          "render",
          "label",
          "notes",
          "i2sAudio"
        ],
        "ref": "https://www.adafruit.com/product/3678"
      },
      {
        "facts": [
          "logicVoltage",
          "notes"
        ],
        "ref": "https://learn.adafruit.com/adafruit-i2s-stereo-decoder-uda1334a/pinouts"
      },
      {
        "facts": [
          "dimensionsMm"
        ],
        "ref": "https://learn.adafruit.com/adafruit-i2s-stereo-decoder-uda1334a/downloads"
      },
      {
        "facts": [
          "notes"
        ],
        "ref": "https://cdn-shop.adafruit.com/product-files/3678/3678_UDA1334A.pdf"
      }
    ],
    "copy": {
      "summary": "I2S DAC — line out, needs an amp",
      "wiringNote": "Line-level I2S DAC, wired the same as the PCM5102A.",
      "optionLabel": "UDA1334A",
      "optionOrder": 4
    },
    "pads": [
      {
        "label": "VIN",
        "xPx": 130.2,
        "yPx": 285
      },
      {
        "label": "3VO",
        "xPx": 160.5,
        "yPx": 285
      },
      {
        "label": "GND",
        "xPx": 191.2,
        "yPx": 285
      },
      {
        "label": "WSEL",
        "xPx": 221.5,
        "yPx": 285
      },
      {
        "label": "DIN",
        "xPx": 251.9,
        "yPx": 285
      },
      {
        "label": "BCLK",
        "xPx": 282.5,
        "yPx": 285
      },
      {
        "label": "Lout",
        "xPx": 312.9,
        "yPx": 285
      },
      {
        "label": "AGND",
        "xPx": 343.5,
        "yPx": 285
      },
      {
        "label": "Rout",
        "xPx": 373.8,
        "yPx": 285
      }
    ],
    "padHoleRadiusPx": 5.1,
    "supplyRail": "v5",
    "i2sAudio": {
      "device": "UDA1334A",
      "output": "line"
    }
  },
  "uln2803a-dip18": {
    "manifestVersion": 1,
    "partId": "uln2803a-dip18",
    "label": "ULN2803A eight-channel driver (DIP-18)",
    "category": "switching-power",
    "dimensionsMm": {
      "width": 8.9,
      "height": 22.86
    },
    "manufacturer": "Texas Instruments / STMicroelectronics ULN2803A",
    "logicVoltage": "5 V TTL/CMOS inputs; open-collector outputs to 50 V, 500 mA per channel",
    "pinLabelsLeftToRight": [
      "1B",
      "2B",
      "3B",
      "4B",
      "5B",
      "6B",
      "7B",
      "8B",
      "GND",
      "COM",
      "8C",
      "7C",
      "6C",
      "5C",
      "4C",
      "3C",
      "2C",
      "1C"
    ],
    "notes": [
      "Eight low-side open-collector Darlington switches: a high level on an input pulls the matching output to ground, so each output sinks the load's current. They cannot source current.",
      "Each channel takes up to 500 mA and the outputs withstand 50 V, but the package limits the total heat, so do not run all eight at full current.",
      "Pin 10 (COM) joins the clamp diodes: tie it to the load supply when switching inductive loads such as relay coils, solenoids and motors.",
      "Pins are 1B-8B inputs on the left (1-8), GND on pin 9, COM on pin 10 and 8C-1C outputs on the right (11-18), so output 1C is directly opposite input 1B across the package.",
      "The inputs take 5 V logic; a 3.3 V controller can drive them on most parts, but check the datasheet input current at 3.3 V for your variant.",
      "A standard 7.62 mm wide DIP-18 body, 22.86 mm long."
    ],
    "driverChip": {
      "device": "ULN2803A",
      "package": "DIP-18",
      "channels": 8,
      "outputType": "open-collector Darlington, low-side, with clamp diodes to COM",
      "inputActiveLevel": "high",
      "maxOutputVoltageV": 50,
      "maxChannelCurrentMa": 500,
      "pinout": [
        "1B",
        "2B",
        "3B",
        "4B",
        "5B",
        "6B",
        "7B",
        "8B",
        "GND",
        "COM",
        "8C",
        "7C",
        "6C",
        "5C",
        "4C",
        "3C",
        "2C",
        "1C"
      ]
    },
    "render": {
      "file": "parts/uln2803a-dip18.webp",
      "widthPx": 400,
      "heightPx": 996,
      "pxPerMm": 42.697
    },
    "revision": 1,
    "partTypes": [
      "DarlingtonDriverOutput"
    ],
    "categories": [
      "switching-darlington-drivers"
    ],
    "verification": "reviewed",
    "sources": [
      {
        "facts": [
          "pinLabelsLeftToRight",
          "logicVoltage",
          "driverChip"
        ],
        "ref": "https://www.ti.com/product/ULN2803A"
      },
      {
        "facts": [
          "pinLabelsLeftToRight"
        ],
        "ref": "https://components101.com/ics/uln2803-darlington-transistor-array-pinout-datasheet"
      }
    ],
    "copy": {
      "summary": "Eight low-side switches, 50 V and 500 mA each",
      "wiringNote": "Active-high: a high input pulls its output to ground, so the load goes from its own supply to the output and the array only sinks. Join the load supply ground to the controller ground. Tie COM to the load supply for coils and motors. Do not run all eight at full current: the package limits the total heat.",
      "optionLabel": "ULN2803A"
    },
    "pads": [
      {
        "label": "1B",
        "xPx": 25,
        "yPx": 64
      },
      {
        "label": "2B",
        "xPx": 25,
        "yPx": 172
      },
      {
        "label": "3B",
        "xPx": 25,
        "yPx": 280.5
      },
      {
        "label": "4B",
        "xPx": 25,
        "yPx": 389
      },
      {
        "label": "5B",
        "xPx": 25,
        "yPx": 497.5
      },
      {
        "label": "6B",
        "xPx": 25,
        "yPx": 606
      },
      {
        "label": "7B",
        "xPx": 25,
        "yPx": 714.5
      },
      {
        "label": "8B",
        "xPx": 25,
        "yPx": 823
      },
      {
        "label": "GND",
        "xPx": 25,
        "yPx": 931
      },
      {
        "label": "COM",
        "xPx": 375,
        "yPx": 931
      },
      {
        "label": "8C",
        "xPx": 375,
        "yPx": 823
      },
      {
        "label": "7C",
        "xPx": 375,
        "yPx": 714.5
      },
      {
        "label": "6C",
        "xPx": 375,
        "yPx": 606
      },
      {
        "label": "5C",
        "xPx": 375,
        "yPx": 497.5
      },
      {
        "label": "4C",
        "xPx": 375,
        "yPx": 389
      },
      {
        "label": "3C",
        "xPx": 375,
        "yPx": 280.5
      },
      {
        "label": "2C",
        "xPx": 375,
        "yPx": 172
      },
      {
        "label": "1C",
        "xPx": 375,
        "yPx": 64
      }
    ],
    "padHoleRadiusPx": 10,
    "supplyRail": "none"
  },
  "wiz850io-ethernet-module": {
    "manifestVersion": 1,
    "partId": "wiz850io-ethernet-module",
    "label": "WIZnet WIZ850io W5500 Ethernet module",
    "category": "communication",
    "dimensionsMm": {
      "width": 27.95,
      "height": 23.0
    },
    "manufacturer": "WIZnet (WIZ850io, W5500)",
    "logicVoltage": "3.3 V only (2.97-3.63 V); SPI inputs are 5 V tolerant per the W5500 datasheet, but the module must be powered from 3.3 V",
    "pinLabelsLeftToRight": [
      "GND",
      "GND",
      "MOSI",
      "SCLK",
      "SCNn",
      "INTn",
      "GND",
      "3V3D",
      "3V3D",
      "NC",
      "RSTn",
      "MISO"
    ],
    "notes": [
      "pinLabelsLeftToRight lists J1 from pin 1, then J2 from pin 1; pin 1 is the right-hand end of each row. J1 (top edge) is GND, GND, MOSI, SCLK, SCNn, INTn and J2 (bottom edge) is GND, 3V3D, 3V3D, NC, RSTn, MISO.",
      "The board prints no pin names; only pin 1 of each header is ringed. The Build Diagram names each pad.",
      "Power from 3.3 V only. The module draws up to about 141 mA with a 100 Mb/s link, so feed it from the controller's 3.3 V rail only when that regulator has the headroom.",
      "dimensionsMm is the rendered footprint: the 25 x 23 mm board plus the RJ45 body standing 2.95 mm proud of its right-hand edge.",
      "The two 1x6 headers ship fitted on the underside at 20.32 mm spacing; they are rendered as unpopulated plated holes."
    ],
    "ethernet": {
      "controller": "W5500",
      "interface": "SPI",
      "maxSpiClockMHz": 80,
      "link": "10/100BASE-TX"
    },
    "render": {
      "file": "parts/wiz850io-ethernet-module.webp",
      "widthPx": 400,
      "heightPx": 333,
      "pxPerMm": 13.596
    },
    "revision": 1,
    "partTypes": [
      "EthernetModule"
    ],
    "categories": [
      "network"
    ],
    "verification": "reviewed",
    "sources": [
      {
        "facts": [
          "dimensionsMm",
          "pinLabelsLeftToRight"
        ],
        "ref": "https://docs.wiznet.io/img/products/wiz850io/wiz850io_sch_v110.zip"
      },
      {
        "facts": [
          "render"
        ],
        "ref": "BS-R250210 MagJack STEP (local copy in the asset workspace)"
      },
      {
        "facts": [
          "dimensionsMm",
          "pinLabelsLeftToRight",
          "logicVoltage",
          "render",
          "ethernet"
        ],
        "ref": "https://docs.wiznet.io/Product/ioModule/WIZ850io"
      },
      {
        "facts": [
          "logicVoltage",
          "ethernet"
        ],
        "ref": "https://docs.wiznet.io/img/products/w5500/W5500_ds_v110e.pdf"
      }
    ],
    "interfaces": [
      "spi"
    ],
    "copy": {
      "summary": "W5500 wired Ethernet over SPI, 3.3 V",
      "wiringNote": "Power it from 3.3 V only; it draws up to about 141 mA with a link up. Every network node (Art-Net, sACN, DDP, Web Remote, NTP...) uses this link instead of Wi-Fi.",
      "optionLabel": "WIZnet WIZ850io"
    },
    "pads": [
      {
        "label": "GND",
        "xPx": 262.9,
        "yPx": 28.4
      },
      {
        "label": "GND",
        "xPx": 228.3,
        "yPx": 28.4
      },
      {
        "label": "MOSI",
        "xPx": 193.8,
        "yPx": 28.4
      },
      {
        "label": "SCLK",
        "xPx": 159.3,
        "yPx": 28.4
      },
      {
        "label": "SCNn",
        "xPx": 124.7,
        "yPx": 28.4
      },
      {
        "label": "INTn",
        "xPx": 90.2,
        "yPx": 28.4
      },
      {
        "label": "GND",
        "xPx": 262.9,
        "yPx": 304.6
      },
      {
        "label": "3V3D",
        "xPx": 228.3,
        "yPx": 304.6
      },
      {
        "label": "3V3D",
        "xPx": 193.8,
        "yPx": 304.6
      },
      {
        "label": "NC",
        "xPx": 159.3,
        "yPx": 304.6
      },
      {
        "label": "RSTn",
        "xPx": 124.7,
        "yPx": 304.6
      },
      {
        "label": "MISO",
        "xPx": 90.2,
        "yPx": 304.6
      }
    ],
    "padHoleRadiusPx": 6.2,
    "supplyRail": "v3v3"
  },
  "ws2812b-matrix-16x16": {
    "manifestVersion": 1,
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
    "render": {
      "file": "parts/ws2812b-matrix-16x16.webp",
      "widthPx": 1200,
      "heightPx": 1200,
      "pxPerMm": 7.45
    },
    "revision": 1,
    "partTypes": [
      "MatrixOutput"
    ],
    "categories": [
      "led-matrices"
    ],
    "verification": "bench",
    "sources": [
      {
        "facts": [
          "notes"
        ],
        "ref": "https://www.adafruit.com/product/2547"
      },
      {
        "facts": [
          "dimensionsMm",
          "render"
        ],
        "ref": "https://learn.adafruit.com/adafruit-neopixel-uberguide/neopixel-matrices"
      },
      {
        "facts": [
          "ledOutput"
        ],
        "ref": "https://www.adafruit.com/product/2547 (over 15 A with all 256 LEDs white, about 59 mA each; rounded up to the 60 mA worst case)"
      },
      {
        "facts": [
          "ledOutput"
        ],
        "ref": "https://cdn-shop.adafruit.com/datasheets/WS2812B.pdf (WS2812B datasheet: data is sent in GRB order; operating VDD 4.5 to 5.5 V; the product page says WS2812B or SK6812 with the same protocol)"
      }
    ],
    "ledOutput": {
      "form": "matrix",
      "width": 16,
      "height": 16,
      "pitchMm": 10.0,
      "chipset": "WS2812B",
      "colorOrder": "GRB",
      "supplyVolts": 5,
      "fullWhiteMa": 60
    }
  },
  "ws2812b-ring-12": {
    "manifestVersion": 1,
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
    "render": {
      "file": "parts/ws2812b-ring-12.webp",
      "widthPx": 452,
      "heightPx": 452,
      "pxPerMm": 12.0
    },
    "revision": 1,
    "partTypes": [
      "MatrixOutput"
    ],
    "categories": [
      "led-rings"
    ],
    "verification": "reviewed",
    "sources": [
      {
        "facts": [
          "dimensionsMm"
        ],
        "ref": "https://learn.adafruit.com/adafruit-neopixel-uberguide/neopixel-rings"
      },
      {
        "facts": [
          "ledOutput"
        ],
        "ref": "https://cdn-shop.adafruit.com/datasheets/WS2812B.pdf (WS2812B datasheet: data is sent in GRB order; operating VDD 4.5 to 5.5 V)"
      },
      {
        "facts": [
          "ledOutput"
        ],
        "ref": "https://learn.adafruit.com/adafruit-neopixel-uberguide/powering-neopixels (worst case 60 mA per pixel at full white; the datasheet gives no total)"
      }
    ],
    "ledOutput": {
      "form": "ring",
      "count": 12,
      "diameterMm": 37.0,
      "chipset": "WS2812B",
      "colorOrder": "GRB",
      "supplyVolts": 5,
      "fullWhiteMa": 60
    }
  },
  "ws2812b-ring-16": {
    "manifestVersion": 1,
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
    "render": {
      "file": "parts/ws2812b-ring-16.webp",
      "widthPx": 542,
      "heightPx": 542,
      "pxPerMm": 12.0
    },
    "revision": 1,
    "partTypes": [
      "MatrixOutput"
    ],
    "categories": [
      "led-rings"
    ],
    "verification": "reviewed",
    "sources": [
      {
        "facts": [
          "dimensionsMm"
        ],
        "ref": "https://learn.adafruit.com/adafruit-neopixel-uberguide/neopixel-rings"
      },
      {
        "facts": [
          "ledOutput"
        ],
        "ref": "https://cdn-shop.adafruit.com/datasheets/WS2812B.pdf (WS2812B datasheet: data is sent in GRB order; operating VDD 4.5 to 5.5 V)"
      },
      {
        "facts": [
          "ledOutput"
        ],
        "ref": "https://learn.adafruit.com/adafruit-neopixel-uberguide/powering-neopixels (worst case 60 mA per pixel at full white; the datasheet gives no total)"
      }
    ],
    "ledOutput": {
      "form": "ring",
      "count": 16,
      "diameterMm": 44.5,
      "chipset": "WS2812B",
      "colorOrder": "GRB",
      "supplyVolts": 5,
      "fullWhiteMa": 60
    }
  },
  "ws2812b-ring-24": {
    "manifestVersion": 1,
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
    "render": {
      "file": "parts/ws2812b-ring-24.webp",
      "widthPx": 794,
      "heightPx": 794,
      "pxPerMm": 12.0
    },
    "revision": 1,
    "partTypes": [
      "MatrixOutput"
    ],
    "categories": [
      "led-rings"
    ],
    "verification": "reviewed",
    "sources": [
      {
        "facts": [
          "dimensionsMm"
        ],
        "ref": "https://learn.adafruit.com/adafruit-neopixel-uberguide/neopixel-rings"
      },
      {
        "facts": [
          "ledOutput"
        ],
        "ref": "https://cdn-shop.adafruit.com/datasheets/WS2812B.pdf (WS2812B datasheet: data is sent in GRB order; operating VDD 4.5 to 5.5 V)"
      },
      {
        "facts": [
          "ledOutput"
        ],
        "ref": "https://learn.adafruit.com/adafruit-neopixel-uberguide/powering-neopixels (worst case 60 mA per pixel at full white; the datasheet gives no total)"
      }
    ],
    "ledOutput": {
      "form": "ring",
      "count": 24,
      "diameterMm": 65.5,
      "chipset": "WS2812B",
      "colorOrder": "GRB",
      "supplyVolts": 5,
      "fullWhiteMa": 60
    }
  },
  "ws2812b-ring-60": {
    "manifestVersion": 1,
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
    "render": {
      "file": "parts/ws2812b-ring-60.webp",
      "widthPx": 1200,
      "heightPx": 1200,
      "pxPerMm": 7.544
    },
    "revision": 1,
    "partTypes": [
      "MatrixOutput"
    ],
    "categories": [
      "led-rings"
    ],
    "verification": "reviewed",
    "sources": [
      {
        "facts": [
          "dimensionsMm"
        ],
        "ref": "https://learn.adafruit.com/adafruit-neopixel-uberguide/neopixel-rings"
      },
      {
        "facts": [
          "ledOutput"
        ],
        "ref": "https://cdn-shop.adafruit.com/datasheets/WS2812B.pdf (WS2812B datasheet: data is sent in GRB order; operating VDD 4.5 to 5.5 V)"
      },
      {
        "facts": [
          "ledOutput"
        ],
        "ref": "https://learn.adafruit.com/adafruit-neopixel-uberguide/powering-neopixels (worst case 60 mA per pixel at full white; the datasheet gives no total)"
      }
    ],
    "ledOutput": {
      "form": "ring",
      "count": 60,
      "diameterMm": 158.0,
      "chipset": "WS2812B",
      "colorOrder": "GRB",
      "supplyVolts": 5,
      "fullWhiteMa": 60
    }
  },
  "ws2812b-ring-8": {
    "manifestVersion": 1,
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
    "render": {
      "file": "parts/ws2812b-ring-8.webp",
      "widthPx": 400,
      "heightPx": 400,
      "pxPerMm": 12.174
    },
    "revision": 1,
    "partTypes": [
      "MatrixOutput"
    ],
    "categories": [
      "led-rings"
    ],
    "verification": "reviewed",
    "sources": [
      {
        "facts": [
          "dimensionsMm"
        ],
        "ref": "https://www.berrybase.de/Sensoren-/-Module/LED/WS2812-/-13-Neopixel/Ringe/NeoPixel-Ring-mit-8-WS2812-5050-RGB-LEDs/"
      },
      {
        "facts": [
          "render"
        ],
        "ref": "https://core-electronics.com.au/cjmcu-8-bit-ws2812-5050-rgb-led-built-in-full-color-driving-lights.html"
      },
      {
        "facts": [
          "ledOutput"
        ],
        "ref": "https://www.berrybase.de/Sensoren-/-Module/LED/WS2812-/-13-Neopixel/Ringe/NeoPixel-Ring-mit-8-WS2812-5050-RGB-LEDs/ (sold as 8 WS2812 5050 LEDs)"
      },
      {
        "facts": [
          "ledOutput"
        ],
        "ref": "https://cdn-shop.adafruit.com/datasheets/WS2812B.pdf (WS2812B datasheet: data is sent in GRB order; operating VDD 4.5 to 5.5 V)"
      },
      {
        "facts": [
          "ledOutput"
        ],
        "ref": "https://learn.adafruit.com/adafruit-neopixel-uberguide/powering-neopixels (worst case 60 mA per pixel at full white; the datasheet gives no total)"
      }
    ],
    "ledOutput": {
      "form": "ring",
      "count": 8,
      "diameterMm": 32.2,
      "chipset": "WS2812B",
      "colorOrder": "GRB",
      "supplyVolts": 5,
      "fullWhiteMa": 60
    }
  },
  "ws2812b-strip": {
    "manifestVersion": 1,
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
    "render": {
      "file": "parts/ws2812b-strip.webp",
      "widthPx": 1200,
      "heightPx": 157,
      "pxPerMm": 11.896
    },
    "revision": 1,
    "partTypes": [
      "MatrixOutput"
    ],
    "categories": [
      "led-strips"
    ],
    "verification": "reviewed",
    "sources": [
      {
        "facts": [
          "logicVoltage"
        ],
        "ref": "https://www.adafruit.com/product/2541"
      },
      {
        "facts": [
          "render",
          "notes"
        ],
        "ref": "https://learn.adafruit.com/adafruit-neopixel-uberguide/neopixel-strips"
      },
      {
        "facts": [
          "ledOutput"
        ],
        "ref": "https://www.adafruit.com/product/2541 (5 VDC, maximum 60 mA per 0.65 in segment with all LEDs at full brightness, 60 LEDs per metre, cut at every LED, full reels are 4 m)"
      },
      {
        "facts": [
          "ledOutput"
        ],
        "ref": "https://cdn-shop.adafruit.com/datasheets/WS2812B.pdf (WS2812B datasheet: data is sent in GRB order; the product page says the strip has the WS2812B pinout, colour order and protocol)"
      }
    ],
    "ledOutput": {
      "form": "strip",
      "pitchMm": 16.7,
      "chipset": "WS2812B",
      "colorOrder": "GRB",
      "supplyVolts": 5,
      "fullWhiteMa": 60,
      "maxCount": 240,
      "cutEvery": 1
    }
  },
  "yynmos-4-lr7843-mosfet-module": {
    "manifestVersion": 1,
    "partId": "yynmos-4-lr7843-mosfet-module",
    "label": "YYNMOS-4 four-channel LR7843 MOSFET module",
    "category": "switching-power",
    "dimensionsMm": {
      "width": 55.0,
      "height": 50.0
    },
    "manufacturer": "generic YYNMOS-4, LR7843 revision (Infineon IRLR7843, Sharp PC817, 78L12 gate regulator)",
    "logicVoltage": "3-20 V active-high per channel (listing), about 5 mA, into a PC817 optocoupler. Each channel's input is its own PWM and GND pair, isolated from the load supply.",
    "pinLabelsLeftToRight": [
      "PWM1",
      "GND1",
      "PWM2",
      "GND2",
      "PWM3",
      "GND3",
      "PWM4",
      "GND4"
    ],
    "notes": [
      "Four opto-isolated low-side DC switches. The load supply goes to DC+ and DC-; each load connects across its channel's OUT+ and OUT- (positive lead to OUT+, negative lead to OUT-). OUT+ is the supply's positive brought out beside each channel; OUT- is the switched negative lead.",
      "Each channel's input is its own PWM and GND pair on the optocoupler side. Wire PWMn to the controller pin and every GNDn to the controller's GND. The inputs are isolated from the load supply, so the controller and the load supply share no ground.",
      "Active-high, 3-20 V and about 5 mA per input according to the listing. A 3.3 V pin is at the bottom of that range: if a channel does not switch on the bench, drive it from 5 V through a transistor or buffer.",
      "The gates are driven from an onboard 78L12 regulator, so they see at most about 12 V whatever the supply. Below about 7 V the regulator cannot hold the gates high enough, so a 5 V rail leaves the MOSFETs half on and hot. Use a 7-28 V DC load supply: the listing says 5-36 V, but the IRLR7843 is rated 30 V.",
      "5 A per channel on the bare board, per the listing; above that, fit a heatsink. Every channel returns through the one DC- terminal, so keep the board total to 10 A.",
      "Each channel has an M7 (1N4007-class, 1 A) diode in the flyback position beside its MOSFET. That covers relay coils and solenoids switched on and off; a motor dimmed with PWM above about 1 A needs its own fast diode rated for its current.",
      "The screw terminals are fitted at 5.08 mm pitch. This revision prints no terminal names on its top face; the order shown follows the names the YYNMOS-4 family prints on its underside, so check it against the board in hand before applying power."
    ],
    "mosfet": {
      "channels": 4,
      "device": "Infineon IRLR7843 N-channel (30 V, D-PAK) per channel, low-side",
      "trigger": "active-high",
      "loadSupply": "7-28 V DC",
      "continuousCurrent": "5 A per channel on the bare board (listing), 10 A in total through the shared DC- terminal",
      "optoIsolated": true,
      "flybackDiode": true,
      "channelLabels": [
        "1",
        "2",
        "3",
        "4"
      ],
      "channelInputLabels": [
        "PWM1",
        "PWM2",
        "PWM3",
        "PWM4"
      ],
      "loadTerminals": [
        "DC+",
        "DC-",
        "OUT1+",
        "OUT1-",
        "OUT2+",
        "OUT2-",
        "OUT3+",
        "OUT3-",
        "OUT4+",
        "OUT4-"
      ],
      "pwmHz": 500
    },
    "render": {
      "file": "parts/yynmos-4-lr7843-mosfet-module.webp",
      "widthPx": 680,
      "heightPx": 620,
      "pxPerMm": 12.0
    },
    "revision": 1,
    "partTypes": [
      "PowerSwitchOutput"
    ],
    "categories": [
      "switching-mosfet"
    ],
    "verification": "reviewed",
    "sources": [
      {
        "facts": [
          "dimensionsMm",
          "pinLabelsLeftToRight",
          "logicVoltage",
          "render",
          "mosfet"
        ],
        "ref": "Seller listing (2026-10-08) (local copy in the asset workspace)"
      },
      {
        "facts": [
          "dimensionsMm",
          "pinLabelsLeftToRight",
          "mosfet"
        ],
        "ref": "https://www.amazon.com/dp/B09KTKMR8P"
      },
      {
        "facts": [
          "dimensionsMm",
          "pinLabelsLeftToRight",
          "mosfet"
        ],
        "ref": "https://www.amazon.com/dp/B08SJQTQ4Y"
      },
      {
        "facts": [
          "dimensionsMm",
          "pinLabelsLeftToRight",
          "mosfet"
        ],
        "ref": "https://www.amazon.com/dp/B07QGXY7F3"
      },
      {
        "facts": [
          "dimensionsMm",
          "pinLabelsLeftToRight",
          "mosfet"
        ],
        "ref": "https://www.amazon.com/dp/B09Q4QM9WJ"
      },
      {
        "facts": [
          "dimensionsMm",
          "logicVoltage",
          "mosfet"
        ],
        "ref": "https://www.infineon.com/dgdl/irlr7843pbf.pdf?fileId=5546d462533600a40153566de53526d8"
      },
      {
        "facts": [
          "dimensionsMm",
          "pinLabelsLeftToRight",
          "logicVoltage"
        ],
        "ref": "https://www.farnell.com/datasheets/73758.pdf"
      },
      {
        "facts": [
          "dimensionsMm",
          "logicVoltage",
          "mosfet"
        ],
        "ref": "https://www.ti.com/lit/ds/symlink/ua78l.pdf"
      },
      {
        "facts": [
          "pinLabelsLeftToRight",
          "logicVoltage",
          "mosfet"
        ],
        "ref": "https://michiel.vanderwulp.be/domotica/Modules/MosFetPwmModuleYYNMOS1/"
      }
    ],
    "copy": {
      "summary": "Four isolated DC switches or dimmers, 7-28 V",
      "wiringNote": "DC only, 5 A a channel and 10 A for the board. Wire each PWM pin and every GND1-GND4 to the controller. Not for 5 V rails: the gate drive needs 7 V.",
      "optionLabel": "YYNMOS-4 (LR7843)"
    },
    "pads": [
      {
        "label": "PWM1",
        "xPx": 199.7,
        "yPx": 564.4
      },
      {
        "label": "GND1",
        "xPx": 260.7,
        "yPx": 564.4
      },
      {
        "label": "PWM2",
        "xPx": 321.6,
        "yPx": 564.4
      },
      {
        "label": "GND2",
        "xPx": 382.6,
        "yPx": 564.4
      },
      {
        "label": "PWM3",
        "xPx": 443.6,
        "yPx": 564.4
      },
      {
        "label": "GND3",
        "xPx": 504.5,
        "yPx": 564.4
      },
      {
        "label": "PWM4",
        "xPx": 565.5,
        "yPx": 564.4
      },
      {
        "label": "GND4",
        "xPx": 626.4,
        "yPx": 564.4
      }
    ],
    "padHoleRadiusPx": 18.6,
    "supplyRail": "none"
  },
  "zy12pdn-usb-c-pd-trigger": {
    "manifestVersion": 1,
    "partId": "zy12pdn-usb-c-pd-trigger",
    "label": "ZY12PDN USB-C PD trigger module",
    "category": "power-conversion",
    "dimensionsMm": {
      "width": 15.0,
      "height": 31.0
    },
    "manufacturer": "ZY12PDN / Joy-IT COM-ZY12PDN, solder-pad variant",
    "logicVoltage": "Negotiates 5, 9, 12, 15 or 20 V from a USB-C PD source; up to 5 A (100 W with a suitable cable and source)",
    "pinLabelsLeftToRight": [
      "VOUT+",
      "VOUT-"
    ],
    "notes": [
      "Asks a USB-C power-delivery charger for a fixed voltage, 5, 9, 12, 15 or 20 V, and passes it to the output pads. It is a power source, not a signal device: nothing on it connects to a GPIO.",
      "The chosen voltage is set by the onboard button or solder pads, and the RGB LED colour shows which. Set it before connecting anything that cannot take that voltage; the output sits at the requested voltage as soon as the charger is plugged in.",
      "Up to 5 A (about 100 W) depends on the charger and the cable, and the charger must support PD. A plain 5 V USB charger will not negotiate.",
      "The pictured board marks the left output pad - and the right one + with the USB-C at the bottom. Read the silkscreen on your own board before connecting; a reversed supply can destroy the load.",
      "The 31 x 15 mm size is the solder-pad variant; variants with a USB-A socket or a screw terminal are larger. Five small pads beside the output pads select the voltage on this board."
    ],
    "pdTrigger": {
      "protocols": "USB PD 2.0 / 3.0; QC 2.0 / 3.0 detection",
      "selectableVoltagesV": [
        5,
        9,
        12,
        15,
        20
      ],
      "defaultVoltageV": 12,
      "maxCurrentA": 5,
      "maxPowerW": 100,
      "selection": "button and solder pads; RGB LED colour shows the chosen voltage"
    },
    "render": {
      "file": "parts/zy12pdn-usb-c-pd-trigger.webp",
      "widthPx": 400,
      "heightPx": 805,
      "pxPerMm": 25.333,
      "indicators": [
        {
          "rectPx": [
            317.0,
            294.6,
            19.3,
            38.5
          ],
          "color": [
            40,
            255,
            60
          ],
          "drive": "voltage",
          "colorsByVoltage": {
            "5": [
              255,
              32,
              24
            ],
            "9": [
              255,
              200,
              0
            ],
            "12": [
              40,
              255,
              60
            ],
            "15": [
              0,
              230,
              255
            ],
            "20": [
              40,
              90,
              255
            ]
          }
        }
      ]
    },
    "revision": 1,
    "partTypes": [
      "PdTriggerSource"
    ],
    "categories": [
      "power-usb-pd"
    ],
    "verification": "reviewed",
    "sources": [
      {
        "facts": [
          "pinLabelsLeftToRight",
          "logicVoltage"
        ],
        "ref": "https://joy-it.net/en/products/COM-ZY12PDN"
      },
      {
        "facts": [
          "pinLabelsLeftToRight"
        ],
        "ref": "https://make.net.za/product/usb-type-c-pd-trigger-module-zy12pdn/"
      }
    ],
    "copy": {
      "summary": "Asks a USB-C charger for 5, 9, 12, 15 or 20 V",
      "wiringNote": "A power source, not a signal device: nothing connects to a GPIO. Set the voltage on the board before connecting a load, because its output sits at that voltage as soon as the charger is plugged in. The charger must support PD. Read the silkscreen on your own board for polarity.",
      "optionLabel": "ZY12PDN"
    }
  },
}
