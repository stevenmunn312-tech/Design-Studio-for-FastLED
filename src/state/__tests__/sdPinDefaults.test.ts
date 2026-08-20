import { describe, expect, it } from 'vitest'
import { boardProfileById } from '../../build/boardProfiles'
import { sdCsPinDefaultForBoard } from '../sdPinDefaults'

describe('SD SPI CS defaults', () => {
  it('uses GPIO5 for the classic ESP-32D board and GPIO10 for ESP32-S3', () => {
    expect(sdCsPinDefaultForBoard(boardProfileById('esp32-devkit-v1-30pin-esp32d'))).toBe(5)
    expect(sdCsPinDefaultForBoard(boardProfileById('generic-esp32-s3-n16r8-44pin-dual-usbc'))).toBe(10)
  })
})
