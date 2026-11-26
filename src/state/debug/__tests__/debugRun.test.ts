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
    seed([node('board-root', 'Board'), node('enc', 'EncoderInput'), debug], [wire('enc', 'dbg')])
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
