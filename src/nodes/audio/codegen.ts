import { BEAT_PARAM_RANGES, FLUX_GAIN } from '../../audio/beatDetection'
import type { NodeEmitters } from '../../codegen/emitContext'
import { floatLit } from '../../codegen/cppLiterals'
import { audioHueWeight } from './evaluate'

export const AUDIO_EMITTERS: NodeEmitters = {
  FFTAnalyzer({ node, id, p, ln, v, f, hasExplicitAudioInput }) {
    const audioConnected = hasExplicitAudioInput(node.id)
    const gain = `_fftGain_${id}`
    const smoothing = `_fftSm_${id}`
    const tilt = `_fftTilt_${id}`
    const midsGain = `(${gain}*(1.0f+${tilt}*0.6f))`
    const trebleGain = `(${gain}*(1.0f+${tilt}*1.8f))`
    const fftKnobs = [
      `    float ${gain}=constrain(${f('gain', 'gain', 1)},0.25f,4.0f);`,
      `    float ${smoothing}=constrain(${f('smoothing', 'smoothing', 0.72)},0.0f,0.95f);`,
      `    float ${tilt}=constrain(${f('tilt', 'tilt', 0)},0.0f,1.0f);`,
    ]
    // `bands` genuinely drives analysis resolution here — mirrors
    // graphEvaluator.ts's FFTAnalyzer case exactly: resample the raw
    // 32-bin spectrum to `bands` bins (same technique as
    // SpectrumVisualizer's `_svBands`), then average contiguous thirds
    // into bass/mids/treble. `bands` is baked in at generation time, so
    // the group boundaries are plain compile-time constants.
    const bands = Math.max(8, Math.min(32, Math.round(Number(p.bands ?? 24))))
    const groupBounds = (start: number, end: number): [number, number] => {
      const from = Math.max(0, Math.floor(start))
      const to = Math.max(from + 1, Math.min(bands, Math.ceil(end)))
      return [from, to]
    }
    const third = bands / 3
    const [bassFrom, bassTo] = groupBounds(0, third)
    const [midsFrom, midsTo] = groupBounds(third, third * 2)
    const [trebleFrom, trebleTo] = groupBounds(third * 2, bands)
    const bandsVar = `_fftBands_${id}`
    const groupExpr = (from: number, to: number) =>
      `(${Array.from({ length: to - from }, (_, i) => `${bandsVar}[${from + i}]`).join('+')}) / ${(to - from).toFixed(1)}f`
    const rawBass = `${v('bass')}_raw`
    const rawMids = `${v('mids')}_raw`
    const rawTreble = `${v('treble')}_raw`
    if (!audioConnected) ln(`  // FFTAnalyzer — connect an Audio source to drive this analysis`)
    // The resample loop's counters (_b/_lo/_hi/_i/_sum) are generic
    // names, so they're scoped to a block — multiple FFTAnalyzer nodes
    // in the same sketch would otherwise redeclare them.
    ln(`  float ${rawBass}, ${rawMids}, ${rawTreble};`)
    ln(`  {`)
    ln(`    float ${bandsVar}[${bands}];`)
    ln(`    for (int _b = 0; _b < ${bands}; _b++) { int _lo = (_b * 32) / ${bands}, _next = ((_b + 1) * 32) / ${bands}, _hi = _next > _lo ? _next : _lo + 1; float _sum = 0.0f; for (int _i = _lo; _i < _hi; _i++) _sum += ${audioConnected ? '_audioSpectrum[_i]' : '0.0f'}; ${bandsVar}[_b] = _sum / (_hi - _lo); }`)
    ln(`    ${rawBass} = ${groupExpr(bassFrom, bassTo)};`)
    ln(`    ${rawMids} = ${groupExpr(midsFrom, midsTo)};`)
    ln(`    ${rawTreble} = ${groupExpr(trebleFrom, trebleTo)};`)
    ln(`  }`)
    for (const line of fftKnobs) ln(line)
    ln(`  float ${v('bass')}_target = constrain(${rawBass} * ${gain}, 0.0f, 1.0f), ${v('mids')}_target = constrain(${rawMids} * ${midsGain}, 0.0f, 1.0f), ${v('treble')}_target = constrain(${rawTreble} * ${trebleGain}, 0.0f, 1.0f);`)
    ln(`  static float ${v('bass')}_smooth = -1, ${v('mids')}_smooth = -1, ${v('treble')}_smooth = -1;`)
    ln(`  ${v('bass')}_smooth = ${v('bass')}_smooth < 0 ? ${v('bass')}_target : ${v('bass')}_smooth * ${smoothing} + ${v('bass')}_target * (1.0f-${smoothing});`)
    ln(`  ${v('mids')}_smooth = ${v('mids')}_smooth < 0 ? ${v('mids')}_target : ${v('mids')}_smooth * ${smoothing} + ${v('mids')}_target * (1.0f-${smoothing});`)
    ln(`  ${v('treble')}_smooth = ${v('treble')}_smooth < 0 ? ${v('treble')}_target : ${v('treble')}_smooth * ${smoothing} + ${v('treble')}_target * (1.0f-${smoothing});`)
    ln(`  float ${v('bass')} = ${v('bass')}_smooth, ${v('mids')} = ${v('mids')}_smooth, ${v('treble')} = ${v('treble')}_smooth;`)
  },
  BeatDetect({ node, id, ln, v, f, nativeFastLedAudio, hasExplicitAudioInput }) {
    const audioConnected = hasExplicitAudioInput(node.id)
    if (audioConnected && nativeFastLedAudio) {
      ln(`  bool ${v('beat')} = _audioBeat; float ${v('bpm')} = _audioBpm;`)
      ln(`  float ${v('flux')} = 0.0f, ${v('onset')} = 0.0f, ${v('contrast')} = 0.0f, ${v('threshold')} = 0.0f, ${v('cooldownMs')} = 0.0f;`)
    } else if (audioConnected) {
      /*
       * The three knobs are 0-1 on the node and map linearly onto their
       * detector ranges. `denormalizeBeatParam` did that fold at generation
       * time; the same map is emitted instead, from the one range table
       * both sides already share, so a wired knob lands on the same value
       * the preview computes.
       */
      const beatKnob = (key: 'threshold' | 'attack' | 'decay', def: number) => {
        const { min, max } = BEAT_PARAM_RANGES[key]
        return `(${floatLit(min)}+constrain(${f(key, key, def)},0.0f,1.0f)*${floatLit(max - min)})`
      }
      const threshold = `_bdThr_${id}`
      const attack = `_bdAtk_${id}`
      const decay = `_bdDec_${id}`
      const beatKnobs = [
        `  float ${threshold}=${beatKnob('threshold', 0.2)};`,
        `  float ${attack}=${beatKnob('attack', 0.55)};`,
        `  float ${decay}=${beatKnob('decay', 0.25)};`,
      ]
      const prefix = v('detector')
      for (const line of beatKnobs) ln(line)
      ln(`  bool ${v('beat')} = false;`)
      ln(`  static float ${v('bpm')} = 120.0f, ${prefix}_fast = 0.0f, ${prefix}_slow = 0.0f, ${prefix}_prevFlux = 0.0f;`)
      ln(`  float ${v('flux')} = 0.0f, ${v('onset')} = 0.0f, ${v('contrast')} = 0.0f, ${v('cooldownMs')} = 0.0f;`)
      ln(`  const float ${v('threshold')} = ${threshold};`)
      ln(`  static float ${prefix}_prevSpectrum[32]; static bool ${prefix}_ready = false; static uint32_t ${prefix}_lastBeat = 0, ${prefix}_lastMs = 0;`)
      ln(`  if (${prefix}_ready) {`)
      ln(`    float _flux = 0.0f, _weightSum = 0.0f;`)
      ln(`    for (int _i = 0; _i < 32; _i++) {`)
      ln(`      float _diff = _audioSpectrum[_i] - ${prefix}_prevSpectrum[_i]; if (_diff < 0.0f) _diff = 0.0f;`)
      ln(`      float _weight = _i < 6 ? 3.0f : (_i < 12 ? 1.6f : (_i < 20 ? 0.5f : 0.06f)); _flux += _diff * _weight; _weightSum += _weight;`)
      ln(`    }`)
      ln(`    _flux = _weightSum > 0.0f ? constrain((_flux / _weightSum) * ${FLUX_GAIN.toFixed(1)}f, 0.0f, 1.0f) : 0.0f;`)
      ln(`    uint32_t _now = millis();`)
      ln(`    // Per-frame attack/decay scaled to the actual loop interval (60 fps calibration; see beatDetection.ts).`)
      ln(`    float _dtF = ${prefix}_lastMs > 0 ? constrain((float)(_now - ${prefix}_lastMs), 1.0f, 500.0f) / 16.667f : 1.0f;`)
      ln(`    ${prefix}_lastMs = _now;`)
      ln(`    float _prevSlow = ${prefix}_slow;`)
      ln(`    ${prefix}_fast += (_flux - ${prefix}_fast) * (1.0f - powf(1.0f - ${attack}, _dtF));`)
      ln(`    ${prefix}_slow += (_flux - ${prefix}_slow) * (1.0f - powf(1.0f - ${decay}, _dtF));`)
      ln(`    float _onset = ${prefix}_fast - _prevSlow, _baseline = _prevSlow > 0.02f ? _prevSlow : 0.02f;`)
      ln(`    float _gap = constrain(60000.0f / ${v('bpm')} * 0.42f, 150.0f, 600.0f);`)
      ln(`    bool _rising = _flux > ${prefix}_prevFlux;`)
      ln(`    ${v('beat')} = _flux > ${threshold} && _rising && _onset > (${threshold})*0.45f && _onset / _baseline > 1.1f && (${prefix}_lastBeat == 0 || _now - ${prefix}_lastBeat >= (uint32_t)_gap);`)
      ln(`    if (${v('beat')}) { if (${prefix}_lastBeat != 0) { float _interval = _now - ${prefix}_lastBeat; if (_interval >= 220.0f && _interval <= 1800.0f) {`)
      ln(`      float _instant = 60000.0f / _interval;`)
      ln(`      // Octave folding — stray offbeats must not double the BPM estimate.`)
      ln(`      if (_instant > ${v('bpm')} * 1.6f && _instant * 0.5f >= 50.0f) _instant *= 0.5f; else if (_instant < ${v('bpm')} * 0.55f) _instant *= 2.0f;`)
      ln(`      ${v('bpm')} = ${v('bpm')} * 0.65f + _instant * 0.35f;`)
      ln(`    } } ${prefix}_lastBeat = _now; }`)
      ln(`    ${prefix}_prevFlux = _flux;`)
      ln(`    ${v('flux')} = _flux; ${v('onset')} = _onset; ${v('contrast')} = _onset / _baseline; ${v('cooldownMs')} = _gap;`)
      ln(`  }`)
      ln(`  for (int _i = 0; _i < 32; _i++) ${prefix}_prevSpectrum[_i] = _audioSpectrum[_i]; ${prefix}_ready = true;`)
    } else {
      ln(`  // BeatDetect — connect an Audio source for on-device beat detection`)
      ln(`  bool ${v('beat')} = false; float ${v('bpm')} = 120.0f;`)
      ln(`  float ${v('flux')} = 0.0f, ${v('onset')} = 0.0f, ${v('contrast')} = 0.0f, ${v('threshold')} = 0.0f, ${v('cooldownMs')} = 0.0f;`)
    }
  },
  PercussionDetect({ node, id, ln, v, f, hasExplicitAudioInput }) {
    const sensitivity = `_pdSens_${id}`
    const decay = `_pdDecay_${id}`
    const separation = `_pdSep_${id}`
    const pdKnobs = [
      `    float ${sensitivity}=constrain(${f('sensitivity', 'sensitivity', 0.55)},0.0f,1.0f);`,
      `    float ${decay}=constrain(${f('decay', 'decay', 0.72)},0.0f,0.98f);`,
      `    float ${separation}=constrain(${f('separation', 'separation', 0.4)},0.0f,1.0f);`,
    ]
    const audioConnected = hasExplicitAudioInput(node.id)
    if (audioConnected) {
      const prefix = v('perc')
      const threshold = `(0.06f+(1.0f-${sensitivity})*0.18f)`
      ln(`  static float ${prefix}_prevSpectrum[32]; static bool ${prefix}_ready = false;`)
      ln(`  static float ${v('kick')} = 0.0f, ${v('snare')} = 0.0f, ${v('hihat')} = 0.0f;`)
      ln(`  {`)
      for (const line of pdKnobs) ln(line)
      ln(`    float _low = 0.0f, _lowMid = 0.0f, _mids = 0.0f, _highs = 0.0f, _lowFlux = 0.0f, _midFlux = 0.0f, _highFlux = 0.0f;`)
      ln(`    for (int _i = 0; _i < 32; _i++) {`)
      ln(`      float _cur = _audioSpectrum[_i];`)
      ln(`      float _prev = ${prefix}_ready ? ${prefix}_prevSpectrum[_i] : _cur;`)
      ln(`      float _diff = _cur - _prev; if (_diff < 0.0f) _diff = 0.0f;`)
      ln(`      if (_i < 4) _low += _cur;`)
      ln(`      if (_i >= 4 && _i < 9) _lowMid += _cur;`)
      ln(`      if (_i >= 8 && _i < 16) _mids += _cur;`)
      ln(`      if (_i >= 20) _highs += _cur;`)
      ln(`      if (_i < 5) _lowFlux += _diff;`)
      ln(`      if (_i >= 6 && _i < 17) _midFlux += _diff;`)
      ln(`      if (_i >= 18) _highFlux += _diff;`)
      ln(`      ${prefix}_prevSpectrum[_i] = _cur;`)
      ln(`    }`)
      ln(`    _low /= 4.0f; _lowMid /= 5.0f; _mids /= 8.0f; _highs /= 12.0f;`)
      ln(`    _lowFlux /= 5.0f; _midFlux /= 11.0f; _highFlux /= 14.0f;`)
      ln(`    float _kickTarget = constrain(_lowFlux * 3.1f + _low * 0.9f - _lowMid * (0.3f+${separation}*0.45f) - ${threshold}, 0.0f, 1.0f);`)
      ln(`    float _snareTarget = constrain(_midFlux * 2.6f + _mids * 0.55f - _low * (0.18f+${separation}*0.22f) - _highs * 0.08f - (${threshold})*0.8f, 0.0f, 1.0f);`)
      ln(`    float _hihatTarget = constrain(_highFlux * 3.2f + _highs * 0.45f - _mids * (0.08f+${separation}*0.18f) - (${threshold})*0.65f, 0.0f, 1.0f);`)
      ln(`    ${v('kick')} = _kickTarget >= ${v('kick')} ? _kickTarget : ${v('kick')} * ${decay} + _kickTarget * (1.0f-${decay});`)
      ln(`    ${v('snare')} = _snareTarget >= ${v('snare')} ? _snareTarget : ${v('snare')} * ${decay} + _snareTarget * (1.0f-${decay});`)
      ln(`    ${v('hihat')} = _hihatTarget >= ${v('hihat')} ? _hihatTarget : ${v('hihat')} * ${decay} + _hihatTarget * (1.0f-${decay});`)
      ln(`    ${prefix}_ready = true;`)
      ln(`  }`)
    } else {
      ln(`  // PercussionDetect — connect an Audio source for on-device percussion envelopes`)
      ln(`  float ${v('kick')} = 0.0f, ${v('snare')} = 0.0f, ${v('hihat')} = 0.0f;`)
    }
  },
  AudioFeatures({ node, id, ln, v, f, hasExplicitAudioInput }) {
    const sensitivity = `_afSens_${id}`
    const gate = `_afGate_${id}`
    const smoothing = `_afSm_${id}`
    // The gate is still read after the block closes (the silence flag), so
    // it is declared outside it; the other two are only read within.
    const afGateDecl = `  float ${gate}=constrain(${f('gate', 'gate', 0.12)},0.0f,1.0f);`
    const afKnobs = [
      `    float ${sensitivity}=constrain(${f('sensitivity', 'sensitivity', 0.5)},0.0f,1.0f);`,
      `    float ${smoothing}=constrain(${f('smoothing', 'smoothing', 0.8)},0.0f,0.95f);`,
    ]
    const audioConnected = hasExplicitAudioInput(node.id)
    if (audioConnected) {
      const prefix = v('feat')
      const silenceThreshold = `(0.015f+${gate}*0.35f)`
      ln(`  static float ${prefix}_prevSpectrum[32]; static bool ${prefix}_ready = false;`)
      ln(`  static float ${v('vocals')} = 0.0f, ${v('energy')} = 0.0f;`)
      ln(afGateDecl)
      ln(`  {`)
      for (const line of afKnobs) ln(line)
      ln(`    float _low = 0.0f, _presence = 0.0f, _air = 0.0f, _presenceFlux = 0.0f, _total = 0.0f;`)
      ln(`    for (int _i = 0; _i < 32; _i++) {`)
      ln(`      float _cur = _audioSpectrum[_i];`)
      ln(`      float _prev = ${prefix}_ready ? ${prefix}_prevSpectrum[_i] : _cur;`)
      ln(`      float _diff = _cur - _prev; if (_diff < 0.0f) _diff = 0.0f;`)
      ln(`      _total += _cur;`)
      ln(`      if (_i < 5) _low += _cur;`)
      ln(`      if (_i >= 9 && _i < 18) { _presence += _cur; _presenceFlux += _diff; }`)
      ln(`      if (_i >= 18) _air += _cur;`)
      ln(`      ${prefix}_prevSpectrum[_i] = _cur;`)
      ln(`    }`)
      ln(`    _total /= 32.0f; _low /= 5.0f; _presence /= 9.0f; _presenceFlux /= 9.0f; _air /= 14.0f;`)
      ln(`    float _energyTarget = constrain((_total * 0.7f + _low * 0.2f + _presence * 0.1f) * (0.8f+${sensitivity}*0.6f), 0.0f, 1.0f);`)
      ln(`    float _vocalsTarget = constrain((_presence * 1.35f + _presenceFlux * 2.1f - _low * 0.3f - _air * 0.12f) * (0.75f+${sensitivity}*0.7f) - (${gate}*0.35f), 0.0f, 1.0f);`)
      ln(`    ${v('energy')} = ${v('energy')} * ${smoothing} + _energyTarget * (1.0f-${smoothing});`)
      ln(`    ${v('vocals')} = ${v('vocals')} * ${smoothing} + _vocalsTarget * (1.0f-${smoothing});`)
      ln(`    ${prefix}_ready = true;`)
      ln(`  }`)
      ln(`  bool ${v('silence')} = ${v('energy')} < ${silenceThreshold};`)
    } else {
      ln(`  // AudioFeatures — connect an Audio source for on-device audio feature extraction`)
      ln(`  float ${v('vocals')} = 0.0f, ${v('energy')} = 0.0f; bool ${v('silence')} = true;`)
    }
  },
  AudioHue({ node, p, ln, v, f, incoming }) {
    const bass = f('bass','bass',0.5), mids = f('mids','mids',0.5), treble = f('treble','treble',0.5)
    // The weights carry wires now, so each is bounded in the emitted text
    // the same way `audioHueWeight` bounds it for the preview — a missing
    // property still falls back to the original 0.5/0.3/0.2 mix there, and
    // `f` folds an unwired weight to that literal here.
    const weight = (key: string, def: number) => {
      // Unwired, the sanitised literal goes in directly: `floatExpr` would
      // emit `NaN` for a non-numeric stored weight, which `audioHueWeight`
      // exists to prevent on the preview side.
      const field = audioHueWeight(p[key], def)
      return incoming.has(`${node.id}:${key}`)
        ? `constrain(${f(key, key, field)},0.0f,1.0f)`
        : floatLit(field)
    }
    const bw = weight('bassWeight', 0.5)
    const mw = weight('midsWeight', 0.3)
    const tw = weight('trebleWeight', 0.2)
    // The port contract is degrees (0..360), matching the evaluator and
    // HSVToRGB.  Keeping this as a byte silently compressed firmware hues
    // into 0..255 degrees and made the same patch change colour on-device.
    ln(`  float ${v('hue')} = ((${bass})*${bw}+(${mids})*${mw}+(${treble})*${tw})*360.0f;`)
  },
}
