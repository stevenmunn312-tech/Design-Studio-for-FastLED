import { juggleDotCount, JUGGLE_COUNT } from '../../state/juggle'
import { rateCpp, NOISE_SPEED_MAX, NOISE_SCALE_MAX, SPEED_MAX, SCALE_MAX } from '../../state/speedRange'
import type { NodeEmitters } from '../../codegen/emitContext'
import { seedProp } from '../../codegen/cppLiterals'

export const GENERATIVE_EMITTERS: NodeEmitters = {
  // Bundled noise node — `noiseType` picks the algorithm. Each variant
  // writes a raw scalar field, then the node maps that field through its
  // palette for the normal frame output. Keep the cases in sync with
  // PROPERTY_META.noiseType and the `Noise` case in graphEvaluator.
  Noise({ node, p, ln, f, ownBuf, ownField, paletteExpr, needsWorley, needsT }) {
    needsT.v = true
    const ob = ownBuf()
    const of = ownField()
    const noiseType = String(p.noiseType ?? 'field')
    const speed = rateCpp(f('speed', 'speed', 0.5), NOISE_SPEED_MAX[noiseType] ?? 1)
    const scale = rateCpp(f('scale', 'scale', 0.5), NOISE_SCALE_MAX[noiseType] ?? 1)
    const seed = seedProp(p)
    const timeExpr = seed ? `(t+${(seed * 0.013).toFixed(3)}f)` : 't'
    const pal = paletteExpr(node.id, 'paletteIn', p)
    switch (noiseType) {
      case 'simplex':
        ln(`  { // Simplex2D`)
        ln(`    float _spd=${speed},_sc=${scale},_t=${timeExpr};`)
        ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
        ln(`      float _n=sin(_x*_sc+sin(_y*_sc*0.8f+_t*_spd*0.5f)+_t*_spd)`)
        ln(`            +0.5f*sin(_x*_sc*2+_t*_spd*1.9f)+0.25f*sin(_x*_sc*4+_t*_spd*4.1f);`)
        ln(`      ${of}[_y*WIDTH+_x]=constrain(_n*0.25f+0.5f,0.0f,1.0f);}}`)
        break
      case 'noise3d':
        ln(`  { // Noise3D`)
        ln(`    float _spd=${speed},_sc=${scale},_t=${timeExpr};`)
        ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
        ln(`      float _n=(sin(_x*_sc+_t*_spd)+cos(_y*_sc+_t*_spd*0.7f))*0.5f`)
        ln(`            +(sin(_x*_sc*1.7f+_t*_spd*1.3f+_y*_sc*0.9f)*0.33f)`)
        ln(`            +(cos(_x*_sc*2.9f+_t*_spd*2.1f)*0.17f);`)
        ln(`      ${of}[_y*WIDTH+_x]=constrain(_n*0.3f+0.5f,0.0f,1.0f);}}`)
        break
      case 'noise4d':
        ln(`  { // Noise4D (looping inoise16 x,y,z,t path)`)
        ln(`    float _spd=${speed},_sc=${scale},_t=${timeExpr},_ang=_t*_spd*6.2831853f;`)
        ln(`    uint32_t _z=(uint32_t)((cosf(_ang)*0.5f+0.5f)*65535.0f);`)
        ln(`    uint32_t _w=(uint32_t)((sinf(_ang)*0.5f+0.5f)*65535.0f);`)
        ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
        ln(`      float _amp=1.0f,_fr=_sc*128.0f,_fn=0.0f,_sum=0.0f;`)
        ln(`      for(int _o=0;_o<3;_o++){`)
        ln(`        uint16_t _raw=inoise16((uint32_t)(_x*_fr),(uint32_t)(_y*_fr),_z+(uint32_t)(_o*8192),_w+(uint32_t)(_o*12288));`)
        ln(`        _fn+=_amp*(_raw/65535.0f); _sum+=_amp; _amp*=0.5f; _fr*=2.0f;`)
        ln(`      }`)
        ln(`      ${of}[_y*WIDTH+_x]=constrain(_fn/max(0.001f,_sum),0.0f,1.0f);`)
        ln(`    }`)
        ln(`  }`)
        break
      case 'worley':
        needsWorley.v = true
        ln(`  { // Worley noise`)
        ln(`    float _spd=${speed},_sc=${scale},_t=${timeExpr};`)
        ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
        ln(`      float _px=_x*_sc,_py=_y*_sc; int _xi=(int)floorf(_px),_yi=(int)floorf(_py); float _f1=1e9f;`)
        ln(`      for(int _dj=-1;_dj<=1;_dj++) for(int _di=-1;_di<=1;_di++){`)
        ln(`        int _cx=_xi+_di,_cy=_yi+_dj; float _h=_worleyHash(_cx,_cy);`)
        ln(`        float _fx=_cx+0.5f+0.45f*sin(_t*_spd+_h*6.2831f);`)
        ln(`        float _fy=_cy+0.5f+0.45f*cos(_t*_spd*1.1f+_h*6.2831f);`)
        ln(`        float _d=sqrtf((_px-_fx)*(_px-_fx)+(_py-_fy)*(_py-_fy)); if(_d<_f1)_f1=_d; }`)
        ln(`      ${of}[_y*WIDTH+_x]=min(1.0f,_f1);}}`)
        break
      case 'plasma':
        ln(`  { float _spd=${speed},_sc=${scale},_t=${timeExpr}; uint16_t _z=(uint16_t)(_t*_spd*10);`)
        ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
        ln(`      float _v=sin(_x*0.2f+_t*_spd)+sin(_y*0.25f+_t*_spd*0.8f)+sin((_x+_y)*0.15f+_t*_spd*0.6f);`)
        ln(`      float _amp=1,_fr=_sc*96,_fn=0; for(int _o=0;_o<3;_o++){ _fn+=_amp*(inoise8((uint16_t)(_x*_fr),(uint16_t)(_y*_fr),_z)/255.0f-0.5f); _amp*=0.5f; _fr*=2; }`)
        ln(`      _v+=_fn*5; float _nf=fmodf(_v*0.15f,1.0f); if(_nf<0)_nf+=1.0f;`)
        ln(`      ${of}[_y*WIDTH+_x]=_nf;}}`)
        break
      case 'sine':
        ln(`  { // Sine 2D — layered sine/cosine interference`)
        ln(`    float _spd=${speed},_sc=${scale},_t=${timeExpr};`)
        ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
        ln(`      float _v=0,_amp=1,_fr=_sc;`)
        ln(`      for(int _o=0;_o<3;_o++){ _v+=_amp*sin(_x*_fr+_t*_spd+_o*1.7f)*cos(_y*_fr*1.3f+_t*_spd*0.8f+_o*2.3f); _amp*=0.5f; _fr*=2.1f; }`)
        ln(`      float _nf=fmodf(_v*0.5f+0.5f,1.0f); if(_nf<0)_nf+=1.0f;`)
        ln(`      ${of}[_y*WIDTH+_x]=_nf;}}`)
        break
      case 'field':
      default:
        ln(`  {`)
        ln(`    float _spd = ${speed}, _scl = ${scale}, _t=${timeExpr};`)
        ln(`    for (int _y = 0; _y < HEIGHT; _y++) for (int _x = 0; _x < WIDTH; _x++) {`)
        ln(`      float _v = (sin(_x * _scl * 0.5f + _t * _spd) + cos(_y * _scl * 0.5f + _t * _spd * 0.7f)) / 2.0f;`)
        ln(`      ${of}[_y * WIDTH + _x] = constrain((_v + 1) * 0.5f, 0.0f, 1.0f);`)
        ln(`    }`)
        ln(`  }`)
        break
    }
    ln(`  for(int _i=0;_i<NUM_LEDS;_i++) ${ob}[_i]=ColorFromPalette(${pal},(uint8_t)(constrain(${of}[_i],0.0f,1.0f)*255.0f));`)
  },
  Plasma({ node, p, ln, f, ownBuf, paletteExpr, needsT }) {
    needsT.v = true
    const ob = ownBuf()
    const speed = rateCpp(f('speed', 'speed', 0.5), SPEED_MAX.Plasma)
    const pal = paletteExpr(node.id, 'paletteIn', p)
    ln(`  {`)
    ln(`    float _spd = ${speed};`)
    ln(`    for (int _y = 0; _y < HEIGHT; _y++) for (int _x = 0; _x < WIDTH; _x++) {`)
    ln(`      float _v = sin(_x / 3.0f + t * _spd) + sin(_y / 3.0f + t * _spd * 0.8f)`)
    ln(`              + sin((_x + _y) / 5.0f + t * _spd * 0.6f)`)
    ln(`              + sin(sqrt((_x - WIDTH/2.0f)*(_x - WIDTH/2.0f) + (_y - HEIGHT/2.0f)*(_y - HEIGHT/2.0f)) / 3.0f + t * _spd * 0.5f);`)
    ln(`      ${ob}[_y * WIDTH + _x] = ColorFromPalette(${pal}, (uint8_t)(_v * 45 + t * 20));`)
    ln(`    }`)
    ln(`  }`)
  },
  Rainbow({ ln, f, ownBuf, needsT }) {
    needsT.v = true
    const ob = ownBuf()
    const deltaHue = `(uint8_t)constrain(${f('deltaHue', 'deltaHue', 6)},0.0f,255.0f)`
    const rate = rateCpp(f('speed', 'speed', 0.3), SPEED_MAX.Rainbow)
    ln(`  fill_rainbow(${ob}, NUM_LEDS, (uint8_t)(t * ${rate}), ${deltaHue});`)
  },
  // Homage to Pride2015 (see the evaluator's evalPride2015 comment) —
  // identical formula on both sides, mapped through CHSV like Plasma.
  Pride2015({ ln, f, ownBuf, needsT }) {
    needsT.v = true
    const ob = ownBuf()
    const speed = rateCpp(f('speed', 'speed', 0.4), SPEED_MAX.Pride2015)
    const scale = rateCpp(f('scale', 'scale', 0.4), SCALE_MAX.Pride2015)
    ln(`  { float _spd=${speed},_sc=${scale}; int _i=0;`)
    ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
    ln(`      float _hue=fmodf(_i*_sc*6.0f+t*_spd*40.0f,360.0f); if(_hue<0)_hue+=360.0f;`)
    ln(`      float _bt=_i*_sc*3.0f+t*_spd*15.0f;`)
    ln(`      float _bri=0.35f+0.65f*(sinf(_bt)*0.5f+0.5f);`)
    ln(`      ${ob}[_y*WIDTH+_x]=CHSV((uint8_t)(_hue/360.0f*255.0f),230,(uint8_t)(_bri*255.0f));`)
    ln(`      _i++; } }`)
  },
  // Homage to the FastLED "Pacifica" ocean-wave demo (see the evaluator's
  // evalPacifica comment) — identical layered-wave formula on both sides.
  Pacifica({ node, p, ln, f, ownBuf, paletteExpr, needsT }) {
    needsT.v = true
    const ob = ownBuf()
    const speed = rateCpp(f('speed', 'speed', 0.35), SPEED_MAX.Pacifica)
    const scale = rateCpp(f('scale', 'scale', 0.5), SCALE_MAX.Pacifica)
    const pal = paletteExpr(node.id, 'paletteIn', p)
    ln(`  { float _spd=${speed},_sc=${scale};`)
    ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
    ln(`      float _v=sinf(_x*0.3f*_sc+t*_spd)`)
    ln(`              +sinf((_x*0.15f*_sc-_y*0.1f*_sc)+t*_spd*0.6f)*0.7f`)
    ln(`              +sinf((_x+_y)*0.08f*_sc+t*_spd*1.3f)*0.5f;`)
    ln(`      float _n=constrain(_v/2.2f*0.5f+0.5f,0.0f,1.0f);`)
    ln(`      CRGB _c=ColorFromPalette(${pal},(uint8_t)(_n*255.0f));`)
    ln(`      float _foam=sinf(_x*0.9f*_sc+_y*0.4f*_sc+t*_spd*2.2f);`)
    ln(`      if(_foam>0.85f){float _w=(_foam-0.85f)/0.15f;`)
    ln(`        _c.r=(uint8_t)(_c.r+(255-_c.r)*_w); _c.g=(uint8_t)(_c.g+(255-_c.g)*_w); _c.b=(uint8_t)(_c.b+(255-_c.b)*_w);}`)
    ln(`      ${ob}[_y*WIDTH+_x]=_c;`)
    ln(`    } }`)
  },
  // Homage to Mark Kriegsman's TwinkleFox (see the evaluator's
  // evalTwinkleFox comment) — the same per-pixel hash + brightness cycle on
  // both sides, so each pixel twinkles identically in preview and firmware.
  TwinkleFox({ node, p, ln, f, ownBuf, paletteExpr, needsT }) {
    needsT.v = true
    const ob = ownBuf()
    const speed = rateCpp(f('speed', 'speed', 0.5), SPEED_MAX.TwinkleFox)
    const density = `constrain((${f('density', 'density', 0.5)}),0.0f,1.0f)`
    const seed = seedProp(p)
    const pal = paletteExpr(node.id, 'paletteIn', p)
    ln(`  { float _spd=${speed}; float _exp=6.0f-5.0f*${density}; int _i=0;`)
    ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
    ln(`      int _si=_i+${seed * 131};`)
    ln(`      float _ph=sinf(_si*12.9898f)*43758.5453f; _ph=_ph-floorf(_ph);`)
    ln(`      float _rt=sinf((_si+11)*12.9898f)*43758.5453f; _rt=0.5f+(_rt-floorf(_rt));`)
    ln(`      float _ci=sinf((_si+23)*12.9898f)*43758.5453f; _ci=_ci-floorf(_ci);`)
    ln(`      float _cy=fmodf(t*_spd*_rt+_ph,1.0f);`)
    ln(`      float _tri=1.0f-fabsf(2.0f*_cy-1.0f);`)
    ln(`      float _bri=powf(_tri,_exp);`)
    ln(`      CRGB _px=ColorFromPalette(${pal},(uint8_t)(_ci*255.0f));`)
    ln(`      _px.nscale8_video((uint8_t)(_bri*255.0f));`)
    ln(`      ${ob}[_y*WIDTH+_x]=_px; _i++; } }`)
  },
  Scanner({ node, p, ln, f, ownBuf, paletteExpr, needsT }) {
    needsT.v = true
    const ob = ownBuf()
    const speed = rateCpp(f('speed', 'speed', 0.45), SPEED_MAX.Scanner)
    const width = `fmaxf(1.0f,${f('width', 'width', 2)})`
    const fade = `constrain((${f('fade', 'fade', 0.6)}),0.0f,1.0f)`
    const horizontal = String(p.axis ?? 'horizontal') !== 'vertical'
    const pal = paletteExpr(node.id, 'paletteIn', p)
    ln(`  { float _spd=${speed},_w=${width},_fd=${fade};`)
    ln(`    float _span=${horizontal ? 'WIDTH' : 'HEIGHT'};`)
    ln(`    float _ph=fmodf(t*_spd,2.0f); if(_ph<0)_ph+=2.0f;`)
    ln(`    float _travel=_ph<=1.0f?_ph:2.0f-_ph;`)
    ln(`    float _pos=_travel*max(0.0f,_span-1.0f);`)
    ln(`    float _core=max(0.5f,_w*0.5f),_tail=_core+_fd*max(1.0f,_span*0.35f),_den=max(0.001f,_tail-_core);`)
    ln(`    CRGB _base=ColorFromPalette(${pal},(uint8_t)(_travel*255.0f));`)
    ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
    ln(`      float _coord=${horizontal ? '(float)_x' : '(float)_y'};`)
    ln(`      float _dist=fabsf(_coord-_pos);`)
    ln(`      float _v=_dist<=_core?1.0f:max(0.0f,1.0f-(_dist-_core)/_den);`)
    ln(`      _v*=_v; CRGB _px=_base; _px.nscale8_video((uint8_t)(_v*255.0f));`)
    ln(`      ${ob}[_y*WIDTH+_x]=_px; } }`)
  },
  Confetti({ node, id, p, ln, f, ownBuf, paletteExpr, needsT }) {
    needsT.v = true
    const ob = ownBuf()
    const speed = rateCpp(f('speed', 'speed', 0.45), SPEED_MAX.Confetti)
    const density = `constrain((${f('density', 'density', 0.45)}),0.0f,1.0f)`
    const fade = `constrain((${f('fade', 'fade', 0.28)}),0.0f,1.0f)`
    const seed = seedProp(p)
    const rnd8 = seed ? `_rnd8_${id}()` : 'random8()'
    const rnd16 = seed ? `(((uint16_t)_rnd8_${id}()<<8)|_rnd8_${id}())` : 'random16()'
    const pal = paletteExpr(node.id, 'paletteIn', p)
    ln(`  {`)
    if (seed) ln(`    static uint32_t _rng_${id}=${seed}u; auto _rnd8_${id}=[&](){ _rng_${id}=_rng_${id}*1664525u+1013904223u; return (uint8_t)(_rng_${id}>>24); };`)
    ln(`    float _spd=${speed}, _den=${density}, _fd=${fade};`)
    ln(`    fadeToBlackBy(${ob}, NUM_LEDS, (uint8_t)(_fd * 255.0f));`)
    ln(`    int _spawns=(int)(_den * (0.08f + _spd * 0.2142857f) * sqrtf((float)NUM_LEDS));`)
    ln(`    if(_spawns<1 && _den * _spd > 0.08f) _spawns=1;`)
    ln(`    uint8_t _drift=(uint8_t)(t * _spd * 14.5714f);`)
    ln(`    for(int _s=0; _s<_spawns; _s++){`)
    ln(`      int _i=${rnd16}%NUM_LEDS;`)
    ln(`      ${ob}[_i] += ColorFromPalette(${pal}, ${rnd8} + _drift);`)
    ln(`    }`)
    ln(`  }`)
  },
  Juggle({ node, p, ln, f, ownBuf, incoming, paletteExpr, needsT }) {
    needsT.v = true
    const ob = ownBuf()
    const speed = rateCpp(f('speed', 'speed', 0.5), SPEED_MAX.Juggle)
    const dots = juggleDotCount(Number(p.count ?? JUGGLE_COUNT.default))
    const fade = `constrain((${f('fade', 'fade', 0.22)}),0.0f,1.0f)`
    const seed = seedProp(p)
    const pal = paletteExpr(node.id, 'paletteIn', p)
    ln(`  {`)
    ln(`    float _spd=${speed}, _fd=${fade};`)
    if (incoming.has(`${node.id}:count`)) {
      ln(`    const float _count=${f('count', 'count', JUGGLE_COUNT.default)};`)
      ln(`    const int _dots=isfinite(_count) ? (int)roundf(constrain(_count,${JUGGLE_COUNT.min}.0f,${JUGGLE_COUNT.max}.0f)) : ${JUGGLE_COUNT.default};`)
    } else {
      ln(`    const int _dots=${dots};`)
    }
    ln(`    fadeToBlackBy(${ob}, NUM_LEDS, (uint8_t)(_fd * 255.0f));`)
    ln(`    for(int _d=0; _d<_dots; _d++){`)
    ln(`      float _phase=${seed ? `${(seed * 0.013).toFixed(3)}f+_d*0.17f` : '0.0f'};`)
    ln(`      float _travel=sinf(t*_spd*(2.5f+_d*0.35f)+_d*0.9f+_phase)*0.5f+0.5f;`)
    ln(`      int _x=(int)roundf(_travel*(WIDTH-1));`)
    ln(`      int _y=_dots<=1 ? (int)roundf((HEIGHT-1)*0.5f) : (int)roundf(((_d+0.5f)*HEIGHT)/(float)_dots-0.5f);`)
    ln(`      float _pulse=0.75f+0.25f*sinf(t*_spd*3.0f+_d+_phase);`)
    ln(`      CRGB _dot=ColorFromPalette(${pal}, (uint8_t)fmodf((_travel*0.35f+_d/(float)_dots)*255.0f, 255.0f));`)
    ln(`      _dot.nscale8_video((uint8_t)(_pulse*255.0f));`)
    ln(`      int _i=_y*WIDTH+_x; ${ob}[_i]+=_dot;`)
    ln(`      CRGB _edge=_dot; _edge.nscale8_video(89);`)
    ln(`      if(_x>0) ${ob}[_i-1]+=_edge; if(_x+1<WIDTH) ${ob}[_i+1]+=_edge;`)
    ln(`      CRGB _vert=_dot; _vert.nscale8_video(46);`)
    ln(`      if(_y>0) ${ob}[_i-WIDTH]+=_vert; if(_y+1<HEIGHT) ${ob}[_i+WIDTH]+=_vert;`)
    ln(`    }`)
    ln(`  }`)
  },
  RadialBurst({ node, p, ln, f, ownBuf, paletteExpr, needsT }) {
    needsT.v = true
    const ob = ownBuf()
    const speed = rateCpp(f('speed', 'speed', 0.5), SPEED_MAX.RadialBurst)
    const rings = f('arms', 'arms', 8)
    const pal = paletteExpr(node.id, 'paletteIn', p)
    ln(`  { float _spd=${speed},_rings=max(1.0f,min(32.0f,${rings})); for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
    ln(`    float _d=sqrt((_x-WIDTH/2.0f)*(_x-WIDTH/2.0f)+(_y-HEIGHT/2.0f)*(_y-HEIGHT/2.0f))/sqrt(WIDTH*WIDTH/4.0f+HEIGHT*HEIGHT/4.0f);`)
    ln(`    float _w=(sin((_d*_rings-t*_spd*3)*3.14159f)+1)/2.0f;`)
    ln(`    ${ob}[_y*WIDTH+_x]=ColorFromPalette(${pal},(uint8_t)(_d*255)); ${ob}[_y*WIDTH+_x].nscale8((uint8_t)(_w*255));}}`)
  },
  Spiral({ node, p, ln, f, ownBuf, paletteExpr, needsT }) {
    needsT.v = true
    const ob = ownBuf()
    const speed = rateCpp(f('speed', 'speed', 0.5), SPEED_MAX.Spiral), arms = f('arms', 'arms', 2)
    const pal = paletteExpr(node.id, 'paletteIn', p)
    ln(`  { float _spd=${speed}; for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
    ln(`    float _d=sqrt((_x-WIDTH/2.0f)*(_x-WIDTH/2.0f)+(_y-HEIGHT/2.0f)*(_y-HEIGHT/2.0f))/sqrt(WIDTH*WIDTH/4.0f+HEIGHT*HEIGHT/4.0f);`)
    ln(`    float _a=atan2(_y-HEIGHT/2.0f,_x-WIDTH/2.0f);float _s=(_a+_d*12.57f-t*_spd*3.14159f)*${arms};`)
    ln(`    ${ob}[_y*WIDTH+_x]=ColorFromPalette(${pal},(uint8_t)((_d+t*0.083f)*255)); ${ob}[_y*WIDTH+_x].nscale8((uint8_t)((sin(_s)+1)/2.0f*230));}}`)
  },
  // Wedge mirror — folds each pixel's polar angle into a single segment,
  // reflects it about the segment's midline, and samples the source there.
  // Mirrors evalKaleidoscope in graphEvaluator.ts: same W/2,H/2 centre, the
  // same two-step fold, and floorf(v+0.5f) to match JS Math.round, so the
  // preview and the flashed sketch produce identical frames.
  Kaleidoscope({ ln, f, ownBuf, srcBuf }) {
    const ob = ownBuf()
    const src = srcBuf('frame')
    if (!src) { ln(`  fill_solid(${ob}, NUM_LEDS, CRGB::Black); // Kaleidoscope: no input`); return }
    // `segments` is wireable, so the wedge angle is computed per frame.
    const seg = f('segments', 'segments', 6)
    ln(`  { float _kCx=WIDTH/2.0f,_kCy=HEIGHT/2.0f;`)
    ln(`    float _kSeg=6.2831853f/max(2.0f,(float)(${seg}));`)
    ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
    ln(`      float _kdx=_x-_kCx,_kdy=_y-_kCy,_kd=sqrtf(_kdx*_kdx+_kdy*_kdy);`)
    ln(`      float _ka=fmodf(fmodf(atan2f(_kdy,_kdx),_kSeg)+_kSeg,_kSeg);`)
    ln(`      if(_ka>_kSeg*0.5f) _ka=_kSeg-_ka;`)
    ln(`      int _ksx=(int)floorf(_kCx+_kd*cosf(_ka)+0.5f),_ksy=(int)floorf(_kCy+_kd*sinf(_ka)+0.5f);`)
    ln(`      ${ob}[_y*WIDTH+_x]=(_ksx<0||_ksx>=WIDTH||_ksy<0||_ksy>=HEIGHT)?CRGB::Black:${src}[_ksy*WIDTH+_ksx];`)
    ln(`    } }`)
  },
  FractalNoise({ node, id, p, ln, f, ownBuf, paletteExpr, needsT }) {
    needsT.v = true
    const ob = ownBuf()
    const speed = rateCpp(f('speed', 'speed', 0.25), SPEED_MAX.FractalNoise), scale = rateCpp(f('scale', 'scale', 0.3), SCALE_MAX.FractalNoise)
    const octaves = `_octv_${id}`
    const octavesDecl = `    int ${octaves}=(int)constrain(${f('octaves', 'octaves', 4)},1.0f,6.0f);`
    const pal = paletteExpr(node.id, 'paletteIn', p)
    const seed = seedProp(p)
    const timeExpr = seed ? `(t+${(seed * 0.013).toFixed(3)}f)` : 't'
    ln(`  { // Fractal noise (fBm via inoise8)`)
    ln(`    float _spd=${speed},_sc=${scale},_t=${timeExpr}; uint16_t _z=(uint16_t)(_t*_spd*40);`)
    ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
    ln(`      float _v=0,_amp=0.5f,_norm=0,_freq=_sc*96;`)
    ln(octavesDecl)
    ln(`      for(int _o=0;_o<${octaves};_o++){`)
    ln(`        _v+=_amp*(inoise8((uint16_t)(_x*_freq),(uint16_t)(_y*_freq),_z)/255.0f);`)
    ln(`        _norm+=_amp; _amp*=0.5f; _freq*=2; }`)
    ln(`      ${ob}[_y*WIDTH+_x]=ColorFromPalette(${pal},(uint8_t)((_v/_norm)*255));}}`)
  },
  GaborNoise({ node, p, ln, f, ownBuf, paletteExpr, needsWorley, needsT }) {
    needsT.v = true
    needsWorley.v = true
    const ob = ownBuf()
    const speed = rateCpp(f('speed', 'speed', 0.33), SPEED_MAX.GaborNoise), scale = rateCpp(f('scale', 'scale', 0.7), SCALE_MAX.GaborNoise)
    const freq = f('frequency', 'frequency', 1.2)
    const orientation = f('orientation', 'orientation', 45)
    const pal = paletteExpr(node.id, 'paletteIn', p)
    const seed = seedProp(p)
    const timeExpr = seed ? `(t+${(seed * 0.013).toFixed(3)}f)` : 't'
    ln(`  { // Gabor noise`)
    ln(`    float _spd=${speed},_sc=${scale},_fr=${freq},_om=${orientation}*0.01745329f,_co=cos(_om),_si=sin(_om);`)
    ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
    ln(`      float _px=_x*_sc,_py=_y*_sc; int _xi=(int)floorf(_px),_yi=(int)floorf(_py); float _v=0;`)
    ln(`      for(int _dj=-1;_dj<=1;_dj++) for(int _di=-1;_di<=1;_di++){`)
    ln(`        int _cx=_xi+_di,_cy=_yi+_dj; float _h=_worleyHash(_cx,_cy),_h2=_worleyHash(_cx+31,_cy-17);`)
    ln(`        float _fx=_cx+0.5f+(_h-0.5f),_fy=_cy+0.5f+(_h2-0.5f);`)
    ln(`        float _dx=_px-_fx,_dy=_py-_fy,_g=expf(-2.5f*(_dx*_dx+_dy*_dy));`)
    ln(`        float _proj=_dx*_co+_dy*_si,_w=_h2<0.5f?1.0f:-1.0f;`)
    ln(`        _v+=_w*_g*cosf(6.2831853f*_fr*_proj+${timeExpr}*_spd+_h*6.2831853f); }`)
    ln(`      ${ob}[_y*WIDTH+_x]=ColorFromPalette(${pal},(uint8_t)((_v*0.5f+0.5f)*255));}}`)
  },
  Blobs({ node, p, ln, f, ownBuf, paletteExpr, needsT }) {
    needsT.v = true
    const ob = ownBuf()
    const speed = rateCpp(f('speed', 'speed', 0.3), SPEED_MAX.Blobs), scale = rateCpp(f('scale', 'scale', 0.44), SCALE_MAX.Blobs)
    const pal = paletteExpr(node.id, 'paletteIn', p)
    ln(`  { // Blobs (metaballs)`)
    ln(`    float _spd=${speed}, _r=${scale}*min(WIDTH,HEIGHT), _r2=_r*_r;`)
    ln(`    int _count=max(1,min(6,(int)floorf(${f('count', 'count', 3)}))); float _bx[6], _by[6];`)
    ln(`    for(int _i=0;_i<_count;_i++){ _bx[_i]=WIDTH*(0.5f+0.4f*sin(t*_spd*(0.7f+_i*0.13f)+_i*1.7f)); _by[_i]=HEIGHT*(0.5f+0.4f*cos(t*_spd*(0.6f+_i*0.17f)+_i*2.3f)); }`)
    ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){ float _f=0;`)
    ln(`      for(int _i=0;_i<_count;_i++){ float _dx=_x-_bx[_i],_dy=_y-_by[_i]; _f+=_r2/(_dx*_dx+_dy*_dy+1.0f); }`)
    ln(`      ${ob}[_y*WIDTH+_x]=ColorFromPalette(${pal},(uint8_t)((_f/(_f+1.0f))*255)); }}`)
  },
}
