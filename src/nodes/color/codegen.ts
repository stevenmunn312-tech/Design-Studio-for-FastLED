import { asAnimatedImage, asImage } from '../../state/image'
import { imagePaletteStops16 } from '../../state/imagePalette'
import { hexToRgb, polineStops16 } from '../../state/polinePalette'
import { normalizeButtonEdgeSettings } from '../../state/transportBridge'
import { paletteBankEntries, PALETTE_BANK_FALLBACK, paletteBankLabel } from '../../state/paletteBank'
import { normalizeCustomPalette, customPaletteStops16, hexToRgb as customHexToRgb } from '../../state/customPalette'
import type { NodeEmitters } from '../../codegen/emitContext'
import { cppStringLiteral } from '../../codegen/cppLiterals'

export const COLOR_EMITTERS: NodeEmitters = {
  HueCycle({ ln, v, f, needsT }) {
    needsT.v = true
    const rate = f('rate', 'rate', 0.1), s = f('s', 's', 1), val = f('v', 'v', 1)
    ln(`  CRGB ${v('color')};`)
    ln(`  { float _huePhase = fmodf(fmodf(t * (${rate}), 1.0f) + 1.0f, 1.0f); ${v('color')} = CHSV((uint8_t)(_huePhase * 256.0f), (uint8_t)((${s}) * 255.0f), (uint8_t)((${val}) * 255.0f)); }`)
  },
  HSVToRGB({ ln, v, f }) {
    ln(`  CRGB ${v('color')} = CHSV((uint8_t)((${f('h', 'h', 0)}) / 360.0f * 255), (uint8_t)((${f('s', 's', 1)}) * 255), (uint8_t)((${f('v', 'v', 1)}) * 255));`)
  },
  // The inverse of HSVToRGB — via FastLED's rgb2hsv_approximate.
  RGBToHSV({ id, ln, v, channelColor }) {
    const rgb = channelColor('rgb', 0, 0, 0)
    ln(`  CHSV _hsv_${id} = rgb2hsv_approximate(${rgb});`)
    ln(`  float ${v('h')} = _hsv_${id}.hue / 255.0f * 360.0f;`)
    ln(`  float ${v('s')} = _hsv_${id}.sat / 255.0f;`)
    ln(`  float ${v('v')} = _hsv_${id}.val / 255.0f;`)
  },
  Temperature({ ln, v, f, needsMapFloat, needsKelvin }) {
    needsKelvin.v = true
    needsMapFloat[0] = true
    ln(`  CRGB ${v('color')} = kelvinToRGB(mapFloat(constrain(${f('kelvin', 'kelvin', 0.27)}, 0.0f, 1.0f), 0.0f, 1.0f, 1000.0f, 12000.0f));`)
  },
  HeatColor({ ln, v, f }) {
    ln(`  CRGB ${v('color')} = HeatColor((uint8_t)(constrain(${f('heat', 'heat', 0.5)}, 0.0f, 1.0f) * 255));`)
  },
  BlendColors({ ln, v, f, channelColor }) {
    const ca = channelColor('a', 255, 0, 0, ['rA', 'gA', 'bA'])
    const cb = channelColor('b', 0, 0, 255, ['rB', 'gB', 'bB'])
    const mix = f('t', 't', 0.5)
    ln(`  CRGB ${v('color')} = blend(${ca}, ${cb}, (uint8_t)((${mix}) * 255));`)
  },
  GradientSampler({ id, ln, v, f, channelColor, gradientChannel }) {
    const tt = `(${f('t', 't', 0)})`
    const cA = `_gsA_${id}`, cB = `_gsB_${id}`
    ln(`  CRGB ${cA}=${channelColor('colorA', 0, 200, 255, ['rA', 'gA', 'bA'])},${cB}=${channelColor('colorB', 255, 0, 255, ['rB', 'gB', 'bB'])};`)
    ln(`  CRGB ${v('color')} = CRGB(${gradientChannel(cA, cB, 'r', tt)},${gradientChannel(cA, cB, 'g', tt)},${gradientChannel(cA, cB, 'b', tt)});`)
  },
  PaletteSampler({ node, p, ln, v, f, paletteExpr }) {
    const tt = f('t', 't', 0), pal = paletteExpr(node.id, 'paletteIn', p)
    ln(`  CRGB ${v('color')} = ColorFromPalette(${pal}, (uint8_t)((${tt})*255));`)
  },
  PaletteSweep({ node, id, p, ln, v, f, paletteExpr, needsT }) {
    needsT.v = true
    const rate = f('rate', 'rate', 0.1)
    const pal = paletteExpr(node.id, 'paletteIn', p)
    const easing = String(p.easing ?? 'sine')
    ln(`  float _psPhase_${id} = fmodf(fmodf(t * fmaxf(0.0f, (${rate})), 1.0f) + 1.0f, 1.0f);`)
    ln(`  float _psPos_${id} = _psPhase_${id} < 0.5f ? _psPhase_${id} * 2.0f : (1.0f - _psPhase_${id}) * 2.0f;`)
    if (easing === 'quad') {
      ln(`  _psPos_${id} = _psPos_${id} < 0.5f ? 2.0f * _psPos_${id} * _psPos_${id} : 1.0f - powf(-2.0f * _psPos_${id} + 2.0f, 2.0f) / 2.0f;`)
    } else if (easing === 'cubic') {
      ln(`  _psPos_${id} = _psPos_${id} < 0.5f ? 4.0f * _psPos_${id} * _psPos_${id} * _psPos_${id} : 1.0f - powf(-2.0f * _psPos_${id} + 2.0f, 3.0f) / 2.0f;`)
    } else if (easing !== 'linear') {
      ln(`  _psPos_${id} = (1.0f - cosf(3.14159265f * _psPos_${id})) * 0.5f;`)
    }
    ln(`  CRGB ${v('color')} = ColorFromPalette(${pal}, (uint8_t)(_psPos_${id} * 255.0f));`)
  },
  CHSV({ ln, v, f }) {
    const hue = f('hue', 'hue', 128), sat = f('sat', 'sat', 255), val = f('val', 'val', 255)
    ln(`  CRGB ${v('rgb')} = CHSV((uint8_t)(${hue}), (uint8_t)(${sat}), (uint8_t)(${val}));`)
  },
  PaletteSelector({ p, ln, fastledPalette }) {
    ln(`  // PaletteSelector — drives ${fastledPalette(String(p.palette ?? 'rainbow'))} in connected palette-consuming nodes`)
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
  Poline({ node, id, p, ln, incoming }) {
    // Bake the poline palette (computed from the configured anchor hex
    // props) into a CRGBPalette16. Live-wired anchors drive only the
    // preview; firmware uses the configured anchors.
    const a = hexToRgb(String(p.anchorA ?? '#1020ff'))
    const b = hexToRgb(String(p.anchorB ?? '#ff20a0'))
    const c = hexToRgb(String(p.anchorC ?? '#20ffd0'))
    const stops = polineStops16([a, b, c], Number(p.points ?? 4), String(p.position ?? 'sinusoidal'))
    const cppStops = stops.map((s) => `CRGB(${s.r},${s.g},${s.b})`).join(', ')
    if (incoming.get(`${node.id}:colorA`) || incoming.get(`${node.id}:colorB`) || incoming.get(`${node.id}:colorC`)) {
      ln(`  // Poline: wired anchors drive the live preview; firmware bakes the configured anchors.`)
    }
    ln(`  CRGBPalette16 pal_${id}(${cppStops});`)
  },
  PaletteBank({ node, id, p, ln, v, boolExpr, fastledPalette }) {
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
    const count = refs.length
    ln(`  static const CRGBPalette16* const _pbPal_${id}[] = {${refs.map((ref) => `&${ref}`).join(', ')}};`)
    ln(`  static const char* const _pbName_${id}[] = {${entries.map((entry) => cppStringLiteral(paletteBankLabel(entry))).join(', ')}};`)
    ln(`  static uint8_t _pbIdx_${id} = 0;`)
    // Two buttons, one debounce rule, the numbers read from
    // state/transportBridge.ts so a press means here what it means in the
    // preview. Held together they cancel, as they do there.
    ln(`  { static bool _raw[2] = {false, false}, _stable[2] = {false, false};`)
    ln(`    static uint32_t _changed[2] = {0, 0}, _repeatAt[2] = {0, 0};`)
    ln(`    const bool _in[2] = {${boolExpr(node.id, 'next')}, ${boolExpr(node.id, 'previous')}};`)
    ln(`    uint32_t _now = millis(); int _delta = 0;`)
    ln(`    for (int _i = 0; _i < 2; _i++) { bool _fired = false;`)
    ln(`      if (_in[_i] != _raw[_i]) { _raw[_i] = _in[_i]; _changed[_i] = _now; }`)
    ln(`      if (_stable[_i] != _raw[_i] && _now - _changed[_i] >= ${edge.debounceMs}) {`)
    ln(`        _stable[_i] = _raw[_i];`)
    ln(`        if (_stable[_i]) { _repeatAt[_i] = _now + ${edge.repeatDelayMs}; _fired = true; } }`)
    ln(`      else if (_stable[_i] && (int32_t)(_now - _repeatAt[_i]) >= 0) {`)
    ln(`        _repeatAt[_i] += ${edge.repeatIntervalMs}; _fired = true; }`)
    ln(`      if (_fired) _delta += (_i == 0) ? 1 : -1; }`)
    ln(`    if (_delta != 0) { int _n = ((int)_pbIdx_${id} + _delta) % ${count};`)
    ln(`      _pbIdx_${id} = (uint8_t)(_n < 0 ? _n + ${count} : _n); } }`)
    ln(`  CRGBPalette16 pal_${id} = *_pbPal_${id}[_pbIdx_${id}];`)
    ln(`  const char* ${v('name')} = _pbName_${id}[_pbIdx_${id}];`)
    ln(`  float ${v('index')} = (float)_pbIdx_${id};`)
  },
  PaletteBlend({ node, id, p, ln, f, paletteExpr }) {
    // Build a CRGBPalette16 by blending both palettes entry-by-entry.
    const a = paletteExpr(node.id, 'paletteA', { palette: p.paletteA })
    const b = paletteExpr(node.id, 'paletteB', { palette: p.paletteB })
    const amt = f('amount', 'amount', 0.5)
    ln(`  CRGBPalette16 pal_${id};`)
    // Clamped like the evaluator's `Math.max(0, Math.min(1, ...))` and the
    // 0-1 slider the knob draws: unwired it can only be in range, but a
    // wire is free to hand over anything, and an unclamped 1.5 wraps
    // through this uint8_t cast to a blend nobody asked for.
    ln(`  { uint8_t _amt = (uint8_t)(constrain(${amt}, 0.0f, 1.0f) * 255.0f); for (int _i = 0; _i < 16; _i++) { uint8_t _p = (uint8_t)(_i * 255 / 15);`)
    ln(`    pal_${id}[_i] = blend(ColorFromPalette(${a}, _p), ColorFromPalette(${b}, _p), _amt); } }`)
  },
}
