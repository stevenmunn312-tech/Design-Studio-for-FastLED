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
