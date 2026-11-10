// The band patterns' optional Audio input. A band pattern (Bass Rings, Ember
// Pulse, Audio Flow and the rest) reads bass, mids and treble levels. Wire an
// Audio source into its Audio input and each band port left unwired reads that
// third of the spectrum instead of its field, so a first patch is one wire; a
// wired band port still wins, and with Audio unwired nothing changes.
//
// The bands are FFT Analyzer's at its default settings: the spectrum resampled
// to FFT_ANALYSIS_BANDS bins, cut into contiguous thirds (as Spectrum
// Visualizer's Three Band style reads them), and eased per 60th of a second on
// the wall clock (keepOver). FFT Analyzer stays the place for gain, smoothing
// and tilt: Audio → pattern reads exactly what Audio → FFT Analyzer → pattern
// reads with the analyser untouched.
//
// Both halves live here: `audioBands` for the preview and `audioBandsCpp` for
// the sketch. Each node keeps its own eased levels on both sides.
import { useUiStore } from '../../state/uiStore'
import type { EmitContext } from '../../codegen/emitContext'
import type { EvalContext, PortValue } from '../../state/evaluator/types'
import { instanceState } from '../../state/evaluator/memory'
import { isAudioSignal, resampleSpectrumBins, spectrumThirdBounds } from '../../state/evaluator/signals'
import { envelopeDt, envelopeDtCpp, keepOver, keepOverCpp } from '../shared/envelopeClock'
import { FFT_ANALYSIS_BANDS } from '../audio/evaluate'
import { floatLit } from '../../codegen/cppLiterals'

/** The ports the spectrum can stand in for, in spectrum order. */
export const AUDIO_BAND_PORTS = ['bass', 'mids', 'treble'] as const
export type AudioBandPort = typeof AUDIO_BAND_PORTS[number]

/** FFT Analyzer's default Smoothing, the share kept per 60th of a second; its Gain of 1 needs no step. */
export const AUDIO_BANDS = { smoothing: 0.72 } as const

const isBandPort = (port: string): port is AudioBandPort => (AUDIO_BAND_PORTS as readonly string[]).includes(port)

type Levels = [number, number, number]
const audioBandLevels = instanceState('audioBandLevels', new Map<string, { levels: Levels; lastT: number }>())

/**
 * This pass's raw thirds, before easing: the live spectrum's, the Test
 * Signal's oscillation (FFT Analyzer's own) while it is on with nothing live,
 * or silence.
 */
export function audioBandTargets(audioValue: PortValue, t: number): Levels {
  const audio = isAudioSignal(audioValue) ? audioValue : null
  if (audio && (audio.active || audio.micActive)) {
    const sampled = resampleSpectrumBins(audio.detectorSpectrum ?? audio.spectrum ?? [], FFT_ANALYSIS_BANDS)
    return spectrumThirdBounds(FFT_ANALYSIS_BANDS).map(([from, to]) => {
      let sum = 0
      for (let i = from; i < to; i++) sum += sampled[i]
      return Math.min(1, sum / (to - from))
    }) as Levels
  }
  if (useUiStore.getState().testSignal) {
    return [(Math.sin(t * 2.1) + 1) / 2, (Math.sin(t * 3.7 + 1.0) + 1) / 2, (Math.sin(t * 5.3 + 2.0) + 1) / 2]
  }
  return [0, 0, 0]
}

type BandContext = Pick<EvalContext, 'num' | 'input' | 'incoming' | 't' | 'elapsedT' | 'stateKey'>

/**
 * A node's band reader for one pass. Its `num` is the context's, except that
 * an unwired band port reads the eased spectrum third while the Audio input
 * carries audio. An Audio wire carrying nothing (a group's unbound input)
 * counts as unwired, as the sketch drops that wire when it expands the group.
 * The levels ease once a pass, on the first band read.
 */
export function audioBands(ctx: BandContext, id: string): Pick<EvalContext, 'num'> {
  let levels: Levels | null = null
  const read = (): Levels => {
    if (levels) return levels
    const key = ctx.stateKey(id)
    const target = audioBandTargets(ctx.input(id, 'audio', null), ctx.t)
    const held = audioBandLevels.get(key)
    const keep = keepOver(AUDIO_BANDS.smoothing, envelopeDt(held?.lastT, ctx.elapsedT))
    levels = held
      ? target.map((value, i) => held.levels[i] * keep + value * (1 - keep)) as Levels
      : target
    audioBandLevels.set(key, { levels, lastT: ctx.elapsedT })
    return levels
  }
  return {
    num(nodeId, port, props, key, def) {
      if (isBandPort(port) && !ctx.incoming.has(`${id}:${port}`)
          && ctx.incoming.has(`${id}:audio`) && isAudioSignal(ctx.input(id, 'audio', null))) {
        return read()[AUDIO_BAND_PORTS.indexOf(port)]
      }
      return ctx.num(nodeId, port, props, key, def)
    },
  }
}

/**
 * The sketch half of `audioBands`. Call it before the emitter writes anything,
 * naming the band ports the node reads: when Audio is wired, it emits one
 * block that eases each unwired one of them, and its `f` reads those levels
 * where the context's `f` would read the field. A wired band port reads its
 * wire. Audio from nothing live (no capture on this board) is silence, as FFT
 * Analyzer reads it, so the levels are a plain 0.
 */
export function audioBandsCpp(
  ctx: Pick<EmitContext, 'node' | 'id' | 'ln' | 'f' | 'incoming' | 'hasExplicitAudioInput'>,
  ports: readonly AudioBandPort[],
): Pick<EmitContext, 'f'> {
  const { node, id, ln, f, incoming, hasExplicitAudioInput } = ctx
  const derived = incoming.has(`${node.id}:audio`)
    ? ports.filter((port) => !incoming.has(`${node.id}:${port}`))
    : []
  const live = derived.length > 0 && hasExplicitAudioInput(node.id)
  const levels = `_abL_${id}`
  if (live) {
    const bands = FFT_ANALYSIS_BANDS
    ln(`  static float ${levels}[3]={-1.0f,-1.0f,-1.0f};`)
    ln(`  { // Audio bands: the spectrum's thirds, eased (audioReactive/audioBands.ts)`)
    ln(`    float _abBins[${bands}];`)
    ln(`    for (int _b = 0; _b < ${bands}; _b++) { int _lo = (_b * 32) / ${bands}, _next = ((_b + 1) * 32 + ${bands - 1}) / ${bands}, _hi = _next > _lo ? _next : _lo + 1; float _sum = 0.0f; for (int _i = _lo; _i < _hi; _i++) _sum += _audioSpectrum[_i]; _abBins[_b] = _sum / (_hi - _lo); }`)
    for (const line of envelopeDtCpp(`_ab${id}`)) ln(`    ${line}`)
    ln(`    float _abKeep=${keepOverCpp(floatLit(AUDIO_BANDS.smoothing), `_ab${id}Dt`)};`)
    const thirds = spectrumThirdBounds(bands)
    for (const port of derived) {
      const i = AUDIO_BAND_PORTS.indexOf(port)
      const [from, to] = thirds[i]
      const sum = Array.from({ length: to - from }, (_, k) => `_abBins[${from + k}]`).join('+')
      ln(`    { float _r=constrain((${sum})/${(to - from).toFixed(1)}f,0.0f,1.0f); ${levels}[${i}]=${levels}[${i}]<0.0f?_r:${levels}[${i}]*_abKeep+_r*(1.0f-_abKeep); }`)
    }
    ln(`  }`)
  }
  return {
    f(port, key, def) {
      if (!(derived as readonly string[]).includes(port)) return f(port, key, def)
      return live ? `${levels}[${AUDIO_BAND_PORTS.indexOf(port as AudioBandPort)}]` : '0.0f'
    },
  }
}
