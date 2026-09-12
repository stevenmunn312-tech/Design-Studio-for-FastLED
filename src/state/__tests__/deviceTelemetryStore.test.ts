import { describe, it, expect, beforeEach, vi } from 'vitest'
import { TELEMETRY_MARKER } from '../deviceTelemetry'
import { useDeviceTelemetryStore } from '../deviceTelemetryStore'

vi.mock('../../utils/backendClient', () => ({
  monitorSerial: vi.fn(async () => {}),
}))

function line(overrides: Record<string, number | string> = {}): string {
  const fields = { uptime: 10, heap: 200000, minheap: 190000, fps: 59.4, ...overrides }
  return `${TELEMETRY_MARKER} ${Object.entries(fields).map(([k, v]) => `${k}=${v}`).join(' ')}`
}

describe('device telemetry store', () => {
  beforeEach(() => {
    useDeviceTelemetryStore.getState().reset()
  })

  it('accumulates whole lines into a run', () => {
    const { ingest } = useDeviceTelemetryStore.getState()
    ingest(`${line({ uptime: 10, heap: 200000 })}\n`)
    ingest(`${line({ uptime: 12, heap: 199000 })}\n`)
    const { run, version } = useDeviceTelemetryStore.getState()
    expect(run?.samples).toBe(2)
    expect(run?.heapFreeMin).toBe(199000)
    expect(version).toBe(2)
  })

  it('holds a line split across two reads instead of losing it', () => {
    const { ingest } = useDeviceTelemetryStore.getState()
    const whole = line({ uptime: 20 })
    ingest(whole.slice(0, 18))
    expect(useDeviceTelemetryStore.getState().run).toBeNull()
    ingest(`${whole.slice(18)}\n`)
    expect(useDeviceTelemetryStore.getState().run?.latest.uptimeSec).toBe(20)
  })

  it('counts the sketch own logs without treating them as samples', () => {
    const { ingest } = useDeviceTelemetryStore.getState()
    ingest('[audio] playing track.mp3\nRTC clock set successfully\n')
    const state = useDeviceTelemetryStore.getState()
    expect(state.run).toBeNull()
    expect(state.otherLines).toBe(2)
    expect(state.version).toBe(0)
  })

  it('does not let an endless unterminated line grow without bound', () => {
    const { ingest } = useDeviceTelemetryStore.getState()
    for (let i = 0; i < 20; i += 1) ingest('x'.repeat(500))
    // Still accepts a real line afterwards, which is the point of the cap.
    ingest(`\n${line({ uptime: 30 })}\n`)
    expect(useDeviceTelemetryStore.getState().run?.latest.uptimeSec).toBe(30)
  })

  it('drops a previous run on reset, since a reconnect is a new measurement', () => {
    useDeviceTelemetryStore.getState().ingest(`${line({ uptime: 99 })}\n`)
    expect(useDeviceTelemetryStore.getState().run).not.toBeNull()
    useDeviceTelemetryStore.getState().reset()
    const state = useDeviceTelemetryStore.getState()
    expect(state.run).toBeNull()
    expect(state.version).toBe(0)
    expect(state.otherLines).toBe(0)
  })

  it('holds no partial line across a reset', () => {
    const { ingest, reset } = useDeviceTelemetryStore.getState()
    ingest(line({ uptime: 40 }).slice(0, 20))
    reset()
    // The rest of the abandoned line must not fuse onto the next real one.
    ingest(`${line({ uptime: 41 })}\n`)
    expect(useDeviceTelemetryStore.getState().run?.latest.uptimeSec).toBe(41)
  })

  it('reports nothing until there is something to report', () => {
    expect(useDeviceTelemetryStore.getState().report()).toBeNull()
    useDeviceTelemetryStore.getState().ingest(`${line()}\n`)
    const report = useDeviceTelemetryStore.getState().report({ build: 'normal sketch' })
    expect(report).toContain('Device telemetry report')
    expect(report).toContain('normal sketch')
  })
})
