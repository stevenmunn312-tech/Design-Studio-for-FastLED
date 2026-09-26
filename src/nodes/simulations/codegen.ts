import { rateCpp, SPEED_MAX, SCALE_MAX } from '../../state/speedRange'
import { particleRadius } from '../../state/particleScale'
import type { NodeEmitters } from '../../codegen/emitContext'
import { floatLit, seedProp } from '../../codegen/cppLiterals'

// Fire/Fire2012 share these direction/turbulence/paletteMix/mirror/seed
// controls — mirrors graphEvaluator.ts's firePrimaryLen/fireSecondaryLen/
// fireToXY. The heat simulation always runs in a canonical [P][S] grid (P =
// distance from the flame base where sparks land, S = position across the
// flame's width). P/S are emitted as the `WIDTH`/`HEIGHT` *macro names*
// (never baked JS numbers) so the heat array's size tracks whatever those
// macros actually expand to — including the supersampled render resolution,
// which the raw `width`/`height` JS constants don't reflect. The mapping back
// to real (x, y) only happens once, in the final palette-sampling loop.
function fireGrid(direction: string): { P: string; S: string } {
  const vertical = direction !== 'left' && direction !== 'right'
  return { P: vertical ? 'HEIGHT' : 'WIDTH', S: vertical ? 'WIDTH' : 'HEIGHT' }
}
function fireXYExpr(direction: string, pExpr: string, sExpr: string): { x: string; y: string } {
  switch (direction) {
    case 'down':  return { x: sExpr, y: pExpr }
    case 'left':  return { x: `(WIDTH-1-(${pExpr}))`, y: sExpr }
    case 'right': return { x: pExpr, y: sExpr }
    case 'up':
    default:      return { x: sExpr, y: `(HEIGHT-1-(${pExpr}))` }
  }
}

export const SIMULATIONS_EMITTERS: NodeEmitters = {
  Fire({ node, id, p, ln, f, ownBuf, incoming, paletteExpr }) {
    const ob = ownBuf()
    const intensity = f('intensity', 'intensity', 0.7)
    const cooling = f('cooling', 'cooling', 55)
    const sparking = f('sparking', 'sparking', 120)
    const pal = paletteExpr(node.id, 'paletteIn', p)
    const direction = String(p.direction ?? 'up')
    // The diffusion window is a loop bound and a divisor, not an array
    // size, so both become runtime reads of one local.
    const spread = `_fireSpread_${id}`
    const spreadDecl = `    int ${spread}=(int)constrain(${f('turbulence', 'turbulence', 1)},0.0f,2.0f);`
    // The palette blend picks between two emitted blocks, so the mix arm is
    // emitted whenever the knob can move — wired, or already below 1.
    const paletteMixE = `constrain(${f('paletteMix', 'paletteMix', 1)},0.0f,1.0f)`
    const paletteMixWired = incoming.has(`${node.id}:paletteMix`)
    const paletteMixP = Math.max(0, Math.min(1, Number(p.paletteMix ?? 1)))
    const mirrorP = Boolean(p.mirror)
    const seedP = Math.max(0, Math.round(Number(p.seed ?? 0)))
    const { P, S } = fireGrid(direction)
    const HB = `_fireHeat_${id}`
    const useLcg = seedP > 0
    const rnd01 = useLcg
      ? `((_fireLcg_${id}=_fireLcg_${id}*1664525u+1013904223u)/4294967296.0f)`
      : `(random8()/255.0f)`
    ln(`  { // Fire pattern`)
    ln(spreadDecl)
    ln(`    static uint8_t ${HB}[${P}][${S}];`)
    if (useLcg) ln(`    static uint32_t _fireLcg_${id} = ${seedP}u;`)
    ln(`    float _cool=max(0.0f,min(255.0f,${cooling}))*(55.0f/255.0f);`)
    ln(`    float _spark=min(1.0f,max(0.0f,(max(0.0f,min(255.0f,${sparking}))/255.0f)*(0.35f+min(1.0f,max(0.0f,${intensity}))*0.65f)));`)
    ln(`    for (int _p = 0; _p < ${P}; _p++) for (int _s = 0; _s < ${S}; _s++)`)
    ln(`      ${HB}[_p][_s] = qsub8(${HB}[_p][_s], (uint8_t)(${rnd01}*_cool));`)
    // Propagate from _p-1 (closer to the flame base) into _p, averaging a
    // turbulence-wide window (spread=1 reproduces the original fixed
    // 3-wide/4-sample kernel exactly). Mirrors evalFire in graphEvaluator.ts.
    ln(`    for (int _p = (${P})-1; _p >= 1; _p--) for (int _s = 0; _s < ${S}; _s++) {`)
    ln(`      int _sum=0; for (int _ds=-${spread}; _ds<=${spread}; _ds++) _sum += ${HB}[_p-1][max(0,min((${S})-1,_s+_ds))];`)
    ln(`      ${HB}[_p][_s] = (${HB}[_p][_s] + _sum) / (${spread}*2+2); }`)
    ln(`    for (int _s = 0; _s < ${S}; _s++)`)
    ln(`      if (${rnd01} < _spark) ${HB}[0][_s] = (uint8_t)(200 + ${rnd01}*55);`)
    ln(`    for (int _p = 0; _p < ${P}; _p++) for (int _s = 0; _s < ${S}; _s++) {`)
    const { x: fx, y: fy } = fireXYExpr(direction, '_p', '_s')
    ln(`      uint8_t _h=${HB}[_p][_s]; CRGB _c=ColorFromPalette(${pal}, _h);`)
    if (paletteMixP >= 1 && !paletteMixWired) {
      ln(`      ${ob}[(${fy})*WIDTH+(${fx})] = _c;`)
    } else if (paletteMixWired) {
      ln(`      float _pmix=${paletteMixE}, _pkeep=1.0f-_pmix;`)
      ln(`      ${ob}[(${fy})*WIDTH+(${fx})] = CRGB((uint8_t)(_h*_pkeep+_c.r*_pmix),(uint8_t)(_h*_pkeep+_c.g*_pmix),(uint8_t)(_h*_pkeep+_c.b*_pmix));`)
    } else {
      const keep = floatLit(1 - paletteMixP)
      const mix = floatLit(paletteMixP)
      ln(`      ${ob}[(${fy})*WIDTH+(${fx})] = CRGB((uint8_t)(_h*${keep}+_c.r*${mix}),(uint8_t)(_h*${keep}+_c.g*${mix}),(uint8_t)(_h*${keep}+_c.b*${mix}));`)
    }
    ln(`    }`)
    if (mirrorP) {
      // Fold the rendered buffer symmetric across the flame's width —
      // up/down mirror columns, left/right mirror rows. Mirrors fireMirror.
      if (direction === 'left' || direction === 'right')
        ln(`    for (int _y=0;_y<HEIGHT/2;_y++) for (int _x=0;_x<WIDTH;_x++) ${ob}[(HEIGHT-1-_y)*WIDTH+_x] = ${ob}[_y*WIDTH+_x];`)
      else
        ln(`    for (int _y=0;_y<HEIGHT;_y++) for (int _x=0;_x<WIDTH/2;_x++) ${ob}[_y*WIDTH+(WIDTH-1-_x)] = ${ob}[_y*WIDTH+_x];`)
    }
    ln(`  }`)
  },
  Particles({ node, id, p, ln, f, ownBuf, width, height, paletteExpr, needsT }) {
    const ob = ownBuf()
    const mode = String(p.particleType ?? 'fountain')
    if (['comet', 'snow', 'embers', 'bubbles', 'fireflies', 'meteor', 'tornado', 'attractor'].includes(mode)) needsT.v = true
    const rate = f('rate', 'rate', 0.3)
    const decayL = f('decay', 'decay', 0.92)
    const pal = paletteExpr(node.id, 'paletteIn', p)
    // Extra variant-specific controls — see PARTICLE_*_MODES in
    // nodeLibrary.ts for which mode reads which. Compile-time constants
    // (not wired ports), mirroring the evaluator's ParticleOpts.
    // `count` stays a property. It is only a loop bound in most variants,
    // but `swarm` sizes its pool from it directly — the cap is what bounds
    // that mode's O(N^2) neighbour step — so it has to be known when the
    // array is declared. The other four become per-frame locals, each
    // bounded to the domain its own slider declares so the bound still
    // holds on a wired value.
    const countP = Math.max(2, Math.min(80, Math.round(Number(p.count ?? 24))))
    const sizeE = `constrain(${f('size', 'size', 1)},0.25f,3.0f)`
    const seed = seedProp(p)
    // Fixed-size pool (SoA): l[i] <= 0.04 marks a free slot. swarm keeps every
    // slot live (boids), so its pool is sized directly from `count` (capped
    // for the O(N^2) step) instead of a fixed 40.
    const cap = mode === 'swarm' ? Math.max(2, Math.min(80, countP)) : 120
    const A = `_pa_${id}`
    ln(`  { // Particles: ${mode}`)
    ln(`    const int _PN=${cap};`)
    ln(`    static float ${A}x[_PN], ${A}y[_PN], ${A}vx[_PN], ${A}vy[_PN], ${A}l[_PN], ${A}s[_PN]; static uint8_t ${A}r[_PN], ${A}g[_PN], ${A}b[_PN]; static bool ${A}init=false;`)
    if (seed) ln(`    static bool ${A}seeded=false; if(!${A}seeded){ random16_set_seed(${seed}u); ${A}seeded=true; }`)
    // Spawn colour is a fixed palette sample kept only so the (unused-at-render)
    // per-particle colour slots stay well-formed; render colours by life below.
    ln(`    float _rate=${rate}; CRGB _pc=ColorFromPalette(${pal},180);`)

    /*
     * The spawn/update variants read different knobs — one mode scales its
     * spawn spread, another applies gravity, a third also bounces — so
     * their locals are emitted only where something reads them, or every
     * mode carries an unused local and a warning with it.
     *
     * Which mode uses which is not listed here: the branch's lines are
     * buffered, and each local is emitted only if the text that came out
     * mentions it. A variant added later joins the rule for free.
     */
    const variantLines: string[] = []
    if (mode === 'swarm') {
      ln(`    if(!${A}init){ for(int i=0;i<_PN;i++){ ${A}x[i]=random8()/255.0f*WIDTH; ${A}y[i]=random8()/255.0f*HEIGHT; ${A}vx[i]=(random8()/255.0f-0.5f)*0.6f; ${A}vy[i]=(random8()/255.0f-0.5f)*0.6f; ${A}l[i]=1; ${A}r[i]=_pc.r; ${A}g[i]=_pc.g; ${A}b[i]=_pc.b; } ${A}init=true; }`)
      ln(`    float _R=max(3.0f, min(WIDTH,HEIGHT)*0.5f); static float ${A}nvx[_PN], ${A}nvy[_PN];`)
      ln(`    for(int i=0;i<_PN;i++){ float cx=0,cy=0,ax=0,ay=0,sx=0,sy=0; int n=0;`)
      ln(`      for(int j=0;j<_PN;j++){ if(j==i) continue; float dx=${A}x[j]-${A}x[i], dy=${A}y[j]-${A}y[i]; float d=sqrtf(dx*dx+dy*dy);`)
      ln(`        if(d<_R&&d>0){ cx+=${A}x[j]; cy+=${A}y[j]; ax+=${A}vx[j]; ay+=${A}vy[j]; n++; if(d<_R*0.4f){ sx-=dx/d; sy-=dy/d; } } }`)
      ln(`      float vx=${A}vx[i], vy=${A}vy[i];`)
      ln(`      if(n>0){ vx+=(cx/n-${A}x[i])*0.0008f+(ax/n-${A}vx[i])*0.05f+sx*0.04f; vy+=(cy/n-${A}y[i])*0.0008f+(ay/n-${A}vy[i])*0.05f+sy*0.04f; }`)
      ln(`      float sp=sqrtf(vx*vx+vy*vy); if(sp>0.7f){ vx=vx/sp*0.7f; vy=vy/sp*0.7f; } ${A}nvx[i]=vx; ${A}nvy[i]=vy; }`)
      ln(`    for(int i=0;i<_PN;i++){ ${A}vx[i]=${A}nvx[i]; ${A}vy[i]=${A}nvy[i]; ${A}x[i]=fmodf(${A}x[i]+${A}vx[i]+WIDTH,WIDTH); ${A}y[i]=fmodf(${A}y[i]+${A}vy[i]+HEIGHT,HEIGHT); }`)
    } else {
      const ln = (line: string) => { variantLines.push(line) }
      ln(`    if(!${A}init){ for(int i=0;i<_PN;i++) ${A}l[i]=0; ${A}init=true; }`)

      // ── spawn ──
      // Width-spawning modes centre their random x on WIDTH/2 and scale the
      // deviation by `spreadP` (spreadP=1 reproduces the old full-width
      // random8()/255.0f*WIDTH distribution exactly).
      const spreadF = '_paSpread'
      const gravityF = '_paGrav'
      const bounceF = '_paBounce'
      const spawnX = `(WIDTH*0.5f+(random8()/255.0f-0.5f)*WIDTH*${spreadF})`
      if (mode === 'fountain')
        ln(`    if(random8()<(uint8_t)(_rate*255)){ for(int i=0;i<_PN;i++) if(${A}l[i]<=0.04f){ ${A}x[i]=${spawnX}; ${A}y[i]=HEIGHT-1; ${A}vx[i]=(random8()/255.0f-0.5f)*0.6f*${spreadF}; ${A}vy[i]=-(random8()/255.0f*0.5f+0.1f); ${A}l[i]=1; ${A}r[i]=_pc.r; ${A}g[i]=_pc.g; ${A}b[i]=_pc.b; break; } }`)
      else if (mode === 'gravity')
        ln(`    if(random8()<(uint8_t)(_rate*255)){ for(int i=0;i<_PN;i++) if(${A}l[i]<=0.04f){ ${A}x[i]=${spawnX}; ${A}y[i]=0; ${A}vx[i]=(random8()/255.0f-0.5f)*0.4f*${spreadF}; ${A}vy[i]=random8()/255.0f*0.2f; ${A}l[i]=1; ${A}r[i]=_pc.r; ${A}g[i]=_pc.g; ${A}b[i]=_pc.b; break; } }`)
      else if (mode === 'fireworks') {
        ln(`    if(random8()<(uint8_t)(_rate*0.12f*255)){ uint8_t _hue=random8(); int _n=14+random8()/32; float _cx=random8()/255.0f*WIDTH, _cy=random8()/255.0f*HEIGHT*0.5f+HEIGHT*0.1f;`)
        ln(`      for(int k=0;k<_n;k++) for(int i=0;i<_PN;i++) if(${A}l[i]<=0.04f){ float _a=(k/(float)_n)*6.2831f+random8()/255.0f*0.3f, _sp=random8()/255.0f*0.5f+0.35f; ${A}x[i]=_cx; ${A}y[i]=_cy; ${A}vx[i]=cos(_a)*_sp; ${A}vy[i]=sin(_a)*_sp; ${A}l[i]=1; CRGB _fc=CHSV(_hue+(random8()%30)-15,255,255); ${A}r[i]=_fc.r; ${A}g[i]=_fc.g; ${A}b[i]=_fc.b; break; } }`)
      } else if (mode === 'sparkle')
        ln(`    { int _sp=max(1,(int)(_rate*WIDTH*0.8f)); for(int k=0;k<_sp;k++) if(random8()<(uint8_t)(_rate*255)){ for(int i=0;i<_PN;i++) if(${A}l[i]<=0.04f){ ${A}x[i]=${spawnX}; ${A}y[i]=random8()/255.0f*HEIGHT*0.3f; ${A}vx[i]=0; ${A}vy[i]=random8()/255.0f*0.25f+0.05f; ${A}l[i]=1; ${A}r[i]=_pc.r; ${A}g[i]=_pc.g; ${A}b[i]=_pc.b; break; } } }`)
      else if (mode === 'comet')
        ln(`    { float _hx=(WIDTH-1)*(0.5f+0.45f*sin(t*0.9f)), _hy=(HEIGHT-1)*(0.5f+0.45f*sin(t*0.6f+1.3f)); for(int i=0;i<_PN;i++) if(${A}l[i]<=0.04f){ ${A}x[i]=_hx; ${A}y[i]=_hy; ${A}vx[i]=0; ${A}vy[i]=0; ${A}l[i]=1; ${A}r[i]=_pc.r; ${A}g[i]=_pc.g; ${A}b[i]=_pc.b; break; } }`)
      else if (mode === 'snow')
        ln(`    if(random8()<(uint8_t)(_rate*255)){ for(int i=0;i<_PN;i++) if(${A}l[i]<=0.04f){ ${A}x[i]=${spawnX}; ${A}y[i]=0; ${A}vy[i]=random8()/255.0f*0.12f+0.05f; ${A}l[i]=0.7f+random8()/255.0f*0.3f; ${A}s[i]=random8()/255.0f*6.28f; ${A}r[i]=_pc.r; ${A}g[i]=_pc.g; ${A}b[i]=_pc.b; break; } }`)
      else if (mode === 'rain')
        ln(`    if(random8()<(uint8_t)(_rate*255)){ for(int i=0;i<_PN;i++) if(${A}l[i]<=0.04f){ ${A}x[i]=${spawnX}; ${A}y[i]=0; ${A}vx[i]=(random8()/255.0f-0.5f)*0.18f; ${A}vy[i]=random8()/255.0f*0.45f+0.35f; ${A}l[i]=1; break; } }`)
      else if (mode === 'embers')
        ln(`    if(random8()<(uint8_t)(_rate*255)){ for(int i=0;i<_PN;i++) if(${A}l[i]<=0.04f){ ${A}x[i]=random8()/255.0f*WIDTH; ${A}y[i]=HEIGHT-1; ${A}vx[i]=(random8()/255.0f-0.5f)*0.12f; ${A}vy[i]=-(random8()/255.0f*0.18f+0.04f); ${A}s[i]=random8()/255.0f*6.28f; ${A}l[i]=1; break; } }`)
      else if (mode === 'bubbles')
        ln(`    if(random8()<(uint8_t)(_rate*255)){ for(int i=0;i<_PN;i++) if(${A}l[i]<=0.04f){ ${A}x[i]=random8()/255.0f*WIDTH; ${A}y[i]=HEIGHT-1; ${A}vy[i]=-(random8()/255.0f*0.16f+0.06f); ${A}s[i]=random8()/255.0f*6.28f; ${A}l[i]=1; break; } }`)
      else if (mode === 'vortex')
        ln(`    if(random8()<(uint8_t)(_rate*255)){ for(int i=0;i<_PN;i++) if(${A}l[i]<=0.04f){ ${A}x[i]=random8()/255.0f*WIDTH; ${A}y[i]=random8()/255.0f*HEIGHT; ${A}l[i]=1; break; } }`)
      else if (mode === 'orbit')
        ln(`    { int _target=${countP}; for(int i=0;i<_target;i++) if(${A}l[i]<=0.04f){ ${A}x[i]=random8()/255.0f*WIDTH; ${A}y[i]=random8()/255.0f*HEIGHT; ${A}s[i]=random8()/255.0f*0.08f+0.025f; ${A}l[i]=1; } for(int i=_target;i<_PN;i++) ${A}l[i]=0; }`)
      else if (mode === 'confetti')
        ln(`    { int _sp=max(1,(int)(_rate*4)); for(int k=0;k<_sp;k++) if(random8()<(uint8_t)(_rate*255)){ for(int i=0;i<_PN;i++) if(${A}l[i]<=0.04f){ ${A}x[i]=${spawnX}; ${A}y[i]=random8()/255.0f*HEIGHT; ${A}vx[i]=(random8()/255.0f-0.5f)*0.16f; ${A}vy[i]=random8()/255.0f*0.08f+0.02f; ${A}l[i]=1; break; } } }`)
      else if (mode === 'fireflies')
        ln(`    { int _target=${countP}; for(int i=0;i<_target;i++) if(${A}l[i]<=0.04f){ ${A}x[i]=random8()/255.0f*WIDTH; ${A}y[i]=random8()/255.0f*HEIGHT; ${A}vx[i]=(random8()/255.0f-0.5f)*0.12f; ${A}vy[i]=(random8()/255.0f-0.5f)*0.12f; ${A}s[i]=random8()/255.0f*6.28f; ${A}l[i]=1; } for(int i=_target;i<_PN;i++) ${A}l[i]=0; }`)
      else if (mode === 'meteor')
        ln(`    { float _span=max(1.0f,max(WIDTH,HEIGHT)-1.0f),_phase=fmodf(t*max(2.0f,WIDTH*0.45f),_span); for(int i=0;i<_PN;i++) if(${A}l[i]<=0.04f){ ${A}x[i]=_phase*(WIDTH-1)/_span; ${A}y[i]=_phase*(HEIGHT-1)/_span; ${A}l[i]=1; break; } }`)
      else if (mode === 'tornado')
        ln(`    if(random8()<(uint8_t)(_rate*255)){ for(int i=0;i<_PN;i++) if(${A}l[i]<=0.04f){ ${A}x[i]=WIDTH/2.0f; ${A}y[i]=HEIGHT-1; ${A}vy[i]=-(random8()/255.0f*0.16f+0.06f); ${A}s[i]=random8()/255.0f*6.28f; ${A}l[i]=1; break; } }`)
      else if (mode === 'pinwheel')
        ln(`    if(random8()<(uint8_t)(_rate*255)){ for(int i=0;i<_PN;i++) if(${A}l[i]<=0.04f){ float _a=random8()/255.0f*6.2831f; ${A}x[i]=WIDTH/2.0f; ${A}y[i]=HEIGHT/2.0f; ${A}vx[i]=cos(_a)*0.18f; ${A}vy[i]=sin(_a)*0.18f; ${A}l[i]=1; break; } }`)
      else if (mode === 'bounce')
        ln(`    { int _target=${countP}; for(int i=0;i<_target;i++) if(${A}l[i]<=0.04f){ ${A}x[i]=random8()/255.0f*WIDTH; ${A}y[i]=random8()/255.0f*HEIGHT; ${A}vx[i]=(random8()/255.0f-0.5f)*0.5f; ${A}vy[i]=(random8()/255.0f-0.5f)*0.5f; ${A}l[i]=1; } for(int i=_target;i<_PN;i++) ${A}l[i]=0; }`)
      else if (mode === 'attractor')
        ln(`    if(random8()<(uint8_t)(_rate*255)){ for(int i=0;i<_PN;i++) if(${A}l[i]<=0.04f){ ${A}x[i]=random8()/255.0f*WIDTH; ${A}y[i]=random8()/255.0f*HEIGHT; ${A}vx[i]=(random8()/255.0f-0.5f)*0.1f; ${A}vy[i]=(random8()/255.0f-0.5f)*0.1f; ${A}l[i]=1; break; } }`)
      else if (mode === 'waterfall')
        ln(`    { int _sp=max(1,(int)(_rate*3)); for(int k=0;k<_sp;k++) if(random8()<(uint8_t)(_rate*255)){ for(int i=0;i<_PN;i++) if(${A}l[i]<=0.04f){ ${A}x[i]=WIDTH*0.5f+(random8()/255.0f-0.5f)*0.3f*WIDTH*${spreadF}; ${A}y[i]=0; ${A}vx[i]=(random8()/255.0f-0.5f)*0.08f; ${A}vy[i]=random8()/255.0f*0.2f+0.12f; ${A}l[i]=1; break; } } }`)

      // ── update ──
      ln(`    for(int i=0;i<_PN;i++){ if(${A}l[i]<=0.04f) continue;`)
      if (mode === 'fountain')
        ln(`      ${A}x[i]+=${A}vx[i]; ${A}y[i]+=${A}vy[i]; ${A}vy[i]+=0.02f*${gravityF}; ${A}l[i]*=${decayL}; if(${A}y[i]<0) ${A}l[i]=0; }`)
      else if (mode === 'gravity')
        ln(`      ${A}vy[i]+=0.045f*${gravityF}; ${A}x[i]+=${A}vx[i]; ${A}y[i]+=${A}vy[i]; if(${A}y[i]>=HEIGHT-1){ ${A}y[i]=HEIGHT-1; ${A}vy[i]*=-0.55f*${bounceF}; ${A}vx[i]*=0.8f; ${A}l[i]*=0.9f; } ${A}l[i]*=${decayL}; }`)
      else if (mode === 'fireworks')
        ln(`      ${A}vy[i]=(${A}vy[i]+0.022f*${gravityF})*0.965f; ${A}vx[i]*=0.965f; ${A}x[i]+=${A}vx[i]; ${A}y[i]+=${A}vy[i]; ${A}l[i]*=${decayL}*0.985f; }`)
      else if (mode === 'sparkle')
        ln(`      ${A}y[i]+=${A}vy[i]; ${A}l[i]*=${decayL}*0.9f; if(${A}y[i]>=HEIGHT) ${A}l[i]=0; }`)
      else if (mode === 'comet')
        ln(`      ${A}l[i]*=${decayL}; }`)
      else if (mode === 'snow')
        ln(`      ${A}y[i]+=${A}vy[i]; ${A}x[i]+=sin(t*1.5f+${A}s[i])*0.12f; if(${A}y[i]>=HEIGHT) ${A}l[i]=0; }`)
      else if (mode === 'rain')
        ln(`      ${A}x[i]+=${A}vx[i]; ${A}y[i]+=${A}vy[i]; ${A}l[i]*=${decayL}*0.995f; if(${A}y[i]>=HEIGHT) ${A}l[i]=0; }`)
      else if (mode === 'embers')
        ln(`      ${A}x[i]+=${A}vx[i]+sin(t*2+${A}s[i])*0.05f; ${A}y[i]+=${A}vy[i]; ${A}l[i]*=${decayL}*0.985f; if(${A}y[i]<0) ${A}l[i]=0; }`)
      else if (mode === 'bubbles')
        ln(`      ${A}x[i]+=sin(t*3+${A}s[i])*0.1f; ${A}y[i]+=${A}vy[i]; if(${A}y[i]<0) ${A}l[i]=0; }`)
      else if (mode === 'vortex')
        ln(`      { float dx=${A}x[i]-(WIDTH-1)/2.0f,dy=${A}y[i]-(HEIGHT-1)/2.0f,d=max(0.5f,sqrtf(dx*dx+dy*dy)); ${A}x[i]+=-dy/d*0.24f-dx*0.006f; ${A}y[i]+=dx/d*0.24f-dy*0.006f; ${A}l[i]*=${decayL}*0.995f; } }`)
      else if (mode === 'orbit')
        ln(`      { float dx=${A}x[i]-(WIDTH-1)/2.0f,dy=${A}y[i]-(HEIGHT-1)/2.0f,c=cos(${A}s[i]),s=sin(${A}s[i]); ${A}x[i]=(WIDTH-1)/2.0f+dx*c-dy*s; ${A}y[i]=(HEIGHT-1)/2.0f+dx*s+dy*c; ${A}l[i]=1; } }`)
      else if (mode === 'confetti')
        ln(`      ${A}x[i]+=${A}vx[i]; ${A}y[i]+=${A}vy[i]; ${A}l[i]*=${decayL}*0.94f; if(${A}y[i]>=HEIGHT) ${A}l[i]=0; }`)
      else if (mode === 'fireflies')
        ln(`      { float sx=max(1.0f,WIDTH-1.0f),sy=max(1.0f,HEIGHT-1.0f); ${A}x[i]=fmodf(${A}x[i]+${A}vx[i]+sin(t+${A}s[i])*0.035f+sx,sx); ${A}y[i]=fmodf(${A}y[i]+${A}vy[i]+cos(t*0.8f+${A}s[i])*0.035f+sy,sy); ${A}l[i]=0.65f+sin(t*3+${A}s[i])*0.35f; } }`)
      else if (mode === 'meteor')
        ln(`      ${A}l[i]*=${decayL}*0.96f; }`)
      else if (mode === 'tornado')
        ln(`      ${A}y[i]+=${A}vy[i]; { float h=max(0.0f,min(1.0f,1-${A}y[i]/HEIGHT)); ${A}x[i]=WIDTH/2.0f+sin(t*5+${A}s[i]+${A}y[i]*0.7f)*(0.5f+h*WIDTH*0.35f); } ${A}l[i]*=${decayL}*0.995f; if(${A}y[i]<0) ${A}l[i]=0; }`)
      else if (mode === 'pinwheel')
        ln(`      { float vx=${A}vx[i]-${A}vy[i]*0.035f,vy=${A}vy[i]+${A}vx[i]*0.035f; ${A}vx[i]=vx; ${A}vy[i]=vy; ${A}x[i]+=vx; ${A}y[i]+=vy; ${A}l[i]*=${decayL}*0.99f; if(${A}x[i]<0||${A}x[i]>=WIDTH||${A}y[i]<0||${A}y[i]>=HEIGHT) ${A}l[i]=0; } }`)
      else if (mode === 'bounce')
        ln(`      ${A}x[i]+=${A}vx[i]; ${A}y[i]+=${A}vy[i]; if(${A}x[i]<=0||${A}x[i]>=WIDTH-1){ ${A}x[i]=max(0.0f,min(WIDTH-1.0f,${A}x[i])); ${A}vx[i]*=-1; } if(${A}y[i]<=0||${A}y[i]>=HEIGHT-1){ ${A}y[i]=max(0.0f,min(HEIGHT-1.0f,${A}y[i])); ${A}vy[i]*=-1; } ${A}l[i]=1; }`)
      else if (mode === 'attractor')
        ln(`      { float ax=(WIDTH-1)*(0.5f+0.35f*sin(t*0.7f)),ay=(HEIGHT-1)*(0.5f+0.35f*cos(t*0.9f)),dx=ax-${A}x[i],dy=ay-${A}y[i],d=max(1.0f,sqrtf(dx*dx+dy*dy)); ${A}vx[i]=${A}vx[i]*0.97f+dx/d*0.025f; ${A}vy[i]=${A}vy[i]*0.97f+dy/d*0.025f; ${A}x[i]+=${A}vx[i]; ${A}y[i]+=${A}vy[i]; ${A}l[i]*=${decayL}*0.998f; } }`)
      else if (mode === 'waterfall')
        ln(`      ${A}vy[i]+=0.025f*${gravityF}; ${A}x[i]+=${A}vx[i]; ${A}y[i]+=${A}vy[i]; if(${A}y[i]>=HEIGHT-1){ ${A}y[i]=HEIGHT-1; ${A}vy[i]*=-0.3f*${bounceF}; ${A}vx[i]+=(random8()/255.0f-0.5f)*0.35f; ${A}l[i]*=0.7f; } ${A}l[i]*=${decayL}*0.995f; }`)
    }

    for (const [name, expr] of [
      ['_paSpread', `constrain(${f('spread', 'spread', 1)},0.0f,2.0f)`],
      ['_paGrav', `constrain(${f('gravity', 'gravity', 1)},0.0f,3.0f)`],
      ['_paBounce', `constrain(${f('bounce', 'bounce', 1)},0.0f,1.5f)`],
    ] as const) {
      if (variantLines.some((line) => line.includes(name))) ln(`    float ${name}=${expr};`)
    }
    for (const line of variantLines) ln(line)

    // ── render (shared) ── every particle is coloured by its life through the
    // palette, so young/bright particles land at the palette's hot end and cool
    // toward its start as they fade (mirrors evalParticles).
    // Blob radius baked from the panel's configured WIDTH/HEIGHT — mirrors
    // the evaluator's particleScale.ts so firmware matches preview.
    // `sizeP` further scales it, same as the evaluator's `size` opt.
    // The panel's own radius is still folded — it comes from the configured
    // WIDTH/HEIGHT, which no wire can change — and only the `size` scale
    // is live.
    const Rf = '_paR'
    ln(`    float _paR=fmaxf(0.5f, ${floatLit(particleRadius(width, height))}*${sizeE});`)
    ln(`    fill_solid(${ob}, NUM_LEDS, CRGB::Black);`)
    ln(`    for(int i=0;i<_PN;i++){ if(${A}l[i]<=0.04f) continue; float _k=min(1.0f,${A}l[i]), _sx=${A}x[i], _sy=${A}y[i];`)
    ln(`      int _x0=max(0,(int)floorf(_sx-${Rf}-1.0f)), _x1=min(WIDTH-1,(int)ceilf(_sx+${Rf}+1.0f));`)
    ln(`      int _y0=max(0,(int)floorf(_sy-${Rf}-1.0f)), _y1=min(HEIGHT-1,(int)ceilf(_sy+${Rf}+1.0f));`)
    ln(`      CRGB _pcol=ColorFromPalette(${pal},(uint8_t)(_k*255)); _pcol.nscale8((uint8_t)(_k*255));`)
    ln(`      for(int _y=_y0;_y<=_y1;_y++) for(int _x=_x0;_x<=_x1;_x++){`)
    ln(`        float _dx=(_x+0.5f)-_sx,_dy=(_y+0.5f)-_sy; float _cov=constrain(${Rf}+0.5f-sqrtf(_dx*_dx+_dy*_dy),0.0f,1.0f);`)
    ln(`        if(_cov<=0.0f) continue; CRGB _add=_pcol; _add.nscale8((uint8_t)(_cov*255.0f)); ${ob}[_y*WIDTH+_x]+=_add; } } }`)
  },
  /*
     * Curated stateful point/trajectory generators — exact same math as
     * evalFormulaPoints in graphEvaluator.ts (no algorithm drift), one
     * dedicated block per formulaType. The *variant* is still baked at
     * generation time, because `formulaType` is a select with nothing to
     * branch on at runtime; every numeric knob is not, since each one is a
     * property input a control or an LFO can be driving live.
     *
     * So each knob is hoisted to a per-frame local fed by `floatExpr`: an
     * unwired one folds to its literal in the initialiser and costs
     * nothing, and the clamps that used to happen here in TypeScript are
     * emitted as `constrain`/`fmaxf` so they still hold on a wired value.
     * Leaving the bakes in place while declaring the ports would be the
     * exact parity break the registry forbids — preview follows the wire,
     * firmware ignores it. See docs/development/design/formula-pattern-nodes.md.
     */
  FormulaPoints({ node, id, p, ln, f, ownBuf, width, height, paletteExpr, needsT }) {
    const ob = ownBuf()
    const formulaType = String(p.formulaType ?? 'phyllotaxis')
    const pal = paletteExpr(node.id, 'paletteIn', p)
    const A = `_fp_${id}`
    // The matrix is fixed at generation time, so only the dot *scale* is
    // live: the base radius stays a literal and is scaled by the knob.
    const baseR = floatLit(particleRadius(width, height))
    const Rf = `${A}R`
    const count = `${A}N`
    const speedVar = `${A}S`
    const persistVar = `${A}P`
    // Only what this variant reads: an unused local is a warning per
    // sketch, and every knob here belongs to some variants and not others.
    const usesCount = formulaType === 'phyllotaxis' || formulaType === 'logisticMap'
      || formulaType === 'attractor' || !['lissajousPath', 'rosePath'].includes(formulaType)
    const usesSpeed = ['phyllotaxis', 'lissajousPath', 'rosePath'].includes(formulaType)
      || !['logisticMap', 'attractor'].includes(formulaType)
    const usesPersist = ['attractor', 'lissajousPath', 'rosePath'].includes(formulaType)
    ln(`  float ${Rf}=fmaxf(0.5f, ${baseR}*fmaxf(0.1f, ${f('dotSize', 'dotSize', 1)}));`)
    if (usesCount) ln(`  int ${count}=(int)constrain(${f('count', 'count', 60)}, 1.0f, 300.0f);`)
    if (usesSpeed) ln(`  float ${speedVar}=constrain(${f('speed', 'speed', 0.3)}, 0.0f, 1.0f);`)
    if (usesPersist) ln(`  float ${persistVar}=constrain(${f('persistence', 'persistence', 0.85)}, 0.0f, 1.0f);`)
    if (formulaType === 'phyllotaxis' || formulaType === 'lissajousPath' || formulaType === 'rosePath') needsT.v = true

    // Splats one soft disc of `colorExpr` at (xExpr, yExpr) into `buf` —
    // same bounding-box + coverage technique as the Particles case above.
    // Emits its own nested `{ }` block, so it's safe to call from inside
    // an enclosing `for` loop.
    const splat = (xExpr: string, yExpr: string, colorExpr: string, buf: string) => {
      ln(`      { float _sx=${xExpr}, _sy=${yExpr};`)
      ln(`        int _x0=max(0,(int)floorf(_sx-${Rf}-1.0f)), _x1=min(WIDTH-1,(int)ceilf(_sx+${Rf}+1.0f));`)
      ln(`        int _y0=max(0,(int)floorf(_sy-${Rf}-1.0f)), _y1=min(HEIGHT-1,(int)ceilf(_sy+${Rf}+1.0f));`)
      ln(`        CRGB _pcol=${colorExpr};`)
      ln(`        for(int _py=_y0;_py<=_y1;_py++) for(int _px=_x0;_px<=_x1;_px++){`)
      ln(`          float _dx=(_px+0.5f)-_sx,_dy=(_py+0.5f)-_sy; float _cov=constrain(${Rf}+0.5f-sqrtf(_dx*_dx+_dy*_dy),0.0f,1.0f);`)
      ln(`          if(_cov<=0.0f) continue; CRGB _add=_pcol; _add.nscale8((uint8_t)(_cov*255.0f)); ${buf}[_py*WIDTH+_px]+=_add; } }`)
    }

    switch (formulaType) {
      case 'logisticMap': {
        ln(`  { // Formula Points: logisticMap`)
        ln(`    static float ${A}x=0.5f;`)
        ln(`    float _r=constrain(${f('chaos', 'chaos', 3.8)}, 0.0f, 4.0f);`)
        ln(`    fill_solid(${ob}, NUM_LEDS, CRGB::Black);`)
        ln(`    for(int _i=0;_i<${count};_i++){`)
        ln(`      ${A}x=_r*${A}x*(1.0f-${A}x);`)
        ln(`      float _ang=((float)_i/${count})*6.2831853f, _rad=0.5f*${A}x;`)
        splat(`(0.5f+_rad*cosf(_ang))*(WIDTH-1)`, `(0.5f+_rad*sinf(_ang))*(HEIGHT-1)`, `ColorFromPalette(${pal},(uint8_t)(${A}x*255.0f))`, ob)
        ln(`    }`)
        ln(`  }`)
        break
      }

      case 'attractor': {
        const presets: Record<string, readonly [number, number, number, number]> = {
          classic: [1.4, -2.3, 2.4, -2.1],
          swirl: [-2.7, -0.09, -0.86, -2.2],
          web: [-0.827, -1.637, 1.659, -0.943],
        }
        // Resolve the preset name against the known set before echoing it:
        // the raw property travels in a shared graph, and a newline in it
        // would end this `//` comment and inject the rest as code.
        const presetName = String(p.preset ?? 'classic') in presets ? String(p.preset ?? 'classic') : 'classic'
        const [pa, pb, pc, pd] = presets[presetName]
        ln(`  { // Formula Points: attractor (de Jong, ${presetName})`)
        ln(`    static float ${A}ax=0.1f, ${A}ay=0.1f;`)
        ln(`    fadeToBlackBy(${ob}, NUM_LEDS, (uint8_t)((1.0f-${persistVar})*255.0f));`)
        ln(`    for(int _i=0;_i<${count};_i++){`)
        ln(`      float _nx=sinf(${floatLit(pa)}*${A}ay)-cosf(${floatLit(pb)}*${A}ax);`)
        ln(`      float _ny=sinf(${floatLit(pc)}*${A}ax)-cosf(${floatLit(pd)}*${A}ay);`)
        ln(`      ${A}ax=_nx; ${A}ay=_ny;`)
        splat(`((${A}ax+2.0f)/4.0f)*(WIDTH-1)`, `((${A}ay+2.0f)/4.0f)*(HEIGHT-1)`, `ColorFromPalette(${pal},(uint8_t)(((float)_i/${count})*255.0f))`, ob)
        ln(`    }`)
        ln(`  }`)
        break
      }

      case 'lissajousPath': {
        const freqA = `fmaxf(1.0f, ${f('freqA', 'freqA', 3)})`
        const freqB = `fmaxf(1.0f, ${f('freqB', 'freqB', 2)})`
        ln(`  { // Formula Points: lissajousPath`)
        ln(`    fadeToBlackBy(${ob}, NUM_LEDS, (uint8_t)((1.0f-${persistVar})*255.0f));`)
        // FORMULA_POINTS_SPEED_MAX.lissajousPath
        ln(`    float _phase=t*(${speedVar}*2.0f);`)
        ln(`    float _cx=sinf(${freqA}*_phase), _cy=sinf(${freqB}*_phase);`)
        ln(`    float _hue=fmodf(_phase/6.2831853f,1.0f); if(_hue<0.0f)_hue+=1.0f;`)
        splat(`(_cx+1.0f)/2.0f*(WIDTH-1)`, `(_cy+1.0f)/2.0f*(HEIGHT-1)`, `ColorFromPalette(${pal},(uint8_t)(_hue*255.0f))`, ob)
        ln(`  }`)
        break
      }

      case 'rosePath': {
        ln(`  { // Formula Points: rosePath`)
        ln(`    fadeToBlackBy(${ob}, NUM_LEDS, (uint8_t)((1.0f-${persistVar})*255.0f));`)
        // FORMULA_POINTS_SPEED_MAX.rosePath
        ln(`    float _phase=t*(${speedVar}*2.0f);`)
        ln(`    float _rr=cosf(fmaxf(1.0f, ${f('petals', 'petals', 5)})*_phase);`)
        ln(`    float _cx=_rr*cosf(_phase), _cy=_rr*sinf(_phase);`)
        ln(`    float _hue=fmodf(_phase/6.2831853f,1.0f); if(_hue<0.0f)_hue+=1.0f;`)
        splat(`(_cx+1.0f)/2.0f*(WIDTH-1)`, `(_cy+1.0f)/2.0f*(HEIGHT-1)`, `ColorFromPalette(${pal},(uint8_t)(_hue*255.0f))`, ob)
        ln(`  }`)
        break
      }

      case 'phyllotaxis':
      default: {
        // GOLDEN_ANGLE = 2π(1 − 1/φ) — same literal as graphEvaluator.ts.
        // Extra precision (default floatLit rounds to 4 digits): this
        // literal is multiplied by `_i` up to `count` (≤300), so 4-digit
        // rounding would drift the outer spiral arms visibly out of sync
        // with the preview's full-precision angle.
        const goldenAngle = floatLit(2 * Math.PI * (1 - 1 / 1.618033988749895), 8)
        ln(`  { // Formula Points: phyllotaxis`)
        // FORMULA_POINTS_SPEED_MAX.phyllotaxis
        ln(`    float _spin=t*(${speedVar}*1.0f);`)
        ln(`    fill_solid(${ob}, NUM_LEDS, CRGB::Black);`)
        ln(`    for(int _i=0;_i<${count};_i++){`)
        ln(`      float _ang=_i*${goldenAngle}+_spin, _rr=sqrtf((float)_i/${count});`)
        splat(`(0.5f+0.5f*_rr*cosf(_ang))*(WIDTH-1)`, `(0.5f+0.5f*_rr*sinf(_ang))*(HEIGHT-1)`, `ColorFromPalette(${pal},(uint8_t)(((float)_i/${count})*255.0f))`, ob)
        ln(`    }`)
        ln(`  }`)
        break
      }
    }
  },
  FlowField({ node, id, p, ln, f, ownBuf, paletteExpr, needsT }) {
    needsT.v = true
    const ob = ownBuf()
    const speed = rateCpp(f('speed', 'speed', 0.67), SPEED_MAX.FlowField), scale = rateCpp(f('scale', 'scale', 0.08), SCALE_MAX.FlowField)
    const fadeL = f('fade', 'fade', 0.9)
    const pal = paletteExpr(node.id, 'paletteIn', p)
    const seed = seedProp(p)
    const px = `_fpx_${id}`, py = `_fpy_${id}`, tr = `_ftr_${id}`
    ln(`  { // Flow field`)
    ln(`    const int _count=max(8,min(400,(int)floorf(${f('count', 'count', 80)}))); static float ${px}[400], ${py}[400], ${tr}[NUM_LEDS]; static bool _fi_${id}=false;`)
    if (seed) ln(`    static bool _fs_${id}=false; if(!_fs_${id}){ random16_set_seed(${seed}u); _fs_${id}=true; }`)
    ln(`    if(!_fi_${id}){ for(int _i=0;_i<400;_i++){ ${px}[_i]=(random8()/255.0f)*WIDTH; ${py}[_i]=(random8()/255.0f)*HEIGHT; } for(int _i=0;_i<NUM_LEDS;_i++)${tr}[_i]=0; _fi_${id}=true; }`)
    ln(`    float _spd=${speed},_sc=${scale}; uint16_t _z=(uint16_t)(t*100);`)
    ln(`    for(int _i=0;_i<NUM_LEDS;_i++) ${tr}[_i]*=${fadeL};`)
    ln(`    for(int _i=0;_i<_count;_i++){`)
    ln(`      float _a=(inoise8((uint16_t)(${px}[_i]*_sc*256),(uint16_t)(${py}[_i]*_sc*256),_z)/255.0f)*6.2831f*2;`)
    ln(`      ${px}[_i]=fmodf(${px}[_i]+cos(_a)*_spd*0.6f+WIDTH,WIDTH); ${py}[_i]=fmodf(${py}[_i]+sin(_a)*_spd*0.6f+HEIGHT,HEIGHT);`)
    ln(`      int _xi=(int)${px}[_i],_yi=(int)${py}[_i]; if(_xi>=0&&_xi<WIDTH&&_yi>=0&&_yi<HEIGHT){ int _id=_yi*WIDTH+_xi; ${tr}[_id]=min(1.0f,${tr}[_id]+0.5f); } }`)
    ln(`    for(int _i=0;_i<NUM_LEDS;_i++) ${ob}[_i]=ColorFromPalette(${pal},(uint8_t)(${tr}[_i]*255)); }`)
  },
  Starfield({ node, id, p, ln, f, ownBuf, paletteExpr }) {
    const ob = ownBuf()
    const speed = rateCpp(f('speed', 'speed', 0.33), SPEED_MAX.Starfield)
    const pal = paletteExpr(node.id, 'paletteIn', p)
    const seed = seedProp(p)
    const sx = `_sfx_${id}`, sy = `_sfy_${id}`, sz = `_sfz_${id}`
    ln(`  { // Starfield`)
    ln(`    const int _count=max(8,min(300,(int)floorf(${f('count', 'count', 60)}))); static float ${sx}[300], ${sy}[300], ${sz}[300]; static bool _sfi_${id}=false;`)
    if (seed) ln(`    static bool _sfs_${id}=false; if(!_sfs_${id}){ random16_set_seed(${seed}u); _sfs_${id}=true; }`)
    ln(`    if(!_sfi_${id}){ for(int _i=0;_i<300;_i++){ ${sx}[_i]=random8()/127.5f-1; ${sy}[_i]=random8()/127.5f-1; ${sz}[_i]=random8()/255.0f*0.9f+0.1f; } _sfi_${id}=true; }`)
    ln(`    float _spd=${speed}; fill_solid(${ob}, NUM_LEDS, CRGB::Black);`)
    ln(`    for(int _i=0;_i<_count;_i++){ ${sz}[_i]-=_spd*0.015f;`)
    ln(`      if(${sz}[_i]<=0.02f){ ${sx}[_i]=random8()/127.5f-1; ${sy}[_i]=random8()/127.5f-1; ${sz}[_i]=1; }`)
    ln(`      int _px=(int)(WIDTH/2.0f+(${sx}[_i]/${sz}[_i])*WIDTH*0.35f), _py=(int)(HEIGHT/2.0f+(${sy}[_i]/${sz}[_i])*HEIGHT*0.35f);`)
    ln(`      if(_px>=0&&_px<WIDTH&&_py>=0&&_py<HEIGHT){ float _db=min(1.0f,1-${sz}[_i]); ${ob}[_py*WIDTH+_px]=ColorFromPalette(${pal},(uint8_t)(_db*255)); ${ob}[_py*WIDTH+_px].nscale8((uint8_t)(_db*255)); } } }`)
  },
  Boids({ node, id, p, ln, f, channelColor, ownBuf, paletteExpr, needsT }) {
    const ob = ownBuf()
    const speed = rateCpp(f('speed', 'speed', 0.5), SPEED_MAX.Boids)
    const sep = f('separation', 'separation', 0.6), ali = f('alignment', 'alignment', 0.5)
    const coh = f('cohesion', 'cohesion', 0.4), range = f('visualRange', 'visualRange', 4)
    const colorMode = String(p.colorMode ?? 'solid')
    if (colorMode === 'cycle') needsT.v = true  // time-cycling hue needs `t`
    const colorE = channelColor('color', 120, 200, 255)
    const pal = paletteExpr(node.id, 'paletteIn', p)
    const seed = seedProp(p)
    const bx = `_bx_${id}`, by = `_by_${id}`, bvx = `_bvx_${id}`, bvy = `_bvy_${id}`
    const nvx = `_bnx_${id}`, nvy = `_bny_${id}`, nn = `_bnn_${id}`
    const needNN = colorMode === 'density'  // per-boid neighbour count (density colouring only)
    const rng2 = `(${range})*(${range})`, sepR2 = `((${range})*0.5f)*((${range})*0.5f)`
    ln(`  { // Boids (Reynolds flocking)`)
    ln(`    const int _count=max(2,min(80,(int)floorf(${f('count', 'count', 24)}))); static float ${bx}[80], ${by}[80], ${bvx}[80], ${bvy}[80]; static bool _bi_${id}=false;`)
    if (seed) ln(`    static bool _bs_${id}=false; if(!_bs_${id}){ random16_set_seed(${seed}u); _bs_${id}=true; }`)
    ln(`    if(!_bi_${id}){ for(int _i=0;_i<80;_i++){ ${bx}[_i]=(random8()/255.0f)*WIDTH; ${by}[_i]=(random8()/255.0f)*HEIGHT; float _a=(random8()/255.0f)*6.2831f; ${bvx}[_i]=cosf(_a); ${bvy}[_i]=sinf(_a); } _bi_${id}=true; }`)
    ln(`    float _ms=${speed}; if(_ms<0.1f)_ms=0.1f; float ${nvx}[80], ${nvy}[80];${needNN ? ` int ${nn}[80];` : ''}`)
    ln(`    for(int _i=0;_i<_count;_i++){`)
    ln(`      float _sx=0,_sy=0,_avx=0,_avy=0,_cx=0,_cy=0; int _near=0,_sc=0;`)
    ln(`      for(int _j=0;_j<_count;_j++){ if(_j==_i)continue; float _dx=${bx}[_j]-${bx}[_i],_dy=${by}[_j]-${by}[_i]; float _d2=_dx*_dx+_dy*_dy;`)
    ln(`        if(_d2<(${rng2})){ _avx+=${bvx}[_j];_avy+=${bvy}[_j];_cx+=${bx}[_j];_cy+=${by}[_j];_near++; if(_d2<(${sepR2})&&_d2>0){_sx-=_dx;_sy-=_dy;_sc++;} } }`)
    ln(`      float _stx=0,_sty=0;`)
    ln(`      if(_near>0){ _stx+=(_avx/_near-${bvx}[_i])*(${ali})*0.08f; _sty+=(_avy/_near-${bvy}[_i])*(${ali})*0.08f; _stx+=(_cx/_near-${bx}[_i])*(${coh})*0.005f; _sty+=(_cy/_near-${by}[_i])*(${coh})*0.005f; }`)
    ln(`      if(_sc>0){ _stx+=_sx*(${sep})*0.05f; _sty+=_sy*(${sep})*0.05f; }`)
    ln(`      ${nvx}[_i]=${bvx}[_i]+_stx; ${nvy}[_i]=${bvy}[_i]+_sty;${needNN ? ` ${nn}[_i]=_near;` : ''} }`)
    ln(`    fill_solid(${ob}, NUM_LEDS, CRGB::Black);`)
    if (colorMode === 'solid') ln(`    CRGB _bc0=${colorE};`)
    else if (colorMode === 'radial') ln(`    float _bcx=WIDTH/2.0f,_bcy=HEIGHT/2.0f,_bmr=sqrtf(_bcx*_bcx+_bcy*_bcy); if(_bmr<=0)_bmr=1;`)
    const boidColor =
      colorMode === 'palette' ? `CRGB _bc=ColorFromPalette(${pal},(uint8_t)(_i/(float)_count*255.0f));`
      : colorMode === 'heading' ? `CRGB _bc=CHSV((uint8_t)((atan2f(_diry,_dirx)/6.2831853f+0.5f)*255.0f),255,255);`
      : colorMode === 'spectrum' ? `CRGB _bc=CHSV((uint8_t)(_i/(float)_count*255.0f),255,255);`
      : colorMode === 'density' ? `CRGB _bc=CHSV((uint8_t)((1.0f-min(1.0f,${nn}[_i]/8.0f))*0.7f*255.0f),255,255);`
      : colorMode === 'position' ? `CRGB _bc=CHSV((uint8_t)((${bx}[_i]/WIDTH+${by}[_i]/HEIGHT)*0.5f*255.0f),255,255);`
      : colorMode === 'cycle' ? `CRGB _bc=CHSV((uint8_t)(t*0.1f*255.0f),255,255);`
      : colorMode === 'radial' ? `CRGB _bc=CHSV((uint8_t)(sqrtf((${bx}[_i]-_bcx)*(${bx}[_i]-_bcx)+(${by}[_i]-_bcy)*(${by}[_i]-_bcy))/_bmr*255.0f),255,255);`
      : `CRGB _bc=_bc0;`
    ln(`    for(int _i=0;_i<_count;_i++){`)
    ln(`      float _sp=sqrtf(${nvx}[_i]*${nvx}[_i]+${nvy}[_i]*${nvy}[_i]); if(_sp<=0)_sp=1; float _dirx=${nvx}[_i]/_sp,_diry=${nvy}[_i]/_sp;`)
    ln(`      ${bvx}[_i]=_dirx*_ms; ${bvy}[_i]=_diry*_ms;`)
    ln(`      ${bx}[_i]=fmodf(${bx}[_i]+${bvx}[_i]+WIDTH,WIDTH); ${by}[_i]=fmodf(${by}[_i]+${bvy}[_i]+HEIGHT,HEIGHT);`)
    ln(`      ${boidColor} CRGB _bt=_bc; _bt.nscale8(64);`)
    ln(`      int _px=(int)${bx}[_i],_py=(int)${by}[_i]; if(_px>=0&&_px<WIDTH&&_py>=0&&_py<HEIGHT) ${ob}[_py*WIDTH+_px]=_bc;`)
    ln(`      int _tx=(int)fmodf(${bx}[_i]-_dirx+WIDTH,WIDTH),_ty=(int)fmodf(${by}[_i]-_diry+HEIGHT,HEIGHT);`)
    ln(`      if(_tx>=0&&_tx<WIDTH&&_ty>=0&&_ty<HEIGHT){ int _ti=_ty*WIDTH+_tx; ${ob}[_ti].r=max(${ob}[_ti].r,_bt.r); ${ob}[_ti].g=max(${ob}[_ti].g,_bt.g); ${ob}[_ti].b=max(${ob}[_ti].b,_bt.b); } } }`)
  },
  ReactionDiffusion({ node, id, p, ln, f, ownBuf, paletteExpr, needsWorley }) {
    const ob = ownBuf()
    const feed = f('feed', 'feed', 0.055), kill = f('kill', 'kill', 0.062)
    const pal = paletteExpr(node.id, 'paletteIn', p)
    const seed = seedProp(p)
    if (seed) needsWorley.v = true
    const u = `_u_${id}`, v = `_v_${id}`, un = `_un_${id}`, vn = `_vn_${id}`
    ln(`  { // ReactionDiffusion (Gray-Scott)`)
    ln(`    static float ${u}[NUM_LEDS], ${v}[NUM_LEDS], ${un}[NUM_LEDS], ${vn}[NUM_LEDS]; static bool _rd_${id} = false;`)
    ln(`    if (!_rd_${id}) { for (int _i = 0; _i < NUM_LEDS; _i++) { ${u}[_i] = 1; ${v}[_i] = 0; }`)
    ln(`      for (int _y = HEIGHT/2-2; _y <= HEIGHT/2+1; _y++) for (int _x = WIDTH/2-2; _x <= WIDTH/2+1; _x++)`)
    ln(`        if (_x>=0&&_x<WIDTH&&_y>=0&&_y<HEIGHT) { ${u}[_y*WIDTH+_x]=0.5f; ${v}[_y*WIDTH+_x]=${seed ? `0.25f+_worleyHash(_x+${seed},_y-${seed})*0.5f` : '0.5f'}; } _rd_${id}=true; }`)
    ln(`    float _f=${feed}, _k=${kill};`)
    ln(`    for (int _it=0, _iters=max(1,min(20,(int)floorf(${f('speed', 'speed', 8)}))); _it<_iters; _it++) {`)
    ln(`      for (int _y=0; _y<HEIGHT; _y++) { int _ym=((_y-1+HEIGHT)%HEIGHT)*WIDTH,_yp=((_y+1)%HEIGHT)*WIDTH,_yr=_y*WIDTH;`)
    ln(`        for (int _x=0; _x<WIDTH; _x++) { int _xm=(_x-1+WIDTH)%WIDTH,_xp=(_x+1)%WIDTH,_i=_yr+_x;`)
    ln(`          float _lu=(${u}[_ym+_x]+${u}[_yp+_x]+${u}[_yr+_xm]+${u}[_yr+_xp])*0.2f+(${u}[_ym+_xm]+${u}[_ym+_xp]+${u}[_yp+_xm]+${u}[_yp+_xp])*0.05f-${u}[_i];`)
    ln(`          float _lv=(${v}[_ym+_x]+${v}[_yp+_x]+${v}[_yr+_xm]+${v}[_yr+_xp])*0.2f+(${v}[_ym+_xm]+${v}[_ym+_xp]+${v}[_yp+_xm]+${v}[_yp+_xp])*0.05f-${v}[_i];`)
    ln(`          float _uvv=${u}[_i]*${v}[_i]*${v}[_i];`)
    ln(`          ${un}[_i]=constrain(${u}[_i]+0.16f*_lu-_uvv+_f*(1-${u}[_i]),0.0f,1.0f);`)
    ln(`          ${vn}[_i]=constrain(${v}[_i]+0.08f*_lv+_uvv-(_k+_f)*${v}[_i],0.0f,1.0f); } }`)
    ln(`      ::memcpy(${u},${un},sizeof(${u})); ::memcpy(${v},${vn},sizeof(${v})); }`)
    ln(`    for (int _i=0; _i<NUM_LEDS; _i++) ${ob}[_i]=ColorFromPalette(${pal},(uint8_t)(${v}[_i]*255)); }`)
  },
  GameOfLife({ node, id, p, ln, f, ownBuf, paletteExpr }) {
    const ob = ownBuf()
    const pal = paletteExpr(node.id, 'paletteIn', p)
    const speed = f('speed', 'speed', 8)
    const fadeL = f('fade', 'fade', 0.75)
    const seed = seedProp(p)
    const c = `_gc_${id}`, nx = `_gn_${id}`, br = `_gb_${id}`
    ln(`  { // Game of Life`)
    ln(`    static uint8_t ${c}[NUM_LEDS], ${nx}[NUM_LEDS]; static float ${br}[NUM_LEDS]; static bool _gi_${id}=false; static uint32_t _gt_${id}=0;`)
    if (seed) ln(`    static bool _gs_${id}=false; if(!_gs_${id}){ random16_set_seed(${seed}u); _gs_${id}=true; }`)
    ln(`    if (!_gi_${id}) { for (int _i=0;_i<NUM_LEDS;_i++){${c}[_i]=random8()<77?1:0;${br}[_i]=0;} _gi_${id}=true; }`)
    ln(`    if (millis() - _gt_${id} >= (uint32_t)(1000.0f / max(1.0f, (float)(${speed})))) {`)
    ln(`      int _pop=0;`)
    ln(`      for (int _y=0;_y<HEIGHT;_y++){ int _ym=((_y-1+HEIGHT)%HEIGHT)*WIDTH,_yp=((_y+1)%HEIGHT)*WIDTH,_yr=_y*WIDTH;`)
    ln(`        for (int _x=0;_x<WIDTH;_x++){ int _xm=(_x-1+WIDTH)%WIDTH,_xp=(_x+1)%WIDTH,_i=_yr+_x;`)
    ln(`          int _n=${c}[_ym+_xm]+${c}[_ym+_x]+${c}[_ym+_xp]+${c}[_yr+_xm]+${c}[_yr+_xp]+${c}[_yp+_xm]+${c}[_yp+_x]+${c}[_yp+_xp];`)
    ln(`          ${nx}[_i]=${c}[_i]?((_n==2||_n==3)?1:0):(_n==3?1:0); _pop+=${nx}[_i]; } }`)
    ln(`      ::memcpy(${c},${nx},sizeof(${c}));`)
    ln(`      if (_pop==0) { for (int _i=0;_i<NUM_LEDS;_i++) ${c}[_i]=random8()<77?1:0; }`)
    ln(`      _gt_${id}=millis(); }`)
    ln(`    for (int _i=0;_i<NUM_LEDS;_i++){ ${br}[_i]=${c}[_i]?1.0f:${br}[_i]*${fadeL}; ${ob}[_i]=ColorFromPalette(${pal},(uint8_t)(${br}[_i]*255)); ${ob}[_i].nscale8((uint8_t)(${br}[_i]*255)); } }`)
  },
  Fire2012({ node, id, p, ln, f, ownBuf, incoming, paletteExpr }) {
    const ob = ownBuf()
    const cooling = f('cooling', 'cooling', 55), sparking = f('sparking', 'sparking', 120)
    const pal = paletteExpr(node.id, 'paletteIn', p)
    const direction = String(p.direction ?? 'up')
    // The diffusion window is a loop bound and a divisor, not an array
    // size, so both become runtime reads of one local.
    const spread = `_fireSpread_${id}`
    const spreadDecl = `    int ${spread}=(int)constrain(${f('turbulence', 'turbulence', 1)},0.0f,2.0f);`
    // The palette blend picks between two emitted blocks, so the mix arm is
    // emitted whenever the knob can move — wired, or already below 1.
    const paletteMixE = `constrain(${f('paletteMix', 'paletteMix', 1)},0.0f,1.0f)`
    const paletteMixWired = incoming.has(`${node.id}:paletteMix`)
    const paletteMixP = Math.max(0, Math.min(1, Number(p.paletteMix ?? 1)))
    const mirrorP = Boolean(p.mirror)
    const seedP = Math.max(0, Math.round(Number(p.seed ?? 0)))
    const { P, S } = fireGrid(direction)
    const HB = `_heat_${id}`
    const useLcg = seedP > 0
    const rnd01 = useLcg
      ? `((_fireLcg_${id}=_fireLcg_${id}*1664525u+1013904223u)/4294967296.0f)`
      : `(random8()/255.0f)`
    ln(`  { // Fire2012`)
    ln(spreadDecl)
    ln(`    static uint8_t ${HB}[${P}][${S}] = {};`)
    if (useLcg) ln(`    static uint32_t _fireLcg_${id} = ${seedP}u;`)
    ln(`    for(int _p=0;_p<${P};_p++) for(int _s=0;_s<${S};_s++)`)
    ln(`      ${HB}[_p][_s]=qsub8(${HB}[_p][_s],(uint8_t)(${rnd01}*((${cooling}*10/(${P}))+2)));`)
    // Classic two-row lookahead: row _p from the single row _p-1 (closer to
    // the base) plus a turbulence-wide sideways window at _p-2 (spread=1
    // reproduces the original fixed 4-sample kernel). Mirrors evalFire2012.
    ln(`    for(int _p=(${P})-1;_p>=2;_p--) for(int _s=0;_s<${S};_s++) {`)
    ln(`      int _sum=${HB}[_p-1][_s]; for (int _ds=-${spread}; _ds<=${spread}; _ds++) _sum += ${HB}[_p-2][max(0,min((${S})-1,_s+_ds))];`)
    ln(`      ${HB}[_p][_s]=_sum/(${spread}*2+2); }`)
    ln(`    for(int _s=0;_s<${S};_s++) if(${rnd01}*255 < ${sparking}) ${HB}[0][_s]=qadd8(${HB}[0][_s],(uint8_t)(${rnd01}*95+160));`)
    ln(`    for (int _p = 0; _p < ${P}; _p++) for (int _s = 0; _s < ${S}; _s++) {`)
    const { x: fx, y: fy } = fireXYExpr(direction, '_p', '_s')
    ln(`      uint8_t _h=${HB}[_p][_s]; CRGB _c=ColorFromPalette(${pal}, _h);`)
    if (paletteMixP >= 1 && !paletteMixWired) {
      ln(`      ${ob}[(${fy})*WIDTH+(${fx})] = _c;`)
    } else if (paletteMixWired) {
      ln(`      float _pmix=${paletteMixE}, _pkeep=1.0f-_pmix;`)
      ln(`      ${ob}[(${fy})*WIDTH+(${fx})] = CRGB((uint8_t)(_h*_pkeep+_c.r*_pmix),(uint8_t)(_h*_pkeep+_c.g*_pmix),(uint8_t)(_h*_pkeep+_c.b*_pmix));`)
    } else {
      const keep = floatLit(1 - paletteMixP)
      const mix = floatLit(paletteMixP)
      ln(`      ${ob}[(${fy})*WIDTH+(${fx})] = CRGB((uint8_t)(_h*${keep}+_c.r*${mix}),(uint8_t)(_h*${keep}+_c.g*${mix}),(uint8_t)(_h*${keep}+_c.b*${mix}));`)
    }
    ln(`    }`)
    if (mirrorP) {
      if (direction === 'left' || direction === 'right')
        ln(`    for (int _y=0;_y<HEIGHT/2;_y++) for (int _x=0;_x<WIDTH;_x++) ${ob}[(HEIGHT-1-_y)*WIDTH+_x] = ${ob}[_y*WIDTH+_x];`)
      else
        ln(`    for (int _y=0;_y<HEIGHT;_y++) for (int _x=0;_x<WIDTH/2;_x++) ${ob}[_y*WIDTH+(WIDTH-1-_x)] = ${ob}[_y*WIDTH+_x];`)
    }
    ln(`  }`)
  },
}
