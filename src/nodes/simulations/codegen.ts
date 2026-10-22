import { rateCpp, SPEED_MAX, SCALE_MAX } from '../shared/speedRange'
import { BOIDS_VISUAL_RANGE, FLOW_FIELD_COUNT, REACTION_DIFFUSION_MAX_STEPS, STARFIELD_COUNT } from './limits'
import { phaseTag, speedPhaseCpp } from '../shared/speedClockCpp'
import { CURL_EPS, CURL_GAIN } from '../../state/evaluator/curl'
import {
  FIRE_SMOKE_DEPTH, FIRE_SMOKE_SCALE_ACROSS, FIRE_SMOKE_SCALE_ALONG, FIRE_SMOKE_SPEED, INOISE_UNIT, fireStyle,
} from '../../state/evaluator/fireSmoke'
import {
  LUMINOVA_BLUR, LUMINOVA_MAX, LUMINOVA_NOISE_LANE, LUMINOVA_NOISE_SEPARATION, LUMINOVA_NOISE_SPEED, LUMINOVA_STEP,
  LUMINOVA_TRAIL_DECAY, LUMINOVA_TURN, LUMINOVA_WANDER, luminovaEmitters,
} from '../../state/evaluator/luminova'
import { MAX_STRING_PARTICLES, STRING_PARTICLE_DECAY, ringTrackLeds, stringTrack } from '../../state/evaluator/stringTrack'
import {
  RIPPLE_LIFETIME_SEC, RIPPLE_MAX_RIPPLES, RIPPLE_WIDTH, arrivalEnd, buildRippleTables, rippleBehaviour, rippleShape,
} from '../shared/rippleNetwork'
import { particleRadius } from './particleScale'
import { particleMode, particlePoolSize } from './particleModes'
import type { EmitContext, NodeEmitters } from '../../codegen/emitContext'
import { floatLit, seedProp } from '../../codegen/cppLiterals'
import { reactionDiffusionRates } from './reactionDiffusionPresets'
import { angle16Cpp, phyllotaxisPointCpp, splatDiscQ8Cpp } from '../shared/integerPatterns'

// Fire's styles share these direction/turbulence/paletteMix/mirror/seed
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

/** Fire's `fire2012` style: FastLED's Fire2012 heat algorithm. */
function fire2012Cpp({ node, id, p, ln, f, ownBuf, incoming, paletteExpr }: EmitContext): void {
  const ob = ownBuf()
  const cooling = f('cooling', 'cooling', 55), sparking = f('sparking', 'sparking', 120)
  const pal = paletteExpr(node.id, 'paletteIn', p)
  const direction = String(p.direction ?? 'up')
  // The diffusion window is a loop bound and a divisor, not an array
  // size, so both become runtime reads of one local.
  const spread = `_fireSpread_${id}`
  const spreadDecl = `    int ${spread}=(int)roundf(constrain(${f('turbulence', 'turbulence', 1)},0.0f,2.0f));`
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
}

export const SIMULATIONS_EMITTERS: NodeEmitters = {
  Fire(ctx) {
    if (fireStyle(ctx.p.fireStyle) === 'fire2012') { fire2012Cpp(ctx); return }
    const { node, id, p, ln, f, ownBuf, incoming, paletteExpr, needsT } = ctx
    const ob = ownBuf()
    const intensity = f('intensity', 'intensity', 0.7)
    const cooling = f('cooling', 'cooling', 55)
    const sparking = f('sparking', 'sparking', 120)
    const pal = paletteExpr(node.id, 'paletteIn', p)
    const direction = String(p.direction ?? 'up')
    const smoke = fireStyle(p.fireStyle) === 'smoke'
    if (smoke) needsT.v = true
    // The diffusion window is a loop bound and a divisor, not an array
    // size, so both become runtime reads of one local.
    const spread = `_fireSpread_${id}`
    const spreadDecl = `    int ${spread}=(int)roundf(constrain(${f('turbulence', 'turbulence', 1)},0.0f,2.0f));`
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
    // Heat runs 0-255 here and 0-1 in the preview, which takes cool..2*cool
    // off each cell with cool = cooling/255*0.18; scaled by 255 that is
    // cooling*0.18. Sparks land at 0.75..1 there, 191..255 here.
    ln(`    float _cool=max(0.0f,min(255.0f,${cooling}))*0.18f;`)
    ln(`    float _spark=min(1.0f,max(0.0f,(max(0.0f,min(255.0f,${sparking}))/255.0f)*(0.35f+min(1.0f,max(0.0f,${intensity}))*0.65f)));`)
    ln(`    for (int _p = 0; _p < ${P}; _p++) for (int _s = 0; _s < ${S}; _s++)`)
    ln(`      ${HB}[_p][_s] = qsub8(${HB}[_p][_s], (uint8_t)((1.0f+${rnd01})*_cool));`)
    // Propagate from _p-1 (closer to the flame base) into _p, averaging a
    // turbulence-wide window (spread=1 reproduces the original fixed
    // 3-wide/4-sample kernel exactly). Mirrors evalFire in graphEvaluator.ts.
    ln(`    for (int _p = (${P})-1; _p >= 1; _p--) for (int _s = 0; _s < ${S}; _s++) {`)
    ln(`      int _sum=0; for (int _ds=-${spread}; _ds<=${spread}; _ds++) _sum += ${HB}[_p-1][max(0,min((${S})-1,_s+_ds))];`)
    ln(`      ${HB}[_p][_s] = (${HB}[_p][_s] + _sum) / (${spread}*2+2); }`)
    ln(`    for (int _s = 0; _s < ${S}; _s++)`)
    ln(`      if (${rnd01} < _spark) ${HB}[0][_s] = (uint8_t)(191.25f + ${rnd01}*63.75f);`)
    ln(`    for (int _p = 0; _p < ${P}; _p++) for (int _s = 0; _s < ${S}; _s++) {`)
    const { x: fx, y: fy } = fireXYExpr(direction, '_p', '_s')
    if (smoke) {
      const u = (v: number) => Math.round(v * INOISE_UNIT)
      ln(`      uint8_t _h=${HB}[_p][_s];`)
      ln(`      _h=(uint8_t)(_h*(1.0f-${floatLit(FIRE_SMOKE_DEPTH)}*(inoise8((uint16_t)(_s*${u(FIRE_SMOKE_SCALE_ACROSS)}),(uint16_t)((${P}-1-_p)*${u(FIRE_SMOKE_SCALE_ALONG)}+t*${floatLit(u(FIRE_SMOKE_SPEED))}))/255.0f)));`)
      ln(`      CRGB _c=ColorFromPalette(${pal}, _h);`)
    } else ln(`      uint8_t _h=${HB}[_p][_s]; CRGB _c=ColorFromPalette(${pal}, _h);`)
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
    const mode = particleMode(p.particleType)
    if (['comet', 'snow', 'embers', 'bubbles', 'fireflies', 'meteor', 'tornado', 'attractor', 'luminova'].includes(mode)) needsT.v = true
    // Both are 0–1 sliders and both are wireable; bounded here as in the
    // preview, since a rate over 1 wraps the uint8_t spawn test round to 0 and
    // a decay over 1 lets particles live forever.
    const rate = `constrain(${f('rate', 'rate', 0.3)},0.0f,1.0f)`
    const decayL = `constrain(${f('decay', 'decay', 0.92)},0.0f,1.0f)`
    const pal = paletteExpr(node.id, 'paletteIn', p)
    // Extra variant-specific controls — see PARTICLE_*_MODES in
    // nodeLibrary.ts for which mode reads which. Compile-time constants
    // (not wired ports), mirroring the evaluator's ParticleOpts.
    // `count` stays a property, baked as a loop bound. The other four become
    // per-frame locals, each bounded to the domain its own slider declares so
    // the bound still holds on a wired value.
    const countP = Math.max(2, Math.min(80, Math.round(Number(p.count ?? 24))))
    const sizeE = `constrain(${f('size', 'size', 1)},0.25f,3.0f)`
    const seed = seedProp(p)
    // Fixed-size pool (SoA): l[i] <= 0.04 marks a free slot.
    const cap = particlePoolSize(mode)
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
    {
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
        ln(`    { int _sp=max(1,(int)floorf(_rate*WIDTH*0.8f+0.5f)); for(int k=0;k<_sp;k++) if(random8()<(uint8_t)(_rate*255)){ for(int i=0;i<_PN;i++) if(${A}l[i]<=0.04f){ ${A}x[i]=${spawnX}; ${A}y[i]=random8()/255.0f*HEIGHT*0.3f; ${A}vx[i]=0; ${A}vy[i]=random8()/255.0f*0.25f+0.05f; ${A}l[i]=1; ${A}r[i]=_pc.r; ${A}g[i]=_pc.g; ${A}b[i]=_pc.b; break; } } }`)
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
      else if (mode === 'luminova') {
        const N = luminovaEmitters(countP)
        ln(`    { static bool ${A}em[${LUMINOVA_MAX}];`)
        ln(`      for(int i=${N};i<${LUMINOVA_MAX};i++) if(${A}em[i]){ ${A}em[i]=false; ${A}l[i]=0; }`)
        ln(`      for(int i=0;i<${N};i++){ if(!${A}em[i]){ ${A}x[i]=random8()/255.0f*WIDTH; ${A}y[i]=random8()/255.0f*HEIGHT; ${A}s[i]=random8()/255.0f*6.28f; ${A}l[i]=1; ${A}em[i]=true; }`)
        ln(`        float _n=inoise8((uint16_t)((t*${floatLit(LUMINOVA_NOISE_SPEED)}+i*${floatLit(LUMINOVA_NOISE_SEPARATION)})*256.0f),(uint16_t)(i*${floatLit(LUMINOVA_NOISE_LANE)}*256.0f))/255.0f;`)
        ln(`        ${A}s[i]+=${floatLit(LUMINOVA_TURN)}+(_n-0.5f)*${floatLit(LUMINOVA_WANDER)};`)
        ln(`        ${A}x[i]=fmodf(fmodf(${A}x[i]+cos(${A}s[i])*${floatLit(LUMINOVA_STEP)},(float)WIDTH)+WIDTH,(float)WIDTH); ${A}y[i]=fmodf(fmodf(${A}y[i]+sin(${A}s[i])*${floatLit(LUMINOVA_STEP)},(float)HEIGHT)+HEIGHT,(float)HEIGHT); ${A}l[i]=1;`)
        ln(`        for(int j=${N};j<_PN;j++) if(${A}l[j]<=0.04f){ ${A}x[j]=${A}x[i]; ${A}y[j]=${A}y[i]; ${A}vx[j]=0; ${A}vy[j]=0; ${A}l[j]=1; break; } } }`)
      } else if (mode === 'confetti')
        ln(`    { int _sp=max(1,(int)floorf(_rate*4+0.5f)); for(int k=0;k<_sp;k++) if(random8()<(uint8_t)(_rate*255)){ for(int i=0;i<_PN;i++) if(${A}l[i]<=0.04f){ ${A}x[i]=${spawnX}; ${A}y[i]=random8()/255.0f*HEIGHT; ${A}vx[i]=(random8()/255.0f-0.5f)*0.16f; ${A}vy[i]=random8()/255.0f*0.08f+0.02f; ${A}l[i]=1; break; } } }`)
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
        ln(`    { int _sp=max(1,(int)floorf(_rate*3+0.5f)); for(int k=0;k<_sp;k++) if(random8()<(uint8_t)(_rate*255)){ for(int i=0;i<_PN;i++) if(${A}l[i]<=0.04f){ ${A}x[i]=WIDTH*0.5f+(random8()/255.0f-0.5f)*0.3f*WIDTH*${spreadF}; ${A}y[i]=0; ${A}vx[i]=(random8()/255.0f-0.5f)*0.08f; ${A}vy[i]=random8()/255.0f*0.2f+0.12f; ${A}l[i]=1; break; } } }`)

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
      else if (mode === 'luminova')
        ln(`      if(i<${luminovaEmitters(countP)}) ${A}l[i]=1; else ${A}l[i]*=${decayL}*${floatLit(LUMINOVA_TRAIL_DECAY)}; }`)
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
    ln(`    float _paR=fmaxf(0.5f, ${floatLit(particleRadius(width, height))}*${sizeE}${mode === 'luminova' ? `*${floatLit(LUMINOVA_BLUR)}` : ''});`)
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
     * firmware ignores it. See docs/design/formula-pattern-nodes.md.
     */
  FormulaPoints({ node, id, p, ln, f, ownBuf, width, height, paletteExpr, needsT }) {
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
    // The persistence variants fade last frame's dots rather than clearing.
    const ob = ownBuf({ persists: usesPersist })
    ln(`  int32_t ${Rf}=(int32_t)(fmaxf(0.5f, ${baseR}*fmaxf(0.1f, ${f('dotSize', 'dotSize', 1)}))*256.0f);`)
    if (usesCount) ln(`  int ${count}=(int)constrain(${f('count', 'count', 60)}, 1.0f, 300.0f);`)
    if (usesSpeed) ln(`  float ${speedVar}=constrain(${f('speed', 'speed', 0.3)}, 0.0f, 1.0f);`)
    if (usesPersist) ln(`  float ${persistVar}=constrain(${f('persistence', 'persistence', 0.85)}, 0.0f, 1.0f);`)
    if (formulaType === 'phyllotaxis' || formulaType === 'lissajousPath' || formulaType === 'rosePath') needsT.v = true

    // Splats one soft disc of `colorExpr` at (xExpr, yExpr), float pixels,
    // into `buf`: the integer splat in shared/integerPatterns.ts. Its own
    // nested `{ }` block, so it is safe inside an enclosing `for` loop.
    const splatQ8 = (xQ8: string, yQ8: string, colorExpr: string, buf: string) => {
      for (const line of splatDiscQ8Cpp(xQ8, yQ8, Rf, colorExpr, buf)) ln(`      ${line}`)
    }
    const splat = (xExpr: string, yExpr: string, colorExpr: string, buf: string) =>
      splatQ8(`(int32_t)((${xExpr})*256.0f)`, `(int32_t)((${yExpr})*256.0f)`, colorExpr, buf)

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
        ln(`    float _phase=${speedPhaseCpp(ln, phaseTag(id), speedVar)}*2.0f;`)
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
        ln(`    float _phase=${speedPhaseCpp(ln, phaseTag(id), speedVar)}*2.0f;`)
        ln(`    float _rr=cosf(fmaxf(1.0f, ${f('petals', 'petals', 5)})*_phase);`)
        ln(`    float _cx=_rr*cosf(_phase), _cy=_rr*sinf(_phase);`)
        ln(`    float _hue=fmodf(_phase/6.2831853f,1.0f); if(_hue<0.0f)_hue+=1.0f;`)
        splat(`(_cx+1.0f)/2.0f*(WIDTH-1)`, `(_cy+1.0f)/2.0f*(HEIGHT-1)`, `ColorFromPalette(${pal},(uint8_t)(_hue*255.0f))`, ob)
        ln(`  }`)
        break
      }

      case 'phyllotaxis':
      default: {
        // GOLDEN_ANGLE = 2π(1 − 1/φ), as a 16-bit angle in 1/256ths (integerPatterns.ts).
        ln(`  { // Formula Points: phyllotaxis`)
        // FORMULA_POINTS_SPEED_MAX.phyllotaxis
        ln(`    int32_t _ps16=${angle16Cpp(`${speedPhaseCpp(ln, phaseTag(id), speedVar)}*1.0f`)};`)
        ln(`    fill_solid(${ob}, NUM_LEDS, CRGB::Black);`)
        ln(`    for(int _i=0;_i<${count};_i++){`)
        for (const line of phyllotaxisPointCpp(count)) ln(`      ${line}`)
        splatQ8('_phx', '_phy', `ColorFromPalette(${pal},_phi)`, ob)
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
    const { min: flowMin, max: flowMax } = FLOW_FIELD_COUNT
    ln(`    const int _count=max(${flowMin},min(${flowMax},(int)floorf(${f('count', 'count', 80)}))); static float ${px}[${flowMax}], ${py}[${flowMax}], ${tr}[NUM_LEDS]; static bool _fi_${id}=false;`)
    if (seed) ln(`    static bool _fs_${id}=false; if(!_fs_${id}){ random16_set_seed(${seed}u); _fs_${id}=true; }`)
    ln(`    if(!_fi_${id}){ for(int _i=0;_i<${flowMax};_i++){ ${px}[_i]=(random8()/255.0f)*WIDTH; ${py}[_i]=(random8()/255.0f)*HEIGHT; } for(int _i=0;_i<NUM_LEDS;_i++)${tr}[_i]=0; _fi_${id}=true; }`)
    ln(`    float _spd=${speed},_sc=${scale}; uint16_t _z=(uint16_t)(t*100);`)
    ln(`    for(int _i=0;_i<NUM_LEDS;_i++) ${tr}[_i]*=constrain(${fadeL},0.0f,1.0f);`)
    ln(`    for(int _i=0;_i<_count;_i++){`)
    if (p.flowMode === 'curl') {
      // Central differences of inoise16 a CURL_EPS apart (in cells), turned a quarter turn.
      const eps = Math.round(CURL_EPS * 65536)
      ln(`      uint32_t _cx=(uint32_t)(${px}[_i]*_sc*65536.0f),_cy=(uint32_t)(${py}[_i]*_sc*65536.0f),_cz=(uint32_t)(t*0.1f*65536.0f);`)
      ln(`      float _gx=((float)inoise16(_cx+${eps}u,_cy,_cz)-(float)inoise16(_cx-${eps}u,_cy,_cz))/(65535.0f*${2 * CURL_EPS}f);`)
      ln(`      float _gy=((float)inoise16(_cx,_cy+${eps}u,_cz)-(float)inoise16(_cx,_cy-${eps}u,_cz))/(65535.0f*${2 * CURL_EPS}f);`)
      ln(`      float _dx=_gy*${CURL_GAIN}f,_dy=-_gx*${CURL_GAIN}f;`)
    } else {
      ln(`      float _a=(inoise8((uint16_t)(${px}[_i]*_sc*256),(uint16_t)(${py}[_i]*_sc*256),_z)/255.0f)*6.2831f*2;`)
      ln(`      float _dx=cos(_a),_dy=sin(_a);`)
    }
    ln(`      ${px}[_i]=fmodf(${px}[_i]+_dx*_spd*0.6f+WIDTH,WIDTH); ${py}[_i]=fmodf(${py}[_i]+_dy*_spd*0.6f+HEIGHT,HEIGHT);`)
    ln(`      int _xi=(int)${px}[_i],_yi=(int)${py}[_i]; if(_xi>=0&&_xi<WIDTH&&_yi>=0&&_yi<HEIGHT){ int _id=_yi*WIDTH+_xi; ${tr}[_id]=min(1.0f,${tr}[_id]+0.5f); } }`)
    ln(`    for(int _i=0;_i<NUM_LEDS;_i++) ${ob}[_i]=ColorFromPalette(${pal},(uint8_t)(${tr}[_i]*255)); }`)
  },
  // Ripple: the turning rule runs here once per (edge, end) and is baked as
  // tables, so the sketch makes the same choice at every node as the preview
  // and carries no trigonometry. The network is fitted to the render canvas
  // at start-up with the same rule as fitNetworkToCanvas, so a multi-render
  // pass lands its LEDs where its own canvas puts them.
  Ripple({ node, id, p, ln, f, ownBuf, paletteExpr, boolExpr, needsT }) {
    needsT.v = true
    const ob = ownBuf({ persists: true })
    const { shape, ledsPerEdge } = rippleShape(p)
    const tables = buildRippleTables(shape, ledsPerEdge, 64, 64)
    const behaviour = rippleBehaviour(p.behaviour)
    const edges = shape.edges.length, nodes = shape.nodes.length
    const lifetime = Math.max(RIPPLE_LIFETIME_SEC.min, Math.min(RIPPLE_LIFETIME_SEC.max, Number(p.lifetime ?? RIPPLE_LIFETIME_SEC.default)))
    const width = Math.max(RIPPLE_WIDTH.min, Math.min(RIPPLE_WIDTH.max, Math.round(Number(p.width ?? RIPPLE_WIDTH.default))))
    const startNode = Math.round(Number(p.startNode ?? -1))
    const speed = rateCpp(f('speed', 'speed', 0.4), SPEED_MAX.Ripple)
    const pal = paletteExpr(node.id, 'paletteIn', p)
    const seed = seedProp(p)
    const A = `_rp_${id}`
    const N = String(ledsPerEdge), M = String(RIPPLE_MAX_RIPPLES)
    // The outgoing lists of every edge end, flattened: offsets, then entries
    // as (edge << 1) | (dir is from→to), then the four deterministic picks.
    const offsets: number[] = [0]
    const list: number[] = []
    const picks: string[] = []
    for (let end = 0; end < tables.ends.length; end++) {
      const e = tables.ends[end]
      for (const o of e.outgoing) list.push((o.edge << 1) | (o.dir === 1 ? 1 : 0))
      offsets.push(list.length)
      picks.push(`{${e.straight},${e.left},${e.right},${e.angry}}`)
    }
    const pick = behaviour === 'straight' ? 0 : behaviour === 'left' ? 1 : behaviour === 'right' ? 2 : 3
    ln(`  { // Ripple on a ${edges}-edge network`)
    ln(`    static const float ${A}nd[${nodes}][2] PROGMEM = {${shape.nodes.map(([x, y]) => `{${floatLit(x)},${floatLit(y)}}`).join(',')}};`)
    ln(`    static const uint8_t ${A}ed[${edges}][2] PROGMEM = {${shape.edges.map(([a, b]) => `{${a},${b}}`).join(',')}};`)
    ln(`    static const uint16_t ${A}off[${offsets.length}] PROGMEM = {${offsets.join(',')}};`)
    ln(`    static const uint8_t ${A}out[${list.length}] PROGMEM = {${list.join(',')}};`)
    ln(`    static const uint8_t ${A}pk[${tables.ends.length}][4] PROGMEM = {${picks.join(',')}};`)
    ln(`    static uint16_t ${A}px[${edges * ledsPerEdge}]; static uint8_t ${A}e[${M}], ${A}d[${M}]; static float ${A}o[${M}], ${A}a[${M}], ${A}h[${M}]; static bool ${A}l[${M}];`)
    ln(`    static float ${A}t=0, ${A}acc=0; static bool ${A}prev=false, ${A}init=false; static uint16_t ${A}born=0;`)
    ln(`    bool _tr=(${boolExpr(node.id, 'trigger')});`)
    ln(`    if(!${A}init){`)
    if (seed) ln(`      random16_set_seed(${seed}u);`)
    ln(`      float _mnx=1e9f,_mxx=-1e9f,_mny=1e9f,_mxy=-1e9f;`)
    ln(`      for(int _i=0;_i<${nodes};_i++){ float _x=pgm_read_float(&${A}nd[_i][0]),_y=pgm_read_float(&${A}nd[_i][1]); _mnx=min(_mnx,_x); _mxx=max(_mxx,_x); _mny=min(_mny,_y); _mxy=max(_mxy,_y); }`)
    ln(`      float _sx=_mxx-_mnx,_sy=_mxy-_mny,_iw=max(0,WIDTH-1),_ih=max(0,HEIGHT-1);`)
    ln(`      float _k=min(_sx>1e-6f?_iw/_sx:1e9f,_sy>1e-6f?_ih/_sy:1e9f); if(_k>1e8f) _k=1.0f;`)
    ln(`      float _lf=0.5f+(_iw-_sx*_k)/2.0f,_tp=0.5f+(_ih-_sy*_k)/2.0f;`)
    ln(`      for(int _ei=0;_ei<${edges};_ei++){ int _a=pgm_read_byte(&${A}ed[_ei][0]),_b=pgm_read_byte(&${A}ed[_ei][1]);`)
    ln(`        float _ax=_lf+(pgm_read_float(&${A}nd[_a][0])-_mnx)*_k,_ay=_tp+(pgm_read_float(&${A}nd[_a][1])-_mny)*_k,_bx=_lf+(pgm_read_float(&${A}nd[_b][0])-_mnx)*_k,_by=_tp+(pgm_read_float(&${A}nd[_b][1])-_mny)*_k;`)
    ln(`        for(int _i=0;_i<${N};_i++){ float _u=(_i+0.5f)/${N}; int _x=constrain((int)lroundf(_ax+(_bx-_ax)*_u-0.5f),0,WIDTH-1),_y=constrain((int)lroundf(_ay+(_by-_ay)*_u-0.5f),0,HEIGHT-1); ${A}px[_ei*${N}+_i]=_y*WIDTH+_x; } }`)
    ln(`      for(int _i=0;_i<${M};_i++) ${A}l[_i]=false; fill_solid(${ob}, NUM_LEDS, CRGB::Black); ${A}t=t; ${A}prev=_tr; ${A}init=true; }`)
    ln(`    float _dt=constrain(t-${A}t,0.0f,0.25f); ${A}t=t;`)
    ln(`    float _spd=${speed},_rate=max(0.0f,${f('rate', 'rate', 1)}),_life=${floatLit(lifetime)}; uint8_t _fq=(uint8_t)(constrain(${f('fade', 'fade', 0.85)},0.0f,1.0f)*255.0f);`)
    ln(`    ${A}acc+=_rate*_dt; int _sp=(int)floorf(${A}acc); ${A}acc-=_sp; if(_tr&&!${A}prev) _sp++; ${A}prev=_tr;`)
    ln(`    for(int _s=0;_s<_sp;_s++){ int _slot=-1; for(int _i=0;_i<${M};_i++) if(!${A}l[_i]){ _slot=_i; break; } if(_slot<0) break;`)
    ln(`      int _n=${startNode >= 0 && startNode < nodes ? String(startNode) : `random16(${nodes})`}; int _ei=-1; uint8_t _dd=1;`)
    ln(`      for(int _j=0;_j<${edges};_j++){ int _a=pgm_read_byte(&${A}ed[_j][0]),_b=pgm_read_byte(&${A}ed[_j][1]); if(_a==_n){ _ei=_j; _dd=1; break; } if(_b==_n){ _ei=_j; _dd=0; break; } }`)
    ln(`      if(_ei<0) break; ${A}e[_slot]=_ei; ${A}d[_slot]=_dd; ${A}o[_slot]=0; ${A}a[_slot]=0; ${A}h[_slot]=((${A}born*37)%256)/256.0f; ${A}born++; ${A}l[_slot]=true; }`)
    ln(`    for(int _i=0;_i<${M};_i++){ if(!${A}l[_i]) continue; ${A}a[_i]+=_dt; if(${A}a[_i]>=_life){ ${A}l[_i]=false; continue; }`)
    ln(`      float _of=${A}o[_i]+_spd*_dt; int _ei=${A}e[_i]; uint8_t _dd=${A}d[_i]; int _guard=0;`)
    ln(`      while(_of>=${N}&&_guard++<64){ int _end=_ei*2+(_dd?1:0); uint16_t _o0=pgm_read_word(&${A}off[_end]),_o1=pgm_read_word(&${A}off[_end+1]); int _cnt=_o1-_o0; float _carry=_of-${N};`)
    if (behaviour === 'explode') {
      ln(`        for(int _c=1;_c<_cnt;_c++){ int _slot=-1; for(int _j=0;_j<${M};_j++) if(!${A}l[_j]){ _slot=_j; break; } if(_slot<0) break; uint8_t _v=pgm_read_byte(&${A}out[_o0+_c]); ${A}e[_slot]=_v>>1; ${A}d[_slot]=_v&1; ${A}o[_slot]=_carry; ${A}a[_slot]=${A}a[_i]; ${A}h[_slot]=${A}h[_i]; ${A}l[_slot]=true; }`)
      ln(`        uint8_t _v=pgm_read_byte(&${A}out[_o0]);`)
    } else if (behaviour === 'random') {
      ln(`        uint8_t _v=pgm_read_byte(&${A}out[_o0+random16(_cnt)]);`)
    } else {
      ln(`        uint8_t _v=pgm_read_byte(&${A}out[_o0+pgm_read_byte(&${A}pk[_end][${pick}])]);`)
    }
    ln(`        _ei=_v>>1; _dd=_v&1; _of=_carry; }`)
    ln(`      ${A}e[_i]=_ei; ${A}d[_i]=_dd; ${A}o[_i]=_of; }`)
    ln(`    for(int _i=0;_i<NUM_LEDS;_i++){ ${ob}[_i].r=scale8(${ob}[_i].r,_fq); ${ob}[_i].g=scale8(${ob}[_i].g,_fq); ${ob}[_i].b=scale8(${ob}[_i].b,_fq); }`)
    ln(`    for(int _i=0;_i<${M};_i++){ if(!${A}l[_i]) continue; float _lf=1.0f-${A}a[_i]/_life; CRGB _c=ColorFromPalette(${pal},(uint8_t)(${A}h[_i]*255.0f));`)
    ln(`      for(int _k=0;_k<${width};_k++){ float _of=${A}o[_i]-_k; if(_of<0) break; int _li=constrain((int)floorf(_of),0,${N}-1); if(!${A}d[_i]) _li=${N}-1-_li;`)
    ln(`        uint16_t _p=${A}px[${A}e[_i]*${N}+_li]; uint8_t _q=(uint8_t)(constrain(_lf*(1.0f-(float)_k/${width}),0.0f,1.0f)*255.0f);`)
    ln(`        ${ob}[_p].r=max(${ob}[_p].r,scale8(_c.r,_q)); ${ob}[_p].g=max(${ob}[_p].g,scale8(_c.g,_q)); ${ob}[_p].b=max(${ob}[_p].b,scale8(_c.b,_q)); } }`)
    ln(`  }`)
    void arrivalEnd
  },
  StringParticles({ node, id, p, ln, f, ownBuf, paletteExpr, boolExpr, needsT }) {
    const ob = ownBuf()
    const track = stringTrack(p.track), meteors = p.mode === 'meteors'
    const ringLeds = ringTrackLeds(p.ringLeds)
    if (meteors) needsT.v = true
    const speed = rateCpp(f('speed', 'speed', 0.5), SPEED_MAX.StringParticles)
    const pal = paletteExpr(node.id, 'paletteIn', p)
    const seed = seedProp(p)
    const bedLevel = Math.max(0, Math.min(1, Number(p.bed ?? 0.3))), bed = floatLit(bedLevel)
    const A = `_sp_${id}`
    // Every LED of the track, in order: `_k` is the position, and the index is
    // the canvas pixel it lands on. The ring's is baked at start-up from the
    // same inscribed circle `ringSampleMap` reads.
    const lenExpr = track === 'ring' ? String(ringLeds) : track === 'column' ? 'HEIGHT' : 'WIDTH'
    const cap = track === 'ring' ? String(ringLeds) : 'NUM_LEDS'
    const at = track === 'ring' ? `${A}ix[_k]` : track === 'column' ? '_k*WIDTH+WIDTH/2' : '(HEIGHT/2)*WIDTH+_k'
    const decay = STRING_PARTICLE_DECAY.map((d) => `${floatLit(d)}`).join(',')
    ln(`  { // String Particles`)
    ln(`    const int _n=max(1,min(${MAX_STRING_PARTICLES},(int)floorf(${f('count', 'count', 12)}))), _len=${lenExpr};`)
    ln(`    static float ${A}p[${MAX_STRING_PARTICLES}], ${A}v[${MAX_STRING_PARTICLES}], ${A}l[${MAX_STRING_PARTICLES}], ${A}h[${MAX_STRING_PARTICLES}]; static uint8_t ${A}k[${MAX_STRING_PARTICLES}]; static CRGB ${A}tr[${cap}];${track === 'ring' ? ` static uint16_t ${A}ix[${cap}];` : ''} static bool ${A}prev=false, ${A}init=false;`)
    ln(`    static const float ${A}dec[4]={${decay}};`)
    ln(`    bool _tr=(${boolExpr(node.id, 'trigger')});`)
    ln(`    if(!${A}init){`)
    if (seed) ln(`      random16_set_seed(${seed}u);`)
    ln(`      for(int _i=0;_i<${MAX_STRING_PARTICLES};_i++){ ${A}l[_i]=0; ${A}k[_i]=0; } for(int _i=0;_i<${cap};_i++) ${A}tr[_i]=CRGB::Black; ${A}prev=_tr;`)
    if (track === 'ring') {
      ln(`      float _cx=(WIDTH-1)/2.0f,_cy=(HEIGHT-1)/2.0f,_rad=min(_cx,_cy);`)
      ln(`      for(int _k=0;_k<_len;_k++){ float _th=_k*6.2831853f/_len; int _x=constrain((int)floorf(_cx+_rad*sinf(_th)+0.5f),0,WIDTH-1), _y=constrain((int)floorf(_cy-_rad*cosf(_th)+0.5f),0,HEIGHT-1); ${A}ix[_k]=_y*WIDTH+_x; }`)
    }
    ln(`      ${A}init=true; }`)
    ln(`    float _step=max(0.0f,${speed})*0.6f,_sp=constrain(${f('spawn', 'spawn', 0.5)},0.0f,1.0f);`)
    ln(`    uint8_t _fq=(uint8_t)(constrain(${f('fade', 'fade', 0.85)},0.0f,1.0f)*255.0f);`)
    ln(`    for(int _k=0;_k<_len;_k++){ ${A}tr[_k].r=scale8(${A}tr[_k].r,_fq); ${A}tr[_k].g=scale8(${A}tr[_k].g,_fq); ${A}tr[_k].b=scale8(${A}tr[_k].b,_fq); }`)
    ln(`    auto _rnd=[]()->float{ return random16()/65535.0f; };`)
    ln(`    auto _dir=[&]()->float{ return _rnd()<0.5f?-1.0f:1.0f; };`)
    ln(`    auto _free=[&]()->int{ for(int _i=0;_i<_n;_i++) if(${A}l[_i]<=0) return _i; return -1; };`)
    ln(`    auto _place=[&](int _i,uint8_t _kd,float _pp,float _vv,float _ll,float _hh){ ${A}k[_i]=_kd; ${A}p[_i]=_pp; ${A}v[_i]=_vv; ${A}l[_i]=_ll; ${A}h[_i]=_hh; };`)
    if (meteors) {
      ln(`    if(_rnd()<_sp*0.3f){ int _i=_free(); if(_i>=0){ float _pp=_rnd()*_len,_vv=_dir()*0.3f,_hh=_rnd(); _place(_i,1,_pp,_vv,0.6f,_hh); } }`)
      ln(`    if(_tr&&!${A}prev){ int _i=_free(); if(_i>=0){ float _pp=_rnd()*_len,_vv=_dir()*(1.0f+_step*2.0f),_hh=_rnd(); _place(_i,2,_pp,_vv,1.0f,_hh);`)
      ln(`      for(int _d=0;_d<3;_d++){ int _j=_free(); if(_j>=0){ float _rr=_rnd(); _place(_j,3,_pp,-_vv*(0.2f+_rr*0.4f),0.7f,_hh); } } } }`)
    } else {
      ln(`    for(int _i=0;_i<_n;_i++){ if(${A}l[_i]<=0&&_rnd()<_sp){ float _pp=_rnd()*_len,_vv=_dir(),_hh=_rnd(); _place(_i,0,_pp,_vv,1.0f,_hh); } }`)
    }
    ln(`    ${A}prev=_tr;`)
    ln(`    for(int _i=0;_i<_n;_i++){ if(${A}l[_i]<=0) continue;`)
    ln(`      if(${A}k[_i]==0) ${A}p[_i]=fmodf(fmodf(${A}p[_i]+${A}v[_i]*_step*${A}l[_i],(float)_len)+_len,(float)_len);`)
    ln(`      else { ${A}p[_i]=fmodf(fmodf(${A}p[_i]+${A}v[_i],(float)_len)+_len,(float)_len); if(${A}k[_i]==3) ${A}v[_i]*=0.92f; }`)
    ln(`      ${A}l[_i]-=${A}dec[${A}k[_i]]; if(${A}l[_i]<=0){ ${A}l[_i]=0; continue; }`)
    ln(`      CRGB _b=ColorFromPalette(${pal},(uint8_t)(constrain(${A}h[_i],0.0f,1.0f)*255.0f));`)
    ln(`      uint8_t _wq=(uint8_t)((1.0f-${A}l[_i])*0.5f*255.0f), _lq=(uint8_t)(${A}l[_i]*255.0f);`)
    ln(`      uint8_t _c[3]={ scale8(_b.r+scale8(255-_b.r,_wq),_lq), scale8(_b.g+scale8(255-_b.g,_wq),_lq), scale8(_b.b+scale8(255-_b.b,_wq),_lq) };`)
    ln(`      float _pw=fmodf(fmodf(${A}p[_i],(float)_len)+_len,(float)_len); int _a=min(_len-1,(int)floorf(_pw)); float _fr=_pw-_a;`)
    ln(`      int _cell[2]={_a,(_a+1)%_len}; float _cv[2]={1.0f-_fr,_fr};`)
    ln(`      for(int _j=0;_j<2;_j++){ uint8_t _q=(uint8_t)(constrain(_cv[_j],0.0f,1.0f)*255.0f); ${A}tr[_cell[_j]].r=qadd8(${A}tr[_cell[_j]].r,scale8(_c[0],_q)); ${A}tr[_cell[_j]].g=qadd8(${A}tr[_cell[_j]].g,scale8(_c[1],_q)); ${A}tr[_cell[_j]].b=qadd8(${A}tr[_cell[_j]].b,scale8(_c[2],_q)); } }`)
    ln(`    fill_solid(${ob}, NUM_LEDS, CRGB::Black);`)
    ln(`    for(int _k=0;_k<_len;_k++){ uint8_t _r=${A}tr[_k].r,_g=${A}tr[_k].g,_bl=${A}tr[_k].b;`)
    if (meteors && bedLevel > 0) {
      ln(`      float _nv=inoise8((uint16_t)(_k*90),(uint16_t)(t*102.0f))/255.0f; CRGB _nc=ColorFromPalette(${pal},(uint8_t)(_nv*255.0f)); uint8_t _nq=(uint8_t)(constrain(_nv*${bed},0.0f,1.0f)*255.0f);`)
      ln(`      _r=qadd8(_r,scale8(_nc.r,_nq)); _g=qadd8(_g,scale8(_nc.g,_nq)); _bl=qadd8(_bl,scale8(_nc.b,_nq));`)
    }
    ln(`      ${ob}[${at}]=CRGB(_r,_g,_bl); } }`)
  },
  Starfield({ node, id, p, ln, f, ownBuf, paletteExpr }) {
    const ob = ownBuf()
    const speed = rateCpp(f('speed', 'speed', 0.33), SPEED_MAX.Starfield)
    const pal = paletteExpr(node.id, 'paletteIn', p)
    const seed = seedProp(p)
    const sx = `_sfx_${id}`, sy = `_sfy_${id}`, sz = `_sfz_${id}`
    ln(`  { // Starfield`)
    const { min: starMin, max: starMax } = STARFIELD_COUNT
    ln(`    const int _count=max(${starMin},min(${starMax},(int)floorf(${f('count', 'count', 60)}))); static float ${sx}[${starMax}], ${sy}[${starMax}], ${sz}[${starMax}]; static bool _sfi_${id}=false;`)
    if (seed) ln(`    static bool _sfs_${id}=false; if(!_sfs_${id}){ random16_set_seed(${seed}u); _sfs_${id}=true; }`)
    ln(`    if(!_sfi_${id}){ for(int _i=0;_i<${starMax};_i++){ ${sx}[_i]=random8()/127.5f-1; ${sy}[_i]=random8()/127.5f-1; ${sz}[_i]=random8()/255.0f*0.9f+0.1f; } _sfi_${id}=true; }`)
    ln(`    float _spd=${speed}; fill_solid(${ob}, NUM_LEDS, CRGB::Black);`)
    ln(`    for(int _i=0;_i<_count;_i++){ ${sz}[_i]-=_spd*0.015f;`)
    ln(`      if(${sz}[_i]<=0.02f){ ${sx}[_i]=random8()/127.5f-1; ${sy}[_i]=random8()/127.5f-1; ${sz}[_i]=1; }`)
    ln(`      int _px=(int)(WIDTH/2.0f+(${sx}[_i]/${sz}[_i])*WIDTH*0.35f), _py=(int)(HEIGHT/2.0f+(${sy}[_i]/${sz}[_i])*HEIGHT*0.35f);`)
    ln(`      if(_px>=0&&_px<WIDTH&&_py>=0&&_py<HEIGHT){ float _db=min(1.0f,1-${sz}[_i]); ${ob}[_py*WIDTH+_px]=ColorFromPalette(${pal},(uint8_t)(_db*255)); ${ob}[_py*WIDTH+_px].nscale8((uint8_t)(_db*255)); } } }`)
  },
  Boids({ node, id, p, ln, f, channelColor, ownBuf, paletteExpr, needsT }) {
    const ob = ownBuf()
    const speed = rateCpp(f('speed', 'speed', 0.5), SPEED_MAX.Boids)
    const unit = (expr: string) => `constrain(${expr},0.0f,1.0f)`
    const sep = unit(f('separation', 'separation', 0.6)), ali = unit(f('alignment', 'alignment', 0.5))
    const coh = unit(f('cohesion', 'cohesion', 0.4))
    const range = `constrain(${f('visualRange', 'visualRange', 4)},${BOIDS_VISUAL_RANGE.min}.0f,${BOIDS_VISUAL_RANGE.max}.0f)`
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
  ReactionDiffusion({ node, id, p, ln, f, ownBuf, ownField, paletteExpr, needsWorley }) {
    const ob = ownBuf()
    // A named preset bakes its pair and ignores wires, as the preview does.
    const rates = reactionDiffusionRates(p.rdPreset)
    const feed = rates ? floatLit(rates.feed, 6) : f('feed', 'feed', 0.055)
    const kill = rates ? floatLit(rates.kill, 6) : f('kill', 'kill', 0.062)
    const pal = paletteExpr(node.id, 'paletteIn', p)
    // The starting patch hashes each pixel with the seed as the hash's third
    // input, as `reactionDiffusionSeedV` does in the preview; seed 0 included.
    const seed = seedProp(p)
    needsWorley.v = true
    // V lives in the node's field buffer, so the Field output costs no copy
    // and no RAM beyond the buffer every field output is priced for. PSRAM
    // makes that buffer a pointer, so its copies take an explicit size. It
    // carries V into the next frame, so it persists.
    const v = ownField('field', { persists: true })
    const u = `_u_${id}`, un = `_un_${id}`, vn = `_vn_${id}`
    ln(`  { // ReactionDiffusion (Gray-Scott)`)
    ln(`    static float ${u}[NUM_LEDS], ${un}[NUM_LEDS], ${vn}[NUM_LEDS]; static bool _rd_${id} = false;`)
    ln(`    if (!_rd_${id}) { for (int _i = 0; _i < NUM_LEDS; _i++) { ${u}[_i] = 1; ${v}[_i] = 0; }`)
    ln(`      for (int _y = HEIGHT/2-2; _y <= HEIGHT/2+1; _y++) for (int _x = WIDTH/2-2; _x <= WIDTH/2+1; _x++)`)
    ln(`        if (_x>=0&&_x<WIDTH&&_y>=0&&_y<HEIGHT) { ${u}[_y*WIDTH+_x]=0.5f; ${v}[_y*WIDTH+_x]=0.25f+_worleyHash(_x,_y,${seed}u)*0.5f; } _rd_${id}=true; }`)
    ln(`    float _f=${feed}, _k=${kill};`)
    ln(`    for (int _it=0, _iters=max(1,min(${REACTION_DIFFUSION_MAX_STEPS},(int)floorf(${f('speed', 'speed', 8)}))); _it<_iters; _it++) {`)
    ln(`      for (int _y=0; _y<HEIGHT; _y++) { int _ym=((_y-1+HEIGHT)%HEIGHT)*WIDTH,_yp=((_y+1)%HEIGHT)*WIDTH,_yr=_y*WIDTH;`)
    ln(`        for (int _x=0; _x<WIDTH; _x++) { int _xm=(_x-1+WIDTH)%WIDTH,_xp=(_x+1)%WIDTH,_i=_yr+_x;`)
    ln(`          float _lu=(${u}[_ym+_x]+${u}[_yp+_x]+${u}[_yr+_xm]+${u}[_yr+_xp])*0.2f+(${u}[_ym+_xm]+${u}[_ym+_xp]+${u}[_yp+_xm]+${u}[_yp+_xp])*0.05f-${u}[_i];`)
    ln(`          float _lv=(${v}[_ym+_x]+${v}[_yp+_x]+${v}[_yr+_xm]+${v}[_yr+_xp])*0.2f+(${v}[_ym+_xm]+${v}[_ym+_xp]+${v}[_yp+_xm]+${v}[_yp+_xp])*0.05f-${v}[_i];`)
    ln(`          float _uvv=${u}[_i]*${v}[_i]*${v}[_i];`)
    ln(`          ${un}[_i]=constrain(${u}[_i]+0.16f*_lu-_uvv+_f*(1-${u}[_i]),0.0f,1.0f);`)
    ln(`          ${vn}[_i]=constrain(${v}[_i]+0.08f*_lv+_uvv-(_k+_f)*${v}[_i],0.0f,1.0f); } }`)
    ln(`      ::memcpy(${u},${un},sizeof(${u})); ::memcpy(${v},${vn},NUM_LEDS*sizeof(float)); }`)
    ln(`    for (int _i=0; _i<NUM_LEDS; _i++) ${ob}[_i]=ColorFromPalette(${pal},(uint8_t)(${v}[_i]*255)); }`)
  },
  GameOfLife({ node, id, p, ln, f, ownBuf, paletteExpr }) {
    const ob = ownBuf()
    const pal = paletteExpr(node.id, 'paletteIn', p)
    const speed = f('speed', 'speed', 8)
    const fadeL = `constrain(${f('fade', 'fade', 0.75)},0.0f,1.0f)`
    const seed = seedProp(p)
    const c = `_gc_${id}`, nx = `_gn_${id}`, br = `_gb_${id}`
    ln(`  { // Game of Life`)
    ln(`    static uint8_t ${c}[NUM_LEDS], ${nx}[NUM_LEDS]; static float ${br}[NUM_LEDS]; static bool _gi_${id}=false; static uint32_t _gt_${id}=0; static uint8_t _gst_${id}=0;`)
    if (seed) ln(`    static bool _gs_${id}=false; if(!_gs_${id}){ random16_set_seed(${seed}u); _gs_${id}=true; }`)
    ln(`    if (!_gi_${id}) { for (int _i=0;_i<NUM_LEDS;_i++){${c}[_i]=random8()<77?1:0;${br}[_i]=0;} _gi_${id}=true; }`)
    ln(`    if (millis() - _gt_${id} >= (uint32_t)(1000.0f / max(1.0f, (float)(${speed})))) {`)
    ln(`      int _pop=0; bool _chg=false;`)
    ln(`      for (int _y=0;_y<HEIGHT;_y++){ int _ym=((_y-1+HEIGHT)%HEIGHT)*WIDTH,_yp=((_y+1)%HEIGHT)*WIDTH,_yr=_y*WIDTH;`)
    ln(`        for (int _x=0;_x<WIDTH;_x++){ int _xm=(_x-1+WIDTH)%WIDTH,_xp=(_x+1)%WIDTH,_i=_yr+_x;`)
    ln(`          int _n=${c}[_ym+_xm]+${c}[_ym+_x]+${c}[_ym+_xp]+${c}[_yr+_xm]+${c}[_yr+_xp]+${c}[_yp+_xm]+${c}[_yp+_x]+${c}[_yp+_xp];`)
    ln(`          ${nx}[_i]=${c}[_i]?((_n==2||_n==3)?1:0):(_n==3?1:0); _pop+=${nx}[_i]; if(${nx}[_i]!=${c}[_i]) _chg=true; } }`)
    ln(`      ::memcpy(${c},${nx},sizeof(${c}));`)
    // Reseeds once the board has been empty or frozen for four steps, as the
    // preview does, so a field of still lifes doesn't hold forever.
    ln(`      _gst_${id}=(_pop==0||!_chg)?_gst_${id}+1:0;`)
    ln(`      if (_gst_${id}>3) { for (int _i=0;_i<NUM_LEDS;_i++) ${c}[_i]=random8()<77?1:0; _gst_${id}=0; }`)
    ln(`      _gt_${id}=millis(); }`)
    ln(`    for (int _i=0;_i<NUM_LEDS;_i++){ ${br}[_i]=${c}[_i]?1.0f:${br}[_i]*${fadeL}; ${ob}[_i]=ColorFromPalette(${pal},(uint8_t)(${br}[_i]*255)); ${ob}[_i].nscale8((uint8_t)(${br}[_i]*255)); } }`)
  },
}
