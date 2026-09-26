import { type SegmentDisplayEmit, segmentDisplaySetupCpp, segmentDisplayLoopCpp } from '../../codegen/segmentDisplayCpp'
import { segmentControllerFor, clampSegmentBrightness, segmentModeForKind } from '../../state/segmentDisplay'
import { MAX_PIN_NUMBER, NO_PIN } from '../../state/boardGpio'
import {
  oledControllerForProps,
  oledTransportForProps,
  tftControllerForProps,
  transportDisplayPinKeysForProps,
  tftTransportForProps,
} from '../../state/nodeLibrary'
import { hub75OutputRuntimeCpp, ledOutputRuntimeCpp } from '../../codegen/ledOutputRuntimeCpp'
import { playerControlsServiceCpp, designControlBundleEmit, ledOutputLatchCpp } from '../../codegen/playerControlsCpp'
import { displayControlEdges } from '../../state/wireFirstControls'
import { propertyInputsFor } from '../../state/propertyInputs'
import {
  type InfoDisplayEmit,
  columnOffsetFor,
  infoDisplaySetupCpp,
  infoDisplayLoopCpp,
} from '../../codegen/infoDisplayCpp'
import { infoLayoutForKind } from '../../state/infoDisplay'
import { DISPLAY_SOURCE_NODE_TYPES, SKETCH_DISPLAY_SOURCE_KINDS } from '../../state/displaySignal'
import { type TftDisplayEmit, tftDisplaySetupCpp, tftDisplayLoopCpp } from '../../codegen/tftDisplayCpp'
import {
  shownDesignId,
  type TransportDisplayLayout,
  asTransportDisplayLayout,
  transportLayoutForKind,
} from '../../state/transportDisplay'
import { TFT_CONTROLLERS, asTftRotation, PARALLEL_TOUCH_ELECTRODES } from '../../state/tftSurface'
import { type TftTouchEmit, tftTouchSetupCpp, tftTouchServiceCpp } from '../../codegen/tftTouchCpp'
import {
  type CustomDisplayLvglBinding,
  type CustomDisplayLvglEmit,
  customDisplayLvglLoopCpp,
  customDisplayLvglOutputExpression,
  customDisplayLvglSetupCpp,
  customDisplayLvglTapExpression,
} from '../../codegen/customDisplayLvglCpp'
import {
  customDisplayPanelFromProps,
  customDisplayPanelSetupCpp,
  customDisplayPanelEnableCpp,
} from '../../codegen/customDisplayPanelCpp'
import { displayDocumentPorts, parseDisplayWidgetPortId } from '../../state/displayRegistry'
import { designControlBundle } from '../../state/designControlBundle'
import { resolveBoundWidgets, normalSketchSourceExpressions } from '../../codegen/displaySourceExpressions'
import { OLED_CONTROLLERS, asOledAddress, oledRotationCommands, asOledRotation } from '../../state/oledSurface'
import { displayHasTouch, partById } from '../../state/partCatalogue'
import { sanitizePin } from '../../codegen/hardwarePins'
import { type TransportTouchAction, TRANSPORT_TOUCH_ACTION_TYPES, emittedTouchBounds } from '../../state/transportTouch'
import { relayPinKeys } from '../../state/relayModule'
import { POWER_SWITCH_PIN_KEY, powerSwitchActiveHigh } from '../../state/powerSwitch'
import { stereoVuLoopCpp } from '../../codegen/stereoVuMeterCpp'
import type { NodeEmitters } from '../../codegen/emitContext'
import { safeId, cppComment } from '../../codegen/cppLiterals'
import { hub75BlitRowsCpp } from '../../codegen/hub75Cpp'

export const OUTPUT_EMITTERS: NodeEmitters = {
  RelayOutput({ node, p, ln, boolExpr, pinSetupLines }) {
    // These modules are active-low. Drive the inactive level into the
    // output latch before switching the pin to OUTPUT so reset/setup does
    // not produce a brief relay click.
    const fallbacks = [5, 16, 17, 18, 19, 21, 22, 23]
    for (const [index, key] of relayPinKeys(p.partId).entries()) {
      const pin = sanitizePin(p[key], fallbacks[index])
      pinSetupLines.add(`  digitalWrite(${pin}, HIGH);`)
      pinSetupLines.add(`  pinMode(${pin}, OUTPUT);`)
      ln(`  digitalWrite(${pin}, ${boolExpr(node.id, `channel${index + 1}`)} ? LOW : HIGH);`)
    }
  },
  PowerSwitchOutput({ node, p, ln, boolExpr, pinSetupLines }) {
    // The switch is active-high: the PC817's LED lights on a HIGH pin and
    // the MOSFET conducts. Latch LOW before enabling the output so the
    // load cannot pulse on during setup.
    const pin = sanitizePin(p[POWER_SWITCH_PIN_KEY], 25)
    const [on, off] = powerSwitchActiveHigh(p.partId) ? ['HIGH', 'LOW'] : ['LOW', 'HIGH']
    pinSetupLines.add(`  digitalWrite(${pin}, ${off});`)
    pinSetupLines.add(`  pinMode(${pin}, OUTPUT);`)
    ln(`  digitalWrite(${pin}, ${boolExpr(node.id, 'on')} ? ${on} : ${off});`)
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
    // A panel draws its own screen design when it has one, and one of the
    // fixed layouts otherwise (see
    // docs/development/design/large-displays-and-control-routing.md).
    // The design is named by the panel's `displayId` rather than wired in,
    // so there is no second content input to be exclusive with. Its widget
    // bindings and outputs stay keyed by the design's own id (matching
    // what any wire drawn from its ports already
    // expects) while the physical driver — struct instance, SPI pins,
    // LVGL display object — is keyed by this panel's id. Call order
    // matters: the panel's setup lines must precede the document's, since
    // LVGL creates widgets against whichever display was most recently
    // made the default.
    // The screen drawn on this panel, which the panel owns: no wire to
    // follow and no second node to find. The document id is still what
    // keys every widget symbol, so a design keeps its identifiers whatever
    // the panel is called.
    const documentId = shownDesignId(p)
    const document = documentId ? opts.displayDocuments?.[documentId] : undefined
    // Fixed layouts format their own fields. Only a screen-design Numeric
    // Readout calls the shared graph number formatter; Text and Timecode
    // use the LVGL runtime's own helpers.
    if (document?.widgets.some((widget) => widget.type === 'Numeric Readout')) {
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
      const docId = safeId(documentId)
      const ports = displayDocumentPorts(document)
      const widgetInputExpr = (up: { srcId: string; srcPort: string } | undefined, dataType: string | undefined): string | null => {
        if (!up || dataType === 'patternselect') return null
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
      for (const bound of resolveBoundWidgets(p.widgetSources, normalSketchSourceExpressions(panelClockExpr, panelLedStatus)).bindings) {
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
      for (const [widgetId, controlEdge] of displayControlEdges(documentId, nodes, edges)) {
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
        id: docId, document, bindings: bindingsByWidget,
        // Keyed by the design, because the artwork belongs to the screen
        // rather than to the glass it happens to be drawn on.
        assets: opts.customDisplayAssets?.[documentId],
        initialValues,
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
        const cppType = port.dataType === 'bool' ? 'bool' : 'float'
        if (!touchNode) continue
        // Named for the Touch node, because that is the node a wire leaves:
        // the panel draws the widget, but the touch surface publishes the
        // control value. The screen's own internals stay keyed by the
        // document id.
        const name = `n_${safeId(touchNode.id)}_${safeId(port.id)}`
        const rest = cppType === 'bool' ? 'false' : '0.0f'
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
          csPin: intProp(p.touchCsPin, 15, 0, MAX_PIN_NUMBER),
          irqPin: intProp(p.touchIrqPin, 2, 0, MAX_PIN_NUMBER),
          sckPin: intProp(p.touchSckPin, 18, 0, MAX_PIN_NUMBER),
          mosiPin: intProp(p.touchMosiPin, 23, 0, MAX_PIN_NUMBER),
          misoPin: intProp(p.touchMisoPin, 19, 0, MAX_PIN_NUMBER),
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
  MatrixOutput({ node, id, ln, srcBuf, outputRuntimeEmit, incoming, nodeMap, isMirrorOf, multipleOutputs, nativeMultiRender, hw, isHub75, hub75Hw, xyTable, ss, ringMap, corkscrewMap, physLeds, outputConfigs, aliasedTerminalId, pressButton, stereoVuMeters, playerControlNodes, ledLatchOutputs }) {
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
        settings: { debounceMs: 0, repeatDelayMs: 400, repeatIntervalMs: 120 },
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
      } else if (route.ringMap) {
        ln(`  for (int _i = 0; _i < ${route.ringMap.length}; _i++) {`)
        ln(`    CRGB _c = ${src}[pgm_read_word(&_ringmap_${route.safeId}[_i])]; _c.nscale8_video(${route.hardware.brightness});`)
        ln(`    ${leds}[_i] = _c;`)
        ln(`  }`)
      } else if (route.corkscrewMap) {
        ln(`  for (int _i = 0; _i < ${route.corkscrewMap.length}; _i++) {`)
        ln(`    CRGB _c = ${src}[pgm_read_word(&_corkscrewmap_${route.safeId}[_i])]; _c.nscale8_video(${route.hardware.brightness});`)
        ln(`    ${leds}[_i] = _c;`)
        ln(`  }`)
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
    } else if (ringMap) {
      ln(`  for (int _i = 0; _i < RING_LEDS; _i++) leds[_i] = ${src}[pgm_read_word(&_ringmap[_i])];`)
    } else if (corkscrewMap) {
      ln(`  for (int _i = 0; _i < CORKSCREW_LEDS; _i++) leds[_i] = ${src}[pgm_read_word(&_corkscrewmap[_i])];`)
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
    } else if (src !== `buf_${aliasedTerminalId}`) {
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
  MasterSpeed() {
    // Emitted by the loop's clock, not here: it changes what `t` is rather
    // than computing anything of its own. Its wired source still has to be
    // emitted, which is why it is a walk root above.
  },
}
