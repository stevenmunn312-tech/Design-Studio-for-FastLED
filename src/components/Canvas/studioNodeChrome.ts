/**
 * The parts of a canvas node that are pure data: header badges, preview
 * notes, which properties get an inline editor, and which node types carry a
 * hardware-input widget. Shared by StudioNode.tsx (the live node) and
 * scripts/assets/node-cards.ts (the reference card), so the card always says
 * what the canvas says.
 */
import { ASSIGNED_BOARD_KEY, ASSIGNED_PINS_KEY, USER_PINS_KEY } from '../../build/pins/pinRetarget'
import { isHardwareNodeType } from '../../build/hardware'
import { isHardwarePartField } from '../../build/parts/partFields'
import { isGpioPinProperty, isInternalProperty, isPropertyEnabled } from '../../state/nodeLibrary'

export const CATEGORY_TAG: Record<string, string> = {
  input: 'IN',
  audio: 'AUD',
  signal: 'SIG',
  math: 'MTH',
  color: 'CLR',
  pattern: 'PAT',
  field: 'FLD',
  composite: 'CMP',
  show: 'SHW',
  output: 'OUT',
  note: 'NOTE',
}

export function moduleCode(nodeType: string): string {
  return nodeType.replace(/[^A-Z0-9]/gi, '').slice(0, 3).toUpperCase().padEnd(3, '·')
}

/**
 * Nodes wider than the 240 px frame. The property row grid gives a label the
 * width left beside its 112 px control and 16 px pin slot, so at 240 px a
 * label gets 84 px (about eleven characters): the nodes below either embed a
 * wider body (a code editor, the remote's key rows) or carry labels that
 * cannot be shortened to fit.
 */
export const NODE_WIDTH_OVERRIDES: Record<string, number> = {
  MusicLibrary: 300,
  Code: 320,
  CustomFormula: 320,
  FieldFormula: 320,
  PerformanceGenerator: 300,
  IRRemoteInput: 300,
  Comment: 260,
  ColorTrails: 280,
  PatternMaster: 280,
  MatrixOutput: 280,
  SpectrumVisualizer: 260,
  KickShock: 260,
  RainRipples: 260,
  PercussionBlobs: 260,
  AudioHue: 260,
}

/** Node types whose body carries a live HardwareInputBody widget. */
export const HARDWARE_INPUT_WIDGET_TYPES: ReadonlySet<string> = new Set([
  'ButtonInput', 'TouchButtonInput', 'PotInput', 'EncoderInput',
  'MotionInput', 'LightInput', 'PowerMonitorInput', 'EnvironmentInput', 'TemperatureInput',
  'DistanceInput', 'JoystickInput', 'MotionVectorInput', 'KeypadInput', 'TouchPadInput',
  'PresenceInput',
])

// Nodes whose canvas preview intentionally diverges from firmware behaviour
// (export-only outputs). Rendered as a muted note at the bottom of the body
// so the fallback reads as deliberate, not broken. The audio nodes surface
// their own state (FFTAnalyzerBody's MIC LIVE / TEST SIGNAL / SILENT pill,
// BeatDetectBody's LIVE / PREVIEW badge); ButtonInput/PotInput/EncoderInput
// get a live widget (HardwareInputBody) instead of a note.
export const PREVIEW_NOTES: Record<string, { text: string; title: string }> = {
  DMXInput: {
    text: 'preview listens for helper-backed Art-Net; firmware uses the selected DMX source',
    title: 'The browser preview reads Art-Net packets through the local helper. Generated firmware uses this node’s selected DMX source instead: Art-Net over Wi-Fi or DMX512 over an ESP32 transceiver.',
  },
  PowerMonitorInput: {
    text: 'preview readings come from the sliders; firmware reads the INA219 or INA226',
    title: 'The browser has no sensor to read, so the two sliders stand in for the measured volts and amps and watts is their product, as it is on the device. Generated firmware reads bus and shunt voltage from the monitor over I2C and derives amps from the fitted shunt.',
  },
  MotionVectorInput: {
    text: 'preview axes come from the sliders; firmware reads the MPU-6050',
    title: 'The browser has no motion sensor, so six sliders stand in for acceleration (g) and rotation rate (degrees per second), starting with the board lying flat, and Connected is always true. Generated firmware reads all six from the MPU-6050 over I2C in one burst; Connected goes false when it stops answering.',
  },
  TouchPadInput: {
    text: 'preview electrodes are the pads on the node; firmware reads the MPR121',
    title: 'The browser has no touch controller, so the twelve pads stand in for the electrodes and Connected is always true. Electrode holds the lowest one touched, as an index from 0 to 11, and keeps it after release; Touched is true while any pad is down and Count is how many. Generated firmware reads the touch status from the MPR121 over I2C; Connected goes false when it stops answering.',
  },
  KeypadInput: {
    text: 'preview keys are the buttons on the node; firmware scans the matrix',
    title: 'The browser has no keypad, so the sixteen buttons stand in for the keys. Key holds the last one pressed, as an index from 0 to 15 row by row (1 2 3 A, 4 5 6 B, 7 8 9 C, * 0 # D), and Pressed is true while any key is down. Generated firmware drives each column low in turn and reads the rows through their pull-ups.',
  },
  JoystickInput: {
    text: 'preview axes come from the sliders; firmware reads the two ADC pins',
    title: 'The browser has no joystick, so the two sliders stand in for the X and Y axes, centred at half travel, and the push button for the switch. Generated firmware reads each axis as a 12-bit ADC count, centres it on half scale, removes the dead zone and rescales to -1 to 1.',
  },
  DistanceInput: {
    text: 'preview reading comes from the slider; firmware times the HC-SR04 echo or reads the VL53L0X or VL53L1X',
    title: 'The browser has no ultrasonic sensor, so the slider stands in for the distance and Connected is always true. Generated firmware pulses Trig, times the Echo, and reports Connected false when no echo returns. Readings are taken every 60 ms and held between.',
  },
  TemperatureInput: {
    text: 'preview reading comes from the slider; firmware reads the DS18B20',
    title: 'The browser has no probe to read, so the slider stands in for the temperature and Connected is always true. Generated firmware starts a conversion, reads the probe 800 ms later and checks its CRC; Connected goes false when a read fails.',
  },
  EnvironmentInput: {
    text: 'preview readings come from the sliders; firmware reads the BME280',
    title: 'The browser has no environment sensor to read, so the sliders stand in for temperature, humidity and pressure. Generated firmware reads and compensates all three measurements from the BME280 over I2C.',
  },
  RTCInput: {
    text: 'preview follows the configured source; only sync state is simulated',
    title: 'The preview clock matches the configured source: a Manual seed runs forward from when the preview started, NTP shows UTC plus the configured offset, and Compile Time stands in for the build stamp using the browser clock. Preview cannot know real network state, so it always reports synced.',
  },
  MidiInput: {
    text: 'preview-only — no embedded MIDI equivalent',
    title: 'Reads a connected MIDI controller via the Web MIDI API for live preview control. There is no hardware analogue, so the generated firmware always sees the idle default (velocity 0, gate off, cc 0).',
  },
}

/** Whether a node's `r`/`g`/`b` are numbers, so it gets one colour swatch
 *  instead of three number fields. */
export function hasRgbProperties(props: Record<string, unknown>): boolean {
  return ['r', 'g', 'b'].every((k) => typeof props[k] === 'number')
}

const NO_KEYS: ReadonlySet<string> = new Set()

/**
 * The properties a node draws an inline editor for, in property order.
 *
 * Everything the app keeps for itself, edits through a dedicated body, or
 * owns from the hardware workbench is left out; the comments on each clause
 * say which. `props` is the node's saved properties layered over its library
 * defaults, as StudioNode builds them. `exposedKeys` names the properties
 * whose input socket is exposed or wired: their rows stay even where the
 * node's current mode does not use them, so the socket keeps its wire.
 */
export function editableProperties(
  nodeType: string, props: Record<string, unknown>, exposedKeys: ReadonlySet<string> = NO_KEYS,
): Array<[string, unknown]> {
  const hasRGB = hasRgbProperties(props)
  const isGroupInput = nodeType === 'GroupInput'
  const isComment = nodeType === 'Comment'
  return Object.entries(props).filter(
    // Bookkeeping the app keeps for itself, declared in one place rather than
    // added to the chain below each time somebody notices one on their canvas.
    ([k]) => !isInternalProperty(k)
      && !(nodeType === 'IRRemoteInput' && k === 'debug')
      && k !== 'font' && k !== 'image' && k !== 'animation' && k !== 'clip' && k !== 'mesh' && k !== 'code' && k !== 'globalCode' && k !== 'clampInputs' && k !== 'patternIds' && k !== 'patternSections' && k !== 'transitions' && k !== 'previewHidden' && k !== 'bypassed' && k !== 'showInMainPreview' && k !== 'profileId' && k !== 'sourceId' && k !== 'buttons' && k !== 'controls' && k !== '_ledCountCustom'
    // Pin provenance is bookkeeping, not a setting: which pins the app
    // assigned, which board for, and the user's own choices per board.
    // It was rendering as `[object Object]` rows on every hardware node.
    && k !== ASSIGNED_PINS_KEY && k !== ASSIGNED_BOARD_KEY && k !== USER_PINS_KEY
      && !(nodeType === 'CustomPalette' && (k === 'colors' || k === 'positions'))
      && !(nodeType === 'Poline' && (k === 'anchorA' || k === 'anchorB' || k === 'anchorC'))
      // The Palette Bank body edits its palette list; as a text row the array
      // read `ocean,lava`, and typing into it emptied the bank.
      && !(nodeType === 'PaletteBank' && k === 'palettes')
      // The Transition body's picker cards are its type control.
      && !(nodeType === 'Transition' && k === 'transitionType')
      // Comment's `text` gets its own multi-line editor in the body, not the
      // generic single-line field list.
      && !(isComment && k === 'text')
      // Custom Formula's `formula` gets the Code node's editor in the body,
      // with its parse error beneath it.
      && !(nodeType === 'CustomFormula' && k === 'formula')
      // PSRAM controls render in the upload tab — their visibility depends
      // on whether the *selected board* supports PSRAM, which only it knows.
      && k !== 'usePsram' && k !== 'psramPolicy' && k !== 'psramMode' && k !== 'serialRoute'
      // MatrixOutput's width/height are edited via the dedicated size dropdown
      // (16/32/64/Custom) below, not the generic number-field editor.
      && k !== 'width' && k !== 'height'
      // What the output physically *is* belongs to the hardware view: you get
      // a ring by putting a ring on the bench, not by retyping a matrix. A
      // dropdown here let the graph claim a part the bench did not have, which
      // is the one thing the two-view model exists to prevent.
      && k !== 'form'
      && !(nodeType === 'StereoVuMeter' && k === 'targetOutputId')
      // Physical wiring and hardware-specific selectors have one owner: the
      // part's popup on the workbench, not a second editor on the graph node.
      && !(isHardwareNodeType(nodeType)
        && (isGpioPinProperty(nodeType, k) || isHardwarePartField(nodeType, k)))
      && !(isGroupInput && k === 'paramId')
      && !(hasRGB && (k === 'r' || k === 'g' || k === 'b'))
      // A property the current mode does not use is hidden, not shown
      // disabled. Disabled rows read as context on a five-property node like
      // Transition, but the LED output has forty-six, so a string was showing
      // thirty-three dead rows against thirteen live ones, and Formula Field
      // showed fourteen dead rows for four live ones. At that ratio the
      // greyed rows stop being context and start being the thing you have to
      // read past, so every node hides them and its groups drop out when
      // emptied. A row whose socket is exposed or wired stays, disabled, so
      // the wire keeps its handle.
      && (exposedKeys.has(k) || isPropertyEnabled(nodeType, k, props))
  )
}
