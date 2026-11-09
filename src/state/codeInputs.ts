/**
 * The Code node's A and B, as the names `a` and `b` its loop reads.
 *
 * Both sides bind them in a block around the pasted loop body, so a loop
 * that declares its own `a` shadows the input rather than clashing with it.
 * A Global section that already uses `a` or `b` is a different case: binding
 * there would quietly turn the loop's `a++` from the user's own variable into
 * a write to a local copy of A. So a name the Global section mentions stays
 * the user's, and only the other is bound. The test reads the raw C++ with
 * comments and string literals removed, and the preview and the sketch ask
 * the same function, so they always bind the same names.
 */
export type CodeInputName = 'a' | 'b'

const CODE_INPUT_NAMES: readonly CodeInputName[] = ['a', 'b']

function withoutCommentsAndStrings(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/"(?:\\.|[^"\\\n])*"/g, '""')
    .replace(/'(?:\\.|[^'\\\n])*'/g, "''")
}

/** The input names the loop gets: those the Global section does not use itself. */
export function codeInputNames(globalCode: string): CodeInputName[] {
  const code = withoutCommentsAndStrings(globalCode)
  return CODE_INPUT_NAMES.filter((name) => !new RegExp(`\\b${name}\\b`).test(code))
}
