// A slow demo kit for the drum-driven patterns (Kick Shock, Percussion
// Blobs). Their Kick, Snare and Hi-Hat are triggers, so a constant field value
// fires once and then holds: a pattern dropped with nothing wired stayed black.
// While none of the three ports is wired, the pattern plays this instead: a
// kick at the top of each bar and a snare half a bar later, so the shapes show
// on drop. The moment a drum wire lands, the demo stops.
import type { EmitContext } from '../../codegen/emitContext'
import { floatLit } from '../../codegen/cppLiterals'

export const DEMO_DRUM_PORTS = ['kick', 'snare', 'hihat'] as const

/** One demo bar, in seconds of the pattern clock: kick at 0, snare at half. */
export const DEMO_DRUM_BAR_SEC = 2

/** How much of the bar each hit stays high; a rising edge starts each. */
const DEMO_DRUM_HIT_SHARE = 0.25

/** True while the node has no wire into any of its drum ports. */
export function demoDrumsActive(incoming: ReadonlySet<string> | ReadonlyMap<string, unknown>, nodeId: string): boolean {
  return DEMO_DRUM_PORTS.every((port) => !incoming.has(`${nodeId}:${port}`))
}

export function demoDrums(t: number): { kick: boolean; snare: boolean } {
  const phase = ((t / DEMO_DRUM_BAR_SEC) % 1 + 1) % 1
  return {
    kick: phase < DEMO_DRUM_HIT_SHARE,
    snare: phase >= 0.5 && phase < 0.5 + DEMO_DRUM_HIT_SHARE,
  }
}

/**
 * The firmware twin of `demoDrums`, declaring `${prefix}Kick` and
 * `${prefix}Snare`; emits nothing while a drum port is wired.
 */
export function demoDrumsCpp(ctx: Pick<EmitContext, 'incoming' | 'node'>, prefix: string): string[] {
  if (!demoDrumsActive(ctx.incoming, ctx.node.id)) return []
  const share = floatLit(DEMO_DRUM_HIT_SHARE)
  return [
    `float ${prefix}Ph=fmodf(t/${floatLit(DEMO_DRUM_BAR_SEC)},1.0f); if(${prefix}Ph<0.0f) ${prefix}Ph+=1.0f;`,
    `bool ${prefix}Kick=${prefix}Ph<${share}, ${prefix}Snare=${prefix}Ph>=0.5f&&${prefix}Ph<${floatLit(0.5 + DEMO_DRUM_HIT_SHARE)};`,
  ]
}
