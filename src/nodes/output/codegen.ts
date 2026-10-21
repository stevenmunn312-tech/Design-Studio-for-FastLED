import { type SegmentDisplayEmit, segmentDisplaySetupCpp, segmentDisplayLoopCpp } from '../../codegen/displays/segmentDisplayCpp'
import { segmentControllerFor, clampSegmentBrightness, segmentModeForKind } from '../../state/displays/segmentDisplay'
import { MAX_PIN_NUMBER, NO_PIN } from '../../build/boards/boardGpio'
import {
  BUZZER_PIN_FALLBACK, BUZZER_PITCH_DEFAULT_HZ, BUZZER_PITCH_MAX_HZ, BUZZER_PITCH_MIN_HZ, buzzerActiveHigh, buzzerIsPassive,
} from '../../state/peripherals/buzzer'
import {
  DARLINGTON_PIN_FALLBACKS, darlingtonActiveHigh, darlingtonChannelId, darlingtonPinKeys,
} from '../../state/peripherals/darlingtonDriver'
import { PWM_DRIVER_HELPER_CPP } from '../../codegen/peripherals/pwmDriverCpp'
import {
  PWM_DRIVER_FULL_COUNT, formatPwmDriverAddress, pwmDriverAddress, pwmDriverChannelId, pwmDriverPrescale, pwmDriverSpec,
} from '../../state/peripherals/pwmDriver'
import {
  oledControllerForProps,
  oledTransportForProps,
  tftControllerForProps,
  transportDisplayPinKeysForProps,
  tftTransportForProps,
  xptTouchPinsForProps,
} from '../../state/nodeLibrary'
import { hub75OutputRuntimeCpp, ledOutputRuntimeCpp } from '../../codegen/output/ledOutputRuntimeCpp'
import { renderScaleUpscaleCpp } from '../../codegen/output/renderScaleCpp'
import { SHAPE_COUNT_MACRO, shapeCopyCpp, shapeTableName } from '../../codegen/output/shapeMapCpp'
import { playerControlsServiceCpp, designControlBundleEmit, ledOutputLatchCpp } from '../../codegen/player/playerControlsCpp'
import { normalizeButtonEdgeSettings } from '../../state/player/transportBridge'
import { displayControlEdges } from '../../state/player/wireFirstControls'
import { displayRuntimeId } from '../../state/displays/mountedDisplays'
import { propertyInputsFor } from '../../state/propertyInputs'
import {
  type InfoDisplayEmit,
  columnOffsetFor,
  infoDisplaySetupCpp,
  infoDisplayLoopCpp,
} from '../../codegen/displays/infoDisplayCpp'
import { infoLayoutForKind } from '../../state/displays/infoDisplay'
import { DISPLAY_SOURCE_NODE_TYPES, SKETCH_DISPLAY_SOURCE_KINDS } from '../../state/displays/displaySignal'
import { type TftDisplayEmit, tftDisplaySetupCpp, tftDisplayLoopCpp } from '../../codegen/displays/tftDisplayCpp'
import {
  shownDesignId,
  type TransportDisplayLayout,
  asTransportDisplayLayout,
  transportLayoutForKind,
} from '../../state/displays/transportDisplay'
import { TFT_CONTROLLERS, asTftRotation, PARALLEL_TOUCH_ELECTRODES } from '../../state/displays/tftSurface'
import { type TftTouchEmit, tftTouchSetupCpp, tftTouchServiceCpp } from '../../codegen/displays/tftTouchCpp'
import {
  type CustomDisplayLvglBinding,
  type CustomDisplayLvglEmit,
  customDisplayLvglLoopCpp,
  customDisplayLvglOutputExpression,
  customDisplayLvglSetupCpp,
  customDisplayLvglTapExpression,
} from '../../codegen/displays/customDisplayLvglCpp'
import {
  customDisplayPanelFromProps,
  customDisplayPanelSetupCpp,
  customDisplayPanelEnableCpp,
} from '../../codegen/displays/customDisplayPanelCpp'
import { DISPLAY_SCREEN_INPUT_ID, displayDocumentPorts, displayWidgetFormatsNumber, parseDisplayWidgetPortId } from '../../state/displays/displayRegistry'
import { designControlBundle } from '../../state/displays/designControlBundle'
import { resolveBoundWidgets, normalSketchSourceExpressions } from '../../codegen/displays/displaySourceExpressions'
import { OLED_CONTROLLERS, asOledAddress, oledRotationCommands, asOledRotation } from '../../state/displays/oledSurface'
import { displayHasTouch, partById } from '../../build/parts/partCatalogue'
import { sanitizePin } from '../../codegen/hardwarePins'
import { type TransportTouchAction, TRANSPORT_TOUCH_ACTION_TYPES, emittedTouchBounds } from '../../state/displays/transportTouch'
import { relayActiveHigh, relayPinKeys } from '../../state/peripherals/relayModule'
import {
  POWER_SWITCH_PIN_FALLBACKS, powerSwitchActiveHigh, powerSwitchChannels, powerSwitchDims, powerSwitchPwmHz,
} from '../../state/peripherals/powerSwitch'
import {
  type DimmedPowerSwitchChannel, powerSwitchPwmHelperCpp, powerSwitchPwmLoopCpp, powerSwitchPwmPlan, powerSwitchPwmSetupCpp,
} from '../../codegen/peripherals/powerSwitchCpp'
import type { StudioNode } from '../../state/graphStore'
import { stereoVuLoopCpp } from '../../codegen/audio/stereoVuMeterCpp'
import type { NodeEmitters } from '../../codegen/emitContext'
import { safeId, cppComment } from '../../codegen/cppLiterals'
import { hub75BlitRowsCpp } from '../../codegen/output/hub75Cpp'
import { coolingFanGlobalCpp, coolingFanLoopCpp, coolingFanSetupCpp } from '../../codegen/peripherals/coolingFanCpp'
import {
  COOLING_FAN_PWM_PIN_FALLBACK,
  COOLING_FAN_TACH_PIN_FALLBACK,
  coolingFanSpec,
} from '../../state/peripherals/coolingFan'
import { dfPlayerGlobalCpp, dfPlayerLoopCpp, dfPlayerSetupCpp, DFPLAYER_HELPER_CPP } from '../../codegen/peripherals/dfPlayerCpp'
import { parseIpv4Literal } from '../../codegen/peripherals/networkCpp'
import { ANALOG_PWM_HZ, DDP_CHUNK_PIXELS, DDP_DATA_TYPE_RGB8, DDP_PORT, adalightBaud, streamProtocol } from './frameStream'
import {
  DFPLAYER_BUSY_PIN_FALLBACK,
  DFPLAYER_RX_PIN_FALLBACK,
  DFPLAYER_TX_PIN_FALLBACK,
} from '../../state/peripherals/dfPlayer'

/**
 * Every dimmed Power Switch channel in the sketch, in node then channel
 * order. The PWM plan needs all of them at once: channels share LEDC timers on
 * ESP32 core 2, and one frequency on ESP8266 and RP2040.
 */
function dimmedPowerSwitchChannels(
  nodes: readonly StudioNode[],
  incoming: ReadonlyMap<string, unknown>,
  props: (node: StudioNode) => Record<string, unknown>,
): DimmedPowerSwitchChannel[] {
  return nodes.filter((candidate) => candidate.data.nodeType === 'PowerSwitchOutput').flatMap((candidate) => {
    const q = props(candidate)
    const hz = powerSwitchPwmHz(q.partId)
    if (hz === null) return []
    return powerSwitchChannels(q.partId)
      .filter((channel) => powerSwitchDims(q.partId, q[channel.level], incoming.has(`${candidate.id}:${channel.level}`)))
      .map((channel) => ({ key: `${candidate.id}:${channel.index}`, hz }))
  })
}

/** Every ESP32 core-2 LEDC user, allocated together to avoid channel clashes. */
function esp32PwmChannels(
  nodes: StudioNode[],
  incoming: ReadonlyMap<string, unknown>,
  props: (node: StudioNode) => Record<string, unknown>,
): DimmedPowerSwitchChannel[] {
  return [
    ...dimmedPowerSwitchChannels(nodes, incoming, props),
    ...nodes.filter((candidate) => candidate.data.nodeType === 'CoolingFanOutput').map((candidate) => ({
      key: `${candidate.id}:fan`,
      hz: coolingFanSpec(props(candidate).partId).pwmHz,
    })),
  ]
}

function powerMonitorExpressions(sourceId: string | undefined) {
  if (!sourceId) return undefined
  const stem = `n_${safeId(sourceId)}`
  return { volts: `${stem}_volts`, amps: `${stem}_amps`, watts: `${stem}_watts` }
}

export const OUTPUT_EMITTERS: NodeEmitters = {
  DarlingtonDriverOutput({ node, p, ln, boolExpr, pinSetupLines }) {
    // Each input is active-high. Latch it LOW before the pin becomes an output so
    // no load pulses on during reset or setup.
    const [on, off] = darlingtonActiveHigh(p.partId) ? ['HIGH', 'LOW'] : ['LOW', 'HIGH']
    for (const [index, key] of darlingtonPinKeys().entries()) {
      const pin = sanitizePin(p[key], DARLINGTON_PIN_FALLBACKS[index])
      pinSetupLines.add(`  digitalWrite(${pin}, ${off});`)
      pinSetupLines.add(`  pinMode(${pin}, OUTPUT);`)
      ln(`  digitalWrite(${pin}, ${boolExpr(node.id, darlingtonChannelId(index))} ? ${on} : ${off});`)
    }
  },
  PwmDriverOutput({ node, id, p, ln, f, incoming, globalLines }) {
    // Only a wired channel is written, and only when its level changes, so a
    // quiet graph leaves the bus quiet. The chip is configured on first contact
    // and again after any failed write, retried once a second while it is absent.
    if (!globalLines.includes(PWM_DRIVER_HELPER_CPP[0])) globalLines.push(...PWM_DRIVER_HELPER_CPP)
    const address = formatPwmDriverAddress(pwmDriverAddress(p) ?? pwmDriverSpec(p.partId).defaultI2cAddress)
    ln(`  static bool _pwmReady_${id} = false, _pwmTried_${id} = false; static uint32_t _pwmT_${id} = 0;`)
    ln(`  static uint16_t _pwmLast_${id}[16];`)
    ln(`  if (!_pwmReady_${id} && (!_pwmTried_${id} || millis() - _pwmT_${id} >= 1000)) {`)
    ln(`    _pwmTried_${id} = true; _pwmT_${id} = millis();`)
    ln(`    _pwmReady_${id} = _pcaBegin(${address}, ${pwmDriverPrescale(p)});`)
    ln(`    for (uint8_t i = 0; i < 16; ++i) _pwmLast_${id}[i] = 0xFFFF;`)
    ln('  }')
    for (let channel = 0; channel < pwmDriverSpec(p.partId).channels; channel += 1) {
      const port = pwmDriverChannelId(channel)
      if (!incoming.has(`${node.id}:${port}`)) continue
      const duty = `_pwmDuty_${id}_${channel}`
      ln(`  if (_pwmReady_${id}) {`)
      ln(`    uint16_t ${duty} = (uint16_t)(constrain(${f(port, port, 0)}, 0.0f, 1.0f) * ${PWM_DRIVER_FULL_COUNT}.0f + 0.5f);`)
      ln(`    if (${duty} != _pwmLast_${id}[${channel}]) { if (_pcaSet(${address}, ${channel}, ${duty})) _pwmLast_${id}[${channel}] = ${duty}; else _pwmReady_${id} = false; }`)
      ln('  }')
    }
  },
  BuzzerOutput({ node, id, p, ln, f, boolExpr, pinSetupLines }) {
    // Latch the silent level before the pin becomes an output so reset and
    // setup do not chirp.
    const [on, off] = buzzerActiveHigh(p.partId) ? ['HIGH', 'LOW'] : ['LOW', 'HIGH']
    const pin = sanitizePin(p.sigPin, BUZZER_PIN_FALLBACK)
    pinSetupLines.add(`  digitalWrite(${pin}, ${off});`)
    pinSetupLines.add(`  pinMode(${pin}, OUTPUT);`)
    if (!buzzerIsPassive(p.partId)) {
      ln(`  digitalWrite(${pin}, ${boolExpr(node.id, 'on')} ? ${on} : ${off});`)
      return
    }
    // A passive buzzer: tone() plays the square wave, noTone() rests the pin
    // low. Both are called only when the sound starts, stops or changes pitch,
    // because restarting the generator every frame would click. The pitch is
    // rounded and clamped as buzzerPitchHz does, and a NaN lands on the minimum.
    // On AVR, tone() takes over IRremote's receive timer, so a sketch with an
    // IR receiver hands the timer back when the tone stops (IRremote's own
    // remedy); FLS_IR_RECEIVER is defined exactly when the sketch has one.
    ln(`  { static bool _bzOn_${id} = false; static uint16_t _bzHz_${id} = 0;`)
    ln(`    float _bzP = ${f('pitch', 'pitchHz', BUZZER_PITCH_DEFAULT_HZ)};`)
    ln(`    uint16_t _bzWant = _bzP > ${BUZZER_PITCH_MAX_HZ}.0f ? ${BUZZER_PITCH_MAX_HZ} : (_bzP >= ${BUZZER_PITCH_MIN_HZ}.0f ? (uint16_t)(_bzP + 0.5f) : ${BUZZER_PITCH_MIN_HZ});`)
    ln(`    if (${boolExpr(node.id, 'on')}) {`)
    ln(`      if (!_bzOn_${id} || _bzWant != _bzHz_${id}) { tone(${pin}, _bzWant); _bzOn_${id} = true; _bzHz_${id} = _bzWant; }`)
    ln(`    } else if (_bzOn_${id}) {`)
    ln(`      noTone(${pin}); _bzOn_${id} = false;`)
    ln('#if defined(ARDUINO_ARCH_AVR) && defined(FLS_IR_RECEIVER)')
    ln('      FLS_IR_RECEIVER.restartTimer();')
    ln('#endif')
    ln('    } }')
  },
  CoolingFanOutput({ id, p, ln, f, v, setupLines, globalLines, nodes, incoming, props }) {
    const plan = powerSwitchPwmPlan(esp32PwmChannels(nodes, incoming, props))
    const emit = {
      id,
      pwmPin: sanitizePin(p.pwmPin, COOLING_FAN_PWM_PIN_FALLBACK),
      tachPin: sanitizePin(p.tachPin, COOLING_FAN_TACH_PIN_FALLBACK),
      channel: plan.ledcChannels.get(`${id}:fan`) ?? 0,
      speedExpr: f('speed', 'speed', 1),
      rpmVar: v('rpm'),
      runningVar: v('running'),
      spec: coolingFanSpec(p.partId),
    }
    globalLines.push(...coolingFanGlobalCpp(emit))
    setupLines.push(...coolingFanSetupCpp(emit))
    for (const line of coolingFanLoopCpp(emit)) ln(line)
  },
  DFPlayerOutput({ node, id, p, ln, f, v, boolExpr, setupLines, globalLines }) {
    if (!globalLines.includes(DFPLAYER_HELPER_CPP[0])) globalLines.push(...DFPLAYER_HELPER_CPP)
    const emit = {
      id,
      rxPin: sanitizePin(p.uartRxPin, DFPLAYER_RX_PIN_FALLBACK),
      txPin: sanitizePin(p.uartTxPin, DFPLAYER_TX_PIN_FALLBACK),
      busyPin: sanitizePin(p.busyPin, DFPLAYER_BUSY_PIN_FALLBACK),
      playExpr: boolExpr(node.id, 'play'),
      nextExpr: boolExpr(node.id, 'next'),
      previousExpr: boolExpr(node.id, 'previous'),
      trackExpr: f('track', 'track', 1),
      volumeExpr: f('volume', 'volume', 0.7),
      playingVar: v('playing'),
    }
    globalLines.push(...dfPlayerGlobalCpp(emit))
    setupLines.push(...dfPlayerSetupCpp(emit))
    for (const line of dfPlayerLoopCpp(emit)) ln(line)
  },
  RelayOutput({ node, p, ln, boolExpr, pinSetupLines }) {
    // Idle level comes from the part. A mechanical module is active-low, so
    // the latch is HIGH before the pin becomes an output and reset does not
    // click the relay. An active-high phototriac board must sit LOW instead:
    // its transistor turns the load on at HIGH, including during reset.
    const activeHigh = relayActiveHigh(p.partId)
    const [energised, idle] = activeHigh ? ['HIGH', 'LOW'] : ['LOW', 'HIGH']
    const fallbacks = [5, 16, 17, 18, 19, 21, 22, 23]
    for (const [index, key] of relayPinKeys(p.partId).entries()) {
      const pin = sanitizePin(p[key], fallbacks[index])
      pinSetupLines.add(`  digitalWrite(${pin}, ${idle});`)
      pinSetupLines.add(`  pinMode(${pin}, OUTPUT);`)
      ln(`  digitalWrite(${pin}, ${boolExpr(node.id, `channel${index + 1}`)} ? ${energised} : ${idle});`)
    }
  },
  PowerSwitchOutput({ node, id, p, ln, f, boolExpr, pinSetupLines, incoming, nodes, props, globalLines }) {
    // Every channel is active-high: a HIGH pin turns its MOSFET on, through
    // the LR7843's optocoupler or straight into the Mosfetti's gate. Latch the
    // off level before enabling each output so no load pulses on during setup.
    const activeHigh = powerSwitchActiveHigh(p.partId)
    const [on, off] = activeHigh ? ['HIGH', 'LOW'] : ['LOW', 'HIGH']
    const hz = powerSwitchPwmHz(p.partId)
    for (const channel of powerSwitchChannels(p.partId)) {
      const pin = sanitizePin(p[channel.pinKey], POWER_SWITCH_PIN_FALLBACKS[channel.index])
      const levelWired = incoming.has(`${node.id}:${channel.level}`)
      if (hz === null || !powerSwitchDims(p.partId, p[channel.level], levelWired)) {
        pinSetupLines.add(`  digitalWrite(${pin}, ${off});`)
        pinSetupLines.add(`  pinMode(${pin}, OUTPUT);`)
        ln(`  digitalWrite(${pin}, ${boolExpr(node.id, channel.on)} ? ${on} : ${off});`)
        continue
      }
      // Dimmed: the same gate and level rule as the preview (powerSwitchGate,
      // powerSwitchLoad), carried by PWM at the part's frequency.
      const plan = powerSwitchPwmPlan(esp32PwmChannels(nodes, incoming, props))
      const helper = powerSwitchPwmHelperCpp(plan.sharedHz)
      if (!globalLines.includes(helper)) globalLines.push(helper)
      const emit = {
        id: channel.index === 0 ? id : `${id}_${channel.index + 1}`,
        pin,
        channel: plan.ledcChannels.get(`${node.id}:${channel.index}`) ?? 0,
        hz,
        activeHigh,
        gateExpr: incoming.has(`${node.id}:${channel.on}`) ? boolExpr(node.id, channel.on) : String(levelWired),
        levelExpr: f(channel.level, channel.level, 1),
      }
      for (const line of powerSwitchPwmSetupCpp(emit)) pinSetupLines.add(line)
      for (const line of powerSwitchPwmLoopCpp(emit)) ln(line)
    }
  },
  InfoDisplay({ node, id, p, ln, ledStatusEmit, bootTitle, bootDevice, incoming, nodeMap, intProp, boolExpr, setupLines, infoDisplays }) {
    // One content input, and a normal sketch has exactly one source it can
    // answer for: an RTC. A player or a slideshow plugged in here builds a
    // different generator, which validation reports before upload; the
    // panel draws its waiting screen rather than a blank one.
    const displayUp = incoming.get(`${node.id}:display`)
    const displaySource = displayUp && nodeMap.get(displayUp.srcId)
    const kind = displaySource
      ? DISPLAY_SOURCE_NODE_TYPES[String(displaySource.data.nodeType ?? '')]
      : undefined
    const clockExpr = kind === 'clock' && displayUp
      ? `n_${safeId(displayUp.srcId)}_dateTime`
      : null
    const controller = oledControllerForProps(p)
    const transport = oledTransportForProps(p)
    const emit: InfoDisplayEmit = {
      id,
      controller: controller?.id ?? OLED_CONTROLLERS.SH1106.id,
      transport,
      csPin: intProp(p.csPin, 5, 0, MAX_PIN_NUMBER),
      dcPin: intProp(p.dcPin, 16, 0, MAX_PIN_NUMBER),
      resetPin: intProp(p.resetPin, 17, 0, MAX_PIN_NUMBER),
      sckPin: intProp(p.sckPin, 18, 0, MAX_PIN_NUMBER),
      mosiPin: intProp(p.mosiPin, 23, 0, MAX_PIN_NUMBER),
      address: asOledAddress(p.i2cAddress),
      width: controller?.width ?? OLED_CONTROLLERS.SH1106.width,
      height: controller?.height ?? OLED_CONTROLLERS.SH1106.height,
      columnOffset: columnOffsetFor(controller),
      segmentRemap: oledRotationCommands(asOledRotation(p.oledRotation)).segmentRemap,
      comScan: oledRotationCommands(asOledRotation(p.oledRotation)).comScan,
      layout: kind && SKETCH_DISPLAY_SOURCE_KINDS.includes(kind) ? infoLayoutForKind(kind) : 'Waiting',
      powerMonitor: kind === 'powerMonitor' ? powerMonitorExpressions(displayUp?.srcId) : undefined,
      ledStatus: kind === 'ledOutput' ? ledStatusEmit(displaySource) : undefined,
      enabledExpr: incoming.get(`${node.id}:enabled`)
        ? boolExpr(node.id, 'enabled')
        : (p.enabled === false ? 'false' : 'true'),
      titleExpr: null,
      line2Expr: null,
      valueExpr: '0.0f',
      progressExpr: '0.0f',
      playingExpr: 'false',
      volumeExpr: '0.0f',
      durationExpr: '0.0f',
      dateTimeExpr: clockExpr,
      boot: { project: bootTitle, device: bootDevice },
    }
    infoDisplays.push(emit)
    for (const line of infoDisplaySetupCpp(emit)) setupLines.push(line)
    for (const line of infoDisplayLoopCpp(emit)) ln(line)
  },
  TransportDisplay({ node, id, p, ln, ledStatusEmit, nodes, edges, opts, incoming, nodeMap, intProp, nativeMultiRender, boolExpr, customDisplaySamples, customDisplayPublication, setupLines, globalLines, needsDisplayText, tftDisplays, playerControlNodes, tftTouches, emitTelemetry, customDisplays, customDisplayPanels, customDisplayOwners }) {
    // A panel draws its screen design when it has one, and one of the
    // fixed layouts otherwise (see
    // docs/design/large-displays-and-control-routing.md).
    // The design is named by the panel's `displayId`. Widget ports stay on
    // this panel. The LVGL screen and widget objects use the document id
    // while one panel shows the design, and this panel's id when another
    // panel shows it too, so two glasses do not declare one symbol twice.
    // Image bytes stay under the document id and are emitted once. The
    // physical driver — struct instance, SPI pins, LVGL display object —
    // is keyed by this panel's id. Call order matters: the panel's setup
    // lines must precede the document's, since LVGL creates widgets
    // against whichever display was most recently made the default.
    const documentId = shownDesignId(p)
    const document = documentId ? opts.displayDocuments?.[documentId] : undefined
    // Fixed layouts format their own fields. Only a screen design's Numeric
    // Readout or Arc Gauge calls the shared graph number formatter; Text and
    // Timecode use the LVGL runtime's own helpers.
    if (document?.widgets.some((widget) => displayWidgetFormatsNumber(widget.type))) {
      needsDisplayText.number = true
    }
    // What this sketch can answer for a bound widget: a clock, and the
    // LED output it is driving. Not a player or a slideshow — one of those
    // in a normal sketch renders as a black fill, so its fields are the
    // same blanks the fixed layouts below leave.
    const panelDisplayUp = incoming.get(`${node.id}:display`)
    const panelSourceKind = panelDisplayUp
      ? DISPLAY_SOURCE_NODE_TYPES[String(nodeMap.get(panelDisplayUp.srcId)?.data.nodeType ?? '')]
      : null
    const panelClockExpr = panelSourceKind === 'clock' && panelDisplayUp
      ? `n_${safeId(panelDisplayUp.srcId)}_dateTime`
      : null
    // The other source a normal sketch can fill a bound widget from: the
    // fixture this sketch is driving, read the same way the fixed LED
    // Status layout above reads it.
    const panelLedStatus = panelSourceKind === 'ledOutput' && panelDisplayUp
      ? ledStatusEmit(nodeMap.get(panelDisplayUp.srcId))
      : null

    if (document && customDisplayOwners.has(node.id)) {
      // One glass, one symbol stem. Shared drawings use the panel id;
      // a drawing one panel shows keeps the document id existing sketches name.
      const instanceId = safeId(displayRuntimeId(node.id, documentId, nodes))
      const assetStem = safeId(documentId)
      const ports = displayDocumentPorts(document)
      const widgetInputExpr = (up: { srcId: string; srcPort: string } | undefined, dataType: string | undefined): string | null => {
        if (!up) return null
        const varExpr = `n_${safeId(up.srcId)}_${safeId(up.srcPort)}`
        if (dataType === 'color') {
          return `(((uint32_t)(${varExpr}).r << 16) | ((uint32_t)(${varExpr}).g << 8) | (uint32_t)(${varExpr}).b)`
        }
        return varExpr
      }
      const bindingsByWidget: Record<string, CustomDisplayLvglBinding[]> = {}
      for (const port of ports.inputs) {
        const parsed = parseDisplayWidgetPortId(port.id)
        if (!parsed) continue
        const expr = widgetInputExpr(incoming.get(`${node.id}:${port.id}`), port.dataType)
        if (expr === null) continue
        const bindings = bindingsByWidget[parsed.widgetId] ?? (bindingsByWidget[parsed.widgetId] = [])
        bindings.push({ role: parsed.role, expression: expr })
      }
      /*
       * Widgets reading the panel's own source rather than a cable.
       *
       * A normal sketch can answer for a clock and for the fixture it
       * drives. Not a player: one in a normal sketch renders as a black
       * fill, so its fields are the same blanks the fixed layouts above
       * already leave. A field this sketch has no reading for is reported
       * by name rather than filled in.
       */
      const sourceExpressions = normalSketchSourceExpressions(
        panelClockExpr, panelLedStatus,
        panelSourceKind === 'powerMonitor' ? powerMonitorExpressions(panelDisplayUp?.srcId) : null,
      )
      for (const bound of resolveBoundWidgets(p.widgetSources, sourceExpressions).bindings) {
        const bindings = bindingsByWidget[bound.widgetId] ?? (bindingsByWidget[bound.widgetId] = [])
        bindings.push({ role: bound.role as CustomDisplayLvglBinding['role'], expression: bound.expression })
      }

      /*
       * What each control reads before anyone touches it.
       *
       * A widget's value is runtime state the document does not store, so
       * a build started every control at zero: a slider wired to an LED
       * output's brightness reported 0 and the strip stayed dark, on a
       * panel that may not even be fitted yet. The app seeds a new control
       * from the property it drives for exactly this reason
       * (`connectTouchControl`), and this is that same value reaching
       * firmware — read through the one panel-to-Touch-to-edge walk rather
       * than a second opinion about which wire a widget is on.
       */
      const initialValues: Record<string, number | boolean> = {}
      for (const [widgetId, controlEdge] of displayControlEdges(documentId, nodes, edges, node.id)) {
        const target = nodeMap.get(controlEdge.target)
        const key = controlEdge.targetHandle ?? ''
        if (!target || !key) continue
        const driven = propertyInputsFor(target.data.nodeType)
          .find((port) => port.id === key)?.propertyKey ?? key
        const current = (target.data.properties as Record<string, unknown>)[driven]
        if (typeof current === 'number' && Number.isFinite(current)) initialValues[widgetId] = current
        else if (typeof current === 'boolean') initialValues[widgetId] = current
      }

      const custom: CustomDisplayLvglEmit = {
        id: instanceId,
        ...(assetStem === instanceId ? {} : { assetId: assetStem }),
        document,
        bindings: bindingsByWidget,
        // Keyed by the design, because the artwork belongs to the screen
        // rather than to the glass it happens to be drawn on.
        assets: opts.customDisplayAssets?.[documentId],
        initialValues,
        // The panel's Screen input, when the design has screens to choose
        // and something chooses between them.
        ...(() => {
          const screenExpr = widgetInputExpr(incoming.get(`${node.id}:${DISPLAY_SCREEN_INPUT_ID}`), 'float')
          return screenExpr ? { screenExpr } : {}
        })(),
      }
      const touchNode = nodes.find((entry) => entry.data.nodeType === 'TouchInput'
        && String((entry.data.properties as Record<string, unknown>).panelId ?? '') === node.id)
      const touchProps = (touchNode?.data.properties ?? {}) as Record<string, unknown>
      const panel = customDisplayPanelFromProps(id, p, touchProps)
      panel.manualTouch = true
      panel.telemetry = emitTelemetry
      // The same Enabled the fixed layouts below already honour. Without
      // it this arm emitted setup, touch sampling and publication whatever
      // the panel's switch said, so turning a custom screen off produced
      // byte-for-byte identical firmware.
      panel.enabledExpr = incoming.get(`${node.id}:enabled`)
        ? boolExpr(node.id, 'enabled')
        : (p.enabled === false ? 'false' : 'true')
      const gate = `_cdPanelOn_${panel.id}`
      customDisplays.push(custom)
      // A dark panel invalidates nothing, so LVGL redraws nothing and the
      // bus stays quiet; re-enabling resumes from the image already on it.
      customDisplayPublication.push(
        ...(panel.enabledExpr === 'true'
          ? customDisplayLvglLoopCpp(custom)
          : [`  if (${gate}) {`, ...customDisplayLvglLoopCpp(custom).map((line) => `  ${line}`), `  }`]),
      )

      for (const port of ports.outputs) {
        const parsed = parseDisplayWidgetPortId(port.id)
        if (!parsed) continue
        const expr = customDisplayLvglOutputExpression(custom, parsed.widgetId)
        if (expr === null) continue
        // A Colour Picker's colour is a CRGB, as every colour wire is here.
        const cppType = port.dataType === 'bool' ? 'bool' : port.dataType === 'color' ? 'CRGB' : 'float'
        if (!touchNode) continue
        // Named for the Touch node, because that is the node a wire leaves:
        // the panel draws the widget, but the touch surface publishes the
        // control value.
        const name = `n_${safeId(touchNode.id)}_${safeId(port.id)}`
        const rest = cppType === 'bool' ? 'false' : cppType === 'CRGB' ? 'CRGB::Black' : '0.0f'
        // A control nobody can touch reports its rest value rather than
        // the position its finger left it in.
        const value = panel.enabledExpr === 'true' ? expr : `${gate} ? (${expr}) : ${rest}`
        if (nativeMultiRender) globalLines.push(`static ${cppType} ${name};`)
        customDisplaySamples.push(`  ${nativeMultiRender ? '' : `${cppType} `}${name} = ${value};`)
      }

      customDisplayPanels.push(panel)
      setupLines.push(...customDisplayPanelSetupCpp(panel), ...customDisplayLvglSetupCpp(custom))
      // Emitted at this node's own place in the walk, so a wired Enabled
      // has been computed by the time it is read.
      for (const line of customDisplayPanelEnableCpp(panel)) ln(line)
      // The design's role-stamped controls, on the Touch node's Controls:
      // the same bundle the preview builds, from the samples above. The
      // topological walk already orders this node ahead of any reader,
      // since a Touch node's edges are credited to its panel.
      if (touchNode && edges.some((e) => e.source === touchNode.id && e.sourceHandle === 'controls')) {
        const touchId = safeId(touchNode.id)
        const outputs = new Map(ports.outputs.map((port) => [port.id, port]))
        for (const line of playerControlsServiceCpp(designControlBundleEmit(
          touchId, `n_${touchId}_controls`,
          designControlBundle(node, document, nodes, edges, touchNode.id),
          (portId) => (outputs.has(portId) ? `n_${touchId}_${safeId(portId)}` : null),
          (widgetId) => customDisplayLvglTapExpression(custom, widgetId),
        ))) ln(line)
        playerControlNodes.push(touchId)
      }
      return
    }

    // Fixed layouts, from `display`. A normal sketch answers for a clock
    // the same way the OLED does — the wired RTCInput's own
    // `_RtcDateTimeValue` — and for nothing else; wiring arbitrary
    // readings onto a panel is what a wired Custom Display is for above,
    // not a fixed layout's job.
    const displayUp = incoming.get(`${node.id}:display`)
    const displaySource = displayUp && nodeMap.get(displayUp.srcId)
    const kind = displaySource
      ? DISPLAY_SOURCE_NODE_TYPES[String(displaySource.data.nodeType ?? '')]
      : undefined
    const clockExpr = kind === 'clock' && displayUp
      ? `n_${safeId(displayUp.srcId)}_dateTime`
      : null
    const layout: TransportDisplayLayout = asTransportDisplayLayout(p.tftLayout) === 'Diagnostics'
      ? 'Diagnostics'
      // Deliberately not narrowed to the kinds a normal sketch can fill.
      // A colour panel's layout carries touch regions as well as content,
      // and Fixed Transport's finger-sized buttons driving a Juggle in a
      // player-less sketch is a supported shape: the rows read blank and
      // the glass still works.
      : (kind ? transportLayoutForKind(kind, p.tftLayout) : null) ?? 'Waiting'
    const controller = tftControllerForProps(p) ?? TFT_CONTROLLERS.ST7789
    const rotation = asTftRotation(p.tftRotation)
    // A panel can read touch without naming a digitiser: a bare resistive
    // sheet has no controller at all, so asking only for one read this
    // board as having no touch and emitted the panel without its read.
    const touchCapable = displayHasTouch(String(p.partId ?? ''))
    const diagnosticTouch = layout === 'Diagnostics' && touchCapable
    const touchNode = touchCapable
      ? nodes.find((entry) => entry.data.nodeType === 'TouchInput'
        && String((entry.data.properties as Record<string, unknown>).panelId ?? '') === node.id)
      : undefined
    // A design set aside for this fixed layout keeps its wires; whatever
    // they feed reads the widgets at rest, the value a switched-off
    // panel's controls report. Declared only where something reads them.
    const restingTouch = nodes.find((entry) => entry.data.nodeType === 'TouchInput'
      && String((entry.data.properties as Record<string, unknown>).panelId ?? '') === node.id)
    if (restingTouch && String(p.displayId ?? '')) {
      for (const port of (restingTouch.data.outputs as { id: string; dataType?: string }[] | undefined) ?? []) {
        if (parseDisplayWidgetPortId(port.id)?.role !== 'out') continue
        if (!edges.some((e) => e.source === restingTouch.id && e.sourceHandle === port.id)) continue
        ln(port.dataType === 'bool'
          ? `  bool n_${safeId(restingTouch.id)}_${safeId(port.id)} = false;`
          : `  float n_${safeId(restingTouch.id)}_${safeId(port.id)} = 0.0f;`)
      }
    }
    const directVars: Record<string, { variable: string; dataType: 'bool' | 'float' }> = {}
    if (touchNode) {
      const touchId = safeId(touchNode.id)
      for (const edge of edges) {
        if (edge.source !== touchNode.id) continue
        const action = edge.sourceHandle as TransportTouchAction
        if (!action || !TRANSPORT_TOUCH_ACTION_TYPES[action]) continue
        const dataType = TRANSPORT_TOUCH_ACTION_TYPES[action]
        const varName = `n_${touchId}_${safeId(action)}`
        if (directVars[action]) continue
        directVars[action] = { variable: varName, dataType }
      }
    }
    // A panel samples touch when Diagnostics needs raw coordinates, when
    // the Controls bundle is wired, or when a fixed-layout action is wired
    // directly. The listening is no longer done through a port on the panel
    // — a display has no outputs — so the question is whether the Touch
    // node sharing this module has any of those outputs wired. The pins are
    // still the panel's, because the digitiser's lines are wiring on this
    // module.
    const publishesControls = Boolean(touchNode
      && edges.some((e) => e.source === touchNode.id && e.sourceHandle === 'controls'))
    const publishesDirectControls = Object.keys(directVars).length > 0
    const emit: TftDisplayEmit = {
      id,
      controller,
      rotation,
      layout,
      csPin: intProp(p.csPin, 5, 0, MAX_PIN_NUMBER),
      dcPin: intProp(p.dcPin, 16, 0, MAX_PIN_NUMBER),
      resetPin: intProp(p.resetPin, 17, 0, MAX_PIN_NUMBER),
      sckPin: intProp(p.sckPin, 18, 0, MAX_PIN_NUMBER),
      mosiPin: intProp(p.mosiPin, 23, 0, MAX_PIN_NUMBER),
      // A line the fitted module does not have is not wired, whatever the
      // property still holds from another module. The XC4630 has no BL pin
      // at all, and emitting the stored default put its backlight on the
      // same GPIO as a data line - a collision no pin check could see,
      // because an ungated property is never claimed in the first place.
      backlightPin: transportDisplayPinKeysForProps(p).includes('backlightPin')
        ? intProp(p.backlightPin, 4, 0, MAX_PIN_NUMBER)
        : NO_PIN,
      enabledExpr: incoming.get(`${node.id}:enabled`)
        ? boolExpr(node.id, 'enabled')
        : (p.enabled === false ? 'false' : 'true'),
      dateTimeExpr: clockExpr,
      // A player screen is not answerable in a normal sketch, so these
      // are the blanks Waiting/Clock/Diagnostics never read. They stay on
      // the emit type rather than becoming optional because the two
      // template generators do fill them.
      titleExpr: null,
      artistExpr: null,
      patternNameExpr: null,
      elapsedExpr: '0.0f',
      durationExpr: '0.0f',
      progressExpr: '0.0f',
      playingExpr: 'false',
      volumeExpr: '0.0f',
      patternIndexExpr: '0.0f',
      patternCountExpr: '0.0f',
      browsingExpr: 'false',
      highlightNameExpr: null,
      highlightIndexExpr: '0.0f',
      powerMonitor: kind === 'powerMonitor' ? powerMonitorExpressions(displayUp?.srcId) : undefined,
      ledStatus: kind === 'ledOutput' ? ledStatusEmit(displaySource) : undefined,
      diagnosticTouch,
    }
    // No artwork table here. Now Playing is a player screen and a player
    // in a normal sketch renders as a black fill, so this generator can
    // never resolve that layout — the two template generators bake and
    // emit the pictures instead.
    // Which bus this module speaks, and - for a bare sheet - which of its
    // own lines the read borrows. Both come from the part rather than from
    // anything the graph says, because they are facts about the module.
    const tftTransport = tftTransportForProps(p)
    if (tftTransport === 'parallel') {
      emit.parallel = {
        dataPins: Array.from({ length: 8 }, (_, bit) =>
          intProp(p[`d${bit}Pin`], bit, 0, MAX_PIN_NUMBER)),
        wrPin: intProp(p.wrPin, 33, 0, MAX_PIN_NUMBER),
        rdPin: intProp(p.rdPin, 34, 0, MAX_PIN_NUMBER),
      }
    }
    tftDisplays.push(emit)
    if (diagnosticTouch || publishesControls || publishesDirectControls) {
      const touchProps = (touchNode?.data.properties ?? {}) as Record<string, unknown>
      const touch: TftTouchEmit = {
        id, controller, rotation, layout, enabledExpr: `_tftOn_${id}`,
        telemetry: emitTelemetry,
        touch: {
          ...xptTouchPinsForProps(p),
          // Calibration belongs to the glass, so it is read from the Touch
          // node when there is one. A panel showing its own Diagnostics
          // screen with no Touch node beside it still needs bounds, and
          // falls back to the library defaults.
          // Oriented, not raw: a reversed axis is emitted as a descending
          // span so the firmware's one linear map covers both directions.
          ...emittedTouchBounds(touchProps),
        },
        // The electrode map names which panel property plays each role, so
        // the four are read from the panel - they are its lines, borrowed.
        ...(tftTransport === 'parallel'
          ? {
            resistive: {
              xpPin: intProp(p[PARALLEL_TOUCH_ELECTRODES.xp], 7, 0, MAX_PIN_NUMBER),
              xmPin: intProp(p[PARALLEL_TOUCH_ELECTRODES.xm], 9, 0, MAX_PIN_NUMBER),
              ypPin: intProp(p[PARALLEL_TOUCH_ELECTRODES.yp], 5, 0, MAX_PIN_NUMBER),
              ymPin: intProp(p[PARALLEL_TOUCH_ELECTRODES.ym], 8, 0, MAX_PIN_NUMBER),
            },
          }
          : {}),
      }
      tftTouches.push(touch)
      setupLines.push(...tftTouchSetupCpp(touch))
      for (const { variable, dataType } of Object.values(directVars)) {
        if (dataType === 'bool') {
          ln(`  bool ${variable} = false;`)
        } else {
          ln(`  float ${variable} = 0.0f;`)
        }
      }
      if (publishesControls && touchNode) {
        // Named for the Touch node, because that is what downstream reads:
        // the bundle is this glass's output, and the panel is only where
        // the digitiser happens to be wired.
        const touchId = safeId(touchNode.id)
        const bundle = `n_${touchId}_controls`
        playerControlNodes.push(touchId)
        ln(`  PlayerControlsValue ${bundle};`)
        const sink = publishesDirectControls
          ? { kind: 'bundleDirect' as const, variable: bundle, variables: directVars }
          : { kind: 'bundle' as const, variable: bundle }
        for (const line of tftTouchServiceCpp(touch, sink)) ln(line)
      } else if (publishesDirectControls) {
        for (const line of tftTouchServiceCpp(touch, { kind: 'direct', variables: directVars })) ln(line)
      } else {
        for (const line of tftTouchServiceCpp(touch)) ln(line)
      }
    }
    for (const line of tftDisplaySetupCpp(emit)) setupLines.push(line)
    for (const line of tftDisplayLoopCpp(emit)) ln(line)
  },
  SegmentDisplay({ node, id, p, ln, ledStatusEmit, incoming, nodeMap, intProp, boolExpr, setupLines, segmentDisplays }) {
    // Same one input as the OLED, same one source a normal sketch has.
    const displayUp = incoming.get(`${node.id}:display`)
    const displaySource = displayUp && nodeMap.get(displayUp.srcId)
    const segKind = displaySource
      ? DISPLAY_SOURCE_NODE_TYPES[String(displaySource.data.nodeType ?? '')]
      : undefined
    const segClockExpr = segKind === 'clock' && displayUp
      ? `n_${safeId(displayUp.srcId)}_dateTime`
      : null
    const segCtl = segmentControllerFor(partById(String(p.partId ?? ''))?.display?.controller)
    const isMax = segCtl.id === 'MAX7219'
    const emit: SegmentDisplayEmit = {
      id,
      controller: isMax ? 'MAX7219' : 'TM1637',
      digits: segCtl.digits,
      clkPin: intProp(p.clkPin, 18, 0, MAX_PIN_NUMBER),
      dataPin: isMax ? intProp(p.dinPin, 19, 0, MAX_PIN_NUMBER) : intProp(p.dioPin, 19, 0, MAX_PIN_NUMBER),
      csPin: intProp(p.csPin, 21, 0, MAX_PIN_NUMBER),
      brightness: clampSegmentBrightness(p.brightness, segCtl),
      mode: segKind && SKETCH_DISPLAY_SOURCE_KINDS.includes(segKind) ? segmentModeForKind(segKind) : 'Waiting',
      powerMonitor: segKind === 'powerMonitor' ? powerMonitorExpressions(displayUp?.srcId) : undefined,
      ledStatus: segKind === 'ledOutput' ? ledStatusEmit(displaySource) : undefined,
      showColon: p.showColon !== false,
      valueExpr: '0.0f',
      dateTimeExpr: segClockExpr,
      enabledExpr: incoming.get(`${node.id}:enabled`)
        ? boolExpr(node.id, 'enabled')
        : (p.enabled === false ? 'false' : 'true'),
    }
    segmentDisplays.push(emit)
    for (const line of segmentDisplaySetupCpp(emit)) setupLines.push(line)
    for (const line of segmentDisplayLoopCpp(emit)) ln(line)
  },
  MatrixOutput({ node, id, ln, srcBuf, outputRuntimeEmit, incoming, nodeMap, isMirrorOf, multipleOutputs, nativeMultiRender, hw, isHub75, hub75Hw, xyTable, ss, rs, shape, physLeds, outputConfigs, aliasedTerminalId, pressButton, stereoVuMeters, playerControlNodes, ledLatchOutputs }) {
    const mirrorOf = isMirrorOf(node)
    if (mirrorOf) {
      const leader = nodeMap.get(mirrorOf)
      ln(`  // ${cppComment(String(node.data.label ?? 'LED output'))} is wired in parallel with`)
      ln(`  // ${cppComment(String(leader?.data.label ?? 'the first output'))} on the same pin — same wire, same pixels.`)
      return
    }
    const multiRoute = multipleOutputs
      ? outputConfigs.find((candidate) => candidate.id === node.id)!
      : null
    if (nativeMultiRender && multiRoute) {
      ln(`  if constexpr (RENDER_PASS == ${multiRoute.passIndex}) {`)
    }
    // Before anything reads _ledOn_/_ledLevel_ below. Topological order
    // puts the node that built the bundle earlier in the same loop body,
    // so it is a local in scope here.
    const directActionPorts = ['ledToggle', 'brightnessUp', 'brightnessDown'] as const
    const directButtons = directActionPorts
      .filter((port) => incoming.has(`${node.id}:${port}`))
      .map((port) => pressButton(node.id, port, port !== 'ledToggle'))
    if (directButtons.length > 0) {
      const directId = `${id}_direct`
      const variable = `n_${directId}_controls`
      for (const line of playerControlsServiceCpp({
        id: directId,
        variable,
        upstream: null,
        buttons: directButtons,
        volumeExpr: null,
        brightnessExpr: null,
        patternPositionExpr: null,
        // The preview's settings: a contact is debounced, and pressButton
        // marks a computed source to skip it (state/player/pressSource.ts).
        settings: normalizeButtonEdgeSettings({}),
        volumeStep: 0.05,
        brightnessStep: 0.05,
      })) ln(line)
      playerControlNodes.push(directId)
      if (!ledLatchOutputs.includes(id)) ledLatchOutputs.push(id)
      for (const line of ledOutputLatchCpp({ id, controls: variable })) ln(line)
    }
    const controlsWire = incoming.get(`${node.id}:controls`)
    if (controlsWire) {
      if (!ledLatchOutputs.includes(id)) ledLatchOutputs.push(id)
      for (const line of ledOutputLatchCpp({
        id, controls: `n_${safeId(controlsWire.srcId)}_${safeId(controlsWire.srcPort)}`,
      })) ln(line)
    }
    const src = srcBuf('frame')
    if (isHub75) {
      for (const line of hub75OutputRuntimeCpp(outputRuntimeEmit(node, '', ''), hw.brightness)) ln(line)
      if (!src) {
        ln(`  dma_display->clearScreen();`)
      } else {
        for (const line of hub75BlitRowsCpp(hub75Hw!, `${src}[_y * WIDTH + _x]`)) ln(line)
      }
      return
    }
    if (multipleOutputs) {
      const route = multiRoute!
      const leds = `leds_${route.safeId}`
      const xy = route.xyTable ? `XY_${route.safeId}(_x, _y)` : `_y * ${route.width} + _x`
      if (!src) {
        ln(`  fill_solid(${leds}, ${route.ledTotal}, CRGB::Black);`)
      } else if (route.shape) {
        for (const line of shapeCopyCpp(route.shape, {
          src, leds, table: shapeTableName(route.shape.kind, `_${route.safeId}`), count: String(route.shape.ledCount),
          srcW: 'WIDTH', srcH: 'HEIGHT', post: `_c.nscale8_video(${route.hardware.brightness});`,
        })) ln(line)
      } else if (route.routeMode === 'native' && route.renderScale < 1) {
        for (const line of renderScaleUpscaleCpp({
          src, srcW: 'WIDTH', srcH: 'HEIGHT', dstW: String(route.width), dstH: String(route.height),
          leds, dstIndex: xy, post: `_c.nscale8_video(${route.hardware.brightness});`,
        })) ln(line)
      } else if (route.routeMode === 'native' && route.supersample > 1) {
        const ssFactor = route.supersample
        ln(`  for (int _y = 0; _y < ${route.height}; _y++) for (int _x = 0; _x < ${route.width}; _x++) {`)
        ln(`    uint16_t _r = 0, _g = 0, _b = 0;`)
        ln(`    for (int _sy = 0; _sy < ${ssFactor}; _sy++) for (int _sx = 0; _sx < ${ssFactor}; _sx++) {`)
        ln(`      CRGB _p = ${src}[(_y * ${ssFactor} + _sy) * WIDTH + (_x * ${ssFactor} + _sx)]; _r += _p.r; _g += _p.g; _b += _p.b;`)
        ln(`    }`)
        ln(`    CRGB _c(_r / ${ssFactor * ssFactor}, _g / ${ssFactor * ssFactor}, _b / ${ssFactor * ssFactor}); _c.nscale8_video(${route.hardware.brightness});`)
        ln(`    ${leds}[${xy}] = _c;`)
        ln(`  }`)
      } else if (route.routeMode === 'native') {
        ln(`  for (int _y = 0; _y < ${route.height}; _y++) for (int _x = 0; _x < ${route.width}; _x++) {`)
        ln(`    CRGB _c = ${src}[_y * WIDTH + _x]; _c.nscale8_video(${route.hardware.brightness});`)
        ln(`    ${leds}[${xy}] = _c;`)
        ln(`  }`)
      } else if (route.routeMode === 'crop') {
        ln(`  for (int _y = 0; _y < ${route.height}; _y++) for (int _x = 0; _x < ${route.width}; _x++) {`)
        ln(`    int _sx = (${route.routeX} + _x) % WIDTH, _sy = (${route.routeY} + _y) % HEIGHT;`)
        ln(`    CRGB _c = ${src}[_sy * WIDTH + _sx]; _c.nscale8_video(${route.hardware.brightness});`)
        ln(`    ${leds}[${xy}] = _c;`)
        ln(`  }`)
      } else {
        ln(`  for (int _y = 0; _y < ${route.height}; _y++) for (int _x = 0; _x < ${route.width}; _x++) {`)
        ln(`    int _x0 = _x * WIDTH / ${route.width}, _x1 = (_x + 1) * WIDTH / ${route.width};`)
        ln(`    int _y0 = _y * HEIGHT / ${route.height}, _y1 = (_y + 1) * HEIGHT / ${route.height};`)
        ln(`    if (_x1 <= _x0) _x1 = _x0 + 1; if (_y1 <= _y0) _y1 = _y0 + 1;`)
        ln(`    uint32_t _r = 0, _g = 0, _b = 0, _n = 0;`)
        ln(`    for (int _sy = _y0; _sy < min(HEIGHT, _y1); _sy++) for (int _sx = _x0; _sx < min(WIDTH, _x1); _sx++) { CRGB _p = ${src}[_sy * WIDTH + _sx]; _r += _p.r; _g += _p.g; _b += _p.b; _n++; }`)
        ln(`    CRGB _c = _n ? CRGB(_r / _n, _g / _n, _b / _n) : CRGB::Black; _c.nscale8_video(${route.hardware.brightness});`)
        ln(`    ${leds}[${xy}] = _c;`)
        ln(`  }`)
      }
      for (const line of ledOutputRuntimeCpp(outputRuntimeEmit(node, leds, String(route.ledTotal)))) ln(line)
      if (nativeMultiRender) ln(`  }`)
      return
    }
    if (!src) {
      ln(`  fill_solid(leds, ${physLeds}, CRGB::Black);`)
    } else if (shape) {
      for (const line of shapeCopyCpp(shape, {
        src, leds: 'leds', table: shapeTableName(shape.kind), count: SHAPE_COUNT_MACRO[shape.kind], srcW: 'WIDTH', srcH: 'HEIGHT',
      })) ln(line)
    } else if (rs) {
      for (const line of renderScaleUpscaleCpp({
        src, srcW: 'WIDTH', srcH: 'HEIGHT', dstW: 'PANEL_W', dstH: 'PANEL_H',
        leds: 'leds', dstIndex: xyTable ? 'XY(_x, _y)' : '_y * PANEL_W + _x',
      })) ln(line)
    } else if (ss) {
      // Average each SS×SS block of the render buffer into one physical LED.
      const dst = xyTable ? 'XY(_x, _y)' : `_y * PANEL_W + _x`
      ln(`  for (int _y = 0; _y < PANEL_H; _y++) for (int _x = 0; _x < PANEL_W; _x++) {`)
      ln(`    uint16_t _r = 0, _g = 0, _b = 0;`)
      ln(`    for (int _sy = 0; _sy < SS; _sy++) for (int _sx = 0; _sx < SS; _sx++) {`)
      ln(`      CRGB _c = ${src}[(_y * SS + _sy) * WIDTH + (_x * SS + _sx)];`)
      ln(`      _r += _c.r; _g += _c.g; _b += _c.b;`)
      ln(`    }`)
      ln(`    leds[${dst}] = CRGB(_r / (SS * SS), _g / (SS * SS), _b / (SS * SS));`)
      ln(`  }`)
    } else if (xyTable) {
      ln(`  for (int _y = 0; _y < HEIGHT; _y++) for (int _x = 0; _x < WIDTH; _x++) leds[XY(_x, _y)] = ${src}[_y * WIDTH + _x];`)
    } else if (src !== `buf_${aliasedTerminalId()}`) {
      ln(`  ::memmove(leds, ${src}, sizeof(CRGB) * NUM_LEDS);`)
    }
    for (const line of ledOutputRuntimeCpp(outputRuntimeEmit(node, 'leds', String(physLeds)))) ln(line)
    if (stereoVuMeters.length === 0) ln(`  FastLED.show();`)
  },
  StereoVuMeter({ id, ln, stereoVuMeters }) {
    const meter = stereoVuMeters.find((candidate) => candidate.id === id)
    if (meter) ln(stereoVuLoopCpp(meter))
    else ln(`  // Stereo VU Meter omitted: no reachable, resolved Audio connection.`)
  },
  // DDP: the frame in 480-pixel packets, each a 10-byte header (flags with
  // push on the last, sequence, RGB8 type, destination 1, byte offset,
  // length) over the shared network. Adalight: "Ada", a count and checksum,
  // then the bytes, on the USB serial at the chosen baud.
  StreamOutput({ node, id, p, ln, srcBuf, intProp, setupLines, globalLines, incoming }) {
    const src = srcBuf('frame')
    if (!src || !incoming.has(`${node.id}:frame`)) { ln(`  // Frame Stream: nothing wired in`); return }
    if (streamProtocol(p.streamProtocol) === 'adalight') {
      const baud = adalightBaud(p.baud)
      setupLines.push(`  Serial.begin(${baud});  // Adalight frame stream`)
      ln(`  { // Frame Stream (Adalight)`)
      ln(`    uint16_t _n=NUM_LEDS-1; uint8_t _hi=(uint8_t)(_n>>8),_lo=(uint8_t)(_n&0xFF),_hdr[6]={'A','d','a',_hi,_lo,(uint8_t)(_hi^_lo^0x55)};`)
      ln(`    Serial.write(_hdr,6); Serial.write((const uint8_t*)${src},NUM_LEDS*3); }`)
      return
    }
    const host = parseIpv4Literal(p.host) ?? [192, 168, 1, 50]
    const port = intProp(p.port, DDP_PORT, 1, 65535)
    globalLines.push(`#if FLS_NET_SUPPORTED`)
    globalLines.push(`WiFiUDP _streamUdp_${id};`)
    globalLines.push(`#endif`)
    setupLines.push(`#if FLS_NET_SUPPORTED`)
    setupLines.push(`  _streamUdp_${id}.begin(0);`)
    setupLines.push(`#endif`)
    ln(`  _netEnsureConnected();`)
    ln(`#if FLS_NET_SUPPORTED`)
    ln(`  if (_netConnected()) { // Frame Stream (DDP)`)
    ln(`    static uint8_t _seq_${id}=1; const IPAddress _host(${host.join(', ')});`)
    ln(`    for (int _off=0; _off<NUM_LEDS; _off+=${DDP_CHUNK_PIXELS}) {`)
    ln(`      int _cnt=min(${DDP_CHUNK_PIXELS}, NUM_LEDS-_off); uint32_t _bo=(uint32_t)_off*3u; uint16_t _bl=(uint16_t)(_cnt*3);`)
    ln(`      uint8_t _hdr[10]={(uint8_t)(0x40|((_off+_cnt>=NUM_LEDS)?0x01:0)),_seq_${id},${DDP_DATA_TYPE_RGB8},1,(uint8_t)(_bo>>24),(uint8_t)(_bo>>16),(uint8_t)(_bo>>8),(uint8_t)_bo,(uint8_t)(_bl>>8),(uint8_t)_bl};`)
    ln(`      _streamUdp_${id}.beginPacket(_host, ${port}); _streamUdp_${id}.write(_hdr, 10); _streamUdp_${id}.write((const uint8_t*)(${src}+_off), _bl); _streamUdp_${id}.endPacket();`)
    ln(`    }`)
    ln(`    _seq_${id}=(uint8_t)(_seq_${id}%15+1);`)
    ln(`  }`)
    ln(`#endif`)
  },
  // Three PWM channels for one colour, through the ESP32's LEDC on either
  // core generation or analogWrite elsewhere; a common-anode strip is
  // driven inverted. The channels live in their own block so two strips
  // never share one.
  AnalogStripOutput({ id, p, ln, f, channelColor, pinSetupLines, setupLines }) {
    const rPin = sanitizePin(p.rPin, 25), gPin = sanitizePin(p.gPin, 26), bPin = sanitizePin(p.bPin, 27)
    const hz = Math.max(ANALOG_PWM_HZ.min, Math.min(ANALOG_PWM_HZ.max, Math.round(Number(p.pwmHz) || ANALOG_PWM_HZ.default)))
    const invert = Boolean(p.commonAnode)
    for (const pin of [rPin, gPin, bPin]) pinSetupLines.add(`  pinMode(${pin}, OUTPUT);`)
    setupLines.push(`#if defined(ESP32) && defined(ESP_ARDUINO_VERSION_MAJOR) && ESP_ARDUINO_VERSION_MAJOR >= 3`)
    setupLines.push(`  ledcAttach(${rPin}, ${hz}, 8); ledcAttach(${gPin}, ${hz}, 8); ledcAttach(${bPin}, ${hz}, 8);`)
    setupLines.push(`#elif defined(ESP32)`)
    setupLines.push(`  ledcSetup(13, ${hz}, 8); ledcAttachPin(${rPin}, 13); ledcSetup(14, ${hz}, 8); ledcAttachPin(${gPin}, 14); ledcSetup(15, ${hz}, 8); ledcAttachPin(${bPin}, 15);`)
    setupLines.push(`#endif`)
    ln(`  { // Analog RGB Strip`)
    ln(`    CRGB _c=${channelColor('color', 255, 96, 0)}; float _br=constrain(${f('brightness', 'brightness', 1)},0.0f,1.0f);`)
    ln(`    uint8_t _r=(uint8_t)(_c.r*_br),_g=(uint8_t)(_c.g*_br),_b=(uint8_t)(_c.b*_br);`)
    if (invert) ln(`    _r=255-_r; _g=255-_g; _b=255-_b;`)
    ln(`#if defined(ESP32) && defined(ESP_ARDUINO_VERSION_MAJOR) && ESP_ARDUINO_VERSION_MAJOR >= 3`)
    ln(`    ledcWrite(${rPin}, _r); ledcWrite(${gPin}, _g); ledcWrite(${bPin}, _b);`)
    ln(`#elif defined(ESP32)`)
    ln(`    ledcWrite(13, _r); ledcWrite(14, _g); ledcWrite(15, _b);`)
    ln(`#else`)
    ln(`    analogWrite(${rPin}, _r); analogWrite(${gPin}, _g); analogWrite(${bPin}, _b);`)
    ln(`#endif`)
    ln(`  }`)
    void id
  },
  MasterSpeed() {
    // Emitted by the loop's clock, not here: it changes what `t` is rather
    // than computing anything of its own. Its wired source still has to be
    // emitted, which is why it is a walk root above.
  },
}
