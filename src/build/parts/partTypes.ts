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
  // Power
  type({ nodeType: 'PowerConverter', block: 'powerConverter' }),
  type({ nodeType: 'BatteryPack', block: 'batteryCell' }),
  type({ nodeType: 'BatteryModule', block: 'batteryModule' }),
  type({ nodeType: 'PdTriggerSource', block: 'pdTrigger' }),
  type({ nodeType: 'PowerMonitorInput', block: 'powerMonitor', deviceField: 'device', devices: ['INA219B', 'INA226'] }),
  // Switching
  type({ nodeType: 'RelayOutput', block: 'relay' }),
  type({ nodeType: 'PowerSwitchOutput', block: 'mosfet' }),
  type({ nodeType: 'DarlingtonDriverOutput', block: 'driverChip' }),
  type({ nodeType: 'PwmDriverOutput', block: 'pwmDriver', deviceField: 'device', devices: ['PCA9685'] }),
  type({ nodeType: 'CoolingFanOutput', block: 'fan' }),
  type({ nodeType: 'BuzzerOutput', block: 'buzzer' }),
  // Sensors
  type({ nodeType: 'LightInput', block: 'lightSensor', blockOptional: true, deviceField: 'device', devices: ['BH1750FVI'] }),
  type({ nodeType: 'EnvironmentInput', block: 'environmentSensor', deviceField: 'device', devices: ['BME280'] }),
  type({ nodeType: 'MotionVectorInput', block: 'motionVectorSensor', deviceField: 'device', devices: ['MPU-6050'] }),
  type({ nodeType: 'PresenceInput', block: 'presenceSensor', deviceField: 'device', devices: ['HLK-LD2410C'] }),
  type({ nodeType: 'DistanceInput', block: 'distanceSensor', deviceField: 'device', devices: ['HC-SR04', 'VL53L0X', 'VL53L1X'] }),
  type({ nodeType: 'TemperatureInput', block: 'temperatureSensor', deviceField: 'device', devices: ['DS18B20'] }),
  type({ nodeType: 'MotionInput' }),
  // Controls
  type({ nodeType: 'TouchButtonInput', block: 'touchSensor' }),
  type({ nodeType: 'TouchPadInput', block: 'touchPad', deviceField: 'device', devices: ['MPR121'] }),
  type({ nodeType: 'JoystickInput', block: 'joystick' }),
  type({ nodeType: 'EncoderInput', block: 'encoder' }),
  type({ nodeType: 'KeypadInput' }),
  type({ nodeType: 'IRRemoteInput' }),
  // Displays
  type({ nodeType: 'InfoDisplay', block: 'display', deviceField: 'controller', devices: ['SSD1306', 'SH1106G'] }),
  type({ nodeType: 'TransportDisplay', block: 'display', deviceField: 'controller', devices: ['ST7789V', 'ILI9341'] }),
  type({ nodeType: 'SegmentDisplay', block: 'display', deviceField: 'controller', devices: ['TM1637', 'MAX7219'] }),
  // Audio
  type({ nodeType: 'MicInput' }),
  type({ nodeType: 'LineInput' }),
  type({ nodeType: 'Amplifier', property: 'model' }),
  type({ nodeType: 'PowerAmplifier' }),
  type({ nodeType: 'DFPlayerOutput' }),
  // Communication, storage and time
  type({ nodeType: 'EthernetModule', block: 'ethernet', deviceField: 'controller', devices: ['W5500'] }),
  type({ nodeType: 'DmxTransceiver' }),
  type({ nodeType: 'MidiInterface' }),
  type({ nodeType: 'SDCard' }),
  type({ nodeType: 'RtcModule' }),
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
