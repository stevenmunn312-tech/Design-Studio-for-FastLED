import { useTransportDisplayTouchStore } from '../../state/transportDisplayTouchStore'
import { useDisplayRuntimeStore, type DisplayRuntimeValue } from '../../state/displayRuntimeStore'
import { parseDisplayWidgetPortId, type DisplayWidgetPortRoleId } from '../../state/displayRegistry'
import { readDisplaySourceField } from '../../state/displaySourceFields'
import { normalizeButtonEdgeSettings, blankButtonEdgeState, buttonEdge } from '../../state/transportBridge'
import {
  segmentControllerFor,
  blankSegmentFrame,
  type SegmentFrame,
  segmentDashes,
  renderSegmentClock,
  renderSegmentLevel,
  renderSegmentIndex,
  segmentFrameText,
  clampSegmentBrightness,
} from '../../state/segmentDisplay'
import {
  type LedOutputLatch,
  ledOutputManualRuntime,
  resolveLedOutputRuntime,
  blankLedOutputLatch,
  applyLedControls,
  composeLedOutputRuntime,
  ledOutputStatus,
  applyLedOutputRuntime,
} from '../../state/ledOutputRuntime'
import { clampMasterSpeed, MASTER_SPEED_DEFAULT } from '../../state/masterSpeed'
import { infoLayoutForKind, type InfoDisplayData, blankInfoData, renderInfoDisplay } from '../../state/infoDisplay'
import { OLED_CONTROLLERS, oledLine } from '../../state/oledSurface'
import {
  type PatternThumbnail,
  THUMBNAIL_TICK_SEC,
  THUMBNAIL_W,
  THUMBNAIL_SUPERSAMPLE,
  THUMBNAIL_H,
  thumbnailFromFrame,
} from '../../state/patternThumbnail'
import {
  asTransportDisplayLayout,
  type TransportDisplayLayout,
  transportLayoutForKind,
  shownDesignId,
  type TransportDisplayData,
  blankTransportData,
  type TransportClockData,
  TRANSPORT_ARTWORK_TICK_SEC,
  TRANSPORT_ARTWORK_W,
  TRANSPORT_ARTWORK_SUPERSAMPLE,
  TRANSPORT_ARTWORK_H,
  transportArtworkFromFrame,
  renderTransportDisplay,
} from '../../state/transportDisplay'
import { TFT_CONTROLLERS, asTftRotation, tftLine } from '../../state/tftSurface'
import { displayHasTouch, partById } from '../../state/partCatalogue'
import type { StudioNode, StudioEdge } from '../../state/graphStore'
import { isDisplaySignal, type DisplaySignal } from '../../state/displaySignal'
import { oledControllerForProps, tftControllerForProps, nodeDisplayLabel } from '../../state/nodeLibrary'
import type { Frame } from '../../state/ledColor'
import { resolveStereoLevels } from '../../audio/stereoLevels'
import { type StereoVuState, stereoVuSettings, renderStereoVu } from '../../state/stereoVuMeter'
import type { NodeEvaluators, NodeEvaluator, PortValue } from '../../state/evaluator/types'
import { clamp01 } from '../../state/evaluator/frames'
import { isAudioSignal, isPlayerControls, playerControlsState, toggleTapPress } from '../../state/evaluator/signals'
import { instanceState } from '../../state/evaluator/memory'

/**
 * Whether a finger is on the glass, without touching the edge state.
 *
 * A level, not an event. The panel's own Diagnostics screen draws this, and it
 * must not consume the press: the edge belongs to the Touch node, and when both
 * ran the edge logic whichever evaluated first swallowed the press and the
 * other saw a finger that had always been there.
 */
function panelTouchPressed(panelNodeId: string, live: boolean): {
  pressed: boolean
  touch: { x: number; y: number } | null
} {
  const touch = useTransportDisplayTouchStore.getState().touches.get(panelNodeId)
  return {
    pressed: live && Boolean(touch?.pressed),
    touch: touch ? { x: touch.x, y: touch.y } : null,
  }
}

const transportArtworkCache = instanceState('transportArtworkCache', new Map<string, {
  nodes: StudioNode[]
  edges: StudioEdge[]
  trusted: boolean
  artwork: Uint8Array
}>())
const patternThumbnailCache = instanceState('patternThumbnailCache', new Map<string, {
  nodes: StudioNode[]
  edges: StudioEdge[]
  trusted: boolean
  thumbnail: PatternThumbnail
}>())

/**
 * What each LED output remembers between presses on its `controls` wire.
 *
 * Per output instance, like every other stateful node here, because two
 * fixtures wired to one Control Map are two fixtures: pressing blackout
 * darkens both, and each then remembers its own state from there.
 */
const ledOutputLatchState = instanceState('ledOutputLatchState', new Map<string, LedOutputLatch>())
const stereoVuState = instanceState('stereoVuState', new Map<string, StereoVuState>())

const powerSwitchOutputOrRelayOutput: NodeEvaluator = () => {
  // Physical sink. Browser preview has no simulated contact load; the
  // connected booleans are still evaluated because this node is hot.
  return {}
}

export const OUTPUT_EVALUATORS: NodeEvaluators = {
  StereoVuMeter({ input, pal, t, stateKey, incoming }, id, props) {
    const audioValue = input(id, 'audio', null)
    const audio = isAudioSignal(audioValue) ? audioValue : null
    const levels = resolveStereoLevels(audio ?? {})
    const key = stateKey(id)
    const provider = incoming.get(`${id}:audio`)
    const settings = {
      ...stereoVuSettings(props, `${key}:${provider?.srcId ?? 'unwired'}`),
      palette: pal(id, 'paletteIn', props, 'palette', 'party'),
    }
    const rendered = renderStereoVu({
      active: Boolean(audio && (audio.active || audio.micActive)),
      left: levels.left,
      right: levels.right,
      beat: Boolean(audio?.beat),
      timeSec: t,
    }, settings, stereoVuState.get(key))
    stereoVuState.set(key, rendered.state)
    // A sink has no cable outputs, but evaluated presentation data is
    // still published for its compact node body and later combined view.
    return { vu: rendered.frame }
  },
  InfoDisplay({ input, incoming, groups, groupStack, instancePrefix, trusted, capabilityNodes, evaluateGraph }, id, props) {
    const out: Record<string, PortValue> = {}
    // A terminal like the segment display: it updates whether or not
    // anything downstream reads it. The pixels come from state/infoDisplay.ts
    // so the node body, the workbench and the firmware all draw the same
    // 128x64 picture.
    //
    // One content input. What is plugged in picks the layout, so there is
    // no property to disagree with the wire and no port that only one
    // layout reads. See docs/development/design/simple-displays.md.
    const enabled = incoming.has(`${id}:enabled`)
      ? Boolean(input(id, 'enabled', true))
      : props.enabled !== false
    const controller = oledControllerForProps(props)
      ?? OLED_CONTROLLERS.SH1106
    const signalValue = input(id, 'display', null)
    const signal = isDisplaySignal(signalValue) ? signalValue : null
    const layout = signal ? infoLayoutForKind(signal.kind) : 'Waiting'

    if (!enabled) {
      Object.assign(out, { lit: false, layout, surface: null })
      return out
    }

    let payload: InfoDisplayData
    if (!signal) {
      // Unwired says so. A blank panel and a dead panel look identical.
      payload = { layout: 'Waiting' }
    } else if (signal.kind === 'slideshow') {
      const selection = signal.selection
      const chosen = selection.highlightIndex
      const pattern = chosen >= 0 ? selection.ids[chosen] : ''
      let thumbnail: PatternThumbnail | null = null
      const definition = pattern ? groups[pattern] : undefined
      if (definition && !groupStack.has(pattern)) {
        const cached = patternThumbnailCache.get(pattern)
        if (cached && cached.nodes === definition.nodes && cached.edges === definition.edges
          && cached.trusted === trusted) {
          thumbnail = cached.thumbnail
        } else {
          const frame = evaluateGraph(
            definition.nodes, definition.edges, THUMBNAIL_TICK_SEC,
            THUMBNAIL_W * THUMBNAIL_SUPERSAMPLE,
            THUMBNAIL_H * THUMBNAIL_SUPERSAMPLE,
            groups, `${instancePrefix}oled-thumb/${pattern}/`,
            new Set([...groupStack, pattern]), {}, null, trusted, capabilityNodes,
          )
          if (frame) {
            thumbnail = thumbnailFromFrame(frame)
            patternThumbnailCache.set(pattern, {
              nodes: definition.nodes, edges: definition.edges, trusted, thumbnail,
            })
          }
        }
      }
      payload = {
        layout: 'Pattern Browser',
        data: {
          name: selection.names[chosen] ?? '',
          ordinal: chosen >= 0 ? chosen + 1 : 0,
          count: selection.count,
          thumbnail,
          browsing: selection.browsing,
          activeName: selection.names[selection.activeIndex] ?? '',
        },
      }
    } else if (signal.kind === 'clock') {
      const clock = signal.clock
      payload = {
        layout: 'Clock',
        data: clock.valid
          ? {
            timeText: `${String(clock.hour).padStart(2, '0')}:${String(clock.minute).padStart(2, '0')}`,
            dateText: `${clock.year}-${String(clock.month).padStart(2, '0')}-${String(clock.day).padStart(2, '0')}`,
            valid: true,
            synced: clock.synced === true && clock.stale !== true,
          }
          : (blankInfoData('Clock') as { layout: 'Clock'; data: { timeText: string; dateText: string; valid: boolean; synced: boolean } }).data,
      }
    } else if (signal.kind === 'ledOutput') {
      const status = signal.status
      payload = {
        layout: 'LED Status',
        data: {
          name: oledLine(status.name),
          formLabel: status.formLabel,
          ledCount: status.ledCount,
          enabled: status.enabled,
          brightness: clamp01(status.brightness),
        },
      }
    } else {
      // One envelope carrying a whole SongInfo, so there is no per-field
      // port to forget — which is what left the panel unable to show a
      // track length in preview while the device could.
      const song = signal.song
      payload = {
        layout: 'Now Playing',
        data: {
          title: oledLine(song.title),
          elapsedSec: song.elapsedSec,
          durationSec: song.durationSec,
          progress: clamp01(song.progress),
          playing: song.playing,
          volume: clamp01(song.volume),
        },
      }
    }

    return { lit: true, layout, surface: renderInfoDisplay(controller, payload) }
  },
  TransportDisplay({ input, incoming, groups, groupStack, instancePrefix, trusted, capabilityNodes, evaluateGraph }, id, props, node) {
    const out: Record<string, PortValue> = {}
    // A terminal like the OLED beside it, and it draws through
    // state/transportDisplay.ts for the same reason: the node body, the
    // workbench and the firmware all resolve one geometry, so the colour
    // panel matches the picture the editor showed.
    //
    // Rotation is read here rather than baked into the part, because it is
    // a fact about how the module was bolted down. A 240x320 panel mounted
    // on its side is a 320x240 surface, and the layout has to be told.
    const enabled = incoming.has(`${id}:enabled`)
      ? Boolean(input(id, 'enabled', true))
      : props.enabled !== false
    const controller = tftControllerForProps(props) ?? TFT_CONTROLLERS.ST7789
    const rotation = asTftRotation(props.tftRotation)
    // One content input, exactly as the OLED beside it. What is plugged in
    // picks the screen; `tftLayout` only chooses between the treatments
    // that source already offers, so it can never make a player panel show
    // a slideshow. Diagnostics is not a source — it is device lifecycle,
    // reached from the property rather than from a wire.
    const signalValue = input(id, 'display', null)
    const signal = isDisplaySignal(signalValue) ? signalValue : null
    const diagnostics = asTransportDisplayLayout(props.tftLayout) === 'Diagnostics'
    const layout: TransportDisplayLayout = diagnostics
      ? 'Diagnostics'
      : (signal ? transportLayoutForKind(signal.kind, props.tftLayout) : null) ?? 'Waiting'
    // The glass is read by the Touch node beside this one, not here: a
    // display is an output. What the panel still needs is whether a finger
    // is down, because its own Diagnostics screen draws that.
    const touchCapable = displayHasTouch(String(props.partId ?? ''))
    const { pressed, touch } = panelTouchPressed(id, enabled && touchCapable)

    /*
     * The screen drawn on this panel, if it has one.
     *
     * Widget inputs are the panel's ports: graph-driven values publish
     * into the runtime store for the panel to draw. Widget outputs are
     * sampled by the paired Touch node above, so the panel remains an
     * output-category terminal even when it hosts interactive controls.
     */
    const designId = shownDesignId(props)
    const widgetInputs = ((node.data.inputs as { id: string; dataType?: string }[] | undefined) ?? [])
      .filter((port) => parseDisplayWidgetPortId(port.id))
    if (designId && enabled) {
      const runtime = useDisplayRuntimeStore.getState()
      for (const port of widgetInputs) {
        const parsed = parseDisplayWidgetPortId(port.id)!
        if (!incoming.has(`${id}:${port.id}`)) continue
        const value = input(id, port.id, null)
        if (value === null || Array.isArray(value)) continue
        runtime.publishDisplayRoleValue(designId, parsed.widgetId, parsed.role, value as DisplayRuntimeValue)
      }
      /*
       * Widgets reading the panel's own source rather than a cable.
       *
       * The values were already here — the source is wired to this very
       * node for the fixed layouts to draw — so a Now Playing screen needs
       * no wires at all. A field this source does not carry publishes
       * nothing rather than a zero, so a screen wired to a slideshow shows
       * its blank where a track title would be instead of claiming one.
       */
      const bindings = props.widgetSources
      if (bindings && typeof bindings === 'object') {
        for (const [widgetId, binding] of Object.entries(bindings as Record<string, unknown>)) {
          const entry = binding as { field?: unknown; roles?: unknown }
          const value = readDisplaySourceField(signal, String(entry?.field ?? ''))
          if (value === null) continue
          const roles = Array.isArray(entry?.roles) ? entry.roles : ['value']
          for (const role of roles) {
            runtime.publishDisplayRoleValue(
              designId, widgetId, role as DisplayWidgetPortRoleId, value as DisplayRuntimeValue,
            )
          }
        }
      }
    }

    // Assigned onto the same object rather than replacing it: the widget
    // values above are already published on `out`, and a dark panel still
    // reports its controls at rest rather than not at all.
    if (!enabled) {
      Object.assign(out, { lit: false, layout, surface: null })
      return out
    }

    let payload: TransportDisplayData
    if (layout === 'Diagnostics') {
      payload = {
        layout: 'Diagnostics',
        data: {
          touchAvailable: touchCapable,
          pressed,
          x: touch?.x ?? 0,
          y: touch?.y ?? 0,
        },
      }
    } else if (layout === 'Waiting' || !signal) {
      // Unwired, or wired to a source with no colour layout at all. The
      // panel says so rather than sitting blank.
      payload = { layout: 'Waiting' }
    } else if (layout === 'Clock') {
      const clock = signal.kind === 'clock' ? signal.clock : null
      payload = {
        layout: 'Clock',
        data: clock && clock.valid
          ? {
            timeText: `${String(clock.hour).padStart(2, '0')}:${String(clock.minute).padStart(2, '0')}:${String(clock.second).padStart(2, '0')}`,
            dateText: `${clock.year}-${String(clock.month).padStart(2, '0')}-${String(clock.day).padStart(2, '0')}`,
            valid: true,
            synced: clock.synced === true,
            stale: clock.stale === true,
          }
          : (blankTransportData('Clock') as { layout: 'Clock'; data: TransportClockData }).data,
      }
    } else if (layout === 'Show Status') {
      const selection = signal.kind === 'slideshow' ? signal.selection : null
      payload = {
        layout: 'Show Status',
        data: {
          patternName: tftLine(selection?.names[selection.activeIndex] ?? ''),
          patternIndex: selection?.activeIndex ?? 0,
          patternCount: selection?.count ?? 0,
          highlightName: tftLine(selection?.names[selection.highlightIndex] ?? ''),
          highlightIndex: selection?.highlightIndex ?? 0,
          browsing: selection?.browsing === true,
        },
      }
    } else if (layout === 'LED Status') {
      // Blank rather than a plausible zero when the wire is not an output:
      // the layout is only reachable from an `ledOutput` source, so the
      // null branch is a panel mid-rewire rather than a state to invent a
      // reading for.
      const status = signal.kind === 'ledOutput' ? signal.status : null
      payload = {
        layout: 'LED Status',
        data: {
          name: tftLine(status?.name ?? ''),
          formLabel: status?.formLabel ?? '',
          ledCount: status?.ledCount ?? 0,
          enabled: status?.enabled === true,
          brightness: clamp01(status?.brightness ?? 0),
        },
      }
    } else if (layout === 'Fixed Transport') {
      const song = signal.kind === 'player' ? signal.song : null
      const selection = signal.kind === 'player' ? signal.selection : null
      payload = {
        layout: 'Fixed Transport',
        data: {
          title: tftLine(song?.title ?? ''),
          patternName: tftLine(selection?.names[selection.activeIndex] ?? ''),
          playing: song?.playing === true,
          volume: clamp01(song?.volume ?? 0),
        },
      }
    } else {
      // Artwork identity rides the same envelope as the track. The player
      // owns both readings and publishes them together, so a panel cannot
      // be told about a song from one wire and a pattern from another and
      // end up captioning the wrong picture.
      const song = signal.kind === 'player' ? signal.song : null
      const selection = signal.kind === 'player' ? signal.selection : null
      const pattern = selection && selection.activeIndex >= 0
        ? selection.ids[selection.activeIndex]
        : ''
      let artwork: Uint8Array | null = null
      const definition = pattern ? groups[pattern] : undefined
      if (definition && !groupStack.has(pattern)) {
        const cached = transportArtworkCache.get(pattern)
        if (cached && cached.nodes === definition.nodes && cached.edges === definition.edges
          && cached.trusted === trusted) {
          artwork = cached.artwork
        } else {
          const frame = evaluateGraph(
            definition.nodes, definition.edges, TRANSPORT_ARTWORK_TICK_SEC,
            TRANSPORT_ARTWORK_W * TRANSPORT_ARTWORK_SUPERSAMPLE,
            TRANSPORT_ARTWORK_H * TRANSPORT_ARTWORK_SUPERSAMPLE,
            groups, `${instancePrefix}tft-art/${pattern}/`,
            new Set([...groupStack, pattern]), {}, null, trusted, capabilityNodes,
          )
          if (frame) {
            artwork = transportArtworkFromFrame(frame)
            transportArtworkCache.set(pattern, {
              nodes: definition.nodes, edges: definition.edges, trusted, artwork,
            })
          }
        }
      }
      payload = {
        layout: 'Now Playing',
        data: {
          title: tftLine(song?.title ?? ''),
          artist: tftLine(song?.artist ?? ''),
          elapsedSec: song?.elapsedSec ?? 0,
          durationSec: song?.durationSec ?? 0,
          progress: clamp01(song?.progress ?? 0),
          playing: song?.playing === true,
          volume: clamp01(song?.volume ?? 0),
          patternName: tftLine(selection?.names[selection.activeIndex] ?? ''),
          artwork,
        },
      }
    }

    Object.assign(out, { lit: true, layout, surface: renderTransportDisplay(controller, rotation, payload) })
    return out
  },
  SegmentDisplay({ input, t, incoming }, id, props): Record<string, PortValue> {
    // A display is a terminal: it updates whether or not anything downstream
    // reads it. The rendered characters come from state/segmentDisplay.ts,
    // which the C++ generator also uses, so the module shows the same four
    // digits on the bench as the node body shows here.
    //
    // One content input, like the OLED. A segment module cannot spell
    // "waiting for a signal", so dashes are its form of the same statement
    // — which is already what it shows for a reading it does not trust.
    const enabled = incoming.has(`${id}:enabled`)
      ? Boolean(input(id, 'enabled', true))
      : props.enabled !== false
    const segCtl = segmentControllerFor(partById(String(props.partId ?? ''))?.display?.controller)
    if (!enabled) {
      return { frame: null, segment: blankSegmentFrame(segCtl.digits), text: '' }
    }

    const signalValue = input(id, 'display', null)
    const signal = isDisplaySignal(signalValue) ? signalValue : null
    let segment: SegmentFrame
    if (!signal) {
      segment = segmentDashes(segCtl.digits)
    } else if (signal.kind === 'clock') {
      const clock = signal.clock
      if (clock.valid) {
        // The colon blinks once a second, driven by wall-clock `t` like
        // every other animation here rather than by a frame counter.
        const blink = props.showColon === false ? false : Math.floor(t) % 2 === 0
        segment = renderSegmentClock(
          clock.hour, clock.minute,
          blink && segCtl.hasColon, segCtl.digits, clock.second,
        )
      } else {
        // No trustworthy reading is dashes, never a plausible midnight.
        segment = segmentDashes(segCtl.digits)
      }
    } else if (signal.kind === 'player') {
      // Elapsed as M:SS through the clock renderer, because minutes and
      // seconds on a colon module are the same two pairs a clock draws.
      const elapsed = Math.max(0, Math.floor(signal.song.elapsedSec))
      const blink = props.showColon === false ? false : true
      segment = renderSegmentClock(
        Math.floor(elapsed / 60), elapsed % 60,
        blink && segCtl.hasColon, segCtl.digits, 0,
      )
    } else if (signal.kind === 'ledOutput') {
      // Effective output as whole percent — see renderSegmentLevel on why
      // a blacked-out fixture reads 0 rather than its dimmer position.
      segment = renderSegmentLevel(signal.status.brightness, signal.status.enabled, segCtl.digits)
    } else {
      const selection = signal.selection
      segment = selection.count > 0
        ? renderSegmentIndex(selection.activeIndex + 1, segCtl.digits)
        : segmentDashes(segCtl.digits)
    }

    return {
      frame: null,
      segment,
      text: segmentFrameText(segment),
      brightness: clampSegmentBrightness(props.brightness, segCtl),
    }
  },
  PowerSwitchOutput: powerSwitchOutputOrRelayOutput,
  RelayOutput: powerSwitchOutputOrRelayOutput,
  MatrixOutput({ input, t, stateKey, incoming, nodeMap }, id, props, node, type) {
    // Blackout and dimming, applied here rather than at the preview so the
    // main matrix, every per-output preview, an offline recording and the
    // live stream all see one answer. `applyLedOutputRuntime` copies rather
    // than scaling in place: this frame is the upstream node's pooled
    // buffer, shared with a second output and with node previews.
    const frame = input(id, 'frame', null) as Frame | null
    // A wired port speaks for the field beside it; an unwired one leaves
    // the field to speak, so unplugging a dimmer restores what the slider
    // says rather than jumping to full.
    const manual = ledOutputManualRuntime(props)
    const resolved = resolveLedOutputRuntime(
      incoming.has(`${id}:enabled`) ? input(id, 'enabled', true) : manual.enabled,
      incoming.has(`${id}:brightness`) ? input(id, 'brightness', 1) : manual.brightness,
    )
    // A bundle carries a toggle and a delta, so it needs somewhere to
    // toggle and to nudge. Folded once per pass: node outputs are memoised
    // above, so a second output reading the same Control Map sees the
    // same single-frame press rather than a second one.
    const key = stateKey(id)
    let latch = ledOutputLatchState.get(key)
    if (!latch) {
      latch = blankLedOutputLatch()
      ledOutputLatchState.set(key, latch)
    }
    const controlsValue = input(id, 'controls', null)
    if (isPlayerControls(controlsValue)) applyLedControls(latch, controlsValue)
    const directPorts = ['ledToggle', 'brightnessUp', 'brightnessDown'] as const
    if (directPorts.some((port) => incoming.has(`${id}:${port}`))) {
      const directKey = stateKey(`${id}/direct-actions`)
      const nowMs = t * 1000
      let state = playerControlsState.get(directKey)
      if (!state || t < state.lastT) state = { lastT: t, buttons: {} }
      state.lastT = t
      const edgeSettings = normalizeButtonEdgeSettings({})
      const directButton = (port: typeof directPorts[number], repeat: boolean): boolean => {
        const wire = incoming.get(`${id}:${port}`)
        if (!wire) return false
        const tap = toggleTapPress(`${directKey}:${port}`, wire, nodeMap)
        if (tap !== null) return tap
        const raw = Boolean(input(id, port, false))
        const source = nodeMap.get(wire.srcId)
        if (source?.data.nodeType === 'TouchInput' && wire.srcPort === port) return raw
        let bs = state!.buttons[port]
        if (!bs) {
          bs = blankButtonEdgeState(nowMs)
          state!.buttons[port] = bs
        }
        return buttonEdge(bs, raw, nowMs, repeat, edgeSettings)
      }
      applyLedControls(latch, {
        ledToggle: directButton('ledToggle', false),
        brightnessDelta:
          (directButton('brightnessUp', true) ? 0.05 : 0)
          - (directButton('brightnessDown', true) ? 0.05 : 0),
      })
      playerControlsState.set(directKey, state)
    }
    const runtime = composeLedOutputRuntime(resolved, latch)
    // The fixture's own reading, published beside the frame it just
    // scaled. Resolved rather than wired: a status panel must say what the
    // fixture is doing, not what one of the three factors asked for.
    const status: DisplaySignal = {
      kind: 'ledOutput',
      // Titled the way the canvas titles it. `data.label` is not persisted
      // — `normalizeLoadedGraph` replaces it with the library default on
      // every load — so reading it directly made a reloaded LED String
      // report itself as "LED Matrix".
      status: ledOutputStatus(
        nodeDisplayLabel(type, props, String(node.data.label ?? 'LED output')), props, runtime,
      ),
    }
    return { frame: frame ? applyLedOutputRuntime(frame, runtime) : null, display: status }
  },
  // Published rather than applied here: the clock this would scale is the
  // one this pass is already running on, so the value is read by whatever
  // owns the clock — the preview loop, a recording — and takes effect on
  // the next frame. See state/masterSpeed.ts on why that lag is the point.
  MasterSpeed({ input, num }, id, props) {
    // A control bundle wins over the node's own slider, and only while it
    // is actually carrying a speed: a bundle that reaches here without the
    // Master Speed job assigned leaves the slider alone.
    const bundle = input(id, 'controls', null)
    const fromControls = isPlayerControls(bundle) && typeof bundle.speed === 'number'
      ? bundle.speed
      : null
    return {
      speed: clampMasterSpeed(fromControls ?? num(id, 'speed', props, 'speed', MASTER_SPEED_DEFAULT)),
    }
  },
}
