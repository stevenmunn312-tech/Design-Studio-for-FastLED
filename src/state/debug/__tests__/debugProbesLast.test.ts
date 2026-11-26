// The last Phase 3 probes: the LED wiring test with stage markers and colour
// questions, the audio input, the SD card and the power monitor.
import { beforeEach, describe, expect, it } from 'vitest'
import type { StudioNode } from '../../graphStore'
import { NODE_LIBRARY, libraryDefaults } from '../../nodeLibrary'
import { debugContextFor } from '../debugProfile'
import { debugProfileFor } from '../debugProfiles'
import { actualColorOrder } from '../profiles/ledOutput'
import { useDebugRunStore } from '../debugRunStore'

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

const ESP32 = node('board-root', 'Board', { profileId: 'esp32-generic-devkit-38pin' })
const S3 = node('board-root', 'Board', { profileId: 'espressif-esp32-s3-devkitc-1' })
const UNO = node('board-root', 'Board', { profileId: 'arduino-uno-r3-dip' })
const titles = (findings: { tone: string; title: string }[]) => findings.map((entry) => `${entry.tone}: ${entry.title}`)

describe('Colour order from what the strip showed', () => {
  it('reads the real order back from the red and green answers', () => {
    // Configured GRB on a strip that is really RGB: red is sent first, so it shows as R... and so on.
    expect(actualColorOrder('GRB', 'R', 'G')).toBe('GRB')
    expect(actualColorOrder('GRB', 'G', 'R')).toBe('RGB')
    expect(actualColorOrder('RGB', 'B', 'R')).toBe('BRG')
  })

  it('refuses answers that cannot be one order', () => {
    expect(actualColorOrder('GRB', 'R', 'R')).toBeNull()
    expect(actualColorOrder('GRB', 'none', 'G')).toBeNull()
    expect(actualColorOrder('GRBW', 'R', 'G')).toBeNull()
  })

  it('round-trips: setting the derived order makes red show red', () => {
    for (const configured of ['RGB', 'RBG', 'GRB', 'GBR', 'BRG', 'BGR']) {
      for (const strip of ['RGB', 'RBG', 'GRB', 'GBR', 'BRG', 'BGR']) {
        const shows = (channel: string) => strip[configured.indexOf(channel)]
        const derived = actualColorOrder(configured, shows('R'), shows('G'))
        expect(derived, `${configured} on ${strip}`).toBe(strip)
      }
    }
  })
})

describe('LED probe', () => {
  const output = node('out', 'MatrixOutput', { chipset: 'WS2812B', colorOrder: 'GRB', dataPin: 5, width: 8, height: 8 })
  const ctx = debugContextFor(output, [ESP32])
  const probe = debugProfileFor(output)!.probe!

  it('marks each stage of the wiring test, in the cycle’s own order', () => {
    const sketch = probe.sketch(ctx)!
    expect(sketch).toContain('static const char* const DIAG_STEPS[] = { "red", "green", "blue", "brightness", "orientation", "panels", "chase", "physical-chase" };')
    expect(sketch).toContain('% 8);')
    expect(sketch).toContain('FLS_DBG v=1 probe=led step=')
    expect(sketch).toContain('Serial.begin(115200);')
  })

  it('offers the colour order the answers point to', () => {
    const [finding] = probe.interpret(ctx, { step: 'red' }, { 'probe-red': 'G', 'probe-green': 'R' })
    expect(finding.title).toBe('The strip’s colour order is RGB, not GRB')
    expect(finding.repair?.properties).toEqual({ colorOrder: 'RGB' })
  })

  it('names a dark strip, an unreliable signal, a broken chain, and passes good answers', () => {
    expect(titles(probe.interpret(ctx, {}, { 'probe-red': 'none' }))).toEqual(['fault: The strip does not light'])
    expect(titles(probe.interpret(ctx, {}, { 'probe-red': 'mixed', 'probe-green': 'G' }))).toEqual(['suspect: The data signal is unreliable'])
    expect(titles(probe.interpret(ctx, {}, { 'probe-red': 'R', 'probe-green': 'G', 'probe-chase': 'no' })))
      .toEqual(['ok: Colours are correct', 'fault: The dot stops part way'])
  })
})

describe('Audio probe', () => {
  const mic = node('mic', 'MicInput', { channel: 'Left' })

  it('is the project’s own audio path with its debug line on, and nothing driving LEDs', () => {
    const sketch = debugProfileFor(mic)!.probe!.sketch(debugContextFor(mic, [S3]))!
    expect(sketch).toContain('#define MIC_DEBUG 1')
    expect(sketch).toContain('FLS_DBG v=1 probe=audio left=')
    expect(sketch).not.toContain('addLeds')
  })

  it('refuses a board without the ESP32 audio path', () => {
    expect(debugProfileFor(mic)!.probe!.unavailable!(debugContextFor(mic, [UNO]))).toMatch(/ESP32/)
    expect(debugProfileFor(mic)!.probe!.unavailable!(debugContextFor(mic, [S3]))).toBeNull()
  })

  it('judges the loudest level seen, and offers the other channel when sound arrives there', () => {
    const probe = debugProfileFor(mic)!.probe!
    const ctx = debugContextFor(mic, [S3])
    expect(titles(probe.interpret(ctx, { max_left: 0, max_right: 0 }))).toEqual(['suspect: Nothing heard yet'])
    expect(titles(probe.interpret(ctx, { max_left: 0.4, max_right: 0 }))).toEqual(['ok: The input hears sound'])
    const findings = probe.interpret(ctx, { max_left: 0, max_right: 0.4 })
    expect(titles(findings)).toEqual(['ok: The input hears sound', 'fault: Sound arrives on the right channel'])
    expect(findings[1].repair?.properties).toEqual({ channel: 'Right' })
  })
})

describe('SD card probe', () => {
  const card = node('sd', 'SDCard')

  it('mounts on the card’s own pins as the SD player does, on ESP32 only', () => {
    const probe = debugProfileFor(card)!.probe!
    const sketch = probe.sketch(debugContextFor(card, [ESP32]))!
    expect(sketch).toMatch(/SD_CS = \d+, SD_SCK = \d+, SD_MISO = \d+, SD_MOSI = \d+;/)
    expect(sketch).toContain('SD.begin(SD_CS, SPI, 20000000)')
    expect(sketch).toContain('type=\\"')
    expect(probe.unavailable!(debugContextFor(card, [UNO]))).toMatch(/ESP32/)
  })

  it('names a card that will not mount, a slow one and an empty one', () => {
    const probe = debugProfileFor(card)!.probe!
    const ctx = debugContextFor(card, [ESP32])
    expect(titles(probe.interpret(ctx, { mounted: 0 }))).toEqual(['fault: The card does not mount'])
    expect(titles(probe.interpret(ctx, { mounted: 1, mhz: 4, type: 'SDHC', files: 0 })))
      .toEqual(['ok: The card mounts', 'suspect: Only the slow speed works', 'suspect: The card is empty'])
  })
})

describe('Power monitor probe', () => {
  const monitor = node('pm', 'PowerMonitorInput')

  it('is the project’s power monitor code with debug on', () => {
    const sketch = debugProfileFor(monitor)!.probe!.sketch(debugContextFor(monitor, [ESP32]))!
    expect(sketch).toContain('FLS_DBG v=1 probe=power connected=')
  })

  it('names a silent monitor, reversed current, and a voltage that disagrees with the meter', () => {
    const probe = debugProfileFor(monitor)!.probe!
    const ctx = debugContextFor(monitor, [ESP32])
    expect(titles(probe.interpret(ctx, { connected: 0 }))).toEqual(['fault: The monitor does not answer'])
    expect(titles(probe.interpret(ctx, { connected: 1, volts: 5, amps: -0.5 }))).toEqual(['fault: Current reads backwards'])
    expect(titles(probe.interpret(ctx, { connected: 1, volts: 0.1, amps: 0.5 }, { 'load-volts': 5 })))
      .toEqual(['suspect: The monitor and your meter disagree on voltage'])
    expect(titles(probe.interpret(ctx, { connected: 1, volts: 5, amps: 0.5 }, { 'load-volts': 5.02 }))).toEqual(['ok: The monitor reads the load'])
  })

  it('keeps the I2C checks and adds the load voltage step', () => {
    const ids = debugProfileFor(monitor)!.meterSteps(debugContextFor(monitor, [ESP32])).map((step) => step.id)
    expect(ids).toEqual(expect.arrayContaining(['sda-wire', 'scl-wire', 'vcc', 'load-volts']))
  })
})

describe('Run maxima', () => {
  beforeEach(() => useDebugRunStore.setState({ run: { debugNodeId: 'd', probeKind: 'audio', phase: 'running', fields: null, lines: 0, error: null } }))

  it('keeps the loudest value of each number across lines', () => {
    const { ingestLine } = useDebugRunStore.getState()
    ingestLine('FLS_DBG v=1 probe=audio left=0.10 right=0.0')
    ingestLine('FLS_DBG v=1 probe=audio left=0.80 right=0.0')
    ingestLine('FLS_DBG v=1 probe=audio left=0.05 right=0.2')
    expect(useDebugRunStore.getState().run?.fields).toMatchObject({ left: 0.05, max_left: 0.8, max_right: 0.2 })
  })
})
