// The part types this app version can drive.
//
// A part type is code: a node type whose preview, firmware, ports and pin
// rules are written once, and which reads everything that differs between two
// parts of that type from the part's manifest block. A manifest names its part
// types; the app loads a downloaded part only when it knows at least one of
// them and the part's chip is one that type's code can drive. See
// docs/plans/downloadable-parts.md, "Model" and "Part type registry".
//
// Type ids are node type ids and, like every vocabulary word, permanent once
// v1.0.0 ships. A rename keeps the old id in `aliases`.

import type { PartBlockKey } from './manifest/blockSpecs'

export interface PartTypeDefinition {
  /** The node type that drives parts of this type. */
  nodeType: string
  /** The node property that holds the chosen part's id. */
  property: 'partId' | 'model'
  /**
   * The manifest block this type reads. Absent while the type's per-part facts
   * still live in code, which is also why such a type is not `downloadable`.
   */
  block?: PartBlockKey
  /**
   * True when a part of this type may leave `block` out: the type has a
   * second transport that needs no block (an LDR module is read as a raw
   * analog level, with no `lightSensor` calibration).
   */
  blockOptional?: boolean
  /** The block field that names the chip, when the code chooses behaviour by it. */
  deviceField?: 'device' | 'controller'
  /**
   * Chips the code can drive, matched exactly against `deviceField`. Absent
   * when the field only describes the part and no code reads it.
   */
  devices?: readonly string[]
  /**
   * Whether a part that ships outside the app may use this type. False until
   * the type has been audited to read every per-part fact from its block, with
   * no branch on a bundled part's id; phase A step 3 of the plan flips these.
   */
  downloadable: boolean
  /** Earlier ids for this type that saved manifests may still use. */
  aliases?: readonly string[]
}

const type = (definition: Omit<PartTypeDefinition, 'property' | 'downloadable'> &
  Partial<Pick<PartTypeDefinition, 'property' | 'downloadable'>>): PartTypeDefinition =>
  ({ property: 'partId', downloadable: false, ...definition })

export const PART_TYPES: readonly PartTypeDefinition[] = [
  // LED outputs. `MatrixOutput` is every LED output form; a part's `ledLayout` is a top-level
  // manifest field, so the type reads no block. Its other bundled parts are the NLED data link
  // and the 74AHCT125 level shifter on the data line. Closed, and the bar is a design change, not
  // id branches: a MatrixOutput node carries no `partId` (its form, size and layout are node
  // properties built in code, and nothing reads a part's `ledLayout`), so the type offers no part
  // row and resolves none (`downloadableTypes.test.ts` fails at the option-row check for every
  // LED part). Also by id: `NLED_PIXEL_DATA_EXTENDER_PART_ID` in the hardware manifest and the
  // 74AHCT125 render imported by the Build Diagram.
  type({ nodeType: 'MatrixOutput' }),
  // Power
  // The converter picture reads a part's measured pads (`converterPadsMm`) or the block's `terminalPositions`.
  type({ nodeType: 'PowerConverter', block: 'powerConverter', downloadable: true }),
  type({ nodeType: 'BatteryPack', block: 'batteryCell', downloadable: true }),
  type({ nodeType: 'BatteryModule', block: 'batteryModule', downloadable: true }),
  type({ nodeType: 'PdTriggerSource', block: 'pdTrigger', downloadable: true }),
  type({ nodeType: 'PowerMonitorInput', block: 'powerMonitor', deviceField: 'device', devices: ['INA219B', 'INA226'], downloadable: true }),
  // Switching
  type({ nodeType: 'RelayOutput', block: 'relay', downloadable: true }),
  type({ nodeType: 'PowerSwitchOutput', block: 'mosfet', downloadable: true }),
  type({ nodeType: 'DarlingtonDriverOutput', block: 'driverChip', deviceField: 'device', devices: ['ULN2803A'], downloadable: true }),
  type({ nodeType: 'PwmDriverOutput', block: 'pwmDriver', deviceField: 'device', devices: ['PCA9685'], downloadable: true }),
  type({ nodeType: 'CoolingFanOutput', block: 'fan', downloadable: true }),
  type({ nodeType: 'BuzzerOutput', block: 'buzzer', downloadable: true }),
  // Sensors
  type({ nodeType: 'LightInput', block: 'lightSensor', blockOptional: true, deviceField: 'device', devices: ['BH1750FVI'], downloadable: true }),
  type({ nodeType: 'EnvironmentInput', block: 'environmentSensor', deviceField: 'device', devices: ['BME280'], downloadable: true }),
  type({ nodeType: 'MotionVectorInput', block: 'motionVectorSensor', deviceField: 'device', devices: ['MPU-6050'], downloadable: true }),
  type({ nodeType: 'PresenceInput', block: 'presenceSensor', deviceField: 'device', devices: ['HLK-LD2410C'], downloadable: true }),
  type({ nodeType: 'DistanceInput', block: 'distanceSensor', deviceField: 'device', devices: ['HC-SR04', 'VL53L0X', 'VL53L1X'], downloadable: true }),
  type({ nodeType: 'TemperatureInput', block: 'temperatureSensor', deviceField: 'device', devices: ['DS18B20'], downloadable: true }),
  type({ nodeType: 'MotionInput', block: 'motionSensor', downloadable: true }),
  type({ nodeType: 'DigitalSensorInput', block: 'digitalSensor', downloadable: true }),
  type({ nodeType: 'AnalogSensorInput', block: 'analogSensor', downloadable: true }),
  // Controls
  type({ nodeType: 'TouchButtonInput', block: 'touchSensor', downloadable: true }),
  type({ nodeType: 'TouchPadInput', block: 'touchPad', deviceField: 'device', devices: ['MPR121'], downloadable: true }),
  type({ nodeType: 'JoystickInput', block: 'joystick', downloadable: true }),
  type({ nodeType: 'EncoderInput', block: 'encoder', downloadable: true }),
  type({ nodeType: 'KeypadInput', block: 'keypad', downloadable: true }),
  type({ nodeType: 'IRRemoteInput', block: 'irReceiver', downloadable: true }),
  // Displays
  type({ nodeType: 'InfoDisplay', block: 'display', deviceField: 'controller', devices: ['SSD1306', 'SH1106G'], downloadable: true }),
  // Closed: `TFT_CONTROLLERS` keeps per-module bench values (invert, colour order, offsets) per chip,
  // so two modules on one chip cannot differ, and the unresolved-panel `ST7789` fallback is still code.
  type({ nodeType: 'TransportDisplay', block: 'display', deviceField: 'controller', devices: ['ST7789V', 'ILI9341'] }),
  type({ nodeType: 'SegmentDisplay', block: 'display', deviceField: 'controller', devices: ['TM1637', 'MAX7219'], downloadable: true }),
  // Audio. The chips are the ones the type's code can drive: the microphone's
  // FastLED factories and the app's SPH0645 adapter, the PCM1802 receive path, and the
  // I2S DACs and amplifiers (the amplifier property is `model`, kept for saves). A power
  // amplifier takes line level whatever its chip, so its `device` only describes it; its block is
  // optional because the passive 4 ohm speaker is filed under the type for the shelf and has
  // no amplifier facts, and only a part carrying the block is ever offered as an amplifier.
  type({ nodeType: 'MicInput', block: 'microphone', deviceField: 'device', devices: ['INMP441', 'ICS-43434', 'GenericMEMS', 'SPH0645LM4H'], downloadable: true }),
  type({ nodeType: 'LineInput', block: 'lineInput', deviceField: 'device', devices: ['PCM1802'], downloadable: true }),
  type({ nodeType: 'Amplifier', property: 'model', block: 'i2sAudio', deviceField: 'device', devices: ['MAX98357A', 'PCM5102A', 'UDA1334A'], downloadable: true }),
  type({ nodeType: 'PowerAmplifier', block: 'powerAmp', blockOptional: true, downloadable: true }),
  // UART player: `device` selects the command protocol the firmware carries (the DFPlayer's
  // native 10-byte frame); supply, baud, the gap between commands and the boot delay are data.
  type({ nodeType: 'DFPlayerOutput', block: 'uartPlayer', deviceField: 'device', devices: ['DFPlayer'], downloadable: true }),
  // Communication, storage and time. DmxTransceiver, MidiInterface and RtcModule name the
  // chip family their code is written for; SDCard's firmware is the same for every module,
  // so its block carries only what may be fed to it and it has no `devices` list.
  type({ nodeType: 'EthernetModule', block: 'ethernet', deviceField: 'controller', devices: ['W5500'], downloadable: true }),
  type({ nodeType: 'DmxTransceiver', block: 'rs485', deviceField: 'device', devices: ['MAX485'], downloadable: true }),
  type({ nodeType: 'MidiInterface', block: 'midiDin', deviceField: 'device', devices: ['H11L1MS'], downloadable: true }),
  type({ nodeType: 'SDCard', block: 'sdCard', downloadable: true }),
  type({ nodeType: 'RtcModule', block: 'rtc', deviceField: 'device', devices: ['DS3231'], downloadable: true }),
]

const BY_ID = new Map<string, PartTypeDefinition>()
for (const definition of PART_TYPES) {
  BY_ID.set(definition.nodeType, definition)
  for (const alias of definition.aliases ?? []) BY_ID.set(alias, definition)
}

/** The part type a manifest names, by current id or alias; undefined when this app lacks it. */
export function partTypeById(id: string): PartTypeDefinition | undefined {
  return BY_ID.get(id)
}

/** Whether `definition`'s code can drive a part whose block names `device`. */
export function partTypeDrivesDevice(definition: PartTypeDefinition, block: unknown): boolean {
  if (!definition.deviceField || !definition.devices) return true
  if (block === undefined && definition.blockOptional) return true
  if (typeof block !== 'object' || block === null) return false
  const device = (block as Record<string, unknown>)[definition.deviceField]
  return typeof device === 'string' && definition.devices.includes(device)
}
