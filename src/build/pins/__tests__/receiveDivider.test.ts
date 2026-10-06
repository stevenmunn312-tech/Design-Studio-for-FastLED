import { describe, expect, it } from 'vitest'
import { dividedInputPinKey, receiveDividerSource } from '../receiveDivider'
import { numericPinSummary } from '../../../components/Hardware/hardwarePartCatalog'

describe('hardware captions for divided inputs', () => {
  it('marks only the DMX receive pin, preserving the other assigned pins', () => {
    expect(numericPinSummary(
      { dmxRxPin: 2, dmxTxPin: 3, dmxEnablePin: 4 },
      [{ key: 'dmxRxPin', label: 'RO' }, { key: 'dmxTxPin', label: 'DI' }, { key: 'dmxEnablePin', label: 'DE' }],
      'DMXInput',
    )).toBe('RO 2 (See build diagram) · DI 3 · DE 4')
    expect(receiveDividerSource('dmx-input', 'max485-rs485-module')?.propertyKey).toBe('dmxRxPin')
  })

  it.each([
    ['IRRemoteInput', 'ky-022-ir-receiver-module'],
    ['IRRemoteInput', 'tsop38238-ir-receiver'],
    ['DistanceInput', 'adafruit-vl53l0x-distance-sensor'],
    ['DistanceInput', 'adafruit-vl53l1x-distance-sensor'],
    ['PresenceInput', 'hlk-ld2410c-presence-sensor'],
    ['MotionInput', 'hc-sr501-pir-sensor'],
    ['SDCard', 'microsd-module-5v'],
  ])('keeps %s / %s without a divider note', (nodeType, partId) => {
    expect(dividedInputPinKey(nodeType, { partId })).toBeNull()
  })

  it('does not show a wiring note for a pin without an assignment', () => {
    expect(numericPinSummary({}, [{ key: 'pin', label: 'S' }], 'IRRemoteInput')).toBe('')
  })
})
