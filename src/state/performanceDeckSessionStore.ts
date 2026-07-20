// Transient, per-session state for the Performance Control Deck: whether the
// panel is open, what (if anything) MIDI-learn / keyboard-bind capture is
// currently armed for, and live scene-morph crossfade position.
//
// Deliberately never persisted — mirrors uiStore's `performanceMode`/
// `stageMode` rule ("a previous session must not reopen with the editing
// chrome unexpectedly hushed"; here, must not reopen mid-MIDI-learn or
// mid-morph). Kept as its own small store rather than folded into uiStore or
// graphStore: morph progress and drag position change at high frequency, and
// colocating them with either of those broad-subscriber stores would cause
// unrelated UI (menu bar, canvas, inspector) to re-render on every tick.

import { create } from 'zustand'
import type { DeckActionId } from './performanceDeck'

export interface MidiLearnTarget {
  kind: 'pin' | 'action' | 'morph'
  pinId?: string
  action?: DeckActionId
}

interface PerformanceDeckSessionState {
  deckOpen: boolean
  toggleDeck: () => void
  setDeckOpen: (open: boolean) => void

  /** Non-null while "Learn" is armed for a specific target; the next raw
   *  MIDI event MidiEngine delivers consumes it and clears this. */
  midiLearnTarget: MidiLearnTarget | null
  startMidiLearn: (target: MidiLearnTarget) => void
  cancelMidiLearn: () => void

  /** Non-null while a keyboard-binding capture is armed — the next keydown
   *  becomes the combo, mirroring midiLearnTarget. */
  keyLearnAction: DeckActionId | null
  startKeyLearn: (action: DeckActionId) => void
  cancelKeyLearn: () => void

  /** The two scenes currently loaded into the morph crossfader's A/B slots,
   *  and the live 0..1 progress between them. Not persisted — a fresh deck
   *  session always starts unmorphed. */
  morphSceneA: string | null
  morphSceneB: string | null
  morphProgress: number
  setMorphScenes: (a: string | null, b: string | null) => void
  setMorphProgress: (t: number) => void
}

export const usePerformanceDeckSession = create<PerformanceDeckSessionState>((set) => ({
  deckOpen: false,
  toggleDeck: () => set((s) => ({ deckOpen: !s.deckOpen })),
  setDeckOpen: (open) => set({ deckOpen: open }),

  midiLearnTarget: null,
  startMidiLearn: (target) => set({ midiLearnTarget: target }),
  cancelMidiLearn: () => set({ midiLearnTarget: null }),

  keyLearnAction: null,
  startKeyLearn: (action) => set({ keyLearnAction: action }),
  cancelKeyLearn: () => set({ keyLearnAction: null }),

  morphSceneA: null,
  morphSceneB: null,
  morphProgress: 0,
  setMorphScenes: (a, b) => set({ morphSceneA: a, morphSceneB: b }),
  setMorphProgress: (t) => set({ morphProgress: Math.max(0, Math.min(1, t)) }),
}))
