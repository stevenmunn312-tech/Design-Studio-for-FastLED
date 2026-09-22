import { describe, expect, it } from 'vitest'
import {
  addIrRemoteButton,
  blankIrRepeatState,
  canonicalIrProtocol,
  duplicateIrRemoteMappings,
  IR_REMOTE_LEARN_HANDLE,
  irRemoteButtonHandle,
  irRemoteOutputs,
  parseIrLearnLine,
  MAX_IR_REMOTE_BUTTONS,
  normalizeIrRemoteButtons,
  reduceIrRemoteFrame,
  removeIrRemoteButton,
  renameIrRemoteButton,
  stepIrRemotePreview,
  type IrRemoteButton,
} from '../irRemote'

const buttons: IrRemoteButton[] = [
  { id: 'power', label: 'Power', protocol: 'NEC', address: 0, command: 69, repeat: 'once' },
  { id: 'brighter', label: 'Brightness +', protocol: 'NEC', address: 0, command: 70, repeat: 'held' },
]

describe('IR remote mapping primitives', () => {
  it('normalizes bounded saved rows without persisting library enum values', () => {
    const normalized = normalizeIrRemoteButtons([
      { id: '../power()', label: `  ${'P'.repeat(80)}  `, protocol: ' n-e_c ', address: -4, command: 2 ** 40, repeat: 'again' },
      { id: '../power()', label: '', protocol: 'samsung-lg', address: 3.9, command: '7', repeat: 'held' },
      null,
    ])
    expect(normalized).toEqual([
      { id: 'power', label: 'P'.repeat(64), protocol: 'NEC', address: 0, command: 0xffff_ffff, repeat: 'once' },
      { id: 'power-2', label: 'Button 2', protocol: 'SamsungLG', address: 3, command: 7, repeat: 'held' },
    ])
    expect(canonicalIrProtocol(7)).toBeNull()
    expect(canonicalIrProtocol('unsupported')).toBeNull()
  })

  it('keeps wired handles visible ahead of unwired metadata at the row bound', () => {
    const imported = Array.from({ length: MAX_IR_REMOTE_BUTTONS + 8 }, (_, index) => ({
      id: `row-${index}`, label: `Row ${index}`, protocol: 'NEC', address: 0, command: index,
    }))
    const normalized = normalizeIrRemoteButtons(imported, ['button-wired-missing'])
    expect(normalized).toHaveLength(MAX_IR_REMOTE_BUTTONS)
    expect(normalized.find((button) => button.id === 'wired-missing')).toEqual({
      id: 'wired-missing', label: 'Missing mapping', protocol: '', address: 0, command: 0, repeat: 'once',
    })
    expect(normalized.some((button) => button.id === 'row-31')).toBe(false)
  })

  it('derives stable handles so rename preserves and remove targets only that mapping', () => {
    const handle = irRemoteButtonHandle('power')
    const renamed = renameIrRemoteButton(buttons, 'power', 'Main power')
    expect(irRemoteOutputs(renamed, false).find((output) => output.label === 'Main power')?.id).toBe(handle)
    expect(removeIrRemoteButton(renamed, 'power').map((button) => button.id)).toEqual(['brighter'])
  })

  it('reports duplicate canonical protocol/address/command identities', () => {
    const duplicates = duplicateIrRemoteMappings([
      ...buttons,
      { id: 'also-power', label: 'Other', protocol: 'nec', address: 0, command: 69, repeat: 'held' },
    ])
    expect(duplicates).toEqual([{
      identity: { protocol: 'NEC', address: 0, command: 69 },
      buttonIds: ['power', 'also-power'],
    }])
  })

  it('emits initial frames and only held-policy repeats inside the bounded window', () => {
    let state = blankIrRepeatState()
    let reduced = reduceIrRemoteFrame(state, buttons, { protocol: 'NEC', address: 0, command: 70 }, 1000)
    expect(reduced.pulseIds).toEqual(['brighter'])
    state = reduced.state

    reduced = reduceIrRemoteFrame(state, buttons, { repeat: true }, 1120)
    expect(reduced.pulseIds).toEqual(['brighter'])
    state = reduced.state
    reduced = reduceIrRemoteFrame(state, buttons, { repeat: true }, 1230)
    expect(reduced.pulseIds).toEqual(['brighter'])

    const once = reduceIrRemoteFrame(blankIrRepeatState(), buttons, { protocol: 'NEC', address: 0, command: 69 }, 2000)
    expect(once.pulseIds).toEqual(['power'])
    expect(reduceIrRemoteFrame(once.state, buttons, { repeat: true }, 2100).pulseIds).toEqual([])
    expect(reduceIrRemoteFrame(reduced.state, buttons, { repeat: true }, 1600).pulseIds).toEqual([])
  })

  it('does not replay an old known key after unknown or malformed frames', () => {
    const known = reduceIrRemoteFrame(blankIrRepeatState(), buttons, { protocol: 'NEC', address: 0, command: 70 }, 100)
    const unknown = reduceIrRemoteFrame(known.state, buttons, { protocol: 'NEC', address: 9, command: 9 }, 150)
    expect(unknown.pulseIds).toEqual([])
    expect(reduceIrRemoteFrame(unknown.state, buttons, { repeat: true }, 200).pulseIds).toEqual([])

    const malformed = reduceIrRemoteFrame(known.state, buttons, { protocol: 'raw', address: -1, command: 70 }, 150)
    expect(malformed.state.lastIdentity).toBeNull()
    expect(reduceIrRemoteFrame(malformed.state, buttons, { repeat: true }, 200).pulseIds).toEqual([])
  })

  it('adds a key without disturbing the ones already learned', () => {
    const next = addIrRemoteButton(buttons)
    expect(next.map((button) => button.id)).toEqual(['power', 'brighter', 'key-3'])
    expect(next[2]).toMatchObject({ protocol: 'NEC', address: 0, command: 0, repeat: 'once' })
    expect(irRemoteOutputs(next).map((port) => port.id)).toEqual([
      'button-power', 'button-brighter', 'button-key-3', IR_REMOTE_LEARN_HANDLE,
    ])
  })

  it('pulses once on press and keeps pulsing only while a held key stays down', () => {
    const down = new Set<string>()
    let memory = { pressed: new Map<string, boolean>(), repeat: blankIrRepeatState() }
    const step = (now: number) => {
      const result = stepIrRemotePreview(memory, buttons, (id) => down.has(id), now)
      memory = result.memory
      return result.active
    }

    down.add('power')
    expect([...step(1000)]).toEqual(['power'])
    expect([...step(1100)]).toEqual([])
    down.delete('power')
    step(1200)

    down.add('brighter')
    expect([...step(2000)]).toEqual(['brighter'])
    expect([...step(2100)]).toEqual(['brighter'])
  })

  it('reads one versioned FLS_IR frame and refuses anything else', () => {
    expect(parseIrLearnLine('FLS_IR v=1 protocol=NEC address=0x00 command=0x45 repeat=0')).toEqual({
      version: 1, protocol: 'NEC', address: 0, command: 0x45, repeat: false,
    })
    expect(parseIrLearnLine('boot FLS_IR v=1 protocol=nec address=12 command=0x10 repeat=1')).toMatchObject({
      protocol: 'NEC', address: 12, command: 16, repeat: true,
    })
    expect(parseIrLearnLine('FLS_IR v=2 protocol=NEC address=1 command=1 repeat=0')).toBeNull()
    expect(parseIrLearnLine('FLS_IR v=1 protocol=raw address=1 command=1 repeat=0')).toBeNull()
    expect(parseIrLearnLine('FLS_IR v=1 protocol=NEC address=-1 command=1 repeat=0')).toBeNull()
    expect(parseIrLearnLine(`${'F'.repeat(300)}`)).toBeNull()
  })
})
