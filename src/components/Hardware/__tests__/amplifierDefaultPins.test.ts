import { describe, expect, it } from 'vitest'
import { FIXTURE_PARTS } from '../hardwarePartCatalog'
import { assignHardwarePartPins } from '../../../build/pins/i2cPinAssignment'
import { BOARD_PROFILES, boardProfileById } from '../../../build/boards/boardProfiles'

const amplifier = FIXTURE_PARTS.find((entry) => entry.nodeType === 'Amplifier')!

const BOARDS = [
  ['esp32:esp32:esp32s3', 'lolin-s3-40pin-dual-usbc'],
  ['esp32:esp32:esp32s3', 'espressif-esp32-s3-devkitc-1'],
  ['esp32:esp32:esp32s3', 'generic-esp32-s3-n16r8-44pin-dual-usbc'],
  ['esp32:esp32:esp32c3', 'esp32-c3-super-mini'],
  ['esp32:esp32:esp32', 'esp32-generic-devkit-38pin'],
] as const

describe('Amplifier shelf pins', () => {
  it('asks the board allocator for three pins instead of keeping the node defaults', () => {
    expect(amplifier.pinRequests?.map((request) => request.key)).toEqual(['i2sBclk', 'i2sLrc', 'i2sDout'])
  })

  it.each(BOARDS)('%s / %s gets three distinct, board-allowed pins', (fqbn, id) => {
    const profile = boardProfileById(id) ?? BOARD_PROFILES.find((entry) => entry.id === id)
    expect(profile).toBeDefined()
    const result = assignHardwarePartPins(profile, fqbn, [], amplifier.pinRequests ?? [], 'Amplifier', {})
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const pins = Object.values(result.pins)
    expect(new Set(pins).size).toBe(3)
    const pool = profile!.pinSafety?.safeGeneralPurpose
    if (pool) for (const pin of pins) expect(pool).toContain(pin)
    // The S3 has no usable GPIO 22-25, the classic ESP32 defaults' neighbours.
    if (fqbn.endsWith('esp32s3')) for (const pin of pins) expect([22, 23, 24, 25]).not.toContain(pin)
  })
})
