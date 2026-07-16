import type { StudioEdge, StudioNode } from '../state/graphStore'
import type { BackendHealth, CompileCheckResult } from './backendClient'
import { boardByFqbn } from '../state/uploadStore'

export type HardwareValidationAction =
  | 'normal-upload'
  | 'wiring-test'
  | 'live-stream'
  | 'generative-show'
  | 'microphone'
  | 'sd-show'

export type ValidationResult = 'pass' | 'fail' | 'not-tested'

export interface ValidationRuntime {
  hostOs: string
  browser: string
  userAgent: string
}

export interface ValidationGap {
  id: string
  label: string
  reason: string
}

export interface ValidationCheck {
  id: string
  label: string
  detail: string
}

export interface HardwareValidationProfile {
  schemaVersion: 1
  appVersion: string
  action: HardwareValidationAction
  configurationKey: string
  environment: ValidationRuntime
  controller: {
    board: string
    fqbn: string
    engine: string
    engineVersion: string
  }
  matrix: {
    chipset: string
    colorOrder: string
    width: number
    height: number
    layout: string
    serpentine: boolean
    dataPin: number
    clockPin: number | null
    brightness: number
    correction: string
    dither: boolean
    overclock: number
    powerLimit: boolean
    volts: number | null
    milliamps: number | null
    tilesX: number | null
    tilesY: number | null
    tileSerpentine: boolean | null
    tileRotations: string | null
    psram: string | null
    supersample: boolean
  }
  features: string[]
  capacity: {
    flash: string
    ram: string
  }
  gaps: ValidationGap[]
  checks: ValidationCheck[]
}

export interface HardwareValidationSubmission {
  profile: HardwareValidationProfile
  recordedAt: string
  hostOs: string
  browser: string
  results: Record<string, ValidationResult>
  notes: string
}

const ACTION_LABELS: Record<HardwareValidationAction, string> = {
  'normal-upload': 'Normal USB upload',
  'wiring-test': 'Wiring diagnostic',
  'live-stream': 'Serial live stream',
  'generative-show': 'Generative show',
  microphone: 'On-device microphone',
  'sd-show': 'Music-synced SD show',
}

const CLOCKED_CHIPSETS = new Set(['APA102', 'APA102HD', 'WS2801', 'HD108'])
const RECORDED_USER_AGENT = /Windows NT 10\.0.*Chrome\/150\.0\.7871\.101/

function nodeType(node: StudioNode): string {
  return String(node.data.nodeType ?? '')
}

function props(node: StudioNode | undefined): Record<string, unknown> {
  return (node?.data.properties ?? {}) as Record<string, unknown>
}

function n(value: unknown, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function hashString(input: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function percent(result: CompileCheckResult | null | undefined, key: 'flash' | 'ram'): string {
  const size = result?.[key]
  return size ? `${size.percent}% (${size.usedBytes}/${size.limitBytes} bytes)` : 'not measured'
}

export function validationActionLabel(action: HardwareValidationAction): string {
  return ACTION_LABELS[action]
}

export function detectValidationRuntime(userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent): ValidationRuntime {
  const browserMatch = userAgent.match(/Edg\/([\d.]+)/)
    ?? userAgent.match(/Chrome\/([\d.]+)/)
    ?? userAgent.match(/Firefox\/([\d.]+)/)
    ?? userAgent.match(/Version\/([\d.]+).*Safari\//)
  const browser = !browserMatch
    ? 'Unknown — please enter browser and version'
    : userAgent.includes('Edg/') ? `Microsoft Edge ${browserMatch[1]}`
    : userAgent.includes('Chrome/') ? `Google Chrome ${browserMatch[1]}`
    : userAgent.includes('Firefox/') ? `Mozilla Firefox ${browserMatch[1]}`
    : `Safari ${browserMatch[1]}`

  const hostOs = /Windows NT/.test(userAgent)
    ? 'Windows — please add edition and build'
    : /Mac OS X ([\d_]+)/.test(userAgent)
      ? `macOS ${RegExp.$1.replaceAll('_', '.')}`
      : /Linux/.test(userAgent)
        ? 'Linux — please add distribution and version'
        : 'Unknown — please enter OS and version'

  return { hostOs, browser, userAgent: userAgent || 'Unavailable' }
}

function defaultAction(nodes: StudioNode[], edges: StudioEdge[]): HardwareValidationAction {
  const output = nodes.find((node) => nodeType(node) === 'MatrixOutput')
  if (output && edges.some((edge) => edge.target === output.id && edge.targetHandle === 'sdcard')) return 'sd-show'
  const master = nodes.find((node) => nodeType(node) === 'PatternMaster')
  if (master && output && edges.some((edge) => edge.source === master.id && edge.target === output.id && edge.targetHandle === 'frame')) {
    return 'generative-show'
  }
  if (nodes.some((node) => nodeType(node) === 'MicInput')) return 'microphone'
  return 'normal-upload'
}

export function suggestedValidationAction(nodes: StudioNode[], edges: StudioEdge[]): HardwareValidationAction {
  return defaultAction(nodes, edges)
}

function featureList(nodes: StudioNode[], edges: StudioEdge[], matrixProps: Record<string, unknown>): string[] {
  const features: string[] = []
  const output = nodes.find((node) => nodeType(node) === 'MatrixOutput')
  const master = nodes.find((node) => nodeType(node) === 'PatternMaster')
  const performance = nodes.find((node) => nodeType(node) === 'PerformanceGenerator')
  const layout = String(matrixProps.layout ?? 'matrix')

  if (layout === 'panels') features.push('Tiled panel layout')
  if (layout === 'custom') features.push('Custom XY map')
  if (layout === 'strip') features.push('Strip layout')
  if (matrixProps.usePsram === true) features.push(`PSRAM (${String(matrixProps.psramMode ?? 'default')})`)
  if (matrixProps.supersample === true) features.push('2× supersampling')
  if (nodes.some((node) => nodeType(node) === 'MicInput')) features.push('INMP441/on-device microphone')

  if (master) {
    const transitionEdge = edges.find((edge) => edge.target === master.id && edge.targetHandle === 'transitions')
    const transitionNode = transitionEdge && nodes.find((node) => node.id === transitionEdge.source)
    const transitions = (props(transitionNode).transitions as string[] | undefined) ?? []
    if (transitions.some((transition) => transition !== 'crossfade')) features.push('Non-crossfade show transitions')
    if (edges.some((edge) => edge.target === master.id && edge.targetHandle === 'beat')) features.push('Beat-triggered show advance')
    if (props(master).particles === true) features.push('Beat particle overlay')
  }

  if (performance) {
    features.push('Baked song envelopes')
    if (props(performance).useGroupInputs === true) features.push('Group-input modulation')
  }
  if (output && edges.some((edge) => edge.target === output.id && edge.targetHandle === 'sdcard')) features.push('SD show provisioning/player')
  return features
}

function isRecordedTarget(profile: Omit<HardwareValidationProfile, 'gaps' | 'checks'>): boolean {
  const m = profile.matrix
  return profile.controller.fqbn === 'esp32:esp32:esp32s3'
    && profile.controller.engine === 'fbuild'
    && m.chipset === 'WS2812B'
    && m.width === 16
    && m.height === 16
    && m.layout === 'matrix'
    && m.serpentine
    && !m.psram
}

function findGaps(profile: Omit<HardwareValidationProfile, 'gaps' | 'checks'>): ValidationGap[] {
  const gaps: ValidationGap[] = []
  const recordedTarget = isRecordedTarget(profile)
  if (!recordedTarget) {
    gaps.push({
      id: 'exact-target',
      label: 'Exact controller + LED configuration',
      reason: 'No recorded beta row matches this board, engine, chipset, dimensions, layout, and PSRAM combination.',
    })
  }

  if (!RECORDED_USER_AGENT.test(profile.environment.userAgent)) {
    gaps.push({
      id: 'host-browser',
      label: 'Host OS + browser combination',
      reason: 'The recorded beta path is Windows 11 Home build 10.0.26200 with Chrome 150.0.7871.101; this runtime differs or cannot expose the full OS build.',
    })
  }

  const recordedActions = new Set<HardwareValidationAction>([
    'normal-upload', 'wiring-test', 'live-stream', 'generative-show', 'microphone',
  ])
  if (!recordedTarget || !recordedActions.has(profile.action)) {
    gaps.push({
      id: `action-${profile.action}`,
      label: ACTION_LABELS[profile.action],
      reason: `This exact target does not have a recorded ${ACTION_LABELS[profile.action].toLowerCase()} validation.`,
    })
  }

  const advanced = new Map<string, string>([
    ['Tiled panel layout', 'Panel tiling and rotation are still experimental.'],
    ['Custom XY map', 'Custom physical-index mappings are still experimental.'],
    ['Strip layout', 'Non-matrix physical layouts are still experimental.'],
    ['2× supersampling', 'Supersampled firmware output has not been recorded on hardware.'],
    ['Non-crossfade show transitions', 'Only the basic show path/crossfade has a hardware record.'],
    ['Beat-triggered show advance', 'Beat-triggered early show advance is awaiting hardware evidence.'],
    ['Beat particle overlay', 'The beat particle overlay is awaiting hardware evidence.'],
    ['Baked song envelopes', 'Baked song-envelope playback is awaiting hardware evidence.'],
    ['Group-input modulation', 'Collection-driven group-input modulation is awaiting hardware evidence.'],
    ['SD show provisioning/player', 'SD provisioning, file transfer, player flashing, playback, and sync are awaiting a full hardware record.'],
  ])
  for (const feature of profile.features) {
    if (feature.startsWith('PSRAM')) {
      gaps.push({ id: 'feature-psram', label: feature, reason: 'PSRAM modes are still experimental and need a dated hardware record.' })
      continue
    }
    const reason = advanced.get(feature)
    if (reason) gaps.push({ id: `feature-${feature.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')}`, label: feature, reason })
  }
  return gaps.filter((gap, index, all) => all.findIndex((candidate) => candidate.id === gap.id) === index)
}

function makeChecks(profile: Omit<HardwareValidationProfile, 'gaps' | 'checks'>): ValidationCheck[] {
  const checks: ValidationCheck[] = [
    { id: 'compile', label: 'Compile', detail: 'The generated sketch compiled for the selected board and engine.' },
    { id: 'upload', label: 'Upload', detail: 'The helper flashed the target without an error.' },
    { id: 'led-output', label: 'LED output', detail: 'The LEDs illuminated and a representative animated pattern ran.' },
    { id: 'color-order', label: 'Color order', detail: 'Red, green, and blue appeared on the intended channels.' },
    { id: 'orientation', label: 'Orientation/layout', detail: 'Corners, rows, serpentine direction, panels, and mapping matched the physical build.' },
    { id: 'brightness', label: 'Brightness', detail: 'Master brightness behaved as configured.' },
    { id: 'reconnect', label: 'Reconnect/re-upload', detail: 'The board could be disconnected/reconnected and flashed again.' },
  ]
  if (profile.matrix.powerLimit) checks.push({ id: 'power-cap', label: 'Power cap', detail: 'The configured voltage/current cap visibly limited output as expected.' })
  if (profile.features.includes('INMP441/on-device microphone')) checks.push({ id: 'microphone', label: 'Microphone input', detail: 'Live audio drove the expected FFT/beat behavior on-device.' })
  if (profile.action === 'wiring-test') checks.push({ id: 'wiring-diagnostic', label: 'Diagnostic sequence', detail: 'Solids, gradients, corner marks, indices, and chases all rendered correctly.' })
  if (profile.action === 'live-stream') checks.push({ id: 'live-stream', label: 'Live stream', detail: 'The receiver accepted frames, stayed responsive, and released the port cleanly.' })
  if (profile.action === 'generative-show') checks.push({ id: 'show-runtime', label: 'Show runtime', detail: 'Pattern dwell, transitions, beat advance, and overlays behaved as configured.' })
  if (profile.action === 'sd-show') {
    checks.push(
      { id: 'sd-transfer', label: 'SD provisioning', detail: 'Provisioner flash and music/show transfer to the SD card completed.' },
      { id: 'player-flash', label: 'Player flash', detail: 'The final music-show player compiled and flashed.' },
      { id: 'audio-playback', label: 'Audio playback', detail: 'Audio played cleanly through the configured I2S output.' },
      { id: 'av-sync', label: 'Audio/visual sync', detail: 'Lighting events remained acceptably synchronized with the song.' },
    )
  }
  return checks
}

export function buildHardwareValidationProfile(options: {
  nodes: StudioNode[]
  edges: StudioEdge[]
  selectedFqbn: string
  helper: BackendHealth | null | undefined
  capacityResult?: CompileCheckResult | null
  action?: HardwareValidationAction
  runtime?: ValidationRuntime
}): HardwareValidationProfile {
  const { nodes, edges, selectedFqbn, helper, capacityResult } = options
  const matrixNode = nodes.find((node) => nodeType(node) === 'MatrixOutput')
  const p = props(matrixNode)
  const chipset = String(p.chipset ?? 'WS2812B')
  const layout = String(p.layout ?? 'matrix')
  const engine = helper?.engine ?? 'unknown'
  const engineVersion = engine === 'fbuild' ? helper?.fbuildVersion : helper?.version
  const action = options.action ?? defaultAction(nodes, edges)
  const runtime = options.runtime ?? detectValidationRuntime()
  const features = featureList(nodes, edges, p)
  const base = {
    schemaVersion: 1 as const,
    appVersion: __APP_VERSION__,
    action,
    configurationKey: '',
    environment: runtime,
    controller: {
      board: boardByFqbn(selectedFqbn)?.label ?? 'Unknown board',
      fqbn: selectedFqbn || 'not selected',
      engine,
      engineVersion: engineVersion || 'unknown',
    },
    matrix: {
      chipset,
      colorOrder: String(p.colorOrder ?? 'GRB'),
      width: Math.max(1, Math.round(n(p.width, 16))),
      height: Math.max(1, Math.round(n(p.height, 16))),
      layout,
      serpentine: p.serpentine === true,
      dataPin: Math.round(n(p.dataPin, 5)),
      clockPin: CLOCKED_CHIPSETS.has(chipset) ? Math.round(n(p.clockPin, 6)) : null,
      brightness: Math.round(n(p.brightness, 200)),
      correction: String(p.correction ?? 'none'),
      dither: p.dither !== false,
      overclock: n(p.overclock, 1),
      powerLimit: p.powerLimit === true,
      volts: p.powerLimit === true ? n(p.volts, 5) : null,
      milliamps: p.powerLimit === true ? Math.round(n(p.milliamps, 2000)) : null,
      tilesX: layout === 'panels' ? Math.round(n(p.tilesX, 1)) : null,
      tilesY: layout === 'panels' ? Math.round(n(p.tilesY, 1)) : null,
      tileSerpentine: layout === 'panels' ? p.tileSerpentine === true : null,
      tileRotations: layout === 'panels' ? String(p.tileRotations ?? '') : null,
      psram: p.usePsram === true ? String(p.psramMode ?? 'default') : null,
      supersample: p.supersample === true,
    },
    features,
    capacity: {
      flash: percent(capacityResult, 'flash'),
      ram: percent(capacityResult, 'ram'),
    },
  }
  const fingerprintSource = JSON.stringify({ controller: base.controller, matrix: base.matrix, action, features })
  base.configurationKey = `hw-${hashString(fingerprintSource)}`
  return { ...base, gaps: findGaps(base), checks: makeChecks(base) }
}

function md(value: unknown): string {
  return String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ')
}

function resultLabel(result: ValidationResult | undefined): string {
  return result === 'pass' ? 'PASS' : result === 'fail' ? 'FAIL' : 'NOT TESTED'
}

export function formatHardwareValidationReport(submission: HardwareValidationSubmission): string {
  const { profile } = submission
  const m = profile.matrix
  const rows: Array<[string, unknown]> = [
    ['Schema', profile.schemaVersion],
    ['FastLED Studio', profile.appVersion],
    ['Recorded at', submission.recordedAt],
    ['Configuration key', profile.configurationKey],
    ['Test path', ACTION_LABELS[profile.action]],
    ['Host OS', submission.hostOs],
    ['Browser', submission.browser],
    ['User agent', profile.environment.userAgent],
    ['Board', `${profile.controller.board} (${profile.controller.fqbn})`],
    ['Build engine', `${profile.controller.engine} ${profile.controller.engineVersion}`],
    ['LED target', `${m.chipset} · ${m.colorOrder} · ${m.width}×${m.height}`],
    ['Layout', `${m.layout} · pixel serpentine: ${m.serpentine ? 'yes' : 'no'}`],
    ['Pins', `data ${m.dataPin}${m.clockPin == null ? '' : ` · clock ${m.clockPin}`}`],
    ['Output settings', `brightness ${m.brightness} · correction ${m.correction} · dither ${m.dither ? 'on' : 'off'} · overclock ${m.overclock}×`],
    ['Power cap', m.powerLimit ? `${m.volts} V / ${m.milliamps} mA` : 'disabled'],
    ['Panels', m.tilesX == null ? 'n/a' : `${m.tilesX}×${m.tilesY} · chain serpentine ${m.tileSerpentine ? 'yes' : 'no'} · rotations ${m.tileRotations || 'all 0'}`],
    ['PSRAM', m.psram ?? 'disabled'],
    ['Supersampling', m.supersample ? 'enabled' : 'disabled'],
    ['Measured flash', profile.capacity.flash],
    ['Measured RAM', profile.capacity.ram],
    ['Features', profile.features.join(', ') || 'standard graph'],
  ]
  const gapText = profile.gaps.length
    ? profile.gaps.map((gap) => `- **${gap.label}:** ${gap.reason}`).join('\n')
    : '- No known coverage gaps for the recorded target/path.'
  const checkRows = profile.checks
    .map((check) => `| ${md(check.label)} | ${resultLabel(submission.results[check.id])} | ${md(check.detail)} |`)
    .join('\n')

  return [
    '# FastLED Studio beta hardware validation',
    '',
    '## Exact environment and configuration',
    '',
    '| Field | Value |',
    '| --- | --- |',
    ...rows.map(([label, value]) => `| ${md(label)} | ${md(value)} |`),
    '',
    '## Coverage gaps this run can help close',
    '',
    gapText,
    '',
    '## Observed results',
    '',
    '| Check | Result | What was checked |',
    '| --- | --- | --- |',
    checkRows,
    '',
    '## Notes',
    '',
    submission.notes.trim() || 'None.',
    '',
    '> Submitted explicitly by the tester after reviewing this report. No project content, serial-port name, Wi-Fi details, or device identifier is included.',
  ].join('\n')
}

export function hardwareValidationIssueUrl(report: string, profile: HardwareValidationProfile): string {
  const title = `[Beta hardware] ${profile.controller.board} · ${ACTION_LABELS[profile.action]} · ${profile.configurationKey}`
  const query = new URLSearchParams({ title, body: report })
  return `https://github.com/stevenmunn312-tech/FastLED-Studio/issues/new?${query}`
}
