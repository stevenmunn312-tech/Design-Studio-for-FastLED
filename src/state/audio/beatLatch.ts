/**
 * The engines report a beat on the one animation frame it lands on, while
 * the evaluator samples the stores at the Board's frame rate, so at 30 fps
 * about every other beat was overwritten by the next frame's `false` before
 * any pass read it. A store keeps a beat raised until an evaluation pass
 * consumes it (`consumeLiveBeats` in liveAudioSignal.ts); a source that goes
 * inactive drops the latch with the rest of its signal.
 */
export function latchBeat(held: boolean, data: { active: boolean; beat: boolean }): boolean {
  return data.beat || (data.active && held)
}
