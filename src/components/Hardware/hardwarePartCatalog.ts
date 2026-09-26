// What the Hardware workspace can put on the bench: the board, each input
// module and fixture, the LED output forms, and the pins each one asks for.
import amplifierRender from '../../assets/components/max98357a-i2s-amplifier.webp'
import { transportDisplayPinKeysForProps, gpioRequirementForProperty } from '../../state/nodeLibrary'
import { PART_FIELDS } from '../../state/partFields'
import type { PartPinRequest } from '../../state/partPinAssignment'
import { segmentControllerFor } from '../../state/segmentDisplay'
import { OLED_TRANSPORT_PINS, oledTransportFor } from '../../state/oledSurface'
import { partById, partDimensionsMm, partRenderSrc, partPinLabelForProperty } from '../../state/partCatalogue'
import { IR_RECEIVER_MODULES } from '../../state/irModules'
import { IR_REMOTE_LEARN_HANDLE } from '../../state/irRemote'
import { MIC_MODULES } from '../../state/micModules'
import { LIGHT_SENSOR_MODULES } from '../../state/lightSensor'
import type { PhysicalBoardProfile } from '../../build/boardProfiles'
import {
  WS2812B_PITCH_MM,
  type PartFootprintMm,
  MAX98357A_FOOTPRINT_MM,
  MIC_FALLBACK_FOOTPRINT_MM,
  BUTTON_MODULE_FOOTPRINT_MM,
  POT_MODULE_FOOTPRINT_MM,
  ENCODER_MODULE_FOOTPRINT_MM,
} from '../../state/hardware'
import type { LedOutputForm } from '../../state/ledOutputForm'
import { relayPinKeys, DEFAULT_RELAY_PART_ID } from '../../state/relayModule'
import { DEFAULT_POWER_SWITCH_PART_ID } from '../../state/powerSwitch'
import { DEFAULT_POWER_CONVERTER_PART_ID } from '../../state/powerConverter'

export const MIC_NODE_TYPE = 'MicInput'

/*
 * The box the two VU rails hang in, across the channels. Each rail is one pitch
 * of board and the rest is the space between a left and a right channel: enough
 * that the pair reads as two strings mounted side by side rather than as one
 * wide panel with its middle missing. `.vuPair` divides this box; the meter has
 * no board of its own, so nothing else measures it.
 */
export const VU_PAIR_WIDTH_MM = WS2812B_PITCH_MM * 6

/**
 * The parts that carry signal into the board, and so exist in both views: a
 * module in the hardware view and an ordinary node in the graph.
 *
 * Sourced here rather than dragged from the sidebar, which is the decision the
 * whole two-view design rests on — a part created this way is attached to a
 * known board with known-good pins by construction, so the class of pin bug
 * hardware validation kept finding stops being expressible.
 *
 * The microphone is the exception to the pin rule: its I2S trio comes from the
 * board profile's own `peripheralPins.inmp441` via `resolveDefaultProperties`,
 * because an I2S peripheral is a fixed function of the pads, not any three free
 * GPIOs. The rest ask `assignPartPins` for whatever the board has spare.
 */
export interface InputPartEntry {
  nodeType: string
  /** Part id in the layout — stable, and independent of the node backing it. */
  partId: string
  label: string
  hint: string
  footprint: PartFootprintMm
  /** The output port whose activity lights this part's run to the board. */
  signalPort: string
  /** The data type used to color the hardware-view run. */
  dataType?: string
  /** Pins to find on the board. Empty when the profile supplies them. */
  pinRequests: readonly PartPinRequest[]
  /** Pin roles printed below the part, including profile-supplied buses. */
  pinFields: readonly { key: string; label: string }[]
  /** Extra properties stamped on nodes created from this hardware entry. */
  properties?: Record<string, unknown>
  /** Caption when the part is wired by a board peripheral rather than GPIO. */
  connectionSummary?: string
  /** Scene singletons — one microphone per board, but many buttons. */
  singleton?: boolean
  /** Firmware families that can host this capture path. */
  fqbnPrefix?: string
}

/**
 * Parts that exist only here: physically real, carrying no signal, so they have
 * no node on the graph canvas.
 *
 * They are still graph *nodes* — hidden ones — because that is where their
 * settings persist with the workspace and where `playerSketchGenerator` already
 * scans for them. What changes is that nothing draws them on the signal canvas
 * and nothing offers them in the sidebar. Board works exactly this way already.
 */
export interface FixturePartEntry {
  nodeType: string
  partId: string
  label: string
  hint: string
  /** Absent only for a node with no physical existence — see `Display` below. */
  footprint?: PartFootprintMm
  /** Absent until the Blender render lands; a placeholder is drawn meanwhile. */
  render?: string
  /** Pins to read off the board profile, keyed property -> profile field. */
  profilePins?: Record<string, 'bclk' | 'lrc' | 'din'>
  /** Compact pin row shown beneath the physical module on the bench. Absent alongside `footprint`. */
  pinFields?: readonly { key: string; label: string }[]
  /** Pins to find on the board, for a part no board profile places for us. */
  pinRequests?: readonly PartPinRequest[]
  singleton?: boolean
}

/**
 * The pins one exact module wires, where a node type covers several.
 *
 * A TM1637 has CLK and DIO; a MAX7219 has CLK, DIN and a load line. Asking the
 * board for the wrong pair would place pins the generated sketch never drives
 * and leave the one it does unassigned, so the request follows the chosen
 * module rather than the node type.
 */
export const MODULE_PIN_LABELS: Record<string, string> = Object.fromEntries(
  Object.values(PART_FIELDS).flatMap((fields) =>
    fields.filter((field) => field.kind === 'pin').map((field) => [field.key, field.label])),
)

export function modulePinKeys(nodeType: string, moduleId: string | undefined): readonly string[] | null {
  const entry = partById(String(moduleId ?? ''))
  if (nodeType === 'RelayOutput') return relayPinKeys(moduleId)
  // A 7-pin SPI SH1106 and a 4-pin I2C SSD1306 are one node with two headers.
  // Asking the board for the union would reserve five pins for a module with
  // two, and drawing it would label wires the module does not bring out.
  if (nodeType === 'InfoDisplay') return OLED_TRANSPORT_PINS[oledTransportFor(entry?.display?.interface)]
  if (nodeType === 'TransportDisplay') return transportDisplayPinKeysForProps({ partId: moduleId })
  if (nodeType !== 'SegmentDisplay') return null
  return segmentControllerFor(entry?.display?.controller).pins
}

export function fixturePinRequests(nodeType: string, moduleId: string | undefined): readonly PartPinRequest[] | undefined {
  const keys = modulePinKeys(nodeType, moduleId)
  if (!keys) return undefined
  const properties = { partId: moduleId }
  return keys.map((key) => {
    const capability = gpioRequirementForProperty(nodeType, key, properties)?.capability
    return capability ? { key, capability } : { key }
  })
}

export const FIXTURE_PARTS: readonly FixturePartEntry[] = [
  {
    // Converts a DC source to 5 V for either the controller or the LED rail.
    // No pins: it sits on the power path, which the Build Diagram draws.
    nodeType: 'PowerConverter',
    partId: 'power-converter',
    label: 'DC-DC converter',
    hint: 'Powers the controller or the 5 V LED rail from a higher-voltage source',
    footprint: partDimensionsMm(DEFAULT_POWER_CONVERTER_PART_ID, { width: 43.18, height: 21.08 }),
    render: partRenderSrc(DEFAULT_POWER_CONVERTER_PART_ID) ?? undefined,
  },
  {
    nodeType: 'RelayOutput',
    partId: 'relay-output',
    label: 'Relay module',
    hint: 'Switches an isolated load from boolean graph signals',
    footprint: partDimensionsMm(DEFAULT_RELAY_PART_ID, { width: 50, height: 26 }),
    render: partRenderSrc(DEFAULT_RELAY_PART_ID) ?? undefined,
    pinFields: [{ key: 'in1Pin', label: 'IN1' }],
    pinRequests: [{ key: 'in1Pin', capability: 'digitalOutput' }],
  },
  {
    nodeType: 'PowerSwitchOutput',
    partId: 'power-switch-output',
    label: 'Power switch',
    hint: 'Switches a DC load on and off from a boolean graph signal',
    footprint: partDimensionsMm(DEFAULT_POWER_SWITCH_PART_ID, { width: 16, height: 35 }),
    render: partRenderSrc(DEFAULT_POWER_SWITCH_PART_ID) ?? undefined,
    pinFields: [{ key: 'signalPin', label: 'PWM' }],
    pinRequests: [{ key: 'signalPin', capability: 'digitalOutput' }],
  },
  {
    nodeType: 'StereoVuMeter',
    partId: 'stereo-vu-meter',
    label: 'Stereo VU Meter',
    hint: 'Paired vertical addressable strings for left/right audio level',
    footprint: { width: VU_PAIR_WIDTH_MM, height: 600 },
    pinFields: [
      { key: 'leftDataPin', label: 'LEFT DATA' },
      { key: 'rightDataPin', label: 'RIGHT DATA' },
    ],
    pinRequests: [{ key: 'leftDataPin' }, { key: 'rightDataPin' }],
    singleton: true,
  },
  {
    nodeType: 'TransportDisplay',
    partId: 'transport-display',
    label: 'Display panel',
    hint: 'A colour TFT: a fixed now-playing or show-status layout, or a Screen design',
    footprint: partDimensionsMm('st7789-tft-240x240', { width: 35.8, height: 35.8 }),
    render: partRenderSrc('st7789-tft-240x240') ?? undefined,
    pinFields: [
      { key: 'sckPin', label: 'SCL' },
      { key: 'mosiPin', label: 'SDA' },
      { key: 'csPin', label: 'CS' },
      { key: 'dcPin', label: 'DC' },
      { key: 'resetPin', label: 'RST' },
      { key: 'backlightPin', label: 'BL' },
    ],
    pinRequests: [
      { key: 'sckPin' }, { key: 'mosiPin' }, { key: 'csPin' },
      { key: 'dcPin' }, { key: 'resetPin' }, { key: 'backlightPin' },
    ],
  },
  {
    // Two modules behind one node: the SH1106 on SPI and the SSD1306 on I2C.
    // Its footprint and render resolve per chosen module through
    // resolvePartIdentity, so picking the other one redraws the bench.
    nodeType: 'InfoDisplay',
    partId: 'info-display',
    label: 'Info display',
    hint: 'A 128x64 OLED screen',
    footprint: partDimensionsMm('sh1106-oled-128x64', { width: 35.5, height: 33.7 }),
    render: partRenderSrc('sh1106-oled-128x64') ?? undefined,
    pinFields: [
      { key: 'csPin', label: 'CS' },
      { key: 'dcPin', label: 'DC' },
      { key: 'resetPin', label: 'RES' },
      { key: 'sckPin', label: 'CLK' },
      { key: 'mosiPin', label: 'MOSI' },
    ],
    pinRequests: [
      { key: 'csPin' }, { key: 'dcPin' }, { key: 'resetPin' },
      { key: 'sckPin' }, { key: 'mosiPin' },
    ],
  },
  {
    // Signal-carrying, unlike the other two fixtures — it consumes a wired
    // value — but it is drawn on the bench exactly like them: a module with a
    // pin row, fed from the board. The graph half shows on the canvas because
    // it is in the hardware-managed *signal* set.
    nodeType: 'SegmentDisplay',
    partId: 'segment-display',
    label: 'Segment display',
    hint: 'Four digits for a number, clock, or index',
    footprint: partDimensionsMm('tm1637-4digit-display', { width: 42, height: 24 }),
    render: partRenderSrc('tm1637-4digit-display') ?? undefined,
    pinFields: [
      { key: 'clkPin', label: 'CLK' },
      { key: 'dioPin', label: 'DIO' },
    ],
    pinRequests: [{ key: 'clkPin' }, { key: 'dioPin' }],
  },
  {
    nodeType: 'SDCard',
    partId: 'sdcard',
    label: 'SD Card',
    hint: 'Storage for music-synced shows',
    // Sized and pictured per module, because the 5 V board and the bare 3.3 V
    // one are different objects — and mixing them up destroys cards.
    footprint: partDimensionsMm('microsd-module-5v', { width: 24, height: 42 }),
    render: partRenderSrc('microsd-module-5v') ?? undefined,
    pinFields: [
      { key: 'sdCsPin', label: 'CS' },
      { key: 'sdSckPin', label: 'SCK' },
      { key: 'sdMisoPin', label: 'MISO' },
      { key: 'sdMosiPin', label: 'MOSI' },
    ],
    singleton: true,
  },
  {
    nodeType: 'Amplifier',
    partId: 'amplifier',
    label: 'Amplifier',
    hint: 'I2S amp for the SD-card player',
    footprint: partDimensionsMm('max98357a-i2s-amplifier', MAX98357A_FOOTPRINT_MM),
    render: partRenderSrc('max98357a-i2s-amplifier') ?? amplifierRender,
    profilePins: { i2sBclk: 'bclk', i2sLrc: 'lrc', i2sDout: 'din' },
    pinFields: [
      { key: 'i2sBclk', label: 'BCLK' },
      { key: 'i2sLrc', label: 'LRC' },
      { key: 'i2sDout', label: 'DIN' },
    ],
    singleton: true,
  },
  {
    // Wired Ethernet for Art-Net and NTP. Carries no signal, like the SD card:
    // it changes how the sketch reaches the network, not what any node outputs.
    nodeType: 'EthernetModule',
    partId: 'ethernet',
    label: 'Ethernet',
    hint: 'Wired network for Art-Net and NTP, in place of Wi-Fi',
    footprint: partDimensionsMm('wiz850io-ethernet-module', { width: 27.95, height: 23 }),
    render: partRenderSrc('wiz850io-ethernet-module') ?? undefined,
    pinFields: [
      { key: 'sckPin', label: 'SCLK' },
      { key: 'mosiPin', label: 'MOSI' },
      { key: 'misoPin', label: 'MISO' },
      { key: 'csPin', label: 'SCNn' },
      { key: 'intPin', label: 'INTn' },
      { key: 'resetPin', label: 'RSTn' },
    ],
    pinRequests: [
      { key: 'sckPin' }, { key: 'mosiPin' }, { key: 'misoPin', capability: 'digitalInput' },
      { key: 'csPin' }, { key: 'intPin', capability: 'digitalInput' }, { key: 'resetPin' },
    ],
    // The generated sketch brings up one network interface.
    singleton: true,
  },
  {
    // The analog end of the output chain. No pin fields: fed by a DAC it has
    // no GPIO, and fed by the classic ESP32's own DAC its two pins are fixed.
    nodeType: 'PowerAmplifier',
    partId: 'power-amplifier',
    label: 'Power Amplifier',
    hint: 'Line level in, speakers out',
    footprint: partDimensionsMm('pam8403-3w-stereo-amplifier', { width: 23, height: 16 }),
    render: partRenderSrc('pam8403-3w-stereo-amplifier') ?? undefined,
    singleton: true,
  },
]

/*
 * One shelf row per microphone module, matching the convention the two RTC
 * modules already follow: an input part names its module in `properties`, and
 * `inputParts` finds the entry back by that stamped id. Derived from
 * `MIC_MODULES` so the shelf, the Add Hardware menu and the generator's factory
 * table cannot disagree about which modules exist.
 *
 * Pin labels come from each module's own silkscreen — an ICS-43434 prints
 * LRCL/BCLK/DOUT where an INMP441 prints WS/SCK/SD — resolved through the
 * catalogue rather than restated per entry.
 */
const MIC_PIN_KEYS = ['i2sWs', 'i2sSck', 'i2sSd'] as const
const MIC_FALLBACK_PIN_LABELS: Record<string, string> = { i2sWs: 'WS', i2sSck: 'SCK', i2sSd: 'SD' }

const MIC_INPUT_PARTS: readonly InputPartEntry[] = MIC_MODULES.map((module, index) => ({
  nodeType: MIC_NODE_TYPE,
  // The first keeps the bare `mic` id the bench layout has always stored.
  partId: index === 0 ? 'mic' : `mic-${module.partId}`,
  label: `${module.label} microphone`,
  hint: module.summary,
  // 15.0 x 10.5 from the asset's datasheet-checked part.json. The constant it
  // falls back to says 20.5 x 14.5 — a third larger, for the same picture.
  footprint: partDimensionsMm(module.partId, MIC_FALLBACK_FOOTPRINT_MM),
  signalPort: 'audio',
  pinRequests: [],
  pinFields: MIC_PIN_KEYS.map((key) => ({
    key,
    label: partPinLabelForProperty(module.partId, key) ?? MIC_FALLBACK_PIN_LABELS[key],
  })),
  singleton: true,
  properties: { partId: module.partId },
}))

/*
 * One shelf row per IR receiver, derived from `IR_RECEIVER_MODULES` for the
 * same reason the microphones are: the shelf, the Add Hardware menu and the
 * part catalogue cannot then disagree about which receivers exist.
 *
 * The pin label comes from each module's own silkscreen — a KY-022 prints S
 * where Vishay's datasheet names the pin OUT — resolved through the catalogue
 * rather than restated here. These two are not pin-compatible, so showing the
 * name the board in front of you actually carries is the point.
 */
const IR_INPUT_PARTS: readonly InputPartEntry[] = IR_RECEIVER_MODULES.map((module, index) => ({
  nodeType: 'IRRemoteInput',
  partId: index === 0 ? 'ir-remote' : `ir-remote-${module.partId}`,
  label: module.label,
  hint: module.summary,
  footprint: partDimensionsMm(module.partId, { width: 22.06, height: 17.13 }),
  signalPort: IR_REMOTE_LEARN_HANDLE,
  dataType: 'bool',
  pinRequests: [{ key: 'pin' }],
  pinFields: [{
    key: 'pin',
    label: partPinLabelForProperty(module.partId, 'pin') ?? 'OUT',
  }],
  // The firmware library's receiver API is global, so one per bench until
  // there is a tested multi-instance design.
  singleton: true,
  properties: { partId: module.partId },
}))

const LIGHT_INPUT_PARTS: readonly InputPartEntry[] = LIGHT_SENSOR_MODULES.map((module, index) => {
  const digital = module.transport === 'i2c'
  return {
    nodeType: 'LightInput',
    partId: index === 0 ? 'ldr' : `light-${module.partId}`,
    label: module.label,
    hint: module.summary,
    footprint: partDimensionsMm(module.partId, digital ? { width: 25.4, height: 17.78 } : { width: 32, height: 23.8 }),
    signalPort: digital ? 'lux' : 'level',
    dataType: 'float',
    pinRequests: digital ? [] : [{ key: 'pin', capability: 'analogInput' }],
    pinFields: digital
      ? [{ key: 'sdaPin', label: 'SDA' }, { key: 'sclPin', label: 'SCL' }]
      : [{ key: 'pin', label: 'GPIO' }],
    properties: { partId: module.partId },
    ...(digital ? { connectionSummary: 'Default I2C bus' } : {}),
  }
})

export const INPUT_PARTS: readonly InputPartEntry[] = [
  ...MIC_INPUT_PARTS,
  ...IR_INPUT_PARTS,
  ...LIGHT_INPUT_PARTS,
  {
    nodeType: 'LineInput',
    partId: 'line-in',
    label: 'PCM1802 line-in ADC',
    hint: 'Analyses line-level audio from an external player',
    footprint: partDimensionsMm('pcm1802-line-in-adc', { width: 52, height: 38 }),
    signalPort: 'audio',
    pinRequests: [
      { key: 'i2sMclk' },
      { key: 'i2sBclk' },
      { key: 'i2sLrclk' },
      { key: 'i2sDout', capability: 'digitalInput' },
    ],
    pinFields: [
      { key: 'i2sMclk', label: 'MCLK' },
      { key: 'i2sBclk', label: 'BCLK' },
      { key: 'i2sLrclk', label: 'LRCLK' },
      { key: 'i2sDout', label: 'DOUT' },
    ],
    properties: { partId: 'pcm1802-line-in-adc' },
    singleton: true,
    fqbnPrefix: 'esp32:esp32:esp32s3',
  },
  {
    nodeType: 'RTCInput',
    partId: 'rtc',
    label: 'DS3231 RTC module',
    hint: 'Battery-backed clock on the board I2C bus',
    footprint: partDimensionsMm('ds3231-rtc-module', { width: 38, height: 22 }),
    signalPort: 'secondsOfDay',
    dataType: 'float',
    pinRequests: [],
    pinFields: [
      { key: 'sdaPin', label: 'SDA' },
      { key: 'sclPin', label: 'SCL' },
    ],
    properties: { timeSource: 'DS3231', partId: 'ds3231-rtc-module' },
    connectionSummary: 'Default I2C bus',
    singleton: true,
  },
  {
    nodeType: 'RTCInput',
    partId: 'rtc-xc9044',
    label: 'DS3231 RTC Clock Module for Raspberry Pi',
    hint: 'Compact Pi-header clock on the board I2C bus',
    footprint: partDimensionsMm('jaycar-xc9044-rtc-module', { width: 14, height: 14 }),
    signalPort: 'secondsOfDay',
    dataType: 'float',
    pinRequests: [],
    pinFields: [
      { key: 'sdaPin', label: 'SDA' },
      { key: 'sclPin', label: 'SCL' },
    ],
    properties: { timeSource: 'DS3231', partId: 'jaycar-xc9044-rtc-module' },
    connectionSummary: 'Default I2C bus',
    singleton: true,
  },
  {
    nodeType: 'ButtonInput',
    partId: 'button',
    label: 'Button',
    hint: 'A momentary push button',
    footprint: BUTTON_MODULE_FOOTPRINT_MM,
    signalPort: 'pressed',
    pinRequests: [{ key: 'pin' }],
    pinFields: [{ key: 'pin', label: 'GPIO' }],
  },
  {
    nodeType: 'ButtonBank',
    partId: 'button-bank',
    label: 'Button bank',
    hint: 'Connect outputs to add and name buttons',
    footprint: BUTTON_MODULE_FOOTPRINT_MM,
    signalPort: 'add-button',
    pinRequests: [],
    pinFields: [],
  },
  {
    nodeType: 'PotInput',
    partId: 'pot',
    label: 'Potentiometer',
    hint: 'A knob on an analog pin',
    footprint: POT_MODULE_FOOTPRINT_MM,
    signalPort: 'value',
    // The one part that cannot take just any free pin.
    pinRequests: [{ key: 'pin', capability: 'analogInput' }],
    pinFields: [{ key: 'pin', label: 'GPIO' }],
  },
  {
    nodeType: 'MotionInput',
    partId: 'pir',
    label: 'HC-SR501 PIR sensor',
    hint: 'Goes high while it sees movement',
    footprint: partDimensionsMm('hc-sr501-pir-sensor', { width: 32, height: 24 }),
    signalPort: 'motion',
    dataType: 'bool',
    pinRequests: [{ key: 'pin' }],
    pinFields: [{ key: 'pin', label: 'GPIO' }],
  },
  {
    nodeType: 'PowerMonitorInput',
    partId: 'power-monitor',
    label: 'INA219 power monitor',
    hint: 'Volts, amps and watts of a DC load, on the board I2C bus',
    footprint: partDimensionsMm('adafruit-ina219-current-sensor', { width: 25.4, height: 20.32 }),
    signalPort: 'watts',
    dataType: 'float',
    // Joins the board's one I2C bus rather than taking free GPIO.
    pinRequests: [],
    pinFields: [
      { key: 'sdaPin', label: 'SDA' },
      { key: 'sclPin', label: 'SCL' },
    ],
    properties: { partId: 'adafruit-ina219-current-sensor' },
  },
  {
    nodeType: 'PresenceInput',
    partId: 'presence-sensor',
    label: 'HLK-LD2410C presence sensor',
    hint: 'Radar presence, movement and distance over UART',
    footprint: partDimensionsMm('hlk-ld2410c-presence-sensor', { width: 22, height: 16 }),
    signalPort: 'presence',
    dataType: 'bool',
    pinRequests: [{ key: 'rxPin' }],
    pinFields: [{ key: 'rxPin', label: 'RX (sensor TX)' }],
    properties: { partId: 'hlk-ld2410c-presence-sensor' },
  },
  {
    nodeType: 'EncoderInput',
    partId: 'encoder',
    label: 'Rotary encoder',
    hint: 'Quadrature dial with a push switch',
    footprint: ENCODER_MODULE_FOOTPRINT_MM,
    signalPort: 'position',
    pinRequests: [{ key: 'pinA' }, { key: 'pinB' }, { key: 'pinSW' }],
    pinFields: [
      { key: 'pinA', label: 'A' },
      { key: 'pinB', label: 'B' },
      { key: 'pinSW', label: 'SW' },
    ],
  },
]

/** Format a part's assigned pins in ascending GPIO order, retaining each role. */
export function numericPinSummary(
  properties: Record<string, unknown>,
  fields: readonly { key: string; label: string }[],
): string {
  return fields
    .map(({ key, label }) => ({ label, pin: Number(properties[key]) }))
    .filter(({ pin }) => Number.isFinite(pin))
    .sort((left, right) => left.pin - right.pin || left.label.localeCompare(right.label))
    .map(({ label, pin }) => `${label} ${pin}`)
    .join(' · ')
}
// One node type for every LED output; the form says what physical geometry the
// chain or panel has (src/state/ledOutputForm.ts).
export const LED_OUTPUT_NODE_TYPE = 'MatrixOutput'

/**
 * The LED output forms, as the "Add Hardware" menu offers them.
 *
 * Separate entries rather than a dropdown behind one, because "I bought a ring,
 * where is the ring?" is a fair question a hidden variant answers badly — and
 * one node type behind them, because all forms share a port signature and the
 * bundling rule says that is one node with a variant property.
 */
export const LED_OUTPUT_ENTRIES: Array<{
  form: LedOutputForm
  hint: string
  properties: Record<string, unknown>
}> = [
  { form: 'strip', hint: 'A run of addressable tape', properties: { ledCount: 60 } },
  { form: 'matrix', hint: 'An addressable panel', properties: { width: 16, height: 16 } },
  { form: 'ring', hint: 'A circle of addressable LEDs', properties: { ledCount: 24 } },
  {
    form: 'corkscrew',
    hint: 'A strip wound helically around a cylinder',
    properties: { ledCount: 120, corkscrewTurns: 6, corkscrewDiameterMm: 100, corkscrewHeightMm: 300 },
  },
  { form: 'hub75', hint: 'A scan panel on its own ribbon', properties: { width: 64, height: 32 } },
]

// Layout ids. Stable and independent of graph node ids, so the arrangement is
// about parts rather than about whichever node happens to back one.
export const BOARD_PART_ID = 'board'

export function boardImageSrc(profile: PhysicalBoardProfile): string {
  if (profile.render?.file) return `/${profile.render.file}`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(profile.previewSvg)}`
}

/**
 * The board at its real size, in the orientation its render is drawn.
 *
 * The board's longest physical dimension maps onto the render's longest pixel
 * axis (renders are mostly portrait, but the MatrixPortal is landscape) and the
 * other follows from the render's own aspect, so the part is physically true
 * along its dominant axis and the image never distorts. Renders crop tight to
 * the board but include header and connector overhang, which is why the aspect
 * runs a little taller than the PCB outline alone.
 */
export function boardFootprintMm(profile: PhysicalBoardProfile): PartFootprintMm {
  const { width, height } = profile.dimensionsMm
  const longMm = Math.max(width, height)
  const shortMm = Math.min(width, height)
  const render = profile.render
  const ratio = render && render.widthPx > 0
    ? render.heightPx / render.widthPx
    : longMm / shortMm
  return ratio >= 1
    ? { width: longMm / ratio, height: longMm }
    : { width: longMm, height: longMm * ratio }
}
