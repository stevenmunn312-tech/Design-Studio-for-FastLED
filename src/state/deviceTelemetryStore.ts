// Reading a running device's telemetry, for the card in the Upload tab.
//
// Thin on purpose, and deliberately *not* a serial client: the helper holds a
// port exclusively, so opening a second connection beside the Output console's
// Serial tab would mean the two fighting over the board — whichever asked first
// wins and the other reports a port it cannot have. So `uploadStore.startSerial`
// feeds every chunk it receives through `ingest` here, one connection with two
// readers, and this store owns only the accumulation.
//
// Every judgement about what a number means lives in `deviceTelemetry.ts`. Lines
// arrive in arbitrary chunks, so a partial line is held rather than parsed: a
// report cut across two reads would otherwise be two unparsable halves, which
// looks exactly like a device that stopped reporting.

import { create } from 'zustand'
import {
  accumulateTelemetry,
  formatTelemetryReport,
  parseTelemetryLine,
  type TelemetryRun,
  type TelemetryReportMeta,
} from './deviceTelemetry'

interface DeviceTelemetryState {
  run: TelemetryRun | null
  /** Lines seen that were not telemetry, counted rather than kept. */
  otherLines: number
  /** Bumped per accepted sample, so a component can subscribe cheaply. */
  version: number
  ingest: (chunk: string) => void
  reset: () => void
  report: (meta?: TelemetryReportMeta) => string | null
}

let pending = ''

/** Longest partial line held before it is treated as noise, not a line. */
const MAX_PENDING = 4096

export const useDeviceTelemetryStore = create<DeviceTelemetryState>((set, get) => ({
  run: null,
  otherLines: 0,
  version: 0,

  /**
   * Feed raw serial text in, whole lines out.
   *
   * Called from the one serial reader rather than reading a port itself, and
   * exposed so a test can drive the parser with no device at all.
   */
  ingest: (chunk: string) => {
    pending += chunk
    const lines = pending.split(/\r?\n/)
    pending = lines.pop() ?? ''
    // A device that never sends a newline would otherwise grow this forever.
    if (pending.length > MAX_PENDING) pending = pending.slice(-1024)
    let run = get().run
    let accepted = 0
    let other = 0
    for (const line of lines) {
      if (!line.trim()) continue
      const sample = parseTelemetryLine(line)
      if (!sample) { other += 1; continue }
      run = accumulateTelemetry(run, sample)
      accepted += 1
    }
    if (accepted === 0 && other === 0) return
    set((state) => ({
      run,
      otherLines: state.otherLines + other,
      version: state.version + accepted,
    }))
  },

  /**
   * Start a fresh run.
   *
   * Called when the serial connection opens as well as from the card's own
   * button: a reconnect is a new measurement, and carrying the previous board's
   * worst case into it would make a soak report something that never ran.
   */
  reset: () => {
    pending = ''
    set({ run: null, otherLines: 0, version: 0 })
  },

  report: (meta: TelemetryReportMeta = {}) => {
    const { run } = get()
    if (!run) return null
    return formatTelemetryReport(run, meta)
  },
}))
