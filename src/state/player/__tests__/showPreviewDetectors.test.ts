import { describe, it, expect } from 'vitest'
import { renderShowFrame } from '../showPreview'
import type { ShowFile, AudioEnvelope } from '../../../types/showFile'
import { encodeDetectorBytes, encodePitchRecord, encodeVibeRecord, PITCH_RECORD_BYTES, VIBE_RECORD_BYTES } from '../../../audio/detectorTrack'
import { encodeSpectrumBytes, SPECTRUM_TRACK_BINS } from '../../../audio/spectrumTrack'

// The audio node evaluators read the baked detectors through the show
// override: a white frame dimmed by a detector output (Vibe's relative bass,
// or Pitch Detect's velocity), each wired from the group's Audio GroupInput.
describe('renderShowFrame baked detectors', () => {
  const mk = (id: string, nodeType: string, properties: Record<string, unknown>, inputs: unknown[] = [], outputs: unknown[] = []) =>
    ({ id, type: 'studioNode', position: { x: 0, y: 0 }, data: { label: nodeType, nodeType, category: 'pattern', properties, inputs, outputs } })
  const groupFor = (detector: 'Vibe' | 'PitchDetect', port: string) => ({
    g1: {
      nodes: [
        mk('white', 'SolidColor', { r: 255, g: 255, b: 255 }, [], [{ id: 'frame', dataType: 'frame' }]),
        mk('gi', 'GroupInput', { paramId: 'audio' }, [], [{ id: 'out', dataType: 'audio' }]),
        mk('det', detector, {}, [{ id: 'audio', dataType: 'audio' }], [{ id: port, dataType: 'float' }]),
        mk('bm', 'BrightnessMod', {}, [{ id: 'frame', dataType: 'frame' }, { id: 'brightness', dataType: 'float' }], [{ id: 'frame', dataType: 'frame' }]),
        mk('go', 'GroupOutput', {}, [{ id: 'frame', dataType: 'frame' }], []),
      ],
      edges: [
        { id: 'e1', source: 'white', sourceHandle: 'frame', target: 'bm', targetHandle: 'frame' },
        { id: 'e2', source: 'gi', sourceHandle: 'out', target: 'det', targetHandle: 'audio' },
        { id: 'e3', source: 'det', sourceHandle: port, target: 'bm', targetHandle: 'brightness' },
        { id: 'e4', source: 'bm', sourceHandle: 'frame', target: 'go', targetHandle: 'frame' },
      ],
    },
  }) as unknown as Parameters<typeof renderShowFrame>[4]
  const baseEnvelope = (): AudioEnvelope => ({
    version: 3, rateHz: 50, bass: [0.5], mids: [0.5], treble: [0.5], leftLevel: [0], rightLevel: [0], channelCount: 1,
    spectrum: encodeSpectrumBytes(new Uint8Array(SPECTRUM_TRACK_BINS)),
  })
  const showWith = (audio: AudioEnvelope): ShowFile => ({
    version: 2, songTitle: 'D', durationMs: 1000, bpm: 120, patternSet: ['g1'], audio,
    events: [
      { t: 0, cmd: 'SET_PATTERN', params: { index: 0 } },
      { t: 0, cmd: 'SET_BRIGHTNESS', params: { value: 255 } },
    ],
  })
  const sum = (f: ReturnType<typeof renderShowFrame>) => f.flat().reduce((a, px) => a + px.r + px.g + px.b, 0)

  it('lights a Vibe-driven pattern from the baked vibe block and leaves it dark without one', () => {
    const vibe = new Uint8Array(VIBE_RECORD_BYTES)
    encodeVibeRecord({
      bass: 1.5, mid: 1, treble: 1, volume: 0, bassAtt: 1, midAtt: 1, trebleAtt: 1,
      bassSpike: true, midSpike: false, trebleSpike: false,
    }, vibe, 0)
    const groups = groupFor('Vibe', 'bass')
    const lit = renderShowFrame(showWith({ ...baseEnvelope(), vibe: encodeDetectorBytes(vibe) }), 0, 4, 4, groups)
    const dark = renderShowFrame(showWith(baseEnvelope()), 0, 4, 4, groups)
    expect(sum(lit)).toBeGreaterThan(0)
    expect(sum(dark)).toBe(0)
  })

  it('lights a Pitch Detect-driven pattern from the baked pitch block', () => {
    const pitch = new Uint8Array(PITCH_RECORD_BYTES)
    encodePitchRecord({ hz: 440, note: 69, noteOn: true, velocity: 1, confidence: 0.9, keyRoot: 0, keyMinor: false, keyConfidence: 0 }, pitch, 0)
    const groups = groupFor('PitchDetect', 'velocity')
    const lit = renderShowFrame(showWith({ ...baseEnvelope(), pitch: encodeDetectorBytes(pitch) }), 0, 4, 4, groups)
    const dark = renderShowFrame(showWith(baseEnvelope()), 0, 4, 4, groups)
    expect(sum(lit)).toBeGreaterThan(0)
    expect(sum(dark)).toBe(0)
  })
})
