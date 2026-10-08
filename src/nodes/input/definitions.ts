// Input node definitions: ports, default properties, sidebar
// placement and Help descriptions. src/state/nodeLibrary.ts merges every
// category's definitions into NODE_LIBRARY in sidebar order.
import type { NodeDefinition } from '../../types'
import { MIC_DEFAULTS } from '../../audio/micAnalysis'
import { NO_PIN } from '../../build/boards/boardGpio'
import { HCSR04_PART_ID, VL53L0X_PART_ID, distanceSensorSpec, formatDistanceSensorAddress } from '../../state/peripherals/distanceSensor'
import { BME280_DEFAULT_ADDRESS, BME280_PART_ID, formatEnvironmentAddress } from '../../state/peripherals/environmentSensor'
import { IR_REMOTE_LEARN_HANDLE } from '../../state/peripherals/irRemote'
import { JOYSTICK_DEFAULT_DEADZONE, KY023_PART_ID } from '../../state/peripherals/joystick'
import { KEYPAD_PART_ID } from '../../state/peripherals/keypad'
import { BH1750_DEFAULT_ADDRESS, DEFAULT_LIGHT_SENSOR_PART_ID, LIGHT_SENSOR_DEFAULT_MAX_LUX, formatLightSensorAddress } from '../../state/peripherals/lightSensor'
import { MPU6050_PART_ID, formatMotionVectorAddress, motionVectorSpec } from '../../state/peripherals/motionVector'
import { PD_TRIGGER_PART_ID, pdTriggerSpec } from '../../state/peripherals/pdTrigger'
import { DEFAULT_POWER_CONVERTER_PART_ID, DEFAULT_SOURCE_VOLTAGE } from '../../state/peripherals/powerConverter'
import { DEFAULT_POWER_MONITOR_PART_ID, POWER_MONITOR_DEFAULT_LIMIT_AMPS, formatI2cAddress, powerMonitorSpec } from '../../state/peripherals/powerMonitor'
import { DEFAULT_PRESENCE_PART_ID, PRESENCE_RX_PIN_KEY } from '../../state/peripherals/presenceSensor'
import { DS18B20_PART_ID } from '../../state/peripherals/temperatureSensor'
import { DEFAULT_TOUCH_BUTTON_PART_ID } from '../../state/peripherals/touchButton'
import { MPR121_PART_ID, formatTouchPadAddress, touchPadSpec } from '../../state/peripherals/touchPad'

export const INPUT_DEFINITIONS: NodeDefinition[] = [
  {
    type: 'Audio',
    label: 'Audio',
    category: 'input',
    inputs: [],
    outputs: [{ id: 'audio', label: 'Audio', dataType: 'audio' }],
    // The source kind is selectable before Hardware exists. Microphone is the
    // discoverable default and resolves as soon as its provider is added.
    defaultProperties: { sourceId: 'kind:microphone' },
  },
  {
    type: 'Storage',
    label: 'Storage',
    category: 'input',
    inputs: [],
    outputs: [{ id: 'storage', label: 'Storage', dataType: 'storage' }],
    // The concrete provider is chosen from root hardware by
    // StorageCapabilityBody. Empty is meaningful when no board or card is attached.
    defaultProperties: { sourceId: '' },
  },
  // ── Inputs ─────────────────────────────────────────────────────────────
  {
    type: 'MicInput',
    label: 'Microphone',
    category: 'input',
    inputs: [],
    outputs: [{ id: 'audio', label: 'Audio', dataType: 'audio' }],
    // Gain maps to FastLED Processor::setGain in preview and firmware; i2s*
    // pins + channel configure FastLED's microphone input (ESP32). The pins below
    // are common ESP32-S3 wiring and are the fallback only — a node created
    // while another ESP32 variant is selected takes that board's pins from
    // `micPinDefaults.ts`, since GPIO40/41 don't exist on the classic ESP32,
    // C3, C6 or H2 at all.
    defaultProperties: {
      ...MIC_DEFAULTS,
      i2sWs: 39,
      i2sSck: 40,
      i2sSd: 41,
      channel: 'Left',
      // Firmware-only: print FastLED processor levels and conditioner stats to
      // the serial monitor ~10×/sec, for checking the mic wiring on-device.
      serialDebug: false,
    },
  },
  {
    type: 'LineInput',
    label: 'Line In',
    category: 'input',
    inputs: [],
    outputs: [{ id: 'audio', label: 'Audio', dataType: 'audio' }],
    // PCM1802 is a stereo line-level ADC rather than a microphone. It needs
    // the controller to supply MCLK, BCLK and LRCLK while it returns PCM on
    // DOUT. Hardware creation replaces these fallbacks with four free pins on
    // the selected ESP32-S3 board.
    defaultProperties: {
      partId: 'pcm1802-line-in-adc',
      i2sMclk: 14,
      i2sBclk: 27,
      i2sLrclk: 26,
      i2sDout: 25,
      channel: 'Both',
      gain: 1,
      serialDebug: false,
    },
  },

  // ── Inputs ─────────────────────────────────────────────────────────────
  {
    type: 'ButtonInput',
    label: 'Button',
    category: 'input',
    inputs: [],
    outputs: [{ id: 'pressed', label: 'Pressed', dataType: 'bool' }],
    defaultProperties: { pin: 0, pullup: true },
  },
  {
    // A TTP223 module actively drives its output HIGH on touch. It therefore
    // uses plain INPUT and cannot share ButtonInput's pulled-up, active-low
    // contact contract.
    type: 'TouchButtonInput',
    label: 'Touch Button',
    category: 'input',
    inputs: [],
    outputs: [{ id: 'touched', label: 'Touched', dataType: 'bool' }],
    defaultProperties: { partId: DEFAULT_TOUCH_BUTTON_PART_ID, pin: 4 },
  },
  {
    /*
     * The digitiser on a touch panel, as its own node.
     *
     * A touch screen is two chips: the display controller and an XPT2046
     * digitiser with its own chip select. Modelling them as one node made the
     * display both an output and an input, which is why controls used to leave
     * a screen — a thing that shows you something, somehow also being where a
     * finger's intent came out. The display is an output now, end of the line
     * like an LED output, and this is where touch goes in.
     *
     * `panelId` is the module this glass belongs to, set when the pair is added
     * together and never typed: the two nodes are one physical part, and a
     * press cannot be resolved into "the Play button you drew" without the
     * panel's design, size and rotation. It is internal for the same reason a
     * catalogue id is, and the node body states the panel in words instead.
     */
    type: 'TouchInput',
    label: 'Touch',
    category: 'input',
    inputs: [],
    outputs: [{ id: 'controls', label: 'Controls', dataType: 'playercontrols' }],
    // No pins of its own: the digitiser's five lines are wiring on the same
    // module as the screen, so they stay with the part on the panel where the
    // Build Diagram and the pin checker already look for them. What lives here
    // is what belongs to the touch surface itself — where the glass reads from,
    // which is measured by calibrating rather than typed.
    defaultProperties: {
      panelId: '',
      touchXMin: 200,
      touchXMax: 3900,
      touchYMin: 200,
      touchYMax: 3900,
      // Which way the digitiser counts, which a range cannot say. Measured by
      // Calibrate touch, never typed: it is a fact about the glass.
      touchFlipX: false,
      touchFlipY: false,
    },
  },
  {
    type: 'ButtonBank',
    label: 'Button Bank',
    category: 'input',
    inputs: [],
    // The real outputs are derived from `buttons`. This trailing port is the
    // invitation: completing a connection turns it into a named button and
    // immediately grows another empty socket beneath it.
    outputs: [{ id: 'add-button', label: 'Connect button…', dataType: 'bool' }],
    defaultProperties: { buttons: [] },
  },
  {
    /*
     * A three-pin demodulating IR receiver, one per bench.
     *
     * Its outputs are the buttons someone has learned off a handheld remote,
     * derived from `buttons` the way a Button Bank derives its own — an IR key
     * is an identity in a saved mapping, not a pin, so the node grows a port
     * per learned key and claims exactly one GPIO however many keys it has.
     * The trailing socket invites the next one.
     *
     * A key is an *event*, so what it can drive directly is an action or a
     * Trigger. Reaching a numeric property goes through Step Value, which is
     * what turns two keys into a bounded value; nothing here writes into
     * another node's saved properties.
     */
    type: 'IRRemoteInput',
    label: 'IR Remote',
    category: 'input',
    inputs: [],
    outputs: [{ id: IR_REMOTE_LEARN_HANDLE, label: 'Map IR remote buttons', dataType: 'bool' }],
    defaultProperties: { pin: 13, buttons: [], debug: false },
  },
  {
    // HC-SR501 PIR module. One digital line that goes high while it sees
    // movement and stays high for the module's own hold time — the sensitivity
    // and hold are trimmer pots on the board, not properties here, because
    // nothing in the firmware can read or set them.
    type: 'MotionInput',
    label: 'Motion Sensor',
    category: 'input',
    inputs: [],
    outputs: [{ id: 'motion', label: 'Motion', dataType: 'bool' }],
    // No pull-up: the module drives the line both ways, unlike a bare button.
    defaultProperties: { partId: 'hc-sr501-pir-sensor', pin: 5 },
  },
  {
    // LD2410-family 24 GHz radar. It sees someone sitting still, which a PIR
    // cannot, and reports how far away they are, over a UART it streams on
    // unprompted — so one GPIO (the board's RX from the sensor's TX) is all it
    // needs. See presenceSensor.ts.
    type: 'PresenceInput',
    label: 'Presence Sensor',
    category: 'input',
    inputs: [],
    outputs: [
      { id: 'presence', label: 'Presence', dataType: 'bool' },
      { id: 'moving', label: 'Moving', dataType: 'bool' },
      { id: 'still', label: 'Still', dataType: 'bool' },
      { id: 'distance', label: 'Distance (m)', dataType: 'float' },
    ],
    defaultProperties: { partId: DEFAULT_PRESENCE_PART_ID, [PRESENCE_RX_PIN_KEY]: 18 },
  },
  {
    // One graph contract for relative analog light and calibrated digital lux.
    // Level stays normalised for existing graphs; Lux is zero on an LDR because
    // a bare divider has no calibration from voltage to illuminance.
    type: 'LightInput',
    label: 'Light Sensor',
    category: 'input',
    inputs: [],
    outputs: [
      { id: 'level', label: 'Level', dataType: 'float' },
      { id: 'lux', label: 'Lux', dataType: 'float' },
    ],
    // GPIO4 is ADC1 on the app's default board — see PotInput below for why
    // that matters and why a classic-ESP32 default would be wrong here.
    defaultProperties: {
      partId: DEFAULT_LIGHT_SENSOR_PART_ID,
      pin: 4,
      sdaPin: 21,
      sclPin: 22,
      i2cAddress: formatLightSensorAddress(BH1750_DEFAULT_ADDRESS),
      maxLux: LIGHT_SENSOR_DEFAULT_MAX_LUX,
    },
  },
  {
    // One calibrated I2C weather sensor, kept separate from LightInput because
    // all three outputs are physical quantities rather than a normalized level.
    type: 'EnvironmentInput',
    label: 'Environment Sensor',
    category: 'input',
    inputs: [],
    outputs: [
      { id: 'temperature', label: 'Temperature (°C)', dataType: 'float' },
      { id: 'humidity', label: 'Humidity (%)', dataType: 'float' },
      { id: 'pressure', label: 'Pressure (hPa)', dataType: 'float' },
    ],
    defaultProperties: {
      partId: BME280_PART_ID,
      sdaPin: 21,
      sclPin: 22,
      i2cAddress: formatEnvironmentAddress(BME280_DEFAULT_ADDRESS),
    },
  },
  {
    // A 1-Wire thermometer probe. One GPIO carries the bus, pulled up to the
    // logic rail by an external 4.7 kohm resistor. `connected` is separate from
    // the reading because an unplugged probe has no meaningful temperature.
    type: 'TemperatureInput',
    label: 'Temperature Probe',
    category: 'input',
    inputs: [],
    outputs: [
      { id: 'temperature', label: 'Temperature (°C)', dataType: 'float' },
      { id: 'connected', label: 'Connected', dataType: 'bool' },
    ],
    defaultProperties: { partId: DS18B20_PART_ID, pin: 4 },
  },
  {
    // A six-axis inertial sensor. Acceleration is in g and rotation rate in
    // degrees per second, so the values keep their physical units and Map Range
    // is the explicit bridge to a control, like the environment sensor.
    type: 'MotionVectorInput',
    label: 'Accel & Gyro',
    category: 'input',
    inputs: [],
    outputs: [
      { id: 'accelX', label: 'Accel X (g)', dataType: 'float' },
      { id: 'accelY', label: 'Accel Y (g)', dataType: 'float' },
      { id: 'accelZ', label: 'Accel Z (g)', dataType: 'float' },
      { id: 'gyroX', label: 'Gyro X (°/s)', dataType: 'float' },
      { id: 'gyroY', label: 'Gyro Y (°/s)', dataType: 'float' },
      { id: 'gyroZ', label: 'Gyro Z (°/s)', dataType: 'float' },
      { id: 'connected', label: 'Connected', dataType: 'bool' },
    ],
    defaultProperties: {
      partId: MPU6050_PART_ID,
      sdaPin: 21,
      sclPin: 22,
      i2cAddress: formatMotionVectorAddress(motionVectorSpec(MPU6050_PART_ID).defaultI2cAddress),
    },
  },
  {
    // A twelve-electrode capacitive-touch controller. Twelve boolean ports would make a
    // node taller than the canvas is wide, so it publishes the lowest electrode touched
    // as an index (0 to 11, held after release), how many are down and whether any is.
    // Compare or Map Range turns the index into a scene, a preset or a level.
    type: 'TouchPadInput',
    label: 'Touch Pad',
    category: 'input',
    inputs: [],
    outputs: [
      { id: 'electrode', label: 'Electrode (0-11)', dataType: 'float' },
      { id: 'touched', label: 'Touched', dataType: 'bool' },
      { id: 'count', label: 'Count', dataType: 'float' },
      { id: 'connected', label: 'Connected', dataType: 'bool' },
    ],
    defaultProperties: {
      partId: MPR121_PART_ID,
      sdaPin: 21,
      sclPin: 22,
      i2cAddress: formatTouchPadAddress(touchPadSpec(MPR121_PART_ID).defaultI2cAddress),
      touchThreshold: touchPadSpec(MPR121_PART_ID).touchThreshold,
      releaseThreshold: touchPadSpec(MPR121_PART_ID).releaseThreshold,
    },
  },
  {
    // A 4x4 matrix keypad on eight GPIOs. Sixteen boolean ports would make a node
    // taller than the canvas is wide, so it publishes the last key pressed as an
    // index (0 to 15, row by row) and whether any key is down. That is what a
    // scene or preset picker wants, and Map Range or Compare turns it into more.
    type: 'KeypadInput',
    label: 'Keypad',
    category: 'input',
    inputs: [],
    outputs: [
      { id: 'key', label: 'Key (0-15)', dataType: 'float' },
      { id: 'pressed', label: 'Pressed', dataType: 'bool' },
    ],
    defaultProperties: {
      partId: KEYPAD_PART_ID,
      row1Pin: 13, row2Pin: 14, row3Pin: 27, row4Pin: 26,
      col1Pin: 25, col2Pin: 33, col3Pin: 32, col4Pin: 4,
    },
  },
  {
    // A thumb joystick: two analog axes and a push switch. The axes are signed
    // (-1 to 1, 0 at rest) rather than 0-1 like PotInput, because a stick has a
    // centre that means something, and the dead zone is a property because a
    // real stick never rests at exactly half scale.
    type: 'JoystickInput',
    label: 'Joystick',
    category: 'input',
    inputs: [],
    outputs: [
      { id: 'x', label: 'X (-1 to 1)', dataType: 'float' },
      { id: 'y', label: 'Y (-1 to 1)', dataType: 'float' },
      { id: 'pressed', label: 'Pressed', dataType: 'bool' },
    ],
    defaultProperties: { partId: KY023_PART_ID, xPin: 32, yPin: 33, swPin: 25, deadzone: JOYSTICK_DEFAULT_DEADZONE },
  },
  {
    // An ultrasonic ranger. Two GPIOs carry it: Trig out, Echo in. `connected`
    // is separate from the reading because a sensor that hears no echo has no
    // meaningful distance, and nothing in range is not the same as unplugged.
    type: 'DistanceInput',
    label: 'Distance Sensor',
    category: 'input',
    inputs: [],
    outputs: [
      { id: 'distance', label: 'Distance (mm)', dataType: 'float' },
      { id: 'connected', label: 'Connected', dataType: 'bool' },
    ],
    defaultProperties: {
      partId: HCSR04_PART_ID,
      trigPin: 27,
      echoPin: 26,
      sdaPin: 21,
      sclPin: 22,
      i2cAddress: formatDistanceSensorAddress(distanceSensorSpec(VL53L0X_PART_ID).defaultI2cAddress ?? 0x29),
      xshutPin: NO_PIN,
    },
  },
  {
    type: 'PotInput',
    label: 'Potentiometer',
    category: 'input',
    inputs: [],
    outputs: [{ id: 'value', label: 'Value', dataType: 'float' }],
    // GPIO4 is ADC1 on the app's default board (ESP32-S3, ADC1 = GPIO1-10) —
    // the old default of 34 was an ADC1 pin on the *classic* ESP32 (ADC1 =
    // GPIO32-39) but has no ADC capability at all on the S3, so a fresh node
    // silently read garbage on the app's own default board.
    defaultProperties: { pin: 4 },
  },
  {
    // Rotary encoder (e.g. KY-040) — polling quadrature decode (no interrupts,
    // matching ButtonInput/PotInput's plain digitalRead/analogRead approach).
    // `position` is an unbounded running count; wire through MapRange/Mod to
    // normalise or wrap it.
    type: 'EncoderInput',
    label: 'Encoder',
    category: 'input',
    inputs: [],
    outputs: [
      { id: 'position', label: 'Position', dataType: 'float' },
      { id: 'pressed', label: 'Pressed', dataType: 'bool' },
    ],
    defaultProperties: { pinA: 6, pinB: 7, pinSW: 8, pullup: true, resetOnPress: false },
  },
  {
    // Scene-wide DMX source. Browser preview reads helper-backed Art-Net;
    // generated firmware uses the selected input mode (Art-Net over Wi-Fi, or
    // DMX512 over an ESP32 transceiver).
    type: 'DMXInput',
    label: 'DMX / Art-Net',
    category: 'input',
    inputs: [],
    outputs: [{ id: 'dmx', label: 'DMX', dataType: 'dmx' }],
    defaultProperties: {
      inputMode: 'Art-Net',
      universe: 0,
      previewPort: 6454,
      wifiHostname: 'fastled-dmx',
      useDhcp: true,
      staticIp: '',
      staticGateway: '',
      staticSubnet: '255.255.255.0',
      staticDns: '',
      dmxPort: 1,
      dmxTxPin: 17,
      dmxRxPin: 16,
      dmxEnablePin: 21,
    },
  },
  {
    // An I2C current/voltage monitor. It carries a signal (three measured
    // floats), so it is a canvas node, but it is a physical part owned by the
    // bench like the RTC it shares the bus with.
    type: 'PowerMonitorInput',
    label: 'Power Monitor',
    category: 'input',
    inputs: [],
    outputs: [
      { id: 'volts', label: 'Volts', dataType: 'float' },
      { id: 'amps', label: 'Amps', dataType: 'float' },
      { id: 'watts', label: 'Watts', dataType: 'float' },
      { id: 'overcurrent', label: 'Overcurrent', dataType: 'bool' },
      { id: 'display', label: 'Display', dataType: 'display' },
    ],
    defaultProperties: {
      partId: DEFAULT_POWER_MONITOR_PART_ID,
      i2cAddress: formatI2cAddress(powerMonitorSpec(DEFAULT_POWER_MONITOR_PART_ID).defaultI2cAddress),
      overcurrentAmps: POWER_MONITOR_DEFAULT_LIMIT_AMPS,
      debug: false,
      sdaPin: 21,
      sclPin: 22,
    },
  },
  {
    // Real-time clock fields. Preview uses the browser clock; generated
    // firmware keeps a software clock seeded from compile time, a manual start
    // date/time, or network/NTP sync when Wi-Fi is configured; it can also read
    // a battery-backed DS3231 directly over the board's default I2C bus.
    type: 'RTCInput',
    label: 'RTC Clock',
    category: 'input',
    inputs: [],
    outputs: [
      { id: 'display', label: 'Display', dataType: 'display' },
      { id: 'dateTime', label: 'DateTime', dataType: 'datetime' },
      { id: 'valid', label: 'Valid', dataType: 'bool' },
      { id: 'synced', label: 'Synced', dataType: 'bool' },
      { id: 'stale', label: 'Stale', dataType: 'bool' },
      { id: 'hour', label: 'Hour', dataType: 'float' },
      { id: 'minute', label: 'Minute', dataType: 'float' },
      { id: 'second', label: 'Second', dataType: 'float' },
      { id: 'weekday', label: 'Weekday', dataType: 'float' },
      { id: 'day', label: 'Day', dataType: 'float' },
      { id: 'month', label: 'Month', dataType: 'float' },
      { id: 'year', label: 'Year', dataType: 'float' },
      { id: 'secondsOfDay', label: 'Seconds Today', dataType: 'float' },
      { id: 'weekend', label: 'Weekend', dataType: 'bool' },
    ],
    defaultProperties: {
      timeSource: 'Compile Time',
      sdaPin: 21,
      sclPin: 22,
      ntpServer: 'pool.ntp.org',
      timezoneOffsetMinutes: 0,
      wifiHostname: 'fastled-clock',
      useDhcp: true,
      staticIp: '',
      staticGateway: '',
      staticSubnet: '255.255.255.0',
      staticDns: '',
      startYear: 2026,
      startMonth: 1,
      startDay: 1,
      startHour: 12,
      startMinute: 0,
      startSecond: 0,
    },
  },
  {
    // Web MIDI input — no embedded-hardware equivalent, so this is
    // preview-only (VJ-style control while designing). `note`/`cc` are the
    // MIDI numbers this node listens for; `note` output is note-on velocity
    // (0 once released), `gate` is held state, `cc` is the last CC value.
    type: 'MidiInput',
    label: 'MIDI',
    category: 'input',
    inputs: [],
    outputs: [
      { id: 'note', label: 'Velocity', dataType: 'float' },
      { id: 'gate', label: 'Gate', dataType: 'bool' },
      { id: 'cc', label: 'CC', dataType: 'float' },
    ],
    defaultProperties: { note: 60, cc: 1 },
  },
  {
    // Wired Ethernet for the sketch's network. It carries no signal: Art-Net
    // receive and NTP time sync keep their own settings and simply reach the
    // network through this module instead of Wi-Fi when it is on the bench.
    // See state/peripherals/ethernetModule.ts.
    //
    // Config only, like SD Card: no ports, no evaluation, found by scanning.
    type: 'EthernetModule',
    label: 'Ethernet',
    category: 'input',
    inputs: [],
    outputs: [],
    defaultProperties: {
      partId: 'wiz850io-ethernet-module',
      // Classic-ESP32 fallbacks; adding the part and every board change hand
      // out free pins through its pin plan. Not HSPI's customary 12-15: the
      // module has the host to itself through the GPIO matrix, and GPIO12 and
      // GPIO15 are strapping pins — MISO held high on GPIO12 at reset selects
      // the wrong flash voltage. MISO, which only reads, takes input-only 35.
      sckPin: 25,
      mosiPin: 26,
      misoPin: 35,
      csPin: 32,
      intPin: 33,
      resetPin: 27,
    },
  },
  {
    // A DC-DC converter from a higher-voltage source to 5 V. It carries no
    // signal: the Build Diagram reads the selected part's role to power either
    // the controller or the LED rail. See state/peripherals/powerConverter.ts.
    //
    // Config only, like SD Card: no ports, no evaluation, found by scanning.
    type: 'PowerConverter',
    label: 'Buck Converter',
    category: 'input',
    inputs: [],
    outputs: [],
    defaultProperties: {
      partId: DEFAULT_POWER_CONVERTER_PART_ID,
      sourceVoltage: DEFAULT_SOURCE_VOLTAGE,
    },
  },
  {
    // A USB-C PD trigger: the upstream DC source. It carries no signal; the
    // electrical plan reads the voltage it requests and checks it against the
    // converter it feeds. Config only, like the converter. See state/peripherals/pdTrigger.ts.
    type: 'PdTriggerSource',
    label: 'USB-C PD Trigger',
    category: 'input',
    inputs: [],
    outputs: [],
    defaultProperties: {
      partId: PD_TRIGGER_PART_ID,
      requestedVoltage: String(pdTriggerSpec(PD_TRIGGER_PART_ID).defaultVoltageV),
    },
  },
]

export const INPUT_DESCRIPTIONS: Record<string, string> = {
  Audio: 'Selects Microphone, Line input, or Audio decoder for audio reactivity.',
  Storage: 'Selects SD, onboard flash, or USB storage attached to the board.',
  MicInput: 'I2S MEMS microphone Hardware provider selected through the Audio node.',
  LineInput: 'PCM1802 Hardware provider selected through the Audio node.',
  // hardware
  ButtonInput: 'Reads a hardware button as a boolean.',
  TouchButtonInput: 'Reads a capacitive touch button as a boolean.',
  TouchInput: 'The touch surface of a Display Panel, as controls.',
  ButtonBank: 'Grows named hardware-button outputs as you connect them.',
  IRRemoteInput: 'Reads learned handheld-remote keys as boolean events.',
  MotionInput: 'Reads a PIR motion sensor as a boolean.',
  PresenceInput: 'Reads a radar presence sensor: someone there, moving or still, and how far away.',
  LightInput: 'Reads relative brightness from an LDR or calibrated lux from a BH1750.',
  EnvironmentInput: 'Reads calibrated temperature, humidity and barometric pressure from a BME280.',
  TemperatureInput: 'Reads a waterproof DS18B20 probe in degrees Celsius, with a connected flag.',
  MotionVectorInput: 'Reads acceleration and rotation on three axes from an MPU-6050.',
  TouchPadInput: 'Reads twelve capacitive-touch electrodes from an MPR121.',
  KeypadInput: 'Reads a 4x4 matrix keypad as the last key pressed and a pressed flag.',
  JoystickInput: 'Reads a thumb joystick: two signed axes and a push switch.',
  DistanceInput: 'Measures distance in mm with an HC-SR04, VL53L0X or VL53L1X.',
  PotInput: 'Reads a potentiometer as a 0–1 value.',
  EncoderInput: 'Reads a rotary encoder — running position plus its push-button.',
  DMXInput: 'DMX / Art-Net source for preview and firmware (Art-Net or ESP32 DMX512).',
  PowerMonitorInput: 'Measures volts, amps and watts over I2C and reports them to displays.',
  RTCInput: 'Clock for preview/firmware via build stamp, manual seed, NTP, or DS3231.',
  MidiInput: 'Web MIDI note velocity/gate + CC value from a controller. Preview-only.',
  EthernetModule: 'Wired Ethernet for Art-Net and NTP, in place of Wi-Fi; a bench part, not wired.',
  PowerConverter: 'Converts a DC source to 5 V for the controller or LED rail.',
  PdTriggerSource: 'Asks a USB-C charger for a fixed voltage to feed a converter or load.',
}
