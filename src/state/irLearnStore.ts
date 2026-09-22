// One guided "learn this button" run.
//
// Modelled on touch calibration: a receiver-only sketch is uploaded with
// `cache: false`, the existing serial connection delivers lines, and closing
// the run gives the port back. The parser and the saved mapping live in
// irRemote.ts. This store only owns the run.

import { create } from 'zustand'
import { generateIrLearnSketch } from '../codegen/irLearnSketch'
import { rootGraphNodes, useGraphStore } from './graphStore'
import {
  parseIrLearnLine,
  type IrRemoteIdentity,
} from './irRemote'
import { useUploadStore } from './uploadStore'

export interface IrLearnSession {
  nodeId: string
  label: string
  phase: 'prepare' | 'listening' | 'captured'
  preparing: boolean
  sketchUploaded: boolean
  captured: IrRemoteIdentity | null
  error: string | null
}

interface IrLearnState {
  session: IrLearnSession | null
  start: (nodeId: string, label: string) => void
  prepare: () => Promise<void>
  ingestLine: (line: string) => void
  confirm: () => void
  cancel: () => void
}

function learnSketchFor(nodeId: string): string | null {
  const node = rootGraphNodes(useGraphStore.getState())
    .find((entry) => entry.id === nodeId && entry.data.nodeType === 'IRRemoteInput')
  if (!node) return null
  const pin = Number((node.data.properties as { pin?: unknown }).pin)
  if (!Number.isInteger(pin) || pin < 0 || pin > 255) return null
  return generateIrLearnSketch({ pin })
}

function releasePort(session: IrLearnSession | null) {
  if (session?.sketchUploaded) useUploadStore.getState().stopSerial()
}

export const useIrLearnStore = create<IrLearnState>((set, get) => ({
  session: null,

  start: (nodeId, label) => set({
    session: {
      nodeId,
      label: label.trim(),
      phase: 'prepare',
      preparing: false,
      sketchUploaded: false,
      captured: null,
      error: null,
    },
  }),

  prepare: async () => {
    const session = get().session
    if (!session || session.preparing || session.phase !== 'prepare') return
    if (!useGraphStore.getState().trusted) {
      set({ session: { ...session, error: 'Trust this workspace before learning from the board.' } })
      return
    }
    const sketch = learnSketchFor(session.nodeId)
    if (!sketch) {
      set({ session: { ...session, error: 'This receiver has no GPIO to learn on.' } })
      return
    }
    set({ session: { ...session, preparing: true, error: null } })
    const upload = useUploadStore.getState()
    await upload.runUpload(sketch, undefined, { cache: false })
    const current = get().session
    // Closed while the flash was in flight. Upload releases its own port;
    // serial was not opened, so leave a monitor the user already had alone.
    if (!current || current.nodeId !== session.nodeId) return
    if (useUploadStore.getState().status.phase === 'error') {
      set({ session: { ...current, preparing: false, error: 'The learning sketch did not upload. The Output console has the build log.' } })
      return
    }
    void useUploadStore.getState().startSerial()
    const connected = useUploadStore.getState().serialConnected
    set({
      session: {
        ...current,
        preparing: false,
        sketchUploaded: true,
        phase: 'listening',
        error: connected ? null : 'Uploaded, but the serial port did not open. Reconnect it and press the key again.',
      },
    })
  },

  ingestLine: (line) => {
    const session = get().session
    if (!session || session.phase !== 'listening' || session.captured) return
    if (!useGraphStore.getState().trusted) return
    const frame = parseIrLearnLine(line)
    if (!frame || frame.repeat) return
    set({
      session: {
        ...session,
        phase: 'captured',
        captured: { protocol: frame.protocol, address: frame.address, command: frame.command },
        error: null,
      },
    })
  },

  confirm: () => {
    const session = get().session
    if (!session?.captured) return
    const error = useGraphStore.getState().learnIrRemoteButton(session.nodeId, {
      label: session.label,
      ...session.captured,
    })
    if (error) {
      set({ session: { ...session, error } })
      return
    }
    releasePort(session)
    set({ session: null })
  },

  cancel: () => {
    releasePort(get().session)
    set({ session: null })
  },
}))
