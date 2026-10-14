/**
 * The frame pacing at the end of every sketch's loop(): FastLED.delay for
 * the Board's frame-rate cap. One helper, so the normal sketch, a show
 * controller and the player all honour the same Board property, and the
 * preview's own gate (LEDPreview) reads the same setting.
 */
import { FRAME_RATE } from '../build/controllerSettings'

function clampFps(frameRate: number): number {
  return Math.max(FRAME_RATE.min, Math.min(FRAME_RATE.max, Number.isFinite(frameRate) ? frameRate : FRAME_RATE.default))
}

/** Whole milliseconds, floored: 60 fps is the 16 ms every sketch always had. */
export function loopPacingMs(frameRate: number): number {
  return Math.max(1, Math.floor(1000 / clampFps(frameRate)))
}

export function loopPacingCpp(frameRate: number): string {
  return `  FastLED.delay(${loopPacingMs(frameRate)});  // ~${Math.round(clampFps(frameRate))} fps`
}

/** Whether a sketch line is the pacing delay (any frame rate). */
export function isLoopPacing(line: string): boolean {
  return /^ {2}FastLED\.delay\(\d+\);\s+\/\/ ~\d+ fps$/.test(line)
}

/** The same pacing without FastLED, for a sketch that never draws an LED. */
export function plainPacing(line: string): string {
  return line.replace('FastLED.delay', 'delay')
}
