/*
 * The sensor outputs added after the node review: a Pad per touch electrode, a
 * Key per keypad key and the keypad's Digit, the motion sensor's Shake, and the
 * preview's unplug switch on every sensor with a Connected output. Each is
 * held on both sides, the preview's value and the line the sketch emits.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { generateCpp } from '../../../codegen/cppGenerator'
import { controlInputCpp } from '../../../codegen/controlInputCpp'
import { evaluateGraphFull, resetEvaluatorState } from '../../graphEvaluator'
import type { StudioEdge, StudioNode } from '../../graphStore'
import { libraryDefaults, NODE_LIBRARY } from '../../nodeLibrary'
import { useHardwareInputStore } from '../hardwareInputStore'
import { keypadButtonKey, keypadDigit, keypadLastKey, keypadScanKey } from '../keypad'
import { motionVectorPreviewKey, motionVectorShake } from '../motionVector'
import { unpluggedPreviewKey } from '../sensorPreview'
import { touchPadButtonKey } from '../touchPad'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)!
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: {
      label: definition.label, nodeType, category: definition.category,
      properties: { ...libraryDefaults(nodeType), ...properties },
      inputs: definition.inputs, outputs: definition.outputs,
    },
  } as StudioNode
}
const edge = (source: string, sourceHandle: string, target: string, targetHandle: string): StudioEdge =>
  ({ id: `${source}-${sourceHandle}`, source, sourceHandle, target, targetHandle }) as StudioEdge
const outputsOf = (nodes: StudioNode[]) => evaluateGraphFull(nodes, [], 0, 8, 8).outputs

beforeEach(() => {
  resetEvaluatorState()
  useHardwareInputStore.setState({ button: new Map(), pot: new Map(), encoder: new Map() })
})

describe('Touch Pad per-electrode outputs', () => {
  it('reads each pad in the preview, and none while unplugged', () => {
    const store = useHardwareInputStore.getState()
    store.setButton(touchPadButtonKey('tp', 3), true)
    store.setButton(touchPadButtonKey('tp', 7), true)
    const reading = outputsOf([node('tp', 'TouchPadInput')]).get('tp')!
    expect(reading).toMatchObject({ pad3: true, pad7: true, pad0: false, electrode: 3, count: 2, connected: true })

    store.setButton(unpluggedPreviewKey('tp'), true)
    resetEvaluatorState()
    expect(outputsOf([node('tp', 'TouchPadInput')]).get('tp')).toMatchObject({
      pad3: false, touched: false, count: 0, connected: false,
    })
  })

  it('computes only the wired pads in the sketch, from the status bits', () => {
    const pad = node('tp', 'TouchPadInput')
    const cpp = generateCpp([pad, node('t', 'Trigger')], [edge('tp', 'pad3', 't', 'trigger')])
    expect(cpp).toContain('bool n_tp_pad3 = (_mprBits_tp & (1u << 3)) != 0;')
    expect(cpp).not.toContain('n_tp_pad4')
    // The control graph does not say what it reads, so it gets every pad.
    const all = controlInputCpp('TouchPadInput', 'tp', pad.data.properties)!
    expect(Object.keys(all.outputs).filter((port) => port.startsWith('pad'))).toHaveLength(12)
    const one = controlInputCpp('TouchPadInput', 'tp', pad.data.properties, new Set(['pad11']))!
    expect(Object.keys(one.outputs).filter((port) => port.startsWith('pad'))).toEqual(['pad11'])
  })
})

describe('Keypad per-key outputs and Digit', () => {
  it('reports the key the scan finds, as the sketch does', () => {
    // Column by column: with 2 (row 0, column 1) and 4 (row 1, column 0) both
    // down, the column-0 key is found first.
    expect(keypadScanKey((key) => key === 1 || key === 4)).toBe(4)
    expect(keypadScanKey(() => false)).toBe(-1)
    const store = useHardwareInputStore.getState()
    store.setButton(keypadButtonKey('kp', 1), true)
    store.setButton(keypadButtonKey('kp', 4), true)
    const reading = outputsOf([node('kp', 'KeypadInput')]).get('kp')!
    expect(reading).toMatchObject({ key4: true, key1: false, pressed: true })
  })

  // The key printed "0" is index 13. Digit reads it as 0 and ignores letters.
  it('holds the last number key as Digit', () => {
    expect(keypadDigit(13)).toBe(0)
    expect(keypadDigit(3)).toBeNull()
    const kp = node('kp', 'KeypadInput')
    const store = useHardwareInputStore.getState()
    store.setPot(keypadLastKey('kp'), 13)
    expect(outputsOf([kp]).get('kp')?.digit).toBe(0)
    store.setPot(keypadLastKey('kp'), 9) // "8"
    expect(outputsOf([kp]).get('kp')?.digit).toBe(8)
    store.setPot(keypadLastKey('kp'), 3) // "A" keeps the 8
    expect(outputsOf([kp]).get('kp')?.digit).toBe(8)
  })

  it('emits Digit and a key only when something reads them', () => {
    const kp = node('kp', 'KeypadInput')
    const bare = generateCpp([kp], [])
    expect(bare).not.toContain('_kpDigit_kp')
    expect(bare).not.toContain('n_kp_key0')
    const wired = generateCpp([kp, node('t', 'Trigger'), node('m', 'MapRange')], [
      edge('kp', 'key13', 't', 'trigger'), edge('kp', 'digit', 'm', 'value'),
    ])
    expect(wired).toContain('bool n_kp_key13 = _kpKey_kp == 13;')
    expect(wired).toContain('float n_kp_digit = _kpDigit_kp;')
  })
})

describe('Accel & Gyro Shake', () => {
  it('reads 0 at rest in any orientation, and the distance from 1 g otherwise', () => {
    expect(motionVectorShake(0, 0, 1)).toBeCloseTo(0)
    expect(motionVectorShake(1, 0, 0)).toBeCloseTo(0)
    expect(motionVectorShake(0, 0, 2.5)).toBeCloseTo(1.5)
    // The default stand-in lies flat, so the preview reads no shake.
    expect(outputsOf([node('mv', 'MotionVectorInput')]).get('mv')?.shake).toBeCloseTo(0)
    useHardwareInputStore.getState().setPot(motionVectorPreviewKey('mv', 'accelZ'), 1)
    expect(Number(outputsOf([node('mv', 'MotionVectorInput')]).get('mv')?.shake)).toBeGreaterThan(0.5)
  })

  it('emits the same sum in the sketch', () => {
    const cpp = generateCpp([node('mv', 'MotionVectorInput')], [])
    expect(cpp).toContain('float n_mv_shake = fabsf(sqrtf(_mpuV_mv[0] * _mpuV_mv[0] + _mpuV_mv[1] * _mpuV_mv[1] + _mpuV_mv[2] * _mpuV_mv[2]) - 1.0f);')
  })
})

describe('the preview unplug switch', () => {
  it('sets Connected false on every sensor that has it', () => {
    const store = useHardwareInputStore.getState()
    for (const type of ['TemperatureInput', 'MotionVectorInput', 'TouchPadInput', 'DistanceInput', 'PresenceInput']) {
      const id = `s-${type}`
      expect(outputsOf([node(id, type)]).get(id)?.connected, type).toBe(true)
      store.setButton(unpluggedPreviewKey(id), true)
      resetEvaluatorState()
      expect(outputsOf([node(id, type)]).get(id)?.connected, type).toBe(false)
    }
  })
})
