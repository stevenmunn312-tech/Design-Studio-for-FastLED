import { describe, expect, it } from 'vitest'
import { boardProfileById } from '../../build/boardProfiles'
import { sdCsPinDefaultForBoard, sdSpiPinsForBoard } from '../sdPinDefaults'

describe('SD SPI CS defaults', () => {
  it('uses GPIO5 for the classic ESP-32D board and GPIO10 for ESP32-S3', () => {
    expect(sdCsPinDefaultForBoard(boardProfileById('esp32-devkit-v1-30pin-esp32d'))).toBe(5)
    expect(sdCsPinDefaultForBoard(boardProfileById('generic-esp32-s3-n16r8-44pin-dual-usbc'))).toBe(10)
  })

  it('provides the complete classic ESP-32D VSPI wiring', () => {
    expect(sdSpiPinsForBoard(boardProfileById('esp32-devkit-v1-30pin-esp32d'))).toEqual({
      cs: 5,
      sck: 18,
      miso: 19,
      mosi: 23,
    })
  })
})
