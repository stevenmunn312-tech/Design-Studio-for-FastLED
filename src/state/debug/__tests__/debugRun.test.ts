// A diagnostic run uploads a part's probe sketch in place of the project and
// reads its FLS_DBG lines. The upload itself is stubbed: these tests hold the
// run's rules, the sketch's shape and the probe's verdicts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StudioEdge, StudioNode } from '../../graphStore'
import { useGraphStore } from '../../graphStore'
import { useUploadStore } from '../../upload/uploadStore'
import { useUiStore } from '../../uiStore'
import { NODE_LIBRARY, libraryDefaults } from '../../nodeLibrary'
import { generateAnalogProbeSketch } from '../../../codegen/sketches/debug/analogProbeSketch'
import { debugRunBlocker, PROBE_BAUD, useDebugRunStore } from '../debugRunStore'
import { POT_PROFILE } from '../profiles/controls'
import { debugProfileFor } from '../debugProfiles'
import { debugContextFor } from '../debugProfile'
import { useDeviceTelemetryStore } from '../../upload/deviceTelemetryStore'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: {
      label: definition?.label ?? nodeType, nodeType, category: definition?.category ?? 'input',
      properties: { ...libraryDefaults(nodeType), ...properties },
      inputs: definition?.inputs ?? [], outputs: definition?.outputs ?? [],
    },
  } as unknown as StudioNode
}

const wire = (source: string, target: string) =>
  ({ id: `${source}-${target}`, source, sourceHandle: 'debug', target, targetHandle: 'part' }) as StudioEdge

function seed(nodes: StudioNode[], edges: StudioEdge[], trusted = true) {
  useGraphStore.setState({ nodes, edges, trusted, activeGraphId: 'root' } as never)
}

const initialUpload = useUploadStore.getState()

beforeEach(() => {
  useDebugRunStore.setState({ run: null })
  useUploadStore.setState({ selectedPort: 'COM7', busy: false, serialBaud: 9600 })
  useUiStore.setState({ activeBoardId: 'board-root' } as never)
})

afterEach(() => {
  useUploadStore.setState(initialUpload, true)
  vi.restoreAllMocks()
})

describe('Analog probe sketch', () => {
  it('reads one pin with the project’s full-scale define and prints FLS_DBG lines', () => {
    const sketch = generateAnalogProbeSketch(34)
    expect(sketch).toContain('static const uint8_t PROBE_PIN = 34;')
    expect(sketch).toContain('#define DS_ANALOG_FULL_SCALE 4095.0f')
    expect(sketch).toContain('Serial.begin(115200);')
    expect(sketch).toContain('FLS_DBG v=1 probe=analog raw=')
    // Prints from loop only, rate-limited.
    expect(sketch).toMatch(/millis\(\) - probePrinted >= 250/)
  })

  it('clamps a bad pin rather than emitting it', () => {
    expect(generateAnalogProbeSketch(-3)).toContain('PROBE_PIN = 0;')
    expect(generateAnalogProbeSketch(9999)).toContain('PROBE_PIN = 255;')
  })
})

describe('Potentiometer probe verdicts', () => {
  const ctx = debugContextFor(node('pot', 'PotInput', { pin: 34 }), [])
  const verdict = (fields: Record<string, number>) => POT_PROFILE.probe!.interpret(ctx, { adcMax: 4095, noise: 2, ...fields })
    .map((entry) => `${entry.tone}: ${entry.title}`)

  it('passes a full sweep', () => {
    expect(verdict({ raw: 2000, min: 0, max: 4095 })).toEqual(['ok: The pot reaches its full range'])
  })

  it('names a lifted ground: pinned at full', () => {
    expect(verdict({ raw: 4095, min: 4090, max: 4095 })).toEqual(['fault: The pot reads full the whole time'])
  })

  it('names a missing wiper: pinned at 0', () => {
    expect(verdict({ raw: 0, min: 0, max: 3 })).toEqual(['fault: The pot reads 0 the whole time'])
  })

  it('asks for a turn when the reading sits mid-range', () => {
    expect(verdict({ raw: 2000, min: 1990, max: 2010 })).toEqual(['suspect: The pot reading has not moved yet'])
  })

  it('names a partial sweep and noise', () => {
    expect(verdict({ raw: 2000, min: 800, max: 3000, noise: 200 }))
      .toEqual(['suspect: The pot covers 54% of the range', 'suspect: The reading is noisy'])
  })
})

describe('Diagnostic run', () => {
  const pot = node('pot', 'PotInput', { pin: 34 })
  const debug = node('dbg', 'Debug')

  it('refuses in an untrusted workspace', () => {
    // Trust only sticks while the workspace holds code from elsewhere.
    seed([node('board-root', 'Board'), pot, debug, node('code', 'Code', { code: 'from elsewhere' })], [wire('pot', 'dbg')], false)
    expect(debugRunBlocker('dbg')).toMatch(/Trust this workspace/)
  })

  it('refuses a part on a board other than the one the bench targets', () => {
    seed([node('board-root', 'Board'), node('board-2', 'Board'), node('pot', 'PotInput', { pin: 34, boardId: 'board-2' }), debug], [wire('pot', 'dbg')])
    expect(debugRunBlocker('dbg')).toMatch(/Switch the bench to that board/)
    // Each board keeps its own port, so switching boards selects that board's.
    useUiStore.setState({ activeBoardId: 'board-2' } as never)
    useUploadStore.setState({ selectedPort: 'COM9' })
    expect(debugRunBlocker('dbg')).toBeNull()
  })

  it('refuses with no port, and for a part with no probe', () => {
    seed([node('board-root', 'Board'), pot, debug], [wire('pot', 'dbg')])
    useUploadStore.setState({ selectedPort: '' })
    expect(debugRunBlocker('dbg')).toMatch(/Choose the board’s port/)
    seed([node('board-root', 'Board'), node('temp', 'TemperatureInput'), debug], [wire('temp', 'dbg')])
    expect(debugRunBlocker('dbg')).toMatch(/no diagnostic sketch yet/)
  })

  it('uploads without caching, listens at the probe baud, and reads its lines through the serial router', async () => {
    seed([node('board-root', 'Board'), pot, debug], [wire('pot', 'dbg')])
    const runUpload = vi.fn(async () => { useUploadStore.setState({ status: { phase: 'success', message: 'Done' } } as never) })
    const startSerial = vi.fn(async () => { useUploadStore.setState({ serialConnected: true }) })
    useUploadStore.setState({ runUpload, startSerial } as never)
    await useDebugRunStore.getState().start('dbg')
    expect(runUpload).toHaveBeenCalledWith(expect.stringContaining('PROBE_PIN = 34;'), undefined, { cache: false })
    expect(useUploadStore.getState().serialBaud).toBe(PROBE_BAUD)
    expect(useDebugRunStore.getState().run?.phase).toBe('running')

    useDeviceTelemetryStore.getState().ingest('boot\r\nFLS_DBG v=1 probe=analog state=ready\r\nFLS_DBG v=1 probe=analog raw=2048 min=0 max=4095 noise=3 adcMax=4095\r\n')
    expect(useDebugRunStore.getState().run?.fields).toMatchObject({ raw: 2048, max: 4095 })
    // Another probe's lines are not this run's.
    useDeviceTelemetryStore.getState().ingest('FLS_DBG v=1 probe=digital level=1\n')
    expect(useDebugRunStore.getState().run?.fields).toMatchObject({ raw: 2048 })
  })

  it('reports a failed upload and leaves the port alone', async () => {
    seed([node('board-root', 'Board'), pot, debug], [wire('pot', 'dbg')])
    const startSerial = vi.fn()
    useUploadStore.setState({
      runUpload: vi.fn(async () => { useUploadStore.setState({ status: { phase: 'error', message: 'Failed' } } as never) }),
      startSerial,
    } as never)
    await useDebugRunStore.getState().start('dbg')
    expect(useDebugRunStore.getState().run).toMatchObject({ phase: 'failed', error: expect.stringMatching(/did not upload/) })
    expect(startSerial).not.toHaveBeenCalled()
  })
})

describe('Phase 3 probes', () => {
  const ctxOf = (part: StudioNode, board?: StudioNode) => debugContextFor(part, board ? [board] : [])
  const titles = (findings: { tone: string; title: string }[]) => findings.map((entry) => `${entry.tone}: ${entry.title}`)

  it('watches every button row with its own pull-up and names each', () => {
    const button = node('b', 'ButtonBank', { buttons: [
      { id: '1', label: 'Next', pin: 12, pullup: true },
      { id: '2', label: 'Back', pin: 13, pullup: false },
    ] })
    const probe = debugProfileFor(button)!.probe!
    const sketch = probe.sketch(ctxOf(button))!
    expect(sketch).toContain('PROBE_PINS[] = { 12, 13 }')
    expect(sketch).toContain('PROBE_PULLUP[] = { true, false }')
    expect(titles(probe.interpret(ctxOf(button), { level_12: 0, edges_12: 0, bounces_12: 0, level_13: 0, edges_13: 6, bounces_13: 9 })))
      .toEqual(['fault: Next reads active the whole time', 'ok: Back works', 'suspect: Back chatters'])
    expect(titles(probe.interpret(ctxOf(button), { level_12: 1, edges_12: 0, bounces_12: 0 })))
      .toEqual(['suspect: No change seen on Next yet'])
  })

  it('names an encoder that counts backwards and offers the swap', () => {
    const encoder = node('e', 'EncoderInput', { pinA: 6, pinB: 7, pinSW: 8 })
    const probe = debugProfileFor(encoder)!.probe!
    const [direction, sw] = probe.interpret(ctxOf(encoder), { count: -4, invalid: 0, sw: 1, presses: 2 })
    expect(direction.title).toBe('The encoder counts backwards')
    expect(direction.repair?.properties).toEqual({ pinA: 7, pinB: 6 })
    expect(sw.tone).toBe('ok')
    expect(titles(probe.interpret(ctxOf(encoder), { count: 0, invalid: 12, sw: 0, presses: 0 })))
      .toEqual(['fault: A and B change but do not decode', 'suspect: Many steps are unclear', 'fault: The switch reads pressed the whole time'])
  })

  it('scans with the board’s own bus start: pins on ESP32, the fixed bus on AVR', () => {
    const env = node('env', 'EnvironmentInput', { sdaPin: 21, sclPin: 22 })
    const esp = debugProfileFor(env)!.probe!.sketch(ctxOf(env, node('board-root', 'Board', { profileId: 'esp32-generic-devkit-38pin' })))!
    expect(esp).toContain('Wire.begin(21, 22);')
    expect(esp).toContain('pinMode(21, INPUT);')
    const uno = debugProfileFor(env)!.probe!.sketch(ctxOf(env, node('board-root', 'Board', { profileId: 'arduino-uno-r3-dip' })))!
    expect(uno).toContain('Wire.begin();')
    expect(uno).toContain('pinMode(SDA, INPUT);')
  })

  it('offers the found address for a strappable OLED, and only names it for a fixed DS3231', () => {
    const oled = node('o', 'InfoDisplay', { partId: 'ssd1306-oled-096-128x64-i2c' })
    const [moved] = debugProfileFor(oled)!.probe!.interpret(ctxOf(oled), { found: '3D', count: 1, sdaIdle: 1, sclIdle: 1 })
    expect(moved.title).toBe('The part answers at 0x3D, not 0x3C')
    expect(moved.repair).toBeDefined()
    const rtc = node('r', 'RtcModule')
    const [other] = debugProfileFor(rtc)!.probe!.interpret(ctxOf(rtc), { found: '57', count: 1, sdaIdle: 1, sclIdle: 1 })
    expect(other.title).toBe('The part answers at 0x57, not 0x68')
    expect(other.repair).toBeUndefined()
  })

  it('names an empty bus, and a bus line held low', () => {
    const rtc = node('r', 'RtcModule')
    const probe = debugProfileFor(rtc)!.probe!
    expect(probe.interpret(ctxOf(rtc), { found: '', count: 0, sdaIdle: 1, sclIdle: 1 })[0].detail).toMatch(/swapped/)
    expect(probe.interpret(ctxOf(rtc), { found: '', count: 0, sdaIdle: 0, sclIdle: 1 })[0].detail).toMatch(/sits low/)
    expect(titles(probe.interpret(ctxOf(rtc), { found: '57,68', count: 2, sdaIdle: 1, sclIdle: 1 }))).toEqual(['ok: The part answers at 0x68'])
  })
})
