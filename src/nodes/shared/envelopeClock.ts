// The clock for the audio envelopes and smoothers: Beat Flash's flash, Beat
// Kaleidoscope's punch, Ember Pulse's burst, and FFT Analyzer, Percussion
// Detect, Audio Features and Frequency Band smoothing. Each keeps its share
// per 60th of a second rather than per frame, so a response lasts as long on
// a 30 fps Board, or through a dropped frame, as at 60 fps, and 60 fps
// reproduces the per-frame values the sliders were tuned at. Both sides run
// on the wall clock: the preview's `elapsedT`, the sketch's `millis()`.
import { floatLit } from '../../codegen/cppLiterals'

/** The longest step one pass may take, in seconds, so a stalled tab does not
 *  snap every envelope shut; Spectrum Visualizer bounds its own the same. */
export const ENVELOPE_MAX_DT = 0.1

/** Seconds since the previous pass; the first pass counts as one 60 fps frame. */
export function envelopeDt(lastT: number | undefined, now: number): number {
  return lastT === undefined ? 1 / 60 : Math.max(0, Math.min(ENVELOPE_MAX_DT, now - lastT))
}

/** The share of a level kept over `dt` seconds, from its share per 60 fps
 *  frame. A share of 0 keeps nothing even when no time has passed (0 to the
 *  power 0 would keep it all), so 0 still means "follow at once". */
export function keepOver(sharePerFrame: number, dt: number): number {
  return sharePerFrame <= 0 ? 0 : Math.pow(sharePerFrame, dt * 60)
}

/** The firmware twin of `keepOver`, as an expression. */
export function keepOverCpp(share: string, dt: string): string {
  return `(${share}>0.0f?powf(${share},${dt}*60.0f):0.0f)`
}

/** Declares `${prefix}Dt`, the firmware twin of `envelopeDt`. `prefix` must
 *  be unique to the node: it names the statics that remember the last pass. */
export function envelopeDtCpp(prefix: string): string[] {
  return [
    `static uint32_t ${prefix}T=0; static bool ${prefix}I=false; uint32_t ${prefix}Now=millis();`,
    `float ${prefix}Dt=${prefix}I?constrain((${prefix}Now-${prefix}T)/1000.0f,0.0f,${floatLit(ENVELOPE_MAX_DT)}):(1.0f/60.0f); ${prefix}T=${prefix}Now; ${prefix}I=true;`,
  ]
}
