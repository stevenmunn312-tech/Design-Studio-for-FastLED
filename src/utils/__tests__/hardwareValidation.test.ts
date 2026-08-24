import { describe, expect, it } from 'vitest'
import type { StudioEdge, StudioNode } from '../../state/graphStore'
import {
  buildHardwareValidationProfile,
  formatHardwareValidationReport,
  hardwareValidationIssueUrl,
  type HardwareValidationSubmission,
} from '../hardwareValidation'

const RECORDED_RUNTIME = {
  hostOs: 'Windows 11 Home build 10.0.26200',
  browser: 'Google Chrome 150.0.7871.101',
  userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/150.0.7871.101 Safari/537.36',
}

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: { label: nodeType, nodeType, category: nodeType === 'MatrixOutput' ? 'output' : 'show', properties },
  } as StudioNode
}

const baselineMatrix = node('matrix', 'MatrixOutput', {
  width: 16,
  height: 16,
  chipset: 'WS2812B',
  colorOrder: 'GRB',
  layout: 'matrix',
  serpentine: true,
  dataPin: 5,
  brightness: 200,
  dither: true,
})

const fbuild = { ok: true, engine: 'fbuild' as const, fbuild: true, arduinoCli: false, fbuildVersion: '2.4.0' }

describe('hardware validation profiles', () => {
  it('resolves the particle overlay from the Player Particles connection', () => {
    const player = node('player', 'PatternMaster')
    const particles = node('particles', 'PlayerParticles', { enabled: true })
    const particleFx = {
      id: 'particle-fx', source: particles.id, target: player.id,
      sourceHandle: 'particleFx', targetHandle: 'particleFx',
    } as StudioEdge
    const enabled = buildHardwareValidationProfile({
      nodes: [baselineMatrix, player, particles],
      edges: [particleFx],
      selectedFqbn: 'esp32:esp32:esp32s3',
      helper: fbuild,
      runtime: RECORDED_RUNTIME,
    })

    expect(enabled.show.particleOverlay).toBe(true)
    expect(enabled.features).toContain('Beat particle overlay')

    particles.data.properties.enabled = false
    const disabled = buildHardwareValidationProfile({
      nodes: [baselineMatrix, player, particles],
      edges: [particleFx],
      selectedFqbn: 'esp32:esp32:esp32s3',
      helper: fbuild,
      runtime: RECORDED_RUNTIME,
    })
    expect(disabled.show.particleOverlay).toBe(false)

    const enabledSource = node('enabled-source', 'Button')
    const dynamic = buildHardwareValidationProfile({
      nodes: [baselineMatrix, player, particles, enabledSource],
      edges: [particleFx, {
        id: 'enabled', source: enabledSource.id, target: particles.id,
        sourceHandle: 'value', targetHandle: 'enabled',
      } as StudioEdge],
      selectedFqbn: 'esp32:esp32:esp32s3',
      helper: fbuild,
      runtime: RECORDED_RUNTIME,
    })
    expect(dynamic.show.particleOverlay).toBe(true)
  })

  it('reports the fixed microphone analysis rate instead of an ignored node property', () => {
    const mic = node('mic', 'MicInput', { i2sWs: 39, i2sSck: 40, i2sSd: 41, channel: 'Left', sampleRate: 16000 })
    const profile = buildHardwareValidationProfile({
      nodes: [baselineMatrix, mic],
      edges: [],
      selectedFqbn: 'esp32:esp32:esp32s3',
      helper: fbuild,
      runtime: RECORDED_RUNTIME,
    })
    expect(profile.peripherals.microphone).toContain('44100 Hz')
    expect(profile.peripherals.microphone).not.toContain('16000 Hz')
  })

  it('records PCM1802 wiring and exposes a dedicated unvalidated line-input path', () => {
    const lineInput = node('line', 'LineInput', {
      i2sMclk: 15,
      i2sBclk: 16,
      i2sLrclk: 17,
      i2sDout: 18,
      channel: 'Both',
    })
    const profile = buildHardwareValidationProfile({
      nodes: [baselineMatrix, lineInput],
      edges: [],
      selectedFqbn: 'esp32:esp32:esp32s3',
      helper: fbuild,
      runtime: RECORDED_RUNTIME,
    })

    expect(profile.action).toBe('line-input')
    expect(profile.peripherals.lineInput).toContain('MCLK 15 · BCLK 16 · LRCLK 17 · DOUT 18')
    expect(profile.features).toContain('PCM1802/on-device line input')
    expect(profile.gaps.map((gap) => gap.id)).toEqual(expect.arrayContaining([
      'action-line-input', 'feature-pcm1802-on-device-line-input',
    ]))
    expect(profile.checks).toContainEqual(expect.objectContaining({ id: 'line-input' }))
  })

  it('recognises the exact recorded normal-upload target', () => {
    const profile = buildHardwareValidationProfile({
      nodes: [baselineMatrix],
      edges: [],
      selectedFqbn: 'esp32:esp32:esp32s3',
      helper: fbuild,
      action: 'normal-upload',
      runtime: RECORDED_RUNTIME,
    })

    expect(profile.gaps).toEqual([])
    expect(profile.configurationKey).toMatch(/^hw-[0-9a-f]{8}$/)
    expect(profile.checks.map((check) => check.id)).toContain('reconnect')
  })

  it('recognises issues #200 and #202 for the exact 60x1 OPI upload and stream paths', () => {
    const recordedStrip = node('strip', 'MatrixOutput', {
      form: 'strip',
      ledCount: 60,
      chipset: 'WS2812B',
      colorOrder: 'GRB',
      layout: 'matrix',
      dataPin: 4,
      brightness: 200,
      correction: 'TypicalLEDStrip',
      powerLimit: true,
      volts: 5,
      milliamps: 2000,
      usePsram: true,
      psramMode: 'opi',
    })
    const normal = buildHardwareValidationProfile({
      nodes: [recordedStrip],
      edges: [],
      selectedFqbn: 'esp32:esp32:esp32s3',
      helper: { ...fbuild, fbuildVersion: 'fbuild 2.5.18' },
      action: 'normal-upload',
      runtime: {
        hostOs: 'Windows 11 Home build 10.0.26200',
        browser: 'Google Chrome 151.0.7922.173',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/151.0.7922.173 Safari/537.36',
      },
    })

    expect(normal.matrix).toMatchObject({ form: 'strip', width: 60, height: 1, psram: 'opi' })
    expect(normal.features).toEqual(['LED String geometry', 'PSRAM (opi)'])
    expect(normal.configurationKey).toBe('hw-14e7d6c0')
    expect(normal.gaps).toEqual([])

    const recordedStream = buildHardwareValidationProfile({
      nodes: [recordedStrip],
      edges: [],
      selectedFqbn: 'esp32:esp32:esp32s3',
      helper: { ...fbuild, fbuildVersion: 'fbuild 2.5.18' },
      action: 'live-stream',
      runtime: RECORDED_RUNTIME,
    })
    expect(recordedStream.configurationKey).toBe('hw-86de9ad2')
    expect(recordedStream.gaps).toEqual([])
  })

  it('recognises issues #203 and #204 only for the exact 65x1 OPI microphone and stream paths', () => {
    const recordedStrip = node('strip', 'MatrixOutput', {
      form: 'strip',
      ledCount: 65,
      chipset: 'WS2812B',
      colorOrder: 'GRB',
      layout: 'matrix',
      dataPin: 4,
      brightness: 200,
      correction: 'TypicalLEDStrip',
      powerLimit: true,
      volts: 5,
      milliamps: 2000,
      usePsram: true,
      psramMode: 'opi',
    })
    const microphone = node('mic', 'MicInput', {
      i2sWs: 39,
      i2sSck: 40,
      i2sSd: 41,
      channel: 'Left',
    })
    const common = {
      nodes: [recordedStrip, microphone],
      edges: [],
      selectedFqbn: 'esp32:esp32:esp32s3',
      helper: { ...fbuild, fbuildVersion: 'fbuild 2.5.18' },
      runtime: RECORDED_RUNTIME,
    }

    const microphonePass = buildHardwareValidationProfile({ ...common, action: 'microphone' })
    expect(microphonePass.configurationKey).toBe('hw-b1bb1cf3')
    expect(microphonePass.gaps).toEqual([])

    const streamPass = buildHardwareValidationProfile({ ...common, action: 'live-stream' })
    expect(streamPass.configurationKey).toBe('hw-0e6da4b4')
    expect(streamPass.gaps).toEqual([])

    const unrecordedUpload = buildHardwareValidationProfile({ ...common, action: 'normal-upload' })
    expect(unrecordedUpload.gaps).toEqual([
      expect.objectContaining({ id: 'action-normal-upload' }),
    ])
  })

  it('fingerprints a corkscrew as a physical LED chain', () => {
    const corkscrew = node('corkscrew', 'MatrixOutput', {
      ...baselineMatrix.data.properties,
      form: 'corkscrew',
      ledCount: 120,
      corkscrewTurns: 6,
      corkscrewDiameterMm: 100,
      corkscrewHeightMm: 300,
    })
    const profile = buildHardwareValidationProfile({
      nodes: [corkscrew],
      edges: [],
      selectedFqbn: 'esp32:esp32:esp32s3',
      helper: fbuild,
      runtime: RECORDED_RUNTIME,
    })

    expect(profile.matrix).toMatchObject({
      form: 'corkscrew',
      width: 120,
      height: 1,
      serpentine: false,
      supersample: false,
    })
    expect(profile.features).toContain('LED Corkscrew geometry')
    expect(profile.gaps).toContainEqual(expect.objectContaining({ id: 'feature-led-corkscrew-geometry' }))
  })

  it('asks for the per-panel topology markers when validating a folded HUB75 wiring test', () => {
    const output = node('matrix', 'MatrixOutput', {
      width: 128,
      height: 64,
      chipset: 'HUB75',
      layout: 'panels',
      tilesX: 2,
      tilesY: 2,
      tileSerpentine: true,
      tileRotations: '0,180,0,180',
    })
    const profile = buildHardwareValidationProfile({
      nodes: [output],
      edges: [],
      selectedFqbn: 'esp32:esp32:esp32s3',
      helper: fbuild,
      action: 'wiring-test',
      runtime: RECORDED_RUNTIME,
    })

    expect(profile.checks).toContainEqual(expect.objectContaining({
      id: 'wiring-diagnostic',
      label: 'Diagnostic + panel topology',
      detail: expect.stringMatching(/X\/Y coordinate.*rotation.*serpentine direction/),
    }))
  })

  it('identifies SD-show and advanced music pipeline gaps and requests SD checks', () => {
    const output = node('matrix', 'MatrixOutput', { ...baselineMatrix.data.properties })
    const performance = node('performance', 'PerformanceGenerator', { useGroupInputs: true })
    const sd = node('sd', 'SDCard', { sdCsPin: 10, i2sBclk: 26, i2sLrc: 25, i2sDout: 22 })
    const edges = [
      { id: 'a', source: performance.id, target: sd.id, sourceHandle: 'shows', targetHandle: 'shows' },
      { id: 'b', source: sd.id, target: output.id, sourceHandle: 'sdcard', targetHandle: 'sdcard' },
    ] as StudioEdge[]
    const profile = buildHardwareValidationProfile({
      nodes: [output, performance, sd],
      edges,
      selectedFqbn: 'esp32:esp32:esp32s3',
      helper: fbuild,
      action: 'sd-show',
      runtime: RECORDED_RUNTIME,
    })

    expect(profile.features).toEqual(expect.arrayContaining([
      'Baked song envelopes', 'Group-input modulation', 'SD show provisioning/player',
    ]))
    expect(profile.gaps.map((gap) => gap.id)).toEqual(expect.arrayContaining([
      'action-sd-show', 'feature-baked-song-envelopes', 'feature-group-input-modulation', 'feature-sd-show-provisioning-player',
    ]))
    expect(profile.checks.map((check) => check.id)).toEqual(expect.arrayContaining([
      'sd-transfer', 'player-flash', 'audio-playback', 'av-sync',
    ]))
  })

  it('includes capacity and reviewed results without private connection or project data', () => {
    const profile = buildHardwareValidationProfile({
      nodes: [baselineMatrix],
      edges: [],
      selectedFqbn: 'esp32:esp32:esp32s3',
      helper: fbuild,
      action: 'normal-upload',
      runtime: RECORDED_RUNTIME,
      capacityResult: {
        ok: true,
        overflow: false,
        target: 'esp32:esp32:esp32s3',
        flash: { usedBytes: 500, limitBytes: 1000, percent: 50 },
        ram: { usedBytes: 250, limitBytes: 1000, percent: 25 },
        error: null,
      },
    })
    const submission: HardwareValidationSubmission = {
      profile,
      recordedAt: '2026-07-16T10:00:00.000Z',
      hostOs: RECORDED_RUNTIME.hostOs,
      browser: RECORDED_RUNTIME.browser,
      results: { compile: 'pass', upload: 'pass', orientation: 'fail' },
      notes: 'Bottom-right corner was reversed.',
    }
    const report = formatHardwareValidationReport(submission)

    expect(report).toContain('50% (500/1000 bytes)')
    expect(report).toContain('| Orientation/layout | FAIL |')
    expect(report).not.toContain('COM7')
    expect(report).not.toContain('My Secret Project')
    const issueUrl = new URL(hardwareValidationIssueUrl(report, profile))
    expect(issueUrl.searchParams.get('title')).toContain('[Beta hardware] ESP32-S3')
  })
})
