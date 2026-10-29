import { afterEach, describe, expect, it, vi } from 'vitest'
import { MidiEngine, type MidiSnapshot } from '../midiEngine'

// A Web MIDI stand-in: the access object the browser hands back, with one
// connected input and the statechange hook the engine installs.
function fakeAccess() {
  const input = { onmidimessage: null as ((e: { data: Uint8Array }) => void) | null, state: 'connected', type: 'input' }
  const access = {
    inputs: new Map([['in-1', input]]),
    onstatechange: null as ((event: { port: { state: string; type: string } | null }) => void) | null,
  }
  return { access, input }
}

async function settle() {
  // The engine's request chains then/catch/finally; three ticks drain them.
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

afterEach(() => vi.unstubAllGlobals())

describe('MidiEngine access lifecycle', () => {
  it('asks for MIDI access again after a denied request', async () => {
    const requestMIDIAccess = vi.fn()
      .mockRejectedValueOnce(new Error('denied'))
      .mockResolvedValueOnce(fakeAccess().access)
    vi.stubGlobal('navigator', { requestMIDIAccess })
    const engine = new MidiEngine()
    const snapshots: MidiSnapshot[] = []

    engine.subscribe((snapshot) => snapshots.push(snapshot))()
    await settle()
    expect(requestMIDIAccess).toHaveBeenCalledTimes(1)
    expect(snapshots.at(-1)?.active).toBe(false)

    engine.subscribe((snapshot) => snapshots.push(snapshot))
    await settle()
    expect(requestMIDIAccess).toHaveBeenCalledTimes(2)
    expect(snapshots.at(-1)?.active).toBe(true)
  })

  it('shares one pending request between subscribers and none once granted', async () => {
    const requestMIDIAccess = vi.fn().mockResolvedValue(fakeAccess().access)
    vi.stubGlobal('navigator', { requestMIDIAccess })
    const engine = new MidiEngine()
    engine.subscribe(() => {})
    engine.subscribeRaw(() => {})
    await settle()
    engine.subscribe(() => {})
    expect(requestMIDIAccess).toHaveBeenCalledTimes(1)
  })

  it('releases every held note when a device disconnects', async () => {
    const { access, input } = fakeAccess()
    vi.stubGlobal('navigator', { requestMIDIAccess: vi.fn().mockResolvedValue(access) })
    const engine = new MidiEngine()
    const snapshots: MidiSnapshot[] = []
    engine.subscribe((snapshot) => snapshots.push(snapshot))
    await settle()

    input.onmidimessage!({ data: new Uint8Array([0x90, 60, 100]) })
    expect(snapshots.at(-1)?.noteVelocity.get(60)).toBeCloseTo(100 / 127)

    access.onstatechange!({ port: { state: 'disconnected', type: 'input' } })
    expect(snapshots.at(-1)?.noteVelocity.get(60)).toBe(0)
  })
})
