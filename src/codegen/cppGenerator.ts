import type { StudioNode, StudioEdge } from '../state/graphStore'
import type { GroupRegistry } from '../state/graphEvaluator'
import { resolvePaletteId, paletteCppRef, customPaletteDeclarationsCpp } from '../state/paletteCatalog'
import { scalarControlCpp, MAP_FLOAT_CPP } from './scalarControlCpp'
import { CPP_SHIM_HELPERS } from '../state/fastledShims'
import { displayTextCppHelpers } from './displayTextCpp'
import {
  type SegmentDisplayEmit,
  SEGMENT_DISPLAY_CPP_FORWARD,
  SEGMENT_DISPLAY_CPP_HELPERS,
  segmentDisplayGlobalCpp,
} from './segmentDisplayCpp'
import { MAX_PIN_NUMBER } from '../state/boardGpio'
import { ethernetModuleIn, DEFAULT_ETHERNET_PART_ID } from '../state/ethernetModule'
import { ETHERNET_INCLUDES_CPP, ethernetBootstrapCpp } from './ethernetCpp'
import {
  NODE_LIBRARY,
  resolveNodeScalarExpressions,
  HUB75_CHIPSET,
  oledTransportForProps,
  inputClampRange,
  isPaletteBuilderNodeType,
  nodeDisplayLabel,
  bypassPort,
  SPI_CHIPSETS,
  libraryDefaults,
} from '../state/nodeLibrary'
import { ledOutputManualExprs } from './ledOutputRuntimeCpp'
import { LED_OUTPUT_ACTION_PORTS, ledOutputStatus, LED_OUTPUT_RUNTIME_DEFAULT } from '../state/ledOutputRuntime'
import { type PlayerControlButtonEmit, PLAYER_CONTROLS_CPP, ledOutputLatchGlobalCpp } from './playerControlsCpp'
import { type IrRemoteProjectNode, irRemoteProjectEmission } from './irRemoteCpp'
import { type MasterSpeedEmit, masterClockLoopCpp, masterSpeedUpdateCpp } from './masterSpeedCpp'
import { clampMasterSpeed, MASTER_SPEED_DEFAULT, MASTER_SPEED_MIN, MASTER_SPEED_MAX } from '../state/masterSpeed'
import { transportArtworkTableCpp } from './transportArtworkCpp'
import {
  type InfoDisplayEmit,
  INFO_DISPLAY_CPP_FORWARD,
  infoDisplayHelpersCpp,
  infoDisplayGlobalCpp,
  infoDisplayStartupStageBatchCpp,
} from './infoDisplayCpp'
import {
  type TftDisplayEmit,
  TFT_DISPLAY_CPP_INCLUDES,
  TFT_DISPLAY_CPP_FORWARD,
  tftDisplayHelpersCpp,
  tftDisplayHelperProfile,
  tftDisplayGlobalCpp,
} from './tftDisplayCpp'
import { type TftTouchEmit, TFT_TOUCH_CPP_HELPERS, RESISTIVE_TOUCH_CPP_HELPERS, tftTouchGlobalCpp } from './tftTouchCpp'
import {
  customDisplayLvglTapExpression,
  type CustomDisplayLvglEmit,
  CUSTOM_DISPLAY_LVGL_INCLUDE,
  CUSTOM_DISPLAY_LVGL_FORWARD,
  CUSTOM_DISPLAY_LVGL_HELPERS,
  CUSTOM_DISPLAY_LVGL_TIMING_CPP,
  customDisplayLvglGlobalCpp,
  customDisplayLvglTimingSetupCpp,
  customDisplayLvglTimingLoopCpp,
} from './customDisplayLvglCpp'
import {
  type CustomDisplayPanelEmit,
  customDisplayPanelGlobalCpp,
  customDisplayPanelHelpersCpp,
} from './customDisplayPanelCpp'
import { parseDisplayWidgetPortId } from '../state/displayRegistry'
import { customDisplayMountPlan } from '../state/mountedDisplays'
import { toggleWidgetSource } from '../state/designControlBundle'
import { customDisplayAssetsCpp } from './customDisplayAssetsCpp'
import { partById } from '../state/partCatalogue'
import { buildXYTable } from '../state/xyLayout'
import {
  outputMirrorLeaders,
  outputRoutes,
  compositionDims,
  outputRenderPasses,
  ringMapFor,
  corkscrewMapFor,
  leadingOutputRoutes,
} from '../state/outputRouting'
import { outputForm, isLinearForm, outputCanvasDims, outputLedTotal } from '../state/ledOutputForm'
import { getNetworkCredentials } from '../state/networkCredentials'
import { selectedPhysicalBoardProfile } from '../build/boardProfiles'
import {
  boardSupportsTelemetry,
  deviceTelemetryGlobalsCpp,
  telemetryEmitFromSource,
  TELEMETRY_SERIAL_BEGIN_CPP,
  TELEMETRY_LOOP_BEGIN_CPP,
  TELEMETRY_REPORT_CPP,
} from './deviceTelemetryCpp'
import { rtcI2cPinsForProfile } from '../state/rtcPins'
import { powerMonitorSetupCpp, POWER_MONITOR_HELPER_CPP } from './powerMonitorCpp'
import { presenceSensorSetupCpp, PRESENCE_SENSOR_HELPER_CPP } from './presenceSensorCpp'
import { lightSensorSetupCpp, LIGHT_SENSOR_HELPER_CPP } from './lightSensorCpp'
import { lightSensorTransport } from '../state/lightSensor'
import { controllerSettings, ledPropsWithController } from '../state/controllerSettings'
import { sanitizePin } from './hardwarePins'
import { resolveAudioCapabilitySource } from '../state/audioCapabilities'
import { amplifierIdleCpp } from './amplifierIdle'
import { TRANSITION_3D_HELPERS_CPP } from './transitionHelperCpp'
import {
  type StereoVuEmit,
  STEREO_VU_CPP_FORWARD,
  STEREO_VU_CPP_HELPERS,
  stereoVuPaletteId,
  stereoVuGlobalCpp,
} from './stereoVuMeterCpp'
import { audioEngineForGraph } from './audioEngineCpp'
import { safeId, cppStringLiteral, cppComment } from './cppLiterals'
import { hub75HardwareFromProps, hub75IncludesCpp, hub75GlobalsCpp, hub75SetupCpp } from './hub75Cpp'
import {
  ledHardwareFromProps,
  overclockDefineCpp,
  psramBufferDecl,
  PSRAM_ALLOC_CPP,
  fastledSetupCpp,
} from './ledHardwareCpp'
import { RTC_CPP_FORWARD, rtcHelperCpp, ds3231HelperCpp } from './rtcCpp'
import { AUDIO_EMITTERS } from '../nodes/audio/codegen'
import { AUDIO_REACTIVE_EMITTERS } from '../nodes/audioReactive/codegen'
import { CODE_EMITTERS } from '../nodes/code/codegen'
import { COLOR_EMITTERS } from '../nodes/color/codegen'
import { COMPOSITE_EMITTERS } from '../nodes/composite/codegen'
import { FIELD_EMITTERS } from '../nodes/field/codegen'
import { GENERATIVE_EMITTERS } from '../nodes/generative/codegen'
import { GRAPH_EMITTERS } from '../nodes/graph/codegen'
import { INPUT_EMITTERS } from '../nodes/input/codegen'
import { MATH_EMITTERS } from '../nodes/math/codegen'
import { OUTPUT_EMITTERS } from '../nodes/output/codegen'
import { SHAPES_EMITTERS } from '../nodes/shapes/codegen'
import { SHOW_EMITTERS } from '../nodes/show/codegen'
import { SIGNAL_EMITTERS } from '../nodes/signal/codegen'
import { SIMULATIONS_EMITTERS } from '../nodes/simulations/codegen'
import type { GenerateCppOptions, SketchEmitContext, NodeEmitter } from './emitContext'
import { SHOW_PIPELINE_NOTES } from '../nodes/show/codegen'
export { PSRAM_ALLOC_CPP, psramBufferDecl, ledHardwareFromProps, overclockDefineCpp, fastledSetupCpp } from './ledHardwareCpp'
export type { LedHardware } from './ledHardwareCpp'
export { hub75HardwareFromProps, hub75IncludesCpp, hub75GlobalsCpp, hub75DisplayVar, hub75BlitRowsCpp, hub75SetupCpp } from './hub75Cpp'
export type { Hub75VirtualGrid, Hub75Hardware } from './hub75Cpp'
export { audioEngineForGraph } from './audioEngineCpp'
export { cppComment } from './cppLiterals'

/**
 * Expand every `Group` node into the graph in place: the group's subgraph nodes
 * are inlined (their ids prefixed with the group-instance path so repeated or
 * nested groups stay unique), the `GroupOutput` terminal is dropped, and the
 * group's external consumers are rewired to whatever fed that terminal. The
 * result is a flat graph the rest of the generator already understands.
 *
 * Edges into a Group are dropped (groups expose no inputs yet — ADR Phase 3),
 * and unknown or self-referential groups are skipped.
 */
function flattenGroups(
  nodes: StudioNode[],
  edges: StudioEdge[],
  groups: GroupRegistry,
  prefix = '',
  groupStack: ReadonlySet<string> = new Set(),
): { nodes: StudioNode[]; edges: StudioEdge[] } {
  const pid = (id: string) => prefix + id
  const nodeType = (n: StudioNode) => (n.data as { nodeType?: string }).nodeType
  const outNodes: StudioNode[] = []
  const outEdges: StudioEdge[] = []
  // Prefixed Group-node id → the flattened source that fed its GroupOutput.
  const terminalFor = new Map<string, { id: string; port: string }>()
  // Prefixed Group-node id → (paramId → internal consumers of that GroupInput).
  const paramConsumers = new Map<string, Map<string, { id: string; port: string }[]>>()

  for (const n of nodes) {
    if (nodeType(n) === 'Group') {
      const groupId = (n.data.properties as { groupId?: string })?.groupId
      if (!groupId || !groups[groupId] || groupStack.has(groupId)) continue
      const sub = groups[groupId]
      const flat = flattenGroups(sub.nodes, sub.edges, groups, `${pid(n.id)}__`, new Set([...groupStack, groupId]))

      const out = flat.nodes.find((x) => nodeType(x) === 'GroupOutput')
      if (out) {
        const fed = flat.edges.find((e) => e.target === out.id && e.targetHandle === 'frame')
        if (fed?.source && fed.sourceHandle) terminalFor.set(pid(n.id), { id: fed.source, port: fed.sourceHandle })
      }

      // Record each GroupInput's downstream consumers so the boundary edge that
      // feeds this group's param can be wired straight to them.
      const giNodes = flat.nodes.filter((x) => nodeType(x) === 'GroupInput')
      const giIds = new Set(giNodes.map((x) => x.id))
      const consumers = new Map<string, { id: string; port: string }[]>()
      for (const gi of giNodes) {
        const paramId = (gi.data.properties as { paramId?: string })?.paramId ?? ''
        consumers.set(paramId, flat.edges
          .filter((e) => e.source === gi.id && e.target && e.targetHandle)
          .map((e) => ({ id: e.target!, port: e.targetHandle! })))
      }
      paramConsumers.set(pid(n.id), consumers)

      for (const x of flat.nodes) if (nodeType(x) !== 'GroupOutput' && nodeType(x) !== 'GroupInput') outNodes.push(x)
      for (const e of flat.edges) if (!(out && e.target === out.id) && !giIds.has(e.source!)) outEdges.push(e)
    } else {
      outNodes.push({ ...n, id: pid(n.id) })
    }
  }

  const isGroup = (id?: string | null) =>
    nodes.some((n) => n.id === id && nodeType(n) === 'Group')

  for (const e of edges) {
    if (!e.source || !e.target) continue
    // Resolve the source through a group's GroupOutput terminal if needed.
    const term = terminalFor.get(pid(e.source))
    const srcId = term ? term.id : pid(e.source)
    const srcPort = term ? term.port : e.sourceHandle

    if (isGroup(e.target)) {
      // Boundary edge into a group param → wire the source to each consumer of
      // the matching GroupInput inside the (now-inlined) subgraph.
      const cons = paramConsumers.get(pid(e.target))?.get(e.targetHandle ?? '') ?? []
      for (const c of cons) {
        outEdges.push({
          id: pid(`${e.id ?? `${e.source}-${e.target}`}-${c.id}`),
          source: srcId, sourceHandle: srcPort, target: c.id, targetHandle: c.port,
        } as StudioEdge)
      }
      continue
    }

    outEdges.push({
      ...e,
      id: pid(e.id ?? `${e.source}-${e.target}`),
      source: srcId,
      sourceHandle: srcPort,
      target: pid(e.target),
      targetHandle: e.targetHandle,
    } as StudioEdge)
  }

  return { nodes: outNodes, edges: outEdges }
}

/** Topological sort: dependencies before dependents */
function topoSort(nodes: StudioNode[], edges: StudioEdge[]): StudioNode[] {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]))
  const parents = new Map<string, string[]>()
  for (const n of nodes) parents.set(n.id, [])
  for (const e of edges) {
    if (e.source && e.target) parents.get(e.target)?.push(e.source)
  }

  const visited = new Set<string>()
  const result: StudioNode[] = []

  function visit(id: string) {
    if (visited.has(id)) return
    visited.add(id)
    for (const p of parents.get(id) ?? []) visit(p)
    const n = nodeMap.get(id)
    if (n) result.push(n)
  }

  for (const n of nodes) visit(n.id)
  return result
}

/**
 * Keep only the nodes that can actually reach an LED output.
 *
 * `topoSort` walks the whole canvas, and `emit()` ran over every node it
 * returned — so a parked pattern or an abandoned branch still got a
 * `buf_`/`field_` global *and* its full render code in `loop()`, executing
 * every frame after `FastLED.show()` on pixels nothing displays. Walking
 * backward from the outputs first makes the sketch contain only what feeds
 * them, which is also the assumption `estimateFirmwareRam` already documents
 * (src/utils/validateGraph.ts).
 *
 * Every MatrixOutput is a root, mirrors included — an output with nothing
 * wired into it still has to be set up. With no output at all there is nothing
 * to walk back from, so the graph is left alone and validation reports it.
 */
/**
 * Auxiliary displays, which are codegen terminals in their own right rather
 * than steps toward an LED frame.
 *
 * Derived rather than listed. A workbench-owned part that carries signal but
 * publishes no output port is, by definition, something the graph feeds and
 * nothing reads — which is exactly what a terminal is. Listing them instead
 * meant a new display could be added everywhere else and still be pruned out
 * of the sketch, dark on a board that compiled and uploaded cleanly.
 */
/*
 * Every terminal in the library.
 *
 * Ordinary sinks are inputs with no outputs. Output-category nodes with inputs
 * remain terminals when they publish touch intent, so displays, `MatrixOutput`
 * and Master Speed all arrive here without being named. The rule was narrower once — workbench-owned parts
 * only — and a sink outside that class would be walked back from nothing and
 * pruned out of the sketch along with everything feeding it, which is how a
 * configured display used to vanish from a build.
 */
const TERMINAL_NODE_TYPES = new Set(
  NODE_LIBRARY
    .filter((def) => def.inputs.length > 0 && (def.outputs.length === 0 || def.category === 'output'))
    .map((def) => def.type),
)

function reachableFromOutputs(nodes: StudioNode[], edges: StudioEdge[]): StudioNode[] {
  const outputs = nodes.filter((n) => n.data.nodeType === 'MatrixOutput')
  if (outputs.length === 0) return nodes
  // Board carries no ports — it is the target authority codegen reads as
  // configuration (selectedPhysicalBoardProfile), so it is never "unreachable".
  //
  // An auxiliary display is a root too. It is never upstream of an LED output
  // and never will be, so walking back only from MatrixOutput would prune a
  // configured display and everything feeding it straight out of the sketch —
  // the part would sit dark on a board that compiled and uploaded cleanly,
  // which is the failure the display plan rules out.
  const roots = [
    ...outputs,
    ...nodes.filter((n) => n.data.nodeType === 'Board'),
    ...nodes.filter((n) => TERMINAL_NODE_TYPES.has(n.data.nodeType)),
    // No explicit root for the custom Display document node: it has no
    // physical existence of its own any more (see the panel/document split in
    // docs/development/design/large-displays-and-control-routing.md), so an
    // unwired one correctly has nothing to draw with. A screen design is the
    // panel's own property now rather than a node wired into it, so there is
    // no mount edge to follow: the panel is already a root above, and its
    // design comes with it.
  ]

  const sources = new Map<string, string[]>()
  for (const e of edges) {
    if (!e.source || !e.target) continue
    const list = sources.get(e.target)
    if (list) list.push(e.source)
    else sources.set(e.target, [e.source])
  }

  const keep = new Set<string>()
  const stack = roots.map((n) => n.id)
  while (stack.length) {
    const id = stack.pop()!
    if (keep.has(id)) continue
    keep.add(id)
    for (const src of sources.get(id) ?? []) stack.push(src)
  }
  return nodes.filter((n) => keep.has(n.id))
}

function parseIpv4Literal(value: unknown): [number, number, number, number] | null {
  const parts = String(value ?? '').trim().split('.')
  if (parts.length !== 4) return null
  const nums = parts.map((part) => Number(part))
  if (nums.some((num) => !Number.isInteger(num) || num < 0 || num > 255)) return null
  return nums as [number, number, number, number]
}

function ipAddressExpr(value: [number, number, number, number] | null): string {
  const ip = value ?? [0, 0, 0, 0]
  return `IPAddress(${ip[0]}, ${ip[1]}, ${ip[2]}, ${ip[3]})`
}

/*
 * Every node type's firmware, one table per library category, each beside the
 * same category's previews (src/nodes/<category>/). A type belongs to exactly
 * one table; nodeTables.test.ts holds that. A type with no emitter gets a
 * comment in the sketch saying where it is handled instead.
 */
export const NODE_EMITTER_TABLES = {
  audio: AUDIO_EMITTERS,
  audioReactive: AUDIO_REACTIVE_EMITTERS,
  code: CODE_EMITTERS,
  color: COLOR_EMITTERS,
  composite: COMPOSITE_EMITTERS,
  field: FIELD_EMITTERS,
  generative: GENERATIVE_EMITTERS,
  graph: GRAPH_EMITTERS,
  input: INPUT_EMITTERS,
  math: MATH_EMITTERS,
  output: OUTPUT_EMITTERS,
  shapes: SHAPES_EMITTERS,
  show: SHOW_EMITTERS,
  signal: SIGNAL_EMITTERS,
  simulations: SIMULATIONS_EMITTERS,
} as const
const NODE_EMITTERS = new Map<string, NodeEmitter>(
  Object.values(NODE_EMITTER_TABLES).flatMap((table) => Object.entries(table)),
)

export function generateCpp(
  nodes: StudioNode[], edges: StudioEdge[], groups: GroupRegistry = {},
  // See GenerateCppOptions for what each option changes.
  opts: GenerateCppOptions = {},
): string {
  if (nodes.length === 0) return '// No nodes in graph\n'

  // Capability nodes can point at root hardware that is intentionally not on
  // a signal edge. Preserve the authored graph while the render graph below is
  // flattened and pruned to what reaches an LED output.
  const capabilityNodes = nodes
  const bootTitle = opts.bootLabel?.trim() || 'FASTLED BUILD'
  const bootDevice = selectedPhysicalBoardProfile(capabilityNodes)?.label ?? 'FASTLED CONTROLLER'
  const amplifierIdle = amplifierIdleCpp(capabilityNodes)

  // Inline any Group nodes so the rest of the generator works on a flat graph.
  const flat = flattenGroups(nodes, edges, groups)
  nodes = flat.nodes
  edges = flat.edges

  const incoming = new Map<string, { srcId: string; srcPort: string }>()
  for (const e of edges) {
    if (e.source && e.target && e.sourceHandle && e.targetHandle)
      incoming.set(`${e.target}:${e.targetHandle}`, { srcId: e.source, srcPort: e.sourceHandle })
  }

  const nodeMap = new Map(nodes.map((n) => [n.id, n]))

  const allOutputNodes = nodes.filter((n) => n.data.nodeType === 'MatrixOutput')
  const controller = controllerSettings(nodes)
  /*
   * Runs wired in parallel off one GPIO are one controller, not several: the
   * pixels reach the mirror down the leader's wire, so it gets no `leds` array,
   * no `addLeds`, and no blit. `outputMirrorLeaders` decides which is which
   * (same frame + same data pin), and everything downstream here works from
   * the leaders alone — including whether this is a single-output sketch at
   * all, so two mirrored panels emit the same simple sketch one panel does.
   */
  const mirrorLeaders = outputMirrorLeaders(outputRoutes(nodes), edges)
  const isMirrorOf = (node: StudioNode) => {
    const leader = mirrorLeaders.get(node.id)
    return leader && leader !== node.id ? leader : null
  }
  const outputNodes = allOutputNodes.filter((n) => !isMirrorOf(n))
  const outputNode = outputNodes[0]
  const multipleOutputs = outputNodes.length > 1
  const rawProps = (n: StudioNode) => n.data.properties as Record<string, unknown>

  // Sanitise numeric properties so a stray/garbage value (e.g. a hex string
  // pasted into the width field) can't emit `#define WIDTH NaN` and break the
  // compile — clamp to sane integer bounds, matching the live-preview clamps.
  const intProp = (val: unknown, def: number, min: number, max: number) => {
    const n = Math.round(Number(val))
    return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : def
  }
  const composition = compositionDims(nodes, edges)
  const leaderIds = new Set(outputNodes.map((node) => node.id))
  const renderPasses = outputRenderPasses(nodes, edges)
    .map((pass) => ({ ...pass, routes: pass.routes.filter((route) => leaderIds.has(route.id)) }))
    .filter((pass) => pass.routes.length > 0)
  const nativeMultiRender = multipleOutputs && renderPasses.some((pass) =>
    pass.routes.some((route) => route.routeMode === 'native'))
  const largestRenderPass = renderPasses.reduce((largest, pass) =>
    pass.width * pass.height > largest.width * largest.height ? pass : largest,
  renderPasses[0] ?? { key: '16x16', width: 16, height: 16, routes: [] })
  // What the single output physically is (src/state/ledOutputForm.ts). A string
  // renders on its own 1 x N grid, a ring on the square its circle is inscribed
  // in, a matrix or panel on its panel — so the render canvas comes from the
  // form rather than from width/height, which the chain forms do not use.
  const singleForm = outputNode ? outputForm(rawProps(outputNode)) : 'matrix'
  const singleLinear = !multipleOutputs && isLinearForm(singleForm)
  const singleCanvas = outputNode ? outputCanvasDims(rawProps(outputNode)) : { width: 16, height: 16 }
  const width      = multipleOutputs ? (nativeMultiRender ? largestRenderPass.width : composition.w) : singleCanvas.width
  const height     = multipleOutputs ? (nativeMultiRender ? largestRenderPass.height : composition.h) : singleCanvas.height
  const expressionScale = !multipleOutputs && !singleLinear && outputNode && rawProps(outputNode).supersample === true ? 2 : 1
  const props = (n: StudioNode) => resolveNodeScalarExpressions(
    n.data.nodeType as string,
    rawProps(n),
    width * expressionScale,
    height * expressionScale,
  )
  const dataPin    = sanitizePin(outputNode ? props(outputNode).dataPin : undefined, 5)
  // Chipset, colour order, master brightness, correction, dithering, overclock
  // — sanitised centrally (shared with the show/player generators).
  const hw = ledHardwareFromProps(ledPropsWithController(outputNode ? props(outputNode) : {}, nodes))
  // HUB75 has no FastLED driver — it's driven via a separate DMA library
  // instead of addLeds<>()/leds[]/show(). Scoped to a single LED output
  // route for now; findUnimplementedChipsetErrors blocks every other
  // combination (multi-route, panel chaining, supersample) before deploy.
  const isHub75 = !multipleOutputs && hw.chipset === HUB75_CHIPSET
  const hub75Hw = isHub75 ? hub75HardwareFromProps(ledPropsWithController(props(outputNode!), nodes), width, height) : null
  // Serpentine (zig-zag) matrices wire alternate rows in reverse; buffers stay
  // row-major and MatrixOutput remaps grid → physical index via XY(). Panel/
  // custom layouts (src/state/xyLayout.ts) fold into the same XY() remap, so
  // there's one physical-wiring code path regardless of which combination of
  // pixel serpentine, multi-panel tiling, or a custom map is in play.
  const xyTable = buildXYTable(width, height, outputNode ? props(outputNode) : {})
  // Supersample: render every buffer at SS× the panel resolution (so WIDTH/
  // HEIGHT/NUM_LEDS become the render size) and average each SS×SS block down
  // into the physical `leds` (PANEL_LEDS) at MatrixOutput. 1 = off (unchanged
  // output). 2× only for now, matching the preview.
  // A single chain has no 2 x 2 block to average down, whatever a supersample
  // flag left over from an earlier form still says.
  const supersample = !multipleOutputs && !singleLinear && (outputNode ? props(outputNode).supersample : false) === true ? 2 : 1
  const ss = supersample > 1
  // Physical strip length + panel width for the XY map (differ from the render
  // NUM_LEDS/WIDTH only when supersampling).
  // A ring's LEDs sit around a circle inscribed in the render canvas, so it has
  // its own physical count the way a supersampled panel does — the render buffer
  // is NUM_LEDS either way, and the strip FastLED drives is not.
  const isRing = !multipleOutputs && singleForm === 'ring'
  // Single-output: WIDTH/HEIGHT are the ring's own square, so its map is built
  // against exactly that.
  const ringMap = isRing && outputNode
    ? ringMapFor(outputRoutes([outputNode])[0], width, height)
    : null
  const isCorkscrew = !multipleOutputs && singleForm === 'corkscrew'
  const corkscrewMap = isCorkscrew && outputNode
    ? corkscrewMapFor(outputRoutes([outputNode])[0], width, height)
    : null
  const physLeds = isRing ? 'RING_LEDS' : isCorkscrew ? 'CORKSCREW_LEDS' : ss ? 'PANEL_LEDS' : 'NUM_LEDS'
  const panelW = ss ? 'PANEL_W' : 'WIDTH'
  // Optional power cap (FastLED.setMaxPowerInVoltsAndMilliamps) — dims globally
  // to keep the PSU draw under a limit so a big matrix can't brown out the board.
  // Every physical run, mirrors included — a parallel panel is a second panel
  // on the PSU even though it shares an array.
  const powerLimit = controller.powerLimit
  const volts = controller.volts
  const milliamps = controller.milliamps
  // Per-node render buffers in external PSRAM (ESP32 family; see PSRAM_ALLOC_CPP).
  const usePsram = opts.psramAllowed !== false && controller.usePsram

  const passIndexByRoute = new Map<string, number>()
  renderPasses.forEach((pass, index) => pass.routes.forEach((route) => passIndexByRoute.set(route.id, index)))
  const outputConfigs = leadingOutputRoutes(nodes, edges).map((route) => {
    const p = props(route.node)
    const pass = renderPasses[passIndexByRoute.get(route.id) ?? 0] ?? largestRenderPass
    return {
      ...route,
      safeId: safeId(route.id),
      dataPin: sanitizePin(p.dataPin, 5),
      hardware: ledHardwareFromProps(ledPropsWithController(p, nodes)),
      xyTable: buildXYTable(route.width, route.height, p),
      /** Physical LEDs on this route: a panel's grid, or a chain's length. */
      ledTotal: outputLedTotal(p),
      passIndex: passIndexByRoute.get(route.id) ?? 0,
      renderWidth: pass.width,
      renderHeight: pass.height,
      ringMap: ringMapFor(route, pass.width, pass.height),
      corkscrewMap: corkscrewMapFor(route, pass.width, pass.height),
    }
  })

  // A reachable Audio capability backed by physical capture turns on FastLED's
  // audio processor. `emitEngine` means this sketch hosts it;
  // `useAudioGlobals` means a connected analyzer may reference the shared live
  // levels (or the host controller's `externalAudio`) instead of silence.
  // Everything below works from the nodes that actually feed an output — an
  // unused hardware providers must not emit the I2S engine any more than a parked Fire
  // node should emit a buffer and a simulation.
  const live = reachableFromOutputs(nodes, edges)
  const audio = audioEngineForGraph(live, capabilityNodes)
  const emitEngine = !!audio
  const useAudioGlobals = emitEngine || !!opts.externalAudio
  const nativeFastLedAudio = emitEngine || !!opts.nativeFastLedAudio

  const hasExplicitAudioInput = (nodeId: string): boolean => {
    if (!useAudioGlobals) return false
    const upstream = incoming.get(`${nodeId}:audio`)
    if (!upstream) return false
    const source = nodeMap.get(upstream.srcId)
    if (!source) return false
    if (source.data.nodeType === 'Audio') {
      return resolveAudioCapabilitySource(
        capabilityNodes,
        (source.data.properties as Record<string, unknown>).sourceId,
      ) !== null
    }
    return true
  }

  /*
   * Widget wires are left out of the ordering; a panel's own inputs are not.
   *
   * Custom widget outputs are sampled before evaluation and their input wires
   * publish after it, so treating both as one graph vertex invents a cycle for
   * ordinary slider -> Math -> readout/set wiring on the same panel.
   *
   * This used to drop *every* edge into a panel, on the reasoning that a
   * display has no outputs and so cannot be a cycle's source. That stopped
   * being true when the document node was folded into the panel and the widget
   * outputs moved onto it — and the over-broad filter took `display` and
   * `enabled` with it. A source feeding nothing but a panel then had no reason
   * to be ordered before it, so an RTC driving a fixed Clock layout emitted its
   * value *after* the block that reads it: a sketch naming an undeclared
   * variable, which every text-level test reads as correct.
   *
   * `topoSort` is a DFS over a visited set, so a genuine feedback loop through
   * `enabled` orders arbitrarily rather than hanging.
   */
  const sorted = topoSort(live, edges
    .filter((edge) => (
      nodeMap.get(edge.target)?.data.nodeType !== 'TransportDisplay'
        || !parseDisplayWidgetPortId(String(edge.targetHandle ?? ''))
    ))
    /*
     * A Touch node emits nothing of its own.
     *
     * The bundle its `controls` output names is declared inside the emit case
     * of the *panel* it belongs to, because the pins are the panel's. Ordering
     * a consumer after the Touch node therefore guarantees nothing: the panel
     * can still land later, and the reader then names a variable that does not
     * exist yet. Wiring a Touch node straight into an LED output's Controls is
     * a supported shape, and it emitted exactly that until this rewrite - the
     * existing fixtures all happened to route through a Control Map, whose own
     * node does emit, which is why it went unnoticed.
     */
    .map((edge) => {
      const source = nodeMap.get(String(edge.source ?? ''))
      if (source?.data.nodeType !== 'TouchInput') return edge
      const panelId = String((source.data.properties as Record<string, unknown>).panelId ?? '')
      return nodeMap.has(panelId) ? { ...edge, source: panelId } : edge
    }))

  /*
   * The node feeding the output used to fill its own `buf_` and then have the
   * whole thing `memmove`d into `leds` — one redundant NUM_LEDS buffer plus a
   * full-frame copy every loop. When the blit really is that plain copy, the
   * node can just render into `leds` directly.
   *
   * Conditions: a single non-HUB75 route whose blit is the unmapped memmove
   * (a ring map, supersample or XY table all rewrite pixel positions on the
   * way out, so the buffers genuinely differ), and the source's frame output
   * feeds nothing but this output — a second consumer would otherwise read a
   * buffer that FastLED also owns.
   */
  const aliasedTerminalId: string | null = (() => {
    if (opts.aliasTerminalBuffer === false) return null
    if (multipleOutputs || isHub75 || ringMap || ss || xyTable) return null
    if (!outputNode) return null
    const up = incoming.get(`${outputNode.id}:frame`)
    if (!up || up.srcPort !== 'frame') return null
    const consumers = edges.filter((e) => e.source === up.srcId && e.sourceHandle === 'frame')
    if (consumers.length !== 1) return null
    return live.some((n) => n.id === up.srcId) ? safeId(up.srcId) : null
  })()
  const emitRtcHelpers = sorted.some((n) => n.data.nodeType === 'RTCInput')
  const needsDs3231 = sorted.some((n) => n.data.nodeType === 'RTCInput' && String(props(n).timeSource ?? 'Compile Time') === 'DS3231')
  // Everything sharing the board's one `Wire` bus. A 4-pin OLED joins the
  // DS3231 on it, which is why `Wire.begin` is started once below rather than
  // by whichever part happens to be set up first.
  const i2cOleds = sorted.filter((n) => n.data.nodeType === 'InfoDisplay'
    && oledTransportForProps(props(n)) === 'i2c')
  const powerMonitors = sorted.filter((n) => n.data.nodeType === 'PowerMonitorInput')
  const presenceSensors = sorted.filter((n) => n.data.nodeType === 'PresenceInput')
  const digitalLightSensors = sorted.filter((n) => n.data.nodeType === 'LightInput'
    && lightSensorTransport(props(n).partId) === 'i2c')
  const needsWire = needsDs3231 || i2cOleds.length > 0 || powerMonitors.length > 0 || digitalLightSensors.length > 0
  /*
   * The header follows the driver, not the transport.
   *
   * `infoDisplayHelpersCpp` emits one `OledPanel` carrying both transports and
   * branches on `p.transport` at runtime, so its `Wire` calls are compiled even
   * in a build whose only panel is SPI. Gating the include on the transport
   * produced a sketch that called `Wire` without declaring it, and nothing
   * caught it: the tests assert on strings, and the one graph that fails is the
   * SH1106 on the bench — the 7-pin SPI variant, in a build with no I2C device
   * to drag the header in behind it.
   *
   * Starting the bus stays a separate question. A build with no I2C device has
   * no pins to start one with, so `needsWire` above still gates `Wire.begin`.
   */
  const needsWireHeader = needsWire || sorted.some((n) => n.data.nodeType === 'InfoDisplay')
  /*
   * Master Speed, if the graph has one.
   *
   * A knob with nothing wired to it is a constant and needs no feedback; a
   * wired one is resolved at the foot of the loop for the next pass, because
   * its source is emitted below the clock and may itself read `t`. Same rule
   * the browser follows — see state/masterSpeed.ts.
   */
  const speedNode = sorted.find((n) => n.data.nodeType === 'MasterSpeed')
  // A control bundle wins over the node's own slider, and only while it is
  // carrying a speed — a bundle that arrives without the Master Speed job
  // assigned leaves the slider alone, exactly as the browser does.
  const speedBundle = speedNode && incoming.get(`${speedNode.id}:controls`)
  const speedBundleExpr = speedBundle
    ? `n_${safeId(speedBundle.srcId)}_${safeId(speedBundle.srcPort)}`
    : null
  const masterSpeedEmit: MasterSpeedEmit = {
    present: !!speedNode,
    speedExpr: speedBundleExpr
      ? `(${speedBundleExpr}.hasSpeed ? ${speedBundleExpr}.speed : `
        + `${clampMasterSpeed(speedNode ? props(speedNode).speed : MASTER_SPEED_DEFAULT).toFixed(4)}f)`
      : speedNode && incoming.has(`${speedNode.id}:speed`)
        ? floatExpr(speedNode.id, 'speed', props(speedNode), 'speed', MASTER_SPEED_DEFAULT)
        : null,
    initial: clampMasterSpeed(speedNode ? props(speedNode).speed : MASTER_SPEED_DEFAULT),
    min: MASTER_SPEED_MIN,
    max: MASTER_SPEED_MAX,
  }
  const dmxInputs = sorted.filter((n) => n.data.nodeType === 'DMXInput')
  const needsArtNet = dmxInputs.some((n) => String(props(n).inputMode ?? 'Art-Net') === 'Art-Net')
  const needsDmx512 = dmxInputs.some((n) => String(props(n).inputMode ?? 'Art-Net') === 'DMX512')
  const ntpNodes = sorted.filter((n) => n.data.nodeType === 'RTCInput' && String(props(n).timeSource ?? 'Compile Time') === 'NTP')
  const needsNtp = ntpNodes.length > 0
  const needsNetwork = needsArtNet || needsNtp
  // A W5500 on the bench carries the network instead of Wi-Fi. Found in the
  // whole graph, not `sorted`: a hardware-only part has no ports to sort by.
  const ethernetNode = needsNetwork ? ethernetModuleIn(nodes) : null
  const networkSource = sorted.find((n) => {
    const p = props(n)
    return (n.data.nodeType === 'DMXInput' && String(p.inputMode ?? 'Art-Net') === 'Art-Net')
      || (n.data.nodeType === 'RTCInput' && String(p.timeSource ?? 'Compile Time') === 'NTP')
  })
  const networkProps = networkSource ? props(networkSource) : {}
  // SSID/password are deliberately not node properties — see networkCredentials.ts —
  // so they're looked up by node id from that browser-local store instead of `props`.
  const networkCredentials = networkSource ? getNetworkCredentials(networkSource.id) : { ssid: '', password: '' }
  const networkCfg = {
    ssid: cppStringLiteral(networkCredentials.ssid),
    password: cppStringLiteral(networkCredentials.password),
    hostname: cppStringLiteral(networkProps.wifiHostname ?? 'fastled-node'),
    useDhcp: networkProps.useDhcp !== false,
    staticIp: parseIpv4Literal(networkProps.staticIp),
    staticGateway: parseIpv4Literal(networkProps.staticGateway),
    staticSubnet: parseIpv4Literal(networkProps.staticSubnet),
    staticDns: parseIpv4Literal(networkProps.staticDns),
  }

  // Resolve a float input to a C++ expression
  function floatExpr(nodeId: string, portId: string, nodeProps: Record<string, unknown>, propKey: string, def: number): string {
    const up = incoming.get(`${nodeId}:${portId}`)
    if (up) {
      const expr = `n_${safeId(up.srcId)}_${safeId(up.srcPort)}`
      // Mirror the evaluator's `clampInputs` toggle: clamp wired signals to the
      // control's range so the firmware matches the live preview.
      if (nodeProps.clampInputs) {
        const r = inputClampRange(nodeMap.get(nodeId)?.data.nodeType as string, propKey)
        if (r) return `constrain(${expr}, ${r.min}, ${r.max})`
      }
      return expr
    }
    const pv = nodeProps[propKey]
    return pv !== undefined ? String(Number(pv)) : String(def)
  }

  /*
   * A Control Map row or direct action fed by a screen Toggle counts the
   * finger's taps instead of edge-detecting the value, because the value also
   * follows the Toggle's Set feedback (a template binds Play to `playing`) and
   * would echo every transport change back as a press. See
   * `toggleWidgetSource`. Any other source keeps the debounced contact.
   */
  function pressButton(nodeId: string, port: string, repeat: boolean): PlayerControlButtonEmit {
    const wire = incoming.get(`${nodeId}:${port}`)
    const documents = opts.displayDocuments ?? {}
    const toggle = wire ? toggleWidgetSource(nodeMap.get(wire.srcId), wire.srcPort, nodeMap, documents) : null
    const document = toggle ? documents[toggle.documentId] : undefined
    const tap = toggle && document
      ? customDisplayLvglTapExpression({ id: safeId(toggle.documentId), document, bindings: {} }, toggle.widgetId)
      : null
    return tap ? { port, expr: tap, repeat: false, edge: 'tap' } : { port, expr: boolExpr(nodeId, port), repeat }
  }

  function boolExpr(nodeId: string, portId: string): string {
    const up = incoming.get(`${nodeId}:${portId}`)
    if (up) return `n_${safeId(up.srcId)}_${safeId(up.srcPort)}`
    return 'false'
  }

  function colorExpr(nodeId: string, portId: string, fallback = 'CRGB::Black'): string {
    const up = incoming.get(`${nodeId}:${portId}`)
    if (up) return `n_${safeId(up.srcId)}_${safeId(up.srcPort)}`
    return fallback
  }

  // Canonical ids of every palette `fastledPalette` resolves below. The emit
  // pass runs before the declarations are written, so this set is complete by
  // the time it gates them.
  const usedPalettes = new Set<string>()

  // Resolve a palette name to its baked `paldef_*` table, recording the
  // canonical id so only the palettes this sketch names are declared. Each
  // declaration is a non-const 48-byte global, so unused ones cost real RAM.
  function fastledPalette(name: string): string {
    const id = resolvePaletteId(name.toLowerCase())
    usedPalettes.add(id)
    return paletteCppRef(id)
  }

  // Resolve the FastLED palette for a palette-consuming port: runtime palette
  // builders resolve to their generated `pal_*` value; selectors resolve to a
  // preset constant; otherwise use the consuming node's palette property.
  function paletteExpr(nodeId: string, portId: string, nodeProps: Record<string, unknown>): string {
    const up = incoming.get(`${nodeId}:${portId}`)
    if (up) {
      const src = nodeMap.get(up.srcId)
      if (src) {
        // Palette builders create a CRGBPalette16 in their emit cases; reference
        // it by name. A palette-role GroupInput (collection-show codegen)
        // likewise resolves to its `pal_<id>` copy of the render_pN param.
        if (isPaletteBuilderNodeType(src.data.nodeType)) return `pal_${safeId(up.srcId)}`
        if (src.data.nodeType === 'GroupInput' && String(props(src).paramId ?? '') === 'palette') return `pal_${safeId(up.srcId)}`
        return fastledPalette(String(props(src).palette ?? 'rainbow'))
      }
    }
    return fastledPalette(String(nodeProps.palette ?? 'rainbow'))
  }

  const stereoVuMeters: StereoVuEmit[] = sorted
    .filter((node) => node.data.nodeType === 'StereoVuMeter' && hasExplicitAudioInput(node.id))
    .map((node) => {
      const p = props(node)
      return {
        id: safeId(node.id),
        properties: p,
        leftPin: sanitizePin(p.leftDataPin, 5),
        rightPin: sanitizePin(p.rightDataPin, 6),
        activeExpr: p.enabled === false ? 'false' : emitEngine ? '(bool)_audioProcessor' : 'true',
        leftExpr: '_audioLeftLevel',
        rightExpr: '_audioRightLevel',
        beatExpr: '_audioBeat',
        paletteExpr: paletteExpr(node.id, 'paletteIn', p),
      }
    })

  const loopLines: string[] = []
  const customDisplaySamples: string[] = []
  const customDisplayPublication: string[] = []
  // pinMode(...) calls contributed by hardware-input nodes, emitted in setup().
  // A Set so two nodes reading the same pin don't emit it twice.
  const pinSetupLines = new Set<string>()
  // Collected while walking, emitted once ahead of the walk. A pattern body
  // is this loop copied into render_pN, which would decode during the render
  // and a second time if the controller also polls, so those compilations
  // leave the receiver to the controller.
  const irNodes: IrRemoteProjectNode[] = []
  const setupLines: string[] = []
  if (needsWire) {
    /*
     * One bus, started once, before any device on it.
     *
     * The pins come from the DS3231 where there is one and from the first I2C
     * display otherwise. A build whose devices name different pairs cannot be
     * served by one `Wire` — `findDisplayGeneratorIssues` reports that as an
     * error rather than letting the second device quietly never answer.
     */
    const i2cBoard = selectedPhysicalBoardProfile(nodes)
    const boardPins = rtcI2cPinsForProfile(i2cBoard)
    const busNode = sorted.find((node) => node.data.nodeType === 'RTCInput'
      && String(props(node).timeSource ?? 'Compile Time') === 'DS3231')
      ?? i2cOleds[0] ?? powerMonitors[0] ?? digitalLightSensors[0]
    const busProps = busNode ? props(busNode) : {}
    const sdaPin = sanitizePin(busProps.sdaPin, boardPins?.sda.arduinoPin ?? 21)
    const sclPin = sanitizePin(busProps.sclPin, boardPins?.scl.arduinoPin ?? 22)
    const supportsExplicitWirePins = i2cBoard?.targetFamilies.some((family) =>
      family === 'esp8266' || family.startsWith('esp32'))
    setupLines.push(boardPins && supportsExplicitWirePins
      ? `  Wire.begin(${sdaPin}, ${sclPin});  // I2C pins from the parts on the bus`
      : `  Wire.begin();  // I2C parts on the board's default SDA/SCL pins`)
    if (needsDs3231) {
      setupLines.push(`  Serial.begin(115200);  // accepts deliberate FLS_RTC_SET commands from Studio`)
    }
    for (const monitor of powerMonitors) setupLines.push(powerMonitorSetupCpp(props(monitor)))
    for (const sensor of digitalLightSensors) setupLines.push(...lightSensorSetupCpp(props(sensor)))
  }
  for (const sensor of presenceSensors) {
    setupLines.push(...presenceSensorSetupCpp(props(sensor), sanitizePin(props(sensor).rxPin, 18)))
  }
  // File-scope lines contributed by Code nodes (helpers, persistent vars, etc.),
  // emitted between the buffer declarations and setup().
  const globalLines: string[] = []
  const needsMapFloat: boolean[] = [false]
  const needsWorley = { v: false }
  const need3d = { v: false }
  const needsKelvin = { v: false }
  const needsT = { v: false }
  const needsShims = { v: false }
  const needsPhi = { v: false }
  const needsDisplayText = { number: false, dateTime: false }
  const segmentDisplays: SegmentDisplayEmit[] = []
  const infoDisplays: InfoDisplayEmit[] = []
  const tftDisplays: TftDisplayEmit[] = []
  // Nodes producing a `playercontrols` bundle, and outputs latching one.
  const playerControlNodes: string[] = []
  const ledLatchOutputs: string[] = []
  // Panels that sample XPT2046, whether to report coordinates on a
  // Diagnostics screen or to publish a control bundle from their buttons.
  const tftTouches: TftTouchEmit[] = []
  // The freeform LVGL screens: one control/object-tree emit and one physical
  // panel/touch driver emit per screen design, kept apart because they
  // come from different modules — the first is a pure function of the
  // document, the second is real hardware setup neither module wants to own.
  /*
   * Bench telemetry, asked for on the Board and honoured only where it can work.
   *
   * A board with no `Serial.printf` cannot report, and emitting the block anyway
   * would break a build to add an instrument nobody asked to be broken for — so
   * the property is treated as a request rather than a guarantee, the same way
   * PSRAM is. Validation names the refusal; this simply does not emit.
   */
  const telemetryBoard = selectedPhysicalBoardProfile(nodes)
  const telemetryAsked = nodes.some((node) => node.data.nodeType === 'Board'
    && props(node).reportTelemetry === true)
  const emitTelemetry = telemetryAsked && boardSupportsTelemetry(telemetryBoard?.targetFamilies)

  const customDisplays: CustomDisplayLvglEmit[] = []
  const customDisplayPanels: CustomDisplayPanelEmit[] = []
  const artworkTables = new Map<string, Uint8Array[]>()
  const needsXyMap = { v: false }
  // Frame-producing nodes each render into their own CRGB buffer, so multiple
  // layers can coexist and be composited. Collected here, declared as globals.
  const frameBufs = new Set<string>()
  // Field-producing nodes (FieldFormula …) render into a parallel float buffer.
  const fieldBufs = new Set<string>()
  // Stateful feedback history buffers stay as static internal RAM even when
  // MatrixOutput moves ordinary render buffers into PSRAM.
  const feedbackHistoryBufs = new Map<string, number>()
  // Buffers whose previous pixels are evaluator state rather than disposable
  // intermediates. Native passes get one correctly-sized copy per template
  // instance; ordinary buf_ arrays remain the one sequentially reused set.
  const persistentFrameStateBufs = new Set<string>()

  // Which panels have a screen design — the same walk validation, the RAM
  // estimate and the asset bake use, so they all agree on what this sketch
  // contains. A panel without one draws the fixed layout it falls back to.
  const customMounts = customDisplayMountPlan(nodes)
  const customDisplayOwners = new Set(customMounts.mounted.map((mount) => mount.panel.id))

  // Everything a node's emitter may read or collect into, built once.
  const sketch: SketchEmitContext = {
    nodes, edges, opts, bootTitle, bootDevice, incoming, nodeMap, isMirrorOf, multipleOutputs, intProp,
    nativeMultiRender, width, height, props, hw, isHub75, hub75Hw, xyTable, ss, ringMap, corkscrewMap,
    physLeds, outputConfigs, nativeFastLedAudio, hasExplicitAudioInput, aliasedTerminalId, floatExpr,
    pressButton, boolExpr, colorExpr, fastledPalette, paletteExpr, stereoVuMeters, loopLines,
    customDisplaySamples, customDisplayPublication, pinSetupLines, irNodes, setupLines, globalLines,
    needsMapFloat, needsWorley, need3d, needsKelvin, needsT, needsShims, needsPhi, needsDisplayText,
    segmentDisplays, infoDisplays, tftDisplays, playerControlNodes, ledLatchOutputs, tftTouches,
    emitTelemetry, customDisplays, customDisplayPanels, needsXyMap, frameBufs, feedbackHistoryBufs,
    persistentFrameStateBufs, customDisplayOwners,
  }

  function emit(node: StudioNode): void {
    const id = safeId(node.id)
    const p = props(node)
    const type = node.data.nodeType as string

    const ln = (s: string) => loopLines.push(s)
    const v = (port: string) => `n_${id}_${port}`
    const f = (port: string, pk: string, def: number) => floatExpr(node.id, port, p, pk, def)

    /*
     * A colour whose channels can each carry a wire. The whole-colour input
     * still wins wherever it is connected, exactly as it won over the channel
     * fields before they had sockets, so a wire into a channel underneath it
     * is the same no-op that field already was.
     *
     * An unwired channel folds to its own literal, so a node nobody has wired
     * emits the identical CRGB it always did. A wired one is clamped and
     * rounded here because the evaluator resolves the same channel through
     * `byte()`, which clamps to 0-255 and rounds; a plain cast truncates, and
     * the firmware would sit a count under the preview all the way up the
     * slider. Rounding is `+ 0.5f` into an integer cast rather than `roundf`,
     * matching how every other channel in this file is quantised.
     */
    const channelColor = (
      port: string | null,
      dr: number,
      dg: number,
      db: number,
      keys: readonly [string, string, string] = ['r', 'g', 'b'],
    ): string => {
      if (port && incoming.get(`${node.id}:${port}`)) return colorExpr(node.id, port)
      const channel = (key: string, def: number) => (
        incoming.get(`${node.id}:${key}`)
          ? `(uint8_t)(constrain(${f(key, key, def)}, 0.0f, 255.0f) + 0.5f)`
          : String(Number(p[key] ?? def))
      )
      return `CRGB(${channel(keys[0], dr)}, ${channel(keys[1], dg)}, ${channel(keys[2], db)})`
    }

    /*
     * One channel of a linear A-to-B mix, rounded rather than truncated: the
     * evaluator rounds both gradient nodes with `Math.round`, and a cast alone
     * left the firmware a count under the preview across the whole ramp.
     */
    const gradientChannel = (a: string, b: string, channel: string, t: string) =>
      `(uint8_t)(${a}.${channel}*(1-${t})+${b}.${channel}*${t}+0.5f)`

    // This node's own frame buffer (registers it for global declaration).
    const fbuf = `buf_${id}`
    const ownBuf = () => { frameBufs.add(id); return fbuf }
    // The buffer of the node feeding `port`, or null if unconnected.
    const srcBuf = (port: string): string | null => {
      const up = incoming.get(`${node.id}:${port}`)
      if (!up) return null
      frameBufs.add(safeId(up.srcId))
      return `buf_${safeId(up.srcId)}`
    }
    /*
     * This output's blackout and dimming, for `ledOutputRuntimeCpp`.
     *
     * A wire where there is one, and otherwise the field beside the socket —
     * the same order the evaluator resolves them in, so the bench and the
     * preview agree. Null on both sides where the port is unwired *and* the
     * field is still lit and undimmed, so an output nobody has touched emits
     * nothing at all and its sketch is byte-for-byte the one it always was.
     * The dimmer reads `outputBrightness`; the Board's `brightness` is the
     * separate global controller setting.
     */
    const outputRuntimeEmit = (target: StudioNode, array: string, count: string) => {
      const stem = safeId(target.id)
      const manual = ledOutputManualExprs(props(target))
      const wiredEnabled = incoming.has(`${target.id}:enabled`)
        ? boolExpr(target.id, 'enabled')
        : manual.enabledExpr
      const wiredBrightness = incoming.has(`${target.id}:brightness`)
        ? floatExpr(target.id, 'brightness', props(target), 'brightness', 1)
        : manual.brightnessExpr
      // A latched bundle is one more factor, combined the way
      // composeLedOutputRuntime combines it: ANDed for blackout, multiplied for
      // level. Neither port needs a precedence rule that way — an unwired one
      // contributes its identity and vanishes from the expression.
      //
      // The direct action ports count as well as the bundle, and asking only
      // about `controls` was a silent parity break: a button on Toggle
      // blackout emitted its latch, flipped `_ledOn_`, and then emitted no
      // runtime block to read it, because both expressions were still null.
      // The preview blacked the fixture out and the device did nothing.
      // Derived from the port list rather than a second copy of the three ids.
      const latched = incoming.has(`${target.id}:controls`)
        || LED_OUTPUT_ACTION_PORTS.some((port) => incoming.has(`${target.id}:${port.id}`))
      return {
        id: stem,
        array,
        count,
        enabledExpr: latched
          ? (wiredEnabled ? `(${wiredEnabled}) && _ledOn_${stem}` : `_ledOn_${stem}`)
          : wiredEnabled,
        brightnessExpr: latched
          ? (wiredBrightness ? `(${wiredBrightness}) * _ledLevel_${stem}` : `_ledLevel_${stem}`)
          : wiredBrightness,
      }
    }

    /*
     * What a status panel draws about the LED output wired into it.
     *
     * The same two expressions `ledOutputRuntimeCpp` scales the pixels with,
     * so a panel reporting 72% and a fixture running at 72% are the same
     * number by construction rather than by two agreeing calculations. The
     * other three readings are compile-time facts — a fixture's name, form and
     * LED count cannot change on the device — and come from the same
     * `ledOutputStatus` helper the evaluator uses, so the fixture row reads
     * identically in preview and on the glass.
     *
     * Ordering is what makes this correct, and it is not incidental: the
     * `display` edge puts the panel after the output in the topological sort,
     * so `_ledOn_`/`_ledLevel_` are this pass's values rather than last
     * pass's. That is the whole reason the Display socket is a real port.
     */
    const ledStatusEmit = (source: StudioNode | undefined | null) => {
      if (!source || source.data.nodeType !== 'MatrixOutput') return undefined
      const runtime = outputRuntimeEmit(source, '', '')
      // The runtime handed in supplies only geometry and naming here; the two
      // live readings are expressions, resolved above.
      const status = ledOutputStatus(
        // The same title the canvas draws, and for the same reason the
        // evaluator resolves it this way: a node label is not persisted.
        nodeDisplayLabel(
          source.data.nodeType, props(source), String(source.data.label ?? 'LED output'),
        ),
        props(source), LED_OUTPUT_RUNTIME_DEFAULT,
      )
      return {
        name: status.name,
        formLabel: status.formLabel,
        ledCount: status.ledCount,
        enabledExpr: runtime.enabledExpr ?? 'true',
        brightnessExpr: runtime.brightnessExpr ?? '1.0f',
      }
    }

    // A statement that seeds `fbuf` from a frame input (or black if unwired).
    const seedFrom = (port: string) => {
      const s = srcBuf(port)
      return s ? `::memmove(${fbuf}, ${s}, sizeof(CRGB) * NUM_LEDS);` : `fill_solid(${fbuf}, NUM_LEDS, CRGB::Black);`
    }
    // This node's own float field buffer.
    const ffbuf = `field_${id}`
    const ownField = () => { fieldBufs.add(id); return ffbuf }
    // The float field buffer of the node feeding `port`, or null if unconnected.
    const srcField = (port: string): string | null => {
      const up = incoming.get(`${node.id}:${port}`)
      if (!up) return null
      fieldBufs.add(safeId(up.srcId))
      return `field_${safeId(up.srcId)}`
    }

    // Bypassed effect-chain nodes just copy their matching frame/field input
    // into their own buffer, skipping their own render entirely — mirrors the
    // evaluator's bypass so firmware matches the live A/B preview.
    if (p.bypassed) {
      const nodeOutputs = node.data.outputs as { id: string; dataType?: string }[]
      const nodeInputs = node.data.inputs as { id: string; dataType?: string }[]
      const bp = bypassPort(nodeOutputs, nodeInputs)
      const bpType = bp ? nodeOutputs.find((o) => o.id === bp.outPort)?.dataType : undefined
      // A bypassed node skips its own body, so any scalar side outputs it also
      // publishes (e.g. Clock Display's transport readouts) still need a
      // declaration or a downstream reference would not compile.
      const declareScalarOutputs = () => {
        for (const o of nodeOutputs) {
          if (o.dataType === 'float') ln(`  float ${v(o.id)} = 0.0f;`)
          else if (o.dataType === 'bool') ln(`  bool ${v(o.id)} = false;`)
        }
      }
      if (bp && bpType === 'frame') {
        ownBuf()
        ln(`  ${seedFrom(bp.inPort)}`)
        declareScalarOutputs()
        return
      }
      if (bp && bpType === 'field') {
        declareScalarOutputs()
        const src = srcField(bp.inPort)
        const buf = ownField()
        ln(src ? `  memcpy(${buf}, ${src}, sizeof(float) * NUM_LEDS);` : `  memset(${buf}, 0, sizeof(float) * NUM_LEDS);`)
        return
      }
    }

    const scalar = scalarControlCpp(type, id, p, (port, fallback) => f(port, port, fallback))
    if (scalar) {
      scalar.loop.forEach(ln)
      needsMapFloat[0] ||= scalar.needsMapFloat
      needsDisplayText.number ||= scalar.needsDisplayText
      return
    }

    const emitter = NODE_EMITTERS.get(type)
    if (!emitter) {
      ln(`  // ${type} — ${SHOW_PIPELINE_NOTES[type] ?? 'not yet supported in code gen'}`)
      return
    }
    emitter({
      ...sketch,
      node, id, p, type, ln, v, f, channelColor, gradientChannel, ownBuf, srcBuf, outputRuntimeEmit,
      ledStatusEmit, seedFrom, ownField, srcField,
    })
  }

  // Emit all node snippets first to collect needsMapFloat and needsT flags
  for (const node of sorted) emit(node)
  const irEmission = irRemoteProjectEmission(irNodes)
  for (const line of irEmission.setup) pinSetupLines.add(line)
  loopLines.push(...customDisplayPublication)

  const lines: string[] = []

  // Header (the overclock define must precede the FastLED include)
  const clocklessRoutes = outputConfigs.filter((route) => !SPI_CHIPSETS.has(route.hardware.chipset))
  const overclockHw = multipleOutputs && clocklessRoutes.length > 0
    ? { ...clocklessRoutes[0].hardware, overclock: Math.max(...clocklessRoutes.map((route) => route.hardware.overclock)) }
    : hw
  lines.push(...overclockDefineCpp(overclockHw))
  if (audio) lines.push(...audio.preInclude)
  lines.push(FASTLED_INCLUDE)
  lines.push(...irEmission.includes)
  if (isHub75) lines.push(...hub75IncludesCpp(hub75Hw!))
  if (needsWireHeader) lines.push(`#include <Wire.h>`)
  // The colour panel is driven through the Arduino SPI library rather than
  // bit-banged: a 240x240 frame is 115 KB, which no software loop ships in
  // time. The OLED beside it needs no include for exactly the opposite reason.
  // A custom Display's own panel driver needs the same library, so one push
  // covers both rather than risking two identical #include lines.
  if (tftDisplays.some((display) => !display.parallel) || customDisplayPanels.length > 0) {
    lines.push(TFT_DISPLAY_CPP_INCLUDES)
  }
  if (customDisplays.length > 0) lines.push(CUSTOM_DISPLAY_LVGL_INCLUDE)
  if (needsNetwork) {
    lines.push(`#if defined(ESP32)`)
    lines.push(`#include <WiFi.h>`)
    lines.push(`#include <WiFiUdp.h>`)
    lines.push(`#include <time.h>`)
    if (ethernetNode) lines.push(...ETHERNET_INCLUDES_CPP)
    lines.push(`#define FLS_NET_SUPPORTED 1`)
    lines.push(`#elif defined(ESP8266)`)
    lines.push(`#include <ESP8266WiFi.h>`)
    lines.push(`#include <WiFiUdp.h>`)
    lines.push(`#include <time.h>`)
    lines.push(`#define FLS_NET_SUPPORTED 1`)
    lines.push(`#else`)
    lines.push(`#define FLS_NET_SUPPORTED 0`)
    lines.push(`#endif`)
  }
  if (needsDmx512) {
    lines.push(`#if defined(ESP32)`)
    lines.push(`#include <esp_dmx.h>`)
    lines.push(`#endif`)
  }
  if (audio) lines.push(audio.include)
  // Above every function, because the Arduino .ino preprocessor hoists a
  // prototype for each one to a point above where these types are defined.
  // A helper taking one by reference then fails to compile on a line this
  // generator never wrote.
  if (infoDisplays.length > 0) lines.push(INFO_DISPLAY_CPP_FORWARD)
  if (segmentDisplays.length > 0) lines.push(SEGMENT_DISPLAY_CPP_FORWARD)
  if (tftDisplays.length > 0) lines.push(TFT_DISPLAY_CPP_FORWARD)
  if (customDisplays.length > 0) lines.push(CUSTOM_DISPLAY_LVGL_FORWARD)
  if (stereoVuMeters.length > 0) lines.push(STEREO_VU_CPP_FORWARD)
  if (emitRtcHelpers) lines.push(RTC_CPP_FORWARD)
  lines.push(``)
  if (ss) {
    lines.push(`#define SS       ${supersample}          // supersample factor: render at SS×, downscale`)
    lines.push(`#define PANEL_W  ${width}`)
    lines.push(`#define PANEL_H  ${height}`)
    lines.push(`#define PANEL_LEDS (PANEL_W * PANEL_H)   // physical LED count`)
    lines.push(`#define WIDTH    (PANEL_W * SS)`)
    lines.push(`#define HEIGHT   (PANEL_H * SS)`)
    lines.push(`#define NUM_LEDS (WIDTH * HEIGHT)        // render-buffer resolution`)
  } else {
    lines.push(`#define WIDTH    ${width}`)
    lines.push(`#define HEIGHT   ${height}`)
    lines.push(`#define NUM_LEDS (WIDTH * HEIGHT)`)
  }
  if (ringMap) {
    lines.push(`#define RING_LEDS ${ringMap.length}                 // LEDs around the ring`)
  }
  if (corkscrewMap) {
    lines.push(`#define CORKSCREW_LEDS ${corkscrewMap.length}           // LEDs along the helix`)
  }
  if (multipleOutputs) {
    for (const route of outputConfigs) {
      lines.push(`#define DATA_PIN_${route.safeId} ${route.dataPin}`)
      if (SPI_CHIPSETS.has(route.hardware.chipset)) lines.push(`#define CLOCK_PIN_${route.safeId} ${route.hardware.clockPin}`)
    }
  } else if (!isHub75 && outputNode) {
    lines.push(`#define DATA_PIN ${dataPin}`)
    if (SPI_CHIPSETS.has(hw.chipset)) lines.push(`#define CLOCK_PIN ${hw.clockPin}`)
  }
  lines.push(...amplifierIdle.defines)
  lines.push(``)
  if (multipleOutputs) {
    for (const route of outputConfigs) lines.push(`CRGB leds_${route.safeId}[${route.ledTotal}];`)
  } else if (isHub75) {
    lines.push(...hub75GlobalsCpp(hub75Hw!))
  } else if (outputNode) {
    lines.push(`CRGB leds[${physLeds}];`)
  }
  // One render buffer per frame-producing node so layers can be composited, and
  // one float buffer per field-producing node (FieldFormula …). With `usePsram`
  // these become pointers allocated in setup() (leds stays internal — see
  // PSRAM_ALLOC_CPP); otherwise they're plain static arrays.
  const bufferDecls = [
    ...[...frameBufs].map((b) => `CRGB buf_${b}[NUM_LEDS];`),
    ...[...fieldBufs].map((b) => `float field_${b}[NUM_LEDS];`),
  ]
  // The node feeding the output writes into `leds` itself rather than into a
  // second full-frame buffer that is then copied over — an alias, so every
  // reference to it in the loop is unchanged. Never a PSRAM buffer: `leds` is
  // always internal, and this is `leds`.
  const aliasDecl = `CRGB buf_${aliasedTerminalId}[NUM_LEDS];`
  const psramAllocs: string[] = []
  for (const d of bufferDecls) {
    if (aliasedTerminalId && d === aliasDecl) {
      lines.push(`CRGB* const buf_${aliasedTerminalId} = leds;   // renders straight into the output buffer`)
      continue
    }
    const ps = usePsram ? psramBufferDecl(d) : null
    if (ps) { lines.push(ps.decl); psramAllocs.push(ps.alloc) }
    else lines.push(d)
  }
  if (!nativeMultiRender) {
    for (const [id, capacity] of feedbackHistoryBufs) {
      lines.push(`CRGB _fb_${id}[${capacity}][NUM_LEDS];`)
    }
  }
  lines.push(``)
  if (usePsram) {
    lines.push(PSRAM_ALLOC_CPP)
    lines.push(``)
  }

  if (needsShims.v) {
    lines.push(CPP_SHIM_HELPERS)
    lines.push(``)
  }

  if (needsDisplayText.number || needsDisplayText.dateTime) {
    lines.push(displayTextCppHelpers({ ...needsDisplayText, copy: false }))
    lines.push(``)
  }

  if (segmentDisplays.length > 0) {
    lines.push(SEGMENT_DISPLAY_CPP_HELPERS)
    for (const display of segmentDisplays) lines.push(segmentDisplayGlobalCpp(display))
    lines.push(``)
  }

  if (infoDisplays.length > 0) {
    lines.push(infoDisplayHelpersCpp())
    for (const display of infoDisplays) lines.push(infoDisplayGlobalCpp(display))
    lines.push(``)
  }

  if (playerControlNodes.length > 0) {
    lines.push(PLAYER_CONTROLS_CPP)
    // Latch state is per output rather than per bundle: two fixtures wired to
    // one Control Map both go dark on a press, and each then remembers its
    // own level from there.
    for (const output of ledLatchOutputs) lines.push(ledOutputLatchGlobalCpp(output))
    lines.push(``)
  }

  // One _xptPoint definition regardless of how many panels sample it — a
  // touch-capable TransportDisplay and a touch-capable custom Display can
  // both be on the same bench.
  let xptPointHelpersEmitted = false
  const emitXptPointHelpersOnce = (): void => {
    if (xptPointHelpersEmitted) return
    lines.push(TFT_TOUCH_CPP_HELPERS)
    // `_resPoint` calls `_touchMap`, which lives in the block above, so it is
    // only ever appended after it - and only when a bare sheet is fitted,
    // since an SPI-only build has no use for the analog reads.
    // A bare sheet can be read by either half — a fixed layout or a screen
    // design — so the analog reads are gated on any panel in the build having
    // one, not on the fixed-layout list alone. Asking only that list emitted a
    // screen design's `_resPoint` call with nothing defining it.
    if (tftTouches.some((touch) => touch.resistive)
      || customDisplayPanels.some((panel) => panel.resistive)) {
      lines.push(RESISTIVE_TOUCH_CPP_HELPERS)
    }
    xptPointHelpersEmitted = true
  }
  if (tftDisplays.length > 0) {
    lines.push(tftDisplayHelpersCpp(tftDisplayHelperProfile(tftDisplays)))
    if (tftTouches.length > 0) emitXptPointHelpersOnce()
    for (const touch of tftTouches) lines.push(tftTouchGlobalCpp(touch))
    for (const display of tftDisplays) lines.push(tftDisplayGlobalCpp(display))
    for (const [id, artworks] of artworkTables) lines.push(transportArtworkTableCpp(id, artworks))
    lines.push(``)
  }

  if (customDisplays.length > 0) {
    lines.push(CUSTOM_DISPLAY_LVGL_HELPERS)
    lines.push(CUSTOM_DISPLAY_LVGL_TIMING_CPP)
    if (customDisplayPanels.some((panel) => panel.touch)) emitXptPointHelpersOnce()
    for (const display of customDisplays) {
      if (display.assets) lines.push(customDisplayAssetsCpp(display.id, display.document, display.assets))
      lines.push(customDisplayLvglGlobalCpp(display))
    }
    for (const panel of customDisplayPanels) {
      lines.push(customDisplayPanelGlobalCpp(panel))
      lines.push(customDisplayPanelHelpersCpp(panel))
    }
    lines.push(``)
  }

  if (stereoVuMeters.length > 0) {
    lines.push(STEREO_VU_CPP_HELPERS)
    lines.push(``)
  }

  if (needsPhi.v) {
    // Golden ratio — matches formulaLang.ts's MATH_CONSTANTS.PHI so a
    // CustomFormula/FieldFormula expression using PHI compiles unchanged.
    lines.push(`#define PHI 1.618033988749895f`)
    lines.push(``)
  }

  if (needsXyMap.v && !nativeMultiRender) {
    lines.push(`// Row-major coordinate map for FastLED 3.10+'s blur2d (buffers are always`)
    lines.push(`// row-major; serpentine wiring is remapped only at MatrixOutput).`)
    lines.push(`fl::XYMap _xyMap = fl::XYMap::constructRectangularGrid(WIDTH, HEIGHT);`)
    lines.push(``)
  }

  if (needsMapFloat[0]) {
    lines.push(MAP_FLOAT_CPP)
    lines.push(``)
  }

  if (needsKelvin.v) {
    lines.push(`// Approximate black-body white point for a colour temperature (Kelvin).`)
    lines.push(`CRGB kelvinToRGB(float kelvin) {`)
    lines.push(`  float t = constrain(kelvin, 1000.0f, 40000.0f) / 100.0f, r, g, b;`)
    lines.push(`  if (t <= 66) { r = 255; g = 99.4708025861f * log(t) - 161.1195681661f; }`)
    lines.push(`  else { r = 329.698727446f * pow(t - 60, -0.1332047592f); g = 288.1221695283f * pow(t - 60, -0.0755148492f); }`)
    lines.push(`  if (t >= 66) b = 255; else if (t <= 19) b = 0; else b = 138.5177312231f * log(t - 10) - 305.0447927307f;`)
    lines.push(`  return CRGB(constrain((int)r, 0, 255), constrain((int)g, 0, 255), constrain((int)b, 0, 255));`)
    lines.push(`}`)
    lines.push(``)
  }

  if (need3d.v) {
    lines.push(TRANSITION_3D_HELPERS_CPP)
    lines.push()
  }

  if (needsWorley.v) {
    lines.push(`// Integer hash → [0,1) placing one feature point per cell (Worley noise).`)
    lines.push(`float _worleyHash(int x, int y) {`)
    lines.push(`  uint32_t h = (uint32_t)(x * 374761393) + (uint32_t)(y * 668265263);`)
    lines.push(`  h = (h ^ (h >> 13)) * 1274126177u;`)
    lines.push(`  return ((h ^ (h >> 16)) & 0xFFFFFF) / 16777216.0f;`)
    lines.push(`}`)
    lines.push(``)
  }

  // A ring's map is the composition pixel each LED reads, baked from the same
  // pure helper the live preview routes through, so the circle on the bench and
  // the circle in the preview are the same circle by construction.
  if (multipleOutputs) {
    for (const route of outputConfigs) {
      if (route.ringMap) {
        lines.push(`// Ring sample map for ${cppComment(route.label)} — render index per LED.`)
        lines.push(`const uint16_t _ringmap_${route.safeId}[${route.ringMap.length}] PROGMEM = { ${route.ringMap.join(',')} };`)
        lines.push(``)
      }
      if (route.corkscrewMap) {
        lines.push(`// Corkscrew sample map for ${cppComment(route.label)} — unwrapped-cylinder render index per LED.`)
        lines.push(`const uint16_t _corkscrewmap_${route.safeId}[${route.corkscrewMap.length}] PROGMEM = { ${route.corkscrewMap.join(',')} };`)
        lines.push(``)
      }
    }
  } else if (ringMap) {
    lines.push(`// Ring sample map (LED index -> render index), baked from the ring's`)
    lines.push(`// LED count, start angle, and direction.`)
    lines.push(`const uint16_t _ringmap[RING_LEDS] PROGMEM = { ${ringMap.join(',')} };`)
    lines.push(``)
  } else if (corkscrewMap) {
    lines.push(`// Corkscrew sample map (LED index -> render index), baked from the`)
    lines.push(`// cylinder size, turns, start angle, and direction.`)
    lines.push(`const uint16_t _corkscrewmap[CORKSCREW_LEDS] PROGMEM = { ${corkscrewMap.join(',')} };`)
    lines.push(``)
  }

  if (multipleOutputs) {
    for (const route of outputConfigs) {
      if (!route.xyTable) continue
      lines.push(`// Physical wiring map for ${cppComment(route.label)}.`)
      lines.push(`const uint16_t _xytable_${route.safeId}[${route.width * route.height}] PROGMEM = { ${route.xyTable.join(',')} };`)
      lines.push(`uint16_t XY_${route.safeId}(uint8_t x, uint8_t y) { return pgm_read_word(&_xytable_${route.safeId}[(uint16_t)y * ${route.width} + x]); }`)
      lines.push(``)
    }
  } else if (xyTable) {
    lines.push(`// Physical wiring map (grid index -> physical LED index), baked from`)
    lines.push(`// LED output layout/serpentine/tile settings.`)
    lines.push(`const uint16_t _xytable[${width * height}] PROGMEM = { ${xyTable.join(',')} };`)
    lines.push(`uint16_t XY(uint8_t x, uint8_t y) { return pgm_read_word(&_xytable[(uint16_t)y * ${panelW} + x]); }`)
    lines.push(``)
  }

  if (audio) {
    lines.push(...audio.code)
    lines.push(``)
  }

  for (const meter of stereoVuMeters) usedPalettes.add(stereoVuPaletteId(meter.properties))

  if (emitRtcHelpers) {
    lines.push(...rtcHelperCpp())
  }
  if (needsDs3231) {
    lines.push(...ds3231HelperCpp())
  }
  if (powerMonitors.length > 0) lines.push(...POWER_MONITOR_HELPER_CPP)
  if (presenceSensors.length > 0) lines.push(...PRESENCE_SENSOR_HELPER_CPP)
  if (digitalLightSensors.length > 0) lines.push(...LIGHT_SENSOR_HELPER_CPP)

  if (needsNetwork && ethernetNode) {
    const p = props(ethernetNode)
    const d = libraryDefaults('EthernetModule')
    const pin = (key: string) => intProp(p[key] ?? d[key], Number(d[key]), 0, MAX_PIN_NUMBER)
    const staticConfig = !networkCfg.useDhcp && networkCfg.staticIp && networkCfg.staticGateway && networkCfg.staticSubnet
      ? {
          ip: ipAddressExpr(networkCfg.staticIp),
          gateway: ipAddressExpr(networkCfg.staticGateway),
          subnet: ipAddressExpr(networkCfg.staticSubnet),
          dns: ipAddressExpr(networkCfg.staticDns),
        }
      : null
    lines.push(...ethernetBootstrapCpp({
      label: partById(String(p.partId ?? DEFAULT_ETHERNET_PART_ID))?.label ?? 'W5500 Ethernet',
      sckPin: pin('sckPin'),
      mosiPin: pin('mosiPin'),
      misoPin: pin('misoPin'),
      csPin: pin('csPin'),
      intPin: pin('intPin'),
      resetPin: pin('resetPin'),
      hostname: networkCfg.hostname,
      staticConfig,
    }))
  } else if (needsNetwork) {
    lines.push(`// Shared Wi-Fi bootstrap for Art-Net receive / NTP clock sync.`)
    lines.push(`static bool _wifiInit = false;`)
    lines.push(`static uint32_t _wifiLastAttemptMs = 0;`)
    lines.push(`void _netEnsureConnected() {`)
    lines.push(`#if FLS_NET_SUPPORTED`)
    lines.push(`  if (!_wifiInit) {`)
    lines.push(`    WiFi.mode(WIFI_STA);`)
    lines.push(`#if defined(ESP32)`)
    lines.push(`    WiFi.setHostname(${networkCfg.hostname});`)
    lines.push(`#elif defined(ESP8266)`)
    lines.push(`    WiFi.hostname(${networkCfg.hostname});`)
    lines.push(`#endif`)
    if (!networkCfg.useDhcp && networkCfg.staticIp && networkCfg.staticGateway && networkCfg.staticSubnet) {
      lines.push(`    WiFi.config(${ipAddressExpr(networkCfg.staticIp)}, ${ipAddressExpr(networkCfg.staticGateway)}, ${ipAddressExpr(networkCfg.staticSubnet)}, ${ipAddressExpr(networkCfg.staticDns)});`)
    }
    lines.push(`    _wifiInit = true;`)
    lines.push(`  }`)
    lines.push(`  if (WiFi.status() == WL_CONNECTED) return;`)
    lines.push(`  uint32_t _wifiNow = millis();`)
    lines.push(`  if (_wifiNow - _wifiLastAttemptMs < 5000u) return;`)
    lines.push(`  _wifiLastAttemptMs = _wifiNow;`)
    lines.push(`  WiFi.begin(${networkCfg.ssid}, ${networkCfg.password});`)
    lines.push(`#endif`)
    lines.push(`}`)
    lines.push(`bool _netConnected() {`)
    lines.push(`#if FLS_NET_SUPPORTED`)
    lines.push(`  return WiFi.status() == WL_CONNECTED;`)
    lines.push(`#else`)
    lines.push(`  return false;`)
    lines.push(`#endif`)
    lines.push(`}`)
    lines.push(``)
  }

  lines.push(...customPaletteDeclarationsCpp(usedPalettes))
  lines.push(``)

  for (const meter of stereoVuMeters) lines.push(stereoVuGlobalCpp(meter))
  if (stereoVuMeters.length > 0) lines.push(``)

  // File-scope code from Code nodes (helpers, persistent vars, palettes).
  if (globalLines.length) {
    lines.push(...globalLines)
  }
  if (irEmission.globals.length) {
    lines.push(...irEmission.globals)
    lines.push('')
  }

  if (nativeMultiRender) {
    // One source render body, instantiated once per distinct shape. Template
    // instantiation gives every pass its own function-local static evaluator
    // state, while buf_/field_ remain one maximum-sized global set reused by
    // the calls in sequence.
    const renderBody = loopLines.map((line) => line
      .replace(/\bNUM_LEDS\b/g, 'RENDER_LEDS')
      .replace(/\bWIDTH\b/g, 'RENDER_WIDTH')
      .replace(/\bHEIGHT\b/g, 'RENDER_HEIGHT'))
    // Explicit template prototype keeps Arduino's .ino preprocessor from
    // inventing a non-template overload above the definition.
    lines.push(`template<uint8_t RENDER_PASS, int RENDER_WIDTH, int RENDER_HEIGHT>`)
    lines.push(`float renderOutputPass(float t);`)
    lines.push(`template<uint8_t RENDER_PASS, int RENDER_WIDTH, int RENDER_HEIGHT>`)
    lines.push(`float renderOutputPass(float t) {`)
    lines.push(`  static constexpr int RENDER_LEDS = RENDER_WIDTH * RENDER_HEIGHT;`)
    for (const id of persistentFrameStateBufs) {
      lines.push(`  static CRGB _passState_${id}[RENDER_LEDS];`)
    }
    for (const [id, capacity] of feedbackHistoryBufs) {
      lines.push(`  static CRGB _fb_${id}[${capacity}][RENDER_LEDS];`)
    }
    if (needsXyMap.v) {
      lines.push(`  static fl::XYMap _xyMap = fl::XYMap::constructRectangularGrid(RENDER_WIDTH, RENDER_HEIGHT);`)
    }
    lines.push(...renderBody)
    lines.push(`  return ${masterSpeedEmit.speedExpr
      ? `constrain(${masterSpeedEmit.speedExpr}, ${masterSpeedEmit.min.toFixed(1)}f, ${masterSpeedEmit.max.toFixed(1)}f)`
      : `${masterSpeedEmit.initial.toFixed(4)}f`};`)
    lines.push(`}`)
    lines.push(``)
  }

  if (emitTelemetry) {
    // After every panel, so `sizeof` sees the buffers rather than a number this
    // generator guessed at — an estimate that reports itself proves nothing.
    lines.push(...deviceTelemetryGlobalsCpp(telemetryEmitFromSource(lines)))
  }
  lines.push(`void setup() {`)
  lines.push(...amplifierIdle.setup)
  lines.push(...psramAllocs)
  lines.push(...pinSetupLines)
  // One Serial.begin, and only if the DS3231 command path has not already
  // opened the port for its own reasons.
  if (emitTelemetry && !needsDs3231) lines.push(TELEMETRY_SERIAL_BEGIN_CPP)
  // Must run before any other LVGL call — every custom Display's screen and
  // panel setup below (in setupLines) creates LVGL objects.
  if (customDisplays.length > 0) lines.push(`  lv_init();`)
  // The wired interface has to exist before an Art-Net socket is opened on it
  // in setupLines below. Starting it does not wait for a cable or an address.
  if (needsNetwork && ethernetNode) lines.push(`  _netEnsureConnected();`)
  lines.push(...setupLines)
  if (customDisplays.length > 0) lines.push(customDisplayLvglTimingSetupCpp())
  lines.push(...infoDisplayStartupStageBatchCpp(infoDisplays, 1))
  lines.push(...infoDisplayStartupStageBatchCpp(infoDisplays, 2))
  if (multipleOutputs) {
    for (const route of outputConfigs) {
      lines.push(...fastledSetupCpp(route.hardware, {
        dataPinMacro: `DATA_PIN_${route.safeId}`,
        clockPinMacro: `CLOCK_PIN_${route.safeId}`,
        brightness: null,
        ledCountMacro: String(route.ledTotal),
        ledsName: `leds_${route.safeId}`,
        controllerName: `controller_${route.safeId}`,
      }))
    }
    lines.push(`  FastLED.setBrightness(255);  // controller brightness is applied while routing pixels`)
  } else if (isHub75) {
    lines.push(...hub75SetupCpp(hub75Hw!))
  } else if (outputNode) {
    lines.push(...fastledSetupCpp(hw, (ss || ringMap || corkscrewMap) ? { ledCountMacro: physLeds } : {}))
  }
  for (const meter of stereoVuMeters) {
    const meterHw = ledHardwareFromProps(meter.properties)
    lines.push(...fastledSetupCpp(meterHw, {
      dataPinMacro: `VU_LEFT_PIN_${meter.id}`,
      brightness: null,
      ledCountMacro: `VU_LEDS_${meter.id}`,
      ledsName: `_vuLeft_${meter.id}`,
      controllerName: `_vuLeftController_${meter.id}`,
    }))
    lines.push(...fastledSetupCpp(meterHw, {
      dataPinMacro: `VU_RIGHT_PIN_${meter.id}`,
      brightness: null,
      ledCountMacro: `VU_LEDS_${meter.id}`,
      ledsName: `_vuRight_${meter.id}`,
      controllerName: `_vuRightController_${meter.id}`,
    }))
  }
  if (stereoVuMeters.length > 0) {
    lines.push(`  // The fixture scales its own pixels first; the Board's FastLED master brightness`)
    lines.push(`  // and global power limiter then apply to the matrix and both rails together.`)
  }
  // HUB75 has no FastLED CLEDController registered, so setMaxPowerInVoltsAndMilliamps
  // would have nothing to throttle.
  if (powerLimit && !isHub75 && (outputNode || stereoVuMeters.length > 0)) {
    lines.push(`  FastLED.setMaxPowerInVoltsAndMilliamps(${volts}, ${milliamps});`)
  }
  lines.push(...infoDisplayStartupStageBatchCpp(infoDisplays, 3))
  lines.push(...infoDisplayStartupStageBatchCpp(infoDisplays, 4))
  if (emitEngine) lines.push(`  setupAudio();`)
  lines.push(...infoDisplayStartupStageBatchCpp(infoDisplays, 5))
  lines.push(...infoDisplayStartupStageBatchCpp(infoDisplays, 6))
  lines.push(`}`)
  lines.push(``)

  lines.push(`void loop() {`)
  if (emitTelemetry) lines.push(TELEMETRY_LOOP_BEGIN_CPP)
  if (emitEngine) lines.push(`  updateAudio();`)
  if (needsDs3231) lines.push(`  _rtcHandleSerialSet();`)
  if (needsT.v) lines.push(...masterClockLoopCpp(masterSpeedEmit))
  for (const panel of customDisplayPanels) {
    if (!panel.touch) continue
    const read = `lv_indev_read(_cdIndev_${panel.id});`
    lines.push(panel.enabledExpr === 'true' ? `  ${read}` : `  if (_cdPanelOn_${panel.id}) ${read}`)
  }
  lines.push(...customDisplaySamples)
  // After the snapshot and before the walk, including a multi-output render
  // function that reads these bools from file scope. One decode per pass.
  lines.push(...irEmission.sample)
  if (nativeMultiRender) {
    renderPasses.forEach((pass, index) => {
      const call = `renderOutputPass<${index}, ${pass.width}, ${pass.height}>(${needsT.v ? 't' : '0.0f'})`
      if (index === 0 && masterSpeedEmit.speedExpr && needsT.v) lines.push(`  _tSpeed = ${call};  // resolved for the next frame`)
      else lines.push(`  ${call};`)
    })
  } else {
    lines.push(...loopLines)
    if (needsT.v) lines.push(...masterSpeedUpdateCpp(masterSpeedEmit))
  }
  if (multipleOutputs || stereoVuMeters.length > 0) {
    lines.push(`  FastLED.show();`)
  }
  // Bounded by its own wall-clock gate, so a fast LED loop cannot over-service
  // it and a slow one still redraws promptly.
  if (customDisplays.length > 0) lines.push(customDisplayLvglTimingLoopCpp())
  // Before the pacing delay: the report then measures the work a pass did, not
  // the sleep it was told to take.
  if (emitTelemetry) lines.push(TELEMETRY_REPORT_CPP)
  lines.push(FASTLED_PACING)
  lines.push(`}`)

  return withoutUnusedFastLed(lines).join('\n')
}

const FASTLED_PACING = '  FastLED.delay(16);  // ~60 fps'
const FASTLED_INCLUDE = '#include <FastLED.h>'

/**
 * Leave FastLED out of a sketch that never draws an LED.
 *
 * A screen-only build - a panel and a screen design, no LED output anywhere
 * - used to reach for FastLED twice: the include, and `FastLED.delay` to
 * pace the loop. The call is replaceable by a plain `delay`, and the include
 * is the expensive half, because arduino-cli compiles every source file in a
 * library folder whether the sketch uses it or not.
 *
 * Decided from what was actually emitted rather than from a list of features
 * that imply FastLED, so a node added later that draws pixels keeps the
 * include without anyone remembering to say so. Deliberately conservative:
 * anything that so much as looks like FastLED keeps it, because being wrong
 * that way costs a compile we already pay for today, while being wrong the
 * other way breaks the build.
 */
function withoutUnusedFastLed(lines: string[]): string[] {
  const uses = /\b(FastLED|CRGB|CHSV|CLEDController|CPixelView|fill_solid|fill_rainbow|fill_gradient\w*|nscale8\w*|blend8|beatsin\d*|inoise\d*|EVERY_N_\w+|qadd8|qsub8|scale8\w*)\b/
  const needed = lines.some((line) => (
    line !== FASTLED_PACING && line !== FASTLED_INCLUDE && uses.test(line)
  ))
  if (needed) return lines
  return lines
    .filter((line) => line !== FASTLED_INCLUDE)
    .map((line) => (line === FASTLED_PACING ? '  delay(16);  // ~60 fps' : line))
}
