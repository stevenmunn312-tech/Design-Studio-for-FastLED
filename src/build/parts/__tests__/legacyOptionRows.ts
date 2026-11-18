// The Add Hardware rows of the 21 catalogue-derived part types exactly as they were
// written by hand before `partOptions.ts` derived them from the manifests. Frozen
// on purpose: the derivation must reproduce every label, summary, note and the
// order (the first row is the type's default module). Do not regenerate this from
// the catalogue, which would make the test compare the catalogue with itself.

export interface LegacyOptionRow { id: string; label: string; summary?: string; note?: string }

export const LEGACY_OPTION_ROWS: Record<string, LegacyOptionRow[]> = {
  CoolingFanOutput: [
    {
      id: 'noctua-nf-a4x10-5v-pwm',
      label: 'Noctua NF-A4x10 5V PWM',
      summary: '40 mm 5 V fan, 25 kHz PWM control and tachometer feedback',
      note: 'Power it from 5 V. PWM is a 25 kHz active-high controller signal; RPM is an open-collector tachometer output with two pulses per revolution. This first firmware path supports ESP32-family boards.',
    },
  ],
  TemperatureInput: [
    {
      id: 'ds18b20-waterproof-probe',
      label: 'Waterproof DS18B20 probe',
      summary: 'A 1-Wire thermometer in a sealed steel tube, -55 to 125 °C',
      note: 'Red is VCC (3.3 V), black is GND and yellow is DATA. DATA needs a 4.7 kΩ pull-up to 3.3 V; the bare probe has none.',
    },
  ],
  TouchButtonInput: [
    {
      id: 'seeed-grove-touch-sensor',
      label: 'Seeed Grove Touch Sensor',
      summary: 'One active-high capacitive touch button',
      note: 'Power from 3.3 V. SIG is HIGH while touched; NC is not connected.',
    },
  ],
  JoystickInput: [
    {
      id: 'ky-023-joystick-module',
      label: 'KY-023 joystick',
      summary: 'A thumb stick with two analog axes and a push switch',
      note: 'Power it from 3.3 V so the axis voltages stay inside the ADC range. VRx and VRy go to ADC pins, SW to a pin with a pull-up.',
    },
  ],
  PresenceInput: [
    {
      id: 'hlk-ld2410c-presence-sensor',
      label: 'HLK-LD2410C mmWave',
      summary: 'Someone there, moving or still, and how far: up to 6 m',
      note: 'Power from 5 V; its UART is 3.3 V, so its TX wires straight to the board\'s RX pin.',
    },
  ],
  PowerMonitorInput: [
    {
      id: 'adafruit-ina219-current-sensor',
      label: 'Adafruit INA219',
      summary: 'Volts, amps, watts: 26 V, 3.2 A, I2C',
      note: 'High-side: the supply goes to Vin+ and the load to Vin-, sharing ground with the board.',
    },
    {
      id: 'ina226-current-sensor-module',
      label: 'INA226 module',
      summary: 'Volts, amps, watts: 36 V, 20 A, I2C',
      note: 'High-side: the supply goes to IN+ and the load to IN-, sharing ground with the board. Power VCC from 3.3 V. Sixteen addresses, 0x40 to 0x4F, from the A0 and A1 pads. ALE is not needed.',
    },
  ],
  PwmDriverOutput: [
    {
      id: 'adafruit-pca9685-pwm-driver',
      label: 'Adafruit PCA9685',
      summary: 'Sixteen 12-bit PWM channels over I2C',
      note: 'Power VCC from 3.3 V with GND, SDA and SCL to the controller. V+ is the outputs\' own supply (5 to 6 V for servos) and is not drawn here. Leave OE unconnected to keep the outputs enabled. A dimming or servo channel takes its signal from the PWM hole, with V+ and ground beside it.',
    },
  ],
  EnvironmentInput: [
    {
      id: 'adafruit-bme280-environment-sensor',
      label: 'Adafruit BME280',
      summary: 'Temperature, humidity and pressure over I2C',
      note: 'Use VIN at 3.3 V; SCK is I2C SCL and SDI is I2C SDA. Leave SDO and CS unwired for the default 0x77 address.',
    },
  ],
  MotionVectorInput: [
    {
      id: 'gy-521-mpu6050-module',
      label: 'GY-521 MPU-6050',
      summary: 'Three-axis accelerometer and gyroscope over I2C',
      note: 'Power VCC from 3.3 V. Leave AD0 unwired for 0x68, or tie it high for 0x69 when a DS3231 clock already uses 0x68.',
    },
  ],
  TouchPadInput: [
    {
      id: 'adafruit-mpr121-touch-sensor',
      label: 'Adafruit MPR121 breakout',
      summary: 'Twelve capacitive-touch electrodes over I2C',
      note: 'Power Vin from 3.3 V. Tie ADDR to GND for 0x5A, 3V for 0x5B, SDA for 0x5C or SCL for 0x5D; IRQ is not needed.',
    },
  ],
  DarlingtonDriverOutput: [
    {
      id: 'uln2803a-dip18',
      label: 'ULN2803A',
      summary: 'Eight low-side switches, 50 V and 500 mA each',
      note: 'Active-high: a high input pulls its output to ground, so the load goes from its own supply to the output and the array only sinks. Join the load supply ground to the controller ground. Tie COM to the load supply for coils and motors. Do not run all eight at full current: the package limits the total heat.',
    },
  ],
  PdTriggerSource: [
    {
      id: 'zy12pdn-usb-c-pd-trigger',
      label: 'ZY12PDN',
      summary: 'Asks a USB-C charger for 5, 9, 12, 15 or 20 V',
      note: 'A power source, not a signal device: nothing connects to a GPIO. Set the voltage on the board before connecting a load, because its output sits at that voltage as soon as the charger is plugged in. The charger must support PD. Read the silkscreen on your own board for polarity.',
    },
  ],
  PowerSwitchOutput: [
    {
      id: 'lr7843-mosfet-module',
      label: 'LR7843 MOSFET switch',
      summary: 'One opto-isolated DC switch or dimmer, 6-28 V',
      note: 'DC loads only. No flyback diode on the board: add one across a motor, solenoid or coil.',
    },
    {
      id: 'monkmakes-mosfetti',
      label: 'MonkMakes Mosfetti',
      summary: 'Four DC switches or dimmers, A to D, 3-16 V',
      note: 'DC only, 2 A for the whole board. Not isolated: join its GND to the board. Flyback diodes are fitted.',
    },
    {
      id: 'yynmos-4-lr7843-mosfet-module',
      label: 'YYNMOS-4 (LR7843)',
      summary: 'Four isolated DC switches or dimmers, 7-28 V',
      note: 'DC only, 5 A a channel and 10 A for the board. Wire each PWM pin and every GND1-GND4 to the controller. Not for 5 V rails: the gate drive needs 7 V.',
    },
  ],
  BuzzerOutput: [
    {
      id: 'ky-012-active-buzzer-module',
      label: 'KY-012 active buzzer',
      summary: 'Beeps at a fixed pitch while its pin is high',
      note: 'Wire SIG to the GPIO and GND to ground; leave the middle pin unconnected. It sounds at its own fixed pitch (about 2.5 kHz) while SIG is high and the pitch cannot be changed. It draws about 30 mA, more than a GPIO should supply for long or frequent sounds; switch it through a transistor for those. At 3.3 V it is quieter than at 5 V.',
    },
    {
      id: 'ky-006-passive-buzzer-module',
      label: 'KY-006 passive buzzer',
      summary: 'Plays a tone at the pitch you set',
      note: 'Wire S to the GPIO and - to ground; leave the middle pin unconnected (Joy-IT labels it +V, but the buzzer sounds without it). The controller plays a square wave at Pitch while Sound is true, and the pin rests low otherwise. It is loudest near 2 kHz. It draws 25 mA or less straight from the pin; if your buzzer reads a few tens of ohms on a meter rather than open, it is a coil type and needs a transistor. One passive buzzer per board: the tone generator drives one pin at a time.',
    },
  ],
  EthernetModule: [
    {
      id: 'wiz850io-ethernet-module',
      label: 'WIZnet WIZ850io',
      summary: 'W5500 wired Ethernet over SPI, 3.3 V',
      note: 'Power it from 3.3 V only; it draws up to about 141 mA with a link up. Every network node (Art-Net, sACN, DDP, Web Remote, NTP...) uses this link instead of Wi-Fi.',
    },
  ],
  EncoderInput: [
    {
      id: 'jaycar-sr1230-rotary-encoder',
      label: 'Jaycar SR1230 bare encoder',
      summary: 'Bare 12 mm encoder with a push switch',
      note: 'No supply pin. Wire C and one switch leg each to ground; A, B and SW go to GPIOs, which always use the internal pull-up. Each click is two transitions rather than four, which the firmware counts as one click like the module.',
    },
  ],
  DistanceInput: [
    {
      id: 'hc-sr04-ultrasonic-module',
      label: 'HC-SR04 ultrasonic',
      summary: 'Ultrasonic ranging, 2 cm to 4 m, on two GPIOs',
      note: 'Power VCC from 5 V. Echo swings to 5 V, so a 3.3 V controller needs the 1 kΩ / 2 kΩ divider on Echo; Trig can be driven at 3.3 V.',
    },
    {
      id: 'adafruit-vl53l0x-distance-sensor',
      label: 'Adafruit VL53L0X laser',
      summary: 'Laser time-of-flight, 3 cm to 1.2 m, over I2C',
      note: 'Power VIN from 3.3 V. One sensor answers on 0x29; leave 2v8, GPIO and SHDN unconnected. To share the bus, wire each SHDN pin and pick an address from 0x30 to 0x33. The build needs the Pololu VL53L0X library, which Studio installs the first time.',
    },
    {
      id: 'adafruit-vl53l1x-distance-sensor',
      label: 'Adafruit VL53L1X laser',
      summary: 'Laser time-of-flight, 3 cm to 4 m, over I2C',
      note: 'Power VIN from 3.3 V. One sensor answers on 0x29; leave XSHUT and GPIO unconnected. To share the bus, wire each XSHUT pin and pick an address from 0x30 to 0x33. It runs in long distance mode, which reaches about 4 m. The build needs the Pololu VL53L1X library, which Studio installs the first time.',
    },
  ],
  InfoDisplay: [
    {
      id: 'sh1106-oled-128x64',
      label: 'SH1106 1.3-inch',
      summary: '128x64 white OLED over 4-wire SPI',
      note: 'The 1.3-inch SH1106 has 132 columns of controller RAM behind a 128-column panel, so its window starts two columns in. Driving it as an SSD1306 shifts the image two pixels and wraps the remainder down the edge.',
    },
    {
      id: 'sh1106-oled-096-128x64-spi',
      label: 'SH1106 0.96-inch',
      summary: '128x64 white OLED over 4-wire SPI',
      note: 'Same SH1106G silicon and 2-column RAM offset as the 1.3-inch SPI module, on a smaller 27 x 28 mm board.',
    },
    {
      id: 'sh1106-oled-128x64-i2c',
      label: 'SH1106 1.3-inch (I2C)',
      summary: '128x64 white OLED over I2C',
      note: 'Same SH1106G silicon and 2-column RAM offset as the SPI module, on a 4-pin I2C breakout instead. Answers on 0x3C or 0x3D and shares SDA/SCL with other I2C devices, same as the SSD1306.',
    },
    {
      id: 'ssd1306-oled-096-128x64-i2c',
      label: 'SSD1306 0.96-inch (4-pin)',
      summary: '128x64 white OLED over I2C',
      note: 'The generic four-pin module, silkscreened GND, VCC, SCL, SDA — the commonest 0.96-inch OLED, and the one to pick unless the board in hand is the Adafruit breakout. Answers on 0x3C or 0x3D and shares SDA/SCL with other I2C devices.',
    },
    {
      id: 'ssd1306-oled-128x64',
      label: 'SSD1306 0.96-inch (Adafruit)',
      summary: '128x64 white OLED over I2C',
      note: 'The Adafruit eight-pin STEMMA QT breakout, strapped for I2C: it prints the SPI names CLK and DATA on the two lines it answers I2C on. Answers on 0x3C or 0x3D and shares SDA/SCL with other I2C devices.',
    },
  ],
  TransportDisplay: [
    {
      id: 'st7789-tft-240x240',
      label: 'ST7789 1.54-inch',
      summary: '240x240 colour TFT over SPI',
      note: 'A square 240x240 colour display with no touch controller.',
    },
    {
      id: 'ili9341-xc4630-parallel-touch-320x240',
      label: 'XC4630 2.8-inch shield + touch',
      summary: '320x240 ILI9341 over an 8-bit parallel bus',
      note: 'An Arduino-shield form factor, so it is wired with jumpers rather than seated: thirteen lines for the panel, and no touch header at all. The resistive sheet has no controller and borrows four of those same lines; the two it reads (LCD_CS and LCD_RS) must sit on ADC1 - on ADC2 a press reads fine until something enables Wi-Fi. This product ships different controllers between revisions under identical silkscreen; the driver targets the ILI9341 one.',
    },
    {
      id: 'st7789v-xpt2046-touch-240x320',
      label: 'ST7789V 2.4-inch + touch',
      summary: '240x320 colour TFT with XPT2046 touch',
      note: 'The XPT2046 touch controller exposes its own SPI pins, so it can share the display bus or use a separate bus. Adding this module gives you two nodes: the panel, and the Touch Screen node whose Controls output is what a finger on the glass publishes.',
    },
    {
      id: 'ili9341-xpt2046-touch-320x240',
      label: 'ILI9341 2.8-inch + touch',
      summary: '320x240 colour TFT with XPT2046 touch',
      note: 'The DFRobot DFR0665 breakout: an ILI9341 panel, an XPT2046 touch controller and a microSD slot, sharing SCLK, MOSI and MISO with a chip select each. The controller scans in portrait, so a 320x240 screen needs the Landscape view. Adding it gives you the panel and its Touch Screen node.',
    },
  ],
  SegmentDisplay: [
    {
      id: 'tm1637-4digit-display',
      label: 'TM1637 4-digit',
      summary: 'Two-wire 7-segment with a colon',
      note: 'Four digits and a centre colon, driven over CLK and DIO. Not I2C despite the two wires: the TM1637 has no addresses, so each module needs its own pair of pins.',
    },
    {
      id: 'max7219-8digit-7segment',
      label: 'MAX7219 8-digit',
      summary: 'Eight digits on a shared SPI bus',
      note: 'Eight digits and no colon, clocked as 16-bit frames over CLK and DIN with its own load line. It can share clock and data with other SPI devices given its own load pin, and its sixteen brightness steps are twice the TM1637 range.',
    },
  ],
  LightInput: [
    {
      id: 'photosensitive-ldr-module',
      label: 'LDR light sensor',
      summary: 'Relative brightness on one analog pin',
      note: 'An analog divider: Level is relative brightness. It cannot report calibrated lux, so Lux stays at zero.',
    },
    {
      id: 'adafruit-bh1750-light-sensor',
      label: 'Adafruit BH1750',
      summary: 'Calibrated ambient light in lux over I2C',
      note: 'Power from the controller logic rail. The breakout level-shifts SDA/SCL and answers on 0x23, or 0x5C with ADDR tied high.',
    },
  ],
}
