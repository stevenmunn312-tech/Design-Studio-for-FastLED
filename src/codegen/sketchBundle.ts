// A sketch that is more than one file, carried as one string.
//
// The show sketch keeps each pattern in its own header beside a small
// controller `.ino`. Everywhere the app handles a sketch — the deploy popup,
// View Code, Export .ino, the capacity meter, the upload store — it handles one
// string, so the headers travel inside that string as marked blocks:
//
//   // ==== file: pattern_0.h ====
//   void render_p0(uint32_t ms) { ... }
//   // ==== end: pattern_0.h ====
//
// The marked text is a valid single-file sketch as it stands (the markers are
// comments), which is what View Code shows and Export .ino downloads. At the
// helper boundary `splitSketchBundle` turns each block into its own file and
// leaves an `#include "pattern_0.h"` in its place, so the compiled folder is
// the controller plus one header per pattern. `flattenSketchBundle` is the
// inverse, for anything that has the files and wants the one-file form back.

export interface SketchBundle {
  /** The controller sketch, with an `#include "<name>"` where each file was. */
  ino: string
  /** Sibling files by name, written beside the `.ino` in the sketch folder. */
  files: Record<string, string>
}

/** A header name the helper will write beside the sketch: one path segment. */
export const SKETCH_FILE_NAME = /^[A-Za-z0-9_][A-Za-z0-9_-]*\.h$/

const OPEN = /^\/\/ ==== file: (\S+) ====$/
const CLOSE = (name: string) => `// ==== end: ${name} ====`

/** Wrap `body` as a file block for `name`, to be emitted into a sketch. */
export function sketchFileBlock(name: string, body: string): string {
  if (!SKETCH_FILE_NAME.test(name)) throw new Error(`not a sketch file name: ${name}`)
  return `// ==== file: ${name} ====\n${body.replace(/\n$/, '')}\n${CLOSE(name)}`
}

/**
 * The files inside a marked sketch, and the controller with an include where
 * each one was. A sketch with no blocks is its own `ino` with no files. A block
 * whose name is not a plain header name, or that never closes, is left in the
 * text untouched: it is a comment there, and compiling it as one file is
 * always correct.
 */
export function splitSketchBundle(code: string): SketchBundle {
  const files: Record<string, string> = {}
  const out: string[] = []
  const lines = code.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const open = OPEN.exec(lines[i])
    const name = open?.[1]
    if (!name || !SKETCH_FILE_NAME.test(name) || name in files) { out.push(lines[i]); continue }
    const close = lines.indexOf(CLOSE(name), i + 1)
    if (close < 0) { out.push(lines[i]); continue }
    files[name] = `${lines.slice(i + 1, close).join('\n')}\n`
    out.push(`#include "${name}"`)
    i = close
  }
  return { ino: out.join('\n'), files }
}

/** The one-file form: each `#include "<name>"` of a bundled file becomes its block. */
export function flattenSketchBundle(bundle: SketchBundle): string {
  return bundle.ino.split('\n').map((line) => {
    const include = /^#include "([^"]+)"$/.exec(line)
    const name = include?.[1]
    if (!name || !(name in bundle.files)) return line
    return sketchFileBlock(name, bundle.files[name])
  }).join('\n')
}
