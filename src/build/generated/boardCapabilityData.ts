// GENERATED FILE — do not edit by hand.
// Produced by scripts/import-board-assets.py from the Blender board assets.
// Merged into BOARD_PROFILES by boardProfiles.ts; hand-authored pin maps win.

import type { BoardCapabilityData } from '../boardCapabilities'

export const BOARD_CAPABILITY_DATA: Record<string, BoardCapabilityData> = {
  "adafruit-feather-esp32-s2": {
    pinSafety: {
      safeGeneralPurpose: [5, 6, 8, 9, 10, 11, 12, 15, 35, 36, 37, 38, 39],
      useWithCaution: {
        "13": "Also drives the onboard red user LED.",
        "3": "Default I2C and STEMMA QT signals with 5 kOhm pull-ups.",
        "4": "Default I2C and STEMMA QT signals with 5 kOhm pull-ups.",
        "18": "The two DAC outputs and ADC2 inputs.",
        "17": "The two DAC outputs and ADC2 inputs.",
        "16": "ADC2-capable analog inputs.",
        "14": "ADC2-capable analog inputs.",
      },
      boardReservedOrNotExposed: {
        "0": "Boot/DFU button.",
        "7": "Switchable I2C/STEMMA power control.",
        "19": "Native USB D- and D+.",
        "20": "Native USB D- and D+.",
        "21": "NeoPixel and I2C peripheral power control on current revisions.",
        "33": "Onboard NeoPixel data.",
      },
    },
    safetyNotes: [
      "Adafruit states that none of the exposed logic pins are special bootstrapping pins and that they support input or output with internal pulls.",
      "GPIO uses 3.3 V logic and is not 5 V tolerant.",
    ],
    peripheralPins: {
      inmp441: {
        wsLrclk: 10,
        sckBclk: 11,
        sdDout: 12,
      },
    },
    render: {
      file: "boards/adafruit-feather-esp32-s2.webp",
      widthPx: 700,
      heightPx: 1298,
    },
  },
  "adafruit-feather-esp32-s3": {
    pinSafety: {
      safeGeneralPurpose: [4, 5, 6, 8, 9, 10, 11, 12, 14, 15, 16, 17, 18, 35, 36, 37, 38, 39],
      useWithCaution: {},
      boardReservedOrNotExposed: {},
    },
    safetyNotes: [
      "3V3 is regulated 3.3 V",
      "VBUS is USB 5 V",
      "VBAT is the battery rail",
      "All ESP32-S3 GPIO uses 3.3 V logic and is not 5 V tolerant",
    ],
    peripheralPins: {
      inmp441: {
        wsLrclk: 10,
        sckBclk: 11,
        sdDout: 12,
      },
    },
    render: {
      file: "boards/adafruit-feather-esp32-s3.webp",
      widthPx: 700,
      heightPx: 1416,
    },
  },
  "adafruit-feather-esp32-v2": {
    pinSafety: {
      safeGeneralPurpose: [],
      useWithCaution: {
        "37": "inputOnly",
        "34": "inputOnly",
        "39": "inputOnly",
        "36": "inputOnly",
      },
      boardReservedOrNotExposed: {},
    },
    safetyNotes: [
      "GPIO0 drives the onboard NeoPixel data line.",
      "GPIO2 controls NeoPixel and STEMMA QT power.",
      "GPIO38 is the onboard user button.",
      "TX/GPIO8 and RX/GPIO7 are the board UART pins; avoid them when serial communication is required.",
      "Classic ESP32 ADC2 analog conversions can fail while Wi-Fi is active; prefer ADC1 pins for analog input when Wi-Fi is in use.",
    ],
    peripheralPins: {
      inmp441: {
        wsLrclk: 32,
        sckBclk: 14,
        sdDout: 33,
      },
      max98357: {
        bclk: 14,
        lrc: 32,
        din: 27,
      },
      fastLedData: {
        recommendedDefault: 27,
        commonAlternatives: [32, 33, 14],
        selectionNote: "Choose a pin not already assigned to I2S in the particular build; avoid boot-strapping pins for the default.",
      },
    },
    render: {
      file: "boards/adafruit-feather-esp32-v2.webp",
      widthPx: 700,
      heightPx: 1298,
    },
  },
  "esp32-devkit-v1-30pin-esp32d": {
    pinSafety: {
      safeGeneralPurpose: [13, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33],
      useWithCaution: {
        "2": "External circuitry must not force a strapping pin to the wrong level during reset. GPIO12 is especially important because its boot level can select the flash voltage.",
        "5": "External circuitry must not force a strapping pin to the wrong level during reset. GPIO12 is especially important because its boot level can select the flash voltage.",
        "12": "External circuitry must not force a strapping pin to the wrong level during reset. GPIO12 is especially important because its boot level can select the flash voltage.",
        "15": "External circuitry must not force a strapping pin to the wrong level during reset. GPIO12 is especially important because its boot level can select the flash voltage.",
        "34": "GPIO34-39 cannot drive outputs and do not have internal pull-up or pull-down resistors.",
        "35": "GPIO34-39 cannot drive outputs and do not have internal pull-up or pull-down resistors.",
        "36": "GPIO34-39 cannot drive outputs and do not have internal pull-up or pull-down resistors.",
        "39": "GPIO34-39 cannot drive outputs and do not have internal pull-up or pull-down resistors.",
      },
      boardReservedOrNotExposed: {},
    },
    safetyNotes: [
      "GPIO1/TX0 and GPIO3/RX0 are the default programming and log UART; attached hardware can interfere with upload or boot messages.",
      "ADC2 analog reads can fail while Wi-Fi is active. Exposed ADC2 pins include GPIO2, GPIO4, GPIO12-15, and GPIO25-27.",
      "GPIO6-11 are connected to flash on typical ESP32-WROOM-32 modules and are not exposed for normal use on this board.",
      "GPIO uses 3.3 V logic and is not 5 V tolerant.",
    ],
    peripheralPins: {
      inmp441: {
        wsLrclk: 32,
        sckBclk: 33,
        sdDout: 34,
      },
    },
    render: {
      file: "boards/esp32-devkit-v1-30pin-esp32d.webp",
      widthPx: 700,
      heightPx: 1427,
    },
  },
  "esp32-generic-devkit-38pin": {
    pinSafety: {
      safeGeneralPurpose: [13, 14, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33],
      useWithCaution: {},
      boardReservedOrNotExposed: {},
    },
    safetyNotes: [
      "GPIO6, GPIO7, GPIO8, GPIO9, GPIO10 and GPIO11 are connected to the ESP32 module's SPI flash on this layout.",
      "GPIO34, GPIO35, GPIO36 and GPIO39 are input-only and have no internal pull-up/pull-down.",
      "ADC2 pins can be unavailable to analogRead while Wi-Fi is active.",
    ],
    peripheralPins: {
      inmp441: {
        wsLrclk: 25,
        sckBclk: 26,
        sdDout: 33,
      },
      max98357: {
        bclk: 27,
        lrc: 14,
        din: 22,
      },
      fastLedData: {
        recommendedDefault: 18,
        commonAlternatives: [],
      },
    },
    render: {
      file: "boards/esp32-generic-devkit-38pin.webp",
      widthPx: 700,
      heightPx: 1503,
    },
  },
  "espressif-esp32-devkitc-v4-38pin": {
    pinSafety: {
      safeGeneralPurpose: [],
      useWithCaution: {
        "0": "bootCaution",
        "2": "bootCaution",
        "5": "bootCaution",
        "12": "bootCaution",
        "15": "bootCaution",
      },
      boardReservedOrNotExposed: {},
    },
    safetyNotes: [
      "D0/GPIO7, D1/GPIO8, D2/GPIO9, D3/GPIO10, CMD/GPIO11 and CLK/GPIO6 are used by module flash or PSRAM.",
      "GPIO34, GPIO35, GPIO36 and GPIO39 are input-only and have no internal pull-up/pull-down.",
      "GPIO16 and GPIO17 are reserved for internal use on ESP32-WROVER module versions; they are available on WROOM/SOLO-1 versions.",
      "GPIO1 and GPIO3 are the default programming/debug UART.",
      "ADC2 analog conversions conflict with active Wi-Fi on classic ESP32.",
    ],
    peripheralPins: {
      inmp441: {
        wsLrclk: 25,
        sckBclk: 26,
        sdDout: 33,
      },
      max98357: {
        bclk: 27,
        lrc: 14,
        din: 22,
      },
      fastLedData: {
        recommendedDefault: 18,
        commonAlternatives: [13, 19, 23],
      },
    },
    render: {
      file: "boards/espressif-esp32-devkitc-v4-38pin.webp",
      widthPx: 700,
      heightPx: 1503,
    },
  },
  "espressif-esp32-s2-devkitc-1": {
    pinSafety: {
      safeGeneralPurpose: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 21, 33, 34, 35, 36, 37, 38],
      useWithCaution: {
        "0": "Boot-strapping pin.",
        "11": "ADC2 and touch-capable pins; check peripheral and radio interactions before using them for analog input.",
        "12": "ADC2 and touch-capable pins; check peripheral and radio interactions before using them for analog input.",
        "13": "ADC2 and touch-capable pins; check peripheral and radio interactions before using them for analog input.",
        "14": "ADC2 and touch-capable pins; check peripheral and radio interactions before using them for analog input.",
        "15": "Multipurpose ADC2/DAC/UART-capable pins; safe digitally when those functions are not required.",
        "16": "Multipurpose ADC2/DAC/UART-capable pins; safe digitally when those functions are not required.",
        "17": "Multipurpose ADC2/DAC/UART-capable pins; safe digitally when those functions are not required.",
        "18": "Drives the onboard addressable RGB LED.",
        "19": "Native USB D- and D+; keep free when native USB is required.",
        "20": "Native USB D- and D+; keep free when native USB is required.",
        "39": "Default JTAG signals.",
        "40": "Default JTAG signals.",
        "41": "Default JTAG signals.",
        "42": "Default JTAG signals.",
        "45": "Boot-strapping pin.",
        "46": "Boot-strapping, input-only, and has no internal pull resistor.",
        "43": "Default USB-to-UART TX and RX aliases on this board.",
        "44": "Default USB-to-UART TX and RX aliases on this board.",
      },
      boardReservedOrNotExposed: {
        "22": "Not present on ESP32-S2.",
        "23": "Not present on ESP32-S2.",
        "24": "Not present on ESP32-S2.",
        "25": "Not present on ESP32-S2.",
        "26": "Connected internally to flash or PSRAM on common ESP32-S2 modules.",
        "27": "Connected internally to flash or PSRAM on common ESP32-S2 modules.",
        "28": "Connected internally to flash or PSRAM on common ESP32-S2 modules.",
        "29": "Connected internally to flash or PSRAM on common ESP32-S2 modules.",
        "30": "Connected internally to flash or PSRAM on common ESP32-S2 modules.",
        "31": "Connected internally to flash or PSRAM on common ESP32-S2 modules.",
        "32": "Connected internally to flash or PSRAM on common ESP32-S2 modules.",
      },
    },
    peripheralPins: {
      inmp441: {
        wsLrclk: 33,
        sckBclk: 34,
        sdDout: 35,
      },
      fastLedData: {
        recommendedDefault: 21,
        commonAlternatives: [16, 17, 33, 38],
        selectionNote: "Choose a pin not already assigned to I2S; avoid strapping pins and GPIO19/20 when native USB is needed.",
      },
    },
    render: {
      file: "boards/espressif-esp32-s2-devkitc-1.webp",
      widthPx: 700,
      heightPx: 1924,
    },
  },
  "espressif-esp32-s3-devkitc-1": {
    pinSafety: {
      safeGeneralPurpose: [1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 21, 39, 40, 41, 42, 47],
      useWithCaution: {
        "0": "Do not let attached hardware force strapping pins to an incompatible level during reset.",
        "3": "Do not let attached hardware force strapping pins to an incompatible level during reset.",
        "45": "Do not let attached hardware force strapping pins to an incompatible level during reset.",
        "46": "Do not let attached hardware force strapping pins to an incompatible level during reset.",
      },
      boardReservedOrNotExposed: {
        "35": "The selected N8R8 module uses octal PSRAM, so GPIO35-37 are reserved and must not be used even though the header exposes them.",
        "36": "The selected N8R8 module uses octal PSRAM, so GPIO35-37 are reserved and must not be used even though the header exposes them.",
        "37": "The selected N8R8 module uses octal PSRAM, so GPIO35-37 are reserved and must not be used even though the header exposes them.",
      },
    },
    safetyNotes: [
      "GPIO38 drives the addressable RGB LED on DevKitC-1 v1.1.",
      "GPIO19 and GPIO20 are native USB D- and D+.",
      "GPIO43 and GPIO44 are the default UART0 TX and RX.",
      "GPIO39-42 are default JTAG signals; choose other pins if hardware debugging is required.",
      "GPIO26-32 are used internally for flash/PSRAM and are not general-purpose header pins.",
      "GPIO uses 3.3 V logic and is not 5 V tolerant.",
    ],
    peripheralPins: {
      inmp441: {
        wsLrclk: 39,
        sckBclk: 40,
        sdDout: 41,
      },
    },
    render: {
      file: "boards/espressif-esp32-s3-devkitc-1.webp",
      widthPx: 700,
      heightPx: 1924,
    },
  },
  "generic-esp32-s3-n16r8-44pin-dual-usbc": {
    pinSafety: {
      safeGeneralPurpose: [1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 21, 38, 39, 40, 41, 42, 47, 48],
      useWithCaution: {
        "0": "Do not let attached hardware force strapping pins to an incompatible level during reset.",
        "3": "Do not let attached hardware force strapping pins to an incompatible level during reset.",
        "45": "Do not let attached hardware force strapping pins to an incompatible level during reset.",
        "46": "Do not let attached hardware force strapping pins to an incompatible level during reset.",
      },
      boardReservedOrNotExposed: {
        "35": "The N16R8 module uses octal PSRAM, so GPIO35-37 are reserved and must not be used even if a seller routes them to the header.",
        "36": "The N16R8 module uses octal PSRAM, so GPIO35-37 are reserved and must not be used even if a seller routes them to the header.",
        "37": "The N16R8 module uses octal PSRAM, so GPIO35-37 are reserved and must not be used even if a seller routes them to the header.",
      },
    },
    safetyNotes: [
      "GPIO19 and GPIO20 are native USB D- and D+.",
      "GPIO43 and GPIO44 are normally UART0 TX and RX.",
      "GPIO39-42 are default JTAG signals; choose other pins if hardware debugging is required.",
      "Generic 44-pin boards vary by seller. Confirm whether GPIO48 or another GPIO drives an onboard RGB LED before assigning it.",
      "GPIO26-32 are used internally for flash/PSRAM and are not normal general-purpose header pins.",
      "GPIO uses 3.3 V logic and is not 5 V tolerant.",
    ],
    peripheralPins: {
      inmp441: {
        wsLrclk: 39,
        sckBclk: 40,
        sdDout: 41,
      },
    },
    render: {
      file: "boards/generic-esp32-s3-n16r8-44pin-dual-usbc.webp",
      widthPx: 700,
      heightPx: 1650,
    },
  },
  "lolin-s2-mini": {
    pinSafety: {
      safeGeneralPurpose: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 16, 21, 33, 34, 35, 36, 37, 38],
      useWithCaution: {
        "11": "ADC2 and touch-capable pins; verify analog use when Wi-Fi is active.",
        "12": "ADC2 and touch-capable pins; verify analog use when Wi-Fi is active.",
        "13": "ADC2 and touch-capable pins; verify analog use when Wi-Fi is active.",
        "14": "ADC2 and touch-capable pins; verify analog use when Wi-Fi is active.",
        "15": "Connected to the onboard blue status LED.",
        "39": "Default JTAG-capable signals; free digitally when JTAG is not used.",
        "40": "Default JTAG-capable signals; free digitally when JTAG is not used.",
        "17": "DAC-capable pins; safe digitally when DAC output is not required.",
        "18": "DAC-capable pins; safe digitally when DAC output is not required.",
      },
      boardReservedOrNotExposed: {
        "0": "Boot-strapping pin connected to the onboard BOOT button; not on the header.",
        "19": "Native USB D- and D+; not on the header.",
        "20": "Native USB D- and D+; not on the header.",
        "26": "Internal flash/PSRAM connections.",
        "27": "Internal flash/PSRAM connections.",
        "28": "Internal flash/PSRAM connections.",
        "29": "Internal flash/PSRAM connections.",
        "30": "Internal flash/PSRAM connections.",
        "31": "Internal flash/PSRAM connections.",
        "32": "Internal flash/PSRAM connections.",
        "45": "Boot-strapping signals not exposed on the header; GPIO46 is input-only.",
        "46": "Boot-strapping signals not exposed on the header; GPIO46 is input-only.",
      },
    },
    safetyNotes: [
      "Early v1.0.0 boards had GPIO12 and GPIO13 reversed on the physical silkscreen. The package uses the corrected electrical pinout; WEMOS fixed the marking without changing the version number.",
    ],
    peripheralPins: {
      inmp441: {
        wsLrclk: 33,
        sckBclk: 34,
        sdDout: 35,
      },
      max98357: {
        bclk: 17,
        lrc: 18,
        din: 16,
      },
      fastLedData: {
        recommendedDefault: 21,
        commonAlternatives: [16, 17, 33, 37],
        selectionNote: "Choose a pin not already used by I2S; GPIO15 is avoided as the default because it drives the onboard LED.",
      },
    },
    processor: "ESP32-S2FN4R2",
    memory: {
      flashMb: 4,
      psramMb: 2,
    },
    render: {
      file: "boards/lolin-s2-mini.webp",
      widthPx: 700,
      heightPx: 994,
    },
  },
  "lolin-s3-40pin-dual-usbc": {
    pinSafety: {
      safeGeneralPurpose: [1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 21, 39, 40, 41, 42, 47, 48],
      useWithCaution: {
        "0": "GPIO0 is also connected to the onboard IO0 button. Do not let attached hardware force a strapping pin to an incompatible level during reset.",
        "3": "GPIO0 is also connected to the onboard IO0 button. Do not let attached hardware force a strapping pin to an incompatible level during reset.",
        "45": "GPIO0 is also connected to the onboard IO0 button. Do not let attached hardware force a strapping pin to an incompatible level during reset.",
        "46": "GPIO0 is also connected to the onboard IO0 button. Do not let attached hardware force a strapping pin to an incompatible level during reset.",
      },
      boardReservedOrNotExposed: {
        "35": "The LOLIN S3 uses an N16R8 module with octal PSRAM; GPIO35-37 are reserved and are not exposed for normal use.",
        "36": "The LOLIN S3 uses an N16R8 module with octal PSRAM; GPIO35-37 are reserved and are not exposed for normal use.",
        "37": "The LOLIN S3 uses an N16R8 module with octal PSRAM; GPIO35-37 are reserved and are not exposed for normal use.",
      },
    },
    safetyNotes: [
      "GPIO38 drives the onboard RGB LED.",
      "GPIO0 is connected to the IO0/boot button.",
      "GPIO19 and GPIO20 are used by the native USB-C port and are not rail pins.",
      "GPIO43 and GPIO44 are the default UART TX and RX.",
      "GPIO41 and GPIO42 are the board's default I2C SCL and SDA.",
      "GPIO39-42 are default JTAG signals.",
      "GPIO uses 3.3 V logic and is not 5 V tolerant.",
    ],
    peripheralPins: {
      inmp441: {
        wsLrclk: 39,
        sckBclk: 40,
        sdDout: 41,
      },
    },
    render: {
      file: "boards/lolin-s3-40pin-dual-usbc.webp",
      widthPx: 700,
      heightPx: 1979,
    },
  },
  "seeed-xiao-esp32s3": {
    pinSafety: {
      safeGeneralPurpose: [1, 2, 4, 5, 6, 7, 8, 9, 43, 44],
      useWithCaution: {
        "3": "GPIO3 is an ESP32-S3 strapping pin. Attached circuitry must not force it to an incompatible level during reset.",
      },
      boardReservedOrNotExposed: {
        "42": "On the bottomExpansion rail, not a main header pin.",
        "41": "On the bottomExpansion rail, not a main header pin.",
        "40": "On the bottomExpansion rail, not a main header pin.",
        "39": "On the bottomExpansion rail, not a main header pin.",
      },
    },
    safetyNotes: [
      "GPIO0 is connected to the boot button and is a strapping pin.",
      "GPIO21 drives the user LED.",
      "GPIO19 and GPIO20 are used by native USB and are not exposed as normal header pins.",
      "D6/GPIO43 and D7/GPIO44 are the default UART RX and TX.",
      "GPIO39-42 on the bottom expansion pads are default JTAG signals.",
      "GPIO45 is a strapping pin.",
      "GPIO46 is a strapping, input-only pin with no internal pull resistors.",
      "GPIO uses 3.3 V logic and is not 5 V tolerant.",
    ],
    peripheralPins: {
      inmp441: {
        wsLrclk: 8,
        sckBclk: 7,
        sdDout: 9,
      },
    },
    render: {
      file: "boards/seeed-xiao-esp32s3.webp",
      widthPx: 700,
      heightPx: 915,
    },
  },
}
