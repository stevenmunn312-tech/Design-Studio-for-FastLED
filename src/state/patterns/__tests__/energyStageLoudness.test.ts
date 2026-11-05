// The energy stage heard through the real microphone analyser. Synthesised
// music (kick, hat and a pad at 120 BPM: silence, a quiet verse, a loud
// chorus, a quiet verse) runs through FastLedAudioAnalyzer exactly as the
// browser capture does, then through bundled patterns at the preview's
// frame rate. The rating fixtures feed synthetic energy and cannot see what
// this guards: FastLED normalises its spectrum to each band's recent peak, so
// a stage driven by Energy read the loud chorus dimmer than the quiet verse.
import { describe, expect, it } from 'vitest'
import { FastLedAudioAnalyzer } from '../../../audio/fastledReactive'
import { levelsFromSampleChannels } from '../../../audio/stereoLevels'
import { MIC_FFT_SIZE, MIC_SAMPLE_RATE, MIC_SPECTRUM_BARS } from '../../../audio/micAnalysis'
import { evaluateGraph, type Frame, type GroupRegistry, type AudioOverride, type PortValue } from '../../graphEvaluator'
import { AUDIO_BUNDLED_PATTERNS } from '../bundledPatterns'
import { groupInputIsAudioTyped, groupInputRole } from '../audioReactiveSubgraph'
import type { SavedPattern } from '../patternLibrary'

const FPS = 35
const SR = MIC_SAMPLE_RATE
const BEAT_PERIOD = 0.5
/** [gain, seconds]: silence, quiet verse, loud chorus, quiet verse. */
const SECTIONS: readonly (readonly [number, number])[] = [[0, 2], [0.12, 6], [1, 6], [0.12, 6]]

interface Section { start: number; end: number; gain: number }

function synth(): { pcm: Float32Array; sections: Section[] } {
  const sections: Section[] = []
  let t0 = 0
  for (const [gain, seconds] of SECTIONS) {
    sections.push({ start: t0, end: t0 + seconds, gain })
    t0 += seconds
  }
  const pcm = new Float32Array(Math.round(t0 * SR))
  const gainAt = (t: number) => sections.find((s) => t >= s.start && t < s.end)?.gain ?? 0
  let seed = 1
  const noise = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff - 0.5 }
  for (let i = 0; i < pcm.length; i++) {
    const t = i / SR
    const g = gainAt(t)
    if (g === 0) continue
    const tb = t % BEAT_PERIOD
    const kick = Math.sin(2 * Math.PI * (50 + 40 * Math.exp(-tb / 0.03)) * tb) * Math.exp(-tb / 0.12) * 0.8
    const hat = noise() * Math.exp(-tb / 0.03) * 0.5
    const pad = (Math.sin(2 * Math.PI * 110 * t) + Math.sin(2 * Math.PI * 165 * t) * 0.7
      + Math.sin(2 * Math.PI * 220 * t) * 0.5 + Math.sin(2 * Math.PI * 440 * t) * 0.3) * 0.12
    pcm[i] = Math.max(-1, Math.min(1, (kick + hat + pad) * g))
  }
  return { pcm, sections }
}

function meanBrightness(frame: Frame): number {
  let sum = 0
  let n = 0
  for (const row of frame) for (const px of row) { sum += Math.max(px.r, px.g, px.b) / 255; n++ }
  return n ? sum / n : 0
}

/** Mean frame brightness per animation frame, as the live preview would show it. */
function brightnessTrace(saved: SavedPattern, pcm: Float32Array): { t: number; bright: number }[] {
  const analyzer = new FastLedAudioAnalyzer(MIC_FFT_SIZE)
  const groupId = `__loud_${saved.id}`
  const prefix = `__loud_${saved.id}/`
  const registry: GroupRegistry = { [groupId]: saved.subgraph }
  const hop = SR / FPS
  const chunk = new Float32Array(MIC_FFT_SIZE)
  const rows: { t: number; bright: number }[] = []
  for (let k = 0; k * hop < pcm.length; k++) {
    const end = Math.round(k * hop)
    for (let j = 0; j < MIC_FFT_SIZE; j++) {
      const idx = end - MIC_FFT_SIZE + j
      chunk[j] = idx >= 0 ? pcm[idx] : 0
    }
    const nowMs = (k * 1000) / FPS
    const spectrum: number[] = new Array(MIC_SPECTRUM_BARS).fill(0)
    const r = analyzer.process(chunk, SR, nowMs, 1, spectrum, 450)
    const levels = levelsFromSampleChannels(chunk, chunk, 1, 1)
    const override: AudioOverride = {
      active: true, micActive: true, nativeFastLed: true, beat: r.beat, beatConfidence: r.beatConfidence, bpm: r.bpm,
      bass: r.bass, mids: r.mids, treble: r.treble, micBass: r.bass, micMids: r.mids, micTreble: r.treble,
      spectrum, detectorSpectrum: spectrum, previewSpectrum: spectrum,
      leftLevel: levels.left, rightLevel: levels.right, channelCount: 1,
      vibe: r.vibe, structure: r.structure, pitch: r.pitch, samples: r.samples,
    }
    const total = spectrum.reduce((a, b) => a + b, 0) / spectrum.length
    const boundInputs: Record<string, PortValue> = {
      bass: r.bass, mids: r.mids, treble: r.treble, kick: r.bass, snare: r.mids, hihat: r.treble, vocals: r.mids,
      energy: total, beat: r.beat, silence: total < 0.02,
    }
    for (const n of saved.subgraph.nodes) {
      if (String((n.data as { nodeType?: unknown }).nodeType) !== 'GroupInput' || !groupInputIsAudioTyped(n)) continue
      const paramId = groupInputRole(n)
      if (paramId) boundInputs[paramId] = override
    }
    const frame = evaluateGraph(saved.subgraph.nodes, saved.subgraph.edges, (k * 60) / FPS, 16, 16, registry, prefix,
      new Set([groupId]), boundInputs, override, true)
    rows.push({ t: nowMs / 1000, bright: frame ? meanBrightness(frame) : 0 })
  }
  return rows
}

/** Mean brightness over a section, skipping its first second so each one is judged settled. */
function settled(rows: { t: number; bright: number }[], section: Section): number {
  const sel = rows.filter((r) => r.t >= section.start + 1 && r.t < section.end)
  return sel.reduce((a, r) => a + r.bright, 0) / Math.max(1, sel.length)
}

describe('energy stage on microphone audio', () => {
  it('lights the loud chorus, rests through the quiet verses and arrives within a beat', () => {
    const { pcm, sections } = synth()
    const [, verse, chorus, verseAfter] = sections
    for (const name of ['Color Trails', 'Bass Furnace', 'String Pulse Plasma']) {
      const pattern = AUDIO_BUNDLED_PATTERNS.find((entry) => entry.name === name)!
      const rows = brightnessTrace(pattern, pcm)
      const quiet = settled(rows, verse)
      const loud = settled(rows, chorus)
      const quietAfter = settled(rows, verseAfter)
      expect(loud, `${name} chorus ${loud.toFixed(2)} vs verse ${quiet.toFixed(2)}`).toBeGreaterThan(quiet * 2)
      expect(quietAfter, `${name} verse after ${quietAfter.toFixed(2)} vs chorus ${loud.toFixed(2)}`).toBeLessThan(loud * 0.5)
      // Time for the brightness to cover 90% of the verse-to-chorus step.
      const target = quiet + (loud - quiet) * 0.9
      const arrived = rows.find((r) => r.t >= chorus.start && r.bright >= target)
      expect(arrived, `${name} never reached the chorus level`).toBeDefined()
      expect(arrived!.t - chorus.start, `${name} rise`).toBeLessThan(0.3)
    }
  }, 60_000)
})
