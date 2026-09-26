import { rateCpp, SPEED_MAX, SCALE_MAX, FORMULA_FIELD_SPEED_MAX } from '../../state/speedRange'
import { usesShims, cppRewriteShims } from '../../state/fastledShims'
import { isNodeFormulaValid } from '../../state/formulaLang'
import type { NodeEmitters } from '../../codegen/emitContext'
import { seedProp, floatLit } from '../../codegen/cppLiterals'
import { GOLDEN_RATIO, LISSAJOUS_FIELD_SAMPLES } from './evaluate'

export const FIELD_EMITTERS: NodeEmitters = {
  FieldFormula({ p, ln, f, ownField, srcField, needsT, needsShims, needsPhi }) {
    needsT.v = true
    const raw = String(p.formula ?? 'sin8(r*200 + t*60)/255')
    // Same fail-closed validation as CustomFormula above.
    const safe = isNodeFormulaValid(raw)
    if (safe && usesShims(raw)) needsShims.v = true
    if (safe && /\bPHI\b/.test(raw)) needsPhi.v = true
    const formula = safe ? cppRewriteShims(raw).replace(/\*\//g, '* /') : '0.0f'
    const of = ownField()
    const a = f('a', 'a', 0), b = f('b', 'b', 0)
    const fin = srcField('fieldIn')
    ln(`  { /* FieldFormula: ${safe ? raw.replace(/\*\//g, '* /') : 'invalid formula — rendering blank' } */`)
    ln(`    float a=${a}, b=${b}; (void)a;(void)b;`)
    ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
    ln(`      float x=_x, y=_y; (void)x;(void)y;`)
    ln(`      float cx=((float)_x-WIDTH/2.0f)/(WIDTH/2.0f),cy=((float)_y-HEIGHT/2.0f)/(HEIGHT/2.0f);`)
    ln(`      float r=sqrtf(cx*cx+cy*cy),angle=atan2f(cy,cx); (void)cx;(void)cy;(void)r;(void)angle;`)
    ln(`      float fieldIn=${fin ? `${fin}[_y*WIDTH+_x]` : '0.0f'}; (void)fieldIn;`)
    ln(`      float _v=${formula};`)
    ln(`      ${of}[_y*WIDTH+_x]=constrain(_v,0.0f,1.0f);}}`)
  },
  // Same fBm construction as FractalNoise's codegen (inoise8), but written
  // straight to the field buffer instead of through a palette.
  FieldNoise({ id, p, ln, f, ownField, needsT }) {
    needsT.v = true
    const of = ownField()
    const speed = rateCpp(f('speed', 'speed', 0.25), SPEED_MAX.FieldNoise)
    const scale = rateCpp(f('scale', 'scale', 0.3), SCALE_MAX.FieldNoise)
    const octaves = `_octv_${id}`
    const octavesDecl = `    int ${octaves}=(int)constrain(${f('octaves', 'octaves', 4)},1.0f,6.0f);`
    const seed = seedProp(p)
    const timeExpr = seed ? `(t+${(seed * 0.013).toFixed(3)}f)` : 't'
    ln(`  { // Field noise (fBm via inoise8)`)
    ln(`    float _spd=${speed},_sc=${scale},_t=${timeExpr}; uint16_t _z=(uint16_t)(_t*_spd*40);`)
    ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
    ln(`      float _v=0,_amp=0.5f,_norm=0,_freq=_sc*96;`)
    ln(octavesDecl)
    ln(`      for(int _o=0;_o<${octaves};_o++){`)
    ln(`        _v+=_amp*(inoise8((uint16_t)(_x*_freq),(uint16_t)(_y*_freq),_z)/255.0f);`)
    ln(`        _norm+=_amp; _amp*=0.5f; _freq*=2; }`)
    ln(`      ${of}[_y*WIDTH+_x]=constrain(_v/_norm,0.0f,1.0f);}}`)
  },
  // Curated closed-form fields — exact same math as evalFormulaField in
  // graphEvaluator.ts (no approximation gap, unlike inoise8-backed fields),
  // one dedicated block per formulaType baked at generation time (the
  // variant isn't wired, so there's nothing to branch on at runtime). See
  // docs/development/design/formula-pattern-nodes.md.
  FormulaField({ p, ln, f, ownField, needsT }) {
    needsT.v = true
    const of = ownField()
    const formulaType = String(p.formulaType ?? 'rose')
    /*
     * Each knob is hoisted to a `float` local once per frame, not baked as
     * a literal, because they are property inputs now and a wired one is
     * only known at runtime. `f()` still emits a bare literal when nothing
     * is wired, so an untouched node compiles to what it always did; the
     * clamps moved from generation-time `Math.max` into emitted `fmaxf` so
     * a wired value is bounded the same way the evaluator bounds it.
     *
     * Hoisted above the pixel loops rather than inlined: the inner
     * expressions read a local instead of a constant, which costs the same
     * per pixel, and the derived ones (1/n1, the spiral period) are
     * computed once a frame instead of once a pixel.
     */
    const speedMax = floatLit(FORMULA_FIELD_SPEED_MAX[formulaType] ?? 1)
    const spd = `  float _spd=constrain(${f('speed', 'speed', 0.3)},0.0f,1.0f)*${speedMax}; float _rot=t*_spd;`
    switch (formulaType) {
      case 'superformula': {
        ln(`  { /* Formula Field: superformula */`)
        ln(spd)
        ln(`    float _m=fmaxf(1.0f,${f('symmetry', 'symmetry', 6)});`)
        ln(`    float _invN1=1.0f/fmaxf(0.05f,${f('n1', 'n1', 0.3)});`)
        ln(`    float _n2=fmaxf(0.05f,${f('n2', 'n2', 0.3)}),_n3=fmaxf(0.05f,${f('n3', 'n3', 0.3)});`)
        ln(`    float _sfA=fmaxf(0.05f,${f('a', 'a', 1)}),_sfB=fmaxf(0.05f,${f('b', 'b', 1)});`)
        ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
        ln(`      float _cx=((float)_x-WIDTH/2.0f)/(WIDTH/2.0f),_cy=((float)_y-HEIGHT/2.0f)/(HEIGHT/2.0f);`)
        ln(`      float _r=sqrtf(_cx*_cx+_cy*_cy),_theta=atan2f(_cy,_cx)+_rot;`)
        ln(`      float _t1=fabsf(cosf(_m*_theta/4.0f)/_sfA),_t2=fabsf(sinf(_m*_theta/4.0f)/_sfB);`)
        ln(`      float _raux=powf(powf(_t1,_n2)+powf(_t2,_n3),-_invN1);`)
        ln(`      ${of}[_y*WIDTH+_x]=constrain(1.0f-(_r-_raux)/0.06f,0.0f,1.0f);}}`)
        break
      }
      case 'fibonacciSpiral': {
        const lnPhiLit = floatLit(Math.log(GOLDEN_RATIO))
        ln(`  { /* Formula Field: fibonacciSpiral */`)
        ln(spd)
        ln(`    float _turns=fmaxf(1.0f,${f('turns', 'turns', 3)});`)
        ln(`    float _period=6.2831853f/_turns;`)
        ln(`    float _aSp=fmaxf(0.02f,${f('tightness', 'tightness', 0.15)});`)
        ln(`    float _bw=fmaxf(0.02f,${f('bandWidth', 'bandWidth', 0.25)});`)
        ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
        ln(`      float _cx=((float)_x-WIDTH/2.0f)/(WIDTH/2.0f),_cy=((float)_y-HEIGHT/2.0f)/(HEIGHT/2.0f);`)
        ln(`      float _r=sqrtf(_cx*_cx+_cy*_cy); if(_r<1e-4f)_r=1e-4f;`)
        ln(`      float _ang=atan2f(_cy,_cx);`)
        ln(`      float _phaseAtR=(3.14159265f/2.0f)*logf(_r/_aSp)/${lnPhiLit};`)
        ln(`      float _delta=fmodf(_ang+_rot-_phaseAtR,_period); if(_delta<0.0f)_delta+=_period;`)
        ln(`      if(_delta>_period/2.0f)_delta=_period-_delta;`)
        ln(`      ${of}[_y*WIDTH+_x]=constrain(1.0f-_delta/_bw,0.0f,1.0f);}}`)
        break
      }
      case 'goldenTiling': {
        const invPhi = floatLit(1 / GOLDEN_RATIO)
        ln(`  { /* Formula Field: goldenTiling */`)
        ln(spd)
        ln(`    float _dens=fmaxf(1.0f,${f('density', 'density', 12)}),_phase=${f('phase', 'phase', 0)};`)
        ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
        ln(`      float _cx=((float)_x-WIDTH/2.0f)/(WIDTH/2.0f),_cy=((float)_y-HEIGHT/2.0f)/(HEIGHT/2.0f);`)
        ln(`      float _r=sqrtf(_cx*_cx+_cy*_cy);`)
        ln(`      float _n=floorf(_r*_dens+_rot+_phase);`)
        ln(`      float _g=_n*${invPhi};`)
        ln(`      ${of}[_y*WIDTH+_x]=_g-floorf(_g);}}`)
        break
      }
      case 'lissajousField': {
        ln(`  { /* Formula Field: lissajousField */`)
        ln(spd)
        ln(`    float _fa=fmaxf(1.0f,${f('freqA', 'freqA', 3)}),_fb=fmaxf(1.0f,${f('freqB', 'freqB', 2)});`)
        ln(`    float _thick=fmaxf(0.02f,${f('thickness', 'thickness', 0.1)});`)
        ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
        ln(`      float _cx=((float)_x-WIDTH/2.0f)/(WIDTH/2.0f),_cy=((float)_y-HEIGHT/2.0f)/(HEIGHT/2.0f);`)
        ln(`      float _minDSq=1e9f;`)
        ln(`      for(int _s=0;_s<${LISSAJOUS_FIELD_SAMPLES};_s++){`)
        ln(`        float _sp=((float)_s/${LISSAJOUS_FIELD_SAMPLES}.0f)*6.2831853f;`)
        ln(`        float _lx=sinf(_fa*_sp+_rot),_ly=sinf(_fb*_sp);`)
        ln(`        float _dx=_cx-_lx,_dy=_cy-_ly,_dSq=_dx*_dx+_dy*_dy;`)
        ln(`        if(_dSq<_minDSq)_minDSq=_dSq; }`)
        ln(`      ${of}[_y*WIDTH+_x]=constrain(1.0f-sqrtf(_minDSq)/_thick,0.0f,1.0f);}}`)
        break
      }
      case 'rose':
      default: {
        ln(`  { /* Formula Field: rose */`)
        ln(spd)
        ln(`    float _k=fmaxf(1.0f,${f('petals', 'petals', 5)});`)
        ln(`    float _off=(${f('offset', 'offset', 0)})*0.0174532925f;`)
        ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
        ln(`      float _cx=((float)_x-WIDTH/2.0f)/(WIDTH/2.0f),_cy=((float)_y-HEIGHT/2.0f)/(HEIGHT/2.0f);`)
        ln(`      float _r=sqrtf(_cx*_cx+_cy*_cy),_ang=atan2f(_cy,_cx);`)
        ln(`      float _rr=cosf(_k*(_ang+_off+_rot));`)
        ln(`      ${of}[_y*WIDTH+_x]=constrain((_rr+1.0f)/2.0f*(1.0f-_r*0.15f),0.0f,1.0f);}}`)
        break
      }
    }
  },
  WaveSim({ node, id, ln, f, ownField, boolExpr }) {
    const of = ownField()
    const trig = boolExpr(node.id, 'trigger')
    const speed = `max(1,min(12,(int)floorf(${f('speed', 'speed', 4)})))`
    const dampL = `max(0.8f,min(0.999f,${f('damping', 'damping', 0.985)}))`
    const impulseL = `max(0.1f,min(1.0f,${f('impulse', 'impulse', 1)}))`
    const A = `_ws_${id}`
    ln(`  { // WaveSim`)
    ln(`    static float ${A}p[NUM_LEDS], ${A}c[NUM_LEDS], ${A}n[NUM_LEDS]; static bool ${A}prev=false, ${A}init=false; static uint8_t ${A}pulse=1;`)
    ln(`    static const float ${A}px[5]={0.5f,0.26f,0.74f,0.34f,0.7f}, ${A}py[5]={0.5f,0.34f,0.4f,0.76f,0.7f};`)
    ln(`    auto _wsInject_${id}=[&](uint8_t _pulse,float _amp){ float _cx=${A}px[_pulse%5]*(WIDTH-1),_cy=${A}py[_pulse%5]*(HEIGHT-1),_rad=max(1.5f,min(WIDTH,HEIGHT)*0.12f);`)
    ln(`      int _x0=max(0,(int)floorf(_cx-_rad-1.0f)),_x1=min(WIDTH-1,(int)ceilf(_cx+_rad+1.0f)); int _y0=max(0,(int)floorf(_cy-_rad-1.0f)),_y1=min(HEIGHT-1,(int)ceilf(_cy+_rad+1.0f));`)
    ln(`      for(int _y=_y0;_y<=_y1;_y++) for(int _x=_x0;_x<=_x1;_x++){ float _d=sqrtf((_x-_cx)*(_x-_cx)+(_y-_cy)*(_y-_cy)); float _f=max(0.0f,1.0f-_d/_rad); if(_f<=0.0f) continue; int _i=_y*WIDTH+_x; ${A}c[_i]=constrain(${A}c[_i]+_amp*_f*_f,-1.0f,1.0f); } };`)
    ln(`    if(!${A}init){ for(int _i=0;_i<NUM_LEDS;_i++){ ${A}p[_i]=0; ${A}c[_i]=0; ${A}n[_i]=0; } _wsInject_${id}(0,${impulseL}); ${A}init=true; }`)
    ln(`    bool _tr=(${trig}); if(_tr&&!${A}prev){ _wsInject_${id}(${A}pulse,${impulseL}); ${A}pulse++; } ${A}prev=_tr;`)
    ln(`    for(int _it=0;_it<${speed};_it++){`)
    ln(`      for(int _y=0;_y<HEIGHT;_y++){ int _ym=((_y-1+HEIGHT)%HEIGHT)*WIDTH,_yp=((_y+1)%HEIGHT)*WIDTH,_yr=_y*WIDTH;`)
    ln(`        for(int _x=0;_x<WIDTH;_x++){ int _xm=(_x-1+WIDTH)%WIDTH,_xp=(_x+1)%WIDTH,_i=_yr+_x; float _avg=(${A}c[_ym+_x]+${A}c[_yp+_x]+${A}c[_yr+_xm]+${A}c[_yr+_xp])*0.5f; ${A}n[_i]=constrain((_avg-${A}p[_i])*${dampL},-1.0f,1.0f); } }`)
    ln(`      ::memcpy(${A}p,${A}c,sizeof(${A}p)); ::memcpy(${A}c,${A}n,sizeof(${A}c)); }`)
    ln(`    float _peak=0.0f; for(int _i=0;_i<NUM_LEDS;_i++) _peak=max(_peak,fabsf(${A}c[_i]));`)
    ln(`    if(_peak<0.002f){ _wsInject_${id}(${A}pulse,${impulseL}*0.6f); ${A}pulse++; }`)
    ln(`    for(int _i=0;_i<NUM_LEDS;_i++) ${of}[_i]=constrain(fabsf(${A}c[_i])*1.5f,0.0f,1.0f); }`)
  },
  FieldToFrame({ node, p, ln, f, ownBuf, srcField, paletteExpr }) {
    const ob = ownBuf()
    const pal = paletteExpr(node.id, 'paletteIn', p)
    const src = srcField('field')
    const bright = f('brightness', 'brightness', 1)
    if (!src) {
      ln(`  fill_solid(${ob}, NUM_LEDS, CRGB::Black);`)
    } else {
      ln(`  { float _br=constrain(${bright},0.0f,1.0f);`)
      ln(`    for(int _i=0;_i<NUM_LEDS;_i++)`)
      ln(`      ${ob}[_i]=ColorFromPalette(${pal},(uint8_t)(${src}[_i]*255),(uint8_t)(_br*255)); }`)
    }
  },
  // The inverse of FieldToFrame: a 0–1 brightness field from a rendered
  // frame (average of r,g,b, matching Mask's mask-opacity convention).
  FrameToField({ ln, srcBuf, ownField }) {
    const of = ownField()
    const src = srcBuf('frame')
    if (!src) {
      ln(`  for(int _i=0;_i<NUM_LEDS;_i++) ${of}[_i]=0.0f;`)
    } else {
      ln(`  for(int _i=0;_i<NUM_LEDS;_i++) ${of}[_i]=(${src}[_i].r+${src}[_i].g+${src}[_i].b)/3.0f/255.0f;`)
    }
  },
  DistanceField({ ln, f, ownField }) {
    const of = ownField()
    const px = f('px', 'px', 0.5), py = f('py', 'py', 0.5), scale = f('scale', 'scale', 1)
    ln(`  { /* DistanceField */`)
    ln(`    float _px=${px}, _py=${py}, _sc=${scale}; if(_sc<0.0001f)_sc=0.0001f;`)
    ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
    ln(`      float _nx=(float)_x/(WIDTH-1>0?WIDTH-1:1),_ny=(float)_y/(HEIGHT-1>0?HEIGHT-1:1);`)
    ln(`      float _dx=_nx-_px,_dy=_ny-_py;`)
    ln(`      float _d=sqrtf(_dx*_dx+_dy*_dy)/1.41421356f*_sc;`)
    ln(`      ${of}[_y*WIDTH+_x]=constrain(_d,0.0f,1.0f);}}`)
  },
  FieldMath({ p, ln, ownField, srcField }) {
    const of = ownField()
    const op = String(p.fieldOp ?? 'add')
    const sa = srcField('a'), sb = srcField('b')
    const av = sa ? `${sa}[_i]` : '0.0f', bv = sb ? `${sb}[_i]` : '0.0f'
    let expr: string
    switch (op) {
      case 'subtract':   expr = `_a - _b`; break
      case 'multiply':   expr = `_a * _b`; break
      case 'mix':        expr = `(_a + _b) * 0.5f`; break
      case 'min':        expr = `min(_a, _b)`; break
      case 'max':        expr = `max(_a, _b)`; break
      case 'difference': expr = `fabsf(_a - _b)`; break
      case 'add':
      default:           expr = `_a + _b`; break
    }
    ln(`  { /* FieldMath: ${op} */`)
    ln(`    for(int _i=0;_i<NUM_LEDS;_i++){`)
    ln(`      float _a=${av}, _b=${bv};`)
    ln(`      ${of}[_i]=constrain(${expr},0.0f,1.0f);}}`)
  },
  FieldWarp({ ln, f, ownField, srcField }) {
    const of = ownField()
    const st = f('strength', 'strength', 1)
    const src = srcField('field'), sdx = srcField('dx'), sdy = srcField('dy')
    const oxE = sdx ? `(2.0f*${sdx}[_y*WIDTH+_x]-1.0f)*_st` : '0.0f'
    const oyE = sdy ? `(2.0f*${sdy}[_y*WIDTH+_x]-1.0f)*_st` : '0.0f'
    ln(`  { /* FieldWarp */ float _st=${st};`)
    ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
    ln(`      float _ox=${oxE},_oy=${oyE};`)
    ln(`      int _sx=(int)roundf(_x+_ox); if(_sx<0)_sx=0; if(_sx>WIDTH-1)_sx=WIDTH-1;`)
    ln(`      int _sy=(int)roundf(_y+_oy); if(_sy<0)_sy=0; if(_sy>HEIGHT-1)_sy=HEIGHT-1;`)
    ln(`      ${of}[_y*WIDTH+_x]=${src ? `${src}[_sy*WIDTH+_sx]` : '0.0f'};}}`)
  },
  FieldRotate({ ln, f, ownField, srcField, needsT }) {
    needsT.v = true
    const of = ownField()
    const angle = f('angle', 'angle', 0), spin = f('spin', 'spin', 0)
    const src = srcField('field')
    ln(`  { /* FieldRotate */ float _ang=((${angle})+t*${spin})*0.01745329f;`)
    ln(`    float _ca=cosf(-_ang),_sa=sinf(-_ang),_cx=(WIDTH-1)/2.0f,_cy=(HEIGHT-1)/2.0f;`)
    ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
    ln(`      float _dx=_x-_cx,_dy=_y-_cy;`)
    ln(`      int _sx=(((int)roundf(_dx*_ca-_dy*_sa+_cx))%WIDTH+WIDTH)%WIDTH;`)
    ln(`      int _sy=(((int)roundf(_dx*_sa+_dy*_ca+_cy))%HEIGHT+HEIGHT)%HEIGHT;`)
    ln(`      ${of}[_y*WIDTH+_x]=${src ? `${src}[_sy*WIDTH+_sx]` : '0.0f'};}}`)
  },
  FieldTile({ ln, f, ownField, srcField }) {
    const of = ownField()
    const tx = f('tilesX', 'tilesX', 2)
    const ty = f('tilesY', 'tilesY', 2)
    const src = srcField('field')
    ln(`  { /* FieldTile */`)
    ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
    ln(`      int _tx=max(1,(int)roundf(${tx})),_ty=max(1,(int)roundf(${ty})); int _sx=(_x*_tx)%WIDTH,_sy=(_y*_ty)%HEIGHT;`)
    ln(`      ${of}[_y*WIDTH+_x]=${src ? `${src}[_sy*WIDTH+_sx]` : '0.0f'};}}`)
  },
}
