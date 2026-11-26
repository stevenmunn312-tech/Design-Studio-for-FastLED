import { describe, expect, it } from 'vitest'
import { parseDebugLine } from '../debugProtocol'

describe('Debug diagnostic protocol', () => {
  it('parses numbers and text, and keeps unknown keys', () => {
    expect(parseDebugLine('FLS_DBG v=1 probe=analog raw=2048 min=12 max=4090 adcMax=4095 note="wiper ok" extra=yes')).toEqual({
      probe: 'analog',
      fields: { raw: 2048, min: 12, max: 4090, adcMax: 4095, note: 'wiper ok', extra: 'yes' },
    })
  })

  it('keeps quoted values as text, even when they look like numbers', () => {
    expect(parseDebugLine('FLS_DBG v=1 probe=i2c found="68" count=1')?.fields).toEqual({ found: '68', count: 1 })
    expect(parseDebugLine('FLS_DBG v=1 probe=i2c found="" count=0')?.fields).toEqual({ found: '', count: 0 })
  })

  it('tolerates a prefix and a carriage return from the serial stream', () => {
    expect(parseDebugLine('\u0000junk FLS_DBG v=1 probe=digital level=1\r')?.fields).toEqual({ level: 1 })
  })

  it('ignores every other line and other protocol versions', () => {
    expect(parseDebugLine('FLS_STAT fps=60')).toBeNull()
    expect(parseDebugLine('FLS_DBGX v=1 probe=analog')).toBeNull()
    expect(parseDebugLine('FLS_DBG v=2 probe=analog raw=1')).toBeNull()
    expect(parseDebugLine('FLS_DBG v=1 raw=1')).toBeNull()
    expect(parseDebugLine('rst:0x1 (POWERON_RESET)')).toBeNull()
  })
})
