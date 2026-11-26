// The line protocol a Debug diagnostic sketch prints over serial:
//
//   FLS_DBG v=1 probe=analog raw=2048 min=12 max=4090 adcMax=4095
//
// Key=value pairs after the marker, unknown keys kept, so a newer sketch can
// add fields without breaking an older reader. Bare numbers parse as numbers;
// quoted values and anything else stay text. Sketches print from loop() only, rate-limited.

export const DEBUG_MARKER = 'FLS_DBG'
export const DEBUG_PROTOCOL_VERSION = 1

export type DebugFields = Readonly<Record<string, number | string>>

export interface DebugLine {
  probe: string
  fields: DebugFields
}

const TOKEN = /([A-Za-z][A-Za-z0-9_]*)=("[^"]*"|\S*)/g

/** A parsed diagnostic line, or null for anything else on the serial port. */
export function parseDebugLine(line: string): DebugLine | null {
  const start = line.indexOf(DEBUG_MARKER)
  if (start < 0) return null
  const rest = line.slice(start + DEBUG_MARKER.length)
  if (rest.length > 0 && !/^\s/.test(rest)) return null
  const fields: Record<string, number | string> = {}
  for (const match of rest.matchAll(TOKEN)) {
    // A quoted value is always text, so a list such as found="3C,68" stays one.
    if (match[2].startsWith('"')) {
      fields[match[1]] = match[2].slice(1, -1)
      continue
    }
    const raw = match[2]
    fields[match[1]] = raw !== '' && Number.isFinite(Number(raw)) ? Number(raw) : raw
  }
  if (fields.v !== DEBUG_PROTOCOL_VERSION || typeof fields.probe !== 'string' || fields.probe === '') return null
  const probe = fields.probe as string
  delete fields.v
  delete fields.probe
  return { probe, fields }
}
