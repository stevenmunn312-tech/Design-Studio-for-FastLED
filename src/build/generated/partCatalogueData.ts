// GENERATED FILE — do not edit by hand.
// Produced by scripts/assets/import-part-assets.py from the Blender part assets.
//
// Every dimension here is verified against a datasheet or fabrication
// print in the asset's own part.json. Do not replace one with a figure
// measured off a photograph or remembered — the hardware view draws parts
// at true relative scale, so these numbers are load-bearing.

import type { PartCatalogueEntry } from '../parts/partCatalogue'

export const PART_CATALOGUE_DATA: Record<string, PartCatalogueEntry> = {
  "adafruit-bh1750-light-sensor": {
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
    }
  },
  "adafruit-bme280-environment-sensor": {
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
    }
  },
  "adafruit-ina219-current-sensor": {
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
    }
  },
  "adafruit-mpr121-touch-sensor": {
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
    }
  },
  "adafruit-pca9685-pwm-driver": {
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
    }
  },
  "adafruit-vl53l0x-distance-sensor": {
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
      "The address is 0x29 and no jumper changes it. Two sensors on one bus need their SHDN (XSHUT) pins driven separately at start-up.",
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
    }
  },
  "adafruit-vl53l1x-distance-sensor": {
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
      "The address is 0x29 at power-up and software can change it, but two sensors on one bus need their XSHUT pins driven separately at start-up.",
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
    }
  },
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
  "ds18b20-waterproof-probe": {
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
    }
  },
  "dx-0809-stereo-amplifier": {
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
    }
  },
  "generic-i2s-mems-microphone": {
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
    }
  },
  "gy-521-mpu6050-module": {
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
    }
  },
  "hc-sr04-ultrasonic-module": {
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
  "hlk-ld2410c-presence-sensor": {
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
  "ics-43434-i2s-microphone": {
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
    }
  },
  "ili9341-xc4630-parallel-touch-320x240": {
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
    }
  },
  "ina226-current-sensor-module": {
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
  "keyestudio-ks0026-ir-receiver-module": {
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
    }
  },
  "ky-012-active-buzzer-module": {
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
    }
  },
  "ky-022-ir-receiver-module": {
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
    }
  },
  "ky-023-joystick-module": {
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
    }
  },
  "lm2596-buck-module": {
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
      "adjustable": true
    },
    "render": {
      "file": "parts/lm2596-buck-module.webp",
      "widthPx": 539,
      "heightPx": 273,
      "pxPerMm": 12.019
    }
  },
  "lr7843-mosfet-module": {
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
    }
  },
  "matrix-keypad-4x4": {
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
    }
  },
  "max485-rs485-module": {
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
      "Low-cost supplier revisions change silkscreen and resistor placement. Follow the markings on the exact board in hand."
    ],
    "render": {
      "file": "parts/max485-rs485-module.webp",
      "widthPx": 400,
      "heightPx": 1160,
      "pxPerMm": 25.333,
      "indicators": [
        {
          "rectPx": [
            248.6,
            399.2,
            29.4,
            29.6
          ],
          "color": [
            255,
            15,
            8
          ],
          "drive": "power"
        }
      ]
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
  "max98357a-stereo-pair": {
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
    }
  },
  "mean-well-sd-100a-5": {
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
    }
  },
  "mean-well-sd-100b-5": {
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
  "monkmakes-mosfetti": {
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
    }
  },
  "nled-pixel-data-extender-pair": {
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
  "pam8610-stereo-amplifier": {
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
  "rcwl-0516-microwave-motion-module": {
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
    }
  },
  "relay-module-1ch-5v": {
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
      "optoIsolated": true
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
    }
  },
  "relay-module-2ch-5v": {
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
      "The onboard JD-VCC configuration block retains its fitted three-pin header and jumper cap. Remove the jumper when using a separately powered relay-coil supply and follow the markings on the owned board.",
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
      "optoIsolated": true
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
    }
  },
  "relay-module-4ch-5v": {
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
      "The onboard JD-VCC configuration block retains its fitted three-pin header and jumper cap. Remove the jumper when using a separately powered relay-coil supply and follow the markings on the owned board.",
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
      "optoIsolated": true
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
    }
  },
  "relay-module-8ch-5v": {
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
      "The onboard JD-VCC configuration block retains its fitted three-pin header and jumper cap. Remove the jumper when using a separately powered relay-coil supply and follow the markings on the owned board.",
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
      "optoIsolated": true
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
    }
  },
  "seeed-grove-touch-sensor": {
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
    }
  },
  "sh1106-oled-096-128x64-spi": {
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
    }
  },
  "sh1106-oled-128x64": {
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
    }
  },
  "sh1106-oled-128x64-i2c": {
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
  "sph0645lm4h-i2s-microphone": {
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
    }
  },
  "ssd1306-oled-096-128x64-i2c": {
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
    }
  },
  "st7789-tft-240x240": {
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
    }
  },
  "st7789v-xpt2046-touch-240x320": {
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
    }
  },
  "tsop38238-ir-receiver": {
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
  "uln2803a-dip18": {
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
    }
  },
  "wiz850io-ethernet-module": {
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
  "zy12pdn-usb-c-pd-trigger": {
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
    }
  },
}
