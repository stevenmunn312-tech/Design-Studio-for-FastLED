// Tokens of a field block that mention `_x` without reading the pixel column
// as a coordinate: the loop header.
const KEEP = [/int _x ?= ?0/g, /_x ?< ?WIDTH/g, /_x\+\+/g]

// `field[_y*WIDTH+_x]=EXPR;` with any closing braces that follow on the line.
const WRITE = /^(\s*)(\S+)\[(_y ?\* ?WIDTH ?\+ ?_x)\] ?= ?(.*?);(\}*)\s*$/

/**
 * The shifted, blending second pass of a field block: every read of the pixel
 * column `_x` moves a canvas width right, and the write to `field` blends the
 * shifted value into what the first pass left there. See `wrapXBlockLines`.
 */
export function wrapXShiftLines(lines: string[], field: string): string[] {
  return lines.map((line) => {
    const write = WRITE.exec(line)
    if (write && write[2] === field) {
      const [, indent, , index, expr, braces] = write
      return `${indent}${field}[${index}]=_wrapXMix(${field}[${index}],${shiftReads(expr)},_x);${braces}`
    }
    return shiftReads(line)
  })
}

function shiftReads(text: string): string {
  const held: string[] = []
  let out = text
  for (const pattern of KEEP) out = out.replace(pattern, (m) => { held.push(m); return `@@${held.length - 1}@@` })
  out = out.replace(/(?<![A-Za-z0-9_])_x(?![A-Za-z0-9_])/g, '(_x+WIDTH)')
  return out.replace(/@@(\d+)@@/g, (_, i) => held[Number(i)])
}
