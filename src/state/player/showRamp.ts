// One interpolation for a ramped show channel.
//
// SET_SPEED, SET_BRIGHTNESS, SET_ENERGY and SET_PARAM may carry rampMs. At the
// instant the ramp starts the value is still the one already in force. A
// missing or zero ramp lands on the new value immediately. The performance
// player's sampleRamp copies this.

export interface RampSpan {
  from: number
  to: number
  t: number
  rampMs: number
}

/** The value of one ramp at `at` milliseconds. No span returns `held`. */
export function rampValue(span: RampSpan | null, held: number, at: number): number {
  if (!span) return held
  if (!(span.rampMs > 0)) return span.to
  if (at <= span.t) return span.from
  if (at >= span.t + span.rampMs) return span.to
  const progress = (at - span.t) / span.rampMs
  return span.from + (span.to - span.from) * progress
}

export interface RampChannel {
  held: number
  span: RampSpan | null
}

export function blankRampChannel(held: number): RampChannel {
  return { held, span: null }
}

/** Fold one event into a channel. `from` is whatever was in force at `t`. */
export function applyRamp(channel: RampChannel, t: number, to: number, rampMs: number): void {
  const from = rampValue(channel.span, channel.held, t)
  const ramp = Number.isFinite(rampMs) && rampMs > 0 ? rampMs : 0
  channel.span = { from, to, t, rampMs: ramp }
  channel.held = to
}

export function channelAt(channel: RampChannel, at: number): number {
  return rampValue(channel.span, channel.held, at)
}

/**
 * The C++ twin, pasted into a performance player that actually uses a ramp.
 * Sampling stays a method. A free function would be prototyped by Arduino
 * above this definition, before the type exists.
 */
export function sampleRampCpp(): string {
  return [
    '// showRamp.ts: progress 0 returns from, a zero ramp returns to.',
    'struct ShowRamp {',
    '  float from; float to; uint32_t t; uint32_t rampMs;',
    '  float sample(uint32_t at) const {',
    '    if (rampMs == 0) return to;',
    '    if (at <= t) return from;',
    '    if (at >= t + rampMs) return to;',
    '    float p = (float)(at - t) / (float)rampMs;',
    '    return from + (to - from) * p;',
    '  }',
    '  void begin(uint32_t at, float next, float duration) {',
    '    float held = sample(at);',
    '    from = held;',
    '    to = next;',
    '    t = at;',
    '    rampMs = duration > 0.0f ? (uint32_t)duration : 0;',
    '  }',
    '};',
  ].join('\n')
}
