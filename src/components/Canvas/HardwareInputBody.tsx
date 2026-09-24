import { useCallback, useRef } from 'react'
import { useHardwareInputStore } from '../../state/hardwareInputStore'
import { powerMonitorPreviewDefaults, powerMonitorPreviewKey, powerMonitorPreviewReading } from '../../state/powerMonitor'
import styles from './HardwareInputBody.module.css'

// Live preview widgets for the ButtonInput/PotInput/EncoderInput stub nodes —
// a pressable button, a draggable slider, and a spin-to-turn dial — so a
// design can be played with in the browser the same way MicInput reads a
// real microphone. Writes go straight into hardwareInputStore (transient
// run-state, not a saved node property) and graphEvaluator reads them back
// via getState() on the next frame.

function ButtonInputWidget({ nodeId }: { nodeId: string }) {
  const pressed = useHardwareInputStore((s) => s.button.get(nodeId) ?? false)
  const setButton = useHardwareInputStore((s) => s.setButton)

  return (
    <button
      type="button"
      className={`nodrag ${styles.button} ${pressed ? styles.buttonPressed : ''}`}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setButton(nodeId, true) }}
      onPointerUp={() => setButton(nodeId, false)}
      onPointerCancel={() => setButton(nodeId, false)}
      onPointerLeave={() => setButton(nodeId, false)}
    >
      {pressed ? 'PRESSED' : 'press'}
    </button>
  )
}

function PotInputWidget({ nodeId, storeKey = nodeId, initial = 0.5, readout }: {
  nodeId: string
  /** Run-state key; a node with several sliders gives each its own. */
  storeKey?: string
  initial?: number
  /** Formats the readout in the quantity's own units. */
  readout?: (value: number) => string
}) {
  const value = useHardwareInputStore((s) => s.pot.get(storeKey) ?? initial)
  const setPot = useHardwareInputStore((s) => s.setPot)
  const trackRef = useRef<HTMLDivElement>(null)

  const setFromClientX = useCallback((clientX: number) => {
    const track = trackRef.current
    if (!track) return
    const rect = track.getBoundingClientRect()
    const t = rect.width > 0 ? (clientX - rect.left) / rect.width : 0
    setPot(storeKey, Math.max(0, Math.min(1, t)))
  }, [storeKey, setPot])

  return (
    <div className={styles.potRow}>
      <div
        ref={trackRef}
        className={`nodrag ${styles.potTrack}`}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          setFromClientX(e.clientX)
        }}
        onPointerMove={(e) => { if (e.buttons & 1) setFromClientX(e.clientX) }}
      >
        <div className={styles.potFill} style={{ width: `${value * 100}%` }} />
        <div className={styles.potThumb} style={{ left: `${value * 100}%` }} />
      </div>
      <span className={styles.potReadout}>{readout ? readout(value) : value.toFixed(2)}</span>
    </div>
  )
}

/**
 * A power monitor has no sensor in the browser, so the preview takes the two
 * things it measures from sliders across the part's own range. Watts is not a
 * third slider: the firmware derives it from these two, and so does preview.
 */
function PowerMonitorWidget({ nodeId, partId }: { nodeId: string; partId: unknown }) {
  const start = powerMonitorPreviewDefaults(partId)
  const units = (fraction: number, quantity: 'volts' | 'amps') => {
    const reading = powerMonitorPreviewReading(partId, quantity === 'volts' ? fraction : 0, quantity === 'amps' ? fraction : 0)
    return quantity === 'volts' ? `${reading.volts.toFixed(1)} V` : `${reading.amps.toFixed(2)} A`
  }
  return (
    <>
      <PotInputWidget nodeId={nodeId} storeKey={powerMonitorPreviewKey(nodeId, 'volts')} initial={start.volts}
        readout={(v) => units(v, 'volts')} />
      <PotInputWidget nodeId={nodeId} storeKey={powerMonitorPreviewKey(nodeId, 'amps')} initial={start.amps}
        readout={(v) => units(v, 'amps')} />
    </>
  )
}

// Dragging vertically spins the dial (up = increase, matching a mouse-look
// feel); a click without much movement is treated as a tap of the encoder's
// integrated push-button (pinSW), pulsed briefly like a real momentary switch.
const ENCODER_DRAG_SENSITIVITY = 0.5
const ENCODER_CLICK_THRESHOLD_PX = 4
const ENCODER_TAP_MS = 120

function EncoderInputWidget({ nodeId, resetOnPress }: { nodeId: string; resetOnPress: boolean }) {
  const position = useHardwareInputStore((s) => s.encoder.get(nodeId)?.position ?? 0)
  const pressed = useHardwareInputStore((s) => s.encoder.get(nodeId)?.pressed ?? false)
  const setEncoder = useHardwareInputStore((s) => s.setEncoder)
  const dragRef = useRef<{ lastY: number; moved: number } | null>(null)

  const angle = ((position % 12) / 12) * 360

  return (
    <div className={styles.encoderRow}>
      <div
        className={`nodrag ${styles.encoderDial} ${pressed ? styles.encoderDialPressed : ''}`}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          dragRef.current = { lastY: e.clientY, moved: 0 }
        }}
        onPointerMove={(e) => {
          const drag = dragRef.current
          if (!drag || !(e.buttons & 1)) return
          const dy = drag.lastY - e.clientY
          drag.lastY = e.clientY
          drag.moved += Math.abs(dy)
          if (dy !== 0) setEncoder(nodeId, { position: position + dy * ENCODER_DRAG_SENSITIVITY })
        }}
        onPointerUp={() => {
          const drag = dragRef.current
          dragRef.current = null
          if (drag && drag.moved < ENCODER_CLICK_THRESHOLD_PX) {
            setEncoder(nodeId, resetOnPress ? { pressed: true, position: 0 } : { pressed: true })
            setTimeout(() => setEncoder(nodeId, { pressed: false }), ENCODER_TAP_MS)
          }
        }}
        onPointerCancel={() => { dragRef.current = null }}
        title="Drag to turn, click to press"
      >
        <div className={styles.encoderNotch} style={{ transform: `rotate(${angle}deg)` }} />
      </div>
      <span className={styles.potReadout}>{Math.round(position)}</span>
    </div>
  )
}

export default function HardwareInputBody({ nodeId, nodeType, resetOnPress = false, partId }: { nodeId: string; nodeType: string; resetOnPress?: boolean; partId?: unknown }) {
  if (nodeType === 'PowerMonitorInput') return <PowerMonitorWidget nodeId={nodeId} partId={partId} />
  if (nodeType === 'ButtonInput') return <ButtonInputWidget nodeId={nodeId} />
  if (nodeType === 'PotInput') return <PotInputWidget nodeId={nodeId} />
  // Same two widgets, same two run-state maps — see the evaluator's note.
  if (nodeType === 'MotionInput') return <ButtonInputWidget nodeId={nodeId} />
  if (nodeType === 'LightInput') return <PotInputWidget nodeId={nodeId} />
  if (nodeType === 'EncoderInput') return <EncoderInputWidget nodeId={nodeId} resetOnPress={resetOnPress} />
  return null
}
