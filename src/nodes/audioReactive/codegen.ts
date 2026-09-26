import { audioFlowExpr } from '../../state/audioFlowRange'
import { animartrixCppLines } from '../../animartrix/codegen'
import type { NodeEmitters } from '../../codegen/emitContext'
import { floatLit, seedProp } from '../../codegen/cppLiterals'
import { BEAT_FLASH_ATTACK_MAX_SEC, VOCAL_AURORA_MIN_INPUT_GAIN, VOCAL_AURORA_MAX_INPUT_GAIN } from './evaluate'

export const AUDIO_REACTIVE_EMITTERS: NodeEmitters = {
  SpectrumBars({ node, p, ln, f, ownBuf, paletteExpr, needsT }) {
    needsT.v = true
    const ob = ownBuf()
    // Test Signal is preview-only; an unwired firmware pattern rests at 0.
    const bass = f('bass', 'bass', 0)
    const mids = f('mids', 'mids', 0)
    const treble = f('treble', 'treble', 0)
    const energy = f('energy', 'energy', 0.7)
    const speed = f('speed', 'speed', 0.6)
    const pal = paletteExpr(node.id, 'paletteIn', p)
    const mirror = p.mirror !== false
    ln(`  {`)
    ln(`    fill_solid(${ob}, NUM_LEDS, CRGB::Black);`)
    ln(`    float _b = min(1.0f, max(0.0f, ${bass})), _m = min(1.0f, max(0.0f, ${mids})), _t = min(1.0f, max(0.0f, ${treble}));`)
    ln(`    float _strength = min(1.0f, max(0.0f, ${energy}));`)
    ln(`    float _spd = min(1.0f, max(0.0f, ${speed}));`)
    ln(`    const int _cols = max(1, ${mirror ? '((WIDTH + 1) / 2)' : 'WIDTH'});`)
    ln(`    float _levels[3] = { _b, _m, _t };`)
    ln(`    float _geometryMotion = t * (0.45f + _spd * 3.2f);`)
    ln(`    float _paletteScroll = t * (0.08f + _spd * 0.42f);`)
    ln(`    for (int _x = 0; _x < _cols; _x++) {`)
    ln(`      float _nx = _cols <= 1 ? 0.0f : (float)_x / (float)(_cols - 1);`)
    ln(`      float _spec = _nx * 2.0f;`)
    ln(`      int _left = (int)floorf(_spec);`)
    ln(`      int _right = min(2, _left + 1);`)
    ln(`      float _mix = _spec - (float)_left;`)
    ln(`      float _base = _levels[_left] * (1.0f - _mix) + _levels[_right] * _mix;`)
    ln(`      float _ripple = sinf(_nx * 10.5f - _geometryMotion * (1.1f + _t * 1.8f)) * 0.08f * _strength;`)
    ln(`      float _shimmer = max(0.0f, sinf(_nx * 21.0f + _geometryMotion * (2.0f + _m * 2.5f))) * 0.06f * _t * _strength;`)
    ln(`      float _level = min(1.0f, max(0.0f, _base * (0.45f + _strength * 0.9f) + _ripple + _shimmer));`)
    ln(`      int _barH = max(0, (int)roundf(_level * HEIGHT));`)
    ln(`      for (int _row = 0; _row < _barH; _row++) {`)
    ln(`        int _y = HEIGHT - 1 - _row;`)
    ln(`        float _vertical = HEIGHT <= 1 ? 0.0f : (float)_row / (float)(HEIGHT - 1);`)
    ln(`        float _pulse = 0.72f + 0.28f * sinf(_vertical * 6.2f - _geometryMotion * (1.4f + _b * 1.6f));`)
    ln(`        float _v = min(1.0f, max(0.0f, (0.28f + _vertical * 0.72f) * _pulse));`)
    ln(`        float _pt = _nx + _paletteScroll + _vertical * (0.12f + _m * 0.12f) + _spec * 0.08f;`)
    ln(`        CRGB _px = ColorFromPalette(${pal}, (uint8_t)(_pt * 255));`)
    ln(`        _px.nscale8((uint8_t)(_v * 255));`)
    ln(`        ${ob}[_y * WIDTH + _x] = _px;`)
    if (mirror) ln(`        ${ob}[_y * WIDTH + (WIDTH - 1 - _x)] = _px;`)
    ln(`      }`)
    ln(`      if (_barH > 0) {`)
    ln(`        int _peakY = max(0, HEIGHT - _barH);`)
    ln(`        CRGB _peak = ColorFromPalette(${pal}, (uint8_t)((_nx + _paletteScroll + _spec * 0.08f) * 255));`)
    ln(`        _peak.nscale8((uint8_t)(min(1.0f, 0.6f + _t * 0.35f + _strength * 0.2f) * 255));`)
    ln(`        ${ob}[_peakY * WIDTH + _x] = _peak;`)
    if (mirror) ln(`        ${ob}[_peakY * WIDTH + (WIDTH - 1 - _x)] = _peak;`)
    ln(`      }`)
    ln(`    }`)
    ln(`  }`)
  },
  SpectrumVisualizer({ node, id, p, ln, f, ownBuf, hasExplicitAudioInput, paletteExpr }) {
    const ob = ownBuf()
    const style = String(p.style ?? 'Bars')
    // `bands` sizes a stack array and composes literals of its own
    // (`${bands - 1}.0f`), so it has nothing to branch on at runtime and
    // stays a property. The rest become per-frame locals, each keeping the
    // clamp it had as a TypeScript `Math.max`/`Math.min` so the bound still
    // holds on a wired value — these knobs are not normalised, so an audio
    // band wired straight in arrives outside every one of these domains.
    const bands = Math.max(4, Math.min(32, Math.round(Number(p.bands ?? 16))))
    const pal = paletteExpr(node.id, 'paletteIn', p)
    const audioConnected = hasExplicitAudioInput(node.id)
    ln(`  { // SpectrumVisualizer · ${style}`)
    ln(`    static float _svLevel_${id}[WIDTH]={0},_svPeak_${id}[WIDTH]={0},_svVelocity_${id}[WIDTH]={0};`)
    ln(`    static uint32_t _svHold_${id}[WIDTH]={0},_svLast_${id}=0;`)
    ln(`    uint32_t _svNow=millis(); float _svDt=_svLast_${id} ? constrain((_svNow-_svLast_${id})/1000.0f,0.0f,0.1f) : (1.0f/60.0f); _svLast_${id}=_svNow;`)
    ln(`    float _svGain=constrain(${f('gain', 'gain', 1.25)},0.25f,4.0f);`)
    ln(`    float _svSmooth=constrain(${f('smoothing', 'smoothing', 0.58)},0.0f,0.95f);`)
    ln(`    float _svTilt=constrain(${f('tilt', 'tilt', 0.2)},0.0f,1.0f)*1.8f;`)
    ln(`    uint32_t _svHoldMs=(uint32_t)constrain((${f('peakHold', 'peakHold', 0.42)})*1000.0f,0.0f,2000.0f);`)
    ln(`    float _svGrav=constrain(${f('peakGravity', 'peakGravity', 1.8)},0.2f,6.0f);`)
    ln(`    float _svBands[${bands}]={0};`)
    ln(`    for(int _b=0;_b<${bands};_b++){ int _lo=(_b*32)/${bands},_hi=max(_lo+1,((_b+1)*32)/${bands}); float _sum=0.0f; for(int _i=_lo;_i<_hi;_i++) _sum+=${audioConnected ? '_audioSpectrum[_i]' : '0.0f'}; _svBands[_b]=_sum/(_hi-_lo); }`)
    ln(`    float _svRetain=powf(_svSmooth,_svDt*60.0f);`)
    ln(`    for(int _x=0;_x<WIDTH;_x++){`)
    ln(`      float _pos=WIDTH<=1?0.0f:_x/(float)(WIDTH-1)*${bands - 1}.0f; int _left=(int)floorf(_pos),_right=min(${bands - 1},_left+1); float _mix=_pos-_left;`)
    ln(`      float _freq=${bands <= 1 ? '0.0f' : `_pos/${bands - 1}.0f`}; float _raw=_svBands[_left]*(1.0f-_mix)+_svBands[_right]*_mix; float _target=constrain(_raw*_svGain*(1.0f+_freq*_svTilt),0.0f,1.0f);`)
    ln(`      _svLevel_${id}[_x]=_svLevel_${id}[_x]*_svRetain+_target*(1.0f-_svRetain);`)
    ln(`      if(_svLevel_${id}[_x]>=_svPeak_${id}[_x]){ _svPeak_${id}[_x]=_svLevel_${id}[_x]; _svVelocity_${id}[_x]=0.0f; _svHold_${id}[_x]=_svNow+_svHoldMs; }`)
    ln(`      else if((int32_t)(_svNow-_svHold_${id}[_x])>=0){ _svVelocity_${id}[_x]+=_svGrav*_svDt; _svPeak_${id}[_x]=max(_svLevel_${id}[_x],_svPeak_${id}[_x]-_svVelocity_${id}[_x]*_svDt); }`)
    ln(`    }`)
    ln(`    auto _svColor=[&](float _amount,float _brightness)->CRGB{ return ColorFromPalette(${pal},(uint8_t)(constrain(0.14f+_amount*0.82f,0.0f,1.0f)*255.0f),(uint8_t)(constrain(_brightness,0.0f,1.0f)*255.0f),LINEARBLEND); };`)

    if (style === 'Waterfall') {
      ln(`    static uint32_t _svWaterfall_${id}=0; if(!_svWaterfall_${id})_svWaterfall_${id}=_svNow;`)
      ln(`    float _svWfSpeed=constrain(${f('waterfallSpeed', 'waterfallSpeed', 10)},1.0f,30.0f);`)
      ln(`    int _steps=min(HEIGHT,(int)((_svNow-_svWaterfall_${id})*_svWfSpeed/1000.0f));`)
      ln(`    if(_steps>0){ _svWaterfall_${id}+=(uint32_t)(_steps*(1000.0f/_svWfSpeed)); for(int _step=0;_step<_steps;_step++){`)
      ln(`      if(HEIGHT>1)::memmove(${ob},${ob}+WIDTH,sizeof(CRGB)*WIDTH*(HEIGHT-1));`)
      ln(`      for(int _x=0;_x<WIDTH;_x++){ float _lv=constrain(_svLevel_${id}[_x],0.0f,1.0f); ${ob}[(HEIGHT-1)*WIDTH+_x]=_lv<0.02f?CRGB::Black:_svColor(_lv,0.25f+_lv*0.75f); }`)
      ln(`    } }`)
    } else if (style === 'Orbit') {
      ln(`    fill_solid(${ob},NUM_LEDS,CRGB::Black); float _cx=(WIDTH-1)*0.5f,_cy=(HEIGHT-1)*0.5f,_minDim=max(2,min(WIDTH,HEIGHT)); float _pixelRadius=0.72f/_minDim;`)
      ln(`    for(int _y=0;_y<HEIGHT;_y++)for(int _x=0;_x<WIDTH;_x++){ float _dx=(_x-_cx)/_minDim,_dy=(_y-_cy)/_minDim,_radius=hypotf(_dx,_dy); float _angle=fmodf(atan2f(_dy,_dx)+TWO_PI*1.25f,TWO_PI)/TWO_PI; int _col=min(WIDTH-1,(int)(_angle*WIDTH)); float _lv=_svLevel_${id}[_col],_peak=_svPeak_${id}[_col]; float _outer=0.15f+_lv*0.32f,_peakRadius=0.15f+_peak*0.32f; if(_peak>0.015f&&fabsf(_radius-_peakRadius)<=_pixelRadius)${ob}[_y*WIDTH+_x]=ColorFromPalette(${pal},(uint8_t)(_angle*255.0f),255,LINEARBLEND); else if(_radius>=0.15f&&_radius<=_outer)${ob}[_y*WIDTH+_x]=ColorFromPalette(${pal},(uint8_t)(_angle*255.0f),(uint8_t)((0.34f+_lv*0.66f)*255.0f),LINEARBLEND); }`)
    } else if (style === 'Centre Mirror') {
      ln(`    fill_solid(${ob},NUM_LEDS,CRGB::Black); int _upper=(HEIGHT-1)/2,_lower=HEIGHT/2,_reach=max(1,HEIGHT/2);`)
      ln(`    for(int _x=0;_x<WIDTH;_x++){ int _len=(int)roundf(_svLevel_${id}[_x]*_reach); for(int _row=0;_row<_len;_row++){ float _amount=_reach<=1?1.0f:_row/(float)(_reach-1); CRGB _c=_svColor(_amount,0.4f+_amount*0.6f); if(_upper-_row>=0)${ob}[(_upper-_row)*WIDTH+_x]=_c; if(_lower+_row<HEIGHT)${ob}[(_lower+_row)*WIDTH+_x]=_c; } int _po=(int)roundf(_svPeak_${id}[_x]*_reach); if(_svPeak_${id}[_x]>0.015f){ CRGB _p=_svColor(_svPeak_${id}[_x],1.0f); if(_upper-_po>=0)${ob}[(_upper-_po)*WIDTH+_x]=_p; if(_lower+_po<HEIGHT)${ob}[(_lower+_po)*WIDTH+_x]=_p; } }`)
    } else {
      const ribbon = style === 'Ribbon'
      ln(`    fill_solid(${ob},NUM_LEDS,CRGB::Black);`)
      ln(`    for(int _x=0;_x<WIDTH;_x++){ int _barH=(int)roundf(_svLevel_${id}[_x]*HEIGHT); for(int _row=0;_row<_barH;_row++){ int _y=HEIGHT-1-_row; float _amount=HEIGHT<=1?1.0f:_row/(float)(HEIGHT-1); float _brightness=${ribbon ? '(_row==_barH-1?1.0f:0.18f+_amount*0.42f)' : '0.34f+_amount*0.66f'}; ${ob}[_y*WIDTH+_x]=_svColor(_amount,_brightness); } int _py=HEIGHT-1-(int)roundf(_svPeak_${id}[_x]*(HEIGHT-1)); if(_svPeak_${id}[_x]>0.015f&&_py>=0&&_py<HEIGHT)${ob}[_py*WIDTH+_x]=_svColor(_svPeak_${id}[_x],1.0f); }`)
    }
    if (!audioConnected) ln(`    // Connect an Audio source to populate the spectrum on-device.`)
    ln(`  }`)
  },
  BassPulse({ node, p, ln, f, ownBuf, paletteExpr }) {
    const ob = ownBuf()
    const pal = paletteExpr(node.id, 'paletteIn', p)
    const bass = f('bass', 'bass', 0)
    ln(`  { float _lv = constrain(${bass}, 0.0f, 1.0f); float _v = sqrtf(_lv);`)
    ln(`    CRGB _c = ColorFromPalette(${pal}, (uint8_t)(_lv * 255)); _c.nscale8((uint8_t)(_v * 255));`)
    ln(`    fill_solid(${ob}, NUM_LEDS, _c); }`)
  },
  BassRings({ node, p, ln, f, ownBuf, paletteExpr, needsT }) {
    needsT.v = true
    const ob = ownBuf()
    const bass = f('bass', 'bass', 0.5)
    const energy = f('energy', 'energy', 0.7)
    const speed = f('speed', 'speed', 1)
    const pal = paletteExpr(node.id, 'paletteIn', p)
    ln(`  {`)
    ln(`    float _b = min(1.0f, max(0.0f, ${bass}));`)
    ln(`    float _strength = min(1.0f, max(0.0f, ${energy}));`)
    ln(`    float _spd = min(1.0f, max(0.0f, ${speed}));`)
    ln(`    float _cx = WIDTH * 0.5f, _cy = HEIGHT * 0.5f, _maxD = sqrtf(_cx * _cx + _cy * _cy);`)
    ln(`    float _motion = _spd * (0.75f + _b * 1.75f * _strength);`)
    ln(`    float _phase = t * (1.2f + _motion * 4.8f);`)
    ln(`    float _rings = 4.0f + _b * 8.0f * _strength;`)
    ln(`    float _floor = 0.04f + _b * 0.1f * _strength;`)
    ln(`    float _gain = 0.16f + _b * 0.84f * _strength;`)
    ln(`    for (int _y = 0; _y < HEIGHT; _y++) for (int _x = 0; _x < WIDTH; _x++) {`)
    ln(`      float _dx = _x - _cx, _dy = _y - _cy;`)
    ln(`      float _dist = sqrtf(_dx * _dx + _dy * _dy) / max(0.0001f, _maxD);`)
    ln(`      float _wave = sinf(_dist * _rings * 6.2831853f - _phase);`)
    ln(`      float _crisp = powf(max(0.0f, _wave * 0.5f + 0.5f), 2.4f);`)
    ln(`      float _v = min(1.0f, _floor + _crisp * _gain);`)
    ln(`      int _i = _y * WIDTH + _x;`)
    ln(`      ${ob}[_i] = ColorFromPalette(${pal}, (uint8_t)(_dist * 255));`)
    ln(`      ${ob}[_i].nscale8((uint8_t)(_v * 255));`)
    ln(`    }`)
    ln(`  }`)
  },
  MidrangeWaves({ node, p, ln, f, ownBuf, paletteExpr, needsT }) {
    needsT.v = true
    const ob = ownBuf()
    const mids = f('mids', 'mids', 0.5)
    const energy = f('energy', 'energy', 0.7)
    const speed = f('speed', 'speed', 1)
    const pal = paletteExpr(node.id, 'paletteIn', p)
    ln(`  {`)
    ln(`    float _m = ${mids}, _intensity = ${energy}, _spd = ${speed};`)
    ln(`    for (int _y = 0; _y < HEIGHT; _y++) for (int _x = 0; _x < WIDTH; _x++) {`)
    ln(`      float _mAmt = min(1.0f, max(0.0f, _m));`)
    ln(`      float _strength = min(1.0f, max(0.0f, _intensity));`)
    ln(`      float _motion = _spd * (1.0f + _mAmt * 1.5f * _strength);`)
    ln(`      float _contrast = 0.7f + _mAmt * 1.8f * _strength;`)
    ln(`      float _wBase = sin(_x * 0.8f + t * _motion * 4) * sin(_y * 0.5f + t * _motion * 2.5f);`)
    ln(`      float _w = min(1.0f, max(-1.0f, _wBase * _contrast));`)
    ln(`      float _int = min(1.0f, 0.1f + powf(_mAmt, 0.65f) * 1.25f * _strength);`)
    ln(`      float _v = (_w + 1) / 2.0f * _int;`)
    ln(`      ${ob}[_y * WIDTH + _x] = ColorFromPalette(${pal}, (uint8_t)((_w + 1) * 127.5f));`)
    ln(`      ${ob}[_y * WIDTH + _x].nscale8((uint8_t)(_v * 255));`)
    ln(`    }`)
    ln(`  }`)
  },
  MidrangeBloom({ node, p, ln, f, ownBuf, paletteExpr, needsT }) {
    needsT.v = true
    const ob = ownBuf()
    const mids = f('mids', 'mids', 0.5)
    const energy = f('energy', 'energy', 0.7)
    const speed = f('speed', 'speed', 1)
    const pal = paletteExpr(node.id, 'paletteIn', p)
    ln(`  {`)
    ln(`    float _m = ${mids}, _intensity = ${energy}, _spd = ${speed};`)
    ln(`    float _mAmt = min(1.0f, max(0.0f, _m));`)
    ln(`    float _strength = min(1.0f, max(0.0f, _intensity));`)
    ln(`    float _motion = min(1.0f, max(0.0f, _spd)) * (0.8f + _mAmt * 2.2f * _strength);`)
    ln(`    float _cx0 = (WIDTH - 1) / 2.0f, _cy0 = (HEIGHT - 1) / 2.0f;`)
    ln(`    float _sx = max(1.0f, WIDTH / 2.0f), _sy = max(1.0f, HEIGHT / 2.0f);`)
    ln(`    for (int _y = 0; _y < HEIGHT; _y++) for (int _x = 0; _x < WIDTH; _x++) {`)
    ln(`      float _cx = (_x - _cx0) / _sx, _cy = (_y - _cy0) / _sy;`)
    ln(`      float _radial = sqrtf(_cx * _cx + _cy * _cy);`)
    ln(`      float _swirl = sinf((_cx * _cx - _cy * _cy) * 6 + t * _motion * 3.2f) + cosf((_cx + _cy) * 4 - t * _motion * 2.4f);`)
    ln(`      float _bloom = sinf(_radial * (5.0f + _mAmt * 8.0f * _strength) * 3.14159265f - t * _motion * 4.0f + _swirl * 0.6f);`)
    ln(`      float _crisp = powf(max(0.0f, _bloom * 0.5f + 0.5f), 1.8f);`)
    ln(`      float _v = min(1.0f, _crisp * (0.22f + _mAmt * 0.78f * _strength));`)
    ln(`      float _pt = _radial * 0.6f + _swirl * 0.12f + t * _motion * 0.05f;`)
    ln(`      ${ob}[_y * WIDTH + _x] = ColorFromPalette(${pal}, (uint8_t)(_pt * 255));`)
    ln(`      ${ob}[_y * WIDTH + _x].nscale8((uint8_t)(_v * 255));`)
    ln(`    }`)
    ln(`  }`)
  },
  TrebleSparks({ node, p, ln, f, ownBuf, paletteExpr }) {
    const ob = ownBuf()
    const treble = f('treble', 'treble', 0.5)
    const density = f('density', 'density', 0.5)
    const pal = paletteExpr(node.id, 'paletteIn', p)
    ln(`  {`)
    ln(`    float _t = ${treble}, _d = ${density};`)
    ln(`    fadeToBlackBy(${ob}, NUM_LEDS, (uint8_t)(110 + (1.0f - constrain(_t, 0.0f, 1.0f)) * 40));`)
    ln(`    int _spawns = (int)(NUM_LEDS * constrain(_d, 0.0f, 1.0f) * (0.03f + constrain(_t, 0.0f, 1.0f) * 0.12f));`)
    ln(`    if (_spawns < 1 && _d * _t > 0.05f) _spawns = 1;`)
    ln(`    uint8_t _spawnChance = (uint8_t)(51 + constrain(_t, 0.0f, 1.0f) * 204);`)
    ln(`    for (int _s = 0; _s < _spawns; _s++) if (random8() <= _spawnChance) {`)
    ln(`      int _x = random16(WIDTH), _y = random16(HEIGHT), _i = _y * WIDTH + _x;`)
    ln(`      CRGB _spark = blend(ColorFromPalette(${pal}, random8()), CRGB::White, (uint8_t)(89 + constrain(_t, 0.0f, 1.0f) * 89));`)
    ln(`      _spark.nscale8((uint8_t)(min(255.0f, (0.7f + constrain(_t, 0.0f, 1.0f) * 0.6f) * (140 + random8(116)))));`)
    ln(`      ${ob}[_i] += _spark;`)
    ln(`      CRGB _edge = _spark; _edge.nscale8((uint8_t)(107));`)
    ln(`      if (_x > 0) ${ob}[_i - 1] += _edge; if (_x + 1 < WIDTH) ${ob}[_i + 1] += _edge;`)
    ln(`      if (_y > 0) ${ob}[_i - WIDTH] += _edge; if (_y + 1 < HEIGHT) ${ob}[_i + WIDTH] += _edge;`)
    ln(`      CRGB _corner = _spark; _corner.nscale8((uint8_t)(41));`)
    ln(`      if (_x > 0 && _y > 0) ${ob}[_i - WIDTH - 1] += _corner;`)
    ln(`      if (_x + 1 < WIDTH && _y > 0) ${ob}[_i - WIDTH + 1] += _corner;`)
    ln(`      if (_x > 0 && _y + 1 < HEIGHT) ${ob}[_i + WIDTH - 1] += _corner;`)
    ln(`      if (_x + 1 < WIDTH && _y + 1 < HEIGHT) ${ob}[_i + WIDTH + 1] += _corner;`)
    ln(`    }`)
    ln(`  }`)
  },
  TreblePrism({ node, p, ln, f, ownBuf, paletteExpr, needsT }) {
    needsT.v = true
    const ob = ownBuf()
    const treble = f('treble', 'treble', 0.5)
    const energy = f('energy', 'energy', 0.7)
    const speed = f('speed', 'speed', 1)
    const pal = paletteExpr(node.id, 'paletteIn', p)
    ln(`  {`)
    ln(`    float _t = min(1.0f, max(0.0f, ${treble}));`)
    ln(`    float _strength = min(1.0f, max(0.0f, ${energy}));`)
    ln(`    float _spd = min(1.0f, max(0.0f, ${speed}));`)
    ln(`    float _motion = _spd * (1.2f + _t * 3.2f * _strength);`)
    ln(`    for (int _y = 0; _y < HEIGHT; _y++) for (int _x = 0; _x < WIDTH; _x++) {`)
    ln(`      float _diagA = _x * 1.7f + _y * 1.15f, _diagB = _x * -1.1f + _y * 1.9f;`)
    ln(`      float _waveA = sinf(_diagA + t * _motion * 7.5f);`)
    ln(`      float _waveB = sinf(_diagB - t * _motion * 6.1f);`)
    ln(`      float _prism = max(0.0f, _waveA * 0.55f + _waveB * 0.45f);`)
    ln(`      float _shard = powf(_prism, 3.6f);`)
    ln(`      float _flash = powf(max(0.0f, sinf((_x + _y) * 2.4f - t * _motion * 9.0f) * 0.5f + 0.5f), 10.0f);`)
    ln(`      float _v = min(1.0f, _shard * (0.3f + _t * 0.7f * _strength) + _flash * _t * 0.9f * _strength);`)
    ln(`      float _pt = (_x + _y) / (float)(WIDTH + HEIGHT);`)
    ln(`      int _i = _y * WIDTH + _x;`)
    ln(`      ${ob}[_i] = ColorFromPalette(${pal}, (uint8_t)(_pt * 255));`)
    ln(`      ${ob}[_i].nscale8((uint8_t)(_v * 255));`)
    ln(`    }`)
    ln(`  }`)
  },
  AudioCascade({ node, p, ln, f, ownBuf, paletteExpr, needsT }) {
    needsT.v = true
    const ob = ownBuf()
    const bass = f('bass', 'bass', 0.5)
    const mids = f('mids', 'mids', 0.5)
    const treble = f('treble', 'treble', 0.5)
    const energy = f('energy', 'energy', 0.7)
    const speed = f('speed', 'speed', 1)
    const pal = paletteExpr(node.id, 'paletteIn', p)
    ln(`  {`)
    ln(`    float _b = min(1.0f, max(0.0f, ${bass})), _m = min(1.0f, max(0.0f, ${mids})), _t = min(1.0f, max(0.0f, ${treble}));`)
    ln(`    float _strength = min(1.0f, max(0.0f, ${energy}));`)
    ln(`    float _spd = min(1.0f, max(0.0f, ${speed}));`)
    ln(`    float _motion = _spd * (0.8f + (_b + _m + _t) * 1.4f * _strength);`)
    ln(`    for (int _y = 0; _y < HEIGHT; _y++) for (int _x = 0; _x < WIDTH; _x++) {`)
    ln(`      float _nx = WIDTH > 1 ? (float)_x / (float)(WIDTH - 1) : 0.0f;`)
    ln(`      float _ny = HEIGHT > 1 ? (float)_y / (float)(HEIGHT - 1) : 0.0f;`)
    ln(`      float _ribbon = sinf((_nx * 7.0f + _ny * 2.5f) + t * _motion * (2.0f + _m * 3.0f * _strength));`)
    ln(`      float _sweep = cosf((_ny * 9.0f - _nx * 3.0f) - t * _motion * (1.4f + _b * 2.2f * _strength));`)
    ln(`      float _shimmer = powf(max(0.0f, sinf((_nx + _ny) * 18.0f + t * _motion * (4.0f + _t * 8.0f * _strength)) * 0.5f + 0.5f), 6.0f);`)
    ln(`      float _body = max(0.0f, _ribbon * 0.55f + _sweep * 0.45f);`)
    ln(`      float _v = min(1.0f, _body * (0.18f + _m * 0.52f * _strength) + _b * 0.24f * _strength + _shimmer * _t * 0.85f * _strength);`)
    ln(`      float _pt = _nx * (0.2f + _b * 0.5f) + _ny * (0.35f + _m * 0.45f) + _shimmer * 0.15f + t * _motion * 0.03f;`)
    ln(`      ${ob}[_y * WIDTH + _x] = ColorFromPalette(${pal}, (uint8_t)(_pt * 255));`)
    ln(`      ${ob}[_y * WIDTH + _x].nscale8((uint8_t)(_v * 255));`)
    ln(`    }`)
    ln(`  }`)
  },
  BeatFlash({ node, id, p, ln, f, channelColor, ownBuf, seedFrom, incoming, boolExpr, paletteExpr }) {
    const ob = ownBuf()
    const beat = boolExpr(node.id, 'beat')
    const attack = f('attack', 'attack', 0)
    const decay = f('decay', 'decay', 0.85)
    const intensity = f('intensity', 'intensity', 1)
    const blendMode = String(p.blendMode ?? 'screen') === 'add' ? 'add' : 'screen'
    const preserveBase = p.preserveBase !== false
    const paletteWired = incoming.has(`${node.id}:paletteIn`)
    const usePalette = paletteWired || String(p.palette ?? 'none') !== 'none'
    const flashPal = usePalette ? paletteExpr(node.id, 'paletteIn', p) : null
    const flashColor = channelColor(null, 255, 255, 255)
    ln(`  {`)
    ln(`    ${seedFrom('frame')}`)
    ln(`    static float _flash_${id} = 0; static bool _flashRise_${id} = false;`)
    ln(`    float _fAtkSec_${id} = max(0.0f, ${attack}) * ${BEAT_FLASH_ATTACK_MAX_SEC}f;`)
    ln(`    float _fAtkStep_${id} = _fAtkSec_${id} > 0 ? min(1.0f, 1.0f / (_fAtkSec_${id} * 60.0f)) : 1.0f;`)
    ln(`    if (${beat}) _flashRise_${id} = true;`)
    ln(`    if (_flashRise_${id}) { _flash_${id} = min(1.0f, _flash_${id} + _fAtkStep_${id}); if (_flash_${id} >= 1.0f) _flashRise_${id} = false; }`)
    ln(`    else _flash_${id} *= ${decay};`)
    ln(`    if (_flash_${id} >= 0.003f) {`)
    ln(`      float _feff_${id} = max(0.0f, _flash_${id} * ${intensity});`)
    ln(`      CRGB _fc_${id} = ${flashPal ? `ColorFromPalette(${flashPal}, (uint8_t)((1.0f - _flash_${id}) * 255))` : flashColor};`)
    ln(`      for (int _i = 0; _i < NUM_LEDS; _i++) {`)
    if (!preserveBase) {
      ln(`        ${ob}[_i] = CRGB((uint8_t)min(255.0f, _fc_${id}.r * _feff_${id}), (uint8_t)min(255.0f, _fc_${id}.g * _feff_${id}), (uint8_t)min(255.0f, _fc_${id}.b * _feff_${id}));`)
    } else if (blendMode === 'add') {
      ln(`        ${ob}[_i].r = qadd8(${ob}[_i].r, (uint8_t)min(255.0f, _fc_${id}.r * _feff_${id}));`)
      ln(`        ${ob}[_i].g = qadd8(${ob}[_i].g, (uint8_t)min(255.0f, _fc_${id}.g * _feff_${id}));`)
      ln(`        ${ob}[_i].b = qadd8(${ob}[_i].b, (uint8_t)min(255.0f, _fc_${id}.b * _feff_${id}));`)
    } else {
      ln(`        ${ob}[_i].r = qadd8(${ob}[_i].r, (uint8_t)max(0.0f, ((float)_fc_${id}.r - ${ob}[_i].r) * _feff_${id}));`)
      ln(`        ${ob}[_i].g = qadd8(${ob}[_i].g, (uint8_t)max(0.0f, ((float)_fc_${id}.g - ${ob}[_i].g) * _feff_${id}));`)
      ln(`        ${ob}[_i].b = qadd8(${ob}[_i].b, (uint8_t)max(0.0f, ((float)_fc_${id}.b - ${ob}[_i].b) * _feff_${id}));`)
    }
    ln(`      }`)
    ln(`    }`)
    ln(`  }`)
  },
  KickShock({ node, id, p, ln, f, ownBuf, paletteExpr, needsT }) {
    needsT.v = true
    const ob = ownBuf()
    const kick = f('kick', 'kick', 0)
    const snare = f('snare', 'snare', 0)
    const hihat = f('hihat', 'hihat', 0)
    const energy = f('energy', 'energy', 0.7)
    const speed = f('speed', 'speed', 1)
    const tiles = f('tiles', 'tiles', 1)
    const pal = paletteExpr(node.id, 'paletteIn', p)
    // `count` sizes the static shock pool below and stays a property;
    // the multipliers are per-frame locals, so a control can drive them.
    const CAP = Math.max(1, Math.round(Number(p.count ?? 8)))
    const spreadF = `_ksSpread`
    const additive = String(p.blendMode ?? 'add') !== 'max'
    const lifeK = '1.9f*_ksLife', lifeS = '1.0f*_ksLife'
    const bandK = '0.10f*_ksBand', bandS = '0.055f*_ksBand'
    ln(`  { // KickShock`)
    ln(`    static float _ksBorn_${id}[${CAP}]; static float _ksX_${id}[${CAP}]; static float _ksY_${id}[${CAP}]; static uint8_t _ksKind_${id}[${CAP}]; static bool _ksAlive_${id}[${CAP}]; static bool _ksInit_${id}=false; static uint8_t _ksNext_${id}=0; static bool _ksPrevKick_${id}=false,_ksPrevSnare_${id}=false;`)
    ln(`    float _ksSpread=constrain(${f('spawnSpread', 'spawnSpread', 0)}, 0.0f, 1.0f);`)
    ln(`    float _ksLife=fmaxf(0.05f, ${f('decay', 'decay', 1)});`)
    ln(`    float _ksBand=fmaxf(0.05f, ${f('thickness', 'thickness', 1)});`)
    ln(`    if(!_ksInit_${id}){ for(int _i=0;_i<${CAP};_i++) _ksAlive_${id}[_i]=false; _ksInit_${id}=true; }`)
    ln(`    float _spd=${speed},_strength=min(1.0f,max(0.0f,${energy})),_hihatAmt=min(1.0f,max(0.0f,${hihat})); int _tiles=max(1,min(8,(int)roundf(${tiles})));`)
    ln(`    bool _kickHit=(${kick})>0.5f, _snareHit=(${snare})>0.5f;`)
    ln(`    float _tileW=WIDTH/(float)_tiles,_tileH=HEIGHT/(float)_tiles,_ksCx=(_tileW-1)/2.0f,_ksCy=(_tileH-1)/2.0f;`)
    ln(`    if(_kickHit && !_ksPrevKick_${id}){ _ksX_${id}[_ksNext_${id}]=_ksCx+(random8()/255.0f*_tileW-_ksCx)*${spreadF}; _ksY_${id}[_ksNext_${id}]=_ksCy+(random8()/255.0f*_tileH-_ksCy)*${spreadF}; _ksBorn_${id}[_ksNext_${id}]=t; _ksKind_${id}[_ksNext_${id}]=0; _ksAlive_${id}[_ksNext_${id}]=true; _ksNext_${id}=(uint8_t)((_ksNext_${id}+1)%${CAP}); }`)
    ln(`    if(_snareHit && !_ksPrevSnare_${id}){ _ksX_${id}[_ksNext_${id}]=_ksCx+(random8()/255.0f*_tileW-_ksCx)*${spreadF}; _ksY_${id}[_ksNext_${id}]=_ksCy+(random8()/255.0f*_tileH-_ksCy)*${spreadF}; _ksBorn_${id}[_ksNext_${id}]=t; _ksKind_${id}[_ksNext_${id}]=1; _ksAlive_${id}[_ksNext_${id}]=true; _ksNext_${id}=(uint8_t)((_ksNext_${id}+1)%${CAP}); }`)
    ln(`    _ksPrevKick_${id}=_kickHit; _ksPrevSnare_${id}=_snareHit;`)
    // Divide by lifeMult so total travel (speed*life) stays constant
    // regardless of decay — mirrors the evaluator (see evalKickShock).
    ln(`    float _spdK=(0.35f+_strength*0.5f)*max(0.2f,_spd)/_ksLife, _spdS=_spdK*1.8f;`)
    ln(`    const float _lifeK=${lifeK},_lifeS=${lifeS},_bandK=${bandK},_bandS=${bandS};`)
    ln(`    float _maxD=max(1e-6f,sqrtf(_ksCx*_ksCx+_ksCy*_ksCy));`)
    ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
    ln(`      float _lx=fmodf((_x+0.5f)*_tiles,WIDTH)/_tiles-0.5f,_ly=fmodf((_y+0.5f)*_tiles,HEIGHT)/_tiles-0.5f;`)
    ln(`      float _cdx=_lx-_ksCx,_cdy=_ly-_ksCy,_distC=sqrtf(_cdx*_cdx+_cdy*_cdy)/_maxD;`)
    ln(`      float _wave=0;`)
    ln(`      for(int _r=0;_r<${CAP};_r++){ if(!_ksAlive_${id}[_r]) continue;`)
    ln(`        float _age=t-_ksBorn_${id}[_r]; bool _isKick=_ksKind_${id}[_r]==0;`)
    ln(`        float _spdR=_isKick?_spdK:_spdS,_life=_isKick?_lifeK:_lifeS,_band=_isKick?_bandK:_bandS;`)
    ln(`        if(_age<0||_age>_life) continue;`)
    ln(`        float _rdx=_lx-_ksX_${id}[_r],_rdy=_ly-_ksY_${id}[_r],_dist=sqrtf(_rdx*_rdx+_rdy*_rdy)/_maxD;`)
    ln(`        float _d=_dist-_age*_spdR; float _front=expf(-(_d*_d)/(2.0f*_band*_band));`)
    ln(additive
      ? `        _wave+=_front*(1.0f-_age/_life); }`
      : `        _wave=max(_wave,_front*(1.0f-_age/_life)); }`)
    ln(`      _wave=min(1.0f,_wave);`)
    ln(`      float _jitter=_hihatAmt*0.18f*(sinf(_distC*50.0f-t*_spd*22.0f)*0.5f+0.5f);`)
    ln(`      float _v=min(1.0f,_wave*(0.5f+_strength*0.5f)+_jitter*_wave+0.03f*_strength);`)
    ln(`      ${ob}[_y*WIDTH+_x]=ColorFromPalette(${pal},(uint8_t)((_distC*0.5f+t*_spd*0.03f)*255));`)
    ln(`      ${ob}[_y*WIDTH+_x].nscale8((uint8_t)(_v*255));`)
    ln(`    }`)
    ln(`  }`)
  },
  VocalAurora({ node, id, p, ln, f, ownBuf, boolExpr, paletteExpr, needsT }) {
    needsT.v = true
    const ob = ownBuf()
    const vocals = f('vocals', 'vocals', 0)
    const energy = f('energy', 'energy', 0.7)
    const silence = boolExpr(node.id, 'silence')
    const speed = f('speed', 'speed', 1)
    const pal = paletteExpr(node.id, 'paletteIn', p)
    ln(`  { // VocalAurora`)
    ln(`    float _rawLevel=min(1.0f,max(0.0f,${vocals}));`)
    ln(`    float _level=_rawLevel*(${VOCAL_AURORA_MIN_INPUT_GAIN.toFixed(1)}f+_rawLevel*${(VOCAL_AURORA_MAX_INPUT_GAIN - VOCAL_AURORA_MIN_INPUT_GAIN).toFixed(1)}f),_strength=min(1.0f,max(0.0f,${energy}));`)
    ln(`    float _gate=(${silence})?0.0f:1.0f;`)
    // Integrated drift phase — mirrors evalVocalAurora: the rate depends on
    // the live vocals level, so scaling absolute t would jump the phase on
    // every level change.
    ln(`    static float _vaPhase_${id}=0.0f,_vaLast_${id}=-1.0f;`)
    ln(`    float _vaDt_${id}=(_vaLast_${id}<0.0f)?0.0f:min(0.25f,max(0.0f,t-_vaLast_${id})); _vaLast_${id}=t;`)
    ln(`    _vaPhase_${id}+=_vaDt_${id}*${speed}*(0.15f+_level*0.35f);`)
    ln(`    float _drift=_vaPhase_${id};`)
    ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
    ln(`      float _ny=HEIGHT>1?(float)_y/(HEIGHT-1):0.0f;`)
    ln(`      float _curtain=0;`)
    ln(`      for(int _bnd=0;_bnd<3;_bnd++){`)
    ln(`        float _bandPhase=_ny*3.0f+_bnd*2.1f+_drift*(1.0f+_bnd*0.4f);`)
    ln(`        float _xOff=sinf(_bandPhase)*(1.2f+_level*1.8f)+sinf(_bandPhase*0.5f+_bnd)*0.6f;`)
    ln(`        float _dx=(_x-WIDTH/2.0f)/max(1.0f,WIDTH/2.0f)-_xOff*0.35f;`)
    ln(`        _curtain+=expf(-_dx*_dx*3.0f)*(0.5f+0.5f*sinf(_bandPhase*1.7f+_bnd*1.3f)); }`)
    ln(`      float _vb=min(1.0f,(0.12f+_strength*0.35f+_level*0.65f)*_gate);`)
    ln(`      float _v=min(1.0f,_curtain*0.6f)*_vb;`)
    ln(`      ${ob}[_y*WIDTH+_x]=ColorFromPalette(${pal},(uint8_t)((_ny*0.6f+_drift*0.08f+_level*0.25f)*255));`)
    ln(`      ${ob}[_y*WIDTH+_x].nscale8((uint8_t)(_v*255));`)
    ln(`    }`)
    ln(`  }`)
  },
  BeatKaleidoscope({ node, id, p, ln, f, ownBuf, boolExpr, paletteExpr, needsT }) {
    needsT.v = true
    const ob = ownBuf()
    const beat = boolExpr(node.id, 'beat')
    const hue = f('hue', 'hue', 0)
    const energy = f('energy', 'energy', 0.7)
    const speed = f('speed', 'speed', 1)
    const pal = paletteExpr(node.id, 'paletteIn', p)
    ln(`  { // BeatKaleidoscope`)
    ln(`    static float _bkPunch_${id}=0;`)
    ln(`    _bkPunch_${id}=(${beat})?1.0f:_bkPunch_${id}*0.85f;`)
    ln(`    float _strength=min(1.0f,max(0.0f,${energy}));`)
    ln(`    int _wedges=6+(int)roundf(_bkPunch_${id}*6.0f);`)
    // Integrated rotation phase — mirrors evalBeatKaleidoscope: the rate
    // depends on the live energy level, so scaling absolute t would jump
    // the phase on every level change.
    ln(`    static float _bkPhase_${id}=0.0f,_bkLast_${id}=-1.0f;`)
    ln(`    float _bkDt_${id}=(_bkLast_${id}<0.0f)?0.0f:min(0.25f,max(0.0f,t-_bkLast_${id})); _bkLast_${id}=t;`)
    ln(`    _bkPhase_${id}+=_bkDt_${id}*${speed}*(0.15f+_strength*0.35f);`)
    ln(`    float _rot=_bkPhase_${id}+_bkPunch_${id}*0.8f;`)
    ln(`    float _wedgeAngle=6.2831853f/_wedges;`)
    ln(`    float _cx=(WIDTH-1)/2.0f,_cy=(HEIGHT-1)/2.0f,_maxD=max(1e-6f,sqrtf(_cx*_cx+_cy*_cy));`)
    ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
    ln(`      float _dx=_x-_cx,_dy=_y-_cy,_dist=sqrtf(_dx*_dx+_dy*_dy)/_maxD;`)
    ln(`      float _ang=atan2f(_dy,_dx)+_rot;`)
    ln(`      float _a=fmodf(fmodf(_ang,_wedgeAngle)+_wedgeAngle,_wedgeAngle);`)
    ln(`      if(_a>_wedgeAngle/2.0f) _a=_wedgeAngle-_a;`)
    ln(`      float _tex=sinf(_a*10.0f+_dist*8.0f*(1.0f+_bkPunch_${id}*0.6f)-t*${speed}*3.0f)*cosf(_dist*5.0f*(1.0f+_bkPunch_${id}*0.6f)-_a*6.0f);`)
    ln(`      float _v=min(1.0f,max(0.0f,_tex*0.5f+0.5f)*(0.35f+_strength*0.65f)+_bkPunch_${id}*0.25f);`)
    ln(`      ${ob}[_y*WIDTH+_x]=ColorFromPalette(${pal},(uint8_t)((_dist*0.5f+_a*0.3f+${hue}/360.0f+t*${speed}*0.05f)*255));`)
    ln(`      ${ob}[_y*WIDTH+_x].nscale8((uint8_t)(_v*255));`)
    ln(`    }`)
    ln(`  }`)
  },
  SpectraMosaic({ node, id, p, ln, f, ownBuf, paletteExpr, needsT }) {
    needsT.v = true
    const ob = ownBuf()
    const bass = f('bass', 'bass', 0.5)
    const mids = f('mids', 'mids', 0.5)
    const treble = f('treble', 'treble', 0.5)
    const energy = f('energy', 'energy', 0.7)
    const speed = f('speed', 'speed', 1)
    const tiles = f('tiles', 'tiles', 4)
    const pal = paletteExpr(node.id, 'paletteIn', p)
    ln(`  { // SpectraMosaic`)
    ln(`    float _b=${bass},_m=${mids},_tr=${treble},_strength=min(1.0f,max(0.0f,${energy}));`)
    ln(`    int _n=(int)max(2.0f,min(8.0f,roundf(${tiles})));`)
    ln(`    float _cellW=WIDTH/(float)_n,_cellH=HEIGHT/(float)_n;`)
    // Integrated sweep phase — mirrors evalSpectraMosaic (see BeatKaleidoscope).
    ln(`    static float _smPhase_${id}=0.0f,_smLast_${id}=-1.0f;`)
    ln(`    float _smDt_${id}=(_smLast_${id}<0.0f)?0.0f:min(0.25f,max(0.0f,t-_smLast_${id})); _smLast_${id}=t;`)
    ln(`    _smPhase_${id}+=_smDt_${id}*${speed}*(0.4f+_strength*0.8f);`)
    ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
    ln(`      int _cx=(int)(_x/_cellW),_cy=(int)(_y/_cellH);`)
    ln(`      float _diag=(_cx+_cy)/(2.0f*(float)max(1,_n-1));`)
    ln(`      float _mix=_b*(1.0f-_diag)+_m*0.5f+_tr*_diag;`)
    ln(`      float _phase=_cx*0.6f+_cy*0.9f+_smPhase_${id};`)
    ln(`      float _shimmer=sinf(_phase)*0.5f+0.5f;`)
    ln(`      float _v=min(1.0f,0.15f+_mix*0.6f*_strength+_shimmer*0.25f);`)
    ln(`      ${ob}[_y*WIDTH+_x]=ColorFromPalette(${pal},(uint8_t)((_diag*0.6f+_mix*0.3f+t*${speed}*0.04f)*255));`)
    ln(`      ${ob}[_y*WIDTH+_x].nscale8((uint8_t)(_v*255));`)
    ln(`    }`)
    ln(`  }`)
  },
  PercussionBlobs({ node, id, p, ln, f, ownBuf, paletteExpr, needsT }) {
    needsT.v = true
    const ob = ownBuf()
    const kick = f('kick', 'kick', 0)
    const snare = f('snare', 'snare', 0)
    const hihat = f('hihat', 'hihat', 0)
    const pal = paletteExpr(node.id, 'paletteIn', p)
    // `count` sizes the static blob pool below and stays a property;
    // the multipliers are per-frame locals, so a control can drive them.
    const CAP = Math.max(1, Math.round(Number(p.count ?? 12)))
    const spreadF = `_pbSpread`
    const additive = String(p.blendMode ?? 'add') !== 'max'
    const pr = [0.34, 0.20, 0.10].map((v) => `${floatLit(v)}*_pbSize`)
    const pl = [1.4, 0.7, 0.35].map((v) => `${floatLit(v)}*_pbLife`)
    ln(`  { // PercussionBlobs`)
    ln(`    static float _pbx_${id}[${CAP}],_pby_${id}[${CAP}],_pbt_${id}[${CAP}]; static uint8_t _pbk_${id}[${CAP}]; static bool _pbAlive_${id}[${CAP}]; static bool _pbInit_${id}=false; static uint8_t _pbNext_${id}=0; static bool _pbPrevKick_${id}=false,_pbPrevSnare_${id}=false,_pbPrevHihat_${id}=false;`)
    ln(`    float _pbSpread=constrain(${f('spawnSpread', 'spawnSpread', 1)}, 0.0f, 1.0f);`)
    ln(`    float _pbSize=fmaxf(0.1f, ${f('size', 'size', 1)});`)
    ln(`    float _pbLife=fmaxf(0.05f, ${f('decay', 'decay', 1)});`)
    ln(`    if(!_pbInit_${id}){ for(int _i=0;_i<${CAP};_i++) _pbAlive_${id}[_i]=false; _pbInit_${id}=true; }`)
    ln(`    bool _kickHit=(${kick})>0.5f, _snareHit=(${snare})>0.5f, _hihatHit=(${hihat})>0.55f;`)
    ln(`    float _pbCx=WIDTH/2.0f,_pbCy=HEIGHT/2.0f;`)
    ln(`    if(_kickHit && !_pbPrevKick_${id}){ _pbx_${id}[_pbNext_${id}]=_pbCx+(random8()/255.0f*WIDTH-_pbCx)*${spreadF}; _pby_${id}[_pbNext_${id}]=_pbCy+(random8()/255.0f*HEIGHT-_pbCy)*${spreadF}; _pbt_${id}[_pbNext_${id}]=t; _pbk_${id}[_pbNext_${id}]=0; _pbAlive_${id}[_pbNext_${id}]=true; _pbNext_${id}=(uint8_t)((_pbNext_${id}+1)%${CAP}); }`)
    ln(`    if(_snareHit && !_pbPrevSnare_${id}){ _pbx_${id}[_pbNext_${id}]=_pbCx+(random8()/255.0f*WIDTH-_pbCx)*${spreadF}; _pby_${id}[_pbNext_${id}]=_pbCy+(random8()/255.0f*HEIGHT-_pbCy)*${spreadF}; _pbt_${id}[_pbNext_${id}]=t; _pbk_${id}[_pbNext_${id}]=1; _pbAlive_${id}[_pbNext_${id}]=true; _pbNext_${id}=(uint8_t)((_pbNext_${id}+1)%${CAP}); }`)
    ln(`    if(_hihatHit && !_pbPrevHihat_${id}){ _pbx_${id}[_pbNext_${id}]=_pbCx+(random8()/255.0f*WIDTH-_pbCx)*${spreadF}; _pby_${id}[_pbNext_${id}]=_pbCy+(random8()/255.0f*HEIGHT-_pbCy)*${spreadF}; _pbt_${id}[_pbNext_${id}]=t; _pbk_${id}[_pbNext_${id}]=2; _pbAlive_${id}[_pbNext_${id}]=true; _pbNext_${id}=(uint8_t)((_pbNext_${id}+1)%${CAP}); }`)
    ln(`    _pbPrevKick_${id}=_kickHit; _pbPrevSnare_${id}=_snareHit; _pbPrevHihat_${id}=_hihatHit;`)
    ln(`    const float _pr[3]={${pr[0]},${pr[1]},${pr[2]}}, _pl[3]={${pl[0]},${pl[1]},${pl[2]}};`)
    ln(`    float _minDim=min((float)WIDTH,(float)HEIGHT);`)
    ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
    ln(`      float _field=0;`)
    ln(`      for(int _bl=0;_bl<${CAP};_bl++){ if(!_pbAlive_${id}[_bl]) continue;`)
    ln(`        float _age=t-_pbt_${id}[_bl]; uint8_t _kind=_pbk_${id}[_bl]; float _life=_pl[_kind];`)
    ln(`        if(_age<0||_age>_life) continue;`)
    ln(`        float _lifeT=_age/_life;`)
    ln(`        float _radius=_pr[_kind]*_minDim*(0.4f+0.6f*min(1.0f,_lifeT*2.0f));`)
    ln(`        float _decay=1.0f-_lifeT;`)
    ln(`        float _dx=_x-_pbx_${id}[_bl],_dy=_y-_pby_${id}[_bl];`)
    ln(additive
      ? `        _field+=_decay*(_radius*_radius)/(_dx*_dx+_dy*_dy+_radius*_radius*0.15f); }`
      : `        _field=max(_field,_decay*(_radius*_radius)/(_dx*_dx+_dy*_dy+_radius*_radius*0.15f)); }`)
    ln(`      float _v=min(1.0f,_field/(_field+1.1f));`)
    ln(`      ${ob}[_y*WIDTH+_x]=ColorFromPalette(${pal},(uint8_t)(min(1.0f,_field*0.4f)*255));`)
    ln(`      ${ob}[_y*WIDTH+_x].nscale8((uint8_t)(_v*255));`)
    ln(`    }`)
    ln(`  }`)
  },
  EmberPulse({ node, id, ln, f, ownBuf, boolExpr, needsT }) {
    needsT.v = true
    const ob = ownBuf()
    const bass = f('bass', 'bass', 0.5)
    const mids = f('mids', 'mids', 0.5)
    const treble = f('treble', 'treble', 0.5)
    const beat = boolExpr(node.id, 'beat')
    const energy = f('energy', 'energy', 0.7)
    const speed = f('speed', 'speed', 1)
    ln(`  { // EmberPulse`)
    ln(`    static float _epBurst_${id}=0;`)
    ln(`    _epBurst_${id}=(${beat})?min(1.0f,_epBurst_${id}+0.6f):_epBurst_${id}*0.90f;`)
    ln(`    float _b=${bass},_m=${mids},_tr=${treble},_strength=min(1.0f,max(0.0f,${energy}));`)
    ln(`    float _flicker=t*${speed}*3.0f;`)
    ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
    ln(`      float _nx=WIDTH>1?(float)_x/(WIDTH-1):0.0f;`)
    ln(`      float _hfb=HEIGHT>1?(float)(HEIGHT-1-_y)/(HEIGHT-1):0.0f;`)
    ln(`      float _centerDist=fabsf(_nx-0.5f)*2.0f;`)
    ln(`      float _bandWeight=_b*(1.0f-_centerDist)+_m*(1.0f-fabsf(_centerDist-0.5f)*2.0f)+_tr*_centerDist;`)
    ln(`      float _f1=sinf(_nx*17.0f+_flicker+_hfb*4.0f)*0.5f+0.5f;`)
    ln(`      float _f2=sinf(_nx*29.0f-_flicker*1.3f)*0.5f+0.5f;`)
    ln(`      float _falloff=max(0.0f,1.0f-_hfb*(1.1f-_bandWeight*0.5f-_strength*0.3f));`)
    ln(`      float _heat=_falloff*(0.35f+_bandWeight*0.65f*_strength)*(0.7f+_f1*0.2f+_f2*0.1f);`)
    ln(`      _heat=min(1.0f,_heat+_epBurst_${id}*max(0.0f,1.0f-_hfb*0.6f)*0.8f);`)
    ln(`      ${ob}[_y*WIDTH+_x]=HeatColor((uint8_t)(_heat*255));`)
    ln(`    }`)
    ln(`  }`)
  },
  TurbulentBloom({ node, id, p, ln, f, ownBuf, paletteExpr, needsT }) {
    needsT.v = true
    const ob = ownBuf()
    const bass = f('bass', 'bass', 0.5)
    const mids = f('mids', 'mids', 0.5)
    const treble = f('treble', 'treble', 0.5)
    const energy = f('energy', 'energy', 0.7)
    const speed = f('speed', 'speed', 1)
    const pal = paletteExpr(node.id, 'paletteIn', p)
    // inoise8 takes uint16_t coordinates; casting a negative float would be
    // UB, so every coordinate is folded into [0,240) first (240*256<65536).
    const wrap = (expr: string) => `fmodf(fmodf((${expr}),240.0f)+240.0f,240.0f)`
    ln(`  { // TurbulentBloom`)
    ln(`    float _b=${bass},_m=${mids},_tr=${treble},_strength=min(1.0f,max(0.0f,${energy}));`)
    ln(`    float _trebleAmp=0.15f+_tr*0.6f,_midsAmp=0.3f+_m*0.9f,_bassPulse=0.5f+sqrtf(constrain(_b,0.0f,1.0f))*0.5f;`)
    // Two integrated warp phases — mirrors evalTurbulentBloom (see BeatKaleidoscope).
    ln(`    static float _tbFast_${id}=0.0f,_tbSlow_${id}=0.0f,_tbLast_${id}=-1.0f;`)
    ln(`    float _tbDt_${id}=(_tbLast_${id}<0.0f)?0.0f:min(0.25f,max(0.0f,t-_tbLast_${id})); _tbLast_${id}=t;`)
    ln(`    _tbFast_${id}+=_tbDt_${id}*${speed}*(1.5f+_tr*2.0f); _tbSlow_${id}+=_tbDt_${id}*${speed}*(0.3f+_m*0.6f);`)
    ln(`    float _tFast=_tbFast_${id},_tSlow=_tbSlow_${id};`)
    ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
    ln(`      float _cx=(_x-(WIDTH-1)/2.0f)/max(1.0f,WIDTH/2.0f), _cy=(_y-(HEIGHT-1)/2.0f)/max(1.0f,HEIGHT/2.0f);`)
    ln(`      float _n1=((inoise8((uint16_t)(${wrap('_cx*3.0f+_tFast')}*256.0f),(uint16_t)(${wrap('_cy*3.0f-_tFast')}*256.0f))/255.0f)-0.5f)*2.0f;`)
    ln(`      float _n2=((inoise8((uint16_t)(${wrap('_cx*0.6f+_tSlow')}*256.0f),(uint16_t)(${wrap('_cy*0.6f+50.0f+_tSlow')}*256.0f))/255.0f)-0.5f)*2.0f;`)
    ln(`      float _n3=((inoise8((uint16_t)(${wrap('_cx*3.0f+50.0f+_tFast')}*256.0f),(uint16_t)(${wrap('_cy*3.0f+50.0f-_tFast')}*256.0f))/255.0f)-0.5f)*2.0f;`)
    ln(`      float _n4=((inoise8((uint16_t)(${wrap('_cx*0.6f+50.0f+_tSlow')}*256.0f),(uint16_t)(${wrap('_cy*0.6f+_tSlow')}*256.0f))/255.0f)-0.5f)*2.0f;`)
    ln(`      float _nOffX=_n1*_trebleAmp+_n2*_midsAmp, _nOffY=_n3*_trebleAmp+_n4*_midsAmp;`)
    ln(`      float _wx=_cx+_nOffX,_wy=_cy+_nOffY,_radial=sqrtf(_wx*_wx+_wy*_wy);`)
    ln(`      float _bloom=sinf(_radial*6.0f-t*${speed}*3.0f)+cosf((_wx+_wy)*3.0f+t*${speed}*2.0f);`)
    ln(`      float _crisp=powf(max(0.0f,_bloom*0.5f+0.5f),1.6f);`)
    ln(`      float _v=min(1.0f,_crisp*(0.2f+0.8f*_strength)*_bassPulse);`)
    ln(`      ${ob}[_y*WIDTH+_x]=ColorFromPalette(${pal},(uint8_t)((_radial*0.5f+_tSlow*0.05f)*255));`)
    ln(`      ${ob}[_y*WIDTH+_x].nscale8((uint8_t)(_v*255));`)
    ln(`    }`)
    ln(`  }`)
  },
  GravityWell({ ln, f, channelColor, ownBuf, needsT }) {
    needsT.v = true
    const ob = ownBuf()
    const bass = f('bass', 'bass', 0.5)
    const energy = f('energy', 'energy', 0.7)
    const speed = f('speed', 'speed', 1)
    const colorE = channelColor('color', 80, 160, 255)
    ln(`  { // GravityWell`)
    ln(`    float _level=min(1.0f,max(0.0f,${bass})),_strength=min(1.0f,max(0.0f,${energy}));`)
    ln(`    float _cx0=(WIDTH-1)/2.0f,_cy0=(HEIGHT-1)/2.0f;`)
    ln(`    float _orbitR=min((float)WIDTH,(float)HEIGHT)*0.12f*(0.5f+_strength*0.5f);`)
    ln(`    float _wellX=_cx0+cosf(t*${speed}*0.25f)*_orbitR, _wellY=_cy0+sinf(t*${speed}*0.35f)*_orbitR;`)
    ln(`    float _maxD=max(1e-6f,sqrtf(_cx0*_cx0+_cy0*_cy0));`)
    ln(`    float _k=5.0f+_level*10.0f*_strength, _phase=t*(1.0f+${speed}*2.2f);`)
    ln(`    CRGB _base=${colorE};`)
    ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
    ln(`      float _dx=_x-_wellX,_dy=_y-_wellY,_dist=sqrtf(_dx*_dx+_dy*_dy)/_maxD;`)
    ln(`      float _wave=sinf(_k/(_dist+0.12f)-_phase);`)
    ln(`      float _crisp=powf(max(0.0f,_wave*0.5f+0.5f),2.2f);`)
    ln(`      float _v=min(1.0f,0.03f+_level*0.08f*_strength+_crisp*(0.15f+_level*0.85f*_strength));`)
    ln(`      int _i=_y*WIDTH+_x;`)
    ln(`      ${ob}[_i]=_base;`)
    ln(`      ${ob}[_i].nscale8((uint8_t)(_v*255));`)
    ln(`    }`)
    ln(`  }`)
  },
  RainRipples({ node, id, p, ln, f, ownBuf, boolExpr, paletteExpr, needsT }) {
    needsT.v = true
    const ob = ownBuf()
    const trigger = boolExpr(node.id, 'trigger')
    const energy = f('energy', 'energy', 0.7)
    const speed = f('speed', 'speed', 1)
    const pal = paletteExpr(node.id, 'paletteIn', p)
    /*
     * `count` stays a property: it is the length of the static ripple
     * arrays below, fixed when the sketch is built. The three multipliers
     * are only ever read inside expressions, so each is hoisted to a
     * per-frame local fed by `floatExpr` — unwired it folds to its own
     * literal, and the clamps that used to run here are emitted so they
     * still hold on a wired value.
     */
    const CAP = Math.max(1, Math.round(Number(p.count ?? 8)))
    const spreadF = `_rrSpread`
    const additive = String(p.blendMode ?? 'max') === 'add'
    ln(`  { // RainRipples`)
    ln(`    static float _rrx_${id}[${CAP}],_rry_${id}[${CAP}],_rrt_${id}[${CAP}]; static bool _rrAlive_${id}[${CAP}]; static bool _rrInit_${id}=false; static uint8_t _rrNext_${id}=0; static bool _rrPrevTrig_${id}=false;`)
    ln(`    if(!_rrInit_${id}){ for(int _i=0;_i<${CAP};_i++) _rrAlive_${id}[_i]=false; _rrInit_${id}=true; }`)
    ln(`    float ${spreadF}=constrain(${f('spawnSpread', 'spawnSpread', 1)}, 0.0f, 1.0f);`)
    ln(`    float _rrLife=fmaxf(0.05f, ${f('decay', 'decay', 1)});`)
    ln(`    float _rrBand=fmaxf(0.05f, ${f('thickness', 'thickness', 1)});`)
    ln(`    bool _trig=(${trigger});`)
    ln(`    float _rrCx=WIDTH/2.0f,_rrCy=HEIGHT/2.0f;`)
    ln(`    if(_trig && !_rrPrevTrig_${id}){ _rrx_${id}[_rrNext_${id}]=_rrCx+(random8()/255.0f*WIDTH-_rrCx)*${spreadF}; _rry_${id}[_rrNext_${id}]=_rrCy+(random8()/255.0f*HEIGHT-_rrCy)*${spreadF}; _rrt_${id}[_rrNext_${id}]=t; _rrAlive_${id}[_rrNext_${id}]=true; _rrNext_${id}=(uint8_t)((_rrNext_${id}+1)%${CAP}); }`)
    ln(`    _rrPrevTrig_${id}=_trig;`)
    ln(`    float _strength=min(1.0f,max(0.0f,${energy})); float _spd=max(0.2f,${speed});`)
    ln(`    float _life=(1.6f/_spd)*_rrLife; float _speedPx=max((float)WIDTH,(float)HEIGHT)*0.9f/_life;`)
    ln(`    float _band=(0.9f+(1.0f-_strength)*0.6f)*_rrBand;`)
    ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
    ln(`      float _v=0;`)
    ln(`      for(int _r=0;_r<${CAP};_r++){ if(!_rrAlive_${id}[_r]) continue;`)
    ln(`        float _age=t-_rrt_${id}[_r]; if(_age<0||_age>_life) continue;`)
    ln(`        float _dx=_x-_rrx_${id}[_r],_dy=_y-_rry_${id}[_r],_dist=sqrtf(_dx*_dx+_dy*_dy);`)
    ln(`        float _d=_dist-_age*_speedPx; float _ring=expf(-(_d*_d)/(2.0f*_band*_band));`)
    ln(additive
      ? `        _v+=_ring*(1.0f-_age/_life); }`
      : `        _v=max(_v,_ring*(1.0f-_age/_life)); }`)
    ln(`      _v=min(1.0f,_v*(0.6f+_strength*0.6f));`)
    ln(`      ${ob}[_y*WIDTH+_x]=ColorFromPalette(${pal},(uint8_t)((_v*0.5f+t*${speed}*0.02f)*255));`)
    ln(`      ${ob}[_y*WIDTH+_x].nscale8((uint8_t)(_v*255));`)
    ln(`    }`)
    ln(`  }`)
  },
  PrismStorm({ node, id, p, ln, f, ownBuf, paletteExpr, needsWorley, needsT }) {
    needsT.v = true
    needsWorley.v = true
    const ob = ownBuf()
    const treble = f('treble', 'treble', 0.5)
    const mids = f('mids', 'mids', 0.5)
    const hihat = f('hihat', 'hihat', 0)
    const energy = f('energy', 'energy', 0.7)
    const speed = f('speed', 'speed', 1)
    const pal = paletteExpr(node.id, 'paletteIn', p)
    ln(`  { // PrismStorm`)
    ln(`    static float _psOri_${id}=0; static bool _psInit_${id}=false,_psPrevAbove_${id}=false;`)
    ln(`    if(!_psInit_${id}){ _psOri_${id}=random16()/65535.0f*360.0f; _psInit_${id}=true; }`)
    ln(`    bool _above=(${hihat})>0.55f;`)
    ln(`    if(_above && !_psPrevAbove_${id}) _psOri_${id}=random16()/65535.0f*360.0f;`)
    ln(`    _psPrevAbove_${id}=_above;`)
    ln(`    float _strength=min(1.0f,max(0.0f,${energy}));`)
    // Integrated orientation drift — mirrors evalPrismStorm (see BeatKaleidoscope).
    ln(`    static float _psPhase_${id}=0.0f,_psLast_${id}=-1.0f;`)
    ln(`    float _psDt_${id}=(_psLast_${id}<0.0f)?0.0f:min(0.25f,max(0.0f,t-_psLast_${id})); _psLast_${id}=t;`)
    ln(`    _psPhase_${id}+=_psDt_${id}*${speed}*(4.0f+${mids}*8.0f);`)
    ln(`    float _drift=_psPhase_${id};`)
    ln(`    float _omega=(_psOri_${id}+_drift)*0.01745329f,_co=cosf(_omega),_si=sinf(_omega);`)
    ln(`    float _freq=0.8f+${treble}*2.5f,_sc=0.5f+${mids}*0.4f;`)
    ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
    ln(`      float _px=_x*_sc,_py=_y*_sc; int _xi=(int)floorf(_px),_yi=(int)floorf(_py); float _v=0;`)
    ln(`      for(int _dj=-1;_dj<=1;_dj++) for(int _di=-1;_di<=1;_di++){`)
    ln(`        int _cx=_xi+_di,_cy=_yi+_dj; float _h=_worleyHash(_cx,_cy),_h2=_worleyHash(_cx+31,_cy-17);`)
    ln(`        float _fx=_cx+0.5f+(_h-0.5f),_fy=_cy+0.5f+(_h2-0.5f);`)
    ln(`        float _dx=_px-_fx,_dy=_py-_fy,_g=expf(-2.5f*(_dx*_dx+_dy*_dy));`)
    ln(`        float _proj=_dx*_co+_dy*_si,_w=_h2<0.5f?1.0f:-1.0f;`)
    ln(`        _v+=_w*_g*cosf(6.2831853f*_freq*_proj+t*${speed}*2.0f+_h*6.2831853f); }`)
    ln(`      float _shard=powf(max(0.0f,_v*0.5f+0.5f),1.4f);`)
    ln(`      float _vv=min(1.0f,_shard*(0.25f+_strength*0.75f));`)
    ln(`      ${ob}[_y*WIDTH+_x]=ColorFromPalette(${pal},(uint8_t)((_v*0.5f+0.5f+${mids}*0.2f)*255));`)
    ln(`      ${ob}[_y*WIDTH+_x].nscale8((uint8_t)(_vv*255));`)
    ln(`    }`)
    ln(`  }`)
  },
  AudioFlow({ node, id, p, ln, f, ownBuf, paletteExpr, needsT }) {
    needsT.v = true
    const ob = ownBuf()
    const bass = f('bass', 'bass', 0.5), mids = f('mids', 'mids', 0.5), treble = f('treble', 'treble', 0.3)
    const speed = audioFlowExpr('speed', f('speed', 'speed', 0.5))
    const scale = audioFlowExpr('scale', f('scale', 'scale', 0.5))
    const pal = paletteExpr(node.id, 'paletteIn', p)
    ln(`  { float _b=${bass},_m=${mids},_tr=${treble},_spd=${speed},_sc=${scale};`)
    // Integrated flow phase — mirrors evalAudioFlow (see BeatKaleidoscope).
    ln(`    static float _afPhase_${id}=0.0f,_afLast_${id}=-1.0f;`)
    ln(`    float _afDt_${id}=(_afLast_${id}<0.0f)?0.0f:min(0.25f,max(0.0f,t-_afLast_${id})); _afLast_${id}=t;`)
    ln(`    _afPhase_${id}+=_afDt_${id}*_spd*(0.2f+_m*1.5f);`)
    ln(`    float _flow=_afPhase_${id}; uint8_t _bright=(uint8_t)((0.25f+sqrtf(constrain(_b,0.0f,1.0f))*0.75f)*255);`)
    ln(`    float _vamp=0.2f+_tr*0.7f+_b*0.3f;`)
    ln(`    float _vflow=((float)inoise8((uint16_t)((t*_spd*4.0f+50)*256),4429)/128.0f-1.0f)*_vamp;`)
    ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
    ln(`      uint8_t _v=inoise8((uint16_t)((_x*_sc+_flow)*256),(uint16_t)((_y*_sc*0.6f+_vflow+8.0f)*256));`)
    ln(`      ${ob}[_y*WIDTH+_x]=ColorFromPalette(${pal},(uint8_t)(_v+_tr*80)); ${ob}[_y*WIDTH+_x].nscale8(_bright);}}`)
  },
  ColorTrails({ node, id, p, ln, f, ownBuf, boolExpr, paletteExpr, needsT, frameBufs }) {
    needsT.v = true
    const ob = ownBuf()
    const tmpId = `cttmp_${id}`
    frameBufs.add(tmpId)
    const tmp = `buf_${tmpId}`
    const bass = f('bass', 'bass', 0), mids = f('mids', 'mids', 0), treble = f('treble', 'treble', 0)
    const beat = boolExpr(node.id, 'beat')
    const pal = paletteExpr(node.id, 'paletteIn', p)
    const xSpeed = f('xSpeed', 'xSpeed', 0.1), xAmp = f('xAmplitude', 'xAmplitude', 1), xFreq = f('xFrequency', 'xFrequency', 0.33)
    const ySpeed = f('ySpeed', 'ySpeed', 0.1), yAmp = f('yAmplitude', 'yAmplitude', 1), yFreq = f('yFrequency', 'yFrequency', 0.32)
    const displacement = f('displacement', 'displacement', 1.8)
    const endpointSpeed = f('endpointSpeed', 'endpointSpeed', 0.35)
    const colorSpeed = f('colorSpeed', 'colorSpeed', 0.1)
    const persistence = f('persistence', 'persistence', 0.99922)
    const seed = seedProp({ seed: p.seed ?? 42 })
    const injectionMode = String(p.injectionMode ?? 'Moving Line')
    const injectLine = injectionMode !== 'Rainbow Border'
    const injectBorder = injectionMode !== 'Moving Line'
    const morphFlow = String(p.flowMode ?? 'Scrolling') === 'Morphing 2D'
    ln(`  { // ColorTrails: ${injectionMode} injection + two-pass subpixel feedback advection`)
    ln(`    // Adapted from prototype work by Stefan Petrick, creator of AnimARTrix:`)
    ln(`    // https://github.com/StefanPetrick/animartrix`)
    ln(`    static float _ctLast_${id}=-1.0f,_ctBeatPulse_${id}=0.0f;`)
    ln(`    float _ctDtf=_ctLast_${id}<0.0f?1.0f:constrain((t-_ctLast_${id})*60.0f,0.0f,4.0f); _ctLast_${id}=t;`)
    ln(`    if(_ctDtf>0.0f){`)
    ln(`      float _ctBass=constrain(${bass},0.0f,1.0f),_ctMids=constrain(${mids},0.0f,1.0f),_ctTreble=constrain(${treble},0.0f,1.0f);`)
    ln(`      _ctBeatPulse_${id}=(${beat})?1.0f:_ctBeatPulse_${id}*powf(0.78f,_ctDtf);`)
    ln(`      float _ctEpSpeed=(${endpointSpeed})*(1.0f+_ctMids*1.5f);`)
    ln(`      float _ctColorSpeed=(${colorSpeed})*(1.0f+_ctTreble*2.0f);`)
    ln(`      float _ctDisp=max(0.0f,(float)(${displacement}))*(1.0f+_ctBass*1.5f)*_ctDtf;`)
    ln(`      auto _ctHash=[](int32_t _q,uint32_t _seed)->uint32_t{ uint32_t _h=((uint32_t)_q)^_seed; _h=(_h^(_h>>16))*0x7feb352dU; _h=(_h^(_h>>15))*0x846ca68bU; return _h^(_h>>16); };`)
    ln(`      auto _ctNoise=[&](float _x,uint32_t _seed)->float{ int32_t _xi=(int32_t)floorf(_x); float _xf=_x-_xi; float _u=_xf*_xf*_xf*(_xf*(_xf*6.0f-15.0f)+10.0f); float _a=(_ctHash(_xi,_seed)&1U)?-_xf:_xf; float _d=_xf-1.0f; float _b=(_ctHash(_xi+1,_seed)&1U)?-_d:_d; return _a+(_b-_a)*_u; };`)
    if (morphFlow) {
      ln(`      auto _ctHash2=[&](int32_t _x,int32_t _y,uint32_t _seed)->uint32_t{ uint32_t _q=((uint32_t)_x*0x8da6b343U)^((uint32_t)_y*0xd8163841U); return _ctHash((int32_t)_q,_seed); };`)
      ln(`      auto _ctGrad=[](uint32_t _h,float _x,float _y)->float{ switch(_h&7U){ case 0:return _x+_y; case 1:return -_x+_y; case 2:return _x-_y; case 3:return -_x-_y; case 4:return _x; case 5:return -_x; case 6:return _y; default:return -_y; } };`)
      ln(`      auto _ctNoise2=[&](float _x,float _y,uint32_t _seed)->float{ int32_t _xi=(int32_t)floorf(_x),_yi=(int32_t)floorf(_y); float _xf=_x-_xi,_yf=_y-_yi; float _u=_xf*_xf*_xf*(_xf*(_xf*6.0f-15.0f)+10.0f),_v=_yf*_yf*_yf*(_yf*(_yf*6.0f-15.0f)+10.0f); float _aa=_ctGrad(_ctHash2(_xi,_yi,_seed),_xf,_yf),_ba=_ctGrad(_ctHash2(_xi+1,_yi,_seed),_xf-1.0f,_yf); float _ab=_ctGrad(_ctHash2(_xi,_yi+1,_seed),_xf,_yf-1.0f),_bb=_ctGrad(_ctHash2(_xi+1,_yi+1,_seed),_xf-1.0f,_yf-1.0f); float _x0=_aa+(_ba-_aa)*_u,_x1=_ab+(_bb-_ab)*_u; return _x0+(_x1-_x0)*_v; };`)
    }
    ln(`      auto _ctColor=[&](float _u)->CRGB{ float _h=fmodf(t*_ctColorSpeed+_u,1.0f); if(_h<0.0f)_h+=1.0f; return ColorFromPalette(${pal},(uint8_t)(_h*255.0f),255,LINEARBLEND); };`)
    ln(`      auto _ctBlend=[&](int _x,int _y,const CRGB& _c,float _weight){ if(_x<0||_x>=WIDTH||_y<0||_y>=HEIGHT)return; float _w=constrain(_weight*(1.0f+_ctBeatPulse_${id}*0.65f),0.0f,1.0f); _w=1.0f-powf(1.0f-_w,_ctDtf); CRGB& _d=${ob}[_y*WIDTH+_x]; _d.r=(uint8_t)(_d.r*(1.0f-_w)+_c.r*_w+0.5f); _d.g=(uint8_t)(_d.g*(1.0f-_w)+_c.g*_w+0.5f); _d.b=(uint8_t)(_d.b*(1.0f-_w)+_c.b*_w+0.5f); };`)
    if (injectLine) {
      ln(`      float _cx=(WIDTH-1)*0.5f,_cy=(HEIGHT-1)*0.5f;`)
      ln(`      float _x1=_cx+(WIDTH-1)*(11.5f/31.0f)*sinf(t*_ctEpSpeed*1.13f+0.20f);`)
      ln(`      float _y1=_cy+(HEIGHT-1)*(10.5f/31.0f)*sinf(t*_ctEpSpeed*1.71f+1.30f);`)
      ln(`      float _x2=_cx+(WIDTH-1)*(12.0f/31.0f)*sinf(t*_ctEpSpeed*1.89f+2.20f);`)
      ln(`      float _y2=_cy+(HEIGHT-1)*(11.0f/31.0f)*sinf(t*_ctEpSpeed*1.37f+0.70f);`)
      ln(`      float _dx=_x2-_x1,_dy=_y2-_y1; int _steps=max(1,(int)(max(fabsf(_dx),fabsf(_dy))*3.0f));`)
      ln(`      for(int _i=0;_i<=_steps;_i++){ float _u=_i/(float)_steps,_x=_x1+_dx*_u,_y=_y1+_dy*_u; int _xi=(int)floorf(_x),_yi=(int)floorf(_y); float _fx=_x-_xi,_fy=_y-_yi; CRGB _c=_ctColor(_u); _ctBlend(_xi,_yi,_c,(1.0f-_fx)*(1.0f-_fy)); _ctBlend(_xi+1,_yi,_c,_fx*(1.0f-_fy)); _ctBlend(_xi,_yi+1,_c,(1.0f-_fx)*_fy); _ctBlend(_xi+1,_yi+1,_c,_fx*_fy); }`)
      ln(`      float _radius=0.85f+_ctBeatPulse_${id}*0.9f;`)
      ln(`      auto _ctDisc=[&](float _ex,float _ey,const CRGB& _c){ int _minX=max(0,(int)floorf(_ex-_radius-1.0f)),_maxX=min(WIDTH-1,(int)ceilf(_ex+_radius+1.0f)); int _minY=max(0,(int)floorf(_ey-_radius-1.0f)),_maxY=min(HEIGHT-1,(int)ceilf(_ey+_radius+1.0f)); for(int _py=_minY;_py<=_maxY;_py++)for(int _px=_minX;_px<=_maxX;_px++){ float _dd=hypotf(_px+0.5f-_ex,_py+0.5f-_ey); _ctBlend(_px,_py,_c,constrain(_radius+0.5f-_dd,0.0f,1.0f)); } };`)
      ln(`      _ctDisc(_x1,_y1,_ctColor(0.0f)); _ctDisc(_x2,_y2,_ctColor(1.0f));`)
    }
    if (injectBorder) {
      ln(`      int _ctPi=0,_ctPn=max(1,2*WIDTH+2*HEIGHT-4);`)
      ln(`      for(int _x=0;_x<WIDTH;_x++)_ctBlend(_x,0,_ctColor(_ctPi++/(float)_ctPn),1.0f);`)
      ln(`      for(int _y=1;_y<HEIGHT;_y++)_ctBlend(WIDTH-1,_y,_ctColor(_ctPi++/(float)_ctPn),1.0f);`)
      ln(`      if(HEIGHT>1)for(int _x=WIDTH-2;_x>=0;_x--)_ctBlend(_x,HEIGHT-1,_ctColor(_ctPi++/(float)_ctPn),1.0f);`)
      ln(`      if(WIDTH>1)for(int _y=HEIGHT-2;_y>0;_y--)_ctBlend(0,_y,_ctColor(_ctPi++/(float)_ctPn),1.0f);`)
    }
    ln(`      const uint32_t _seedX=${seed}U,_seedY=${(seed + 1295) >>> 0}U;`)
    const yNoise = morphFlow ? `_ctNoise2(_y*0.23f*(${yFreq}),t*(${ySpeed}),_seedY)` : `_ctNoise(_y*0.23f*(${yFreq})+t*(${ySpeed}),_seedY)`
    const xNoise = morphFlow ? `_ctNoise2((WIDTH-1-_x)*0.23f*(${xFreq}),t*(${xSpeed}),_seedX)` : `_ctNoise((WIDTH-1-_x)*0.23f*(${xFreq})+t*(${xSpeed}),_seedX)`
    ln(`      for(int _y=0;_y<HEIGHT;_y++){ float _profile=${yNoise}*(${yAmp}); float _shift=constrain(_profile*_ctDisp,-1.0f,1.0f); for(int _x=0;_x<WIDTH;_x++){ float _sx=fmodf(_x-_shift,(float)WIDTH); if(_sx<0)_sx+=WIDTH; int _x0=(int)floorf(_sx),_xN=(_x0+1)%WIDTH; float _f=_sx-_x0; CRGB _a=${ob}[_y*WIDTH+_x0],_b=${ob}[_y*WIDTH+_xN]; ${tmp}[_y*WIDTH+_x]=CRGB((uint8_t)(_a.r*(1.0f-_f)+_b.r*_f+0.5f),(uint8_t)(_a.g*(1.0f-_f)+_b.g*_f+0.5f),(uint8_t)(_a.b*(1.0f-_f)+_b.b*_f+0.5f)); } }`)
    ln(`      float _fade=powf(constrain((float)(${persistence}),0.0f,0.99999f),_ctDtf);`)
    ln(`      for(int _x=0;_x<WIDTH;_x++){ float _profile=${xNoise}*(${xAmp}); float _shift=constrain(_profile*_ctDisp,-1.0f,1.0f); for(int _y=0;_y<HEIGHT;_y++){ float _sy=fmodf(_y-_shift,(float)HEIGHT); if(_sy<0)_sy+=HEIGHT; int _y0=(int)floorf(_sy),_yN=(_y0+1)%HEIGHT; float _f=_sy-_y0; CRGB _a=${tmp}[_y0*WIDTH+_x],_b=${tmp}[_yN*WIDTH+_x]; ${ob}[_y*WIDTH+_x]=CRGB((uint8_t)((_a.r*(1.0f-_f)+_b.r*_f)*_fade+0.5f),(uint8_t)((_a.g*(1.0f-_f)+_b.g*_f)*_fade+0.5f),(uint8_t)((_a.b*(1.0f-_f)+_b.b*_f)*_fade+0.5f)); } }`)
    ln(`    }`)
    ln(`  }`)
  },
  Animartrix({ node, id, p, f, ownBuf, boolExpr, loopLines, needsT }) {
    needsT.v = true
    const ob = ownBuf()
    loopLines.push(...animartrixCppLines({
      id,
      output: ob,
      effect: p.effect,
      speed: f('speed', 'speed', 0.65),
      audioAmount: f('audioAmount', 'audioAmount', 1),
      bass: f('bass', 'bass', 0),
      mids: f('mids', 'mids', 0),
      treble: f('treble', 'treble', 0),
      kick: f('kick', 'kick', 0),
      snare: f('snare', 'snare', 0),
      hihat: f('hihat', 'hihat', 0),
      beat: boolExpr(node.id, 'beat'),
    }))
  },
}
