// What a running device reports about itself, and how to read it back.
//
// HW-11 asks for numeric acceptance budgets set from evidence rather than from
// taste: free heap, PSRAM use, frame rate, touch response and the draw buffer,
// measured on a real rig and held over a one-hour soak. Firmware prints one
// line per interval and the app accumulates it, so the line format is defined
// exactly once here and read from both sides — `deviceTelemetryCpp.ts` emits
// against these constants and `deviceTelemetryStore.ts` parses with this
// function. A format that drifted would fail as silently as a stale index.
//
// The keys are deliberately short (this rides a 115200-baud line beside real
// logs) and deliberately not positional: a device built before a key existed
// still parses, and an unknown key is ignored rather than rejected, because the
// alternative is a sketch nobody can read telemetry from until they reflash.

/** The marker that opens a telemetry line, findable anywhere in it. */
export const TELEMETRY_MARKER = 'FLS_STAT'

/**
 * How often the device reports, in milliseconds.
 *
 * Two seconds is chosen against the soak rather than against the screen: an
 * hour is 1,800 samples, enough for a heap slope to mean something, and slow
 * enough that the printing itself is not what is being measured.
 */
export const TELEMETRY_INTERVAL_MS = 2000

/** One report from the device. Fields absent from the line are null. */
export interface DeviceTelemetrySample {
  /** Seconds since boot, from the device's own clock. */
  uptimeSec: number
  /** Free internal heap, bytes. */
  heapFree: number
  /** Lowest free internal heap since boot, bytes — the device tracks this. */
  heapMin: number
  /** Frames rendered per second over the last interval. */
  fps: number
  /** Free PSRAM, bytes. Null on a board without any. */
  psramFree: number | null
  /** Total PSRAM, bytes. Null on a board without any. */
  psramTotal: number | null
  /** Longest single loop pass in the last interval, milliseconds. */
  loopMaxMs: number | null
  /**
   * Touch press to end of the frame that answered it, milliseconds.
   *
   * Null when nothing was touched in the interval, which is not the same as
   * zero and must not be averaged as if it were.
   */
  touchLatencyMs: number | null
  /** Bytes of display draw buffer the build allocated. A build constant. */
  drawBufferBytes: number | null
}

const REQUIRED = ['uptime', 'heap', 'minheap', 'fps'] as const

function numeric(value: string | undefined): number | null {
  if (value === undefined) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * Read one telemetry line, or null if this is not one.
 *
 * Tolerant by design: the serial stream carries the sketch's own logs, a boot
 * banner and sometimes half a line, so anything unparsable is simply not a
 * sample. The marker may sit behind a timestamp or log prefix.
 */
export function parseTelemetryLine(line: string): DeviceTelemetrySample | null {
  const at = line.indexOf(TELEMETRY_MARKER)
  if (at < 0) return null
  const fields = new Map<string, string>()
  for (const token of line.slice(at + TELEMETRY_MARKER.length).trim().split(/\s+/)) {
    const split = token.indexOf('=')
    if (split <= 0) continue
    fields.set(token.slice(0, split).toLowerCase(), token.slice(split + 1))
  }
  for (const key of REQUIRED) {
    if (numeric(fields.get(key)) === null) return null
  }
  return {
    uptimeSec: numeric(fields.get('uptime'))!,
    heapFree: numeric(fields.get('heap'))!,
    heapMin: numeric(fields.get('minheap'))!,
    fps: numeric(fields.get('fps'))!,
    psramFree: numeric(fields.get('psram')),
    psramTotal: numeric(fields.get('psramtotal')),
    loopMaxMs: numeric(fields.get('loopmax')),
    touchLatencyMs: numeric(fields.get('touchms')),
    drawBufferBytes: numeric(fields.get('drawbuf')),
  }
}

/**
 * What a soak run has shown so far.
 *
 * Accumulated rather than stored per sample: an hour of samples is a list
 * nobody reads, while the worst case and the heap trend are the two things the
 * exit condition actually names. Regression sums are kept so the slope is a fit
 * over every sample rather than a line through the first and last, which one
 * unlucky garbage-collection dip would otherwise dominate.
 */
export interface TelemetryRun {
  first: DeviceTelemetrySample
  latest: DeviceTelemetrySample
  samples: number
  /** Lowest free heap this run has seen reported, bytes. */
  heapFreeMin: number
  /** The device's own lowest-ever figure, which survives across our run. */
  heapMinReported: number
  fpsMin: number
  fpsSum: number
  loopMaxMs: number | null
  /** Worst touch response seen, or null if nothing was touched. */
  touchWorstMs: number | null
  touchSamples: number
  /** Σ of uptime, heap and their products, for the heap slope. */
  sums: { t: number; h: number; tt: number; th: number }
}

export function startTelemetryRun(sample: DeviceTelemetrySample): TelemetryRun {
  return {
    first: sample,
    latest: sample,
    samples: 1,
    heapFreeMin: sample.heapFree,
    heapMinReported: sample.heapMin,
    fpsMin: sample.fps,
    fpsSum: sample.fps,
    loopMaxMs: sample.loopMaxMs,
    touchWorstMs: sample.touchLatencyMs,
    touchSamples: sample.touchLatencyMs === null ? 0 : 1,
    sums: {
      t: sample.uptimeSec,
      h: sample.heapFree,
      tt: sample.uptimeSec * sample.uptimeSec,
      th: sample.uptimeSec * sample.heapFree,
    },
  }
}

export function accumulateTelemetry(run: TelemetryRun | null, sample: DeviceTelemetrySample): TelemetryRun {
  // A device that rebooted mid-soak is a new run, not a continuation: its
  // uptime went backwards, its heap figures restarted, and folding the two
  // together would report a heap recovery that never happened. The soak
  // condition is an hour without a reset, so saying so is the point.
  if (!run || sample.uptimeSec < run.latest.uptimeSec) return startTelemetryRun(sample)
  return {
    ...run,
    latest: sample,
    samples: run.samples + 1,
    heapFreeMin: Math.min(run.heapFreeMin, sample.heapFree),
    heapMinReported: Math.min(run.heapMinReported, sample.heapMin),
    fpsMin: Math.min(run.fpsMin, sample.fps),
    fpsSum: run.fpsSum + sample.fps,
    loopMaxMs: sample.loopMaxMs === null ? run.loopMaxMs
      : Math.max(run.loopMaxMs ?? sample.loopMaxMs, sample.loopMaxMs),
    touchWorstMs: sample.touchLatencyMs === null ? run.touchWorstMs
      : Math.max(run.touchWorstMs ?? sample.touchLatencyMs, sample.touchLatencyMs),
    touchSamples: run.touchSamples + (sample.touchLatencyMs === null ? 0 : 1),
    sums: {
      t: run.sums.t + sample.uptimeSec,
      h: run.sums.h + sample.heapFree,
      tt: run.sums.tt + (sample.uptimeSec * sample.uptimeSec),
      th: run.sums.th + (sample.uptimeSec * sample.heapFree),
    },
  }
}

/** Mean frames per second over the run. */
export function telemetryMeanFps(run: TelemetryRun): number {
  return run.fpsSum / run.samples
}

/**
 * Heap drift in bytes per hour, negative when the heap is being consumed.
 *
 * Null until there is enough spread in time to fit a line — two samples two
 * seconds apart would report a slope of thousands of bytes an hour from noise
 * alone, and a confident wrong number is worse than none. Thirty seconds is
 * the shortest window this will answer for.
 */
export const TELEMETRY_SLOPE_MIN_SECONDS = 30

export function telemetryHeapSlopeBytesPerHour(run: TelemetryRun): number | null {
  const span = run.latest.uptimeSec - run.first.uptimeSec
  if (span < TELEMETRY_SLOPE_MIN_SECONDS || run.samples < 3) return null
  const denominator = (run.samples * run.sums.tt) - (run.sums.t * run.sums.t)
  if (denominator === 0) return null
  const perSecond = ((run.samples * run.sums.th) - (run.sums.t * run.sums.h)) / denominator
  return perSecond * 3600
}

/**
 * Whether this run looks like it is leaking.
 *
 * A threshold, not a judgement: the exit condition says "no unbounded heap
 * growth", and a device losing a kilobyte an hour would run for days while one
 * losing a megabyte an hour will not survive the soak. The number is
 * deliberately generous, because the honest verdict comes from an hour of
 * evidence rather than from this function being clever about ten minutes of it.
 */
export const TELEMETRY_LEAK_BYTES_PER_HOUR = -64 * 1024

export function telemetryLeaking(run: TelemetryRun): boolean {
  const slope = telemetryHeapSlopeBytesPerHour(run)
  return slope !== null && slope < TELEMETRY_LEAK_BYTES_PER_HOUR
}

function bytes(value: number | null): string {
  if (value === null) return '—'
  return `${Math.round(value).toLocaleString('en-US')} B`
}

function seconds(total: number): string {
  const whole = Math.max(0, Math.round(total))
  const h = Math.floor(whole / 3600)
  const m = Math.floor((whole % 3600) / 60)
  const s = whole % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export interface TelemetryReportMeta {
  /** Which sketch was running — the generator, named by the caller. */
  build?: string
  port?: string
  recordedUtc?: string
}

/**
 * The soak record, as text.
 *
 * Formatted here rather than in the component so the file and the card cannot
 * disagree about what was measured, and so a future bench doc can quote it
 * without a browser. Null fields print as an em dash rather than as zero: a
 * panel nobody touched has no latency, and a board with no PSRAM has no free
 * PSRAM, and neither is the number nought.
 */
export function formatTelemetryReport(run: TelemetryRun, meta: TelemetryReportMeta = {}): string {
  const slope = telemetryHeapSlopeBytesPerHour(run)
  const lines = [
    'Device telemetry report',
    '',
    `Recorded: ${meta.recordedUtc ?? new Date().toISOString()}`,
    `Port: ${meta.port ?? '—'}`,
    `Build: ${meta.build ?? '—'}`,
    '',
    `Run length: ${seconds(run.latest.uptimeSec - run.first.uptimeSec)} `
      + `(device uptime ${seconds(run.latest.uptimeSec)}, ${run.samples} samples)`,
    '',
    'Internal heap',
    `  free now:            ${bytes(run.latest.heapFree)}`,
    `  lowest seen by us:   ${bytes(run.heapFreeMin)}`,
    `  device minimum:      ${bytes(run.heapMinReported)}`,
    `  drift:               ${slope === null ? '— (run too short to fit)' : `${bytes(slope)}/hour`}`,
    `  verdict:             ${slope === null ? 'not yet answerable'
      : telemetryLeaking(run) ? 'LEAKING — fails the soak condition' : 'stable'}`,
    '',
    'PSRAM',
    `  free:                ${bytes(run.latest.psramFree)}`,
    `  total:               ${bytes(run.latest.psramTotal)}`,
    '',
    'Rendering',
    `  frames/sec now:      ${run.latest.fps.toFixed(1)}`,
    `  mean:                ${telemetryMeanFps(run).toFixed(1)}`,
    `  worst:               ${run.fpsMin.toFixed(1)}`,
    `  longest loop pass:   ${run.loopMaxMs === null ? '—' : `${run.loopMaxMs.toFixed(1)} ms`}`,
    '',
    'Touch',
    `  worst press to paint: ${run.touchWorstMs === null ? '— (nothing touched)' : `${run.touchWorstMs.toFixed(1)} ms`}`,
    `  presses measured:     ${run.touchSamples}`,
    '',
    'Build',
    `  draw buffer:         ${bytes(run.latest.drawBufferBytes)}`,
  ]
  return `${lines.join('\n')}\n`
}
