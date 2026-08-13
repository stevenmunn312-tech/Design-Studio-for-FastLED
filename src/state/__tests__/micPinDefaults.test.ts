import { describe, expect, it } from 'vitest'
import { MIC_PIN_DEFAULTS_BY_FQBN, micPinDefaultsForBoard, retargetedMicPins } from '../micPinDefaults'
import { BOARDS } from '../uploadStore'
import { findBoardPinCompatibility } from '../../utils/validateGraph'
import type { StudioNode } from '../graphStore'

const micNode = (properties: Record<string, unknown>): StudioNode => ({
  id: 'mic',
  type: 'studioNode',
  position: { x: 0, y: 0 },
  data: { nodeType: 'MicInput', label: 'Microphone', category: 'input', properties },
} as unknown as StudioNode)

/** Every ESP32 entry in the catalogue — the only family the mic can be built for. */
const esp32Boards = BOARDS.filter((board) => board.fqbn.startsWith('esp32:esp32:'))

describe('board-aware MicInput pin defaults', () => {
  it('covers every ESP32 board in the catalogue', () => {
    expect(esp32Boards).not.toHaveLength(0)
    for (const board of esp32Boards) {
      expect(micPinDefaultsForBoard(board.fqbn), board.label).toBeDefined()
    }
  })

  // The bug this whole mapping exists for: the library default is ESP32-S3
  // wiring, and GPIO40/41 simply aren't present on half the family, so a mic
  // dropped onto one of those boards could never compile.
  it.each(esp32Boards.map((board) => [board.label, board.fqbn]))(
    'gives %s pins that are usable with no errors or warnings',
    (_label, fqbn) => {
      const pins = micPinDefaultsForBoard(fqbn)!
      const { errors, warnings } = findBoardPinCompatibility([micNode({ ...pins })], fqbn)
      expect(errors).toEqual([])
      expect(warnings).toEqual([])
    },
  )

  it('keeps the S3 wiring on the S3 and moves off it on the classic ESP32', () => {
    expect(micPinDefaultsForBoard('esp32:esp32:esp32s3')).toEqual({ i2sWs: 39, i2sSck: 40, i2sSd: 41 })
    // Whatever the classic ESP32 gets, it cannot be a pad that board lacks.
    for (const fqbn of ['esp32:esp32:esp32', 'esp32:esp32:esp32doit-devkit-v1']) {
      const pins = micPinDefaultsForBoard(fqbn)!
      expect(Object.values(pins).every((pin) => pin <= 39)).toBe(true)
      expect(Object.values(pins)).not.toContain(40)
      expect(Object.values(pins)).not.toContain(41)
    }
  })

  it('leaves non-ESP32 targets on the library default', () => {
    // The mic can't be built for these at all, so there is no better pin to pick.
    for (const fqbn of ['arduino:avr:uno', 'rp2040:rp2040:rpipico', 'esp8266:esp8266:nodemcuv2']) {
      expect(micPinDefaultsForBoard(fqbn)).toBeUndefined()
    }
  })

  describe('retargeting an existing node', () => {
    const S3 = { i2sWs: 39, i2sSck: 40, i2sSd: 41 }
    const CLASSIC = micPinDefaultsForBoard('esp32:esp32:esp32')!

    it('moves a node still on another board’s defaults', () => {
      expect(retargetedMicPins({ ...S3 }, 'esp32:esp32:esp32')).toEqual(CLASSIC)
      expect(retargetedMicPins({ ...CLASSIC }, 'esp32:esp32:esp32s3')).toEqual(S3)
    })

    it('leaves hand-picked pins alone', () => {
      // One edited pin is enough to make the whole set the user's.
      expect(retargetedMicPins({ ...S3, i2sSck: 21 }, 'esp32:esp32:esp32')).toBeUndefined()
      expect(retargetedMicPins({ i2sWs: 5, i2sSck: 18, i2sSd: 19 }, 'esp32:esp32:esp32')).toBeUndefined()
    })

    it('is a no-op when the pins already match the new board', () => {
      expect(retargetedMicPins({ ...CLASSIC }, 'esp32:esp32:esp32')).toBeUndefined()
      expect(retargetedMicPins({ ...CLASSIC }, 'esp32:esp32:esp32doit-devkit-v1')).toBeUndefined()
    })

    it('leaves everything alone on a board with no mapping', () => {
      // Non-ESP32 targets can't build the mic at all; rewriting pins would
      // imply a working configuration that doesn't exist.
      expect(retargetedMicPins({ ...S3 }, 'arduino:avr:uno')).toBeUndefined()
    })
  })

  it('never reuses one pin for two I2S roles', () => {
    for (const [fqbn, pins] of Object.entries(MIC_PIN_DEFAULTS_BY_FQBN)) {
      expect(new Set(Object.values(pins)).size, fqbn).toBe(3)
    }
  })
})
