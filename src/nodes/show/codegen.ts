import { textValueCpp } from '../../codegen/displayTextCpp'
import { SONG_INFO_PORTS } from '../../state/songInfo'
import { playerControlsServiceCpp, PLAYER_CONTROL_BUTTONS } from '../../codegen/playerControlsCpp'
import { normalizeButtonEdgeSettings } from '../../state/transportBridge'
import type { NodeEmitters, NodeEmitter } from '../../codegen/emitContext'
import { safeId } from '../../codegen/cppLiterals'

/**
 * Show-pipeline nodes have no emitter *by design* — they are handled by a
 * different generator, not missing from this one. Without this table
 * generateCpp's fallback for a type with no emitter labelled them "not yet
 * supported in code gen", which
 * two shipped starter templates (Music Player, Music-synced SD Show) then
 * baked into their exported `.ino` — telling users a hardware-validated
 * workflow was unfinished. Say where each one is actually handled instead.
 */
export const SHOW_PIPELINE_NOTES: Record<string, string> = {
  MusicLibrary: 'song source for the music-sync SD show; the Player sketch (Upload show to SD) consumes it, not this sketch',
  PerformanceGenerator: 'builds the timed .show file exported to the SD card; no equivalent in a normal sketch',
  SDCard: 'SD SPI storage configuration; emitted by the Player sketch (Upload show to SD)',
  PatternCollection: 'resolved by the show controller generator once its Show Engine drives a LED output',
  TransitionSet: 'transition pool read by the Show Engine / Performance Generator, not emitted directly',
}

const playerOrSlideshow: NodeEmitter = ({ node, ln, ownBuf }) => {
  // Neither belongs in a flat sketch: a Music Player needs the SD-player
  // template and a Slideshow builds the show controller. Reaching here
  // means the graph selected the ordinary generator anyway — which
  // validation reports — so keep the sketch valid with a black fill
  // rather than emitting a show that was never asked for.
  const ob = ownBuf()
  ln(`  fill_solid(${ob}, NUM_LEDS, CRGB::Black); // ${node.data.nodeType} — not this generator's node`)
}

export const SHOW_EMITTERS: NodeEmitters = {
  // Bundled transitions — `transitionType` picks one of 21 A→B effects.
  // Every variant works on the per-node frame buffers (seed `ob` from A,
  // then composite B in) so the generated firmware actually renders the
  // transition. Keep in sync with the `Transition` case in graphEvaluator.ts.
  Transition({ p, ln, f, ownBuf, srcBuf, need3d }) {
    const ob = ownBuf()
    const a = srcBuf('a'), b = srcBuf('b'), tt = f('t', 't', 0.5)
    const type = String(p.transitionType ?? 'crossfade')
    const B = b ?? ob                                  // unconnected B ⇒ behaves like A
    const aPix = (i: string) => a ? `${a}[${i}]` : 'CRGB::Black'
    const bPix = (i: string) => b ? `${b}[${i}]` : 'CRGB::Black'
    // The unit sampler takes a null buffer and answers black, which is
    // how an unconnected A or B reaches the 3D arms; the older arms use
    // aPix/bPix for the same thing.
    const aBuf = a ?? 'nullptr', bBuf = b ?? 'nullptr'
    const seed = a ? `::memmove(${ob}, ${a}, sizeof(CRGB) * NUM_LEDS);` : `fill_solid(${ob}, NUM_LEDS, CRGB::Black);`
    const idx = '_y*WIDTH+_x'
    // Most variants reveal B where a per-pixel condition holds; this emits the
    // shared seed-A + loop wrapper, with `body` supplying the `if(...)` lines.
    const reveal = (head: string, body: string[]) => {
      ln(`  { ${seed} float _tt=${tt}; ${head}`)
      ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
      body.forEach(l => ln(`      ${l}`))
      ln(`    } }`)
    }
    switch (type) {
      case 'wipe': {
        const dir = String(p.direction ?? 'right')
        const axis = (dir === 'up' || dir === 'down') ? '_y' : '_x'
        const dim  = (dir === 'up' || dir === 'down') ? 'HEIGHT' : 'WIDTH'
        const cmp  = (dir === 'right' || dir === 'down') ? '<' : '>'
        const rhs  = (dir === 'right' || dir === 'down') ? `(int)(_tt*${dim})` : `(int)((1.0f-_tt)*${dim})`
        reveal('', [`if(${axis} ${cmp} ${rhs}) ${ob}[${idx}] = ${B}[${idx}];`])
        break
      }
      case 'dissolve':
        ln(`  { ${seed} float _tt=${tt}; for(int _i=0;_i<NUM_LEDS;_i++){`)
        ln(`      uint32_t _h=((uint32_t)(_i)*1664525u+1013904223u);`)
        ln(`      if((_h&0xFFFF)<(uint32_t)(_tt*65535)) ${ob}[_i] = ${B}[_i]; } }`)
        break
      case 'iris':
        reveal('float _cx=WIDTH*0.5f,_cy=HEIGHT*0.5f,_r=_tt*sqrtf(_cx*_cx+_cy*_cy);', [
          `float _dx=_x-_cx,_dy=_y-_cy;`,
          `if(sqrtf(_dx*_dx+_dy*_dy)<_r) ${ob}[${idx}] = ${B}[${idx}];`,
        ])
        break
      case 'clockwipe':
        reveal('float _cx=WIDTH*0.5f,_cy=HEIGHT*0.5f;', [
          `float _n=(atan2f(_x-_cx,-(_y-_cy))+3.14159265f)/6.2831853f;`,
          `if(_n<_tt) ${ob}[${idx}] = ${B}[${idx}];`,
        ])
        break
      case 'push': {
        const dir = String(p.direction ?? 'right')
        const remap =
          dir === 'left' ? `int _ax=(int)roundf(_x-_tt*WIDTH),_ay=_y,_bx=(int)roundf(_x+(1.0f-_tt)*WIDTH),_by=_y;`
          : dir === 'up' ? `int _ax=_x,_ay=(int)roundf(_y-_tt*HEIGHT),_bx=_x,_by=(int)roundf(_y+(1.0f-_tt)*HEIGHT);`
          : dir === 'down' ? `int _ax=_x,_ay=(int)roundf(_y+_tt*HEIGHT),_bx=_x,_by=(int)roundf(_y-(1.0f-_tt)*HEIGHT);`
          : `int _ax=(int)roundf(_x+_tt*WIDTH),_ay=_y,_bx=(int)roundf(_x-(1.0f-_tt)*WIDTH),_by=_y;`
        ln(`  { fill_solid(${ob}, NUM_LEDS, CRGB::Black); float _tt=${tt};`)
        ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
        ln(`      ${remap}`)
        ln(`      if(_bx>=0&&_bx<WIDTH&&_by>=0&&_by<HEIGHT) ${ob}[${idx}] = ${bPix('_by*WIDTH+_bx')};`)
        ln(`      else if(_ax>=0&&_ax<WIDTH&&_ay>=0&&_ay<HEIGHT) ${ob}[${idx}] = ${aPix('_ay*WIDTH+_ax')};`)
        ln(`    } }`)
        break
      }
      case 'checkerboard': {
        const tile = Math.max(1, Math.round(Number(p.tileSize ?? 4)))
        reveal('', [
          `int _tx=_x/${tile},_ty=_y/${tile};`,
          `float _thr=((_tx+_ty)%2==0)?_tt*2.0f:_tt*2.0f-1.0f;`,
          `if(_thr>=1.0f) ${ob}[${idx}] = ${B}[${idx}];`,
        ])
        break
      }
      case 'diagonal':
        reveal('', [
          `float _n=((float)_x/WIDTH+(float)_y/HEIGHT)*0.5f;`,
          `if(_n<_tt) ${ob}[${idx}] = ${B}[${idx}];`,
        ])
        break
      case 'fadeblack':
        ln(`  { float _tt=${tt}; float _al=_tt<0.5f?1.0f-_tt*2.0f:(_tt-0.5f)*2.0f;`)
        ln(`    for(int _i=0;_i<NUM_LEDS;_i++){ CRGB _s=_tt<0.5f?${aPix('_i')}:${bPix('_i')};`)
        ln(`      ${ob}[_i]=CRGB((uint8_t)(_s.r*_al),(uint8_t)(_s.g*_al),(uint8_t)(_s.b*_al)); } }`)
        break
      case 'fadewhite':
        ln(`  { float _tt=${tt}; float _al=_tt<0.5f?1.0f-_tt*2.0f:(_tt-0.5f)*2.0f; float _w=(1.0f-_al)*255.0f;`)
        ln(`    for(int _i=0;_i<NUM_LEDS;_i++){ CRGB _s=_tt<0.5f?${aPix('_i')}:${bPix('_i')};`)
        ln(`      ${ob}[_i]=CRGB((uint8_t)(_s.r*_al+_w),(uint8_t)(_s.g*_al+_w),(uint8_t)(_s.b*_al+_w)); } }`)
        break
      case 'blinds': {
        const count = Math.max(1, Math.round(Number(p.count ?? 4)))
        const axis = String(p.axis ?? 'horizontal')
        const dim = axis === 'horizontal' ? 'HEIGHT' : 'WIDTH'
        const pos = axis === 'horizontal' ? '_y' : '_x'
        reveal(`int _slat=max(1,${dim}/${count});`, [
          `float _p=(float)(${pos}%_slat)/_slat;`,
          `if(_p<_tt) ${ob}[${idx}] = ${B}[${idx}];`,
        ])
        break
      }
      case 'ripple':
        reveal('float _cx=WIDTH*0.5f,_cy=HEIGHT*0.5f,_maxR=sqrtf(_cx*_cx+_cy*_cy),_e=0.08f;', [
          `float _dx=_x-_cx,_dy=_y-_cy,_n=sqrtf(_dx*_dx+_dy*_dy)/_maxR;`,
          `if(_n<_tt-_e) ${ob}[${idx}] = ${B}[${idx}];`,
          `else if(_n<_tt){ float _bl=(_tt-_n)/_e; ${ob}[${idx}]=blend(${ob}[${idx}], ${B}[${idx}], (uint8_t)(_bl*255)); }`,
        ])
        break
      case 'spiral': {
        const turns = Math.max(1, Math.round(Number(p.turns ?? 2)))
        reveal(`float _cx=WIDTH*0.5f,_cy=HEIGHT*0.5f,_maxR=sqrtf(_cx*_cx+_cy*_cy),_k=1.0f+1.0f/(float)${turns};`, [
          `float _dx=_x-_cx,_dy=_y-_cy,_r=sqrtf(_dx*_dx+_dy*_dy)/_maxR;`,
          `float _na=(atan2f(_dy,_dx)+3.14159265f)/6.2831853f;`,
          `if((_r+_na/(float)${turns})/_k<_tt) ${ob}[${idx}] = ${B}[${idx}];`,
        ])
        break
      }
      case 'curtain': {
        const axis = String(p.axis ?? 'horizontal')
        const dist = axis === 'horizontal' ? 'fabsf(2.0f*_y/HEIGHT-1.0f)' : 'fabsf(2.0f*_x/WIDTH-1.0f)'
        reveal('', [
          `if(${dist}<_tt) ${ob}[${idx}] = ${B}[${idx}];`,
        ])
        break
      }
      case 'scanlines':
        reveal('', [
          `float _thr=(_y%2==0)?((float)_y/HEIGHT)*0.5f:0.5f+((float)(_y-1)/HEIGHT)*0.5f;`,
          `if(_tt>_thr) ${ob}[${idx}] = ${B}[${idx}];`,
        ])
        break
      case 'zoom':
        ln(`  { ${seed} float _tt=${tt},_cx=WIDTH*0.5f,_cy=HEIGHT*0.5f,_sc=max(0.01f,_tt);`)
        ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
        ln(`      int _bx=(int)((_x-_cx)/_sc+_cx),_by=(int)((_y-_cy)/_sc+_cy);`)
        ln(`      if(_bx>=0&&_bx<WIDTH&&_by>=0&&_by<HEIGHT) ${ob}[${idx}]=blend(${ob}[${idx}], ${bPix('_by*WIDTH+_bx')}, (uint8_t)(_tt*255));`)
        ln(`      else ${ob}[${idx}].nscale8((uint8_t)((1.0f-_tt)*255));`)
        ln(`    } }`)
        break
      // ── 3D styles ────────────────────────────────────────────────
      // Inverse per-pixel sample with a perspective divide, mirroring
      // evalDolly/evalFlip/evalCube/evalDoor/evalTilt in graphEvaluator.ts
      // and cases 16-20 of transitionHelperCpp.ts. The depth curve, the
      // tie-breaking rounding and the unit sampler come from that file's
      // TRANSITION_3D_HELPERS_CPP rather than being restated here, so the
      // parts most likely to drift out of parity exist once. Each arm
      // writes every pixel, so none of them seeds from A first.
      case 'dolly':
        need3d.v = true
        ln(`  { float _tt=${tt},_cx=WIDTH*0.5f,_cy=HEIGHT*0.5f;`)
        ln(`    float _cv=_tt*_tt; if(_cv<1e-4f) _cv=1e-4f;`)
        ln(`    float _za=powf(1.12f,_tt),_zb=1.0f/_cv;`)
        ln(`    float _sa=_depthShade(_za),_sb=_depthShade(_zb);`)
        ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
        ln(`      float _ox=_x+0.5f-_cx,_oy=_y+0.5f-_cy;`)
        ln(`      float _fbx=_ox*_zb+_cx-0.5f,_fby=_oy*_zb+_cy-0.5f;`)
        ln(`      if(_fbx>=-0.5f&&_fbx<WIDTH-0.5f&&_fby>=-0.5f&&_fby<HEIGHT-0.5f)`)
        ln(`        ${ob}[${idx}]=_sampleShaded(${bBuf},_fbx,_fby,_sb);`)
        ln(`      else ${ob}[${idx}]=_sampleShaded(${aBuf},_ox*_za+_cx-0.5f,_oy*_za+_cy-0.5f,_sa);`)
        ln(`    } }`)
        break
      case 'flip':
        need3d.v = true
        ln(`  { float _tt=${tt},_cx=WIDTH*0.5f,_cy=HEIGHT*0.5f;`)
        ln(`    float _th=_tt*3.14159265f,_ct=cosf(_th),_sn=sinf(_th); bool _bk=_tt>=0.5f;`)
        ln(`    const CRGB* _src=_bk?${bBuf}:${aBuf};`)
        ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
        ln(`      ${ob}[${idx}]=CRGB::Black;`)
        ln(`      float _sx=(_x+0.5f-_cx)/_cx,_sy=(_y+0.5f-_cy)/_cy;`)
        ln(`      float _den=3.0f*_ct-_sx*_sn; if(fabsf(_den)<1e-4f) continue;`)
        ln(`      float _u=_sx*3.0f/_den; if(_u<-1.0f||_u>1.0f) continue;`)
        ln(`      float _z=3.0f+_u*_sn; if(_z<0.05f) continue;`)
        ln(`      float _w=_sy*_z/3.0f; if(_w<-1.0f||_w>1.0f) continue;`)
        ln(`      ${ob}[${idx}]=_sampleUnitShaded(_src,_bk?-_u:_u,_w,_depthShade(_z/3.0f));`)
        ln(`    } }`)
        break
      case 'cube':
        need3d.v = true
        ln(`  { float _tt=${tt},_cx=WIDTH*0.5f,_cy=HEIGHT*0.5f;`)
        ln(`    float _th=_tt*1.57079633f,_ct=cosf(_th),_sn=sinf(_th),_cd=3.0f,_cf=2.0f;`)
        ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
        ln(`      ${ob}[${idx}]=CRGB::Black;`)
        ln(`      float _sx=(_x+0.5f-_cx)/_cx,_sy=(_y+0.5f-_cy)/_cy;`)
        ln(`      int _fc=-1; float _fu=0.0f,_fv=0.0f,_fz=0.0f;`)
        ln(`      float _dA=_cf*_ct+_sx*_sn;`)
        ln(`      if(fabsf(_dA)>=1e-4f){ float _u=(_sx*(_cd-_ct)+_cf*_sn)/_dA,_z=_cd-_u*_sn-_ct,_v=_sy*_z/_cf;`)
        ln(`        if(_u>=-1.0f&&_u<=1.0f&&_v>=-1.0f&&_v<=1.0f&&_z>0.05f){ _fc=0; _fu=_u; _fv=_v; _fz=_z; } }`)
        ln(`      float _dB=_cf*_sn-_sx*_ct;`)
        ln(`      if(fabsf(_dB)>=1e-4f){ float _u=(_sx*(_cd-_sn)-_cf*_ct)/_dB,_z=_cd-_sn+_u*_ct,_v=_sy*_z/_cf;`)
        ln(`        if(_u>=-1.0f&&_u<=1.0f&&_v>=-1.0f&&_v<=1.0f&&_z>0.05f&&(_fc<0||_z<_fz)){ _fc=1; _fu=_u; _fv=_v; _fz=_z; } }`)
        ln(`      if(_fc<0) continue;`)
        ln(`      ${ob}[${idx}]=_sampleUnitShaded(_fc==0?${aBuf}:${bBuf},_fu,_fv,_depthShade(_fz/_cf));`)
        ln(`    } }`)
        break
      case 'door':
        need3d.v = true
        ln(`  { float _tt=${tt},_cx=WIDTH*0.5f,_cy=HEIGHT*0.5f;`)
        ln(`    float _ph=_tt*1.57079633f,_ct=cosf(_ph),_sn=sinf(_ph),_dd=3.0f,_df=3.0f;`)
        ln(`    float _pn=_facingShade(_ct),_bl=0.5f+0.5f*_sn;`)
        ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
        ln(`      float _sx=(_x+0.5f-_cx)/_cx,_sy=(_y+0.5f-_cy)/_cy; bool _dn=false;`)
        ln(`      float _dL=_df*_ct+_sx*_sn;`)
        ln(`      if(fabsf(_dL)>=1e-4f){ float _s=(_sx*_dd+_df)/_dL;`)
        ln(`        if(_s>=0.0f&&_s<=1.0f){ float _z=_dd-_s*_sn,_v=_sy*_z/_df;`)
        ln(`          if(_v>=-1.0f&&_v<=1.0f&&_z>0.05f){ ${ob}[${idx}]=_sampleUnitShaded(${aBuf},_s-1.0f,_v,_pn); _dn=true; } } }`)
        ln(`      if(!_dn){ float _dR=_sx*_sn-_df*_ct;`)
        ln(`        if(fabsf(_dR)>=1e-4f){ float _s=(_sx*_dd-_df)/_dR;`)
        ln(`          if(_s>=0.0f&&_s<=1.0f){ float _z=_dd-_s*_sn,_v=_sy*_z/_df;`)
        ln(`            if(_v>=-1.0f&&_v<=1.0f&&_z>0.05f){ ${ob}[${idx}]=_sampleUnitShaded(${aBuf},1.0f-_s,_v,_pn); _dn=true; } } } }`)
        ln(`      if(!_dn) ${ob}[${idx}]=_shadePixel(${bPix(idx)},_bl);`)
        ln(`    } }`)
        break
      case 'tilt':
        need3d.v = true
        ln(`  { float _tt=${tt},_cx=WIDTH*0.5f,_cy=HEIGHT*0.5f;`)
        ln(`    float _ph=_tt*1.4f,_ct=cosf(_ph),_sn=sinf(_ph),_td=3.0f,_tf=3.0f;`)
        ln(`    float _zb=_td+0.8f*(1.0f-_tt),_sl=-2.6f*(1.0f-_tt),_sb=_depthShade(_zb/_tf);`)
        ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
        ln(`      ${ob}[${idx}]=CRGB::Black;`)
        ln(`      float _sx=(_x+0.5f-_cx)/_cx,_sy=(_y+0.5f-_cy)/_cy;`)
        ln(`      float _bu=_sx*_zb/_tf,_bv=_sy*_zb/_tf-_sl;`)
        ln(`      if(_bu>=-1.0f&&_bu<=1.0f&&_bv>=-1.0f&&_bv<=1.0f){ ${ob}[${idx}]=_sampleUnitShaded(${bBuf},_bu,_bv,_sb); continue; }`)
        ln(`      float _den=_tf*_ct+_sy*_sn; if(fabsf(_den)<1e-4f) continue;`)
        ln(`      float _s=(_tf-_sy*_td)/_den; if(_s<0.0f||_s>2.0f) continue;`)
        ln(`      float _z=_td+_s*_sn; if(_z<0.05f) continue;`)
        ln(`      float _u=_sx*_z/_tf; if(_u<-1.0f||_u>1.0f) continue;`)
        ln(`      ${ob}[${idx}]=_sampleUnitShaded(${aBuf},_u,1.0f-_s,_depthShade(_z/_tf));`)
        ln(`    } }`)
        break
      default: // crossfade
        ln(`  { ${seed} nblend(${ob}, ${B}, NUM_LEDS, (uint8_t)((${tt}) * 255)); }`)
    }
  },
  SongInfo({ id, ln }) {
    // The player it reads renders as a black fill here, so there is no
    // track to report. Blanks rather than omitted variables: anything
    // downstream already names these, and a missing definition would fail
    // the build on a line no generator wrote.
    for (const port of SONG_INFO_PORTS) {
      const name = `n_${id}_${safeId(port.id)}`
      if (port.dataType === 'string') ln(textValueCpp(name, ''))
      else if (port.dataType === 'bool') ln(`  bool ${name} = false;`)
      else ln(`  float ${name} = 0.0f;`)
    }
  },
  PatternMaster: playerOrSlideshow,
  PatternSlideshow: playerOrSlideshow,
  /*
     * Physical intent, bundled once.
     *
     * The player sketch builds this from a fixed table of GPIO bindings
     * because it is a template. Here the inputs are ordinary wires the
     * generator already has expressions for — a Button, a pot, an encoder,
     * a touch panel — so all this case adds is the edge rules, and those
     * come from the same module the evaluator reads.
     */
  ControlMap({ node, id, p, ln, v, f, incoming, pressButton, playerControlNodes }) {
    const wired = (port: string) => incoming.has(`${node.id}:${port}`)
    // Repeat exactly where the evaluator repeats: an adjustment ramps
    // while held, an action fires once per press however long you lean on
    // it. Getting this backwards makes a blackout button strobe.
    const upstream = incoming.get(`${node.id}:controlsIn`)
    for (const line of playerControlsServiceCpp({
      id,
      variable: v('controls'),
      upstream: upstream ? `n_${safeId(upstream.srcId)}_${safeId(upstream.srcPort)}` : null,
      buttons: PLAYER_CONTROL_BUTTONS
        .filter(([port]) => wired(port))
        .map(([port, repeat]) => pressButton(node.id, port, repeat)),
      volumeExpr: wired('volume') ? f('volume', 'volume', 0) : null,
      brightnessExpr: wired('brightness') ? f('brightness', 'brightness', 0) : null,
      patternPositionExpr: wired('patternSelect') ? f('patternSelect', 'patternSelect', 0) : null,
      speedExpr: wired('masterSpeed') ? f('masterSpeed', 'masterSpeed', 1) : null,
      settings: normalizeButtonEdgeSettings(p),
      volumeStep: Math.max(0, Number(p.volumeStep ?? 0.05)),
      brightnessStep: Math.max(0, Number(p.brightnessStep ?? 0.05)),
    })) ln(line)
    playerControlNodes.push(id)
  },
  Sequencer({ id, p, ln, ownBuf, srcBuf, needsT }) {
    const ob = ownBuf()
    const interval = Number(p.interval ?? 4), fade = Number(p.fade ?? 1)
    const bufs = ['p0', 'p1', 'p2', 'p3'].map((port) => srcBuf(port)).filter((b): b is string => !!b)
    // C++ float literal (avoids "4f" — needs "4.0f").
    const fl = (x: number) => { const s = (+x.toFixed(4)).toString(); return (s.includes('.') ? s : `${s}.0`) + 'f' }
    const iv = Math.max(0.1, interval)
    const fadeDur = Math.max(0, Math.min(fade, iv))
    ln(`  { // Sequencer (interval ${interval}s, fade ${fade}s)`)
    if (bufs.length === 0) {
      ln(`    fill_solid(${ob}, NUM_LEDS, CRGB::Black);`)
    } else if (bufs.length === 1) {
      ln(`    ::memmove(${ob}, ${bufs[0]}, sizeof(CRGB) * NUM_LEDS);`)
    } else {
      needsT.v = true
      const n = bufs.length
      ln(`    static CRGB* const _seq_${id}[] = { ${bufs.join(', ')} };`)
      ln(`    float _ph = t / ${fl(iv)};`)
      ln(`    int _idx = ((int)floor(_ph)) % ${n};`)
      ln(`    float _into = (_ph - floor(_ph)) * ${fl(iv)};`)
      ln(`    ::memmove(${ob}, _seq_${id}[_idx], sizeof(CRGB) * NUM_LEDS);`)
      if (fadeDur > 0) {
        ln(`    if (_into >= ${fl(iv - fadeDur)}) {`)
        ln(`      uint8_t _m = (uint8_t)((_into - ${fl(iv - fadeDur)}) / ${fl(fadeDur)} * 255);`)
        ln(`      nblend(${ob}, _seq_${id}[(_idx + 1) % ${n}], NUM_LEDS, _m);`)
        ln(`    }`)
      }
    }
    ln(`  }`)
  },
  PerformanceGenerator({ type, ln, ownBuf }) {
    // Its `frame` names the LED output the show plays on, so it can be
    // wired into one — but a *normal* sketch has no audio transport and no
    // card reader, so there is no show here to render. Declare the buffer
    // and leave it black rather than emitting a blit from a buffer that was
    // never declared: this graph is already blocked (`findShowTargetErrors`
    // wants an SD Card, and with one the player generator runs instead of
    // this), and code shown in the preview while a user fixes that should
    // still be code.
    ln(`  // ${type} — ${SHOW_PIPELINE_NOTES[type]}`)
    ln(`  fill_solid(${ownBuf()}, NUM_LEDS, CRGB::Black);`)
  },
}
