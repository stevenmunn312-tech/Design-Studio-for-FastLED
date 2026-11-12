// Which Stream Receiver each serial port is running, as far as this machine
// knows. Live Stream sends raw frames for one exact receiver: a board running
// a pattern sketch, or a receiver built for another size, pins or wiring,
// shows nothing or garbage. So Live Stream waits until the receiver this
// output needs is the last thing flashed through that port.
//
// Recorded by `uploadStore` after each upload that finishes: a receiver flash
// stores its signature, any other sketch or show clears the port. Kept in
// localStorage because the board keeps its firmware across sessions.

import { create } from 'zustand'
import { fnv1a32 } from '../../build/boardLinks'

const KEY = 'design-studio-for-fastled-stream-receivers'

type ReceiverByPort = Record<string, string>

/** A receiver sketch's identity: equal sketches stream the same frames. */
export function streamReceiverSignature(sketch: string): string {
  return fnv1a32(sketch).toString(16)
}

function load(): ReceiverByPort {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? '{}') as unknown
    if (!stored || typeof stored !== 'object') return {}
    return Object.fromEntries(Object.entries(stored).filter(([, value]) => typeof value === 'string')) as ReceiverByPort
  } catch {
    return {}
  }
}

function save(receivers: ReceiverByPort) {
  try { localStorage.setItem(KEY, JSON.stringify(receivers)) } catch { /* private window or quota */ }
}

interface StreamReceiverRecord {
  receivers: ReceiverByPort
  /** An upload through `port` finished: a receiver with this signature, or
   *  (null) anything else, which replaced whatever receiver was there. */
  recordFlash: (port: string, receiverSignature: string | null) => void
}

export const useStreamReceiverRecord = create<StreamReceiverRecord>((set, get) => ({
  receivers: load(),
  recordFlash: (port, receiverSignature) => {
    if (!port) return
    const receivers = { ...get().receivers }
    if (receiverSignature) receivers[port] = receiverSignature
    else delete receivers[port]
    save(receivers)
    set({ receivers })
  },
}))
