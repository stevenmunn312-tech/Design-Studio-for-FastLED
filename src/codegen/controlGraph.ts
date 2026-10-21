// A bounded, typed dependency graph for scalar paths outside pattern renderers.
// Building the IR performs no I/O or evaluation of authored scripts. Template
// generators use the same resolver for validation and emission.
import type { StudioNode, StudioEdge } from '../state/graphStore'
import { inputClampRange, resolveNodeNumericProperties } from '../state/nodeLibrary'
import { compositionDims } from '../state/output/outputRouting'
import { controlInputCpp, type ControlInputEmission } from './controlInputCpp'
import { i2cDistanceBusPeers } from '../state/peripherals/distanceSensor'
import { irRemoteProjectEmission, type IrRemoteProjectNode } from './peripherals/irRemoteCpp'
import { displayTextCppHelpers } from './displays/displayTextCpp'
import { TIME_CONTROL_OUTPUTS, timeNodeCpp } from './signalTimeCpp'
import { MAP_FLOAT_CPP, SCALAR_CONTROL_NODES, scalarControlCpp, scalarControlInputDefaults, scalarControlInputType, type ControlDataType } from './scalarControlCpp'
import { COLOR_CONTROL_NODES, colorControlCpp } from './colorControlCpp'
import { TIMED_CONTROL_NODES, timedControlCpp } from './signalControlCpp'
import { RTC_CONTROL_OUTPUTS, rtcControlEmission, rtcTimeSource } from './peripherals/rtcInputCpp'
import { RTC_CPP_FORWARD } from './peripherals/rtcCpp'
import { webRemoteControlEmission } from './peripherals/webRemoteCpp'
import { HUE_MIX_HELPER_CPP } from './helpers/hueMixHelperCpp'
import { KELVIN_TO_RGB_CPP } from './helpers/kelvinCpp'

export const MAX_CONTROL_GRAPH_NODES = 256
const safeId = (id: string) => id.replace(/[^a-zA-Z0-9_]/g, '_')

export interface ControlReference { nodeId: string; port: string; type: ControlDataType }
export type ControlOperand =
  | { kind: 'literal'; value: number }
  | { kind: 'reference'; reference: ControlReference; clamp?: { min: number; max: number } }

/** A colour input is either one wired CRGB or the three channel fields under it. */
export type ColorControlInput =
  | { kind: 'float'; operand: ControlOperand }
  | { kind: 'color'; reference: ControlReference }
  | { kind: 'channels'; channels: [ControlOperand, ControlOperand, ControlOperand] }

export type ControlInstruction =
  | { kind: 'time'; nodeId: string }
  | { kind: 'gpio'; nodeId: string; emission: ControlInputEmission }
  | { kind: 'scalar'; nodeId: string; nodeType: string; properties: Record<string, unknown>; inputs: Record<string, ControlOperand> }
  | { kind: 'color'; nodeId: string; nodeType: string; properties: Record<string, unknown>; inputs: Record<string, ColorControlInput> }
  | { kind: 'timed'; nodeId: string; nodeType: string; properties: Record<string, unknown>; inputs: Record<string, string>; attackWired: boolean }

export function controlReferenceCpp(reference: ControlReference): string {
  return `n_${safeId(reference.nodeId)}_${safeId(reference.port)}`
}

export function createControlGraph(nodes: StudioNode[], edges: StudioEdge[], sampledSources: readonly ControlReference[] = []) {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const incoming = new Map(edges.map((edge) => [`${edge.target}:${edge.targetHandle}`, edge]))
  const { w, h } = compositionDims(nodes, edges)
  const instructions: ControlInstruction[] = []
  const errors = new Set<string>()
  const done = new Set<string>(), visiting = new Set<string>()
  const symbols = new Map<string, string>()
  const usedSamples = new Map<string, ControlReference>()
  const label = (id: string) => String(byId.get(id)?.data.label || id)
  const fail = (message: string): null => { errors.add(message); return null }
  const samples = new Map(sampledSources.map((source) => [JSON.stringify([source.nodeId, source.port]), source]))
  // One serial reader serves every DS3231. The first chip to be emitted owns it.
  let rtcSerialArmed = false
  // Samples are declared before the graph even when no consumer reads them.
  // Reserve all their symbols so an otherwise unused output cannot collide.
  for (const source of sampledSources) {
    const symbol = controlReferenceCpp(source), owner = JSON.stringify([source.nodeId, source.port])
    if (symbols.has(symbol) && symbols.get(symbol) !== owner) fail(`${label(source.nodeId)}: control identifiers collide after sanitization. Rename or recreate this node.`)
    symbols.set(symbol, owner)
  }

  const resolve = (nodeId: string, port: string, type: ControlDataType): ControlReference | null => {
    const node = byId.get(nodeId)
    if (!node) return fail(`Control graph: missing source ${nodeId}.`)
    const color = Object.hasOwn(COLOR_CONTROL_NODES, node.data.nodeType) ? COLOR_CONTROL_NODES[node.data.nodeType] : undefined
    const scalar = !color && Object.hasOwn(SCALAR_CONTROL_NODES, node.data.nodeType) ? SCALAR_CONTROL_NODES[node.data.nodeType] : undefined
    const timed = !color && !scalar && Object.hasOwn(TIMED_CONTROL_NODES, node.data.nodeType)
      ? TIMED_CONTROL_NODES[node.data.nodeType] : undefined
    const rtc = node.data.nodeType === 'RTCInput'
    const clock = node.data.nodeType === 'TimeNode'
    // A Web Remote reads the whole graph for the shared network, so it is
    // built here rather than by `controlInputCpp`, which sees one node.
    const remote = node.data.nodeType === 'WebRemoteInput'
      ? webRemoteControlEmission(safeId(node.id), node.data.properties, nodes) : null
    const gpio = scalar || clock || color || timed || rtc ? null
      : remote ?? controlInputCpp(node.data.nodeType, safeId(node.id), node.data.properties)
    const sample = samples.get(JSON.stringify([nodeId, port]))
    const outputs: Readonly<Record<string, ControlDataType>> = clock ? TIME_CONTROL_OUTPUTS
      : scalar ? { [scalar.port]: scalar.type }
      : color ? color.outputs
      : timed ? timed.outputs
      : rtc ? RTC_CONTROL_OUTPUTS
      : gpio?.outputs ?? {}
    const actualType = sample?.type ?? (Object.hasOwn(outputs, port) ? outputs[port] : undefined)
    if (actualType !== type) return fail(`${label(nodeId)}.${port}: control graph requires ${type}; this source or port is unsupported.`)
    const reference = { nodeId, port, type }
    const owner = JSON.stringify([nodeId, port])
    // A producer emits all its outputs, including ones no consumer asks for.
    // Reserve every emitted symbol, not just the currently requested port.
    for (const output of sample ? [port] : Object.keys(outputs)) {
      const symbol = controlReferenceCpp({ nodeId, port: output, type })
      const outputOwner = JSON.stringify([nodeId, output])
      if (symbols.has(symbol) && symbols.get(symbol) !== outputOwner) return fail(`${label(nodeId)}: control identifiers collide after sanitization. Rename or recreate this node.`)
      symbols.set(symbol, outputOwner)
    }
    // Touch outputs depend on the pre-pass sample, never on a wired Set value.
    if (sample) { usedSamples.set(owner, reference); return reference }
    if (done.has(nodeId)) return reference
    if (visiting.has(nodeId)) return fail(`${label(nodeId)}: control graph contains an instantaneous cycle. Remove a feedback wire.`)
    if (visiting.size + done.size >= MAX_CONTROL_GRAPH_NODES) return fail(`Control graph exceeds ${MAX_CONTROL_GRAPH_NODES} nodes. Split or simplify its wiring.`)
    visiting.add(nodeId)
    if (clock) {
      instructions.push({ kind: 'time', nodeId })
    } else if (gpio) {
      instructions.push({ kind: 'gpio', nodeId, emission: gpio })
    } else if (color) {
      const properties = node.data.properties
      const inputs: Record<string, ColorControlInput> = {}
      const takeFloat = (inputPort: string, fallback: number): ControlOperand | null => {
        const edge = incoming.get(`${nodeId}:${inputPort}`)
        if (edge) {
          const upstream = resolve(edge.source, edge.sourceHandle ?? '', 'float')
          if (!upstream) return null
          const clamp = properties.clampInputs ? inputClampRange(node.data.nodeType, inputPort) : null
          return { kind: 'reference', reference: upstream, ...(clamp ? { clamp } : {}) }
        }
        const value = Number(properties[inputPort] ?? fallback)
        if (!Number.isFinite(value)) return fail(`${label(nodeId)}.${inputPort}: control value must be finite.`)
        return { kind: 'literal', value }
      }
      for (const [inputPort, fallback] of Object.entries(color.floats)) {
        const operand = takeFloat(inputPort, fallback)
        if (!operand) { visiting.delete(nodeId); return null }
        inputs[inputPort] = { kind: 'float', operand }
      }
      for (const spec of color.colors) {
        const edge = incoming.get(`${nodeId}:${spec.port}`)
        if (edge) {
          const upstream = resolve(edge.source, edge.sourceHandle ?? '', 'color')
          if (!upstream) { visiting.delete(nodeId); return null }
          inputs[spec.port] = { kind: 'color', reference: upstream }
        } else {
          const channels: ControlOperand[] = []
          for (let index = 0; index < spec.channels.length; index++) {
            const operand = takeFloat(spec.channels[index], spec.defaults[index])
            if (!operand) { visiting.delete(nodeId); return null }
            channels.push(operand)
          }
          inputs[spec.port] = { kind: 'channels', channels: channels as [ControlOperand, ControlOperand, ControlOperand] }
        }
      }
      instructions.push({ kind: 'color', nodeId, nodeType: node.data.nodeType, properties, inputs })
    } else if (rtc) {
      // dateTime is not a control port. Emitting the node writes the struct
      // beside these scalars; the first DS3231 owns the one serial reader.
      const serialSet = !rtcSerialArmed && rtcTimeSource(node.data.properties) === 'DS3231'
      if (serialSet) rtcSerialArmed = true
      instructions.push({
        kind: 'gpio', nodeId,
        emission: rtcControlEmission(safeId(node.id), node.data.properties, nodes, serialSet),
      })
    } else if (timed) {
      const inputs: Record<string, string> = {}
      let attackWired = false
      for (const [inputPort, spec] of Object.entries(timed.inputs)) {
        const edge = incoming.get(`${nodeId}:${inputPort}`)
        if (edge) {
          const upstream = resolve(edge.source, edge.sourceHandle ?? '', spec.type)
          if (!upstream) { visiting.delete(nodeId); return null }
          if (inputPort === 'attack') attackWired = true
          let expression = controlReferenceCpp(upstream)
          if (spec.type === 'float' && node.data.properties.clampInputs) {
            const clamp = inputClampRange(node.data.nodeType, inputPort)
            if (clamp) expression = `constrain(${expression}, ${clamp.min}, ${clamp.max})`
          }
          inputs[inputPort] = expression
        } else if (spec.type === 'bool') {
          // Enable follows its property (default on). Every other bool defaults off.
          inputs[inputPort] = inputPort === 'enable' && node.data.properties.enable !== false ? 'true' : 'false'
        } else {
          const value = Number(node.data.properties[inputPort] ?? spec.fallback)
          if (!Number.isFinite(value)) {
            visiting.delete(nodeId)
            return fail(`${label(nodeId)}.${inputPort}: control value must be finite.`)
          }
          inputs[inputPort] = String(value)
        }
      }
      instructions.push({
        kind: 'timed', nodeId, nodeType: node.data.nodeType,
        properties: node.data.properties, inputs, attackWired,
      })
    } else {
      const properties = resolveNodeNumericProperties(node.data.nodeType, node.data.properties, w, h)
      const inputs: Record<string, ControlOperand> = {}
      for (const [input, fallback] of Object.entries(scalarControlInputDefaults(node.data.nodeType, properties))) {
        const edge = incoming.get(`${nodeId}:${input}`)
        if (edge) {
          const upstream = resolve(edge.source, edge.sourceHandle ?? '', scalarControlInputType(node.data.nodeType, input))
          if (!upstream) { visiting.delete(nodeId); return null }
          const clamp = properties.clampInputs ? inputClampRange(node.data.nodeType, input) : null
          inputs[input] = { kind: 'reference', reference: upstream, ...(clamp ? { clamp } : {}) }
        } else {
          const value = Number(properties[input] ?? fallback)
          if (!Number.isFinite(value)) { visiting.delete(nodeId); return fail(`${label(nodeId)}.${input}: control value must be finite.`) }
          inputs[input] = { kind: 'literal', value }
        }
      }
      instructions.push({ kind: 'scalar', nodeId, nodeType: node.data.nodeType, properties, inputs })
    }
    visiting.delete(nodeId)
    done.add(nodeId)
    // A laser sensor's peer has to be emitted with it. `done` is filled by this
    // walk, which callers run after createControlGraph returns, so the peer
    // cannot be chosen before the walk.
    if (node.data.nodeType === 'DistanceInput') {
      for (const peer of i2cDistanceBusPeers(nodes, nodes.filter((entry) => done.has(entry.id)))) {
        if (done.has(peer.id) || visiting.has(peer.id)) continue
        const peerEmission = controlInputCpp(peer.data.nodeType, safeId(peer.id), peer.data.properties)
        if (!peerEmission) continue
        instructions.push({ kind: 'gpio', nodeId: peer.id, emission: peerEmission })
        done.add(peer.id)
      }
    }
    return reference
  }

  const input = (nodeId: string, port: string, type: ControlDataType): ControlReference | null => {
    const edge = incoming.get(`${nodeId}:${port}`)
    return edge ? resolve(edge.source, edge.sourceHandle ?? '', type) : null
  }
  // Include unwired hardware when diagnostics are explicitly requested.
  for (const node of nodes) {
    if (!['IRRemoteInput', 'PowerMonitorInput'].includes(node.data.nodeType) || node.data.properties.debug !== true) continue
    const emission = controlInputCpp(node.data.nodeType, safeId(node.id), node.data.properties)!
    instructions.push({ kind: 'gpio', nodeId: node.id, emission })
    done.add(node.id)
  }
  return { instructions, errors, resolve, input, usedSamples }
}

/** Emit each producer exactly once in dependency order. Values live for the
 * whole loop, so all downstream consumers observe the same GPIO sample. */
export function controlGraphCpp(graph: ReturnType<typeof createControlGraph>, timeExpr = 'millis() / 1000.0f') {
  if (graph.errors.size) throw new Error([...graph.errors].join('\n'))
  const setup = new Set<string>(), helpers = new Set<string>(), includes = new Set<string>(), loop: string[] = []
  const irNodes: IrRemoteProjectNode[] = []
  let needsTime = false
  for (const instruction of graph.instructions) {
    if (instruction.kind === 'time') {
      needsTime = true
      loop.push(...timeNodeCpp(safeId(instruction.nodeId), '_controlTime'))
      continue
    }
    if (instruction.kind === 'gpio') {
      if (instruction.emission.ir) {
        irNodes.push(instruction.emission.ir)
        continue
      }
      instruction.emission.setup.forEach((line) => setup.add(line))
      instruction.emission.helpers?.forEach((helper) => helpers.add(helper))
      instruction.emission.includes?.forEach((include) => includes.add(include))
      loop.push(...instruction.emission.loop)
      continue
    }
    if (instruction.kind === 'color') {
      const operandCpp = (operand: ControlOperand): string => {
        if (operand.kind === 'literal') return String(operand.value)
        const expression = controlReferenceCpp(operand.reference)
        return operand.clamp ? `constrain(${expression}, ${operand.clamp.min}, ${operand.clamp.max})` : expression
      }
      const channelCpp = (operand: ControlOperand): string => {
        if (operand.kind === 'literal') return String(operand.value)
        return `(uint8_t)(constrain(${operandCpp(operand)}, 0.0f, 255.0f) + 0.5f)`
      }
      const floats: Record<string, string> = {}
      const colors: Record<string, string> = {}
      for (const [port, input] of Object.entries(instruction.inputs)) {
        if (input.kind === 'float') floats[port] = operandCpp(input.operand)
        else if (input.kind === 'color') colors[port] = controlReferenceCpp(input.reference)
        else colors[port] = `CRGB(${input.channels.map(channelCpp).join(', ')})`
      }
      const emitted = colorControlCpp(
        instruction.nodeType, safeId(instruction.nodeId), instruction.properties, floats, colors, '_controlTime',
      )!
      loop.push(...emitted.loop)
      needsTime ||= emitted.needsTime
      if (emitted.needsMapFloat) helpers.add(MAP_FLOAT_CPP)
      if (emitted.needsKelvin) helpers.add(KELVIN_TO_RGB_CPP)
      if (emitted.needsHueMix) helpers.add(HUE_MIX_HELPER_CPP)
      continue
    }
    if (instruction.kind === 'timed') {
      // Wall-clock millis and the node's own statics. Not the animation clock.
      loop.push(...timedControlCpp(
        instruction.nodeType, safeId(instruction.nodeId), instruction.properties,
        instruction.inputs, instruction.attackWired,
      )!)
      continue
    }
    const emitted = scalarControlCpp(instruction.nodeType, safeId(instruction.nodeId), instruction.properties, (port) => {
      const operand = instruction.inputs[port]
      if (operand.kind === 'literal') return String(operand.value)
      const expression = controlReferenceCpp(operand.reference)
      return operand.clamp ? `constrain(${expression}, ${operand.clamp.min}, ${operand.clamp.max})` : expression
    }, '_controlTime')!
    loop.push(...emitted.loop)
    needsTime ||= emitted.needsTime
    if (emitted.needsMapFloat) helpers.add(MAP_FLOAT_CPP)
    if (emitted.needsDisplayText) helpers.add(displayTextCppHelpers({ number: true, dateTime: false, copy: false }))
  }
  // Ahead of every other producer: a key bool has to exist before the scalar
  // that reads it, and the decode has to be the input half's sample rather
  // than whichever line the dependency walk reached the receiver.
  const ir = irRemoteProjectEmission(irNodes)
  for (const line of ir.setup) setup.add(line)
  for (const include of ir.includes) includes.add(include)
  // One bus start. A DS3231 names the pins the parts actually use; another
  // sensor's begin is the fallback when no RTC claimed the bus.
  const wireBegins = [...setup].filter((line) => line.trimStart().startsWith('Wire.begin('))
  const wireBegin = wireBegins.find((line) => line.includes('I2C pins from the parts on the bus')) ?? wireBegins[0]
  const forwards = [...helpers].some((block) => block.includes('struct _RtcDateTime {')) ? [RTC_CPP_FORWARD] : []
  return {
    irDebug: ir.debug,
    powerMonitorDebug: graph.instructions.some((instruction) => instruction.kind === 'gpio'
      && instruction.emission.serialDebug === true),
    setup: [
      ...(wireBegin ? [wireBegin] : []),
      ...[...setup].filter((line) => !line.trimStart().startsWith('Wire.begin(')),
    ],
    helpers: [...helpers],
    forwards,
    includes: [...includes],
    globals: ir.globals,
    loop: [...ir.sample, ...(needsTime ? [`  float _controlTime = ${timeExpr};`] : []), ...loop],
  }
}
