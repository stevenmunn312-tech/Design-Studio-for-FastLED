import { asAnimatedImage, asImage } from '../shared/image'
import { imagePaletteStops16 } from '../../state/palettes/imagePalette'
import { gradientMixMode } from '../../state/palettes/hueMix'
import { HARMONY_OFFSETS, harmonyKind, harmonyStopPlace } from '../../state/palettes/harmonyPalette'
import { hexToRgb, polineStops16 } from '../../state/palettes/polinePalette'
import { normalizeButtonEdgeSettings } from '../../state/player/transportBridge'
import { pressEdgeSettings } from '../../state/player/pressSource'
import {
  paletteBankEntries, PALETTE_BANK_FALLBACK, paletteBankLabel, paletteBankBlend,
  PALETTE_BANK_BLEND_TICK_MS, PALETTE_BANK_BLEND_MAX_TICKS, paletteBankChoice, paletteBankChoiceCpp,
} from '../../state/palettes/paletteBank'
import { normalizeCustomPalette, customPaletteStops16, hexToRgb as customHexToRgb } from '../../state/palettes/customPalette'
import type { NodeEmitters } from '../../codegen/emitContext'
import { cppStringLiteral } from '../../codegen/cppLiterals'
import { POLINE_HELPER_CPP, polinePositionId } from '../../codegen/helpers/polineHelperCpp'
import { hexCrgbCpp, hsvColorCpp } from '../../codegen/colorControlCpp'
import { phaseTag, speedPhaseCpp } from '../shared/speedClockCpp'
import { easeByteCpp } from '../math/easing'
import { paletteEnds, sweepMotion } from './paletteMotion'
import { colorTemperatureCpp } from './colorTemperature'
import { BLACK_POINT_LAMBDA_CPP, blackPointByteCpp } from './paletteBlackPoint'
import { ADJUST_COLOR_DEFAULT, adjustColorCpp } from './adjustColor'

export const COLOR_EMITTERS: NodeEmitters = {
  HueCycle({ id, ln, v, f, needsT, needsHsv }) {
    needsT.v = true
    needsHsv.v = true
    const rate = f('rate', 'rate', 0.1), s = f('s', 's', 1), val = f('v', 'v', 1)
    ln(`  CRGB ${v('color')};`)
    ln(`  {`)
    const ph = speedPhaseCpp(ln, phaseTag(id), rate)
    ln(`    float _huePhase = fmodf(fmodf(${ph}, 1.0f) + 1.0f, 1.0f); ${v('color')} = _hsv(_huePhase * 360.0f, ${s}, ${val}); }`)
  },
  Color({ p, ln, v }) {
    ln(`  CRGB ${v('color')} = ${hexCrgbCpp(p.color, 0xff3080)};`)
  },
  HSVToRGB({ p, ln, v, f, needsHsv }) {
    needsHsv.v = true
    ln(`  CRGB ${v('color')} = ${hsvColorCpp(p.hueUnits, f('h', 'h', 0), f('s', 's', 1), f('v', 'v', 1))};`)
  },
  // The inverse of HSVToRGB, on the same wheel as the preview.
  RGBToHSV({ id, ln, v, channelColor, needsHsv }) {
    needsHsv.v = true
    const rgb = channelColor('rgb', 0, 0, 0)
    ln(`  CRGB _hsv_${id} = ${rgb};`)
    ln(`  float ${v('h')} = _rgbHue(_hsv_${id});`)
    ln(`  float ${v('s')} = _rgbSat(_hsv_${id});`)
    ln(`  float ${v('v')} = _rgbVal(_hsv_${id});`)
  },
  // The same lines the control graph emits (adjustColorCpp).
  AdjustColor({ id, ln, v, f, channelColor, needsHsv }) {
    needsHsv.v = true
    const { r, g, b } = ADJUST_COLOR_DEFAULT
    for (const line of adjustColorCpp(id, v('color'), channelColor('color', r, g, b),
      f('hueShift', 'hueShift', 0), f('saturation', 'saturation', 1), f('brightness', 'brightness', 1))) ln(line)
  },
  Temperature({ ln, v, f, needsKelvin }) {
    needsKelvin.v = true
    ln(`  CRGB ${v('color')} = ${colorTemperatureCpp(f('kelvin', 'kelvin', 4000))};`)
  },
  HeatColor({ ln, v, f }) {
    ln(`  CRGB ${v('color')} = HeatColor((uint8_t)(constrain(${f('heat', 'heat', 0.5)}, 0.0f, 1.0f) * 255));`)
  },
  GradientSampler({ id, p, ln, v, f, channelColor, gradientChannel, needsHueMix }) {
    // Clamped as the evaluator clamps it: a wired T past 1 cast a channel
    // past 255 and wrapped the colour. colorControlCpp emits the same lines.
    const tt = `_gsT_${id}`
    const cA = `_gsA_${id}`, cB = `_gsB_${id}`
    ln(`  CRGB ${cA}=${channelColor('colorA', 0, 200, 255, ['rA', 'gA', 'bA'])},${cB}=${channelColor('colorB', 255, 0, 255, ['rB', 'gB', 'bB'])};`)
    ln(`  float ${tt} = constrain(${f('t', 't', 0)}, 0.0f, 1.0f);`)
    const mode = gradientMixMode(p.mixMode)
    if (mode === 'rgb') {
      ln(`  CRGB ${v('color')} = CRGB(${gradientChannel(cA, cB, 'r', tt)},${gradientChannel(cA, cB, 'g', tt)},${gradientChannel(cA, cB, 'b', tt)});`)
    } else {
      needsHueMix.v = true
      ln(`  CRGB ${v('color')} = _hueMix(${cA}, ${cB}, ${tt}, ${mode === 'hsvLong'});`)
    }
  },
  PaletteSampler({ node, p, ln, v, f, paletteExpr }) {
    const tt = f('t', 't', 0), pal = paletteExpr(node.id, 'paletteIn', p)
    ln(`  CRGB ${v('color')};`)
    if (paletteEnds(p.ends) === 'hold') {
      // An amount: clamped, and the last entry held rather than blended back to the first.
      ln(`  { float _ps=constrain(${tt}, 0.0f, 1.0f); ${v('color')} = ColorFromPalette(${pal}, (uint8_t)(_ps*255), 255, LINEARBLEND_NOWRAP); }`)
      return
    }
    // Wrapped round the palette before the byte cast, as samplePalette wraps;
    // casting an out-of-range float to uint8_t is undefined behaviour.
    ln(`  { float _ps=${tt}; ${v('color')} = ColorFromPalette(${pal}, (uint8_t)((_ps-floorf(_ps))*255)); }`)
  },
  // Each leg is shaped by Ease's own FastLED byte curve (math/easing.ts),
  // which hands back the palette index directly.
  PaletteSweep({ node, id, p, ln, v, f, paletteExpr, needsT }) {
    needsT.v = true
    const rate = f('rate', 'rate', 0.1)
    const pal = paletteExpr(node.id, 'paletteIn', p)
    const motion = sweepMotion(p.motion)
    const ph = speedPhaseCpp(ln, phaseTag(id), `fmaxf(0.0f, (${rate}))`, '  ')
    ln(`  float _psPhase_${id} = fmodf(fmodf(${ph}, 1.0f) + 1.0f, 1.0f);`)
    ln(motion === 'loop'
      ? `  float _psPos_${id} = _psPhase_${id};`
      : `  float _psPos_${id} = _psPhase_${id} < 0.5f ? _psPhase_${id} * 2.0f : (1.0f - _psPhase_${id}) * 2.0f;`)
    const index = easeByteCpp(String(p.easing ?? 'inOutSine'), `(uint8_t)(constrain(_psPos_${id}, 0.0f, 1.0f) * 255)`)
    ln(`  CRGB ${v('color')} = ColorFromPalette(${pal}, ${index}, 255, ${motion === 'loop' ? 'LINEARBLEND' : 'LINEARBLEND_NOWRAP'});`)
  },
  PaletteSelector({ p, ln }) {
    // Named rather than by its table, which is only emitted when a node reads it.
    const name = String(p.palette ?? 'rainbow').replace(/[^\w -]/g, '')
    ln(`  // PaletteSelector — the ${name} palette, for the palette-consuming nodes it feeds`)
  },
  CustomPalette({ node, id, p, ln, incoming, colorExpr }) {
    // Positioned custom stops bake to a full CRGBPalette16. Wired color
    // inputs override their matching local stop for the first four slots.
    const local = normalizeCustomPalette(p.colors, p.positions)
    const localStops = customPaletteStops16(local.colors.map(customHexToRgb), local.positions)
    const colorStopExpr = (source: number) => {
      const port = `color${source}`
      if (source < 4 && incoming.get(`${node.id}:${port}`)) return colorExpr(node.id, port)
      const c = customHexToRgb(local.colors[source])
      return `CRGB(${c.r},${c.g},${c.b})`
    }
    const stopExpr = (idx: number) => {
      const position = idx / 15
      let right = 1
      while (right < local.positions.length - 1 && position > local.positions[right]) right++
      const left = Math.max(0, right - 1)
      const leftPos = local.positions[left] ?? 0
      const rightPos = local.positions[right] ?? 1
      const amount = Math.max(0, Math.min(255, Math.round(((position - leftPos) / Math.max(1e-6, rightPos - leftPos)) * 255)))
      if (amount <= 0) return colorStopExpr(left)
      if (amount >= 255) return colorStopExpr(right)
      const leftExpr = colorStopExpr(left)
      const rightExpr = colorStopExpr(right)
      if (!leftExpr.includes('n_') && !rightExpr.includes('n_')) {
        const c = localStops[idx]
        return `CRGB(${c.r},${c.g},${c.b})`
      }
      return `blend(${leftExpr}, ${rightExpr}, ${amount})`
    }
    ln(`  CRGBPalette16 pal_${id}(${Array.from({ length: 16 }, (_, i) => stopExpr(i)).join(', ')});`)
  },
  PaletteFromImage({ node, id, p, incoming, nodeMap, props, globalLines }) {
    const upstream = incoming.get(`${node.id}:image`)
    const sourceNode = upstream ? nodeMap.get(upstream.srcId) : null
    const sourceProps = sourceNode?.data.nodeType === 'Image' ? props(sourceNode) : null
    const source = sourceProps
      ? (asAnimatedImage(sourceProps.animation) ?? asImage(sourceProps.image))
      : null
    const stops = imagePaletteStops16(source, Number(p.count ?? 6))
    const cppStops = stops.map((color) => `CRGB(${color.r},${color.g},${color.b})`).join(', ')
    if (!source) globalLines.push(`// Palette from Image: connect an Image node with an uploaded file.`)
    globalLines.push(`const CRGBPalette16 pal_${id}(${cppStops});`)
  },
  Poline({ node, id, p, ln, incoming, colorExpr, globalLines }) {
    const a = hexToRgb(String(p.anchorA ?? '#1020ff'))
    const b = hexToRgb(String(p.anchorB ?? '#ff20a0'))
    const c = hexToRgb(String(p.anchorC ?? '#20ffd0'))
    const points = Number(p.points ?? 4)
    const position = String(p.position ?? 'sinusoidal')
    const ports = ['colorA', 'colorB', 'colorC'] as const
    if (!ports.some((port) => incoming.get(`${node.id}:${port}`))) {
      // Every anchor is a swatch, so the palette is known now: bake it.
      const stops = polineStops16([a, b, c], points, position)
      ln(`  CRGBPalette16 pal_${id}(${stops.map((s) => `CRGB(${s.r},${s.g},${s.b})`).join(', ')});`)
      return
    }
    // A wired anchor changes at run time, so the board builds the palette
    // each frame from the wires, the swatches standing in for unwired ones.
    if (!globalLines.includes(POLINE_HELPER_CPP)) globalLines.push(POLINE_HELPER_CPP)
    const anchor = (port: typeof ports[number], rgb: { r: number; g: number; b: number }) =>
      incoming.get(`${node.id}:${port}`) ? colorExpr(node.id, port) : `CRGB(${rgb.r},${rgb.g},${rgb.b})`
    ln(`  CRGBPalette16 pal_${id};`)
    ln(`  _polineStops16(pal_${id}, ${anchor('colorA', a)}, ${anchor('colorB', b)}, ${anchor('colorC', c)}, ${Math.floor(Number.isFinite(points) ? points : 4)}, ${polinePositionId(position)});`)
  },
  // Runs harmonyStops16 on the device so a wired hue keeps the palette live.
  // Each harmony hue is a band drawn through `_hsv`, the preview's own wheel;
  // where each stop sits between bands depends only on the harmony, so it is
  // baked as two tables (harmonyStopPlace). Shade's dip is emitted only while
  // it can be above 0.
  HarmonyPalette({ node, id, p, ln, f, incoming, needsHsv }) {
    needsHsv.v = true
    const offsets = HARMONY_OFFSETS[harmonyKind(p.harmony)]
    const places = Array.from({ length: 16 }, (_, i) => harmonyStopPlace(offsets.length, i))
    const usesShade = incoming.has(`${node.id}:shade`) || Number(p.shade ?? 0) > 0
    const float = (x: number) => `${Number.isInteger(x) ? x.toFixed(1) : String(Number(x.toPrecision(7)))}f`
    ln(`  CRGBPalette16 pal_${id};`)
    ln(`  { static const float _off[${offsets.length}] = {${offsets.map(float).join(', ')}};`)
    ln(`    static const uint8_t _hb[16] = {${places.map((place) => place.band).join(', ')}};`)
    ln(`    static const float _hm[16] = {${places.map((place) => float(place.mix)).join(', ')}};`)
    ln(`    float _hue = ${f('hue', 'hue', 200)}, _spread = constrain(${f('spread', 'spread', 1)}, 0.0f, 1.0f);`)
    ln(`    float _sat = constrain(${f('saturation', 'saturation', 1)}, 0.0f, 1.0f), _val = constrain(${f('value', 'value', 1)}, 0.0f, 1.0f);`)
    if (usesShade) ln(`    float _shade = constrain(${f('shade', 'shade', 0)}, 0.0f, 1.0f);`)
    ln(`    CRGB _band[${offsets.length}];`)
    ln(`    for (int _j = 0; _j < ${offsets.length}; _j++) _band[_j] = _hsv(_hue + _off[_j] * _spread, _sat, _val);`)
    ln(`    for (int _i = 0; _i < 16; _i++) {`)
    ln(`      CRGB _a = _band[_hb[_i]], _b = _band[_hb[_i] + 1]; float _m = _hm[_i], _d = ${usesShade ? '1.0f - _shade * (1.0f - fabsf(2.0f * _m - 1.0f))' : '1.0f'};`)
    ln(`      pal_${id}[_i] = CRGB((uint8_t)floorf((_a.r + (_b.r - _a.r) * _m) * _d + 0.5f), (uint8_t)floorf((_a.g + (_b.g - _a.g) * _m) * _d + 0.5f), (uint8_t)floorf((_a.b + (_b.b - _a.b) * _m) * _d + 0.5f)); } }`)
  },
  PaletteBank({ node, id, p, ln, v, f, boolExpr, fastledPalette, incoming, nodeMap }) {
    // Only the presets the author ticked are named here, so `usedPalettes`
    // records exactly those and `customPaletteDeclarationsCpp` declares
    // exactly those — the bank costs 48 bytes of RAM per palette it holds
    // rather than one for every palette in the catalogue.
    const entries = paletteBankEntries(p)
    const refs = entries.map((entry) => fastledPalette(entry))
    if (refs.length === 0) {
      // Nothing ticked: still produce a palette, because everything
      // downstream reads one. `findPaletteBankIssues` is what says so.
      ln(`  CRGBPalette16 pal_${id} = ${fastledPalette(PALETTE_BANK_FALLBACK)};`)
      ln(`  const char* ${v('name')} = ${cppStringLiteral(paletteBankLabel(PALETTE_BANK_FALLBACK))};`)
      ln(`  float ${v('index')} = 0.0f;`)
      return
    }
    const edge = normalizeButtonEdgeSettings(p)
    // A computed source's one-frame pulse is taken whole; only a contact is
    // debounced (state/player/pressSource.ts), as in the preview.
    const debounce = (port: string) => {
      const wire = incoming.get(`${node.id}:${port}`)
      return pressEdgeSettings(edge, wire ? nodeMap.get(wire.srcId)?.data.nodeType : undefined).debounceMs
    }
    const count = refs.length
    ln(`  static const CRGBPalette16* const _pbPal_${id}[] = {${refs.map((ref) => `&${ref}`).join(', ')}};`)
    ln(`  static const char* const _pbName_${id}[] = {${entries.map((entry) => cppStringLiteral(paletteBankLabel(entry))).join(', ')}};`)
    ln(`  static uint8_t _pbIdx_${id} = 0;`)
    // Index selects directly on a change (and on the first pass, so a set
    // Index is where the bank starts), as the preview's paletteBankChoice
    // does; at rest on 0 it changes nothing, so nothing is emitted for it.
    if (incoming.has(`${node.id}:select`) || paletteBankChoice(Number(p.select ?? 0)) !== 0) {
      ln(`  { static long _pbSel_${id} = 0; static bool _pbSelI_${id} = false; long _s = 0; ${paletteBankChoiceCpp(f('select', 'select', 0))}`)
      ln(`    if (!_pbSelI_${id} || _s != _pbSel_${id}) { _pbSel_${id} = _s; _pbSelI_${id} = true; long _m = _s % ${count}; _pbIdx_${id} = (uint8_t)(_m < 0 ? _m + ${count} : _m); } }`)
    }
    // Two buttons, one debounce rule, the numbers read from
    // state/player/transportBridge.ts so a press means here what it means in the
    // preview. Held together they cancel, as they do there.
    ln(`  { static bool _raw[2] = {false, false}, _stable[2] = {false, false};`)
    ln(`    static uint32_t _changed[2] = {0, 0}, _repeatAt[2] = {0, 0};`)
    ln(`    const bool _in[2] = {${boolExpr(node.id, 'next')}, ${boolExpr(node.id, 'previous')}};`)
    ln(`    const uint32_t _debounce[2] = {${debounce('next')}u, ${debounce('previous')}u};`)
    ln(`    uint32_t _now = millis(); int _delta = 0;`)
    ln(`    for (int _i = 0; _i < 2; _i++) { bool _fired = false;`)
    ln(`      if (_in[_i] != _raw[_i]) { _raw[_i] = _in[_i]; _changed[_i] = _now; }`)
    ln(`      if (_stable[_i] != _raw[_i] && _now - _changed[_i] >= _debounce[_i]) {`)
    ln(`        _stable[_i] = _raw[_i];`)
    ln(`        if (_stable[_i]) { _repeatAt[_i] = _now + ${edge.repeatDelayMs}; _fired = true; } }`)
    ln(`      else if (_stable[_i] && (int32_t)(_now - _repeatAt[_i]) >= 0) {`)
    ln(`        _repeatAt[_i] += ${edge.repeatIntervalMs}; _fired = true; }`)
    ln(`      if (_fired) _delta += (_i == 0) ? 1 : -1; }`)
    ln(`    if (_delta != 0) { int _n = ((int)_pbIdx_${id} + _delta) % ${count};`)
    ln(`      _pbIdx_${id} = (uint8_t)(_n < 0 ? _n + ${count} : _n); } }`)
    const blend = paletteBankBlend(p)
    if (blend === 0) {
      ln(`  CRGBPalette16 pal_${id} = *_pbPal_${id}[_pbIdx_${id}];`)
    } else {
      // A working palette eased toward the selection by FastLED's own
      // nblendPaletteTowardPalette on a 10 ms clock, as the preview's twin
      // in state/palettes/paletteBank.ts does; it starts settled on the first palette.
      ln(`  static CRGBPalette16 _pbCur_${id}; static uint32_t _pbT_${id} = 0; static bool _pbInit_${id} = false;`)
      ln(`  { CRGBPalette16 _target = *_pbPal_${id}[_pbIdx_${id}]; uint32_t _now = millis();`)
      ln(`    if (!_pbInit_${id}) { _pbCur_${id} = _target; _pbT_${id} = _now; _pbInit_${id} = true; }`)
      ln(`    uint32_t _ticks = (_now - _pbT_${id}) / ${PALETTE_BANK_BLEND_TICK_MS}u;`)
      ln(`    if (_ticks > ${PALETTE_BANK_BLEND_MAX_TICKS}u) { _ticks = ${PALETTE_BANK_BLEND_MAX_TICKS}u; _pbT_${id} = _now; } else _pbT_${id} += _ticks * ${PALETTE_BANK_BLEND_TICK_MS}u;`)
      ln(`    while (_ticks--) nblendPaletteTowardPalette(_pbCur_${id}, _target, ${blend}); }`)
      ln(`  CRGBPalette16 pal_${id} = _pbCur_${id};`)
    }
    ln(`  const char* ${v('name')} = _pbName_${id}[_pbIdx_${id}];`)
    ln(`  float ${v('index')} = (float)_pbIdx_${id};`)
  },
  // Keep in lockstep with the `PaletteTransform` evaluator: entry by entry
  // at rest (an index lookup smears entry 15 round to 0 — see PaletteBlend),
  // a wrapping ColorFromPalette once Offset rotates it, the black point
  // (paletteBlackPoint.ts), then nscale8. The source is the node's own preset
  // until a palette is wired in.
  PaletteTransform({ node, id, p, ln, f, paletteExpr, incoming }) {
    const src = paletteExpr(node.id, 'paletteIn', { palette: p.paletteIn ?? 'rainbow' })
    const reverse = Boolean(p.reverse)
    // A floor of 0 changes nothing, so it costs nothing until it can move.
    const usesBlackPoint = incoming.has(`${node.id}:blackPoint`) || Number(p.blackPoint ?? 0) > 0
    ln(`  CRGBPalette16 pal_${id};`)
    ln(`  { float _off=fmodf(${f('offset', 'offset', 0)},1.0f); if(_off<0.0f)_off+=1.0f; uint8_t _br=(uint8_t)(constrain(${f('brightness', 'brightness', 1)},0.0f,1.0f)*255.0f);`)
    if (usesBlackPoint) {
      ln(`    const uint8_t _bp=${blackPointByteCpp(f('blackPoint', 'blackPoint', 0))}; ${BLACK_POINT_LAMBDA_CPP}`)
    }
    ln(`    for(int _i=0;_i<16;_i++){ int _k=${reverse ? '15-_i' : '_i'}; CRGB _c=_off>0.0f?ColorFromPalette(${src},(uint8_t)(fmodf(_k/15.0f+_off,1.0f)*255.0f),255,LINEARBLEND):${src}[_k];`)
    if (usesBlackPoint) ln(`      _c=CRGB(_lv(_c.r),_lv(_c.g),_lv(_c.b));`)
    ln(`      _c.nscale8(_br); pal_${id}[_i]=_c; } }`)
  },
  PaletteBlend({ node, id, p, ln, f, paletteExpr }) {
    // Build a CRGBPalette16 by blending both palettes entry-by-entry. Every
    // palette a port resolves to is itself a CRGBPalette16, so entry i is read
    // directly — the i/15 sample the evaluator takes. Looking it up through
    // ColorFromPalette at i*17 instead smeared each entry into the next and
    // wrapped entry 15 (index 255) back round to entry 0.
    const a = paletteExpr(node.id, 'paletteA', { palette: p.paletteA })
    const b = paletteExpr(node.id, 'paletteB', { palette: p.paletteB })
    const amt = f('amount', 'amount', 0.5)
    ln(`  CRGBPalette16 pal_${id};`)
    // Clamped like the evaluator's `Math.max(0, Math.min(1, ...))` and the
    // 0-1 slider the knob draws: unwired it can only be in range, but a
    // wire is free to hand over anything, and an unclamped 1.5 wraps
    // through this uint8_t cast to a blend nobody asked for.
    ln(`  { uint8_t _amt = (uint8_t)(constrain(${amt}, 0.0f, 1.0f) * 255.0f);`)
    ln(`    for (int _i = 0; _i < 16; _i++) pal_${id}[_i] = blend(${a}[_i], ${b}[_i], _amt); }`)
  },
}
