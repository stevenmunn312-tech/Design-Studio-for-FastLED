import type { GroupRegistry } from '../../state/graphEvaluator'
import type { ShowFile } from '../../types/showFile'
import { renderShowFrame } from '../../state/showPreview'
import { bakedFrameAt } from '../../state/performanceBakeStore'

interface ShowPlaybackPreview {
  nodeId: string | null
  show: ShowFile | null
  posMs: number
  useGroupInputs: boolean
}

// PerformanceGenerator has no `frame` graph port (a firmware-facing one would
// be misleading — a normal sketch has no audio transport to drive it; see the
// node definition comment in nodeLibrary.ts). Instead, its own body opts a
// playing show into the main LED preview explicitly via `showInMainPreview`
// (PerformanceGeneratorBody → showPlayback.ts's `setPlayback`); this just
// renders whatever that store currently holds over the graph's own terminal
// frame, once per evaluated pass.
export function applyShowPlaybackSignal(
  frame: ReturnType<typeof renderShowFrame>,
  playback: ShowPlaybackPreview,
  W: number,
  H: number,
  groups: GroupRegistry,
  trusted = true,
): ReturnType<typeof renderShowFrame> {
  if (!playback.show || !playback.nodeId) return frame

  const baked = trusted || !playback.show.patternSet?.length
    ? bakedFrameAt(playback.nodeId, playback.posMs)
    : null
  return baked
    ?? renderShowFrame(playback.show, playback.posMs, W, H, groups, playback.useGroupInputs, trusted)
}
