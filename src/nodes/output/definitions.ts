// Output node definitions: ports, default properties, sidebar
// placement and Help descriptions. src/state/nodeLibrary.ts merges every
// category's definitions into NODE_LIBRARY in sidebar order.
import type { NodeDefinition } from '../../types'
import { DEFAULT_OLED_I2C_ADDRESS, oledAddressLabel } from '../../state/displays/oledSurface'
import { LED_OUTPUT_ACTION_PORTS, LED_OUTPUT_RUNTIME_PORTS } from '../../state/output/ledOutputRuntime'
import {
  BUZZER_PART_ID, BUZZER_PIN_FALLBACK, BUZZER_PITCH_DEFAULT_HZ, BUZZER_VARIANT_INPUTS, buzzerInputs,
} from '../../state/peripherals/buzzer'
import { DARLINGTON_PART_ID, DARLINGTON_PIN_FALLBACKS, darlingtonInputs, darlingtonPinKeys } from '../../state/peripherals/darlingtonDriver'
import { DIRECT_PIXEL_DATA_LINK } from '../../state/peripherals/pixelDataExtender'
import { ALL_POWER_SWITCH_CHANNELS, DEFAULT_POWER_SWITCH_PART_ID, POWER_SWITCH_LEVEL_DEFAULT, POWER_SWITCH_PIN_FALLBACKS, POWER_SWITCH_VARIANT_INPUTS, powerSwitchInputs } from '../../state/peripherals/powerSwitch'
import { PCA9685_PART_ID, formatPwmDriverAddress, pwmDriverInputs, pwmDriverSpec } from '../../state/peripherals/pwmDriver'
import { DEFAULT_RELAY_PART_ID, relayInputs } from '../../state/peripherals/relayModule'
import { MASTER_SPEED_DEFAULT } from '../../state/player/masterSpeed'
import {
  COOLING_FAN_PART_ID,
  COOLING_FAN_PWM_PIN_FALLBACK,
  COOLING_FAN_SPEED_DEFAULT,
  COOLING_FAN_TACH_PIN_FALLBACK,
} from '../../state/peripherals/coolingFan'

export const OUTPUT_DEFINITIONS: NodeDefinition[] = [

  // ── Output ─────────────────────────────────────────────────────────────
  {
    // The controller every other piece of hardware in the graph is attached
    // to. Config only — no ports, no evaluation, no codegen of its own, the
    // same shape as Comment.
    //
    // It holds a board *profile* id rather than an FQBN on purpose: an FQBN
    // like `esp32:esp32:esp32` names the silicon and leaves the header layout
    // ambiguous (two different DevKit profiles claim that exact target), which
    // is the failure this node exists to remove. The FQBN is derived from the
    // chosen profile and mirrored into uploadStore for upload.
    //
    // See docs/architecture/board-capabilities.md. This is the
    // non-breaking half: pins still live on the peripheral nodes and outputs
    // are not yet attached by a `route` edge.
    type: 'Board',
    label: 'Board',
    category: 'output',
    inputs: [],
    outputs: [],
    defaultProperties: {
      // Empty means "not chosen yet" — deliberately not defaulted to a board,
      // so an unset Board node reads as a question rather than a wrong answer.
      profileId: '',
      // One sketch, one FastLED/controller policy. These used to be repeated
      // on every LED Output even though firmware can apply only one global
      // master level, power ceiling, overclock define and PSRAM build target.
      brightness: 128,
      overclock: 1,
      powerLimit: false,
      volts: 5,
      milliamps: 2000,
      psramPolicy: 'auto',
      psramMode: 'opi',
      serialRoute: 'auto',
      // Off by default: it costs flash and puts a line on the serial port every
      // couple of seconds, which a finished installation has no use for. It is
      // a bench instrument, turned on to measure a rig and turned off again.
      reportTelemetry: false,
    },
  },
  {
    type: 'MatrixOutput',
    label: 'LED Matrix',
    category: 'output',
    inputs: [
      { id: 'frame',  label: 'Frame',   dataType: 'frame' },
      // Blackout and dimming as wires, so a button and a knob on the bench
      // reach the fixture in a build with no Music Player in it. Unwired means
      // whatever the two fields below say — see state/output/ledOutputRuntime.ts.
      ...LED_OUTPUT_RUNTIME_PORTS,
      ...LED_OUTPUT_ACTION_PORTS,
    ],
    // Sockets on demand: a fixture's blackout and dimmer are fields until
    // something is wired to them. `controls` is a bundle rather than a value
    // and has no field to fall back to, so it stays an ordinary port.
    propertyInputs: { enabled: 'enabled', outputBrightness: 'brightness' },
    actionInputs: LED_OUTPUT_ACTION_PORTS.map((port) => port.id),
    // The one output a fixture has, and it is not pixels: what this output is
    // *doing*, for a status screen. It is what lets a graph with no player and
    // no slideshow drive a panel. `MatrixOutput` stays a terminal despite now
    // having an output port, because both terminal registries derive from
    // "inputs, and either no outputs or the output category" rather than from
    // "no outputs" alone — see reachableFromOutputs in cppGenerator.ts.
    outputs: [{ id: 'display', label: 'Display', dataType: 'display' }],
    defaultProperties: {
      // What this output physically is — string / matrix / ring / corkscrew /
      // HUB75 panel (src/state/output/ledOutputForm.ts). The hardware view offers each
      // as its own entry. The form is
      // what decides which of the properties below apply at all.
      form: 'matrix',
      // This fixture's own blackout and dimmer — the value an unwired
      // `enabled`/`brightness` port means, and the value a disconnected wire
      // falls back to. `outputBrightness` rather than `brightness` on purpose:
      // the Board's `brightness` is FastLED's global 0-255 controller setting,
      // while this one is a fixture-local 0-1 multiplier.
      enabled: true,
      outputBrightness: 1,
      width: 16,
      height: 16,
      // String, ring, and corkscrew forms are one chain of `ledCount` LEDs;
      // width/height above are the matrix and HUB75 forms' grid.
      ledCount: 60,
      // Ring geometry: where LED 0 sits (degrees clockwise from 12 o'clock,
      // where a ring's data-in pad usually is) and which way the chain runs
      // seen from the front.
      ringStartAngle: 0,
      ringDirection: 'cw',
      // Corkscrew geometry: a strip wound around a cylinder. The physical
      // dimensions establish the unwrapped authoring canvas; turns, start angle
      // and direction trace the helical chain across it.
      corkscrewTurns: 6,
      corkscrewStartAngle: 0,
      corkscrewDirection: 'cw',
      corkscrewDiameterMm: 100,
      corkscrewHeightMm: 300,
      chipset: 'WS2812B',
      // The physical data route only. Firmware still emits the chipset's one
      // wire signal; the Build Diagram inserts the chosen TX/RX accessory.
      dataLink: DIRECT_PIXEL_DATA_LINK,
      colorOrder: 'GRB',
      dataPin: 5,
      // Clock pin for SPI (clocked) chipsets — APA102/APA102HD/WS2801/HD108.
      // Ignored (editor disabled) for clockless chipsets.
      clockPin: 6,
      // On by default, because the matrix people actually buy is serpentine —
      // the cheap flexible WS2812B panels almost all zig-zag alternate rows, so
      // defaulting off meant the common case shipped mirrored every other row
      // and the user had to know the word "serpentine" to fix it. Gated to the
      // grid forms: a single chain has no alternate rows to zig.
      serpentine: true,
      // Physical wiring order *within* the matrix and HUB75 forms
      // (src/state/output/xyLayout.ts): 'matrix' keeps the plain row-major (or
      // pixel-serpentine) behaviour above; 'panels' splits the grid into
      // tilesX×tilesY equal panels, each independently rotatable and chained in
      // row or serpentine panel order; 'custom' takes an explicit JSON
      // permutation via customXYMap for anything else. The linear forms have no
      // wiring order to choose — a strip is its own order and a ring's is
      // `ringStartAngle`/`ringDirection`.
      layout: 'matrix',
      tilesX: 1,
      tilesY: 1,
      // Panel-chain wiring direction (distinct from the pixel-level
      // `serpentine` above, which still governs the zig-zag *within* a panel).
      tileSerpentine: false,
      // Comma-separated degrees (0/90/180/270), one per panel, in row-major
      // panel-grid order — e.g. "0,90,0,180" for a 2×2 grid.
      tileRotations: '',
      // JSON array of WIDTH*HEIGHT ints (a permutation of 0..N-1): grid index
      // (row-major) -> physical LED index. Only used when layout is 'custom'.
      customXYMap: '',
      // String form only. 'line' is a straight run of tape; 'positions' places
      // each LED at its own (x, y) on a canvas (src/state/output/stringPositions.ts).
      stripLayout: 'line',
      // 'catenary' is the Sailboat preset; 'custom' reads `positions`.
      positionsPreset: 'catenary',
      positionsWidth: 32,
      positionsHeight: 16,
      // "x,y" pairs in canvas units, one per LED, any separators.
      positions: '',
      // The Frame cable into each LED output is an explicit hardware route.
      // Native renders the graph at this output's own geometry. Fit/crop opt
      // into the shared composition canvas for intentional multi-panel work.
      routeMode: 'native',
      routeX: 0,
      routeY: 0,
      // Render the graph at 2× the matrix resolution and average each 2×2 block
      // down to one physical LED (FastLED-style downscale) — antialiases moving
      // shapes on small panels at ~4× the render cost. Preview + normal sketch.
      supersample: false,
      // Render at half the panel resolution and upscale bilinearly into the
      // LEDs ('1' = full resolution). Matrix panels only; excludes supersample.
      renderScale: '1',
      // FastLED.setCorrection colour-correction profile ('none' = uncorrected).
      correction: 'none',
      // FastLED.setTemperature white point ('none' = uncorrected).
      whitePoint: 'none',
      // FastLED temporal dithering (recovers colour depth at low brightness);
      // on is FastLED's own default, off emits setDither(DISABLE_DITHER).
      dither: true,
      // HUB75 scan-panel wiring (`form === 'hub75'` only; see
      // docs/design/hub75-output.md). ESP32-HUB75-MatrixPanel-DMA's
      // own documented default pinout (R1=25/G1=26/B1=27/A=23/...) is tuned for
      // the classic ESP32 — hardware-tested-false on ESP32-S3 (2026-08-09,
      // GitHub issue tracker N/A, see todo.md): G1(26)/B1(27) collide with the
      // S3's flash/PSRAM pins and A(23) isn't present as GPIO on the S3 at all,
      // producing an ESP-IDF "GPIO number error" boot failure. `HUB75_SUPPORTED_FQBNS`
      // (validateGraph.ts) allows the classic ESP32, ESP32-S2, and ESP32-S3, and
      // a single shared default set (no per-board defaults yet) has to actually
      // work on all three — computed as the exact intersection of each board's
      // valid, output-capable GPIOs (ESP32_GPIO/ESP32_S2_GPIO/ESP32_S3_GPIO in
      // src/build/boards/boardGpio.ts): exactly 14 pins exist in that intersection, one
      // per HUB75 signal with none to spare. GPIO0 (needed to fill that count)
      // is a boot-strapping pin on all three chips — assigned to CLK, a
      // continuously-toggling line rather than a level-held control line, to
      // minimize (not eliminate) boot-level risk; not yet confirmed safe on
      // real hardware. Per-board remapping (so each board could use its own
      // less-constrained set) remains a follow-up, same as every other
      // hardware node.
      hub75R1Pin: 1,
      hub75G1Pin: 2,
      hub75B1Pin: 3,
      hub75R2Pin: 4,
      hub75G2Pin: 5,
      hub75B2Pin: 12,
      hub75APin: 13,
      hub75BPin: 14,
      hub75CPin: 15,
      hub75DPin: 16,
      // Row-select address line E, only wired for 1/32-scan (e.g. 64-row)
      // panels — gated by hub75WideScan below.
      hub75EPin: 33,
      hub75ClkPin: 0,
      hub75LatPin: 17,
      hub75OePin: 18,
      // 64-row / 1:32-scan panels multiplex an extra row-select line (E,
      // above); 32-row / 1:16-scan panels leave it unconnected.
      hub75WideScan: false,
      // PWM bit depth per channel — trades refresh-rate smoothness/flicker
      // against CPU/DMA bandwidth (ESP32-HUB75-MatrixPanel-DMA's
      // setPixelColorDepthBits).
      hub75ColorDepthBits: 8,
    },
  },
  {
    type: 'StereoVuMeter',
    label: 'Stereo VU Meter',
    category: 'output',
    inputs: [
      { id: 'audio', label: 'Audio', dataType: 'audio' },
      { id: 'paletteIn', label: 'Palette', dataType: 'palette' },
    ],
    propertyInputs: { palette: 'paletteIn' },
    outputs: [],
    defaultProperties: {
      targetOutputId: '',
      ledCount: 16,
      leftDataPin: 5,
      rightDataPin: 6,
      leftDirection: 'Bottom',
      rightDirection: 'Bottom',
      swapChannels: false,
      chipset: 'WS2812B',
      colorOrder: 'GRB',
      brightness: 0.65,
      powerLimit: true,
      milliamps: 1800,
      visualizationPolicy: 'Shuffle',
      visualizationMode: 'Classic Ladder',
      cycleInterval: 20,
      palette: 'party',
      leftColor: '#20ff70',
      rightColor: '#20a0ff',
      gain: 1,
      noiseGate: 0.02,
      responseCurve: 0.6,
      attackMs: 10,
      releaseMs: 280,
      peakHoldMs: 350,
      peakFall: 0.7,
      trailAmount: 0.72,
      beatAccent: 0.7,
      enabled: true,
    },
  },
  {
    // Opto-isolated 5 V relay bank. The selected physical module determines
    // whether one, two, four, or eight boolean inputs are present; graph load
    // normalization re-derives that port set from `partId`.
    type: 'RelayOutput',
    label: 'Relay Module',
    category: 'output',
    inputs: relayInputs(DEFAULT_RELAY_PART_ID),
    outputs: [],
    defaultProperties: {
      partId: DEFAULT_RELAY_PART_ID,
      in1Pin: 5,
      in2Pin: 16,
      in3Pin: 17,
      in4Pin: 18,
      in5Pin: 19,
      in6Pin: 21,
      in7Pin: 22,
      in8Pin: 23,
    },
  },
  {
    // DC MOSFET channels. A terminal sink like the relay, but active-high and
    // DC-only: each channel switches its load's negative lead, and the
    // load-side limits come from the catalogued module. Level dims a channel
    // with PWM on a module that can be dimmed; at 1 and unwired it is a plain
    // switch (state/peripherals/powerSwitch.ts has the rule both implementations share).
    // The selected board decides how many On/Level pairs there are, as it
    // does for a relay; `inputs` are the default one-channel board's.
    type: 'PowerSwitchOutput',
    label: 'Power Switch',
    category: 'output',
    inputs: powerSwitchInputs(DEFAULT_POWER_SWITCH_PART_ID),
    variantInputs: POWER_SWITCH_VARIANT_INPUTS,
    propertyInputs: Object.fromEntries(ALL_POWER_SWITCH_CHANNELS.map((channel) => [channel.level, channel.level])),
    outputs: [],
    defaultProperties: {
      partId: DEFAULT_POWER_SWITCH_PART_ID,
      ...Object.fromEntries(ALL_POWER_SWITCH_CHANNELS.flatMap((channel) => [
        [channel.pinKey, POWER_SWITCH_PIN_FALLBACKS[channel.index]],
        [channel.level, POWER_SWITCH_LEVEL_DEFAULT],
      ])),
    },
  },
  {
    // A 16-channel I2C PWM driver: a terminal sink like the relay, on the board's
    // one I2C bus. Each channel takes a 0-1 level and only a wired channel is
    // written, so the others stay off.
    type: 'PwmDriverOutput',
    label: 'PWM Driver',
    category: 'output',
    inputs: pwmDriverInputs(PCA9685_PART_ID),
    outputs: [],
    defaultProperties: {
      partId: PCA9685_PART_ID,
      sdaPin: 21,
      sclPin: 22,
      i2cAddress: formatPwmDriverAddress(pwmDriverSpec(PCA9685_PART_ID).defaultI2cAddress),
      pwmHz: pwmDriverSpec(PCA9685_PART_ID).defaultPwmHz,
    },
  },
  {
    // An eight-channel low-side driver array: a terminal sink like the relay,
    // active-high, one GPIO per channel. It sinks the load's current to ground.
    type: 'DarlingtonDriverOutput',
    label: 'Darlington Driver',
    category: 'output',
    inputs: darlingtonInputs(),
    outputs: [],
    defaultProperties: {
      partId: DARLINGTON_PART_ID,
      ...Object.fromEntries(darlingtonPinKeys().map((key, index) => [key, DARLINGTON_PIN_FALLBACKS[index]])),
    },
  },
  {
    // A buzzer on one GPIO: a terminal sink like the relay. An active part only
    // sounds or does not, at its own pitch; a passive part adds Pitch, which the
    // controller plays as a square wave. `inputs` are the default active part's.
    type: 'BuzzerOutput',
    label: 'Buzzer',
    category: 'output',
    inputs: buzzerInputs(BUZZER_PART_ID),
    variantInputs: BUZZER_VARIANT_INPUTS,
    propertyInputs: { pitchHz: 'pitch' },
    outputs: [],
    defaultProperties: { partId: BUZZER_PART_ID, sigPin: BUZZER_PIN_FALLBACK, pitchHz: BUZZER_PITCH_DEFAULT_HZ },
  },
  {
    // One exact four-wire fan: a 25 kHz PWM cooling output and an actual RPM
    // input from its open-collector tachometer. The browser estimates RPM from
    // the requested speed; generated firmware publishes measured pulses.
    type: 'CoolingFanOutput',
    label: 'Cooling Fan',
    category: 'output',
    inputs: [{ id: 'speed', label: 'Speed', dataType: 'float' }],
    propertyInputs: { speed: 'speed' },
    outputs: [
      { id: 'rpm', label: 'RPM', dataType: 'float' },
      { id: 'running', label: 'Running', dataType: 'bool' },
    ],
    defaultProperties: {
      partId: COOLING_FAN_PART_ID,
      pwmPin: COOLING_FAN_PWM_PIN_FALLBACK,
      tachPin: COOLING_FAN_TACH_PIN_FALLBACK,
      speed: COOLING_FAN_SPEED_DEFAULT,
    },
  },
  {
    // A 1-bit OLED with one content input and no layout property: what is
    // plugged into `Display` decides what it shows, one layout per source. The
    // port set is therefore stable by construction rather than by discipline,
    // and a panel wired to nothing says so rather than sitting blank.
    // See docs/design/simple-displays.md.
    type: 'InfoDisplay',
    label: 'Info Display',
    category: 'output',
    propertyInputs: { enabled: 'enabled' },
    defaultExposedInputs: ['enabled'],
    inputs: [
      { id: 'display', label: 'Display', dataType: 'display' },
      { id: 'enabled', label: 'Enabled', dataType: 'bool' },
    ],
    outputs: [],
    defaultProperties: {
      partId: 'sh1106-oled-128x64',
      oledRotation: '0',
      // Both transports' pins are declared, and `isPropertyEnabled` shows only
      // the chosen module's. Keeping the other set means switching module and
      // back does not lose the wiring you already entered.
      csPin: 5,
      dcPin: 16,
      resetPin: 17,
      sckPin: 18,
      mosiPin: 23,
      sdaPin: 21,
      sclPin: 22,
      i2cAddress: oledAddressLabel(DEFAULT_OLED_I2C_ADDRESS),
      enabled: true,
    },
  },
  {
    // Fixed colour layouts for the transport appliance. Every layout keeps
    // the same stable content inputs. Touch-capable modules publish their
    // control bundle through the linked TouchInput node; the panel itself is
    // an output-category terminal with no outputs.
    type: 'TransportDisplay',
    label: 'Display Panel',
    category: 'output',
    propertyInputs: { enabled: 'enabled' },
    defaultExposedInputs: ['enabled'],
    // One content input. `display` carries whatever the wired source publishes,
    // and `tftLayout` picks only between the treatments *that* source offers —
    // so a property can change how a player panel is drawn and can never make
    // it show a slideshow. The seventeen per-field ports `display` replaces
    // were the custom-UI capability in disguise; a screen design is that
    // capability done properly, and belongs to the panel (`displayId` below)
    // rather than arriving on a second, competing content wire. Artwork rides
    // the `display` envelope too, since the player owns both the track and the
    // selection that identifies the baked picture. A design and a source are
    // not rivals: the design reads the source through its widgets' bindings.
    inputs: [
      { id: 'display', label: 'Display', dataType: 'display' },
      { id: 'enabled', label: 'Enabled', dataType: 'bool' },
    ],
    // Nothing comes out of a display. What a finger does on the glass leaves
    // through the Touch node that shares this module — see `TouchInput`.
    outputs: [],
    defaultProperties: {
      partId: 'st7789-tft-240x240',
      // The screen drawn on this panel, when there is one. Empty means the
      // panel shows one of the fixed layouts below. A design belongs to the
      // glass it was drawn for, so this is the panel's own id rather than a
      // wire to a document somewhere else on the canvas.
      displayId: '',
      tftLayout: 'Now Playing',
      tftRotation: '0',
      sckPin: 18,
      mosiPin: 23,
      misoPin: 19,
      csPin: 5,
      // GPIO9 rather than 16 because on a parallel module this same line is
      // touch electrode X-, and 16 is ADC2 - readable on a bench and dead the
      // moment Wi-Fi comes on. It is an ordinary output on an SPI panel, so
      // moving it costs those nothing.
      dcPin: 9,
      resetPin: 17,
      backlightPin: 4,
      touchCsPin: 15,
      touchIrqPin: 2,
      // Sharing is the useful default; the separately broken-out touch header
      // can be moved to another SPI bus without changing the model.
      touchSckPin: 18,
      touchMosiPin: 23,
      touchMisoPin: 19,
      // 8-bit parallel lines, shown only for a parallel module. The four that
      // double as touch electrodes - csPin, dcPin, d0Pin, d1Pin - default onto
      // the ESP32-S3's ADC1 range so a fresh graph is not quietly placed on an
      // ADC the radio disables.
      wrPin: 33,
      rdPin: 34,
      d0Pin: 7,
      d1Pin: 8,
      d2Pin: 39,
      d3Pin: 40,
      d4Pin: 41,
      d5Pin: 42,
      d6Pin: 47,
      d7Pin: 48,
      enabled: true,
    },
  },
  {
    /*
     * One knob on the one shared time value.
     *
     * A sink rather than a source: it publishes nothing, it changes how fast
     * the clock every animated node already reads runs. Scaling `t` once is
     * what keeps a graph's dozen individual speeds in their existing
     * relationships, and what covers a node written next year without teaching
     * it anything.
     *
     * Unlike the LED output's blackout and dimming, the property is real and
     * used: this node is visible on the canvas, so a slider set to 0.5 with
     * nothing wired is a setting the user can see, not a hidden second dimmer.
     * See state/player/masterSpeed.ts.
     */
    type: 'MasterSpeed',
    label: 'Master Speed',
    category: 'output',
    inputs: [
      { id: 'speed', label: 'Speed', dataType: 'float' },
      // A knob on a Control Map reaches the clock the same way a wire does.
      { id: 'controls', label: 'Controls', dataType: 'playercontrols' },
    ],
    outputs: [],
    defaultProperties: { speed: MASTER_SPEED_DEFAULT },
  },
  {
    // A 7-segment module, added from the hardware workbench. Like the OLED it
    // takes one `Display` input and shows what the source implies: an RTC's
    // time, a player's elapsed position, a slideshow's ordinal. A raw number
    // from anywhere in the graph is a custom-UI capability, not this.
    // See docs/design/simple-displays.md.
    type: 'SegmentDisplay',
    label: 'Segment Display',
    category: 'output',
    propertyInputs: { enabled: 'enabled' },
    defaultExposedInputs: ['enabled'],
    inputs: [
      { id: 'display', label: 'Display', dataType: 'display' },
      { id: 'enabled', label: 'Enabled', dataType: 'bool' },
    ],
    outputs: [],
    defaultProperties: {
      partId: 'tm1637-4digit-display',
      clkPin: 18,
      dioPin: 19,
      dinPin: 19,
      csPin: 21,
      decimals: 0,
      leadingZero: false,
      showColon: true,
      brightness: 4,
      enabled: true,
    },
  },
  {
    // The external I2S amplifier the player feeds. Its pins used to live on
    // SD Card, which conflated "where the music is stored" with "what turns it
    // into sound" — two separate parts you buy, wire and can get wrong
    // independently. Splitting them also means a graph can say it has an amp
    // at all, which is what makes the pin advice and the wiring diagram able
    // to talk about it.
    //
    // Config only: no ports, no evaluation, found by scanning the graph — the
    // same shape as Board. Physical connections belong in the Build Diagram,
    // not as noodles on the canvas.
    type: 'Amplifier',
    label: 'Amplifier',
    category: 'output',
    inputs: [],
    outputs: [],
    defaultProperties: {
      // Defaults inherited from the SD Card node so existing wiring guides
      // stay correct; `model` exists so the node can name the exact part the
      // way Board names an exact board, rather than silently assuming one.
      model:   'MAX98357A',
      i2sBclk: 26,
      i2sLrc:  25,
      i2sDout: 22,
      // Software volume in the decoder. It sits with the output rather than
      // with the SD card, because it describes how loud the sound is, not
      // where the song came from. (The MAX98357A's own gain is a resistor.)
      maxVolume: 18,
    },
  },
  {
    // The analog power amplifier at the end of the output chain: line level
    // in, speakers out. A separate part from Amplifier because it is a
    // separate role — a PCM5102A feeding a DX-0809 is two parts on one bench,
    // and only the first is on the board's pins. It claims no GPIO when a DAC
    // feeds it, and the classic ESP32's GPIO25/26 when nothing else does; see
    // state/audio/audioOutput.ts for how the feed is resolved.
    //
    // Config only, like Amplifier: no ports, no evaluation.
    type: 'PowerAmplifier',
    label: 'Power Amplifier',
    category: 'output',
    inputs: [],
    outputs: [],
    defaultProperties: {
      partId: 'pam8403-3w-stereo-amplifier',
      // The decoder's software volume, used only when this part is fed
      // straight from the internal DAC. With a DAC in the chain the DAC is the
      // stage the board drives, and its volume is the one applied.
      maxVolume: 18,
    },
  },
]

export const OUTPUT_DESCRIPTIONS: Record<string, string> = {
  // output
  Board: 'The controller board — exact model, its pins, and what it supports.',
  MatrixOutput: 'An LED output for strings, matrices, rings, corkscrews, and HUB75 panels.',
  StereoVuMeter: 'A paired left/right addressable-string VU meter driven by one Audio connection.',
  RelayOutput: 'Switches one to eight active-low 5 V relay channels from boolean signals.',
  PowerSwitchOutput: 'Switches or dims DC loads through one to eight MOSFET channels.',
  PwmDriverOutput: 'Sets up to sixteen PWM levels on a PCA9685 over I2C.',
  DarlingtonDriverOutput: 'Switches up to eight loads to ground from boolean signals through a ULN2803A.',
  BuzzerOutput: 'Sounds a buzzer while its input is true; a passive one plays your Pitch.',
  CoolingFanOutput: 'Controls a four-wire cooling fan and reports its measured RPM.',
  InfoDisplay: 'A 128x64 OLED showing a now-playing, clock, status, or pattern-browser screen.',
  TransportDisplay: 'A colour TFT panel: a fixed transport or status layout, or a Screen Design.',
  MasterSpeed: 'Scales animation time for the whole graph. 1 is normal, 0 freezes it.',
  SegmentDisplay: 'A 4 or 8-digit 7-segment module showing a number, clock, or index.',
  Amplifier: 'The I2S amplifier the show player feeds — its part and pins.',
  PowerAmplifier: 'The analog amp driving the speakers, fed line level by a DAC.',
}
