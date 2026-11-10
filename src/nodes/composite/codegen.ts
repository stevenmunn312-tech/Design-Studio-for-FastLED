import type { NodeEmitters } from '../../codegen/emitContext'
import { floatLit, seedProp } from '../../codegen/cppLiterals'
import { wallpaperGroupIndex, WALLPAPER_GROUPS } from '../../state/evaluator/symmetry'
import { GLITTER_PER_LED, glitterMode } from './glitter'
import {
  FRAME_SCALE, FRAME_TRANSFORM_EDGES, exactTransformCpp, frameQuarterTurns, frameTransformEdge, frameTransformMode, smoothTransformCpp,
} from './frameTransform'
import { phaseTag, speedPhaseCpp } from '../shared/speedClockCpp'
import { timedFadeCpp } from '../shared/trailFadeCpp'
import { TRAIL_MIN_STEP } from '../shared/trailFade'
import { TRAILS_REFERENCE_FPS } from './trails'
import {
  ARRAY_OVER_CPP, ARRAY_SOURCE_CPP, FEEDBACK_TRANSFORMS, KALEIDO_SOURCE_CPP, arrayCopyCpp, blendMix8Cpp, feedbackFrameCpp, feedbackSourceCpp,
  sampleFrameQ8Cpp, wallpaperFrameCpp,
} from '../shared/integerPatterns'
import { KALEIDOSCOPE_SEGMENTS } from './kaleidoscope'
import { transformZoomCpp } from './transformZoom'
import { ARRAY_COPIES } from './limits'
import { BLEND_NODE_MODES, FEEDBACK_BLEND_MODES } from './blendModes'
import { diagonalFoldCpp } from './mirror'
import { WARP_MOTIONS, warpPushCpp } from './frameWarpMotion'

export const COMPOSITE_EMITTERS: NodeEmitters = {
  // Rounded (+0.5f) as the preview's Math.round: truncating turned a level-1
  // pixel at half brightness to 0 on the board while the preview kept it.
  BrightnessMod({ ln, f, ownBuf, seedFrom }) {
    const ob = ownBuf()
    const br = f('brightness', 'brightness', 1)
    const ch = (c: string) => `(uint8_t)(fminf(255.0f, ${ob}[_i].${c} * _br) + 0.5f)`
    ln(`  { ${seedFrom('frame')} float _br = fmaxf(0.0f, ${br}); for (int _i = 0; _i < NUM_LEDS; _i++) ${ob}[_i] = CRGB(${ch('r')}, ${ch('g')}, ${ch('b')}); }`)
  },
  // Manual A/B frame selector; copies the wired side when the other is
  // empty (matching the evaluator's fallback). An unwired Select is the
  // `select` switch, so the side is chosen here rather than at runtime.
  FrameSwitch({ node, p, ln, ownBuf, srcBuf, boolExpr, incoming }) {
    const ob = ownBuf()
    const a = srcBuf('a'), b = srcBuf('b')
    const wired = incoming.has(`${node.id}:sel`)
    if (a && b && wired) ln(`  ::memmove(${ob}, (${boolExpr(node.id, 'sel')}) ? ${b} : ${a}, sizeof(CRGB) * NUM_LEDS);`)
    else if (a && b) ln(`  ::memmove(${ob}, ${p.select === true ? b : a}, sizeof(CRGB) * NUM_LEDS);`)
    else if (a || b) ln(`  ::memmove(${ob}, ${a ?? b}, sizeof(CRGB) * NUM_LEDS);`)
    else ln(`  fill_solid(${ob}, NUM_LEDS, CRGB::Black);`)
  },
  // Rectangular zones — mirrors the evaluator's Zones case: seed
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
      // Edges round like the preview's Math.round; truncating moved a zone a column.
      const edge = (frac: number, dim: string) => `(int)floorf(${floatLit(frac, 6)}*${dim}+0.5f)`
      if (p[`${key}Fit`] === true) {
        // Fit: each zone pixel reads the source under its centre, scaled
        // from the zone's size to the whole frame, in integers as the preview.
        ln(`  { int _zx0=${edge(zx, 'WIDTH')},_zx1=min(${edge(zx + zw, 'WIDTH')},WIDTH),_zy0=${edge(zy, 'HEIGHT')},_zy1=min(${edge(zy + zh, 'HEIGHT')},HEIGHT);`)
        ln(`    for (int _y=_zy0; _y<_zy1; _y++) for (int _x=_zx0; _x<_zx1; _x++) {`)
        ln(`      int _sx=(int)((2*(int32_t)(_x-_zx0)+1)*WIDTH/(2*(int32_t)(_zx1-_zx0))),_sy=(int)((2*(int32_t)(_y-_zy0)+1)*HEIGHT/(2*(int32_t)(_zy1-_zy0)));`)
        ln(`      ${ob}[_y*WIDTH+_x] = ${zbuf}[_sy*WIDTH+_sx]; } }`)
        continue
      }
      ln(`  for (int _y=${edge(zy, 'HEIGHT')}; _y<${edge(zy + zh, 'HEIGHT')} && _y<HEIGHT; _y++)`)
      ln(`    for (int _x=${edge(zx, 'WIDTH')}; _x<${edge(zx + zw, 'WIDTH')} && _x<WIDTH; _x++)`)
      ln(`      ${ob}[_y*WIDTH+_x] = ${zbuf}[_y*WIDTH+_x];`)
    }
  },
  // Feedback/trails buffer — the persistent buf_ own buffer is deliberately
  // not seeded from the input each frame (see the Code node comment above);
  // it fades in place, then re-lightens per-channel wherever the input is
  // brighter. Mirrors the evaluator's Trails case.
  Trails({ id, ln, f, ownBuf, srcBuf, needsT }) {
    const src = srcBuf('frame')
    if (!src) { ln(`  fill_solid(${ownBuf()}, NUM_LEDS, CRGB::Black);`); return }
    needsT.v = true
    const ob = ownBuf({ persists: true })
    const decay = f('decay', 'decay', 0.15)
    // 1 - decay^3 survives each 60th of a second, spent by elapsed time and
    // saved up into whole fadeToBlackBy bytes, as the preview does.
    ln(`  { // Trails: keep 1-decay^3 per 60th of a second, then re-lighten from the input (per-channel max)`)
    ln(`    double _decay = constrain(${decay},0.0,1.0); double _keep60 = 1.0 - _decay*_decay*_decay;`)
    timedFadeCpp(ln, phaseTag(id), `pow(_keep60, _dt * ${TRAILS_REFERENCE_FPS}.0)`, ob)
    ln(`    for(int _i=0;_i<NUM_LEDS;_i++){`)
    ln(`      if(${src}[_i].r>${ob}[_i].r)${ob}[_i].r=${src}[_i].r;`)
    ln(`      if(${src}[_i].g>${ob}[_i].g)${ob}[_i].g=${src}[_i].g;`)
    ln(`      if(${src}[_i].b>${ob}[_i].b)${ob}[_i].b=${src}[_i].b;}`)
    ln(`  }`)
  },
  FrameWarp({ id, p, ln, f, ownBuf, srcBuf, srcField, needsFrameSample, needsT }) {
    const ob = ownBuf()
    const src = srcBuf('frame')
    if (!src) { ln(`  fill_solid(${ob}, NUM_LEDS, CRGB::Black); // FrameWarp: no input`); return }
    needsFrameSample.v = true
    const dx = srcField('dx'), dy = srcField('dy')
    const edgeMode = p.edgeMode === 'wrap' ? 1 : p.edgeMode === 'black' ? 2 : 0
    const bilinear = p.sampling !== 'nearest'
    // With neither field wired, the built-in motion (./frameWarpMotion.ts) pushes.
    const motion = (WARP_MOTIONS as readonly unknown[]).includes(p.motion) ? String(p.motion) : 'none'
    const builtIn = !dx && !dy && motion !== 'none'
    ln(`  { /* FrameWarp: ${String(p.edgeMode ?? 'clamp')}, ${bilinear ? 'bilinear' : 'nearest'}${builtIn ? `, ${motion}` : ''} */`)
    ln(`    float _fw_st=constrain(${f('strength', 'strength', 2)},0.0f,8.0f);`)
    let ph = ''
    if (builtIn) {
      needsT.v = true
      ln(`    float _fw_ms=${f('motionSpeed', 'motionSpeed', 0.25)};`)
      ph = speedPhaseCpp(ln, phaseTag(id), '_fw_ms')
      ln(`    float _fw_cx=(WIDTH-1)*0.5f,_fw_cy=(HEIGHT-1)*0.5f,_fw_R=fmaxf(fmaxf(_fw_cx,_fw_cy),1.0f);`)
    }
    ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){ int _i=_y*WIDTH+_x;`)
    if (builtIn) {
      ln(`      float _fu=(_x-_fw_cx)/_fw_R,_fv=(_y-_fw_cy)/_fw_R;`)
      for (const line of warpPushCpp(motion, ph)) ln(`      ${line}`)
    }
    const push = (field: string | null, built: string) => builtIn ? built : `(2.0f*${field ? `${field}[_i]` : '0.5f'}-1.0f)`
    ln(`      float _sx=_x+${push(dx, '_pdx')}*_fw_st,_sy=_y+${push(dy, '_pdy')}*_fw_st;`)
    ln(`      ${ob}[_i]=_sampleFrame(${src},_sx,_sy,${edgeMode},${bilinear ? 'true' : 'false'});`)
    ln(`    } }`)
  },
  Symmetry({ id, p, ln, f, ownBuf, srcBuf, needsT, needsSymmetry, needsAtan16, needsLatticeQ }) {
    needsT.v = true
    needsSymmetry.v = true
    needsAtan16.v = true
    needsLatticeQ.v = true
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
  FrameFeedback({ id, p, ln, f, ownBuf, srcBuf, feedbackHistoryBufs, needsT }) {
    const ob = ownBuf()
    const src = srcBuf('frame')
    if (!src) { ln(`  fill_solid(${ob}, NUM_LEDS, CRGB::Black);`); return }
    needsT.v = true
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
    const transformMode = (FEEDBACK_TRANSFORMS as readonly string[]).includes(String(p.feedbackTransform)) ? String(p.feedbackTransform) : 'none'
    ln(`  { // FrameFeedback: ${delay}-frame recursive ring buffer`)
    ln(`    static uint8_t _fb_idx_${id}=0;`)
    ln(`    const uint8_t _fb_cap_${id}=${capacity};`)
    ln(`    uint8_t _fb_read_${id}=(_fb_idx_${id}+_fb_cap_${id}-${delay})%_fb_cap_${id};`)
    // 1 - fade survives each 60th of a second, spent by elapsed time and
    // saved up per ring slot into whole fadeToBlackBy bytes, as the preview does.
    ln(`    static float _fbOwed_${id}[${capacity}]={0},_fbT_${id}=-1.0f;`)
    ln(`    float _fbDt=_fbT_${id}<0.0f?0.0f:fmaxf(0.0f,t-_fbT_${id}); _fbT_${id}=t;`)
    ln(`    float _fbKeep=powf(1.0f-constrain(${fade},0.0f,1.0f),_fbDt*${floatLit(TRAILS_REFERENCE_FPS)}); if(!(_fbKeep>=0.0f)) _fbKeep=1.0f;`)
    ln(`    float _fbOwe=_fbOwed_${id}[_fb_read_${id}]+(1.0f-_fbKeep)*256.0f; uint8_t _fbBy=0;`)
    ln(`    if(_fbOwe>=${floatLit(TRAIL_MIN_STEP)}){ _fbBy=_fbOwe>=255.0f?255:(uint8_t)_fbOwe; _fbOwe=_fbBy==255?0.0f:_fbOwe-_fbBy; }`)
    ln(`    _fbOwed_${id}[_fb_idx_${id}]=_fbOwe;`)
    ln(`    float _fb_amt_${id}=constrain(${amount},0.0f,1.0f);`)
    // Integer kernel (shared/integerPatterns.ts): source lookup and blend in bytes.
    ln(`    uint8_t _fbF8=255-_fbBy,_fbA8=(uint8_t)(_fb_amt_${id}*255.0f);`)
    if (transformMode !== 'none') {
      for (const line of feedbackFrameCpp(id, offX, offY, angle, scale)) ln(`    ${line}`)
    }
    ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
    for (const line of feedbackSourceCpp(transformMode)) ln(`      ${line}`)
    ln(`      CRGB _fb=_fbSrc<0?CRGB(CRGB::Black):${hist}[_fb_read_${id}][_fbSrc];`)
    ln(`      _fb.nscale8(_fbF8);`)
    ln(`      CRGB _a=${src}[_y*WIDTH+_x];`)
    const blendMode = FEEDBACK_BLEND_MODES.includes(mode) ? mode : 'screen'
    const mix = (c: string) => blendMix8Cpp(blendMode, `_a.${c}`, `_fb.${c}`, '_fbA8')
    ln(`      ${ob}[_y*WIDTH+_x]=CRGB(${mix('r')},${mix('g')},${mix('b')});`)
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
  // Keep in lockstep with the `FrameTransform` evaluator (./frameTransform.ts).
  // A step the graph can never move is left out: an unwired value at rest and
  // an unwired rate of 0 emit nothing, and a fixed turn in Exact is unrolled.
  FrameTransform({ node, id, p, ln, f, ownBuf, srcBuf, incoming, needsT, needsFrameSample }) {
    const ob = ownBuf()
    const src = srcBuf('frame')
    if (!src) { ln(`  fill_solid(${ob}, NUM_LEDS, CRGB::Black); // Frame Transform: no input`); return }
    const smooth = frameTransformMode(p.mode) === 'smooth'
    const flipX = Boolean(p.flipX), flipY = Boolean(p.flipY)
    const wired = (port: string) => incoming.has(`${node.id}:${port}`)
    // A value's expression, or null while it is unwired and at rest.
    const value = (port: string, rest: number) => !wired(port) && Number(p[port] ?? rest) === rest ? null : f(port, port, rest)
    const lines: string[] = []
    // A rate's integrated phase, or null while it is unwired and 0.
    const phase = (port: string, term: string, local: string) => {
      if (value(port, 0) === null) return null
      needsT.v = true
      lines.push(`    float ${local}=${f(port, port, 0)};`)
      return speedPhaseCpp((line) => lines.push(line), phaseTag(id, term), local)
    }
    const sum = (a: string | null, b: string | null) => a !== null && b !== null ? `(${a})+${b}` : a ?? b
    const turnValue = value('rotate', 0)
    const turn = sum(turnValue, phase('rotateRate', 'rotate', '_ftRr'))
    const offsetX = sum(value('offsetX', 0), phase('offsetXRate', 'x', '_ftXr'))
    const offsetY = sum(value('offsetY', 0), phase('offsetYRate', 'y', '_ftYr'))
    // Only Smooth reads the scale: its value held to the slider's range, times
    // the breathing of its rate.
    const zoom = smooth ? phase('scaleRate', 'scale', '_ftSr') : null
    if (zoom !== null) lines.push(`    ${transformZoomCpp(zoom)}`)
    const scale = !smooth || (value('scale', 1) === null && zoom === null) ? null
      : `constrain(${f('scale', 'scale', 1)},${floatLit(FRAME_SCALE.min)},${floatLit(FRAME_SCALE.max)})${zoom !== null ? '*_s' : ''}`
    if (turn === null && scale === null && offsetX === null && offsetY === null && !flipX && !flipY) {
      ln(`  ::memmove(${ob}, ${src}, sizeof(CRGB) * NUM_LEDS); // Frame Transform: no change`)
      return
    }
    const edge = frameTransformEdge(p.edgeMode)
    const bilinear = p.sampling !== 'nearest'
    // A turn only a property sets is a fixed count of quarter turns in Exact.
    const kernel = smooth
      ? smoothTransformCpp({ degrees: turn, scale, flipX, flipY, offsetX, offsetY })
      : exactTransformCpp({
        turns: turn === null ? 0 : turn === turnValue && !wired('rotate') ? frameQuarterTurns(p.rotate) : turn,
        flipX, flipY, offsetX, offsetY,
      })
    ln(`  { // Frame Transform: ${smooth ? `smooth, ${edge}, ${bilinear ? 'bilinear' : 'nearest'}` : 'exact'}`)
    for (const line of lines) ln(line)
    for (const line of kernel.frame) ln(`    ${line}`)
    ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
    for (const line of kernel.pixel) ln(`      ${line}`)
    if (smooth) {
      needsFrameSample.v = true
      ln(`      ${ob}[_y*WIDTH+_x]=_sampleFrame(${src},_sx,_sy,${FRAME_TRANSFORM_EDGES.indexOf(edge)},${bilinear}); } }`)
    } else {
      ln(`      ${ob}[_y*WIDTH+_x]=${src}[_sy*WIDTH+_sx]; } }`)
    }
  },
  Mask({ ln, ownBuf, srcBuf, seedFrom }) {
    const ob = ownBuf()
    const mask = srcBuf('mask')
    ln(`  { ${seedFrom('frame')}`)
    if (mask) ln(`    for (int _i = 0; _i < NUM_LEDS; _i++) ${ob}[_i].nscale8((${mask}[_i].r + ${mask}[_i].g + ${mask}[_i].b) / 3);`)
    ln(`  }`)
  },
  // Shift is in turns; _hsv wraps any hue, so a negative or >1 shift is safe.
  HueShift({ ln, f, ownBuf, seedFrom, needsHsv }) {
    needsHsv.v = true
    const ob = ownBuf()
    const shift = f('shift', 'shift', 0)
    ln(`  { ${seedFrom('frame')} float _dh = (${shift}) * 360.0f; for (int _i = 0; _i < NUM_LEDS; _i++) ${ob}[_i] = _hsvAdjust(${ob}[_i], _dh, 1.0f); }`)
  },
  // RGB→HSV→scale saturation→RGB, on the preview's wheel. Keep brightness
  // scales each channel's distance from the Rec. 709 luma instead, rounding
  // (+0.5f) as the preview's Math.round does.
  Saturation({ p, ln, f, ownBuf, seedFrom, needsHsv }) {
    const ob = ownBuf()
    const amount = f('amount', 'amount', 1)
    if (p.keepBrightness === true) {
      ln(`  { ${seedFrom('frame')} float _sm = fmaxf(0.0f, ${amount}); for (int _i = 0; _i < NUM_LEDS; _i++) {`)
      ln(`      float _l = ${ob}[_i].r * 0.2126f + ${ob}[_i].g * 0.7152f + ${ob}[_i].b * 0.0722f;`)
      for (const c of ['r', 'g', 'b']) ln(`      ${ob}[_i].${c} = (uint8_t)(constrain(_l + (${ob}[_i].${c} - _l) * _sm, 0.0f, 255.0f) + 0.5f);`)
      ln(`    } }`)
      return
    }
    needsHsv.v = true
    ln(`  { ${seedFrom('frame')} float _sm = ${amount}; for (int _i = 0; _i < NUM_LEDS; _i++) ${ob}[_i] = _hsvAdjust(${ob}[_i], 0.0f, _sm); }`)
  },
  Gamma({ ln, f, ownBuf, seedFrom }) {
    const ob = ownBuf()
    const g = f('gamma', 'gamma', 2.2)
    ln(`  { ${seedFrom('frame')} napplyGamma_video(${ob}, NUM_LEDS, max(0.1f, ${g})); }`)
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
    const mode = ['add', 'over'].includes(String(p.blendMode)) ? String(p.blendMode) : 'lighten'
    const countWired = incoming.has(`${node.id}:count`)
    const { min, max } = ARRAY_COPIES
    const countLit = Math.max(min, Math.min(max, Math.round(Number(p.count ?? 5))))
    ln(`  { // Array${countWired ? '' : ` x${countLit}`}`)
    ln(`    fill_solid(${ob}, NUM_LEDS, CRGB::Black);`)
    // A wired count is held to the slider's ARRAY_COPIES at runtime, as the evaluator holds it.
    if (countWired) ln(`    int _cnt=(int)(${f('count', 'count', 5)}+0.5f); _cnt=_cnt<${min}?${min}:(_cnt>${max}?${max}:_cnt);`)
    ln(`    for(int _i=${countWired ? '_cnt-1' : countLit - 1};_i>=0;_i--){`)
    // Integer kernel (shared/integerPatterns.ts): the floats run once a copy.
    for (const line of arrayCopyCpp('_i', `(${offX})`, `(${offY})`, `(${ang})`, scl, fo)) ln(`      ${line}`)
    ln(`      for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
    for (const line of ARRAY_SOURCE_CPP) ln(`        ${line}`)
    ln(`        if(_aSrc<0) continue;`)
    ln(`        CRGB _s=${src}[_aSrc]; uint8_t _r=(uint8_t)((_s.r*_adim)>>16),_g=(uint8_t)((_s.g*_adim)>>16),_b=(uint8_t)((_s.b*_adim)>>16);`)
    ln(`        CRGB& _o=${ob}[_y*WIDTH+_x];`)
    if (mode === 'add') {
      ln(`        _o.r=qadd8(_o.r,_r); _o.g=qadd8(_o.g,_g); _o.b=qadd8(_o.b,_b);`)
    } else if (mode === 'over') {
      ln(`        uint8_t _cov=max(_r,max(_g,_b));`)
      ln(`        _o.r=${ARRAY_OVER_CPP('_o.r', '_cov', '_r')}; _o.g=${ARRAY_OVER_CPP('_o.g', '_cov', '_g')}; _o.b=${ARRAY_OVER_CPP('_o.b', '_cov', '_b')};`)
    } else {
      ln(`        _o.r=max(_o.r,_r); _o.g=max(_o.g,_g); _o.b=max(_o.b,_b);`)
    }
    ln(`      } } }`)
  },
  // Frame blend with real blend modes — `blendMode` picks the operator,
  // `amount` is opacity (0–255). Keep in sync with the `Blend` evaluator.
  // Every mode, normal included, blends per channel in the integer kernel
  // and cross-fades against the base by the opacity byte.
  Blend({ p, ln, f, ownBuf, srcBuf }) {
    const ob = ownBuf()
    // `amount` is opacity 0–1; the kernel wants a byte.
    const a = srcBuf('a'), b = srcBuf('b'), amt = f('amount', 'amount', 0.5)
    const mode = BLEND_NODE_MODES.includes(String(p.blendMode)) ? String(p.blendMode) : 'normal'
    // A wired mask scales the opacity per pixel by its brightness, as the
    // evaluator does.
    const mask = srcBuf('mask')
    ln(`  { ${a ? `::memmove(${ob}, ${a}, sizeof(CRGB) * NUM_LEDS);` : `fill_solid(${ob}, NUM_LEDS, CRGB::Black);`}`)
    // Nothing on B yet (a fresh splice): A passes through in every mode.
    if (!b) {
      ln(`  }`)
      return
    }
    // Integer blend (shared/integerPatterns.ts): the opacity is a byte, a
    // mask's brightness scales it per pixel.
    const mix = (c: string) => blendMix8Cpp(mode, `_a.${c}`, `_b.${c}`, '_op8')
    ln(`    uint8_t _opAll=(uint8_t)(constrain(${amt},0.0f,1.0f)*255.0f); for(int _i=0;_i<NUM_LEDS;_i++){`)
    if (mask) ln(`      uint8_t _op8=(uint8_t)((((uint32_t)_opAll*((${mask}[_i].r+${mask}[_i].g+${mask}[_i].b)/3))+1)*257>>16);`)
    else ln(`      uint8_t _op8=_opAll;`)
    ln(`      CRGB _a=${ob}[_i], _b=${b}[_i];`)
    ln(`      ${ob}[_i]=CRGB(${mix('r')},${mix('g')},${mix('b')}); } }`)
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
    // Diagonal folds across the corner-to-corner line (./mirror.ts), and
    // declares the glow's partner itself.
    if (mode === 'diagonal') for (const line of diagonalFoldCpp(glow)) ln(`    ${line}`)
    if (glow) {
      // additive bloom: base + glowAmount× the discarded partner, tinted
      // per-channel by the `color` input (white neutral). scale8 chain = g/255.
      const g = f('glowAmount', 'glowAmount', 0.35)
      const tintE = channelColor('color', 255, 255, 255)
      if (mode !== 'diagonal') ln(`    int _ax=_x,_ay=_y;`)
      if (mode === 'horizontal' || mode === 'quad') ln(`    _ax=max(_x,WIDTH-1-_x);`)
      if (mode === 'vertical' || mode === 'quad') ln(`    _ay=max(_y,HEIGHT-1-_y);`)
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
