// What the Hardware workspace can put on the bench: the board, each input
// module and fixture, the LED output forms, and the pins each one asks for.
import amplifierRender from '../../assets/components/max98357a-i2s-amplifier.webp'
import powerSupplyRender from '../../assets/components/5v-psu.webp'
import { transportDisplayPinKeysForProps, gpioRequirementForProperty } from '../../state/nodeLibrary'
import { PART_FIELDS } from '../../build/parts/partFields'
import { KEYPAD_COL_KEYS, KEYPAD_ROW_KEYS } from '../../state/peripherals/keypad'
import type { PartPinRequest } from '../../build/parts/partPinAssignment'
import { segmentControllerFor } from '../../state/displays/segmentDisplay'
import { OLED_TRANSPORT_PINS, oledTransportFor } from '../../state/displays/oledSurface'
import {
  PART_CATALOGUE, bundledPartDimensionsMm, bundledPartsForType, memoByCatalogue, partById, partDimensionsMm, partRenderSrc,
  partPinLabelForProperty, registeredPartManifests, registeredPartsForType, registeredPartTypes, type PartCatalogueEntry,
} from '../../build/parts/partCatalogue'
import {
  ANALOG_SENSOR_NODE_TYPE, ANALOG_SENSOR_OUTPUT, analogSensorEntries, analogSensorSummary,
} from '../../state/peripherals/analogSensor'
import {
  DIGITAL_SENSOR_NODE_TYPE, DIGITAL_SENSOR_OUTPUT, digitalSensorEntries, digitalSensorSummary,
} from '../../state/peripherals/digitalSensor'
import { IR_RECEIVER_MODULES } from '../../state/peripherals/irModules'
import { IR_REMOTE_LEARN_HANDLE } from '../../state/peripherals/irRemote'
import { MIC_MODULES } from '../../state/peripherals/micModules'
import type { PhysicalBoardProfile } from '../../build/boards/boardProfiles'
import {
  WS2812B_PITCH_MM,
  type PartFootprintMm,
  MAX98357A_FOOTPRINT_MM,
  MIC_FALLBACK_FOOTPRINT_MM,
  BUTTON_MODULE_FOOTPRINT_MM,
  POT_MODULE_FOOTPRINT_MM,
  ENCODER_MODULE_FOOTPRINT_MM,
} from '../../build/hardware'
import type { LedOutputForm } from '../../state/output/ledOutputForm'
import { relayPinKeys, DEFAULT_RELAY_PART_ID } from '../../state/peripherals/relayModule'
import { BUZZER_PART_ID } from '../../state/peripherals/buzzer'
import { PCA9685_PART_ID } from '../../state/peripherals/pwmDriver'
import { DARLINGTON_PART_ID, darlingtonPinKeys } from '../../state/peripherals/darlingtonDriver'
import { PD_TRIGGER_PART_ID } from '../../state/peripherals/pdTrigger'
import { DEFAULT_POWER_SWITCH_PART_ID, powerSwitchPinKeys } from '../../state/peripherals/powerSwitch'
import { DEFAULT_POWER_CONVERTER_PART_ID } from '../../state/peripherals/powerConverter'
import { dividedInputPinKey } from '../../build/pins/receiveDivider'
import { COOLING_FAN_PART_ID } from '../../state/peripherals/coolingFan'
import { DFPLAYER_PART_ID } from '../../state/peripherals/dfPlayer'
import { DEFAULT_BATTERY_CELL_PART_ID } from '../../state/peripherals/battery'
import { RTC_MODULE_NODE_TYPE } from '../../state/peripherals/rtcModule'
import { DMX_TRANSCEIVER_NODE_TYPE, DMX_TRANSCEIVER_PART_ID } from '../../state/peripherals/dmxTransceiver'
import { MIDI_DIN_PART_ID, MIDI_INTERFACE_NODE_TYPE } from '../../state/peripherals/midiSource'

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
  if (nodeType === 'PowerSwitchOutput') return powerSwitchPinKeys(moduleId)
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
    // The supply the user owns, rated off its label. No catalogue part, so the
    // generic enclosed-supply render stands for every one; the footprint is a
    // common 5 V 10 A enclosure at that render's aspect.
    nodeType: 'PowerSupply',
    partId: 'power-supply',
    label: 'Power supply',
    hint: 'The supply you have, rated from its label',
    footprint: { width: 152, height: 98 },
    render: powerSupplyRender,
  },
  {
    nodeType: 'BatteryPack',
    partId: 'battery-pack',
    label: 'Battery pack',
    hint: 'Lithium DC source built from one exact cell type in series and parallel',
    footprint: bundledPartDimensionsMm(DEFAULT_BATTERY_CELL_PART_ID),
    render: partRenderSrc(DEFAULT_BATTERY_CELL_PART_ID) ?? undefined,
    singleton: true,
  },
  {
    nodeType: 'BatteryModule',
    partId: 'battery-module',
    label: 'Pack electronics',
    hint: 'Protection, balancing, charging, or an integrated 5 V output',
    footprint: bundledPartDimensionsMm('hx-4s-f30a-bms-balance'),
    render: partRenderSrc('hx-4s-f30a-bms-balance') ?? undefined,
  },
  {
    // Converts a DC source to 5 V for either the controller or the LED rail.
    // No pins: it sits on the power path, which the Build Diagram draws.
    nodeType: 'PowerConverter',
    partId: 'power-converter',
    label: 'DC-DC converter',
    hint: 'Powers the controller or the 5 V LED rail from a battery or other DC source',
    footprint: bundledPartDimensionsMm(DEFAULT_POWER_CONVERTER_PART_ID),
    render: partRenderSrc(DEFAULT_POWER_CONVERTER_PART_ID) ?? undefined,
  },
  {
    // The upstream USB-C source. No pins: nothing on it reaches the controller,
    // and the bench draws no board run for it.
    nodeType: 'PdTriggerSource',
    partId: 'pd-trigger-source',
    label: 'USB-C PD trigger',
    hint: 'Sets the DC voltage a USB-C charger supplies to a converter or load',
    footprint: bundledPartDimensionsMm(PD_TRIGGER_PART_ID),
    render: partRenderSrc(PD_TRIGGER_PART_ID) ?? undefined,
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
    nodeType: 'DarlingtonDriverOutput',
    partId: 'darlington-driver-output',
    label: 'Darlington driver',
    hint: 'Eight low-side switches to ground for relay coils, motors and lamps',
    footprint: bundledPartDimensionsMm(DARLINGTON_PART_ID),
    render: partRenderSrc(DARLINGTON_PART_ID) ?? undefined,
    pinFields: [{ key: 'drive1Pin', label: '1B' }],
    pinRequests: darlingtonPinKeys().map((key) => ({ key, capability: 'digitalOutput' as const })),
  },
  {
    nodeType: 'PwmDriverOutput',
    partId: 'pwm-driver-output',
    label: 'PWM driver',
    hint: 'Sixteen PWM levels over I2C, for dimming LEDs and driving servos',
    footprint: bundledPartDimensionsMm(PCA9685_PART_ID),
    render: partRenderSrc(PCA9685_PART_ID) ?? undefined,
    // Joins the board's one I2C bus rather than taking free GPIO.
    pinFields: [
      { key: 'sdaPin', label: 'SDA' },
      { key: 'sclPin', label: 'SCL' },
    ],
  },
  {
    nodeType: 'BuzzerOutput',
    partId: 'buzzer-output',
    label: 'Buzzer',
    hint: 'Beeps while a boolean signal is true, or plays a tone at a pitch you set',
    footprint: bundledPartDimensionsMm(BUZZER_PART_ID),
    render: partRenderSrc(BUZZER_PART_ID) ?? undefined,
    pinFields: [{ key: 'sigPin', label: 'SIG' }],
    pinRequests: [{ key: 'sigPin', capability: 'digitalOutput' }],
  },
  {
    nodeType: 'CoolingFanOutput',
    partId: 'cooling-fan-output',
    label: 'Cooling fan',
    hint: 'Controls fan speed and reports measured RPM',
    footprint: bundledPartDimensionsMm(COOLING_FAN_PART_ID),
    render: partRenderSrc(COOLING_FAN_PART_ID) ?? undefined,
    pinFields: [
      { key: 'pwmPin', label: 'PWM' },
      { key: 'tachPin', label: 'RPM' },
    ],
    pinRequests: [
      { key: 'pwmPin', capability: 'digitalOutput' },
      { key: 'tachPin', capability: 'digitalInput' },
    ],
  },
  {
    nodeType: 'DFPlayerOutput',
    partId: 'dfplayer-output',
    label: 'DFPlayer Mini',
    hint: 'Plays numbered audio files from its own microSD card over UART',
    footprint: partDimensionsMm(DFPLAYER_PART_ID, { width: 20, height: 20 }),
    render: partRenderSrc(DFPLAYER_PART_ID) ?? undefined,
    pinFields: [
      { key: 'uartRxPin', label: 'TX' },
      { key: 'uartTxPin', label: 'RX' },
      { key: 'busyPin', label: 'BUSY' },
    ],
    pinRequests: [
      { key: 'uartRxPin', capability: 'digitalInput' },
      { key: 'uartTxPin', capability: 'digitalOutput' },
      { key: 'busyPin', capability: 'digitalInput' },
    ],
    singleton: true,
  },
  {
    nodeType: 'PowerSwitchOutput',
    partId: 'power-switch-output',
    label: 'Power switch',
    hint: 'Switches DC loads from boolean signals, or dims them from a level',
    footprint: bundledPartDimensionsMm(DEFAULT_POWER_SWITCH_PART_ID),
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
    // The clock fields only show, and are only reserved, on a clocked chipset
    // (`stereoVuPinKeys`); the shipped default is clockless, so a new fixture
    // asks the board for its two data pins only. Not a singleton: a board can
    // carry several fixtures, each its own pair of rails on its own pins.
    pinFields: [
      { key: 'leftDataPin', label: 'LEFT DATA' },
      { key: 'rightDataPin', label: 'RIGHT DATA' },
      { key: 'leftClockPin', label: 'LEFT CLK' },
      { key: 'rightClockPin', label: 'RIGHT CLK' },
    ],
    pinRequests: [{ key: 'leftDataPin' }, { key: 'rightDataPin' }],
  },
  {
    nodeType: 'TransportDisplay',
    partId: 'transport-display',
    label: 'Display panel',
    hint: 'A colour TFT: a fixed now-playing or show-status layout, or a Screen design',
    footprint: bundledPartDimensionsMm('st7789-tft-240x240'),
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
    footprint: bundledPartDimensionsMm('sh1106-oled-128x64'),
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
    footprint: bundledPartDimensionsMm('tm1637-4digit-display'),
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
    // Wired Ethernet for the board's network. Carries no signal, like the SD card:
    // it changes how the sketch reaches the network, not what any node outputs.
    nodeType: 'EthernetModule',
    partId: 'ethernet',
    label: 'Ethernet',
    hint: 'Wired network for every network node, in place of Wi-Fi',
    footprint: bundledPartDimensionsMm('wiz850io-ethernet-module'),
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

/** Node types whose parts come entirely from the catalogue: no code lists them, and none has a stand-in. */
export const CATALOGUE_SENSOR_NODE_TYPES: ReadonlySet<string> = new Set([DIGITAL_SENSOR_NODE_TYPE, ANALOG_SENSOR_NODE_TYPE])

/**
 * One shelf row per catalogued part that carries a digital or analog sensor
 * block, read from the catalogue rather than listed here: a new switch or
 * analog sensor is a data-only part, so it needs no row of code. The block
 * decides the pin's electrical request (an internal pull-up asks for a pin
 * that has one; an analog sensor asks for an ADC pin).
 */

export function sensorInputPartEntries(catalogue: Record<string, PartCatalogueEntry> = PART_CATALOGUE): InputPartEntry[] {
  return [
    ...digitalSensorEntries(catalogue).map((entry): InputPartEntry => {
      const spec = entry.digitalSensor!
      return {
        nodeType: DIGITAL_SENSOR_NODE_TYPE,
        partId: entry.partId,
        label: entry.label,
        hint: digitalSensorSummary(spec),
        footprint: entry.dimensionsMm,
        signalPort: DIGITAL_SENSOR_OUTPUT,
        dataType: 'bool',
        pinRequests: [spec.pullUp === 'internal' ? { key: 'pin', capability: 'pullup' } : { key: 'pin' }],
        pinFields: [{ key: 'pin', label: partPinLabelForProperty(entry.partId, 'pin') ?? 'GPIO' }],
        properties: { partId: entry.partId },
      }
    }),
    ...analogSensorEntries(catalogue).map((entry): InputPartEntry => ({
      nodeType: ANALOG_SENSOR_NODE_TYPE,
      partId: entry.partId,
      label: entry.label,
      hint: analogSensorSummary(entry.analogSensor!),
      footprint: entry.dimensionsMm,
      signalPort: ANALOG_SENSOR_OUTPUT,
      dataType: 'float',
      pinRequests: [{ key: 'pin', capability: 'analogInput' }],
      pinFields: [{ key: 'pin', label: partPinLabelForProperty(entry.partId, 'pin') ?? 'GPIO' }],
      properties: { partId: entry.partId },
    })),
  ]
}

/**
 * What a part type fixes for every part of it: which output lights the run to
 * the board, the data type that colours it, and the pins it asks for. A part
 * adds only what its manifest knows (id, label, summary, size and silkscreen),
 * so a downloaded part of one of these types is shelved exactly like a bundled
 * one and nothing here names a part. Where the pins depend on how the part
 * talks to the board (a laser ranger on I2C against an ultrasonic one on two
 * GPIOs), `pins` reads the manifest's own interface.
 */
interface CataloguedInputType {
  nodeType: string
  /** The output that lights the run; a function where it depends on how the part reports. */
  signalPort: string | ((entry: PartCatalogueEntry) => string)
  dataType?: string
  pins: (entry: PartCatalogueEntry) => Pick<InputPartEntry, 'pinRequests' | 'pinFields' | 'connectionSummary'>
  /** Added to the properties stamped on a node made from the part. */
  extraProperties?: Record<string, unknown>
  /**
   * The bench layout id. The type's default part keeps the type's own id, which
   * saved layouts hold; every other part is `<id>-<part id>`.
   */
  layoutId: string
  /** The default module has no catalogue entry (an encoder with no part named), so every catalogued part is a non-default. */
  uncataloguedDefault?: true
  /** Layout ids for non-default parts, where an older shelf id predates the part-id suffix. */
  suffix?: string
}

const I2C_PINS: Pick<InputPartEntry, 'pinRequests' | 'pinFields'> = {
  // Joins the board's one I2C bus rather than taking free GPIO.
  pinRequests: [],
  pinFields: [{ key: 'sdaPin', label: 'SDA' }, { key: 'sclPin', label: 'SCL' }],
}

const CATALOGUED_INPUT_TYPES: readonly CataloguedInputType[] = [
  {
    nodeType: 'LightInput',
    // A lux sensor reports lux; an analog divider reports a relative level.
    signalPort: (entry) => entry.lightSensor?.interface === 'I2C' ? 'lux' : 'level',
    dataType: 'float',
    layoutId: 'ldr',
    suffix: 'light',
    pins: (entry) => entry.lightSensor?.interface === 'I2C'
      ? { ...I2C_PINS, connectionSummary: 'Default I2C bus' }
      : { pinRequests: [{ key: 'pin', capability: 'analogInput' }], pinFields: [{ key: 'pin', label: 'GPIO' }] },
  },
  {
    nodeType: 'TouchButtonInput',
    signalPort: 'touched',
    dataType: 'bool',
    layoutId: 'touch-button',
    pins: () => ({ pinRequests: [{ key: 'pin' }], pinFields: [{ key: 'pin', label: 'SIG' }] }),
  },
  { nodeType: 'PowerMonitorInput', signalPort: 'watts', dataType: 'float', layoutId: 'power-monitor', pins: () => I2C_PINS },
  {
    nodeType: 'EnvironmentInput',
    signalPort: 'temperature',
    dataType: 'float',
    layoutId: 'environment-sensor',
    pins: () => ({
      pinRequests: [],
      pinFields: [{ key: 'sdaPin', label: 'SDA (SDI)' }, { key: 'sclPin', label: 'SCL (SCK)' }],
    }),
  },
  { nodeType: 'MotionVectorInput', signalPort: 'accelX', dataType: 'float', layoutId: 'motion-vector', pins: () => I2C_PINS },
  { nodeType: 'TouchPadInput', signalPort: 'electrode', dataType: 'float', layoutId: 'touch-pad', pins: () => I2C_PINS },
  {
    nodeType: 'JoystickInput',
    signalPort: 'x',
    dataType: 'float',
    layoutId: 'joystick',
    pins: () => ({
      pinRequests: [
        { key: 'xPin', capability: 'analogInput' },
        { key: 'yPin', capability: 'analogInput' },
        { key: 'swPin' },
      ],
      pinFields: [
        { key: 'xPin', label: 'GPIO (VRx)' },
        { key: 'yPin', label: 'GPIO (VRy)' },
        { key: 'swPin', label: 'GPIO (SW)' },
      ],
    }),
  },
  {
    nodeType: 'DistanceInput',
    signalPort: 'distance',
    dataType: 'float',
    layoutId: 'distance-sensor',
    pins: (entry) => entry.distanceSensor?.interface === 'I2C'
      ? { ...I2C_PINS, connectionSummary: 'Default I2C bus' }
      : {
        pinRequests: [
          { key: 'trigPin', capability: 'digitalOutput' },
          { key: 'echoPin', capability: 'digitalInput' },
        ],
        pinFields: [
          { key: 'trigPin', label: 'GPIO (Trig)' },
          { key: 'echoPin', label: 'GPIO (Echo)' },
        ],
      },
  },
  {
    nodeType: 'TemperatureInput',
    signalPort: 'temperature',
    dataType: 'float',
    layoutId: 'temperature-probe',
    pins: () => ({
      pinRequests: [{ key: 'pin', capability: 'digitalOutput' }],
      pinFields: [{ key: 'pin', label: 'GPIO (DATA)' }],
    }),
  },
  {
    nodeType: 'PresenceInput',
    signalPort: 'presence',
    dataType: 'bool',
    layoutId: 'presence-sensor',
    pins: () => ({ pinRequests: [{ key: 'rxPin' }], pinFields: [{ key: 'rxPin', label: 'RX (sensor TX)' }] }),
  },
  {
    // A bare encoder has no breakout, so its pins must take the controller's
    // pull-up, which rules out the input-only GPIOs that have none.
    nodeType: 'EncoderInput',
    signalPort: 'position',
    layoutId: 'encoder',
    uncataloguedDefault: true,
    extraProperties: { pullup: true },
    pins: () => ({
      pinRequests: [
        { key: 'pinA', capability: 'pullup' },
        { key: 'pinB', capability: 'pullup' },
        { key: 'pinSW', capability: 'pullup' },
      ],
      pinFields: [
        { key: 'pinA', label: 'A' },
        { key: 'pinB', label: 'B' },
        { key: 'pinSW', label: 'SW' },
      ],
    }),
  },
]

/**
 * A shelf row per part of each type in `CATALOGUED_INPUT_TYPES`: the bundled
 * parts in menu order, or the registered ones (which follow every bundled row). Label, hint and footprint
 * are the manifest's (`label`, `copy.hint` or `copy.summary`, `dimensionsMm`),
 * and a registered part's pins carry its own silkscreen where it prints one.
 */
function cataloguedInputPartEntries(which: 'bundled' | 'registered'): InputPartEntry[] {
  return CATALOGUED_INPUT_TYPES.flatMap((type) => {
    const bundled = bundledPartsForType(type.nodeType)
    const bundledIds = new Set(bundled.map((manifest) => manifest.partId))
    const registered = registeredPartsForType(type.nodeType).filter((manifest) => !bundledIds.has(manifest.partId))
    return (which === 'bundled' ? bundled : registered).map((manifest): InputPartEntry => {
      const isDefault = which === 'bundled' && manifest === bundled[0] && !type.uncataloguedDefault
      const facts = type.pins(manifest)
      return {
        nodeType: type.nodeType,
        partId: isDefault ? type.layoutId : `${type.suffix ?? type.layoutId}-${manifest.partId}`,
        label: manifest.label,
        hint: manifest.copy?.hint ?? manifest.copy?.summary ?? '',
        footprint: manifest.dimensionsMm,
        signalPort: typeof type.signalPort === 'function' ? type.signalPort(manifest) : type.signalPort,
        ...(type.dataType ? { dataType: type.dataType } : {}),
        pinRequests: facts.pinRequests,
        // The type names its pins; a part that prints its own silkscreen says so.
        // Bundled parts keep the type's names, which the bench has always shown.
        pinFields: facts.pinFields.map((field) => ({
          key: field.key,
          label: bundledIds.has(manifest.partId)
            ? field.label
            : partPinLabelForProperty(manifest.partId, field.key) ?? field.label,
        })),
        ...(facts.connectionSummary ? { connectionSummary: facts.connectionSummary } : {}),
        properties: { partId: manifest.partId, ...(type.extraProperties ?? {}) },
      }
    })
  })
}

/** The input rows written out by hand, after the microphone, IR and sensor rows. */
const HAND_WRITTEN_INPUT_PARTS: readonly InputPartEntry[] = [
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
    nodeType: RTC_MODULE_NODE_TYPE,
    partId: 'rtc',
    label: 'DS3231 RTC module',
    hint: 'Battery-backed clock on the board I2C bus',
    footprint: partDimensionsMm('ds3231-rtc-module', { width: 38, height: 22 }),
    signalPort: 'time',
    dataType: 'datetime',
    pinRequests: [],
    pinFields: [
      { key: 'sdaPin', label: 'SDA' },
      { key: 'sclPin', label: 'SCL' },
    ],
    properties: { partId: 'ds3231-rtc-module' },
    connectionSummary: 'Default I2C bus',
    singleton: true,
  },
  {
    nodeType: RTC_MODULE_NODE_TYPE,
    partId: 'rtc-xc9044',
    label: 'DS3231 RTC Clock Module for Raspberry Pi',
    hint: 'Compact Pi-header clock on the board I2C bus',
    footprint: partDimensionsMm('jaycar-xc9044-rtc-module', { width: 14, height: 14 }),
    signalPort: 'time',
    dataType: 'datetime',
    pinRequests: [],
    pinFields: [
      { key: 'sdaPin', label: 'SDA' },
      { key: 'sclPin', label: 'SCL' },
    ],
    properties: { partId: 'jaycar-xc9044-rtc-module' },
    connectionSummary: 'Default I2C bus',
    singleton: true,
  },
  {
    // Read by a DMX / Art-Net node set to DMX512, as the DS3231 is by a Clock.
    // Three free GPIOs; the UART is allocated, never picked.
    nodeType: DMX_TRANSCEIVER_NODE_TYPE,
    partId: 'dmx-transceiver',
    label: 'MAX485 DMX transceiver',
    hint: 'Wired DMX512 in from a lighting desk, for a DMX node set to DMX512',
    footprint: partDimensionsMm(DMX_TRANSCEIVER_PART_ID, { width: 15, height: 45 }),
    signalPort: 'dmx',
    dataType: 'dmx',
    pinRequests: [
      { key: 'dmxTxPin', capability: 'digitalOutput' },
      { key: 'dmxRxPin', capability: 'digitalInput' },
      { key: 'dmxEnablePin', capability: 'digitalOutput' },
    ],
    pinFields: [
      { key: 'dmxRxPin', label: 'RO' },
      { key: 'dmxTxPin', label: 'DI' },
      { key: 'dmxEnablePin', label: 'DE/RE' },
    ],
    properties: { partId: DMX_TRANSCEIVER_PART_ID },
    // The receiver reads one line per board; a second universe is out of v1.
    singleton: true,
  },
  {
    // Read by every MIDI node set to DIN, through one shared reader.
    nodeType: MIDI_INTERFACE_NODE_TYPE,
    partId: 'midi-interface',
    label: 'Adafruit MIDI FeatherWing',
    hint: 'A DIN MIDI jack for a keyboard, for MIDI nodes set to DIN',
    footprint: partDimensionsMm(MIDI_DIN_PART_ID, { width: 50.8, height: 22.86 }),
    signalPort: 'note',
    dataType: 'float',
    pinRequests: [{ key: 'midiRxPin', capability: 'digitalInput' }],
    pinFields: [{ key: 'midiRxPin', label: 'MIDI_RX' }],
    properties: { partId: MIDI_DIN_PART_ID },
    // Every DIN node on the board reads the one jack.
    singleton: true,
  },
  {
    // One row on a pin the board's plan hands out (`firstButtonBankRow`);
    // Add button on the node grows the rest without rewiring the first.
    nodeType: 'ButtonBank',
    partId: 'button',
    label: 'Button',
    hint: 'A momentary push button; Add button on the node grows more',
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
    properties: { partId: 'hc-sr501-pir-sensor' },
  },
  {
    nodeType: 'MotionInput',
    partId: 'microwave-motion',
    label: 'RCWL-0516 microwave motion sensor',
    hint: 'Goes high while its radar senses movement, even through a plastic case',
    footprint: partDimensionsMm('rcwl-0516-microwave-motion-module', { width: 36, height: 17 }),
    signalPort: 'motion',
    dataType: 'bool',
    pinRequests: [{ key: 'pin' }],
    pinFields: [{ key: 'pin', label: 'GPIO (OUT)' }],
    properties: { partId: 'rcwl-0516-microwave-motion-module' },
  },
  {
    nodeType: 'KeypadInput',
    partId: 'keypad',
    label: '4x4 matrix keypad',
    hint: 'Sixteen keys read through eight GPIOs',
    footprint: partDimensionsMm('matrix-keypad-4x4', { width: 69, height: 80.5 }),
    signalPort: 'key',
    dataType: 'float',
    pinRequests: [
      ...KEYPAD_ROW_KEYS.map((key) => ({ key })),
      ...KEYPAD_COL_KEYS.map((key) => ({ key, capability: 'digitalOutput' as const })),
    ],
    pinFields: [
      ...KEYPAD_ROW_KEYS.map((key, index) => ({ key, label: `GPIO (R${index + 1})` })),
      ...KEYPAD_COL_KEYS.map((key, index) => ({ key, label: `GPIO (C${index + 1})` })),
    ],
    properties: { partId: 'matrix-keypad-4x4' },
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

/**
 * A shelf row for each registered part of a type that has an input row.
 *
 * The manifest supplies what it knows: the part's id, label, summary, footprint
 * and the silkscreen of each pin. What it does not carry (which signal port
 * lights the run, the pin requests and the fields) is the type's, and is taken
 * from the type's default row (its first one above). Nothing is invented: a
 * part whose pins differ from its type's default needs a type that models
 * them, which is the part-type registry's job, not the shelf's.
 */
function registeredInputPartEntries(base: readonly InputPartEntry[]): InputPartEntry[] {
  const taken = new Set(base.map((entry) => entry.partId))
  const listed = new Set(base.flatMap((entry) =>
    typeof entry.properties?.partId === 'string' ? [`${entry.nodeType}:${entry.properties.partId}`] : []))
  const rows: InputPartEntry[] = []
  for (const manifest of registeredPartManifests()) {
    for (const nodeType of registeredPartTypes(manifest.partId)) {
      const template = base.find((entry) => entry.nodeType === nodeType)
      if (!template || taken.has(manifest.partId) || listed.has(`${nodeType}:${manifest.partId}`)) continue
      taken.add(manifest.partId)
      rows.push({
        ...template,
        partId: manifest.partId,
        label: manifest.label,
        hint: manifest.copy?.summary ?? template.hint,
        footprint: manifest.dimensionsMm,
        pinFields: template.pinFields.map((field) => ({
          key: field.key,
          label: partPinLabelForProperty(manifest.partId, field.key) ?? field.label,
        })),
        properties: { ...(template.properties ?? {}), partId: manifest.partId },
      })
    }
  }
  return rows
}

/**
 * Every input row on the shelf: the bundled ones, then one per registered
 * part. Read when asked and memoised by catalogue version, so a part registered
 * after load appears. Bundled rows keep their order.
 */
export const inputPartEntries: () => readonly InputPartEntry[] = memoByCatalogue(() => {
  const base: readonly InputPartEntry[] = [
    ...MIC_INPUT_PARTS,
    ...IR_INPUT_PARTS,
    ...sensorInputPartEntries(),
    ...cataloguedInputPartEntries('bundled'),
    ...HAND_WRITTEN_INPUT_PARTS,
  ]
  const registered = cataloguedInputPartEntries('registered')
  return [...base, ...registered, ...registeredInputPartEntries([...base, ...registered])]
})

/** Format assigned pins in the same left-to-right order as the physical header. */
export function numericPinSummary(
  properties: Record<string, unknown>,
  fields: readonly { key: string; label: string }[],
  nodeType?: string,
  partId?: string | null,
): string {
  const dividedPin = nodeType ? dividedInputPinKey(nodeType, properties) : null
  const pads = partId ? (partById(partId)?.pinLabelsLeftToRight ?? []) : []
  const padIndex = (key: string, fallbackLabel: string): number => {
    const label = partId ? (partPinLabelForProperty(partId, key) ?? fallbackLabel) : fallbackLabel
    const wanted = label.toUpperCase()
    return pads.findIndex((pad) => {
      const printed = pad.toUpperCase()
      return printed === wanted || printed.replace(/^[LR]:/, '') === wanted
    })
  }
  return fields
    .map(({ key, label }, fieldIndex) => ({
      key,
      label,
      pin: Number(properties[key]),
      fieldIndex,
      padIndex: padIndex(key, label),
    }))
    .filter(({ pin }) => Number.isFinite(pin))
    .sort((left, right) => {
      const leftOrder = left.padIndex >= 0 ? left.padIndex : Number.POSITIVE_INFINITY
      const rightOrder = right.padIndex >= 0 ? right.padIndex : Number.POSITIVE_INFINITY
      return leftOrder - rightOrder || left.fieldIndex - right.fieldIndex
    })
    .map(({ key, label, pin }) => `${label} ${pin}${key === dividedPin ? ' (See build diagram)' : ''}`)
    .join(' · ')
}
// One node type for every LED output; the form says what physical geometry the
// chain or panel has (src/state/output/ledOutputForm.ts).
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
