import { describe, it, expect } from 'vitest'
import {
  TELEMETRY_INTERVAL_MS,
  TELEMETRY_LEAK_BYTES_PER_HOUR,
  TELEMETRY_MARKER,
  accumulateTelemetry,
  formatTelemetryReport,
  parseTelemetryLine,
  startTelemetryRun,
  telemetryHeapSlopeBytesPerHour,
  telemetryLeaking,
  telemetryMeanFps,
  type DeviceTelemetrySample,
} from '../deviceTelemetry'

const LINE = `${TELEMETRY_MARKER} uptime=3600 heap=142112 minheap=138904 psram=4194304 `
  + 'psramtotal=8388608 fps=58.9 loopmax=21 touchms=12 drawbuf=9600'

function sample(overrides: Partial<DeviceTelemetrySample> = {}): DeviceTelemetrySample {
  return {
    uptimeSec: 0,
    heapFree: 200_000,
    heapMin: 190_000,
    fps: 60,
    psramFree: 4_000_000,
    psramTotal: 8_000_000,
    loopMaxMs: 18,
    touchLatencyMs: null,
    drawBufferBytes: 9600,
    ...overrides,
  }
}

describe('parseTelemetryLine', () => {
  it('reads every field of a full line', () => {
    expect(parseTelemetryLine(LINE)).toEqual({
      uptimeSec: 3600,
      heapFree: 142112,
      heapMin: 138904,
      fps: 58.9,
      psramFree: 4194304,
      psramTotal: 8388608,
      loopMaxMs: 21,
      touchLatencyMs: 12,
      drawBufferBytes: 9600,
    })
  })

  it('finds the marker behind a log prefix', () => {
    const prefixed = `[12:04:11] serial: ${LINE}`
    expect(parseTelemetryLine(prefixed)?.uptimeSec).toBe(3600)
  })

  it('is not fooled by other serial traffic', () => {
    expect(parseTelemetryLine('fastled audio bass=0.40 mids=0.20 treble=0.10')).toBeNull()
    expect(parseTelemetryLine('')).toBeNull()
    expect(parseTelemetryLine('FLS_RTC_OK')).toBeNull()
  })

  it('rejects a line missing a required field rather than inventing one', () => {
    expect(parseTelemetryLine(`${TELEMETRY_MARKER} uptime=10 heap=100 fps=60`)).toBeNull()
    expect(parseTelemetryLine(`${TELEMETRY_MARKER} uptime=x heap=100 minheap=90 fps=60`)).toBeNull()
  })

  it('keeps an optional field null rather than zero when it is absent', () => {
    const parsed = parseTelemetryLine(`${TELEMETRY_MARKER} uptime=4 heap=100 minheap=90 fps=30`)
    expect(parsed).not.toBeNull()
    expect(parsed?.psramFree).toBeNull()
    expect(parsed?.touchLatencyMs).toBeNull()
    expect(parsed?.drawBufferBytes).toBeNull()
  })

  it('ignores a key it does not know, so an older app reads a newer device', () => {
    const parsed = parseTelemetryLine(`${TELEMETRY_MARKER} uptime=4 heap=100 minheap=90 fps=30 wifi=1`)
    expect(parsed?.uptimeSec).toBe(4)
  })

  it('reports an interval the firmware can share', () => {
    expect(TELEMETRY_INTERVAL_MS).toBeGreaterThan(0)
  })
})

describe('accumulateTelemetry', () => {
  it('tracks the worst case rather than only the latest', () => {
    let run = startTelemetryRun(sample({ uptimeSec: 0, heapFree: 200_000, fps: 60, loopMaxMs: 18 }))
    run = accumulateTelemetry(run, sample({ uptimeSec: 2, heapFree: 150_000, fps: 41, loopMaxMs: 30 }))
    run = accumulateTelemetry(run, sample({ uptimeSec: 4, heapFree: 180_000, fps: 59, loopMaxMs: 20 }))
    expect(run.samples).toBe(3)
    expect(run.heapFreeMin).toBe(150_000)
    expect(run.fpsMin).toBe(41)
    expect(run.loopMaxMs).toBe(30)
    expect(run.latest.heapFree).toBe(180_000)
    expect(telemetryMeanFps(run)).toBeCloseTo((60 + 41 + 59) / 3, 5)
  })

  it('counts a touch only when one happened, and keeps the worst', () => {
    let run = startTelemetryRun(sample({ touchLatencyMs: null }))
    expect(run.touchSamples).toBe(0)
    expect(run.touchWorstMs).toBeNull()
    run = accumulateTelemetry(run, sample({ uptimeSec: 2, touchLatencyMs: 14 }))
    run = accumulateTelemetry(run, sample({ uptimeSec: 4, touchLatencyMs: null }))
    run = accumulateTelemetry(run, sample({ uptimeSec: 6, touchLatencyMs: 9 }))
    expect(run.touchSamples).toBe(2)
    expect(run.touchWorstMs).toBe(14)
  })

  it('starts a new run when the device reboots mid-soak', () => {
    let run = startTelemetryRun(sample({ uptimeSec: 1000, heapFree: 120_000 }))
    run = accumulateTelemetry(run, sample({ uptimeSec: 1002, heapFree: 119_000 }))
    run = accumulateTelemetry(run, sample({ uptimeSec: 3, heapFree: 200_000 }))
    expect(run.samples).toBe(1)
    expect(run.first.uptimeSec).toBe(3)
    expect(run.heapFreeMin).toBe(200_000)
  })

  it('starts a run from nothing', () => {
    const run = accumulateTelemetry(null, sample({ uptimeSec: 5 }))
    expect(run.samples).toBe(1)
    expect(run.first.uptimeSec).toBe(5)
  })
})

describe('telemetryHeapSlopeBytesPerHour', () => {
  function run(points: readonly [number, number][]) {
    let accumulated = startTelemetryRun(sample({ uptimeSec: points[0][0], heapFree: points[0][1] }))
    for (const [uptimeSec, heapFree] of points.slice(1)) {
      accumulated = accumulateTelemetry(accumulated, sample({ uptimeSec, heapFree }))
    }
    return accumulated
  }

  it('refuses to answer from a window too short to fit', () => {
    expect(telemetryHeapSlopeBytesPerHour(run([[0, 200_000], [2, 100_000]]))).toBeNull()
  })

  it('reads a flat heap as no drift', () => {
    const points: [number, number][] = Array.from({ length: 40 }, (_, i) => [i * 2, 200_000])
    expect(telemetryHeapSlopeBytesPerHour(run(points))).toBeCloseTo(0, 6)
    expect(telemetryLeaking(run(points))).toBe(false)
  })

  it('measures a steady leak in bytes per hour', () => {
    // 100 bytes lost every 2 s is 180,000 bytes an hour.
    const points: [number, number][] = Array.from({ length: 60 }, (_, i) => [i * 2, 200_000 - (i * 100)])
    const slope = telemetryHeapSlopeBytesPerHour(run(points))
    expect(slope).not.toBeNull()
    expect(slope!).toBeCloseTo(-180_000, 0)
    expect(telemetryLeaking(run(points))).toBe(true)
  })

  it('is not dragged into a verdict by one dip', () => {
    const points: [number, number][] = Array.from({ length: 60 }, (_, i) => [i * 2, 200_000])
    points[30] = [60, 150_000]
    expect(telemetryLeaking(run(points))).toBe(false)
  })

  it('holds a leak threshold that a slow drift does not trip', () => {
    // 1 KiB an hour: survives for days, and must not read as a failure.
    const points: [number, number][] = Array.from({ length: 200 }, (_, i) => [i * 2, 200_000 - (i * 0.57)])
    const slope = telemetryHeapSlopeBytesPerHour(run(points))
    expect(slope!).toBeGreaterThan(TELEMETRY_LEAK_BYTES_PER_HOUR)
    expect(telemetryLeaking(run(points))).toBe(false)
  })
})

describe('formatTelemetryReport', () => {
  it('records the numbers the exit condition names', () => {
    let accumulated = startTelemetryRun(sample({ uptimeSec: 0, heapFree: 200_000, touchLatencyMs: 11 }))
    for (let i = 1; i < 40; i += 1) {
      accumulated = accumulateTelemetry(accumulated, sample({ uptimeSec: i * 2, heapFree: 200_000 }))
    }
    const report = formatTelemetryReport(accumulated, {
      port: 'COM7', build: 'normal sketch', recordedUtc: '2026-09-12T10:00:00.000Z',
    })
    expect(report).toContain('COM7')
    expect(report).toContain('normal sketch')
    expect(report).toContain('2026-09-12T10:00:00.000Z')
    expect(report).toContain('stable')
    expect(report).toContain('9,600 B')
    expect(report).toContain('11.0 ms')
  })

  it('says a short run cannot answer instead of printing a slope', () => {
    const report = formatTelemetryReport(startTelemetryRun(sample()))
    expect(report).toContain('not yet answerable')
    expect(report).toContain('run too short to fit')
  })

  it('prints an untouched panel and an absent PSRAM as nothing, never as zero', () => {
    const report = formatTelemetryReport(startTelemetryRun(sample({
      psramFree: null, psramTotal: null, touchLatencyMs: null, drawBufferBytes: null,
    })))
    expect(report).toContain('nothing touched')
    expect(report).not.toMatch(/free:\s+0 B/)
  })

  it('names a leak as a soak failure', () => {
    let accumulated = startTelemetryRun(sample({ uptimeSec: 0, heapFree: 200_000 }))
    for (let i = 1; i < 60; i += 1) {
      accumulated = accumulateTelemetry(accumulated, sample({ uptimeSec: i * 2, heapFree: 200_000 - (i * 200) }))
    }
    expect(formatTelemetryReport(accumulated)).toContain('fails the soak condition')
  })
})
