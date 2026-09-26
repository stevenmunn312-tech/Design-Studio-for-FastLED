import { useAudioStore } from '../../state/audioStore'
import { useDmxStore } from '../../state/dmxStore'
import { useHardwareInputStore } from '../../state/hardwareInputStore'
import {
  powerMonitorPreviewDefaults,
  powerMonitorPreviewReading,
  powerMonitorPreviewKey,
} from '../../state/powerMonitor'
import { presencePreviewReading, presencePreviewKey, presencePreviewDefaultDistance } from '../../state/presenceSensor'
import { lightSensorPreviewReading } from '../../state/lightSensor'
import { useTransportDisplayTouchStore } from '../../state/transportDisplayTouchStore'
import { useDisplayRuntimeStore } from '../../state/displayRuntimeStore'
import { designControlBundle } from '../../state/designControlBundle'
import { parseDisplayWidgetPortId, displayControlStartValue } from '../../state/displayRegistry'
import { useMidiStore } from '../../state/midiStore'
import { blankDmxSnapshot } from '../../state/dmx'
import {
  type IrPreviewMemory,
  normalizeIrRemoteButtons,
  stepIrRemotePreview,
  blankIrRepeatState,
  irRemoteButtonHandle,
} from '../../state/irRemote'
import { rtcPreviewSnapshot } from '../../state/rtc'
import {
  type TransportDisplayLayout,
  shownDesignId,
  asTransportDisplayLayout,
  transportLayoutForKind,
} from '../../state/transportDisplay'
import { type TftController, type TftRotation, TFT_CONTROLLERS, asTftRotation } from '../../state/tftSurface'
import {
  touchRegionAt,
  transportTouchRegions,
  type TransportTouchAction,
  TRANSPORT_TOUCH_ACTION_TYPES,
} from '../../state/transportTouch'
import { displayHasTouch } from '../../state/partCatalogue'
import { useGraphStore } from '../../state/graphStore'
import { isDisplaySignal, type DisplaySignal } from '../../state/displaySignal'
import { tftControllerForProps } from '../../state/nodeLibrary'
import { resolveAudioCapabilitySource } from '../../state/audioCapabilities'
import { useDecoderAudioStore } from '../../state/decoderAudioStore'
import { resolveStorageCapabilitySource } from '../../state/storageCapabilities'
import { normalizeButtonBankEntries, buttonBankHandle } from '../../state/buttonBank'
import { clamp01 } from '../../state/evaluator/frames'
import { markStateUsed, stateClock, instanceState } from '../../state/evaluator/memory'
import { blankPlayerControls } from '../../state/evaluator/signals'
import type { PlayerControls, AudioSignal, PortValue, NodeEvaluators } from '../../state/evaluator/types'

const irPreviewState = instanceState('irPreviewState', new Map<string, IrPreviewMemory>())

interface RtcManualPreviewState {
  signature: string
  anchorT: number
  lastT: number
}
// A Manual RTC seed starts when that seed becomes active. The global preview
// clock may already have been running for minutes when the user edits the
// fields, so feeding its absolute time straight into rtcPreviewSnapshot would
// make a newly-entered seed jump forward by the age of the whole preview.
const rtcManualPreviewState = instanceState('rtcManualPreviewState', new Map<string, RtcManualPreviewState>())

const transportDisplayTouchState = instanceState('transportDisplayTouchState', new Map<string, { pressed: boolean }>())
/** Per Touch node: each bundled widget's last press value or gesture count. */
const designBundleState = instanceState('designBundleState', new Map<string, Map<string, number | boolean>>())

/**
 * What a finger on a panel's glass is doing, as a controls bundle.
 *
 * Shared because two nodes need the same answer from opposite sides: the Touch
 * node publishes it, and the panel's own Diagnostics screen draws it. The edge
 * rules are the firmware's — a momentary action fires once on the touch-down
 * edge, an absolute slider tracks for as long as the finger stays down — so a
 * held finger cannot fire a button every evaluator tick here and once on the
 * device.
 */
function panelTouchControls(
  touchKey: string,
  panelNodeId: string,
  controller: TftController,
  rotation: TftRotation,
  layout: TransportDisplayLayout,
  live: boolean,
): PlayerControls {
  const controls = blankPlayerControls()
  const touch = useTransportDisplayTouchStore.getState().touches.get(panelNodeId)
  const pressed = live && Boolean(touch?.pressed)
  const previousTouch = transportDisplayTouchState.get(touchKey) ?? { pressed: false }
  const hit = pressed && touch
    ? touchRegionAt(touch, transportTouchRegions(controller, rotation, layout))
    : null
  if (hit?.action === 'volume' && hit.value != null) controls.volume = hit.value
  if (hit?.action === 'brightness' && hit.value != null) controls.brightness = hit.value
  if (pressed && !previousTouch.pressed && hit) {
    if (hit.action === 'playPause') controls.playPause = true
    else if (hit.action === 'previous') controls.previous = true
    else if (hit.action === 'next') controls.next = true
    else if (hit.action === 'ledToggle') controls.ledToggle = true
  }
  previousTouch.pressed = pressed
  transportDisplayTouchState.set(touchKey, previousTouch)
  return controls
}

function liveAudioSignal(kind: 'microphone' | 'line-in' | 'decoder'): AudioSignal {
  return kind === 'decoder' ? useDecoderAudioStore.getState() : useAudioStore.getState()
}

export const INPUT_EVALUATORS: NodeEvaluators = {
  Audio({ audioOverride, capabilityNodes }, _id, props) {
    // One authored choice maps both environments: microphone/line-in use
    // browser capture in-app and their physical input on hardware; decoder
    // uses the in-app music player here and the hardware player there.
    const source = resolveAudioCapabilitySource(capabilityNodes, props.sourceId)
    return { audio: source ? (audioOverride ?? liveAudioSignal(source.kind)) : null }
  },
  Storage({ capabilityNodes }, _id, props) {
    const source = resolveStorageCapabilitySource(capabilityNodes, props.sourceId)
    return { storage: source ? { id: source.id, kind: source.kind, label: source.label } : null }
  },
  /*
     * The glass in front of a Display Panel.
     *
     * Reads the panel it belongs to rather than a wire: the two nodes are one
     * physical module, and a press means nothing without the panel's size,
     * rotation and the screen it is currently drawing. A panel switched off
     * reads no touch at all, which is the same rule the firmware applies.
     */
  TouchInput({ input, stateKey, incoming, nodeMap, nodes, edges }, _id, props, node) {
    let out: Record<string, PortValue> = {}
    const panel = nodeMap.get(String(props.panelId ?? ''))
    if (!panel || panel.data.nodeType !== 'TransportDisplay') {
      return { controls: blankPlayerControls() }
    }
    const panelId = panel.id
    const panelProps = panel.data.properties as Record<string, unknown>
    const panelEnabled = incoming.has(`${panelId}:enabled`)
      ? Boolean(input(panelId, 'enabled', true))
      : panelProps.enabled !== false
    const touchCapable = displayHasTouch(String(panelProps.partId ?? ''))
    /*
     * A panel drawing a screen design has no fixed layout to sample.
     *
     * Its widgets own the touch and publish on their own outputs, so this
     * node reports nothing rather than the hit regions of a layout the
     * glass is not showing. The combination is not exotic: a design reads
     * the source wired into its panel, so a Now Playing design sits on a
     * panel with a Music Player on its Display input — exactly the shape
     * that would otherwise resolve to the fixed Now Playing layout and
     * hand back its play/pause and volume regions.
     */
    // Showing, not merely having: a design set aside for a fixed layout
    // leaves its widget outputs at rest and the fixed layout's touch live.
    const designId = shownDesignId(panelProps)
    if (designId) {
      const live = panelEnabled && touchCapable
      const runtime = useDisplayRuntimeStore.getState()
      const widgetOutputs = ((node.data.outputs as { id: string; dataType?: string }[] | undefined) ?? [])
        .filter((port) => parseDisplayWidgetPortId(port.id))
      const samples: Record<string, PortValue> = {}
      const shownDocument = useGraphStore.getState().displayDocuments[designId]
      for (const port of widgetOutputs) {
        const parsed = parseDisplayWidgetPortId(port.id)!
        // A ranged control rests where it starts, the value the renderer
        // and the firmware also start it at, not at a bare zero.
        const restWidget = shownDocument?.widgets.find((entry) => entry.id === parsed.widgetId)
        const rest = port.dataType === 'bool'
          ? false
          : (restWidget ? displayControlStartValue(restWidget) : undefined) ?? 0
        samples[port.id] = live
          ? runtime.sampleDisplayWidgetOutput(designId, parsed.widgetId, rest)
          : rest
      }
      /*
       * The design's own transport, carried on Controls.
       *
       * Widgets whose template stamped a role (Previous, Play, Next,
       * Volume...) fold into the one bundle, so a Now Playing screen
       * drives a Music Player through a single wire. Which widget lands
       * on which field is `designControlBundle`'s answer, shared with the
       * generators so the device presses the same fields.
       */
      const controls = blankPlayerControls()
      const document = shownDocument
      const bundle = document ? designControlBundle(panel, document, nodes, edges, node.id) : []
      const edgeState = designBundleState.get(stateKey(node.id)) ?? new Map<string, number | boolean>()
      for (const control of bundle) {
        if (control.edge === 'level') {
          // A level commands nothing until a finger has moved it, or its
          // starting position would override the LED output's own level
          // or the player's volume the moment the screen is wired.
          const moved = (runtime.readDisplayWidget(designId, control.widgetId)?.touchCount ?? 0) > 0
          const value = Number(samples[control.portId] ?? 0)
          if (live && moved && Number.isFinite(value)) controls[control.field as 'volume' | 'brightness'] = clamp01(value)
          continue
        }
        // A press is the rising edge of the sampled Button; a tap is the
        // Toggle's gesture count moving, never its value (see the helper).
        const now = control.edge === 'press'
          ? Boolean(samples[control.portId])
          : runtime.readDisplayWidget(designId, control.widgetId)?.touchCount ?? 0
        const before = edgeState.get(control.widgetId)
        edgeState.set(control.widgetId, now)
        const fired = control.edge === 'press'
          ? now === true && before === false
          : before !== undefined && now !== before
        if (!live || !fired) continue
        if (control.field === 'patternPrevious') controls.patternSteps -= 1
        else if (control.field === 'patternNext') controls.patternSteps += 1
        else controls[control.field as 'playPause' | 'previous' | 'next' | 'patternConfirm' | 'ledToggle'] = true
      }
      designBundleState.set(stateKey(node.id), edgeState)
      return { controls, ...samples }
    }
    const panelController = tftControllerForProps(panelProps) ?? TFT_CONTROLLERS.ST7789
    const panelRotation = asTftRotation(panelProps.tftRotation)
    const panelSignalValue = input(panelId, 'display', null)
    const panelSignal = isDisplaySignal(panelSignalValue) ? panelSignalValue : null
    const panelLayout: TransportDisplayLayout =
      asTransportDisplayLayout(panelProps.tftLayout) === 'Diagnostics'
        ? 'Diagnostics'
        : (panelSignal ? transportLayoutForKind(panelSignal.kind, panelProps.tftLayout) : null) ?? 'Waiting'
    /*
     * Individual fixed-layout control outputs, one per touch action in
     * the current layout.
     *
     * Momentary actions (playPause, previous, next, ledToggle) fire on the
     * press edge only.  Continuous actions (volume, brightness) publish the
     * current 0-1 value while held and zero at rest.
     *
     * These sit beside the `controls` bundle so a Touch→property wire
     * needs no Control Map pass-through.
     */
    const touchKey = stateKey(panelId)
    const touch = useTransportDisplayTouchStore.getState().touches.get(panelId)
    const pressed = panelEnabled && touchCapable && Boolean(touch?.pressed)
    const wasPressed = Boolean(transportDisplayTouchState.get(touchKey)?.pressed)
    const hit = pressed && touch
      ? touchRegionAt(touch, transportTouchRegions(panelController, panelRotation, panelLayout))
      : null
    // Keyed on the panel, not on this node: the edge state belongs to the
    // glass, and it is the same glass however many nodes look at it.
    const controls = panelTouchControls(
      touchKey, panelId, panelController, panelRotation, panelLayout,
      panelEnabled && touchCapable,
    )
    out = { controls }
    const nodeOutputs = (node.data.outputs as { id: string; dataType?: string }[] | undefined) ?? []
    // A design set aside keeps its widget ports; they read at rest while
    // the fixed layout owns the glass.
    for (const port of nodeOutputs) {
      if (parseDisplayWidgetPortId(port.id)) out[port.id] = port.dataType === 'bool' ? false : 0
    }
    for (const port of nodeOutputs) {
      const action = port.id as TransportTouchAction
      if (!TRANSPORT_TOUCH_ACTION_TYPES[action]) continue
      if (port.dataType === 'bool') {
        out[action] = pressed && !wasPressed && hit?.action === action
      } else {
        out[action] = hit?.action === action && hit.value != null ? hit.value : 0
      }
    }
    return out
  },
  // Live values come from the on-node widget (ButtonInputBody/PotInputBody
  // /EncoderInputBody), written into hardwareInputStore on pointer
  // interaction — the same getState()-in-evalNode bridge useAudioStore
  // uses for MicInput. Falls back to the old inert defaults when the
  // widget hasn't been touched yet.
  ButtonInput(_c, id) {
    return { pressed: useHardwareInputStore.getState().button.get(id) ?? false }
  },
  ButtonBank(_c, id, props) {
    const buttons = normalizeButtonBankEntries(props.buttons)
    const live = useHardwareInputStore.getState().button
    return Object.fromEntries(buttons.map((button) => [
      buttonBankHandle(button.id),
      live.get(`${id}:${button.id}`) ?? false,
    ]))
  },
  IRRemoteInput({ stateKey }, id, props) {
    // Press/hold on the node is transient run-state. A rising press is one
    // decoded frame; staying down is a repeat, so `once` fires a single
    // pass and `held` keeps pulsing while the button is down.
    const buttons = normalizeIrRemoteButtons(props.buttons)
    const live = useHardwareInputStore.getState().button
    const key = markStateUsed(stateKey(id))
    const stepped = stepIrRemotePreview(
      irPreviewState.get(key) ?? { pressed: new Map(), repeat: blankIrRepeatState() },
      buttons,
      (buttonId) => live.get(`${id}:${buttonId}`) ?? false,
      stateClock(),
    )
    irPreviewState.set(key, stepped.memory)
    return Object.fromEntries(buttons.map((button) => [
      irRemoteButtonHandle(button.id),
      stepped.active.has(button.id),
    ]))
  },
  PotInput(_c, id) {
    return { value: useHardwareInputStore.getState().pot.get(id) ?? 0.5 }
  },
  // The two sensor modules borrow the same two run-state maps: a PIR is a
  // boolean line like a button, an LDR an analog one like a knob. The maps
  // are keyed by node id, so sharing them cannot collide — and a second
  // pair holding exactly the same shapes would only be ceremony.
  MotionInput(_c, id) {
    return { motion: useHardwareInputStore.getState().button.get(id) ?? false }
  },
  LightInput(_c, id, props) {
    return { ...lightSensorPreviewReading(
      props.partId,
      useHardwareInputStore.getState().pot.get(id) ?? 0.5,
      props.maxLux,
    ) }
  },
  // No sensor in the browser: the node body's two sliders stand in for the
  // measured volts and amps, and watts follows from them the way the
  // firmware derives it.
  PowerMonitorInput(_c, id, props) {
    const pot = useHardwareInputStore.getState().pot
    const start = powerMonitorPreviewDefaults(props.partId)
    return { ...powerMonitorPreviewReading(
      props.partId,
      pot.get(powerMonitorPreviewKey(id, 'volts')) ?? start.volts,
      pot.get(powerMonitorPreviewKey(id, 'amps')) ?? start.amps,
    ) }
  },
  // The browser has no radar, so two latches model the module's moving and
  // stationary target bits and one slider supplies its detection distance.
  PresenceInput(_c, id, props) {
    const inputState = useHardwareInputStore.getState()
    return { ...presencePreviewReading(
      props.partId,
      inputState.button.get(presencePreviewKey(id, 'moving')) ?? false,
      inputState.button.get(presencePreviewKey(id, 'still')) ?? false,
      inputState.pot.get(presencePreviewKey(id, 'distance'))
        ?? presencePreviewDefaultDistance(props.partId),
    ) }
  },
  EncoderInput(_c, id) {
    const enc = useHardwareInputStore.getState().encoder.get(id)
    return { position: enc?.position ?? 0, pressed: enc?.pressed ?? false }
  },
  DMXInput(_c, _id, props) {
    const universe = Math.max(0, Math.min(32767, Math.round(Number(props.universe ?? 0))))
    const snapshot = useDmxStore.getState().snapshot
    return {
      dmx: snapshot.universe === universe
        ? snapshot
        : blankDmxSnapshot(universe),
    }
  },
  RTCInput({ t, stateKey }, id, props) {
    // Preview the clock the *configured* source will produce on-device, not
    // just the browser clock. A Manual seed starts when that particular
    // seed becomes active, then runs forward using preview time as the
    // stand-in for millis(). Changing any Manual field therefore shows the
    // newly-entered instant immediately instead of adding all the time the
    // preview had already been open. NTP shows UTC + the configured offset.
    const source = String(props.timeSource ?? 'Compile Time')
    let elapsed = t
    const rtcKey = stateKey(id)
    if (source === 'Manual') {
      const signature = [
        props.startYear, props.startMonth, props.startDay,
        props.startHour, props.startMinute, props.startSecond,
      ].map((value) => String(value ?? '')).join('|')
      const previous = rtcManualPreviewState.get(rtcKey)
      const reset = !previous || previous.signature !== signature || t < previous.lastT
      const state = reset
        ? { signature, anchorT: t, lastT: t }
        : { ...previous, lastT: t }
      rtcManualPreviewState.set(rtcKey, state)
      elapsed = Math.max(0, t - state.anchorT)
    } else {
      rtcManualPreviewState.delete(rtcKey)
    }
    const rtc = rtcPreviewSnapshot(props, elapsed)
    return {
      dateTime: rtc,
      // The same reading, addressed to a panel. One wire instead of the
      // handful a clock screen would otherwise need.
      display: { kind: 'clock', clock: rtc } satisfies DisplaySignal,
      valid: rtc.valid,
      synced: rtc.synced,
      stale: rtc.stale,
      hour: rtc.hour,
      minute: rtc.minute,
      second: rtc.second,
      weekday: rtc.weekday,
      day: rtc.day,
      month: rtc.month,
      year: rtc.year,
      secondsOfDay: rtc.secondsOfDay,
      weekend: rtc.weekend,
    }
  },
  MidiInput(_c, _id, props) {
    const midi = useMidiStore.getState()
    const noteNum = Math.round(Number(props.note ?? 60))
    const ccNum = Math.round(Number(props.cc ?? 1))
    const vel = midi.noteVelocity.get(noteNum) ?? 0
    return { note: vel, gate: vel > 0, cc: midi.ccValues.get(ccNum) ?? 0 }
  },
}
