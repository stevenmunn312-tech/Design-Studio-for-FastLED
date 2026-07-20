import { useEffect, useState } from 'react'
import { useGraphStore } from '../../state/graphStore'
import { usePerformanceDeckSession } from '../../state/performanceDeckSessionStore'
import { interpolateScene, RESERVED_COMBOS, serializeKeyCombo } from '../../state/performanceDeck'
import { useUiStore } from '../../state/uiStore'
import { MidiEngine } from '../../midi/midiEngine'
import DeckKnob from './DeckKnob'
import styles from './PerformanceDeck.module.css'

/** The Performance Control Deck panel: pinned knobs/faders, parameter
 *  scenes, scene morph, and MIDI/keyboard binding capture. Dockable rather
 *  than a blocking modal — the graph/preview stay visible behind it. */
export default function PerformanceDeck() {
  const nodes = useGraphStore((s) => s.nodes)
  const deck = useGraphStore((s) => s.performanceDeck)
  const unpinProperty = useGraphStore((s) => s.unpinProperty)
  const updateNodeProperty = useGraphStore((s) => s.updateNodeProperty)
  const saveScene = useGraphStore((s) => s.saveScene)
  const updateScene = useGraphStore((s) => s.updateScene)
  const deleteScene = useGraphStore((s) => s.deleteScene)
  const recallScene = useGraphStore((s) => s.recallScene)
  const panic = useGraphStore((s) => s.panic)
  const restorePanic = useGraphStore((s) => s.restorePanic)
  const panicActive = useGraphStore((s) => s.panicActive)
  const addMidiBinding = useGraphStore((s) => s.addMidiBinding)
  const addKeyBinding = useGraphStore((s) => s.addKeyBinding)
  const setStatus = useUiStore((s) => s.setStatus)

  const setDeckOpen = usePerformanceDeckSession((s) => s.setDeckOpen)
  const midiLearnTarget = usePerformanceDeckSession((s) => s.midiLearnTarget)
  const startMidiLearn = usePerformanceDeckSession((s) => s.startMidiLearn)
  const cancelMidiLearn = usePerformanceDeckSession((s) => s.cancelMidiLearn)
  const keyLearnAction = usePerformanceDeckSession((s) => s.keyLearnAction)
  const startKeyLearn = usePerformanceDeckSession((s) => s.startKeyLearn)
  const cancelKeyLearn = usePerformanceDeckSession((s) => s.cancelKeyLearn)
  const morphSceneA = usePerformanceDeckSession((s) => s.morphSceneA)
  const morphSceneB = usePerformanceDeckSession((s) => s.morphSceneB)
  const morphProgress = usePerformanceDeckSession((s) => s.morphProgress)
  const setMorphScenes = usePerformanceDeckSession((s) => s.setMorphScenes)
  const setMorphProgress = usePerformanceDeckSession((s) => s.setMorphProgress)

  const [sceneName, setSceneName] = useState('')

  const nodeById = new Map(nodes.map((n) => [n.id, n]))
  const output = nodes.find((n) => n.data.nodeType === 'MatrixOutput')
  const brightnessPin = deck.pins.find((p) => p.nodeId === output?.id && p.propertyKey === 'brightness')

  // ── MIDI-learn capture: consume the next raw CC/note while armed ────────
  useEffect(() => {
    if (!midiLearnTarget) return
    const unsub = MidiEngine.instance.subscribeRaw((event) => {
      addMidiBinding({
        target: midiLearnTarget.kind === 'pin'
          ? { kind: 'pin', pinId: midiLearnTarget.pinId! }
          : midiLearnTarget.kind === 'morph'
            ? { kind: 'morph' }
            : { kind: 'action', action: midiLearnTarget.action! },
        message: event.kind,
        channel: event.channel,
        number: event.number,
      })
      cancelMidiLearn()
      setStatus(`Learned ${event.kind === 'cc' ? 'CC' : 'note'} ${event.number} (channel ${event.channel + 1})`, 'success')
    })
    return unsub
  }, [midiLearnTarget, addMidiBinding, cancelMidiLearn, setStatus])

  // ── Keyboard-binding capture: consume the next keydown while armed ──────
  useEffect(() => {
    if (!keyLearnAction) return
    const handler = (e: KeyboardEvent) => {
      const combo = serializeKeyCombo(e)
      if (!combo) return // a bare modifier keypress — keep listening
      e.preventDefault()
      // Capture-phase + stopImmediatePropagation: this keystroke is being
      // *recorded* as a binding, not triggering one — the App-level bubble-
      // phase handler must never also see it (else binding "F7" to Panic
      // would fire Panic immediately, the instant it's bound).
      e.stopImmediatePropagation()
      if (RESERVED_COMBOS.has(combo) || deck.keyBindings.some((b) => b.combo === combo)) {
        setStatus(`"${combo}" is already bound — try another key`, 'error')
        cancelKeyLearn()
        return
      }
      addKeyBinding({ combo, action: keyLearnAction })
      cancelKeyLearn()
      setStatus(`Bound "${combo}"`, 'success')
    }
    window.addEventListener('keydown', handler, { capture: true })
    return () => window.removeEventListener('keydown', handler, { capture: true })
  }, [keyLearnAction, deck.keyBindings, addKeyBinding, cancelKeyLearn, setStatus])

  // ── Scene morph: interpolate on any change to progress or the A/B pair ──
  useEffect(() => {
    if (!morphSceneA || !morphSceneB) return
    const a = deck.scenes.find((sc) => sc.id === morphSceneA)
    const b = deck.scenes.find((sc) => sc.id === morphSceneB)
    if (!a || !b) return
    const values = interpolateScene(a, b, morphProgress, deck.pins)
    for (const [pinId, value] of Object.entries(values)) {
      const pin = deck.pins.find((p) => p.id === pinId)
      if (pin) updateNodeProperty(pin.nodeId, pin.propertyKey, value)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [morphSceneA, morphSceneB, morphProgress])

  return (
    <section className={styles.deck} aria-label="Performance control deck">
      <header className={styles.header}>
        <div className={styles.headerTitle}>
          <span>Performance Deck</span>
          <button type="button" className={styles.closeBtn} onClick={() => setDeckOpen(false)} aria-label="Close performance deck">×</button>
        </div>
        <div className={styles.headerControls}>
          <button
            type="button"
            className={`${styles.panicBtn} ${panicActive ? styles.panicActive : ''}`}
            onClick={panicActive ? restorePanic : panic}
          >
            {panicActive ? '● Restore' : '⏻ PANIC'}
          </button>
          {output && (
            <div className={styles.brightnessRow}>
              <span>Master Brightness</span>
              <input
                className="nodrag"
                type="range"
                min={0}
                max={255}
                step={1}
                value={Number(output.data.properties.brightness ?? 200)}
                onChange={(e) => updateNodeProperty(output.id, 'brightness', Number(e.target.value))}
              />
              <span>{String(output.data.properties.brightness ?? 200)}</span>
              {!brightnessPin && <span className={styles.hint}>(pin this from the node to save/morph it)</span>}
            </div>
          )}
        </div>
      </header>

      <div className={styles.body}>
        <div className={styles.grid}>
          {deck.pins.length === 0 && (
            <p className={styles.empty}>No pinned controls yet — click the 📌 next to a property on any node to add it here.</p>
          )}
          {deck.pins.map((pin) => {
            const node = nodeById.get(pin.nodeId)
            if (!node) {
              return (
                <div key={pin.id} className={styles.knobMissing}>
                  <span>{pin.label} — not in this graph</span>
                  <button type="button" onClick={() => unpinProperty(pin.id)}>Unpin</button>
                </div>
              )
            }
            return (
              <DeckKnob
                key={pin.id}
                pin={pin}
                value={node.data.properties[pin.propertyKey]}
                onChange={(value) => updateNodeProperty(pin.nodeId, pin.propertyKey, value)}
                onLearnMidi={() => startMidiLearn({ kind: 'pin', pinId: pin.id })}
                onUnpin={() => unpinProperty(pin.id)}
                learning={midiLearnTarget?.kind === 'pin' && midiLearnTarget.pinId === pin.id}
              />
            )
          })}
        </div>

        <div className={styles.scenesSection}>
          <h3>Scenes</h3>
          <div className={styles.sceneSave}>
            <input
              className="nodrag"
              type="text"
              placeholder="Scene name"
              value={sceneName}
              onChange={(e) => setSceneName(e.target.value)}
            />
            <button
              type="button"
              disabled={deck.pins.length === 0 || !sceneName.trim()}
              onClick={() => { saveScene(sceneName); setSceneName('') }}
            >
              Save current as scene
            </button>
          </div>
          <ul className={styles.sceneList}>
            {deck.scenes.map((scene) => (
              <li key={scene.id} className={styles.sceneRow}>
                <span>{scene.name}</span>
                <div className={styles.sceneActions}>
                  <button type="button" onClick={() => recallScene(scene.id)}>Recall</button>
                  <button type="button" onClick={() => updateScene(scene.id)}>Update</button>
                  <button
                    type="button"
                    onClick={() => startKeyLearn({ type: 'recallScene', sceneId: scene.id })}
                    className={keyLearnAction?.type === 'recallScene' && keyLearnAction.sceneId === scene.id ? styles.knobLearnActive : ''}
                  >
                    {keyLearnAction?.type === 'recallScene' && keyLearnAction.sceneId === scene.id ? 'Press a key…' : 'Bind key'}
                  </button>
                  <button type="button" onClick={() => deleteScene(scene.id)} aria-label={`Delete scene ${scene.name}`}>×</button>
                </div>
              </li>
            ))}
            {deck.scenes.length === 0 && <li className={styles.empty}>No saved scenes yet.</li>}
          </ul>
        </div>

        {deck.scenes.length >= 2 && (
          <div className={styles.morphSection}>
            <h3>Morph</h3>
            <div className={styles.morphPickers}>
              <select className="nodrag" value={morphSceneA ?? ''} onChange={(e) => setMorphScenes(e.target.value || null, morphSceneB)}>
                <option value="">— Scene A —</option>
                {deck.scenes.map((sc) => <option key={sc.id} value={sc.id}>{sc.name}</option>)}
              </select>
              <select className="nodrag" value={morphSceneB ?? ''} onChange={(e) => setMorphScenes(morphSceneA, e.target.value || null)}>
                <option value="">— Scene B —</option>
                {deck.scenes.map((sc) => <option key={sc.id} value={sc.id}>{sc.name}</option>)}
              </select>
            </div>
            <input
              className="nodrag"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={morphProgress}
              disabled={!morphSceneA || !morphSceneB}
              onChange={(e) => setMorphProgress(Number(e.target.value))}
            />
            <button
              type="button"
              onClick={() => startMidiLearn({ kind: 'morph' })}
              className={midiLearnTarget?.kind === 'morph' ? styles.knobLearnActive : ''}
              disabled={!morphSceneA || !morphSceneB}
            >
              {midiLearnTarget?.kind === 'morph' ? 'Listening…' : 'Learn MIDI fader'}
            </button>
          </div>
        )}

        <div className={styles.panicBindSection}>
          <button
            type="button"
            onClick={() => startMidiLearn({ kind: 'action', action: { type: 'panic' } })}
            className={midiLearnTarget?.kind === 'action' && midiLearnTarget.action?.type === 'panic' ? styles.knobLearnActive : ''}
          >
            {midiLearnTarget?.kind === 'action' && midiLearnTarget.action?.type === 'panic' ? 'Listening…' : 'Learn MIDI for Panic'}
          </button>
          <button
            type="button"
            onClick={() => startKeyLearn({ type: 'panic' })}
            className={keyLearnAction?.type === 'panic' ? styles.knobLearnActive : ''}
          >
            {keyLearnAction?.type === 'panic' ? 'Press a key…' : 'Bind key for Panic'}
          </button>
        </div>
      </div>
    </section>
  )
}
