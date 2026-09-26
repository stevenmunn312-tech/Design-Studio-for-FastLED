import {
  asFont,
  textBlockLayout,
  textAlignMode,
  TEXT_LINE_GAP,
  FONT_W,
  textColumns,
  DEFAULT_FONT,
  FONT_H,
} from '../../state/font'
import { asAnimatedImage, asImage } from '../../state/image'
import { hexToRgb } from '../../state/polinePalette'
import { rateCpp, SPEED_MAX } from '../../state/speedRange'
import {
  resolveWireframeMesh,
  meshBoundingRadius,
  WIREFRAME_CAM_FAR,
  WIREFRAME_CAM_NEAR,
  WIREFRAME_FIT_MARGIN,
} from '../../state/wireframeModel'
import type { NodeEmitters } from '../../codegen/emitContext'
import { safeId, floatLit } from '../../codegen/cppLiterals'

// Circle's and ClockDisplay's `radius` were originally tuned as raw pixel
// counts against a 16x16 matrix (graphEvaluator.ts's DEFAULT_W/DEFAULT_H).
// scaleWithMatrix (opt-in per node) scales that radius proportionally by the
// target matrix's shorter side, using the WIDTH/HEIGHT *macro names* (not
// baked JS numbers) so it tracks the supersampled render resolution — mirrors
// graphEvaluator.ts's matrixSizeScale(); keep the reference size (16) in sync.
// Returns `radiusExpr` unchanged when the toggle is off, so existing sketches
// generate byte-identical code.
function withMatrixScale(radiusExpr: string, p: Record<string, unknown>): string {
  return p.scaleWithMatrix ? `${radiusExpr}*(min(WIDTH,HEIGHT)/16.0f)` : radiusExpr
}

// Every character the Clock Display can print, in every mode (digits, the
// separators, and the AM/PM letters). Its glyph columns are pulled from the
// shared bitmap font when the sketch is generated.
const CLOCK_GLYPH_CHARS = '0123456789:.-AMP'

// Mirrors graphEvaluator's textAlignedStart/normalizedCenterAxis for the Text
// node's C++ codegen: 'center' keeps the existing centred formula (an object
// of half-extent `lengthExpr/2` sliding so its centre tracks `valueExpr`);
// 'start'/'end' instead anchor a zero-extent edge to `valueExpr`, matching
// the JS float-then-floor order exactly — floor happens before subtracting
// the (integer) length for 'end', not inside it, since hAlign/vAlign/wrap are
// static node properties (never wired), so the branch is resolved here at
// generation time rather than emitted as C++ conditionals.
function textAxisStartExpr(valueExpr: string, sizeVar: string, lengthExpr: string, align: 'start' | 'center' | 'end', wrap: boolean): string {
  if (align === 'center') {
    const half = `(${lengthExpr}) * 0.5f`
    if (wrap) {
      return `floorf((${sizeVar} * 0.5f - ${sizeVar}) + (${valueExpr}) * (${sizeVar} * 2.0f) - (${half}))`
    }
    return `floorf((0.5f - ((${half}) + 1.0f)) + (${valueExpr}) * ((${sizeVar} - 1.0f) + 2.0f * ((${half}) + 1.0f)) - (${half}))`
  }
  const edge = wrap
    ? `floorf((${sizeVar} * 0.5f - ${sizeVar}) + (${valueExpr}) * (${sizeVar} * 2.0f))`
    : `floorf((0.5f - 1.0f) + (${valueExpr}) * ((${sizeVar} - 1.0f) + 2.0f))`
  return align === 'end' ? `(${edge}) - (${lengthExpr})` : edge
}

export const SHAPES_EMITTERS: NodeEmitters = {
  SolidColor({ ln, channelColor, ownBuf }) {
    const ob = ownBuf()
    const color = channelColor('color', 255, 0, 128)
    ln(`  fill_solid(${ob}, NUM_LEDS, ${color});`)
  },
  Circle({ node, p, ln, f, ownBuf, seedFrom, incoming, colorExpr }) {
    // A circle is Shape's ellipse at aspect 1 — same SDF coverage and
    // nblend compositing as the Shape case, so drawing matches exactly.
    const ob = ownBuf()
    const hexCrgb = (hex: unknown, def: number) => {
      const m = /^#([0-9a-f]{6})$/i.exec(String(hex))
      const n = m ? parseInt(m[1], 16) : def
      return `CRGB(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`
    }
    const fillE = incoming.get(`${node.id}:fill`) ? colorExpr(node.id, 'fill') : hexCrgb(p.fill, 0xff3080)
    const edgeE = incoming.get(`${node.id}:edge`) ? colorExpr(node.id, 'edge') : hexCrgb(p.edge, 0xff0080)
    const filled = (p.filled ?? true) !== false
    const emitCirclePass = (cxExpr: string, cyExpr: string, indent: string) => {
      ln(`${indent}for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
      ln(`${indent}  float _dx=(_x+0.5f)-${cxExpr},_dy=(_y+0.5f)-${cyExpr},_sd=sqrtf(_dx*_dx+_dy*_dy)-_rad;`)
      ln(`${indent}  float _fc=${filled ? 'constrain(0.5f-_sd,0.0f,1.0f)' : '0.0f'};`)
      ln(`${indent}  float _ec=constrain(_th*0.5f+0.5f-fabsf(_sd),0.0f,1.0f);`)
      ln(`${indent}  float _al=max(_fc,_ec); if(_al<=0.0f) continue;`)
      ln(`${indent}  CRGB _col=_fill; nblend(_col,_edge,(uint8_t)(_ec*255.0f)); nblend(${ob}[_y*WIDTH+_x],_col,(uint8_t)(_al*255.0f)); }`)
    }
    ln(`  { ${seedFrom('base')}`)
    ln(`    float _rad=max(0.5f,${withMatrixScale(f('radius', 'radius', 6), p)});`)
    ln(`    CRGB _fill=${fillE},_edge=${edgeE};`)
    ln(`    float _th=max(0.0f,${f('thickness', 'thickness', 1.5)});`)
    ln(`    float _extent=_rad+_th*0.5f;`)
    ln(`    float _cxv=${f('cx', 'cx', 0.5)},_cyv=${f('cy', 'cy', 0.5)};`)
    if (p.wrap) {
      ln(`    float _cx=_cxv>1.0f?_cxv:(WIDTH*0.5f-WIDTH)+_cxv*(WIDTH*2.0f),_cy=_cyv>1.0f?_cyv:(HEIGHT*0.5f-HEIGHT)+_cyv*(HEIGHT*2.0f);`)
      ln(`    float _wrapX[3]={-(float)WIDTH,0.0f,(float)WIDTH};`)
      ln(`    float _wrapY[3]={-(float)HEIGHT,0.0f,(float)HEIGHT};`)
      ln(`    for(int _wy=0;_wy<3;_wy++) for(int _wx=0;_wx<3;_wx++){`)
      ln(`      float _wcx=_cx+_wrapX[_wx],_wcy=_cy+_wrapY[_wy];`)
      emitCirclePass('_wcx', '_wcy', '      ')
      ln(`    }`)
    } else {
      ln(`    float _m=_extent+1.0f;`)
      ln(`    float _cx=_cxv>1.0f?_cxv:(0.5f-_m)+_cxv*((WIDTH-1.0f)+2.0f*_m),_cy=_cyv>1.0f?_cyv:(0.5f-_m)+_cyv*((HEIGHT-1.0f)+2.0f*_m);`)
      emitCirclePass('_cx', '_cy', '    ')
    }
  },
  Line({ ln, f, channelColor, ownBuf, seedFrom }) {
    const ob = ownBuf()
    const colorE = channelColor('color', 0, 200, 255)
    const x1 = f('x1', 'x1', 0), y1 = f('y1', 'y1', 0)
    const x2 = f('x2', 'x2', 0), y2 = f('y2', 'y2', 0)
    ln(`  { ${seedFrom('base')}`)
    ln(`    float _x0 = ${x1}, _y0 = ${y1}, _x1 = ${x2}, _y1 = ${y2};`)
    ln(`    float _len = sqrtf((_x1 - _x0) * (_x1 - _x0) + (_y1 - _y0) * (_y1 - _y0));`)
    ln(`    int _steps = max(1, (int)ceilf(_len * 2.0f));`)
    ln(`    for (int _i = 0; _i <= _steps; _i++) {`)
    ln(`      float _u = _i / (float)_steps;`)
    ln(`      float _sx = _x0 + (_x1 - _x0) * _u, _sy = _y0 + (_y1 - _y0) * _u, _rad = 0.5f;`)
    ln(`      int _xmin = max(0, (int)floorf(_sx - _rad - 1.0f)), _xmax = min(WIDTH - 1, (int)ceilf(_sx + _rad + 1.0f));`)
    ln(`      int _ymin = max(0, (int)floorf(_sy - _rad - 1.0f)), _ymax = min(HEIGHT - 1, (int)ceilf(_sy + _rad + 1.0f));`)
    ln(`      for (int _y = _ymin; _y <= _ymax; _y++) for (int _x = _xmin; _x <= _xmax; _x++) {`)
    ln(`        float _dx = (_x + 0.5f) - _sx, _dy = (_y + 0.5f) - _sy;`)
    ln(`        float _cov = constrain(_rad + 0.5f - sqrtf(_dx * _dx + _dy * _dy), 0.0f, 1.0f);`)
    ln(`        if (_cov <= 0.0f) continue; CRGB _add = ${colorE}; _add.nscale8((uint8_t)(_cov * 255.0f)); ${ob}[_y * WIDTH + _x] += _add; } } }`)
  },
  // Bundled shape: rect / ellipse / regular polygon, filled (fill colour)
  // and/or outlined (edge colour, thickness), over-composited with AA.
  // Fractional `sides` blends floor/ceil polygon SDFs for a seamless morph.
  // Keep in sync with evalShape() in graphEvaluator.ts.
  Shape({ node, p, ln, f, ownBuf, seedFrom, incoming, colorExpr }) {
    const ob = ownBuf()
    const hexCrgb = (hex: unknown, def: number) => {
      const m = /^#([0-9a-f]{6})$/i.exec(String(hex))
      const n = m ? parseInt(m[1], 16) : def
      return `CRGB(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`
    }
    const shape = ['rect', 'ellipse'].includes(String(p.shape)) ? String(p.shape) : 'polygon'
    const cx = Number(p.cx ?? 0.5), cy = Number(p.cy ?? 0.5)
    const size = Math.max(0.5, Number(p.size ?? 6))
    const aspect = shape === 'polygon' ? 1 : Math.max(0.01, Number(p.aspect ?? 1))
    const rot = Number(p.rotation ?? 0)
    const thick = Math.max(0, Number(p.thickness ?? 1.5))
    const filled = (p.filled ?? true) !== false
    const fillE = incoming.get(`${node.id}:fill`) ? colorExpr(node.id, 'fill') : hexCrgb(p.fill, 0xff3080)
    const edgeE = incoming.get(`${node.id}:edge`) ? colorExpr(node.id, 'edge') : hexCrgb(p.edge, 0x00e0ff)
    const emitShapePass = (cxExpr: string, cyExpr: string, indent: string) => {
      ln(`${indent}for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
      ln(`${indent}  float _dx=(_x+0.5f)-${cxExpr},_dy=(_y+0.5f)-${cyExpr},_lx=_dx*_cr-_dy*_sr,_ly=_dx*_sr+_dy*_cr,_sd;`)
      if (shape === 'rect') {
        ln(`${indent}  float _ax=_size*_aspect,_ay=_size;`)
        ln(`${indent}  float _qx=fabsf(_lx)-_ax,_qy=fabsf(_ly)-_ay,_mx=max(_qx,0.0f),_my=max(_qy,0.0f);`)
        ln(`${indent}  _sd=sqrtf(_mx*_mx+_my*_my)+min(max(_qx,_qy),0.0f);`)
      } else if (shape === 'ellipse') {
        ln(`${indent}  float _ax=_size*_aspect,_ay=_size,_ex=_lx/_ax,_ey=_ly/_ay; _sd=(sqrtf(_ex*_ex+_ey*_ey)-1.0f)*min(_ax,_ay);`)
      } else {
        ln(`${indent}  float _r=sqrtf(_lx*_lx+_ly*_ly),_pa=atan2f(_ly,_lx);`)
        ln(`${indent}  float _s0=6.2831853f/_nlo,_a0=fmodf(fmodf(_pa,_s0)+_s0,_s0)-_s0*0.5f,_sdl=_r-_size*cosf(3.14159265f/_nlo)/cosf(_a0),_sd2=_sdl;`)
        ln(`${indent}  if(_fr>0.0f){ float _s1=6.2831853f/(_nlo+1),_a1=fmodf(fmodf(_pa,_s1)+_s1,_s1)-_s1*0.5f; _sd2=_r-_size*cosf(3.14159265f/(_nlo+1))/cosf(_a1); }`)
        ln(`${indent}  _sd=_sdl*(1.0f-_fr)+_sd2*_fr;`)
      }
      ln(`${indent}  float _fc=${filled ? 'constrain(0.5f-_sd,0.0f,1.0f)' : '0.0f'};`)
      ln(`${indent}  float _ec=constrain(_th*0.5f+0.5f-fabsf(_sd),0.0f,1.0f);`)
      ln(`${indent}  float _al=max(_fc,_ec); if(_al<=0.0f) continue;`)
      ln(`${indent}  CRGB _col=_fill; nblend(_col,_edge,(uint8_t)(_ec*255.0f)); nblend(${ob}[_y*WIDTH+_x],_col,(uint8_t)(_al*255.0f)); }`)
    }
    ln(`  { ${seedFrom('base')}`)
    ln(`    float _size=max(0.5f,${f('size', 'size', size)}),_aspect=max(0.01f,${f('aspect', 'aspect', aspect)}),_ra=-(${f('rotation', 'rotation', rot)})*0.01745329f,_cr=cosf(_ra),_sr=sinf(_ra);`)
    ln(`    CRGB _fill=${fillE},_edge=${edgeE};`)
    ln(`    float _th=max(0.0f,${f('thickness', 'thickness', thick)});`)
    if (shape === 'polygon') {
      ln(`    float _extentX=_size+_th*0.5f,_extentY=_size+_th*0.5f;`)
    } else {
      ln(`    float _ax=max(0.01f,_size*_aspect),_ay=max(0.01f,_size);`)
      ln(`    float _extentX=_ax*fabsf(_cr)+_ay*fabsf(_sr)+_th*0.5f,_extentY=_ax*fabsf(_sr)+_ay*fabsf(_cr)+_th*0.5f;`)
    }
    if (shape === 'polygon') ln(`    float _n=max(3.0f,(float)(${f('sides', 'sides', 5)})); int _nlo=(int)floorf(_n); float _fr=_n-_nlo;`)
    ln(`    float _cxv=${f('cx', 'cx', cx)},_cyv=${f('cy', 'cy', cy)};`)
    if (p.wrap) {
      ln(`    float _cx=_cxv>1.0f?_cxv:(WIDTH*0.5f-WIDTH)+_cxv*(WIDTH*2.0f),_cy=_cyv>1.0f?_cyv:(HEIGHT*0.5f-HEIGHT)+_cyv*(HEIGHT*2.0f);`)
      ln(`    float _wrapX[3]={-(float)WIDTH,0.0f,(float)WIDTH};`)
      ln(`    float _wrapY[3]={-(float)HEIGHT,0.0f,(float)HEIGHT};`)
      ln(`    for(int _wy=0;_wy<3;_wy++) for(int _wx=0;_wx<3;_wx++){`)
      ln(`      float _wcx=_cx+_wrapX[_wx],_wcy=_cy+_wrapY[_wy];`)
      emitShapePass('_wcx', '_wcy', '      ')
      ln(`    }`)
    } else {
      ln(`    float _mx=_extentX+1.0f,_my=_extentY+1.0f;`)
      ln(`    float _cx=_cxv>1.0f?_cxv:(0.5f-_mx)+_cxv*((WIDTH-1.0f)+2.0f*_mx),_cy=_cyv>1.0f?_cyv:(0.5f-_my)+_cyv*((HEIGHT-1.0f)+2.0f*_my);`)
      emitShapePass('_cx', '_cy', '    ')
    }
    ln(`  }`)
  },
  Path({ p, ln, f, channelColor, ownBuf, seedFrom }) {
    const ob = ownBuf()
    const colorE = channelColor('color', 255, 220, 80)
    const shape = String(p.pathShape ?? 'circle')
    const scale = Number(p.scale ?? 0.8)
    const thickness = Number(p.thickness ?? 1.25)
    const tExpr = f('t', 't', 0)
    let pathExpr = `float _px = cosf(_ang), _py = sinf(_ang);`
    if (shape === 'heart') {
      pathExpr = `float _px = 16.0f * powf(sinf(_ang), 3.0f) / 18.0f; float _py = (13.0f*cosf(_ang)-5.0f*cosf(_ang*2.0f)-2.0f*cosf(_ang*3.0f)-cosf(_ang*4.0f)) / 18.0f;`
    } else if (shape === 'lissajous') {
      pathExpr = `float _px = sinf(_ang + 1.5707963f), _py = sinf(_ang * 2.0f);`
    } else if (shape === 'rose') {
      pathExpr = `float _pr = cosf(_ang * 4.0f); float _px = _pr * cosf(_ang), _py = _pr * sinf(_ang);`
    }
    ln(`  { ${seedFrom('base')}`)
    ln(`    float _tt = constrain(${tExpr}, 0.0f, 1.0f);`)
    ln(`    float _ang = _tt * 6.2831853f;`)
    ln(`    ${pathExpr}`)
    ln(`    float _rad = max(0.25f, ${f('thickness', 'thickness', thickness)} * 0.5f);`)
    ln(`    float _ext = max(0.0f, min((float)WIDTH, (float)HEIGHT) * 0.5f * ${f('scale', 'scale', scale)} - _rad);`)
    ln(`    float _sx = (WIDTH - 1) * 0.5f + _px * _ext;`)
    ln(`    float _sy = (HEIGHT - 1) * 0.5f - _py * _ext;`)
    ln(`    int _x0 = max(0, (int)floorf(_sx - _rad - 1.0f)), _x1 = min(WIDTH - 1, (int)ceilf(_sx + _rad + 1.0f));`)
    ln(`    int _y0 = max(0, (int)floorf(_sy - _rad - 1.0f)), _y1 = min(HEIGHT - 1, (int)ceilf(_sy + _rad + 1.0f));`)
    ln(`    for (int _y = _y0; _y <= _y1; _y++) for (int _x = _x0; _x <= _x1; _x++) {`)
    ln(`      float _dx = (_x + 0.5f) - _sx, _dy = (_y + 0.5f) - _sy;`)
    ln(`      float _cov = constrain(_rad + 0.5f - sqrtf(_dx * _dx + _dy * _dy), 0.0f, 1.0f);`)
    ln(`      if (_cov <= 0.0f) continue; CRGB _add = ${colorE}; _add.nscale8((uint8_t)(_cov * 255.0f)); ${ob}[_y * WIDTH + _x] += _add; } }`)
  },
  // Rotating 3D wireframe. The selected preset (or validated custom
  // upload) is baked as flat vertex/edge arrays at codegen time; the
  // per-frame rotation/projection/edge-rasterization math is a hand-port
  // of projectWireframeVertices() in state/wireframeModel.ts and the
  // Wireframe3D case in graphEvaluator.ts — keep all three in lockstep.
  Wireframe3D({ id, p, ln, f, channelColor, ownBuf, seedFrom, needsT }) {
    const ob = ownBuf()
    needsT.v = true
    const mesh = resolveWireframeMesh(p.model, p.mesh)
    const vertCount = mesh.vertices.length / 3
    const edgeCount = mesh.edges.length / 2
    const radius = meshBoundingRadius(mesh)
    const spinX = f('spinX', 'spinX', 0)
    const spinY = f('spinY', 'spinY', 40)
    const spinZ = f('spinZ', 'spinZ', 0)
    // The evaluator's own floor, re-emitted so it still holds on a wired
    // value: a scale of zero collapses every vertex onto the centre.
    const scaleMul = `fmaxf(0.05f, ${f('scale', 'scale', 1)})`
    const perspective = p.projection === 'perspective'
    // Camera distance was folded at generation time. It is one expression
    // over the strength knob, so it becomes a local instead — emitted only
    // under perspective, since an orthographic sketch never reads it and
    // an unused local is a warning per sketch.
    const strength = `constrain(${f('perspectiveStrength', 'perspectiveStrength', 0.4)}, 0.0f, 1.0f)`
    const camDist = `_wfCam_${id}`
    const depthShade = p.depthShade !== false
    const colorE = channelColor('color', 0, 200, 255)
    ln(`  { ${seedFrom('base')}`)
    ln(`    static const float _vtx_${id}[] = {${mesh.vertices.map((n) => `${n.toFixed(6)}f`).join(',')}};`)
    ln(`    static const uint8_t _edg_${id}[] = {${mesh.edges.join(',')}};`)
    ln(`    CRGB _wfColor = ${colorE};`)
    ln(`    float _ax = (${spinX}) * t * 0.017453293f, _ay = (${spinY}) * t * 0.017453293f, _az = (${spinZ}) * t * 0.017453293f;`)
    if (perspective) {
      // Both constants go through toFixed: WIREFRAME_CAM_FAR is a whole
      // number, and `6f` is not a C++ literal — an integer cannot take the
      // float suffix, so it has to be emitted as `6.0000f`.
      ln(`    float ${camDist} = ${WIREFRAME_CAM_FAR.toFixed(4)}f - (${strength}) * ${(WIREFRAME_CAM_FAR - WIREFRAME_CAM_NEAR).toFixed(4)}f;`)
    }
    ln(`    float _cx1=cosf(_ax),_sx1=sinf(_ax),_cy1=cosf(_ay),_sy1=sinf(_ay),_cz1=cosf(_az),_sz1=sinf(_az);`)
    ln(`    float _ccx=(WIDTH-1)*0.5f,_ccy=(HEIGHT-1)*0.5f;`)
    ln(`    float _fit=(min((float)WIDTH,(float)HEIGHT)*0.5f)*${WIREFRAME_FIT_MARGIN}f*${scaleMul};`)
    ln(`    float _sxp[${vertCount}], _syp[${vertCount}], _sdp[${vertCount}];`)
    ln(`    for (int _i = 0; _i < ${vertCount}; _i++) {`)
    ln(`      float _x=_vtx_${id}[_i*3]/${radius.toFixed(6)}f,_y=_vtx_${id}[_i*3+1]/${radius.toFixed(6)}f,_z=_vtx_${id}[_i*3+2]/${radius.toFixed(6)}f;`)
    ln(`      float _ry=_y*_cx1-_z*_sx1,_rz=_y*_sx1+_z*_cx1; _y=_ry; _z=_rz;`)
    ln(`      float _rx=_x*_cy1+_z*_sy1; _rz=-_x*_sy1+_z*_cy1; _x=_rx; _z=_rz;`)
    ln(`      _rx=_x*_cz1-_y*_sz1; _ry=_x*_sz1+_y*_cz1; _x=_rx; _y=_ry;`)
    if (perspective) {
      ln(`      float _factor=${camDist}/(${camDist}-_z);`)
      ln(`      _sxp[_i]=_ccx+_x*_factor*_fit; _syp[_i]=_ccy-_y*_factor*_fit;`)
    } else {
      ln(`      _sxp[_i]=_ccx+_x*_fit; _syp[_i]=_ccy-_y*_fit;`)
    }
    ln(`      _sdp[_i]=(_z+1.0f)*0.5f;`)
    ln(`    }`)
    ln(`    for (int _e = 0; _e < ${edgeCount}; _e++) {`)
    ln(`      int _i0=_edg_${id}[_e*2],_i1=_edg_${id}[_e*2+1];`)
    ln(`      float _x0=_sxp[_i0],_y0=_syp[_i0],_x1=_sxp[_i1],_y1=_syp[_i1];`)
    ln(`      float _len=sqrtf((_x1-_x0)*(_x1-_x0)+(_y1-_y0)*(_y1-_y0));`)
    ln(`      int _steps=max(1,(int)ceilf(_len*2.0f));`)
    ln(`      for (int _s = 0; _s <= _steps; _s++) {`)
    ln(`        float _u=_s/(float)_steps;`)
    ln(`        float _px=_x0+(_x1-_x0)*_u,_py=_y0+(_y1-_y0)*_u;`)
    if (depthShade) {
      ln(`        float _depth=_sdp[_i0]+(_sdp[_i1]-_sdp[_i0])*_u,_bright=0.35f+0.65f*_depth;`)
    } else {
      ln(`        float _bright=1.0f;`)
    }
    ln(`        float _rad=0.5f;`)
    ln(`        int _xmin=max(0,(int)floorf(_px-_rad-1.0f)),_xmax=min(WIDTH-1,(int)ceilf(_px+_rad+1.0f));`)
    ln(`        int _ymin=max(0,(int)floorf(_py-_rad-1.0f)),_ymax=min(HEIGHT-1,(int)ceilf(_py+_rad+1.0f));`)
    ln(`        for (int _y = _ymin; _y <= _ymax; _y++) for (int _x = _xmin; _x <= _xmax; _x++) {`)
    ln(`          float _dx=(_x+0.5f)-_px,_dy=(_y+0.5f)-_py;`)
    ln(`          float _cov=constrain(_rad+0.5f-sqrtf(_dx*_dx+_dy*_dy),0.0f,1.0f);`)
    ln(`          if (_cov<=0.0f) continue; CRGB _add=_wfColor; _add.nscale8((uint8_t)(_bright*_cov*255.0f)); ${ob}[_y*WIDTH+_x] += _add; } } }`)
    ln(`  }`)
  },
  Text({ node, id, p, ln, f, channelColor, ownBuf, incoming, needsT }) {
    const ob = ownBuf()
    const text = String(p.text ?? 'HELLO')
    const font = asFont(p.font)
    const letterSpacing = Math.max(0, Math.round(Number(p.letterSpacing ?? 1)))
    const layout = textBlockLayout(text, font, letterSpacing)
    const hAlign = textAlignMode(p.hAlign ?? 'center', 'left', 'right')
    const vAlign = textAlignMode(p.vAlign ?? 'middle', 'top', 'bottom')
    const scrollAxis: 'horizontal' | 'vertical' = p.scrollAxis === 'vertical' ? 'vertical' : 'horizontal'
    const wrap = Boolean(p.wrap)
    const renderableLines = layout.lines
      .map((line, index) => ({ ...line, index }))
      .filter((line) => line.cols.length > 0)
    const dynamic = !!incoming.get(`${node.id}:scroll`) || Number(p.scroll ?? 0) !== 0
    const colorE = channelColor('color', 0, 255, 255)
    ln(`  { // Text "${text.replace(/[^ -~]/g, '?')}"`)
    for (const line of renderableLines) {
      ln(`    static const uint8_t _txt_${id}_${line.index}[] = {${line.cols.join(',')}};`)
      ln(`    const int _tn_${id}_${line.index} = ${line.cols.length};`)
    }
    ln(`    fill_solid(${ob}, NUM_LEDS, CRGB::Black);`)
    if (dynamic) {
      needsT.v = true
      if (scrollAxis === 'vertical') {
        ln(`    int _totY = ${layout.height} + HEIGHT, _offY = (((int)(t * (${f('scroll', 'scroll', 0)})) % _totY) + _totY) % _totY, _offX = 0;`)
      } else {
        ln(`    int _totX = ${layout.width} + WIDTH, _offX = (((int)(t * (${f('scroll', 'scroll', 0)})) % _totX) + _totX) % _totX, _offY = 0;`)
      }
    } else {
      ln(`    int _offX = 0, _offY = 0;`)
    }
    const syExpr = textAxisStartExpr(f('y', 'y', 0.5), 'HEIGHT', `${layout.height}`, vAlign, wrap)
    ln(`    int _sy = (int)${syExpr};`)
    for (const line of renderableLines) {
      const sxExpr = textAxisStartExpr(f('x', 'x', 0.5), 'WIDTH', `_tn_${id}_${line.index}`, hAlign, wrap)
      ln(`    int _sx_${line.index} = (int)${sxExpr};`)
    }
    if (wrap) {
      ln(`    int _wrapX[3] = {-WIDTH, 0, WIDTH};`)
      ln(`    int _wrapY[3] = {-HEIGHT, 0, HEIGHT};`)
      ln(`    for (int _wy = 0; _wy < 3; _wy++) for (int _wx = 0; _wx < 3; _wx++) {`)
      for (const line of renderableLines) {
        const lineOffset = line.index * (font.h + TEXT_LINE_GAP)
        ln(`      for (int _x = 0; _x < WIDTH; _x++) { int _ci = _x - (_sx_${line.index} + _wrapX[_wx]) + _offX; if (_ci < 0 || _ci >= _tn_${id}_${line.index}) continue; uint8_t _col = _txt_${id}_${line.index}[_ci];`)
        ln(`        for (int _r = 0; _r < ${font.h}; _r++) if (_col & (1 << _r)) { int _yy = (_sy + _wrapY[_wy] + ${lineOffset}) + _r - _offY; if (_yy >= 0 && _yy < HEIGHT) ${ob}[_yy * WIDTH + _x] = ${colorE}; } }`)
      }
      ln(`    }`)
    } else {
      for (const line of renderableLines) {
        const lineOffset = line.index * (font.h + TEXT_LINE_GAP)
        ln(`    for (int _x = 0; _x < WIDTH; _x++) { int _ci = _x - _sx_${line.index} + _offX; if (_ci < 0 || _ci >= _tn_${id}_${line.index}) continue; uint8_t _col = _txt_${id}_${line.index}[_ci];`)
        ln(`      for (int _r = 0; _r < ${font.h}; _r++) if (_col & (1 << _r)) { int _yy = (_sy + ${lineOffset}) + _r - _offY; if (_yy >= 0 && _yy < HEIGHT) ${ob}[_yy * WIDTH + _x] = ${colorE}; } }`)
      }
    }
    ln(`  }`)
  },
  ClockDisplay({ node, id, p, ln, v, f, channelColor, ownBuf, seedFrom, incoming, boolExpr }) {
    const ob = ownBuf()
    const mode = String(p.displayMode ?? 'Digital HH:MM')
    const analog = mode === 'Analog' || mode === 'Analog + Date'
    const transport = mode === 'Stopwatch' || mode === 'Timer'
    const hAlign = textAlignMode(p.hAlign ?? 'center', 'left', 'right')
    const vAlign = textAlignMode(p.vAlign ?? 'middle', 'top', 'bottom')
    const colorE = channelColor('color', 255, 220, 90)
    const xExpr = f('x', 'x', 0.5)
    const yExpr = f('y', 'y', 0.5)
    const dateTimeUp = incoming.get(`${node.id}:dateTime`)
    const dateTimeExpr = dateTimeUp
      ? `n_${safeId(dateTimeUp.srcId)}_${safeId(dateTimeUp.srcPort)}`
      : null
    // DateTime carries source health, so clock modes reject stale or
    // unsynced readings by default. The evaluator treats an unwired legacy
    // `valid` as true whenever a scalar time is
    // available, so a graph that wires the seconds but not the valid flag
    // must not preview a running clock and then flash dashes. With neither
    // wired there is no clock at all on hardware, so dashes are correct —
    // buildGraphDiagnostics flags that case.
    const validExpr = dateTimeExpr
      ? `(${dateTimeExpr}.valid && ${dateTimeExpr}.synced && !${dateTimeExpr}.stale)`
      : incoming.get(`${node.id}:valid`)
        ? boolExpr(node.id, 'valid')
        : (incoming.get(`${node.id}:secondsOfDay`) ? 'true' : 'false')
    const secondsExpr = dateTimeExpr ? `${dateTimeExpr}.secondsOfDay` : f('secondsOfDay', 'secondsOfDay', 0)
    const dayExpr = dateTimeExpr ? `${dateTimeExpr}.day` : f('day', 'day', 1)
    const monthExpr = dateTimeExpr ? `${dateTimeExpr}.month` : f('month', 'month', 1)
    const runExpr = incoming.get(`${node.id}:run`) ? boolExpr(node.id, 'run') : (p.run === false ? 'false' : 'true')
    const resetExpr = incoming.get(`${node.id}:reset`) ? boolExpr(node.id, 'reset') : (p.reset === true ? 'true' : 'false')
    const durationExpr = `max(0.0f, ${f('durationSec', 'durationSec', 300)})`
    // Declared outside the render block so downstream nodes can read the
    // transport readouts (clock modes pass the time of day through).
    ln(`  float ${v('seconds')} = 0.0f; bool ${v('done')} = false;`)
    ln(`  { // Clock Display`)
    ln(`    ${seedFrom('base')}`)
    ln(`    auto _clkPx = [&](int _x, int _y, const CRGB &_col) {`)
    ln(`      if (_x < 0 || _x >= WIDTH || _y < 0 || _y >= HEIGHT) return;`)
    ln(`      CRGB &_dst = ${ob}[_y * WIDTH + _x];`)
    ln(`      _dst.r = max(_dst.r, _col.r); _dst.g = max(_dst.g, _col.g); _dst.b = max(_dst.b, _col.b);`)
    ln(`    };`)
    // The clock's text is assembled at runtime (unlike the Text node, whose
    // string is known here and baked as columns), so the sketch carries a
    // glyph lookup — generated from the shared bitmap font in state/font.ts
    // rather than hand-transcribed, so preview and firmware cannot drift.
    ln(`    static const char _clkChars_${id}[] = "${CLOCK_GLYPH_CHARS}";`)
    ln(`    static const uint8_t _clkGlyphs_${id}[][${FONT_W}] = {${
      [...CLOCK_GLYPH_CHARS].map((ch) => `{${textColumns(ch, DEFAULT_FONT, 0).join(',')}}`).join(', ')
    }};`)
    ln(`    auto _clkCols = [&](char _ch, uint8_t *_cols) {`)
    ln(`      for (int _c = 0; _c < ${FONT_W}; _c++) _cols[_c] = 0;`)
    ln(`      for (int _g = 0; _clkChars_${id}[_g]; _g++) if (_clkChars_${id}[_g] == _ch) {`)
    ln(`        for (int _c = 0; _c < ${FONT_W}; _c++) _cols[_c] = _clkGlyphs_${id}[_g][_c];`)
    ln(`        return;`)
    ln(`      }`)
    ln(`    };`)
    ln(`    auto _clkText = [&](const char *_s, int _sx, int _sy, const CRGB &_col) {`)
    ln(`      for (int _i = 0; _s[_i]; _i++) {`)
    ln(`        uint8_t _cols[${FONT_W}]; _clkCols(_s[_i], _cols);`)
    ln(`        for (int _c = 0; _c < ${FONT_W}; _c++) { int _x = _sx + _i * ${FONT_W} + _c; if (_x < 0 || _x >= WIDTH) continue; uint8_t _bits = _cols[_c];`)
    ln(`          for (int _r = 0; _r < ${FONT_H}; _r++) if (_bits & (1 << _r)) _clkPx(_x, _sy + _r, _col); }`)
    ln(`      }`)
    ln(`    };`)
    ln(`    auto _clkLine = [&](float _x0, float _y0, float _x1, float _y1, const CRGB &_col) {`)
    ln(`      int _steps = max(1, (int)ceilf(max(fabsf(_x1 - _x0), fabsf(_y1 - _y0)) * 2.0f));`)
    ln(`      for (int _i = 0; _i <= _steps; _i++) { float _tt = _steps > 0 ? (float)_i / (float)_steps : 0.0f; _clkPx((int)roundf(_x0 + (_x1 - _x0) * _tt), (int)roundf(_y0 + (_y1 - _y0) * _tt), _col); }`)
    ln(`    };`)
    ln(`    auto _clkRing = [&](float _cx, float _cy, float _rad, const CRGB &_col) {`)
    ln(`      int _x0 = max(0, (int)floorf(_cx - _rad - 1.0f)), _x1 = min(WIDTH - 1, (int)ceilf(_cx + _rad + 1.0f));`)
    ln(`      int _y0 = max(0, (int)floorf(_cy - _rad - 1.0f)), _y1 = min(HEIGHT - 1, (int)ceilf(_cy + _rad + 1.0f));`)
    ln(`      for (int _y = _y0; _y <= _y1; _y++) for (int _x = _x0; _x <= _x1; _x++) {`)
    ln(`        float _dx = _x - _cx, _dy = _y - _cy; if (fabsf(sqrtf(_dx * _dx + _dy * _dy) - _rad) <= 0.65f) _clkPx(_x, _y, _col);`)
    ln(`      }`)
    ln(`    };`)
    // Pixel extents of the strings each mode prints, derived from the
    // shared font so they stay in step with blitText's own layout maths.
    const glyphRun = (chars: number) => `${chars * FONT_W}`
    const twoLineHeight = `${FONT_H * 2 + TEXT_LINE_GAP}`
    const subLineOffset = FONT_H + TEXT_LINE_GAP
    if (transport) {
      const syExpr = textAxisStartExpr(yExpr, 'HEIGHT', twoLineHeight, vAlign, false)
      const sxMainExpr = textAxisStartExpr(xExpr, 'WIDTH', glyphRun(5), hAlign, false)
      const sxSubExpr = textAxisStartExpr(xExpr, 'WIDTH', glyphRun(2), hAlign, false)
      ln(`    static float _clkElapsed_${id} = 0.0f, _clkRemaining_${id} = 0.0f, _clkLastDuration_${id} = -1.0f;`)
      ln(`    static uint32_t _clkLastMs_${id} = 0; static bool _clkPrevReset_${id} = false;`)
      ln(`    uint32_t _clkNow_${id} = millis(); float _clkDuration_${id} = ${durationExpr}; bool _clkRun_${id} = ${runExpr}; bool _clkReset_${id} = ${resetExpr};`)
      ln(`    if (_clkLastMs_${id} == 0 || _clkNow_${id} < _clkLastMs_${id}) { _clkLastMs_${id} = _clkNow_${id}; _clkElapsed_${id} = 0.0f; _clkRemaining_${id} = _clkDuration_${id}; _clkLastDuration_${id} = _clkDuration_${id}; _clkPrevReset_${id} = false; }`)
      ln(`    float _clkDt_${id} = min(0.25f, max(0.0f, (_clkNow_${id} - _clkLastMs_${id}) / 1000.0f));`)
      ln(`    if (fabsf(_clkLastDuration_${id} - _clkDuration_${id}) > 0.0001f) { _clkRemaining_${id} = _clkDuration_${id}; _clkLastDuration_${id} = _clkDuration_${id}; _clkDt_${id} = 0.0f; }`)
      ln(`    bool _clkResetEdge_${id} = _clkReset_${id} && !_clkPrevReset_${id};`)
      ln(`    if (_clkResetEdge_${id}) { _clkElapsed_${id} = 0.0f; _clkRemaining_${id} = _clkDuration_${id}; _clkDt_${id} = 0.0f; }`)
      if (mode === 'Timer') ln(`    if (_clkRun_${id}) _clkRemaining_${id} = max(0.0f, _clkRemaining_${id} - _clkDt_${id});`)
      else ln(`    if (_clkRun_${id}) _clkElapsed_${id} += _clkDt_${id};`)
      ln(`    _clkLastMs_${id} = _clkNow_${id}; _clkPrevReset_${id} = _clkReset_${id};`)
      ln(`    float _clkShow_${id} = ${mode === 'Timer' ? `_clkRemaining_${id}` : `_clkElapsed_${id}`};`)
      ln(`    ${v('seconds')} = _clkShow_${id};`)
      ln(`    ${v('done')} = ${mode === 'Timer' ? `_clkRemaining_${id} <= 0.0f` : 'false'};`)
      ln(`    int _clkWhole_${id} = max(0, (int)floorf(_clkShow_${id}));`)
      ln(`    int _clkHours_${id} = _clkWhole_${id} / 3600, _clkMinutes_${id} = (_clkWhole_${id} % 3600) / 60, _clkSeconds_${id} = _clkWhole_${id} % 60;`)
      ln(`    int _clkCentis_${id} = ((int)floorf((_clkShow_${id} - _clkWhole_${id}) * 100.0f)) % 100;`)
      ln(`    char _clkMain_${id}[6], _clkSub_${id}[3];`)
      ln(`    if (_clkHours_${id} > 0) { snprintf(_clkMain_${id}, sizeof(_clkMain_${id}), "%02d:%02d", min(_clkHours_${id}, 99), _clkMinutes_${id}); snprintf(_clkSub_${id}, sizeof(_clkSub_${id}), "%02d", _clkSeconds_${id}); }`)
      ln(`    else { snprintf(_clkMain_${id}, sizeof(_clkMain_${id}), "%02d:%02d", _clkMinutes_${id}, _clkSeconds_${id}); snprintf(_clkSub_${id}, sizeof(_clkSub_${id}), "%02d", _clkCentis_${id}); }`)
      ln(`    int _clkSy_${id} = (int)${syExpr}, _clkSx0_${id} = (int)${sxMainExpr}, _clkSx1_${id} = (int)${sxSubExpr};`)
      ln(`    _clkText(_clkMain_${id}, _clkSx0_${id}, _clkSy_${id}, ${colorE});`)
      ln(`    _clkText(_clkSub_${id}, _clkSx1_${id}, _clkSy_${id} + ${subLineOffset}, ${colorE});`)
    } else if (analog) {
      const radiusExpr = `max(2.0f, ${withMatrixScale(f('radius', 'radius', 6), p)})`
      ln(`    float _clkRad_${id} = ${radiusExpr};`)
      ln(`    float _clkXv_${id} = ${xExpr}, _clkYv_${id} = ${yExpr};`)
      ln(`    float _clkCx_${id} = _clkXv_${id} > 1.0f ? _clkXv_${id} : (0.5f - (_clkRad_${id} + 1.0f)) + _clkXv_${id} * ((WIDTH - 1.0f) + 2.0f * (_clkRad_${id} + 1.0f));`)
      ln(`    float _clkCy_${id} = _clkYv_${id} > 1.0f ? _clkYv_${id} : (0.5f - (_clkRad_${id} + 1.0f)) + _clkYv_${id} * ((HEIGHT - 1.0f) + 2.0f * (_clkRad_${id} + 1.0f));`)
      ln(`    float _clkSec_${id} = ${validExpr} ? ${secondsExpr} : 0.0f;`)
      ln(`    while (_clkSec_${id} < 0.0f) _clkSec_${id} += 86400.0f; while (_clkSec_${id} >= 86400.0f) _clkSec_${id} -= 86400.0f;`)
      ln(`    ${v('seconds')} = ${validExpr} ? _clkSec_${id} : 0.0f;`)
      ln(`    int _clkHour_${id} = (int)floorf(_clkSec_${id} / 3600.0f); int _clkMinute_${id} = ((int)floorf(_clkSec_${id} / 60.0f)) % 60;`)
      ln(`    float _clkRingScale_${id} = 0.45f, _clkTickScale_${id} = 0.30f, _clkSecondScale_${id} = 0.70f;`)
      ln(`    CRGB _clkRingCol_${id} = ${colorE}; _clkRingCol_${id}.nscale8((uint8_t)(_clkRingScale_${id} * 255.0f));`)
      ln(`    CRGB _clkTickCol_${id} = ${colorE}; _clkTickCol_${id}.nscale8((uint8_t)(_clkTickScale_${id} * 255.0f));`)
      ln(`    CRGB _clkSecondCol_${id} = ${colorE}; _clkSecondCol_${id}.nscale8((uint8_t)(_clkSecondScale_${id} * 255.0f));`)
      ln(`    _clkRing(_clkCx_${id}, _clkCy_${id}, _clkRad_${id}, _clkRingCol_${id});`)
      ln(`    for (int _m = 0; _m < 4; _m++) { float _a = -1.5707963f + _m * 1.5707963f; _clkPx((int)roundf(_clkCx_${id} + cosf(_a) * _clkRad_${id}), (int)roundf(_clkCy_${id} + sinf(_a) * _clkRad_${id}), _clkTickCol_${id}); }`)
      ln(`    float _clkHourA_${id} = -1.5707963f + (((_clkHour_${id} % 12) + _clkMinute_${id} / 60.0f + fmodf(_clkSec_${id}, 60.0f) / 3600.0f) / 12.0f) * 6.2831853f;`)
      ln(`    float _clkMinuteA_${id} = -1.5707963f + ((_clkMinute_${id} + fmodf(_clkSec_${id}, 60.0f) / 60.0f) / 60.0f) * 6.2831853f;`)
      ln(`    float _clkSecondA_${id} = -1.5707963f + (fmodf(_clkSec_${id}, 60.0f) / 60.0f) * 6.2831853f;`)
      ln(`    _clkLine(_clkCx_${id}, _clkCy_${id}, _clkCx_${id} + cosf(_clkHourA_${id}) * max(2.0f, _clkRad_${id} * 0.50f), _clkCy_${id} + sinf(_clkHourA_${id}) * max(2.0f, _clkRad_${id} * 0.50f), ${colorE});`)
      ln(`    _clkLine(_clkCx_${id}, _clkCy_${id}, _clkCx_${id} + cosf(_clkMinuteA_${id}) * max(3.0f, _clkRad_${id} * 0.78f), _clkCy_${id} + sinf(_clkMinuteA_${id}) * max(3.0f, _clkRad_${id} * 0.78f), ${colorE});`)
      ln(`    _clkLine(_clkCx_${id}, _clkCy_${id}, _clkCx_${id} + cosf(_clkSecondA_${id}) * max(3.0f, _clkRad_${id} * 0.92f), _clkCy_${id} + sinf(_clkSecondA_${id}) * max(3.0f, _clkRad_${id} * 0.92f), _clkSecondCol_${id});`)
      ln(`    _clkPx((int)roundf(_clkCx_${id}), (int)roundf(_clkCy_${id}), ${colorE});`)
      if (mode === 'Analog + Date') {
        const dateXExpr = textAxisStartExpr(xExpr, 'WIDTH', glyphRun(5), 'center', false)
        ln(`    char _clkDate_${id}[6];`)
        ln(`    if (${validExpr}) snprintf(_clkDate_${id}, sizeof(_clkDate_${id}), "%02d.%02d", (int)(${dayExpr}), (int)(${monthExpr}));`)
        ln(`    else memcpy(_clkDate_${id}, "--.--", 6);`)
        ln(`    CRGB _clkDateCol_${id} = ${colorE}; _clkDateCol_${id}.nscale8((uint8_t)(0.90f * 255.0f));`)
        ln(`    _clkText(_clkDate_${id}, (int)${dateXExpr}, (int)floorf(_clkCy_${id} + _clkRad_${id} + 1.0f), _clkDateCol_${id});`)
      }
    } else {
      const twoLine = mode !== 'Digital HH:MM'
      const syExpr = textAxisStartExpr(yExpr, 'HEIGHT', twoLine ? twoLineHeight : `${FONT_H}`, vAlign, false)
      const sxMainExpr = textAxisStartExpr(xExpr, 'WIDTH', glyphRun(5), hAlign, false)
      const sxSubExpr = textAxisStartExpr(xExpr, 'WIDTH', glyphRun(mode === 'Digital + Date' ? 5 : 2), hAlign, false)
      ln(`    float _clkSec_${id} = ${secondsExpr}; while (_clkSec_${id} < 0.0f) _clkSec_${id} += 86400.0f; while (_clkSec_${id} >= 86400.0f) _clkSec_${id} -= 86400.0f;`)
      ln(`    ${v('seconds')} = ${validExpr} ? _clkSec_${id} : 0.0f;`)
      ln(`    int _clkHour_${id} = (int)floorf(_clkSec_${id} / 3600.0f), _clkMinute_${id} = ((int)floorf(_clkSec_${id} / 60.0f)) % 60, _clkSecond_${id} = ((int)floorf(_clkSec_${id})) % 60;`)
      ln(`    char _clkMain_${id}[6], _clkSub_${id}[6] = "";`)
      if (mode === 'Digital HH:MM:SS') {
        ln(`    if (${validExpr}) { snprintf(_clkMain_${id}, sizeof(_clkMain_${id}), "%02d:%02d", _clkHour_${id}, _clkMinute_${id}); snprintf(_clkSub_${id}, sizeof(_clkSub_${id}), "%02d", _clkSecond_${id}); }`)
        ln(`    else { memcpy(_clkMain_${id}, "--:--", 6); memcpy(_clkSub_${id}, "--", 3); }`)
      } else if (mode === 'Digital 12H') {
        ln(`    if (${validExpr}) { int _clkH12_${id} = _clkHour_${id} % 12; if (_clkH12_${id} == 0) _clkH12_${id} = 12; snprintf(_clkMain_${id}, sizeof(_clkMain_${id}), "%02d:%02d", _clkH12_${id}, _clkMinute_${id}); memcpy(_clkSub_${id}, _clkHour_${id} < 12 ? "AM" : "PM", 3); }`)
        ln(`    else { memcpy(_clkMain_${id}, "--:--", 6); memcpy(_clkSub_${id}, "--", 3); }`)
      } else if (mode === 'Digital + Date') {
        ln(`    if (${validExpr}) { snprintf(_clkMain_${id}, sizeof(_clkMain_${id}), "%02d:%02d", _clkHour_${id}, _clkMinute_${id}); snprintf(_clkSub_${id}, sizeof(_clkSub_${id}), "%02d.%02d", (int)(${dayExpr}), (int)(${monthExpr})); }`)
        ln(`    else { memcpy(_clkMain_${id}, "--:--", 6); memcpy(_clkSub_${id}, "--.--", 6); }`)
      } else {
        ln(`    if (${validExpr}) snprintf(_clkMain_${id}, sizeof(_clkMain_${id}), "%02d:%02d", _clkHour_${id}, _clkMinute_${id});`)
        ln(`    else memcpy(_clkMain_${id}, "--:--", 6);`)
      }
      ln(`    int _clkSy_${id} = (int)${syExpr}, _clkSx0_${id} = (int)${sxMainExpr};`)
      ln(`    _clkText(_clkMain_${id}, _clkSx0_${id}, _clkSy_${id}, ${colorE});`)
      if (twoLine) {
        ln(`    int _clkSx1_${id} = (int)${sxSubExpr};`)
        ln(`    _clkText(_clkSub_${id}, _clkSx1_${id}, _clkSy_${id} + ${subLineOffset}, ${colorE});`)
      }
    }
    ln(`  }`)
  },
  GradientFrame({ node, id, p, ln, channelColor, gradientChannel, ownBuf, incoming, boolExpr }) {
    const ob = ownBuf()
    // Both ends are hoisted to locals so a wired Color A/B is honoured:
    // the evaluator has always followed those wires and this baked the
    // fields instead, which is the parity break the port registry forbids.
    const cA = `_gfA_${id}`, cB = `_gfB_${id}`
    const vert = incoming.get(`${node.id}:vertical`) ? null : Boolean(p.vertical)
    ln(`  { CRGB ${cA}=${channelColor('colorA', 0, 200, 255, ['rA', 'gA', 'bA'])},${cB}=${channelColor('colorB', 255, 0, 255, ['rB', 'gB', 'bB'])};`)
    ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
    ln(`    float _t=${vert === null ? `((${boolExpr(node.id, 'vertical')}) ? _y/(HEIGHT-1.0f) : _x/(WIDTH-1.0f))` : vert ? '_y/(HEIGHT-1.0f)' : '_x/(WIDTH-1.0f)'};`)
    ln(`    ${ob}[_y*WIDTH+_x]=CRGB(${gradientChannel(cA, cB, 'r', '_t')},${gradientChannel(cA, cB, 'g', '_t')},${gradientChannel(cA, cB, 'b', '_t')});}}`)
  },
  PaletteGradient({ node, p, ln, f, ownBuf, paletteExpr, needsT }) {
    const ob = ownBuf()
    const angle = f('angle', 'angle', 45), repeat = f('repeat', 'repeat', 1)
    const speed = rateCpp(f('speed', 'speed', 0), SPEED_MAX.PaletteGradient)
    const pal = paletteExpr(node.id, 'paletteIn', p)
    const scroll = `+t*${speed}`
    needsT.v = true
    ln(`  { // Palette gradient`)
    ln(`    float _a=${angle}*0.01745329f,_co=cos(_a),_si=sin(_a);`)
    ln(`    float _pmin=(_co<0?(WIDTH-1)*_co:0)+(_si<0?(HEIGHT-1)*_si:0);`)
    ln(`    float _pmax=(_co>0?(WIDTH-1)*_co:0)+(_si>0?(HEIGHT-1)*_si:0);`)
    ln(`    float _rng=max(1e-6f,_pmax-_pmin);`)
    ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
    ln(`      float _tn=(_x*_co+_y*_si-_pmin)/_rng;`)
    ln(`      ${ob}[_y*WIDTH+_x]=ColorFromPalette(${pal},(uint8_t)((_tn*${repeat}${scroll})*255));}}`)
  },
  Image({ node, id, p, ln, f, ownBuf }) {
    const ob = ownBuf()
    // Animation if one is loaded, else the still — the node carries one only.
    const animation = asAnimatedImage(p.animation)
    const frames = animation?.frames
    const img = frames?.[0] ?? asImage(p.image)
    if (!img) {
      ln(`  fill_solid(${ob}, NUM_LEDS, CRGB::Black); // ${node.data.nodeType}: none uploaded`)
      return
    }
    const storedPixels = frames ? frames.flatMap((frame) => frame.pixels) : img.pixels
    const hasAlpha = frames ? frames.some((frame) => Boolean(frame.alpha)) : Boolean(img.alpha)
    const storedAlpha = hasAlpha
      ? (frames ?? [img]).flatMap((frame) => frame.alpha ?? Array(frame.w * frame.h).fill(255))
      : null
    const fit = ['contain', 'cover', 'original'].includes(String(p.fit)) ? String(p.fit) : 'stretch'
    const background = hexToRgb(String(p.background ?? '#000000'))
    const finite = (value: unknown, fallback: number, min: number, max: number) => {
      const n = Number(value ?? fallback)
      return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback
    }
    const saturation = p.monochrome ? 0 : finite(p.saturation, 1, 0, 2)
    const contrast = finite(p.contrast, 1, 0, 2)
    const gamma = finite(p.gamma, 1, 1, 3.5)
    const rawLevels = Number(p.paletteLevels)
    const paletteLevels = Number.isFinite(rawLevels) && rawLevels >= 2 ? Math.min(32, Math.round(rawLevels)) : 0
    const dithering = p.dithering === 'ordered2x2' || p.dithering === 'ordered4x4' ? p.dithering : 'none'
    const sampling = p.sampling === 'smooth' ? 'smooth' : 'nearest'
    const fl = (value: number) => floatLit(value)
    ln(`  { // ${node.data.nodeType} ${img.w}x${img.h}`)
    ln(`    static const uint8_t _img_${id}[] PROGMEM = {${storedPixels.join(',')}};`)
    if (storedAlpha) ln(`    static const uint8_t _imga_${id}[] PROGMEM = {${storedAlpha.join(',')}};`)
    if (animation) ln(`    static const uint32_t _imgd_${id}[] PROGMEM = {${animation.durations.map((duration) => Math.round(duration)).join(',')}};`)
    ln(`    const int _iw=${img.w}, _ih=${img.h};`)
    ln(`    int _rot=(((int)roundf(${f('rotation', 'rotation', Number(p.rotation ?? 0))}/90.0f))%4+4)%4, _rw=(_rot&1)?_ih:_iw, _rh=(_rot&1)?_iw:_ih;`)
    if (animation) {
      const total = Math.max(1, Math.round(animation.durations.reduce((sum, duration) => sum + duration, 0)))
      ln(`    uint32_t _it=(uint32_t)(millis()*max(0.25f,min(4.0f,${f('playbackRate', 'playbackRate', 1)})));`)
      if (p.loop !== false) ln(`    _it%=${total}UL;`)
      else ln(`    _it=min(_it,${total - 1}UL);`)
      ln(`    int _ifr=0; uint32_t _iacc=0; for(int _i=0;_i<${animation.frames.length};_i++){ _iacc+=pgm_read_dword(&_imgd_${id}[_i]); if(_it<_iacc){_ifr=_i;break;} }`)
      ln(`    const int _ibase=_ifr*_iw*_ih;`)
    } else {
      ln(`    const int _ibase=0;`)
    }
    if (fit === 'contain' || fit === 'cover') {
      const scaleFn = fit === 'contain' ? 'fminf' : 'fmaxf'
      ln(`    float _isc=${scaleFn}((float)WIDTH/_rw,(float)HEIGHT/_rh), _dw=_rw*_isc, _dh=_rh*_isc;`)
    } else if (fit === 'original') {
      ln(`    float _dw=(float)_rw, _dh=(float)_rh;`)
    } else {
      ln(`    float _dw=(float)WIDTH, _dh=(float)HEIGHT;`)
    }
    ln(`    float _iox=(WIDTH-_dw)*constrain(${f('positionX', 'positionX', 0.5)},0.0f,1.0f), _ioy=(HEIGHT-_dh)*constrain(${f('positionY', 'positionY', 0.5)},0.0f,1.0f);`)
    ln(`    const float _ibr=max(0.0f,min(1.0f,${f('brightness', 'brightness', 1)})), _izv=1.0f/max(1.0f,min(8.0f,${f('zoom', 'zoom', 1)}));`)
    if (dithering === 'ordered2x2') ln(`    static const uint8_t _idither[] PROGMEM={0,2,3,1};`)
    else if (dithering === 'ordered4x4') ln(`    static const uint8_t _idither[] PROGMEM={0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5};`)
    ln(`    struct _ImgPx { float r,g,b,a; };`)
    ln(`    auto _imgpx=[&](int _px,int _py)->_ImgPx{`)
    if (p.flipX) ln(`      _px=_rw-1-_px;`)
    if (p.flipY) ln(`      _py=_rh-1-_py;`)
    ln(`      int _sx=_px,_sy=_py; if(_rot==1){ _sx=_py; _sy=_ih-1-_px; } else if(_rot==2){ _sx=_iw-1-_px; _sy=_ih-1-_py; } else if(_rot==3){ _sx=_iw-1-_py; _sy=_px; }`)
    ln(`      int _ai=_ibase+_sy*_iw+_sx, _pi=_ai*3;`)
    if (storedAlpha) ln(`      float _a=pgm_read_byte(&_imga_${id}[_ai])/255.0f;`)
    else ln(`      float _a=1.0f;`)
    ln(`      return {(float)pgm_read_byte(&_img_${id}[_pi])*_a,(float)pgm_read_byte(&_img_${id}[_pi+1])*_a,(float)pgm_read_byte(&_img_${id}[_pi+2])*_a,_a};};`)
    ln(`    auto _imgcolor=[&](_ImgPx _p,int _x,int _y)->CRGB{`)
    ln(`      float _r=(_p.r+${fl(background.r)}*(1-_p.a))*_ibr, _g=(_p.g+${fl(background.g)}*(1-_p.a))*_ibr, _b=(_p.b+${fl(background.b)}*(1-_p.a))*_ibr;`)
    ln(`      float _h=max(-180.0f,min(180.0f,${f('hueShift', 'hueShift', 0)}))*0.01745329f,_hc=cosf(_h),_hs=sinf(_h);`)
    ln(`      float _hr=_r*(.213f+.787f*_hc-.213f*_hs)+_g*(.715f-.715f*_hc-.715f*_hs)+_b*(.072f-.072f*_hc+.928f*_hs);`)
    ln(`      float _hg=_r*(.213f-.213f*_hc+.143f*_hs)+_g*(.715f+.285f*_hc+.140f*_hs)+_b*(.072f-.072f*_hc-.283f*_hs);`)
    ln(`      float _hb=_r*(.213f-.213f*_hc-.787f*_hs)+_g*(.715f-.715f*_hc+.715f*_hs)+_b*(.072f+.928f*_hc+.072f*_hs);`)
    ln(`      float _sat=${p.monochrome ? '0.0f' : `max(0.0f,min(2.0f,${f('saturation', 'saturation', saturation)}))`}, _con=max(0.0f,min(2.0f,${f('contrast', 'contrast', contrast)}));`)
    ln(`      float _lum=_hr*0.2126f+_hg*0.7152f+_hb*0.0722f; _r=(_lum+(_hr-_lum)*_sat-127.5f)*_con+127.5f; _g=(_lum+(_hg-_lum)*_sat-127.5f)*_con+127.5f; _b=(_lum+(_hb-_lum)*_sat-127.5f)*_con+127.5f;`)
    ln(`      float _gamma=max(1.0f,min(3.5f,${f('gamma', 'gamma', gamma)})); if(fabsf(_gamma-1.0f)>0.0001f){ _r=powf(constrain(_r,0.0f,255.0f)/255.0f,_gamma)*255.0f; _g=powf(constrain(_g,0.0f,255.0f)/255.0f,_gamma)*255.0f; _b=powf(constrain(_b,0.0f,255.0f)/255.0f,_gamma)*255.0f; } else { _r=constrain(_r,0.0f,255.0f); _g=constrain(_g,0.0f,255.0f); _b=constrain(_b,0.0f,255.0f); }`)
    if (paletteLevels) {
      if (dithering === 'ordered2x2') ln(`      float _dt=(pgm_read_byte(&_idither[(_y&1)*2+(_x&1)])+0.5f)/4.0f;`)
      else if (dithering === 'ordered4x4') ln(`      float _dt=(pgm_read_byte(&_idither[(_y&3)*4+(_x&3)])+0.5f)/16.0f;`)
      else ln(`      float _dt=0.5f;`)
      ln(`      auto _iq=[&](float _c)->uint8_t{ float _s=_c*${paletteLevels - 1}.0f/255.0f; int _base=(int)floorf(_s), _lv=_base+((_s-_base)>=_dt?1:0); return (uint8_t)(constrain(_lv,0,${paletteLevels - 1})*255.0f/${paletteLevels - 1}.0f+0.5f);}; return CRGB(_iq(_r),_iq(_g),_iq(_b));};`)
    } else {
      ln(`      return CRGB((uint8_t)(_r+0.5f),(uint8_t)(_g+0.5f),(uint8_t)(_b+0.5f));};`)
    }
    ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
    ln(`      float _u=(_x+0.5f-_iox)/_dw, _v=(_y+0.5f-_ioy)/_dh;`)
    ln(`      if(_u<0||_u>=1||_v<0||_v>=1){ ${ob}[_y*WIDTH+_x]=_imgcolor({${fl(background.r)},${fl(background.g)},${fl(background.b)},1.0f},_x,_y); continue; }`)
    ln(`      _u=(1-_izv)*constrain(${f('cropX', 'cropX', 0.5)},0.0f,1.0f)+_u*_izv; _v=(1-_izv)*constrain(${f('cropY', 'cropY', 0.5)},0.0f,1.0f)+_v*_izv;`)
    if (sampling === 'smooth') {
      ln(`      float _fx=_u*_rw-0.5f, _fy=_v*_rh-0.5f; int _x0=(int)floorf(_fx), _y0=(int)floorf(_fy);`)
      ln(`      float _tx=_fx-_x0, _ty=_fy-_y0; int _x1=_x0+1, _y1=_y0+1;`)
      ln(`      _x0=max(0,min(_rw-1,_x0)); _x1=max(0,min(_rw-1,_x1)); _y0=max(0,min(_rh-1,_y0)); _y1=max(0,min(_rh-1,_y1));`)
      ln(`      _ImgPx _c00=_imgpx(_x0,_y0), _c10=_imgpx(_x1,_y0), _c01=_imgpx(_x0,_y1), _c11=_imgpx(_x1,_y1);`)
      ln(`      float _rr=_c00.r+(_c10.r-_c00.r)*_tx, _rg=_c00.g+(_c10.g-_c00.g)*_tx, _rb=_c00.b+(_c10.b-_c00.b)*_tx;`)
      ln(`      _rr+=((_c01.r+(_c11.r-_c01.r)*_tx)-_rr)*_ty; _rg+=((_c01.g+(_c11.g-_c01.g)*_tx)-_rg)*_ty; _rb+=((_c01.b+(_c11.b-_c01.b)*_tx)-_rb)*_ty;`)
      ln(`      float _ra=_c00.a+(_c10.a-_c00.a)*_tx; _ra+=((_c01.a+(_c11.a-_c01.a)*_tx)-_ra)*_ty;`)
      ln(`      ${ob}[_y*WIDTH+_x]=_imgcolor({_rr,_rg,_rb,_ra},_x,_y);}}`)
    } else {
      ln(`      _ImgPx _ic=_imgpx(min(_rw-1,(int)(_u*_rw)),min(_rh-1,(int)(_v*_rh)));`)
      ln(`      ${ob}[_y*WIDTH+_x]=_imgcolor(_ic,_x,_y);}}`)
    }
  },
}
