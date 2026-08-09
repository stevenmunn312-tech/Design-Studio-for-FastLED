import { describe, expect, it } from 'vitest'
import {
  BOARD_PROFILES,
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
})
