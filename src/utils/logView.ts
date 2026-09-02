/**
 * What the Output console shows when "Verbose" is off.
 *
 * A single ESP32 build prints thousands of lines, and almost all of them are
 * the toolchain talking to itself: deprecation `#warning`s from the core's own
 * headers, `In file included from …` chains, the caret-and-tilde art under each
 * one. None of it is about the user's design, and it buries the handful of
 * lines that are — the phase markers, the size report, the progress, the
 * failure.
 *
 * Filtering is display-only: `uploadStore.log` keeps every byte, so ticking
 * Verbose reveals the same run rather than requiring another.
 *
 * The one rule that matters: **nothing that could be a failure is ever hidden.**
 * A condensed view that swallowed an error would be worse than no filter at
 * all, so anything carrying an error marker survives regardless of shape.
 */

/** Lines that always survive, whatever else they look like. */
const ALWAYS_KEEP = /error|\*\*\*|\[size|\[time\]|\[waiting\]|\[retry\]|\[engine-gap\]|exit code|^\s*===|^\$ /i

/** Toolchain noise: the diagnostic itself, and the source echo beneath it. */
const NOISE = [
  /^In file included from /,
  /\bwarning:/,
  /\bnote:/,
  // `   62 | FASTLED_FORCE_INLINE void …` — the echoed source line.
  /^\s*\d+\s*\|/,
  // `      |                    ^~~~~~~` — the caret art under it.
  /^\s*\|/,
  /^\s*\^[~\s]*$/,
  // Continuation of a multi-line #warning string.
  /^\s+\|\s/,
]

/** A tool redrawing progress in place — only the newest one is worth a line. */
// esptool v5 prints a bar rather than v4's `(42 %)`, and — because our pipe is
// not a TTY — ends every redraw with a newline instead of a carriage return.
// So an unrecognised format is not just a missing percentage in the status
// line, it is hundreds of real lines filling the console.
const PROGRESS = /\((\d+)\s*%\)|\]\s*[\d.]+%|^(Receiving|Resolving|Counting|Compressing) objects:|^Compiled \d+\/\d+ files/

function isProgress(line: string): boolean {
  return PROGRESS.test(line)
}

export interface CondensedLog {
  text: string
  /** How many lines the condensed view is holding back, for the toggle's label. */
  hidden: number
}

/**
 * Drop toolchain noise and collapse runs of progress redraws to the last one,
 * reporting both the text and how much was withheld.
 *
 * One pass, because this runs on every streamed chunk of a build log that can
 * reach megabytes — filtering once for the text and again to count would double
 * that work for a number shown next to a checkbox.
 */
export function condenseLogView(log: string, verbose: boolean): CondensedLog {
  if (verbose || !log) return { text: log, hidden: 0 }
  const lines = log.split('\n')
  const kept: string[] = []
  for (const line of lines) {
    if (ALWAYS_KEEP.test(line)) {
      kept.push(line)
      continue
    }
    if (NOISE.some((pattern) => pattern.test(line))) continue
    // Successive redraws of the same counter are one fact, not twenty. Replace
    // rather than append, so the console shows where the tool is now.
    if (isProgress(line) && kept.length > 0 && isProgress(kept[kept.length - 1])) {
      kept[kept.length - 1] = line
      continue
    }
    kept.push(line)
  }
  // Collapse the blank runs left where a diagnostic block used to be.
  const text = kept.join('\n').replace(/\n{3,}/g, '\n\n')
  return { text, hidden: Math.max(0, lines.length - kept.length) }
}

/** The condensed text alone, for callers with no use for the count. */
export function condenseLog(log: string, verbose: boolean): string {
  return condenseLogView(log, verbose).text
}
