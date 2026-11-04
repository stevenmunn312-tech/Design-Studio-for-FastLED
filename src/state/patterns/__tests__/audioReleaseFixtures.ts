import { evaluateGraphFull, type AudioOverride, type Frame } from '../../graphEvaluator'
import type { SavedPattern } from '../patternLibrary'
import { bandsToSpectrum } from '../../player/showAudio'

export type ReleaseScenario = 'quiet' | 'energetic' | 'buildup' | 'drop' | 'silent'
let serial = 0

/** A controlled detector payload isolates musical sections from detector heuristics. */
export function releaseAudio(frame: number, scenario: ReleaseScenario, dropImpact = 0.95): AudioOverride {
  const silent = scenario === 'silent'
  const t = frame / 30
  const energy = silent ? 0 : scenario === 'quiet' ? 0.14 : 0.78
  const bass = energy * (0.78 + Math.sin(t * 9) * 0.16)
  const mids = energy * (0.72 + Math.sin(t * 7 + 1) * 0.2)
  const treble = energy * (0.58 + Math.sin(t * 13 + 2) * 0.22)
  const beat = !silent && frame % 15 === 0
  const spectrum = bandsToSpectrum(bass, mids, treble)
  const building = scenario === 'buildup' && frame >= 45
  const drop = scenario === 'drop' && frame === 90
  return {
    active: true, micActive: true, nativeFastLed: true,
    beat, bpm: 120, bass, mids, treble, micBass: bass, micMids: mids, micTreble: treble,
    spectrum, detectorSpectrum: spectrum, leftLevel: energy * 0.8, rightLevel: energy * 0.45, channelCount: 2,
    vibe: { bass: energy * 1.8, mid: energy * 1.4, treble: energy * 1.6, volume: energy * 1.7,
      bassAtt: energy * 1.5, midAtt: energy * 1.25, trebleAtt: energy * 1.3,
      bassSpike: beat, midSpike: beat && frame % 30 === 0, trebleSpike: beat && frame % 45 === 0 },
    structure: { downbeat: beat && frame % 60 === 0, beatNumber: Math.floor(frame / 15) % 4 + 1,
      measurePhase: (frame % 60) / 60, building, buildupProgress: building ? Math.min(1, (frame - 45) / 60) : 0,
      drop, dropImpact: drop ? dropImpact : 0, tempoStable: !silent, valence: 0.62, arousal: energy },
    pitch: { hz: silent ? 0 : 220, note: silent ? 0 : 57, noteOn: beat, velocity: mids,
      confidence: silent ? 0 : 0.9, keyRoot: 9, keyMinor: true, keyConfidence: silent ? 0 : 0.85 },
  }
}

export function renderReleaseScenario(pattern: SavedPattern, scenario: ReleaseScenario, width = 16, height = 16, dropImpact = 0.95) {
  const prefix = `release-test-${serial++}/`
  const frames: Frame[] = []
  const effectFrames: Frame[] = []
  const effectSource = pattern.subgraph.edges.find((edge) => edge.target === 'releaseBrightness' && edge.targetHandle === 'frame')
  let outputs = new Map<string, Record<string, unknown>>()
  for (let frame = 0; frame < 120; frame++) {
    const audio = releaseAudio(frame, scenario, dropImpact)
    const groupInputs = Object.fromEntries(pattern.inputs.filter((port) => port.dataType === 'audio').map((port) => [port.id, audio]))
    const result = evaluateGraphFull(pattern.subgraph.nodes, pattern.subgraph.edges, frame * 2,
      width, height, pattern.groups ?? {}, false, true, prefix, audio, frame * 2, groupInputs)
    if (!result.frame) throw new Error(`${pattern.name}: no frame at ${frame}`)
    if (frame >= 90 && frame % 5 === 0) {
      frames.push(result.frame.map((row) => row.map((pixel) => ({ ...pixel }))))
      const effect = result.outputs.get(effectSource?.source ?? '')?.[effectSource?.sourceHandle ?? 'frame'] as Frame | undefined
      if (effect) effectFrames.push(effect.map((row) => row.map((pixel) => ({ ...pixel }))))
    }
    outputs = result.outputs
  }
  return { frames, effectFrames, outputs }
}

export function releasePixels(frames: Frame[]): number[] {
  return frames.flatMap((frame) => frame.flatMap((row) => row.flatMap((pixel) => [pixel.r, pixel.g, pixel.b])))
}
