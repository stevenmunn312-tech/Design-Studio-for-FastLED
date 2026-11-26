// One diagnostic run: upload a part's probe sketch in place of the project,
// read its `FLS_DBG` lines live, and offer the project back afterwards.
//
// Modelled on IR learn (peripherals/irLearnStore.ts): the probe is uploaded
// with `cache: false`, so it never becomes the project's "last upload", and
// the one serial reader delivers lines through deviceTelemetryStore. There is
// one serial port, so one run at a time.

import { create } from 'zustand'
import { rootGraphEdges, rootGraphNodes, useGraphStore } from '../graphStore'
import { useUploadStore } from '../upload/uploadStore'
import { useUiStore } from '../uiStore'
import { useProjectStore } from '../projectStore'
import { boardIdOf, boardNodesIn, primaryBoardId } from '../../build/boardPartition'
import { debugProfileFor, debugTargetOf } from './debugProfiles'
import { debugContextFor } from './debugProfile'
import { parseDebugLine, type DebugFields } from './debugProtocol'

/** The baud every probe sketch prints at. */
export const PROBE_BAUD = 115200

export interface DebugRun {
  debugNodeId: string
  probeKind: string
  phase: 'uploading' | 'running' | 'stopped' | 'failed'
  fields: DebugFields | null
  lines: number
  error: string | null
}

interface DebugRunState {
  run: DebugRun | null
  /** Upload the probe for the part a Debug node tests. Resolves when the run
   *  is listening or has failed; the reason is on `run.error`. */
  start: (debugNodeId: string) => Promise<void>
  ingestLine: (line: string) => void
  /** Stop listening and give the port back. The probe stays on the board. */
  stop: () => void
  /** Upload the project's last sketch again, replacing the probe. */
  restoreProject: () => Promise<void>
  dismiss: () => void
}

/**
 * Why the probe cannot run for this part right now, or null when it can.
 * Pure over the inputs, so the node can say it before the user presses Run.
 */
export function debugRunBlocker(debugNodeId: string): string | null {
  const graph = useGraphStore.getState()
  if (!graph.trusted) return 'Trust this workspace before uploading a diagnostic to the board.'
  const root = rootGraphNodes(graph)
  const target = debugTargetOf(debugNodeId, root, rootGraphEdges(graph))
  const probe = target ? debugProfileFor(target)?.probe : undefined
  if (!target || !probe) return 'This part has no diagnostic sketch yet: use the meter checks.'
  if (!probe.sketch(debugContextFor(target, root))) return 'This part has no pin assigned to test.'
  const boards = boardNodesIn(root)
  if (boards.length > 1) {
    const partBoard = boardIdOf(target, primaryBoardId(root))
    const activeBoard = useUiStore.getState().activeBoardId
    if (partBoard !== activeBoard) {
      const label = boards.find((board) => board.id === partBoard)?.data.label ?? 'its board'
      return `This part is on ${label}. Switch the bench to that board first, so the diagnostic goes to its port.`
    }
  }
  if (!useUploadStore.getState().selectedPort) return 'Choose the board’s port in Upload first.'
  return null
}

export const useDebugRunStore = create<DebugRunState>((set, get) => ({
  run: null,

  start: async (debugNodeId) => {
    if (get().run && ['uploading', 'running'].includes(get().run!.phase)) return
    const blocker = debugRunBlocker(debugNodeId)
    const graph = useGraphStore.getState()
    const root = rootGraphNodes(graph)
    const target = debugTargetOf(debugNodeId, root, rootGraphEdges(graph))
    const probe = target ? debugProfileFor(target)?.probe : undefined
    const sketch = target && probe ? probe.sketch(debugContextFor(target, root)) : null
    if (blocker || !probe || !sketch) {
      set({ run: { debugNodeId, probeKind: probe?.kind ?? '', phase: 'failed', fields: null, lines: 0, error: blocker ?? 'Nothing to run.' } })
      return
    }
    set({ run: { debugNodeId, probeKind: probe.kind, phase: 'uploading', fields: null, lines: 0, error: null } })
    const upload = useUploadStore.getState()
    await upload.runUpload(sketch, undefined, { cache: false })
    const current = get().run
    // Stopped or replaced while the flash was in flight.
    if (!current || current.debugNodeId !== debugNodeId || current.phase !== 'uploading') return
    if (['error', 'cancelled'].includes(useUploadStore.getState().status.phase)) {
      set({ run: { ...current, phase: 'failed', error: 'The diagnostic did not upload. The Output console has the build log.' } })
      return
    }
    // Probes print at a fixed baud; the monitor must listen at the same one.
    if (useUploadStore.getState().serialBaud !== PROBE_BAUD) useUploadStore.getState().setSerialBaud(PROBE_BAUD)
    void useUploadStore.getState().startSerial()
    const connected = useUploadStore.getState().serialConnected
    set({
      run: {
        ...current,
        phase: 'running',
        error: connected ? null : 'Uploaded, but the serial port did not open. Reconnect the board and press Run again.',
      },
    })
  },

  ingestLine: (line) => {
    const run = get().run
    if (!run || run.phase !== 'running') return
    const parsed = parseDebugLine(line)
    if (!parsed || parsed.probe !== run.probeKind) return
    // The ready line carries no readings; keep the last measured fields.
    if (parsed.fields.state === 'ready' && Object.keys(parsed.fields).length === 1) {
      set({ run: { ...run, lines: run.lines + 1 } })
      return
    }
    set({ run: { ...run, fields: parsed.fields, lines: run.lines + 1 } })
  },

  stop: () => {
    const run = get().run
    if (!run) return
    useUploadStore.getState().stopSerial()
    set({ run: { ...run, phase: 'stopped' } })
  },

  restoreProject: async () => {
    get().stop()
    set({ run: null })
    await useUploadStore.getState().runLastUpload()
  },

  dismiss: () => {
    const run = get().run
    if (run?.phase === 'running') useUploadStore.getState().stopSerial()
    set({ run: null })
  },
}))

/** Whether this project has a sketch to put back after a diagnostic. */
export function hasProjectToRestore(): boolean {
  const projectId = useProjectStore.getState().currentProjectId
  return Boolean(projectId && useUploadStore.getState().lastSketchByProject[projectId])
}
