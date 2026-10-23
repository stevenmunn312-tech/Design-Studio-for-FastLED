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

/** Keys reserved for raw touch calibration samples on the telemetry line. */
export const TELEMETRY_TOUCH_X_KEY = 'touchx'
export const TELEMETRY_TOUCH_Y_KEY = 'touchy'

/**
 * Keys splitting a frame's cost between the pixels and the wire: the
 * interval's worst pass with the FastLED send taken out, and its worst send.
 * Both are left out when the sketch sends nothing through FastLED (a HUB75 or
 * screen-only build), since there is no send to separate.
 */
export const TELEMETRY_RENDER_KEY = 'renderms'
export const TELEMETRY_SEND_KEY = 'sendms'

/**
 * The interval's costliest nodes, as `top=index:ms,index:ms,index:ms`: each
 * timed node's mean milliseconds per frame, LED sends taken out, costliest
 * first. Only a normal sketch times its nodes, and the key is left out when
 * none ran. The index counts the sketch's timed nodes in loop order; the
 * sketch names them in one comment line (`telemetryNodeMapLine`), which the
 * app reads back from the uploaded text with `telemetryNodeLabels`.
 */
export const TELEMETRY_TOP_KEY = 'top'
/** How many nodes the device names per interval. */
export const TELEMETRY_TOP_COUNT = 3
/** Between one node's entries, and between its index and its milliseconds. */
export const TELEMETRY_TOP_ENTRY_SEPARATOR = ','
export const TELEMETRY_TOP_FIELD_SEPARATOR = ':'

/**
 * Board link keys (docs/design/board-links.md), sent only by a board that
 * receives over one: valid frames applied since boot, frames dropped by
 * reason since boot (wrong link id, wrong schema hash, bad tag or framing, a
 * counter not above the last one, a full receive ring), and milliseconds since
 * the last valid frame, left out until the first one arrives.
 */
export const TELEMETRY_LINK_RX_KEY = 'lnkrx'
export const TELEMETRY_LINK_DROP_KEYS = {
  id: 'lnkid', hash: 'lnkhash', tag: 'lnktag', stale: 'lnkold', ring: 'lnkring',
} as const
export const TELEMETRY_LINK_AGE_KEY = 'lnkms'

/** A board link's receive counts, as the device last reported them. */
export interface TelemetryLinkReport {
  framesReceived: number
  dropped: Record<keyof typeof TELEMETRY_LINK_DROP_KEYS, number>
  /** Null before the first valid frame. */
  msSinceFrame: number | null
}

/** Opens the sketch comment that maps a timed node's index to its label. */
export const TELEMETRY_NODE_MAP_PREFIX = `// ${TELEMETRY_MARKER} nodes `

/** One timed node's share of a frame. */
export interface TelemetryNodeCost {
  /** The node's place in the sketch's timed-node list. */
  index: number
  /** Mean milliseconds per frame over the interval. */
  ms: number
}

/**
 * The comment line naming each timed node, in index order.
 *
 * JSON with everything past ASCII escaped, so a label cannot end the comment,
 * splice a line or carry an encoding the compiler might reject.
 */
export function telemetryNodeMapLine(labels: readonly string[]): string {
  const json = JSON.stringify(labels).replace(/[\u007f-￿]/g,
    (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`)
  return `${TELEMETRY_NODE_MAP_PREFIX}${json}`
}

/** The timed nodes' labels a sketch names, in index order; empty when it times none. */
export function telemetryNodeLabels(source: string): string[] {
  for (const line of source.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed.startsWith(TELEMETRY_NODE_MAP_PREFIX)) continue
    try {
      const labels: unknown = JSON.parse(trimmed.slice(TELEMETRY_NODE_MAP_PREFIX.length))
      if (Array.isArray(labels) && labels.every((label) => typeof label === 'string')) return labels as string[]
    } catch { /* not a map */ }
    return []
  }
  return []
}

/**
 * Labels for the timed nodes, one each and told apart: a second node with
 * the same label gets ` (2)`, so the card never names two nodes alike.
 */
export function distinctTelemetryLabels(labels: readonly string[]): string[] {
  const seen = new Map<string, number>()
  return labels.map((label) => {
    const n = (seen.get(label) ?? 0) + 1
    seen.set(label, n)
    return n === 1 ? label : `${label} (${n})`
  })
}

/** What a timed node is called on the card, or its index when the map is stale. */
export function telemetryNodeName(labels: readonly string[], index: number): string {
  return labels[index] ?? `node #${index}`
}

/** Read a `top=` value; null when absent or malformed. */
export function parseTelemetryTop(value: string | undefined): TelemetryNodeCost[] | null {
  if (!value) return null
  const costs: TelemetryNodeCost[] = []
  for (const entry of value.split(TELEMETRY_TOP_ENTRY_SEPARATOR)) {
    const [index, ms, extra] = entry.split(TELEMETRY_TOP_FIELD_SEPARATOR)
    const at = numeric(index)
    const cost = numeric(ms)
    if (extra !== undefined || at === null || cost === null || !Number.isInteger(at) || at < 0 || cost < 0) return null
    costs.push({ index: at, ms: cost })
  }
  return costs.length ? costs : null
}

/**
 * The run's worst share per node, costliest first and as many as the device
 * names: a node that was costly once stays listed after it settles.
 */
function worstNodes(seen: readonly TelemetryNodeCost[], sample: readonly TelemetryNodeCost[] | null): TelemetryNodeCost[] {
  if (!sample) return [...seen]
  const worstAt = new Map(seen.map((cost) => [cost.index, cost.ms]))
  for (const cost of sample) worstAt.set(cost.index, Math.max(worstAt.get(cost.index) ?? 0, cost.ms))
  return [...worstAt].map(([index, ms]) => ({ index, ms }))
    .sort((a, b) => b.ms - a.ms || a.index - b.index)
    .slice(0, TELEMETRY_TOP_COUNT)
}

/** Raw touch cadence while the panel is held, fast enough for a short five-sample capture. */
export const TELEMETRY_TOUCH_INTERVAL_MS = 50

export interface DeviceTouchSample {
  rawX: number
  rawY: number
}

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
  /** Longest pass in the interval less its FastLED send, milliseconds. Null when nothing is sent. */
  renderMaxMs: number | null
  /** Longest FastLED send of one pass in the interval, milliseconds. Null when nothing is sent. */
  sendMaxMs: number | null
  /** The interval's costliest timed nodes, costliest first. Null when the sketch times none. */
  topNodes: TelemetryNodeCost[] | null
  /**
   * Touch press to end of the frame that answered it, milliseconds.
   *
   * Null when nothing was touched in the interval, which is not the same as
   * zero and must not be averaged as if it were.
   */
  touchLatencyMs: number | null
  /** Bytes of display draw buffer the build allocated. A build constant. */
  drawBufferBytes: number | null
  /** The board link's receive counts; null on a board that receives none. */
  link?: TelemetryLinkReport | null
}

function parseTelemetryLink(fields: Map<string, string>): TelemetryLinkReport | null {
  const received = numeric(fields.get(TELEMETRY_LINK_RX_KEY))
  if (received === null) return null
  const dropped = {} as TelemetryLinkReport['dropped']
  for (const [reason, key] of Object.entries(TELEMETRY_LINK_DROP_KEYS) as [keyof typeof TELEMETRY_LINK_DROP_KEYS, string][]) {
    dropped[reason] = numeric(fields.get(key)) ?? 0
  }
  return { framesReceived: received, dropped, msSinceFrame: numeric(fields.get(TELEMETRY_LINK_AGE_KEY)) }
}

const REQUIRED = ['uptime', 'heap', 'minheap', 'fps'] as const

function numeric(value: string | undefined): number | null {
  if (value === undefined) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function telemetryFields(line: string): Map<string, string> | null {
  const at = line.indexOf(TELEMETRY_MARKER)
  if (at < 0) return null
  const fields = new Map<string, string>()
  for (const token of line.slice(at + TELEMETRY_MARKER.length).trim().split(/\s+/)) {
    const split = token.indexOf('=')
    if (split <= 0) continue
    fields.set(token.slice(0, split).toLowerCase(), token.slice(split + 1))
  }
  return fields
}

/**
 * Read one telemetry line, or null if this is not one.
 *
 * Tolerant by design: the serial stream carries the sketch's own logs, a boot
 * banner and sometimes half a line, so anything unparsable is simply not a
 * sample. The marker may sit behind a timestamp or log prefix.
 */
export function parseTelemetryLine(line: string): DeviceTelemetrySample | null {
  const fields = telemetryFields(line)
  if (!fields) return null
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
    renderMaxMs: numeric(fields.get(TELEMETRY_RENDER_KEY)),
    sendMaxMs: numeric(fields.get(TELEMETRY_SEND_KEY)),
    topNodes: parseTelemetryTop(fields.get(TELEMETRY_TOP_KEY)),
    touchLatencyMs: numeric(fields.get('touchms')),
    drawBufferBytes: numeric(fields.get('drawbuf')),
    // Absent rather than null when the line carries no link keys, so a sample
    // from a board without a link reads exactly as it did before links existed.
    ...linkField(parseTelemetryLink(fields)),
  }
}

function linkField(link: TelemetryLinkReport | null): { link?: TelemetryLinkReport } {
  return link ? { link } : {}
}

/**
 * Read a raw touch sample carried by the shared telemetry marker.
 *
 * Calibration firmware may emit these short lines at touch-sampling speed,
 * independently of the two-second health report. Requiring both named fields,
 * integer ADC values and the controller's 12-bit range prevents log traffic or
 * a partial line from moving the wizard forward.
 */
export function parseTelemetryTouchSample(line: string): DeviceTouchSample | null {
  const fields = telemetryFields(line)
  if (!fields) return null
  const rawX = numeric(fields.get(TELEMETRY_TOUCH_X_KEY))
  const rawY = numeric(fields.get(TELEMETRY_TOUCH_Y_KEY))
  if (rawX === null || rawY === null
    || !Number.isInteger(rawX) || !Number.isInteger(rawY)
    || rawX < 0 || rawX > 4095 || rawY < 0 || rawY > 4095) return null
  return { rawX, rawY }
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
  /** Worst render and worst send seen, or null if the build sends nothing. */
  renderMaxMs: number | null
  sendMaxMs: number | null
  /** Each timed node's worst share of a frame this run, costliest first; empty when none reported. */
  topNodesWorst: TelemetryNodeCost[]
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
    renderMaxMs: sample.renderMaxMs,
    sendMaxMs: sample.sendMaxMs,
    topNodesWorst: worstNodes([], sample.topNodes),
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

/** The larger of two worst cases, where null means "not reported". */
function worst(seen: number | null, sample: number | null): number | null {
  if (sample === null) return seen
  return seen === null ? sample : Math.max(seen, sample)
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
    loopMaxMs: worst(run.loopMaxMs, sample.loopMaxMs),
    renderMaxMs: worst(run.renderMaxMs, sample.renderMaxMs),
    sendMaxMs: worst(run.sendMaxMs, sample.sendMaxMs),
    topNodesWorst: worstNodes(run.topNodesWorst, sample.topNodes),
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

function milliseconds(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(1)} ms`
}

/** `Label 1.20 ms, Other 0.40 ms`, or an em dash when no node was timed. */
export function formatTelemetryNodeCosts(costs: readonly TelemetryNodeCost[], labels: readonly string[]): string {
  return costs.length === 0 ? '—'
    : costs.map((cost) => `${telemetryNodeName(labels, cost.index)} ${cost.ms.toFixed(2)} ms`).join(', ')
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
  /** The uploaded sketch's timed-node labels, by index (`telemetryNodeLabels`). */
  nodeLabels?: readonly string[]
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
    `  longest loop pass:   ${milliseconds(run.loopMaxMs)}`,
    `  worst render:        ${milliseconds(run.renderMaxMs)}`,
    `  worst send:          ${milliseconds(run.sendMaxMs)}`,
    `  costliest nodes now: ${formatTelemetryNodeCosts(run.latest.topNodes ?? [], meta.nodeLabels ?? [])}`,
    `  costliest this run:  ${formatTelemetryNodeCosts(run.topNodesWorst, meta.nodeLabels ?? [])}`,
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
