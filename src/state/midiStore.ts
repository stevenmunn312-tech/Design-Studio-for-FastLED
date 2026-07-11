import { create } from 'zustand'
import { MidiEngine } from '../midi/midiEngine'

interface MidiState {
  supported: boolean
  active: boolean
  noteVelocity: Map<number, number>
  ccValues: Map<number, number>
}

// Zustand bridge over MidiEngine.instance, mirroring useAudioStore's pattern
// over AudioEngine — the evaluator reads this via getState() rather than a
// React subscription, and the on-node status readout subscribes normally.
export const useMidiStore = create<MidiState>()((set) => {
  MidiEngine.instance.subscribe((snapshot) => set(snapshot))

  return {
    supported: false,
    active: false,
    noteVelocity: new Map(),
    ccValues: new Map(),
  }
})
