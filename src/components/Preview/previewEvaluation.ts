import type { StudioEdge, StudioNode } from '../../state/graphStore'
import { evaluateGraphFull, type Frame, type GroupRegistry, type PortValue } from '../../state/graphEvaluator'
import { previewRenderPasses, routeFrame, type OutputRoute } from '../../state/output/outputRouting'

/** Everything one preview frame's evaluation reads, apart from the routes. */
export interface PreviewPassInput {
  nodes: StudioNode[]
  edges: StudioEdge[]
  groups: GroupRegistry
  trusted: boolean
  groupInputs: Record<string, PortValue> | undefined
  tick: number
  elapsedTick: number
  /** The composition size when the graph has no LED output. */
  gridW: number
  gridH: number
  /** Evaluate every node, not only the hot set, for the node previews. */
  fullPass: boolean
  /** The output the Live Stream sends, when one is streaming. */
  streamOutputId: string | undefined
}

export interface PreviewPassResult {
  /** Every evaluated node's ports, from the selected route's pass. */
  outputs: Map<string, Record<string, unknown>>
  /** The selected pass's terminal frame: a group's Group Output when the
   *  graph has no LED output. */
  terminalFrame: Frame | null
  /** Each route this frame needed, in its own physical grid. */
  routedByOutput: Map<string, Frame | null>
  sawBeat: boolean
}

/** Route buffers kept between frames, so routing allocates nothing. */
export interface PreviewRouteBuffers {
  selected: Frame | null
  stream: Frame | null
}

/**
 * One preview frame's evaluation: every render pass, and each output routed
 * into its physical grid. The live loop in `LEDPreview.tsx` runs it on the
 * main thread, and the preview worker runs the same function, so the two
 * cannot disagree.
 */
export function evaluatePreviewPasses(
  input: PreviewPassInput,
  selectedRoute: OutputRoute | undefined,
  buffers: PreviewRouteBuffers,
): PreviewPassResult {
  const { nodes, edges, groups, trusted, groupInputs, tick, elapsedTick, fullPass, streamOutputId } = input
  const passes = previewRenderPasses(nodes, edges, input.gridW, input.gridH)
  const selectedPass = selectedRoute
    ? passes.find((pass) => pass.routes.some((route) => route.id === selectedRoute.id))
    : passes[0]
  // Evaluate the focused route last. Evaluator frames live for two pass
  // generations; this keeps the outputs published to node thumbnails
  // valid while every other shape is routed immediately into owned
  // physical buffers. Identical shapes share this one pass.
  const orderedPasses = selectedPass
    ? [...passes.filter((pass) => pass !== selectedPass), selectedPass]
    : passes
  let outputs = new Map<string, Record<string, unknown>>()
  let terminalFrame: Frame | null = null
  const routedByOutput = new Map<string, Frame | null>()
  let sawBeat = false
  for (const pass of orderedPasses) {
    const result = evaluateGraphFull(
      nodes, edges, tick, pass.width, pass.height,
      groups, pass === selectedPass && fullPass, trusted,
      `__output_pass_${pass.key}/`, null, elapsedTick, groupInputs,
    )
    const passBeat = Array.from(result.outputs.values()).some((output) => output.beat === true)
    sawBeat ||= passBeat
    for (const route of pass.routes) {
      if (route.id !== selectedRoute?.id && route.id !== streamOutputId && !fullPass && !passBeat) continue
      const source = result.outputs.get(route.id)?.frame as Frame | null | undefined
      const reuse = route.id === selectedRoute?.id
        ? buffers.selected
        : route.id === streamOutputId ? buffers.stream : null
      routedByOutput.set(route.id, routeFrame(source ?? null, route, pass.width, pass.height, reuse))
    }
    if (pass === selectedPass || outputs.size === 0) { outputs = result.outputs; terminalFrame = result.frame }
  }
  return { outputs, terminalFrame, routedByOutput, sawBeat }
}

/** The route the preview shows: the one picked in its header, else the first. */
export function selectPreviewRoute(routes: OutputRoute[], activeOutputId: string): OutputRoute | undefined {
  return routes.find((route) => route.id === activeOutputId) ?? routes[0]
}
