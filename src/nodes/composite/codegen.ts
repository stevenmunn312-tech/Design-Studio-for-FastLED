import type { NodeEmitters } from '../../codegen/emitContext'
import { floatLit, seedProp } from '../../codegen/cppLiterals'
import { wallpaperGroupIndex, WALLPAPER_GROUPS } from '../../state/evaluator/symmetry'
import { GLITTER_PER_LED, glitterMode } from './glitter'
import { FRAME_OFFSET, frameQuarterTurns } from './frameTransform'
import { phaseTag, speedPhaseCpp } from '../shared/speedClockCpp'
import {
  ARRAY_OVER_CPP, ARRAY_SOURCE_CPP, KALEIDO_SOURCE_CPP, arrayCopyCpp, blendMix8Cpp, feedbackFrameCpp, feedbackSourceCpp,
  sampleFrameQ8Cpp, wallpaperFrameCpp,
} from '../shared/integerPatterns'
import { KALEIDOSCOPE_SEGMENTS } from './kaleidoscope'

export const COMPOSITE_EMITTERS: NodeEmitters = {
  BrightnessMod({ ln, f, ownBuf, seedFrom }) {
    const ob = ownBuf()
    const br = f('brightness', 'brightness', 1)
    ln(`  { ${seedFrom('frame')} float _br = fmaxf(0.0f, ${br}); for (int _i = 0; _i < NUM_LEDS; _i++) ${ob}[_i] = CRGB((uint8_t)fminf(255.0f, ${ob}[_i].r * _br), (uint8_t)fminf(255.0f, ${ob}[_i].g * _br), (uint8_t)fminf(255.0f, ${ob}[_i].b * _br)); }`)
  },
  // Manual A/B frame selector; copies the wired side when the other is
  // empty (matching the evaluator's fallback).
  FrameSwitch({ node, ln, ownBuf, srcBuf, boolExpr }) {
    const ob = ownBuf()
    const a = srcBuf('a'), b = srcBuf('b'), sel = boolExpr(node.id, 'sel')
    if (a && b) ln(`  ::memmove(${ob}, (${sel}) ? ${b} : ${a}, sizeof(CRGB) * NUM_LEDS);`)
    else if (a || b) ln(`  ::memmove(${ob}, ${a ?? b}, sizeof(CRGB) * NUM_LEDS);`)
    else ln(`  fill_solid(${ob}, NUM_LEDS, CRGB::Black);`)
  },
  // Named rectangular zones — mirrors the evaluator's Zones case: seed
  // from base (or black), then for each enabled+wired zone, copy its own
  // buffer into this node's buffer only within that zone's rectangle.
  Zones({ p, ln, ownBuf, srcBuf }) {
    const ob = ownBuf()
    const base = srcBuf('base')
    ln(base ? `  ::memmove(${ob}, ${base}, sizeof(CRGB) * NUM_LEDS);` : `  fill_solid(${ob}, NUM_LEDS, CRGB::Black);`)
    for (const key of ['a', 'b', 'c', 'd'] as const) {
      if (p[`${key}Enabled`] === false) continue
      const zbuf = srcBuf(key)
      if (!zbuf) continue
      const zx = Math.max(0, Math.min(1, Number(p[`${key}X`] ?? 0)))
      const zy = Math.max(0, Math.min(1, Number(p[`${key}Y`] ?? 0)))
      const zw = Math.max(0, Math.min(1, Number(p[`${key}W`] ?? 1)))
      const zh = Math.max(0, Math.min(1, Number(p[`${key}H`] ?? 1)))
      ln(`  for (int _y=(int)(${floatLit(zy)}*HEIGHT); _y<(int)(${floatLit(zy + zh)}*HEIGHT) && _y<HEIGHT; _y++)`)
      ln(`    for (int _x=(int)(${floatLit(zx)}*WIDTH); _x<(int)(${floatLit(zx + zw)}*WIDTH) && _x<WIDTH; _x++)`)
      ln(`      ${ob}[_y*WIDTH+_x] = ${zbuf}[_y*WIDTH+_x];`)
    }
  },
  // Feedback/trails buffer — the persistent buf_ own buffer is deliberately
  // not seeded from the input each frame (see the Code node comment above);
  // it fades in place, then re-lightens per-channel wherever the input is
  // brighter. Mirrors the evaluator's Trails case.
  Trails({ ln, f, ownBuf, srcBuf }) {
    const src = srcBuf('frame')
    if (!src) { ln(`  fill_solid(${ownBuf()}, NUM_LEDS, CRGB::Black);`); return }
    const ob = ownBuf({ persists: true })
    const decay = f('decay', 'decay', 0.15)
    ln(`  { // Trails: fadeToBlackBy(decay^3) then re-lighten from the input (per-channel max)`)
    ln(`    float _decay = constrain(${decay},0.0f,1.0f); _decay = _decay*_decay*_decay;`)
    ln(`    fadeToBlackBy(${ob}, NUM_LEDS, (uint8_t)(_decay*255.0f));`)
    ln(`    for(int _i=0;_i<NUM_LEDS;_i++){`)
    ln(`      if(${src}[_i].r>${ob}[_i].r)${ob}[_i].r=${src}[_i].r;`)
    ln(`      if(${src}[_i].g>${ob}[_i].g)${ob}[_i].g=${src}[_i].g;`)
    ln(`      if(${src}[_i].b>${ob}[_i].b)${ob}[_i].b=${src}[_i].b;}`)
    ln(`  }`)
  },
  FrameWarp({ p, ln, f, ownBuf, srcBuf, srcField, needsFrameSample }) {
    const ob = ownBuf()
    const src = srcBuf('frame')
    if (!src) { ln(`  fill_solid(${ob}, NUM_LEDS, CRGB::Black); // FrameWarp: no input`); return }
    needsFrameSample.v = true
    const dx = srcField('dx'), dy = srcField('dy')
    const edgeMode = p.edgeMode === 'wrap' ? 1 : p.edgeMode === 'black' ? 2 : 0
    const bilinear = p.sampling !== 'nearest'
    ln(`  { /* FrameWarp: ${String(p.edgeMode ?? 'clamp')}, ${bilinear ? 'bilinear' : 'nearest'} */`)
    ln(`    float _fw_st=constrain(${f('strength', 'strength', 2)},0.0f,8.0f);`)
    ln(`    float _fw_z=constrain(${f('zoom', 'zoom', 1)},0.25f,4.0f);`)
    ln(`    float _fw_a=constrain(${f('rotate', 'rotate', 0)},-180.0f,180.0f)*0.01745329252f;`)
    ln(`    float _fw_co=cosf(_fw_a),_fw_si=sinf(_fw_a),_fw_cx=(WIDTH-1)*0.5f,_fw_cy=(HEIGHT-1)*0.5f;`)
    ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){ int _i=_y*WIDTH+_x;`)
    ln(`      float _px=(_x-_fw_cx)/_fw_z,_py=(_y-_fw_cy)/_fw_z;`)
    ln(`      float _sx=_fw_cx+_px*_fw_co+_py*_fw_si+(2.0f*${dx ? `${dx}[_i]` : '0.5f'}-1.0f)*_fw_st;`)
    ln(`      float _sy=_fw_cy-_px*_fw_si+_py*_fw_co+(2.0f*${dy ? `${dy}[_i]` : '0.5f'}-1.0f)*_fw_st;`)
    ln(`      ${ob}[_i]=_sampleFrame(${src},_sx,_sy,${edgeMode},${bilinear ? 'true' : 'false'});`)
    ln(`    } }`)
  },
  Symmetry({ id, p, ln, f, ownBuf, srcBuf, needsT, needsSymmetry, needsAtan16 }) {
    needsT.v = true
    needsSymmetry.v = true
    needsAtan16.v = true
    const ob = ownBuf()
    const src = srcBuf('frame')
    if (!src) { ln(`  fill_solid(${ob}, NUM_LEDS, CRGB::Black); // Symmetry: no input`); return }
    const group = wallpaperGroupIndex(p.group ?? 'p4m')
    const groupName = WALLPAPER_GROUPS[group]
    ln(`  { /* Symmetry: ${groupName} */`)
    ln(`    float _spin=constrain(${f('spin', 'spin', 0)},-360.0f,360.0f);`)
    const ph = speedPhaseCpp(ln, phaseTag(id), '_spin')
    // Integer kernel (shared/integerPatterns.ts): the floats run once a frame.
    for (const line of wallpaperFrameCpp(f('cells', 'cells', 2), f('rotation', 'rotation', 0), ph, f('offsetX', 'offsetX', 0), f('offsetY', 'offsetY', 0))) ln(`    ${line}`)
    ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
    ln(`      int32_t _sx,_sy; _wallpaperSourceQ8(_x,_y,${group},_wpK,_wpCo,_wpSi,_wpOx,_wpOy,_sx,_sy);`)
    for (const line of sampleFrameQ8Cpp(src)) ln(`      ${line}`)
    ln(`      ${ob}[_y*WIDTH+_x]=_wpC; } }`)
  },
  FrameFeedback({ id, p, ln, f, ownBuf, srcBuf, feedbackHistoryBufs }) {
    const ob = ownBuf()
    const src = srcBuf('frame')
    if (!src) { ln(`  fill_solid(${ob}, NUM_LEDS, CRGB::Black);`); return }
    const delay = Math.max(1, Math.min(32, Math.round(Number(p.delayFrames ?? 2))))
    const capacity = delay + 1
    feedbackHistoryBufs.set(id, capacity)
    const hist = `_fb_${id}`
    const fade = f('fade', 'fade', 0.08)
    const amount = f('amount', 'amount', 0.5)
    const offX = f('offsetX', 'offsetX', 0)
    const offY = f('offsetY', 'offsetY', 0)
    const angle = f('angle', 'angle', 0)
    const scale = f('scale', 'scale', 1)
    const mode = String(p.blendMode ?? 'screen')
    const transformMode = String(p.feedbackTransform ?? 'none')
    ln(`  { // FrameFeedback: ${delay}-frame recursive ring buffer`)
    ln(`    static uint8_t _fb_idx_${id}=0;`)
    ln(`    const uint8_t _fb_cap_${id}=${capacity};`)
    ln(`    uint8_t _fb_read_${id}=(_fb_idx_${id}+_fb_cap_${id}-${delay})%_fb_cap_${id};`)
    ln(`    float _fb_fade_${id}=1.0f-constrain(${fade},0.0f,1.0f);`)
    ln(`    float _fb_amt_${id}=constrain(${amount},0.0f,1.0f);`)
    // Integer kernel (shared/integerPatterns.ts): source lookup and blend in bytes.
    ln(`    uint8_t _fbF8=(uint8_t)(_fb_fade_${id}*255.0f),_fbA8=(uint8_t)(_fb_amt_${id}*255.0f);`)
    if (transformMode !== 'none') {
      for (const line of feedbackFrameCpp(id, offX, offY, angle, scale)) ln(`    ${line}`)
    }
    ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
    for (const line of feedbackSourceCpp(transformMode)) ln(`      ${line}`)
    ln(`      CRGB _fb=_fbSrc<0?CRGB(CRGB::Black):${hist}[_fb_read_${id}][_fbSrc];`)
    ln(`      _fb.nscale8(_fbF8);`)
    ln(`      CRGB _a=${src}[_y*WIDTH+_x];`)
    if (mode === 'normal') {
      ln(`      CRGB _r=_a; nblend(_r,_fb,_fbA8); ${ob}[_y*WIDTH+_x]=_r;`)
    } else {
      const blendMode = ['multiply', 'screen', 'add', 'difference', 'lighten'].includes(mode) ? mode : 'screen'
      const mix = (c: string) => blendMix8Cpp(blendMode, `_a.${c}`, `_fb.${c}`, '_fbA8')
      ln(`      ${ob}[_y*WIDTH+_x]=CRGB(${mix('r')},${mix('g')},${mix('b')});`)
    }
    ln(`    }`)
    ln(`    ::memmove(${hist}[_fb_idx_${id}], ${ob}, sizeof(CRGB) * NUM_LEDS);`)
    ln(`    _fb_idx_${id}=(_fb_idx_${id}+1)%_fb_cap_${id};`)
    ln(`  }`)
  },
  // Keep in lockstep with the `Glitter` evaluator: the same per-LED budget
  // (fraction as a chance of one more), add or replace, Confetti's seeded LCG.
  Glitter({ id, p, ln, f, channelColor, ownBuf, seedFrom }) {
    const ob = ownBuf()
    const seed = seedProp(p)
    const rnd8 = seed ? `_rnd8_${id}()` : 'random8()'
    const rnd16 = seed ? `(((uint16_t)_rnd8_${id}()<<8)|_rnd8_${id}())` : 'random16()'
    const replace = glitterMode(p.glitterMode) === 'replace'
    ln(`  { ${seedFrom('frame')} // Glitter`)
    if (seed) ln(`    static uint32_t _rng_${id}=${seed}u; auto _rnd8_${id}=[&](){ _rng_${id}=_rng_${id}*1664525u+1013904223u; return (uint8_t)(_rng_${id}>>24); };`)
    ln(`    float _bud=constrain(${f('density', 'density', 0.3)},0.0f,1.0f)*NUM_LEDS*${floatLit(GLITTER_PER_LED, 6)};`)
    ln(`    int _cnt=(int)_bud; if(${rnd8}<(uint8_t)((_bud-_cnt)*255.0f)) _cnt++;`)
    ln(`    CRGB _gc=${channelColor('color', 255, 255, 255)};`)
    ln(`    for(int _s=0;_s<_cnt;_s++){ int _i=${rnd16}%NUM_LEDS; ${replace ? `${ob}[_i]=_gc;` : `${ob}[_i]+=_gc;`} } }`)
  },
  // Keep in lockstep with the `FrameTransform` evaluator: undo the slide,
  // the flips, then the quarter turns, on normalised coordinates.
  FrameTransform({ p, ln, f, ownBuf, srcBuf }) {
    const ob = ownBuf()
    const src = srcBuf('frame')
    if (!src) { ln(`  fill_solid(${ob}, NUM_LEDS, CRGB::Black); // Frame Transform: no input`); return }
    const turns = frameQuarterTurns(p.rotate)
    const flipX = Boolean(p.flipX), flipY = Boolean(p.flipY)
    ln(`  { // Frame Transform`)
    ln(`    int _ox=(int)constrain(roundf(${f('offsetX', 'offsetX', 0)}),${FRAME_OFFSET.min}.0f,${FRAME_OFFSET.max}.0f),_oy=(int)constrain(roundf(${f('offsetY', 'offsetY', 0)}),${FRAME_OFFSET.min}.0f,${FRAME_OFFSET.max}.0f);`)
    ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
    ln(`      int _px=(((_x-_ox)%WIDTH)+WIDTH)%WIDTH,_py=(((_y-_oy)%HEIGHT)+HEIGHT)%HEIGHT;`)
    ln(`      float _u=WIDTH>1?(float)_px/(WIDTH-1):0.0f,_v=HEIGHT>1?(float)_py/(HEIGHT-1):0.0f;`)
    if (flipX) ln(`      _u=1.0f-_u;`)
    if (flipY) ln(`      _v=1.0f-_v;`)
    for (let k = 0; k < turns; k++) ln(`      { float _nu=_v; _v=1.0f-_u; _u=_nu; }`)
    ln(`      int _sx=(int)floorf(_u*(WIDTH-1)+0.5f),_sy=(int)floorf(_v*(HEIGHT-1)+0.5f);`)
    ln(`      ${ob}[_y*WIDTH+_x]=${src}[_sy*WIDTH+_sx]; } }`)
  },
  Mask({ ln, ownBuf, srcBuf, seedFrom }) {
    const ob = ownBuf()
    const mask = srcBuf('mask')
    ln(`  { ${seedFrom('frame')}`)
    if (mask) ln(`    for (int _i = 0; _i < NUM_LEDS; _i++) ${ob}[_i].nscale8((${mask}[_i].r + ${mask}[_i].g + ${mask}[_i].b) / 3);`)
    ln(`  }`)
  },
  HueShift({ ln, f, ownBuf, seedFrom }) {
    const ob = ownBuf()
    const shift = f('shift', 'shift', 0)
    ln(`  { ${seedFrom('frame')} uint8_t _sh = (uint8_t)((${shift}) * 255); for (int _i = 0; _i < NUM_LEDS; _i++) ${ob}[_i] = CHSV(rgb2hsv_approximate(${ob}[_i]).hue + _sh, rgb2hsv_approximate(${ob}[_i]).sat, rgb2hsv_approximate(${ob}[_i]).val); }`)
  },
  // RGB→HSV (rgb2hsv_approximate)→scale saturation→CHSV back to RGB.
  Saturation({ ln, f, ownBuf, seedFrom }) {
    const ob = ownBuf()
    const amount = f('amount', 'amount', 1)
    ln(`  { ${seedFrom('frame')} for (int _i = 0; _i < NUM_LEDS; _i++) {`)
    ln(`      CHSV _hs = rgb2hsv_approximate(${ob}[_i]);`)
    ln(`      uint8_t _s2 = (uint8_t)constrain((float)_hs.sat * (${amount}), 0.0f, 255.0f);`)
    ln(`      ${ob}[_i] = CHSV(_hs.hue, _s2, _hs.val); } }`)
  },
  ColorBoost({ ln, f, ownBuf, seedFrom }) {
    const ob = ownBuf()
    const boost = f('boost', 'boost', 0.5)
    ln(`  { ${seedFrom('frame')} float _cb = constrain(${boost}, 0.0f, 1.0f); float _cs = 1.0f + _cb * 1.5f; for (int _i = 0; _i < NUM_LEDS; _i++) {`)
    ln(`      float _l = ${ob}[_i].r * 0.2126f + ${ob}[_i].g * 0.7152f + ${ob}[_i].b * 0.0722f;`)
    ln(`      ${ob}[_i].r = (uint8_t)constrain(_l + (${ob}[_i].r - _l) * _cs, 0.0f, 255.0f);`)
    ln(`      ${ob}[_i].g = (uint8_t)constrain(_l + (${ob}[_i].g - _l) * _cs, 0.0f, 255.0f);`)
    ln(`      ${ob}[_i].b = (uint8_t)constrain(_l + (${ob}[_i].b - _l) * _cs, 0.0f, 255.0f);`)
    ln(`    } }`)
  },
  Gamma({ ln, f, ownBuf, seedFrom }) {
    const ob = ownBuf()
    const g = f('gamma', 'gamma', 2.2)
    ln(`  { ${seedFrom('frame')} napplyGamma_video(${ob}, NUM_LEDS, max(0.1f, ${g})); }`)
  },
  Transform({ id, p, ln, f, ownBuf, srcBuf, needsT }) {
    needsT.v = true
    const ob = ownBuf()
    const src = srcBuf('frame')
    if (!src) { ln(`  fill_solid(${ob}, NUM_LEDS, CRGB::Black); // Transform: no input`); return }
    const mode = String(p.transform ?? 'rotate')
    const rate = f('rate', 'rate', 90)
    const angle = f('angle', 'angle', 0)
    ln(`  { float _cx=(WIDTH-1)/2.0f,_cy=(HEIGHT-1)/2.0f,_rate=${rate};`)
    const ph = speedPhaseCpp(ln, phaseTag(id), '_rate')
    if (mode === 'translate') {
      ln(`    float _a=${angle}*0.01745329f,_dx=cos(_a)*${ph},_dy=sin(_a)*${ph};`)
      ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
      ln(`      int _sx=(((int)floorf(_x-_dx+0.5f))%WIDTH+WIDTH)%WIDTH, _sy=(((int)floorf(_y-_dy+0.5f))%HEIGHT+HEIGHT)%HEIGHT;`)
      ln(`      ${ob}[_y*WIDTH+_x]=${src}[_sy*WIDTH+_sx];}}`)
    } else if (mode === 'scale') {
      ln(`    float _s=1.0f+${ph}/100.0f; _s=constrain(_s,0.05f,20.0f);`)
      ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
      ln(`      int _sx=(int)floorf(_cx+(_x-_cx)/_s+0.5f), _sy=(int)floorf(_cy+(_y-_cy)/_s+0.5f);`)
      ln(`      ${ob}[_y*WIDTH+_x]=(_sx>=0&&_sx<WIDTH&&_sy>=0&&_sy<HEIGHT)?${src}[_sy*WIDTH+_sx]:CRGB::Black;}}`)
    } else {
      ln(`    float _a=${ph}*0.01745329f,_co=cos(_a),_si=sin(_a);`)
      ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
      ln(`      float _rx=_x-_cx,_ry=_y-_cy; int _sx=(int)floorf(_cx+_rx*_co+_ry*_si+0.5f), _sy=(int)floorf(_cy-_rx*_si+_ry*_co+0.5f);`)
      ln(`      ${ob}[_y*WIDTH+_x]=(_sx>=0&&_sx<WIDTH&&_sy>=0&&_sy<HEIGHT)?${src}[_sy*WIDTH+_sx]:CRGB::Black;}}`)
    }
  },
  // Blender-style array: composite `count` copies of the input, each offset/
  // rotated/scaled by an accumulating step about the matrix centre, dimmed by
  // falloff^i. High→low paint order so copy 0 lands on top for `over`. Keep
  // in sync with evalArray() in graphEvaluator.ts.
  Array({ node, p, ln, f, ownBuf, srcBuf, incoming }) {
    const ob = ownBuf()
    const src = srcBuf('frame')
    if (!src) { ln(`  fill_solid(${ob}, NUM_LEDS, CRGB::Black); // Array: no input`); return }
    const offX = f('offsetX', 'offsetX', 3), offY = f('offsetY', 'offsetY', 0)
    // `angle` and `count` are wire-able (see nodeLibrary inputs) so an
    // animated signal can spin/grow the array; unwired they bake the slider.
    const ang = f('angle', 'angle', 0)
    const scl = `max(0.05f, ${f('scale', 'scale', 1)})`, fo = `constrain(${f('falloff', 'falloff', 0.7)},0.0f,1.0f)`
    const mode = ['lighten', 'over'].includes(String(p.blendMode)) ? String(p.blendMode) : 'add'
    const countWired = incoming.has(`${node.id}:count`)
    const countLit = Math.max(1, Math.min(32, Math.round(Number(p.count ?? 5))))
    ln(`  { // Array${countWired ? '' : ` x${countLit}`}`)
    ln(`    fill_solid(${ob}, NUM_LEDS, CRGB::Black);`)
    // A wired count is clamped to [1, 32] at runtime (the evaluator's cap).
    if (countWired) ln(`    int _cnt=(int)(${f('count', 'count', 5)}+0.5f); _cnt=_cnt<1?1:(_cnt>32?32:_cnt);`)
    ln(`    for(int _i=${countWired ? '_cnt-1' : countLit - 1};_i>=0;_i--){`)
    // Integer kernel (shared/integerPatterns.ts): the floats run once a copy.
    for (const line of arrayCopyCpp('_i', `(${offX})`, `(${offY})`, `(${ang})`, scl, fo)) ln(`      ${line}`)
    ln(`      for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
    for (const line of ARRAY_SOURCE_CPP) ln(`        ${line}`)
    ln(`        if(_aSrc<0) continue;`)
    ln(`        CRGB _s=${src}[_aSrc]; uint8_t _r=(uint8_t)((_s.r*_adim)>>16),_g=(uint8_t)((_s.g*_adim)>>16),_b=(uint8_t)((_s.b*_adim)>>16);`)
    ln(`        CRGB& _o=${ob}[_y*WIDTH+_x];`)
    if (mode === 'lighten') {
      ln(`        _o.r=max(_o.r,_r); _o.g=max(_o.g,_g); _o.b=max(_o.b,_b);`)
    } else if (mode === 'over') {
      ln(`        uint8_t _cov=max(_r,max(_g,_b));`)
      ln(`        _o.r=${ARRAY_OVER_CPP('_o.r', '_cov', '_r')}; _o.g=${ARRAY_OVER_CPP('_o.g', '_cov', '_g')}; _o.b=${ARRAY_OVER_CPP('_o.b', '_cov', '_b')};`)
    } else {
      ln(`        _o.r=qadd8(_o.r,_r); _o.g=qadd8(_o.g,_g); _o.b=qadd8(_o.b,_b);`)
    }
    ln(`      } } }`)
  },
  // Frame blend with real blend modes — `blendMode` picks the operator,
  // `amount` is opacity (0–255). Keep in sync with the `Blend` case in
  // graphEvaluator.ts. `normal` uses FastLED's nblend; other modes blend
  // per channel then cross-fade against the base by opacity.
  Blend({ p, ln, f, ownBuf, srcBuf }) {
    const ob = ownBuf()
    // `amount` is opacity 0–1; FastLED's nblend / cross-fade want 0–255.
    const a = srcBuf('a'), b = srcBuf('b'), amt = f('amount', 'amount', 0.5)
    const mode = String(p.blendMode ?? 'normal')
    // A wired mask scales the opacity per pixel by its brightness, as the
    // evaluator does; unwired, `_m` is the opacity itself.
    const mask = srcBuf('mask')
    const perPixel = mask
      ? `(uint8_t)(constrain(${amt},0.0f,1.0f)*255.0f*((${mask}[_i].r+${mask}[_i].g+${mask}[_i].b)/3.0f/255.0f))`
      : null
    ln(`  { ${a ? `::memmove(${ob}, ${a}, sizeof(CRGB) * NUM_LEDS);` : `fill_solid(${ob}, NUM_LEDS, CRGB::Black);`}`)
    // Nothing on B yet (a fresh splice): A passes through in every mode.
    if (!b) {
      ln(`  }`)
    } else if (mode === 'normal' && perPixel) {
      ln(`    for(int _i=0;_i<NUM_LEDS;_i++) nblend(${ob}[_i], ${b}[_i], ${perPixel}); }`)
    } else if (mode === 'normal') {
      ln(`    nblend(${ob}, ${b}, NUM_LEDS, (uint8_t)((${amt}) * 255)); }`)
    } else {
      // Integer blend (shared/integerPatterns.ts): the opacity is a byte, a
      // mask's brightness scales it per pixel.
      const mix = (c: string) => blendMix8Cpp(mode, `_a.${c}`, `_b.${c}`, '_op8')
      ln(`    uint8_t _opAll=(uint8_t)(constrain(${amt},0.0f,1.0f)*255.0f); for(int _i=0;_i<NUM_LEDS;_i++){`)
      if (mask) ln(`      uint8_t _op8=(uint8_t)((((uint32_t)_opAll*((${mask}[_i].r+${mask}[_i].g+${mask}[_i].b)/3))+1)*257>>16);`)
      else ln(`      uint8_t _op8=_opAll;`)
      ln(`      CRGB _a=${ob}[_i], _b=${b}[_i];`)
      ln(`      ${ob}[_i]=CRGB(${mix('r')},${mix('g')},${mix('b')}); } }`)
    }
  },
  Invert({ ln, ownBuf, seedFrom }) {
    const ob = ownBuf()
    ln(`  ${seedFrom('frame')} for(int _i=0;_i<NUM_LEDS;_i++){${ob}[_i].r=255-${ob}[_i].r;${ob}[_i].g=255-${ob}[_i].g;${ob}[_i].b=255-${ob}[_i].b;}`)
  },
  // Wedge mirror — folds each pixel's polar angle into a single segment,
  // reflects it about the segment's midline, and samples the source there.
  // Mirrors evalKaleidoscope in kaleidoscope.ts: same W/2,H/2 centre, the
  // same two-step fold, and floorf(v+0.5f) to match JS Math.round, so the
  // preview and the flashed sketch produce identical frames.
  Kaleidoscope({ ln, f, ownBuf, srcBuf, needsAtan16 }) {
    const ob = ownBuf()
    const src = srcBuf('frame')
    if (!src) { ln(`  fill_solid(${ob}, NUM_LEDS, CRGB::Black); // Kaleidoscope: no input`); return }
    // `segments` is wireable, so the wedge angle is computed per frame.
    const seg = f('segments', 'segments', 6)
    needsAtan16.v = true
    // Integer kernel (shared/integerPatterns.ts): the wedge in 16-bit angle units.
    ln(`  { int32_t _kW=(int32_t)(65536.0f/constrain((float)(${seg}),${KALEIDOSCOPE_SEGMENTS.min}.0f,${KALEIDOSCOPE_SEGMENTS.max}.0f));`)
    ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
    for (const line of KALEIDO_SOURCE_CPP) ln(`      ${line}`)
    ln(`      ${ob}[_y*WIDTH+_x]=_kSrc<0?CRGB::Black:${src}[_kSrc];`)
    ln(`    } }`)
  },
  Mirror({ p, ln, f, channelColor, ownBuf, srcBuf }) {
    const ob = ownBuf()
    const src = srcBuf('frame')
    if (!src) { ln(`  fill_solid(${ob}, NUM_LEDS, CRGB::Black); // Mirror: no input`); return }
    const mode = String(p.mirrorMode ?? 'horizontal')
    const glow = Boolean(p.glow)
    ln(`  { for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
    // base = the mirrored source pixel (min-side of the reflection)
    ln(`    int _sx=_x,_sy=_y;`)
    if (mode === 'horizontal' || mode === 'quad') ln(`    _sx=min(_x,WIDTH-1-_x);`)
    if (mode === 'vertical' || mode === 'quad') ln(`    _sy=min(_y,HEIGHT-1-_y);`)
    if (mode === 'diagonal') ln(`    _sx=min(min(_x,_y),WIDTH-1);_sy=min(max(_x,_y),HEIGHT-1);`)
    if (glow) {
      // additive bloom: base + glowAmount× the discarded partner, tinted
      // per-channel by the `color` input (white neutral). scale8 chain = g/255.
      const g = f('glowAmount', 'glowAmount', 0.35)
      const tintE = channelColor('color', 255, 255, 255)
      ln(`    int _ax=_x,_ay=_y;`)
      if (mode === 'horizontal' || mode === 'quad') ln(`    _ax=max(_x,WIDTH-1-_x);`)
      if (mode === 'vertical' || mode === 'quad') ln(`    _ay=max(_y,HEIGHT-1-_y);`)
      if (mode === 'diagonal') ln(`    _ax=min(max(_x,_y),WIDTH-1);_ay=min(min(_x,_y),HEIGHT-1);`)
      ln(`    CRGB _b=${src}[_sy*WIDTH+_sx], _a=${src}[_ay*WIDTH+_ax], _t=${tintE};`)
      ln(`    ${ob}[_y*WIDTH+_x]=CRGB(qadd8(_b.r,scale8(scale8(_a.r,_t.r),(uint8_t)(constrain(${g},0.0f,1.0f)*255.0f))),qadd8(_b.g,scale8(scale8(_a.g,_t.g),(uint8_t)(constrain(${g},0.0f,1.0f)*255.0f))),qadd8(_b.b,scale8(scale8(_a.b,_t.b),(uint8_t)(constrain(${g},0.0f,1.0f)*255.0f))));}}`)
      return
    }
    ln(`    ${ob}[_y*WIDTH+_x]=${src}[_sy*WIDTH+_sx];}}`)
  },
  Blur2D({ ln, f, ownBuf, seedFrom, needsXyMap }) {
    const ob = ownBuf()
    // `amount` is a 0–1 strength; blur2d takes a 0–255 blur amount.
    // FastLED 3.10+ requires an XYMap argument — without it blur2d logs
    // "XY function not provided" and maps every pixel to index 0. Our
    // buffers are always row-major (serpentine remaps only at
    // MatrixOutput), so a rectangular grid map is correct here.
    needsXyMap.v = true
    const amount = f('amount', 'amount', 0.15)
    ln(`  ${seedFrom('frame')} blur2d(${ob}, WIDTH, HEIGHT, (uint8_t)(constrain(${amount},0.0f,1.0f)*255.0f), _xyMap);`)
  },
}
