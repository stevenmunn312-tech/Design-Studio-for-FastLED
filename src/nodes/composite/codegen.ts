import type { NodeEmitters } from '../../codegen/emitContext'
import { floatLit } from '../../codegen/cppLiterals'

export const COMPOSITE_EMITTERS: NodeEmitters = {
  BrightnessMod({ ln, f, ownBuf, seedFrom }) {
    const ob = ownBuf()
    const br = f('brightness', 'brightness', 1)
    ln(`  { ${seedFrom('frame')} float _br = fmaxf(0.0f, ${br}); for (int _i = 0; _i < NUM_LEDS; _i++) ${ob}[_i] = CRGB((uint8_t)fminf(255.0f, ${ob}[_i].r * _br), (uint8_t)fminf(255.0f, ${ob}[_i].g * _br), (uint8_t)fminf(255.0f, ${ob}[_i].b * _br)); }`)
  },
  Fade({ ln, f, ownBuf, seedFrom }) {
    const ob = ownBuf()
    const fade = f('fade', 'fade', 0.5)
    ln(`  { ${seedFrom('frame')} uint8_t _fa = (uint8_t)(constrain(${fade}, 0, 1) * 255); fadeToBlackBy(${ob}, NUM_LEDS, _fa); }`)
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
  Trails({ id, ln, f, ownBuf, srcBuf, nativeMultiRender, persistentFrameStateBufs }) {
    const ob = ownBuf()
    const state = nativeMultiRender ? `_passState_${id}` : ob
    if (nativeMultiRender) persistentFrameStateBufs.add(id)
    const src = srcBuf('frame')
    if (!src) { ln(`  fill_solid(${ob}, NUM_LEDS, CRGB::Black);`); return }
    const decay = f('decay', 'decay', 0.15)
    ln(`  { // Trails: fadeToBlackBy(decay^3) then re-lighten from the input (per-channel max)`)
    ln(`    float _decay = constrain(${decay},0.0f,1.0f); _decay = _decay*_decay*_decay;`)
    ln(`    fadeToBlackBy(${state}, NUM_LEDS, (uint8_t)(_decay*255.0f));`)
    ln(`    for(int _i=0;_i<NUM_LEDS;_i++){`)
    ln(`      if(${src}[_i].r>${state}[_i].r)${state}[_i].r=${src}[_i].r;`)
    ln(`      if(${src}[_i].g>${state}[_i].g)${state}[_i].g=${src}[_i].g;`)
    ln(`      if(${src}[_i].b>${state}[_i].b)${state}[_i].b=${src}[_i].b;}`)
    if (nativeMultiRender) ln(`    ::memmove(${ob}, ${state}, sizeof(CRGB) * NUM_LEDS);`)
    ln(`  }`)
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
    ln(`    float _fb_cx_${id}=(WIDTH-1)/2.0f,_fb_cy_${id}=(HEIGHT-1)/2.0f;`)
    if (transformMode === 'translate') {
      ln(`    float _fb_dx_${id}=${offX},_fb_dy_${id}=${offY};`)
    } else if (transformMode === 'rotate') {
      ln(`    float _fb_a_${id}=${angle}*0.01745329f,_fb_co_${id}=cos(_fb_a_${id}),_fb_si_${id}=sin(_fb_a_${id});`)
    } else if (transformMode === 'scale') {
      ln(`    float _fb_s_${id}=constrain(${scale},0.05f,4.0f);`)
    }
    ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
    if (transformMode === 'translate') {
      ln(`      int _sx=(((int)floorf(_x-_fb_dx_${id}+0.5f))%WIDTH+WIDTH)%WIDTH,_sy=(((int)floorf(_y-_fb_dy_${id}+0.5f))%HEIGHT+HEIGHT)%HEIGHT;`)
      ln(`      CRGB _fb=${hist}[_fb_read_${id}][_sy*WIDTH+_sx];`)
    } else if (transformMode === 'rotate') {
      ln(`      float _rx=_x-_fb_cx_${id},_ry=_y-_fb_cy_${id}; int _sx=(int)floorf(_fb_cx_${id}+_rx*_fb_co_${id}+_ry*_fb_si_${id}+0.5f),_sy=(int)floorf(_fb_cy_${id}-_rx*_fb_si_${id}+_ry*_fb_co_${id}+0.5f);`)
      ln(`      CRGB _fb=(_sx>=0&&_sx<WIDTH&&_sy>=0&&_sy<HEIGHT)?${hist}[_fb_read_${id}][_sy*WIDTH+_sx]:CRGB::Black;`)
    } else if (transformMode === 'scale') {
      ln(`      int _sx=(int)floorf(_fb_cx_${id}+(_x-_fb_cx_${id})/_fb_s_${id}+0.5f),_sy=(int)floorf(_fb_cy_${id}+(_y-_fb_cy_${id})/_fb_s_${id}+0.5f);`)
      ln(`      CRGB _fb=(_sx>=0&&_sx<WIDTH&&_sy>=0&&_sy<HEIGHT)?${hist}[_fb_read_${id}][_sy*WIDTH+_sx]:CRGB::Black;`)
    } else {
      ln(`      CRGB _fb=${hist}[_fb_read_${id}][_y*WIDTH+_x];`)
    }
    ln(`      _fb.nscale8((uint8_t)(_fb_fade_${id}*255.0f));`)
    ln(`      CRGB _a=${src}[_y*WIDTH+_x];`)
    if (mode === 'normal') {
      ln(`      CRGB _r=_a; nblend(_r,_fb,(uint8_t)(_fb_amt_${id}*255.0f)); ${ob}[_y*WIDTH+_x]=_r;`)
    } else if (mode === 'lighten') {
      ln(`      ${ob}[_y*WIDTH+_x]=CRGB((uint8_t)(_a.r*(1.0f-_fb_amt_${id})+max(_a.r,_fb.r)*_fb_amt_${id}),(uint8_t)(_a.g*(1.0f-_fb_amt_${id})+max(_a.g,_fb.g)*_fb_amt_${id}),(uint8_t)(_a.b*(1.0f-_fb_amt_${id})+max(_a.b,_fb.b)*_fb_amt_${id}));`)
    } else {
      const expr: Record<string, string> = {
        multiply:   '_av*_bv',
        screen:     '1.0f-(1.0f-_av)*(1.0f-_bv)',
        add:        'min(1.0f,_av+_bv)',
        difference: 'fabsf(_av-_bv)',
      }
      ln(`      for(int _c=0;_c<3;_c++){ float _av=_a[_c]/255.0f,_bv=_fb[_c]/255.0f;`)
      ln(`        float _m=${expr[mode] ?? '1.0f-(1.0f-_av)*(1.0f-_bv)'};`)
      ln(`        ${ob}[_y*WIDTH+_x][_c]=(uint8_t)((_av*(1.0f-_fb_amt_${id})+_m*_fb_amt_${id})*255.0f); }`)
    }
    ln(`    }`)
    ln(`    ::memmove(${hist}[_fb_idx_${id}], ${ob}, sizeof(CRGB) * NUM_LEDS);`)
    ln(`    _fb_idx_${id}=(_fb_idx_${id}+1)%_fb_cap_${id};`)
    ln(`  }`)
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
  Transform({ p, ln, f, ownBuf, srcBuf, needsT }) {
    needsT.v = true
    const ob = ownBuf()
    const src = srcBuf('frame')
    if (!src) { ln(`  fill_solid(${ob}, NUM_LEDS, CRGB::Black); // Transform: no input`); return }
    const mode = String(p.transform ?? 'rotate')
    const rate = f('rate', 'rate', 90)
    const angle = f('angle', 'angle', 0)
    ln(`  { float _cx=(WIDTH-1)/2.0f,_cy=(HEIGHT-1)/2.0f,_rate=${rate};`)
    if (mode === 'translate') {
      ln(`    float _a=${angle}*0.01745329f,_dx=cos(_a)*_rate*t,_dy=sin(_a)*_rate*t;`)
      ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
      ln(`      int _sx=(((int)floorf(_x-_dx+0.5f))%WIDTH+WIDTH)%WIDTH, _sy=(((int)floorf(_y-_dy+0.5f))%HEIGHT+HEIGHT)%HEIGHT;`)
      ln(`      ${ob}[_y*WIDTH+_x]=${src}[_sy*WIDTH+_sx];}}`)
    } else if (mode === 'scale') {
      ln(`    float _s=1.0f+(_rate/100.0f)*t; _s=constrain(_s,0.05f,20.0f);`)
      ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
      ln(`      int _sx=(int)floorf(_cx+(_x-_cx)/_s+0.5f), _sy=(int)floorf(_cy+(_y-_cy)/_s+0.5f);`)
      ln(`      ${ob}[_y*WIDTH+_x]=(_sx>=0&&_sx<WIDTH&&_sy>=0&&_sy<HEIGHT)?${src}[_sy*WIDTH+_sx]:CRGB::Black;}}`)
    } else {
      ln(`    float _a=_rate*t*0.01745329f,_co=cos(_a),_si=sin(_a);`)
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
    const scl = `max(0.05f, ${f('scale', 'scale', 1)})`, fo = f('falloff', 'falloff', 0.7)
    const mode = ['lighten', 'over'].includes(String(p.blendMode)) ? String(p.blendMode) : 'add'
    const countWired = incoming.has(`${node.id}:count`)
    const countLit = Math.max(1, Math.min(32, Math.round(Number(p.count ?? 5))))
    ln(`  { // Array${countWired ? '' : ` x${countLit}`}`)
    ln(`    fill_solid(${ob}, NUM_LEDS, CRGB::Black);`)
    // A wired count is clamped to [1, 32] at runtime (the evaluator's cap).
    if (countWired) ln(`    int _cnt=(int)(${f('count', 'count', 5)}+0.5f); _cnt=_cnt<1?1:(_cnt>32?32:_cnt);`)
    ln(`    float _cx=(WIDTH-1)/2.0f,_cy=(HEIGHT-1)/2.0f;`)
    ln(`    for(int _i=${countWired ? '_cnt-1' : countLit - 1};_i>=0;_i--){`)
    ln(`      float _ox=${offX}*_i,_oy=${offY}*_i,_a=${ang}*_i*0.01745329f,_co=cos(_a),_si=sin(_a);`)
    ln(`      float _inv=1.0f/powf(${scl},_i),_dim=powf(${fo},_i);`)
    ln(`      for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
    ln(`        float _px=_x-_ox-_cx,_py=_y-_oy-_cy,_rx=_px*_co+_py*_si,_ry=-_px*_si+_py*_co;`)
    ln(`        int _sx=(int)floorf(_cx+_rx*_inv+0.5f),_sy=(int)floorf(_cy+_ry*_inv+0.5f);`)
    ln(`        if(_sx<0||_sx>=WIDTH||_sy<0||_sy>=HEIGHT) continue;`)
    ln(`        CRGB _s=${src}[_sy*WIDTH+_sx]; uint8_t _r=(uint8_t)(_s.r*_dim),_g=(uint8_t)(_s.g*_dim),_b=(uint8_t)(_s.b*_dim);`)
    ln(`        CRGB& _o=${ob}[_y*WIDTH+_x];`)
    if (mode === 'lighten') {
      ln(`        _o.r=max(_o.r,_r); _o.g=max(_o.g,_g); _o.b=max(_o.b,_b);`)
    } else if (mode === 'over') {
      ln(`        float _cov=max(_r,max(_g,_b))/255.0f;`)
      ln(`        _o.r=(uint8_t)min(255.0f,_o.r*(1-_cov)+_r); _o.g=(uint8_t)min(255.0f,_o.g*(1-_cov)+_g); _o.b=(uint8_t)min(255.0f,_o.b*(1-_cov)+_b);`)
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
    ln(`  { ${a ? `::memmove(${ob}, ${a}, sizeof(CRGB) * NUM_LEDS);` : `fill_solid(${ob}, NUM_LEDS, CRGB::Black);`}`)
    if (mode === 'normal') {
      ln(`    nblend(${ob}, ${b ?? ob}, NUM_LEDS, (uint8_t)((${amt}) * 255)); }`)
    } else {
      const expr: Record<string, string> = {
        multiply:   '_av*_bv',
        screen:     '1.0f-(1.0f-_av)*(1.0f-_bv)',
        overlay:    '_av<0.5f?2.0f*_av*_bv:1.0f-2.0f*(1.0f-_av)*(1.0f-_bv)',
        add:        'min(1.0f,_av+_bv)',
        difference: 'fabsf(_av-_bv)',
      }
      ln(`    float _op=(${amt}); for(int _i=0;_i<NUM_LEDS;_i++){`)
      ln(`      CRGB _a=${ob}[_i], _b=${b ?? ob}[_i];`)
      ln(`      for(int _c=0;_c<3;_c++){ float _av=_a[_c]/255.0f,_bv=_b[_c]/255.0f;`)
      ln(`        float _r=${expr[mode] ?? '_bv'};`)
      ln(`        ${ob}[_i][_c]=(uint8_t)((_av*(1.0f-_op)+_r*_op)*255.0f); } } }`)
    }
  },
  Invert({ ln, ownBuf, seedFrom }) {
    const ob = ownBuf()
    ln(`  ${seedFrom('frame')} for(int _i=0;_i<NUM_LEDS;_i++){${ob}[_i].r=255-${ob}[_i].r;${ob}[_i].g=255-${ob}[_i].g;${ob}[_i].b=255-${ob}[_i].b;}`)
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
