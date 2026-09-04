/** One identifier rule for panel, widget and asset symbols, including UUIDs. */
export function customDisplayId(value: string): string {
  const safe = value.replace(/[^A-Za-z0-9_]/g, '_')
  return safe.length > 0 && /^[A-Za-z_]/.test(safe) ? safe : `_${safe}`
}
