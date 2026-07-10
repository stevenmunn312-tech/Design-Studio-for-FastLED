import type { GroupRegistry } from '../../state/graphEvaluator'
import type { StudioEdge, StudioNode } from '../../state/graphStore'
import type { ShowFile } from '../../types/showFile'
import { renderShowFrame } from '../../state/showPreview'
import { bakedFrameAt } from '../../state/performanceBakeStore'

interface ShowPlaybackPreview {
  nodeId: string | null
  show: ShowFile | null
  posMs: number
  useGroupInputs: boolean
}

// True when a PerformanceGenerator's `frame` output feeds a MatrixOutput — the
// signal the main preview should show that generator's live show playback.
export function genWiredToOutput(nodes: StudioNode[], edges: StudioEdge[], genId: string): boolean {
  const matrixIds = new Set(
    nodes
      .filter((n) => (n.data as { nodeType?: string }).nodeType === 'MatrixOutput')
      .map((n) => n.id),
  )
  return edges.some(
    (e) =>
      e.source === genId &&
      e.sourceHandle === 'frame' &&
      e.targetHandle === 'frame' &&
      matrixIds.has(e.target),
  )
}

// The evaluator gives PerformanceGenerator.frame a safe black placeholder; when
// a wired generator is actively driving the main preview, publish the rendered
// show frame back into previewStore so the node preview and noodle lighting
// reflect the actual running show.
export function applyShowPlaybackSignal(
  frame: ReturnType<typeof renderShowFrame>,
  outputs: Map<string, Record<string, unknown>>,
  nodes: StudioNode[],
  edges: StudioEdge[],
  playback: ShowPlaybackPreview,
  W: number,
  H: number,
  groups: GroupRegistry,
): ReturnType<typeof renderShowFrame> {
  if (!playback.show || !playback.nodeId || !genWiredToOutput(nodes, edges, playback.nodeId)) return frame

  const showFrame = bakedFrameAt(playback.nodeId, playback.posMs)
    ?? renderShowFrame(playback.show, playback.posMs, W, H, groups, playback.useGroupInputs)
  outputs.set(playback.nodeId, { ...(outputs.get(playback.nodeId) ?? {}), frame: showFrame })
  return showFrame
}
