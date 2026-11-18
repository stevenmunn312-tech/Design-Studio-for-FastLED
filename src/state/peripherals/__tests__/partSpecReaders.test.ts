import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PART_CATALOGUE, registerParts, resetRegisteredPartsForTests, type PartCatalogueEntry } from '../../../build/parts/partCatalogue'
import { partTypeById } from '../../../build/parts/partTypes'
import { PART_MANIFEST_VERSION } from '../../../build/parts/manifest/vocabulary'
import type { PartManifest } from '../../../build/parts/manifest/partManifest'
import { partFieldOptions, PART_FIELDS } from '../../../build/parts/partFields'
import { propertyMeta, propertyMetaFor, propertyOptions, resolveNodeNumericProperties } from '../../nodeLibrary'
import { relayMaxPinKeys, relayPinKeys, MAX_RELAY_CHANNELS } from '../relayModule'
import { coolingFanSpec, COOLING_FAN_PART_ID } from '../coolingFan'
import { darlingtonSpec, darlingtonActiveHigh, DARLINGTON_PART_ID } from '../darlingtonDriver'
import { buzzerSpec, buzzerActiveHigh, buzzerIsPassive, BUZZER_PART_ID } from '../buzzer'
import { touchPadSpec, touchPadAddressOptions, touchPadAddress, MPR121_PART_ID } from '../touchPad'
import { touchButtonSpec, touchButtonPressedLevel, DEFAULT_TOUCH_BUTTON_PART_ID } from '../touchButton'
import { temperatureSensorSpec, DS18B20_PART_ID } from '../temperatureSensor'
import { pwmDriverSpec, pwmDriverAddress, pwmDriverAddressOptions, pwmDriverHz, pwmDriverHzRange, PCA9685_PART_ID } from '../pwmDriver'
import { presenceSensorSpec, DEFAULT_PRESENCE_PART_ID } from '../presenceSensor'
import { powerMonitorSpec, powerMonitorAddress, powerMonitorAddressOptions, DEFAULT_POWER_MONITOR_PART_ID } from '../powerMonitor'
import { pdTriggerSpec, pdTriggerVoltage, pdTriggerVoltageOptions, PD_TRIGGER_PART_ID } from '../pdTrigger'
import { motionVectorSpec, motionVectorAddressOptions, MPU6050_PART_ID } from '../motionVector'
import { joystickSpec, KY023_PART_ID } from '../joystick'
import { ethernetSpec, DEFAULT_ETHERNET_PART_ID } from '../ethernetModule'
import { environmentSensorSpec, environmentAddressOptions, BME280_PART_ID } from '../environmentSensor'
import { distanceSensorSpec, distanceSensorTransport, distanceSensorAddressOptions, HCSR04_PART_ID, VL53L0X_PART_ID } from '../distanceSensor'
import { lightSensorModule, lightSensorTransport, lightSensorAddressOptions, DEFAULT_LIGHT_SENSOR_PART_ID, BH1750_PART_ID } from '../lightSensor'
import { micModuleFor, DEFAULT_MIC_PART_ID } from '../micModules'
import { irReceiverSpec, DEFAULT_IR_RECEIVER_PART_ID } from '../irModules'
import { KEYPAD_PART_ID, keypadSpec } from '../keypad'
import { MOTION_SENSOR_PART_ID, motionSensorSpec } from '../motionSensor'
import { powerConverterModuleFor, DEFAULT_POWER_CONVERTER_PART_ID } from '../powerConverter'
import { partIdOrDefault } from '../partSpec'

const UNKNOWN = 'a-part-no-catalogue-has'

describe('a peripheral reader never returns another part\'s facts', () => {
  const readers: Array<[string, (partId: unknown) => unknown, string]> = [
    ['coolingFanSpec', coolingFanSpec, COOLING_FAN_PART_ID],
    ['darlingtonSpec', darlingtonSpec, DARLINGTON_PART_ID],
    ['buzzerSpec', buzzerSpec, BUZZER_PART_ID],
    ['touchPadSpec', touchPadSpec, MPR121_PART_ID],
    ['touchButtonSpec', touchButtonSpec, DEFAULT_TOUCH_BUTTON_PART_ID],
    ['temperatureSensorSpec', temperatureSensorSpec, DS18B20_PART_ID],
    ['pwmDriverSpec', pwmDriverSpec, PCA9685_PART_ID],
    ['presenceSensorSpec', presenceSensorSpec, DEFAULT_PRESENCE_PART_ID],
    ['powerMonitorSpec', powerMonitorSpec, DEFAULT_POWER_MONITOR_PART_ID],
    ['pdTriggerSpec', pdTriggerSpec, PD_TRIGGER_PART_ID],
    ['motionVectorSpec', motionVectorSpec, MPU6050_PART_ID],
    ['joystickSpec', joystickSpec, KY023_PART_ID],
    ['ethernetSpec', ethernetSpec, DEFAULT_ETHERNET_PART_ID],
    ['environmentSensorSpec', environmentSensorSpec, BME280_PART_ID],
    ['distanceSensorSpec', distanceSensorSpec, HCSR04_PART_ID],
    ['lightSensorModule', lightSensorModule, DEFAULT_LIGHT_SENSOR_PART_ID],
    ['micModuleFor', micModuleFor, DEFAULT_MIC_PART_ID],
    ['irReceiverSpec', irReceiverSpec, DEFAULT_IR_RECEIVER_PART_ID],
    ['keypadSpec', keypadSpec, KEYPAD_PART_ID],
    ['motionSensorSpec', motionSensorSpec, MOTION_SENSOR_PART_ID],
    ['powerConverterModuleFor', powerConverterModuleFor, DEFAULT_POWER_CONVERTER_PART_ID],
  ]

  it.each(readers)('%s: a missing id is the default part, an unknown one is nothing', (_name, read, defaultId) => {
    const standard = read(defaultId)
    expect(standard).toBeTruthy()
    for (const missing of [undefined, null, '', '   ']) expect(read(missing)).toEqual(standard)
    expect(read(UNKNOWN)).toBeFalsy()
  })

  it('looks the default microphone up by id, not by position', () => {
    expect(micModuleFor(undefined)?.partId).toBe(DEFAULT_MIC_PART_ID)
    expect(partIdOrDefault('  ', 'x')).toBe('x')
    expect(partIdOrDefault('y', 'x')).toBe('y')
  })

  it('offers nothing, and selects nothing, for an unknown part', () => {
    for (const options of [
      pwmDriverAddressOptions, powerMonitorAddressOptions, touchPadAddressOptions, motionVectorAddressOptions,
      environmentAddressOptions, distanceSensorAddressOptions, lightSensorAddressOptions, pdTriggerVoltageOptions,
    ]) expect(options(UNKNOWN)).toEqual([])
    expect(pwmDriverAddress({ partId: UNKNOWN })).toBeNull()
    expect(powerMonitorAddress({ partId: UNKNOWN })).toBeNull()
    expect(touchPadAddress({ partId: UNKNOWN })).toBeNull()
    expect(pdTriggerVoltage({ partId: UNKNOWN })).toBeNull()
    expect(pwmDriverHz({ partId: UNKNOWN })).toBeNull()
    expect(pwmDriverHzRange(UNKNOWN)).toBeNull()
    expect(distanceSensorTransport(UNKNOWN)).toBeNull()
    expect(lightSensorTransport(UNKNOWN)).toBeNull()
    expect(buzzerActiveHigh(UNKNOWN)).toBeNull()
    expect(buzzerIsPassive(UNKNOWN)).toBe(false)
    expect(darlingtonActiveHigh(UNKNOWN)).toBeNull()
    expect(touchButtonPressedLevel(UNKNOWN)).toBeNull()
  })
})

describe('the relay pin superset', () => {
  it('is the part-independent maximum, which no part exceeds', () => {
    expect(relayMaxPinKeys()).toHaveLength(MAX_RELAY_CHANNELS)
    const widest = Object.values(PART_CATALOGUE).filter((entry) => entry.relay).map((entry) => relayPinKeys(entry.partId))
    for (const keys of widest) expect(relayMaxPinKeys()).toEqual(expect.arrayContaining(keys))
  })
})

function second(source: string, partTypes: string[], partId: string, extra: Partial<PartManifest>): PartManifest {
  const entry = PART_CATALOGUE[source] as PartCatalogueEntry
  return {
    ...(JSON.parse(JSON.stringify(entry)) as PartCatalogueEntry),
    partId,
    label: `Test ${partId}`,
    manifestVersion: PART_MANIFEST_VERSION,
    revision: 1,
    partTypes,
    categories: [],
    verification: 'reviewed',
    sources: [{ facts: ['dimensionsMm'], ref: 'https://example.test/datasheet' }],
    ...extra,
  }
}

describe('a node reads its option lists and slider bounds from its own part', () => {
  const restore: Array<() => void> = []
  beforeEach(() => {
    for (const nodeType of ['PwmDriverOutput', 'PdTriggerSource', 'PowerMonitorInput']) {
      const definition = partTypeById(nodeType) as { downloadable: boolean }
      const before = definition.downloadable
      definition.downloadable = true
      restore.push(() => { definition.downloadable = before })
    }
  })
  afterEach(() => {
    while (restore.length > 0) restore.pop()!()
    resetRegisteredPartsForTests()
  })

  it('PwmDriverOutput: addresses and the frequency slider follow the part', () => {
    const base = PART_CATALOGUE[PCA9685_PART_ID].pwmDriver!
    const [result] = registerParts([second(PCA9685_PART_ID, ['PwmDriverOutput'], 'pwm-other', {
      pwmDriver: { ...base, i2cAddresses: [0x50, 0x51], defaultI2cAddress: 0x50, minPwmHz: 10, maxPwmHz: 500, defaultPwmHz: 100 },
    })], 'downloaded')
    expect(result.status).toBe('added')
    expect(propertyOptions('PwmDriverOutput', 'i2cAddress', { partId: 'pwm-other' })).toEqual(['0x50', '0x51'])
    expect(propertyOptions('PwmDriverOutput', 'i2cAddress', { partId: PCA9685_PART_ID })).toEqual(pwmDriverAddressOptions(PCA9685_PART_ID))
    expect(propertyOptions('PwmDriverOutput', 'i2cAddress', { partId: UNKNOWN })).toEqual([])
    expect(propertyMetaFor('PwmDriverOutput', 'pwmHz', { partId: 'pwm-other' })).toMatchObject({ control: 'slider', min: 10, max: 500 })
    expect(propertyMetaFor('PwmDriverOutput', 'pwmHz', { partId: PCA9685_PART_ID })).toMatchObject({ min: base.minPwmHz, max: base.maxPwmHz })
    expect(propertyMetaFor('PwmDriverOutput', 'pwmHz', { partId: UNKNOWN })).toBeUndefined()
    // The static entry stays the default part's, for callers with no node in hand.
    expect(propertyMeta('PwmDriverOutput', 'pwmHz')).toMatchObject({ min: base.minPwmHz, max: base.maxPwmHz })
    // A saved address the node's own part cannot select is refused, not replaced.
    expect(pwmDriverAddress({ partId: 'pwm-other', i2cAddress: '0x40' })).toBeNull()
    expect(pwmDriverAddress({ partId: 'pwm-other', i2cAddress: '0x51' })).toBe(0x51)
    expect(pwmDriverAddress({ partId: 'pwm-other' })).toBe(0x50)
  })

  it('PdTriggerSource: the requestable voltages follow the part, on the node and in its panel', () => {
    const base = PART_CATALOGUE[PD_TRIGGER_PART_ID].pdTrigger!
    const [result] = registerParts([second(PD_TRIGGER_PART_ID, ['PdTriggerSource'], 'pd-other', {
      pdTrigger: { ...base, selectableVoltagesV: [5, 9], defaultVoltageV: 9 },
    })], 'downloaded')
    expect(result.status).toBe('added')
    expect(propertyOptions('PdTriggerSource', 'requestedVoltage', { partId: 'pd-other' })).toEqual(['5', '9'])
    expect(propertyOptions('PdTriggerSource', 'requestedVoltage', { partId: PD_TRIGGER_PART_ID })).toEqual(base.selectableVoltagesV.map(String))
    const field = PART_FIELDS.PdTriggerSource[0]
    if (field.kind !== 'select') throw new Error('requestedVoltage is a select')
    expect(partFieldOptions(field, { partId: 'pd-other' })).toEqual(['5', '9'])
    expect(partFieldOptions(field, {})).toEqual(base.selectableVoltagesV.map(String))
    expect(pdTriggerVoltage({ partId: 'pd-other', requestedVoltage: '12' })).toBeNull()
    expect(pdTriggerVoltage({ partId: 'pd-other', requestedVoltage: '9' })).toBe(9)
  })

  it('PowerMonitorInput and the I2C sensors resolve their address lists per node', () => {
    for (const [nodeType, partId] of [
      ['PowerMonitorInput', DEFAULT_POWER_MONITOR_PART_ID], ['TouchPadInput', MPR121_PART_ID],
      ['MotionVectorInput', MPU6050_PART_ID], ['EnvironmentInput', BME280_PART_ID],
      ['DistanceInput', VL53L0X_PART_ID], ['LightInput', BH1750_PART_ID],
    ] as const) {
      const options = propertyOptions(nodeType, 'i2cAddress', { partId })
      expect(options.length, nodeType).toBeGreaterThan(0)
      expect(propertyOptions(nodeType, 'i2cAddress', { partId: UNKNOWN }), nodeType).toEqual([])
    }
    // An analog light sensor has no address to pick.
    expect(propertyOptions('LightInput', 'i2cAddress', { partId: DEFAULT_LIGHT_SENSOR_PART_ID })).toEqual([])
  })

  it('a select value only the node\'s own part could take is cleared, not kept', () => {
    const saved = { partId: PD_TRIGGER_PART_ID, requestedVoltage: 'not an id !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!' }
    expect(resolveNodeNumericProperties('PdTriggerSource', saved, 16, 16).requestedVoltage).toBe('')
  })
})
