import { describe, expect, it } from 'vitest'
import {
  BOARD_PROFILES,
  boardPinForGpio,
  compatibleBoardProfilesForFqbn,
  isBoardProfileCompatibleWithFqbn,
  validateBoardProfiles,
} from '../boardProfiles'

describe('boardProfiles', () => {
  it('validates the built-in physical board registry', () => {
    expect(validateBoardProfiles()).toEqual([])
  })

  it('filters compatible profiles for the selected target family', () => {
    expect(compatibleBoardProfilesForFqbn('esp32:esp32:esp32s3').map((profile) => profile.id)).toEqual(
      BOARD_PROFILES.map((profile) => profile.id)
    )
    expect(compatibleBoardProfilesForFqbn('rp2040:rp2040:rpipico')).toEqual([])
  })

  it('checks exact-board compatibility against the project target', () => {
    expect(isBoardProfileCompatibleWithFqbn('seeed-xiao-esp32s3', 'esp32:esp32:esp32s3')).toBe(true)
    expect(isBoardProfileCompatibleWithFqbn('seeed-xiao-esp32s3', 'rp2040:rp2040:rpipico')).toBe(false)
  })

  it('maps reviewed board pins back from logical GPIO numbers', () => {
    const generic = BOARD_PROFILES.find((profile) => profile.id === 'generic-esp32-s3-n16r8-44pin-dual-usbc')
    const devkit = BOARD_PROFILES.find((profile) => profile.id === 'espressif-esp32-s3-devkitc-1')
    const xiao = BOARD_PROFILES.find((profile) => profile.id === 'seeed-xiao-esp32s3')

    expect(boardPinForGpio(generic, 0)?.label).toBe('BOOT / GPIO0')
    expect(boardPinForGpio(generic, 14)?.label).toBe('GPIO14')
    expect(boardPinForGpio(generic, 35)?.availability).toBe('unavailable')
    expect(boardPinForGpio(devkit, 14)?.label).toBe('GPIO14')
    expect(boardPinForGpio(xiao, 43)?.label).toBe('D6 / GPIO43')
  })
})
