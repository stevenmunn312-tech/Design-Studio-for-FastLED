import { describe, expect, it } from 'vitest'
import { boardName, loadSupportMatrixSummary, summarizeSupportMatrix } from '../supportMatrix'

const MATRIX = `# Beta Support Matrix

## Supported end-to-end combo

| Status | Host OS | Board | Chipset |
| --- | --- | --- | --- |
| Supported | Windows 11 | ESP32-S3 (OPI PSRAM enabled) + INMP441 | WS2812B |
| Supported | Windows 11 | ESP8266 | WS2812B |
| Experimental | Windows 11 | Teensy 4.1 | WS2812B |

These are the only fully recorded public-beta support rows today.

## Auxiliary display hardware validation

| Status | Host OS | Board | Display module (bus) |
| --- | --- | --- | --- |
| Supported | Windows 11 | ESP32-S3 | SSD1306 |

## Experimental until validated
`

describe('summarizeSupportMatrix', () => {
  it('counts the Supported rows of each table and names their boards once', () => {
    expect(summarizeSupportMatrix(MATRIX)).toEqual({
      ledRows: 2,
      displayRows: 1,
      boards: ['ESP32-S3', 'ESP8266'],
    })
  })

  it('reduces a board cell to the board', () => {
    expect(boardName('ESP32-S3 (OPI PSRAM enabled) + INMP441')).toBe('ESP32-S3')
    expect(boardName('Classic ESP-32D DevKit v1 (30-pin, ESP32-WROOM-32D, no PSRAM)')).toBe('Classic ESP-32D DevKit v1')
    expect(boardName('ESP32-S3 + microSD + MAX98357A')).toBe('ESP32-S3')
  })

  // Help derives its paragraph from the real matrix, so the real matrix has to
  // parse: a renamed heading or a reshaped table would silently empty Help.
  it('reads the repository matrix', async () => {
    const summary = await loadSupportMatrixSummary()
    expect(summary.ledRows).toBeGreaterThan(10)
    expect(summary.displayRows).toBeGreaterThan(5)
    expect(summary.boards).toContain('ESP32-S3')
    expect(summary.boards).toContain('ESP8266')
  })
})
