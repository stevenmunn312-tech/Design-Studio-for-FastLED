// Dispatch helpers shared by the two places a performance-deck binding can
// fire from: the always-mounted MIDI bridge (App.tsx) and the global keydown
// handler's user-keybinding lookup (App.tsx). Kept out of the UI component
// so both call sites — one MIDI-driven, one keyboard-driven — share the same
// action-resolution logic without importing React.

import { useGraphStore } from '../graphStore'
import { usePerformanceDeckSession } from './performanceDeckSessionStore'
import { interpolateScene, scaleMidiValueToPin, type DeckActionId } from './performanceDeck'

export function dispatchDeckAction(action: DeckActionId) {
  const { performanceDeck, updateNodeProperty, recallScene, panic, restorePanic, panicActive, nodes } = useGraphStore.getState()
  if (action.type === 'panic') {
    if (panicActive) restorePanic()
    else panic()
  } else if (action.type === 'recallScene') {
    recallScene(action.sceneId)
  } else if (action.type === 'pinNudge') {
    const pin = performanceDeck.pins.find((p) => p.id === action.pinId)
    if (!pin) return
    const node = nodes.find((n) => n.id === pin.nodeId)
    const current = Number(node?.data.properties[pin.propertyKey] ?? 0)
    updateNodeProperty(pin.nodeId, pin.propertyKey, current + action.delta)
  }
}

/** Push the morph crossfader's position into the graph: every pin both
 *  scenes hold takes the value interpolated between them. This is the one
 *  owner of that step — the deck panel only displays the crossfader, so a
 *  MIDI fader bound to the morph keeps moving the graph with the panel
 *  closed, which is why the session store's setters are reached through
 *  `setMorphProgress`/`setMorphScenes` below rather than called directly. */
export function applySceneMorph() {
  const { morphSceneA, morphSceneB, morphProgress } = usePerformanceDeckSession.getState()
  if (!morphSceneA || !morphSceneB) return
  const { performanceDeck, updateNodeProperty } = useGraphStore.getState()
  const a = performanceDeck.scenes.find((sc) => sc.id === morphSceneA)
  const b = performanceDeck.scenes.find((sc) => sc.id === morphSceneB)
  if (!a || !b) return
  const values = interpolateScene(a, b, morphProgress, performanceDeck.pins)
  for (const [pinId, value] of Object.entries(values)) {
    const pin = performanceDeck.pins.find((p) => p.id === pinId)
    if (pin) updateNodeProperty(pin.nodeId, pin.propertyKey, value)
  }
}

export function setMorphProgress(t: number) {
  usePerformanceDeckSession.getState().setMorphProgress(t)
  applySceneMorph()
}

export function setMorphScenes(a: string | null, b: string | null) {
  usePerformanceDeckSession.getState().setMorphScenes(a, b)
  applySceneMorph()
}

/** Apply an incoming raw MIDI event to whatever it's bound to — a pin's
 *  value, the scene-morph crossfader, or a named deck action. Bindings must
 *  keep working even while the deck panel is closed (a footswitch bound to
 *  Panic shouldn't require the panel open), so this is driven by an
 *  always-mounted subscriber, not the panel component itself. */
export function applyMidiEventToBindings(event: { kind: 'cc' | 'note'; channel: number; number: number; value: number }) {
  const { performanceDeck, updateNodeProperty } = useGraphStore.getState()
  const binding = performanceDeck.midiBindings.find(
    (b) => b.message === event.kind && b.channel === event.channel && b.number === event.number
  )
  if (!binding) return
  const target = binding.target
  if (target.kind === 'pin') {
    const pin = performanceDeck.pins.find((p) => p.id === target.pinId)
    if (pin) updateNodeProperty(pin.nodeId, pin.propertyKey, scaleMidiValueToPin(pin, event.value))
  } else if (target.kind === 'morph') {
    setMorphProgress(event.value)
  } else if (target.kind === 'action') {
    dispatchDeckAction(target.action)
  }
}
