import { describe, it, expect } from 'vitest'
import { generatePlayerSketch, playerConfigFromGraph } from '../playerSketchGenerator'

describe('playerSketchGenerator', () => {
  describe('serial file receiver', () => {
    const sketch = generatePlayerSketch(playerConfigFromGraph([
      { data: { nodeType: 'MatrixOutput', properties: { width: 16, height: 16 } } },
    ]))

    it('accepts the provisioner wire protocol, so shows reach a flashed board', () => {
      // Folding the receiver in is what removes a whole compile-and-flash cycle
      // from every upload: the board is flashed once and files are pushed to it
      // while it runs.
      expect(sketch).toContain('void provServiceSerial() {')
      expect(sketch).toContain('if (line == "PING") {')
      expect(sketch).toContain('if (line.startsWith("PUT ")) {')
      expect(sketch).toContain('if (line == "END") {')
      expect(sketch).toContain('Serial.println("A");')      // per-block ack
      expect(sketch).toContain('Serial.println("DONE");')
      expect(sketch).toContain('Serial.println("BYE");')
      expect(sketch).toContain('provServiceSerial();')      // called from loop()
    })

    it('bounds every read, so a dropped byte cannot wedge the board', () => {
      // The Adalight stream receiver desynced permanently on one byte lost to
      // FastLED.show()'s interrupts-disabled window, with nothing visible to
      // the host. This sketch drives LEDs too, so an unbounded wait would
      // reproduce that exactly — a timeout costs one transfer instead.
      expect(sketch).not.toContain('while (!Serial.available())')
      expect(sketch).toContain('if (millis() - last > timeoutMs) return String();')
      expect(sketch).toContain('if (millis() - last > PROV_BLOCK_TIMEOUT_MS) {')
      // ...and a host that dies mid-protocol must not leave the board mute.
      expect(sketch).toContain('millis() - provLastCommandMs > PROV_SESSION_TIMEOUT_MS')
    })

    it('sizes the RX buffer before begin(), where the driver reads it', () => {
      const rx = sketch.indexOf('Serial.setRxBufferSize(PROV_RX_BUFFER);')
      expect(rx).toBeGreaterThan(-1)
      expect(rx).toBeLessThan(sketch.indexOf('Serial.begin(115200);'))
    })

    it('resumes playback after a transfer, and stays quiet during one', () => {
      // The card changed underneath the player, so the track has to be picked
      // again — a board that arrived with an empty card would otherwise stay
      // on "no playable track" until power-cycled.
      expect(sketch).toContain('bool startPlayback() {')
      expect(sketch).toMatch(/Serial\.println\("BYE"\);\s*\n\s*startPlayback\(\);/)
      // The heartbeat is line-based like the protocol's own replies, so it
      // must not interleave with them.
      expect(sketch).toContain('if (!provTransferring && millis() - _dbgLast >= 2000) {')
    })
  })

  describe('HUB75 (docs/development/design/hub75-output.md)', () => {
    const hub75Cfg = playerConfigFromGraph([
      { data: { nodeType: 'MatrixOutput', properties: { width: 8, height: 8, chipset: 'HUB75' } } },
    ])

    it('resolves HUB75 props from the MatrixOutput node', () => {
      expect(hub75Cfg.chipset).toBe('HUB75')
      expect(hub75Cfg.hub75Props).toMatchObject({ width: 8, height: 8, chipset: 'HUB75' })
    })

    it('drives the DMA library instead of FastLED addLeds/show, still rendering into leds', () => {
      const sketch = generatePlayerSketch(hub75Cfg)
      expect(sketch).toContain('#include <ESP32-HUB75-MatrixPanel-I2S-DMA.h>')
      expect(sketch).toContain('MatrixPanel_I2S_DMA *dma_display = nullptr;')
      expect(sketch).toContain('HUB75_I2S_CFG _hub75Cfg(8, 8, 1, _hub75Pins);')
      expect(sketch).toContain('dma_display = new MatrixPanel_I2S_DMA(_hub75Cfg);')
      expect(sketch).not.toContain('#define LED_DATA_PIN')
      expect(sketch).not.toContain('FastLED.addLeds<')
      expect(sketch).not.toContain('FastLED.show();')
      // The player's fixed startup brightness (180, overridden live by
      // SET_BRIGHTNESS events) still applies to the HUB75 setup path.
      expect(sketch).toContain('dma_display->setBrightness8(180);')
      // Pattern rendering, transitions, beat flash, and the particle overlay
      // are untouched — still CRGB math into the shared `leds` buffer.
      expect(sketch).toContain('void renderPattern(uint8_t pid, float t)')
      expect(sketch).toContain('compositeTransition(transType, leds, showA, showB, tp);')
      expect(sketch).toContain('for (int _y = 0; _y < HEIGHT; _y++) for (int _x = 0; _x < WIDTH; _x++) {')
      expect(sketch).toContain('dma_display->drawPixelRGB888(_x, _y, _c.r, _c.g, _c.b);')
    })

    it('routes CMD_SET_BRIGHTNESS to dma_display->setBrightness8 instead of FastLED.setBrightness', () => {
      const sketch = generatePlayerSketch(hub75Cfg)
      expect(sketch).toContain('case CMD_SET_BRIGHTNESS: dma_display->setBrightness8((uint8_t)ev.params[0]); break;')
      expect(sketch).not.toContain('FastLED.setBrightness((uint8_t)ev.params[0])')
    })

    it('drives a single-row HUB75 panel chain via chain_length', () => {
      const chainedCfg = playerConfigFromGraph([
        { data: { nodeType: 'MatrixOutput', properties: { width: 24, height: 8, chipset: 'HUB75', layout: 'panels', tilesX: 3, tilesY: 1 } } },
      ])
      const sketch = generatePlayerSketch(chainedCfg)
      expect(sketch).toContain('HUB75_I2S_CFG _hub75Cfg(8, 8, 3, _hub75Pins);')
    })

    it('remaps square-tile per-panel rotation through a HUB75 coord table', () => {
      const rotatedCfg = playerConfigFromGraph([
        { data: { nodeType: 'MatrixOutput', properties: { width: 16, height: 8, chipset: 'HUB75', layout: 'panels', tilesX: 2, tilesY: 1, tileRotations: '0,90' } } },
      ])
      const sketch = generatePlayerSketch(rotatedCfg)
      expect(sketch).toContain('const uint16_t _hub75CoordMap[NUM_LEDS] PROGMEM = {')
      expect(sketch).toContain('dma_display->drawPixelRGB888(_hub75XY & 0xFF, _hub75XY >> 8, _c.r, _c.g, _c.b);')
    })

    it('drives a folded 2D HUB75 panel grid via VirtualMatrixPanel_T', () => {
      const gridCfg = playerConfigFromGraph([
        { data: { nodeType: 'MatrixOutput', properties: { width: 16, height: 16, chipset: 'HUB75', layout: 'panels', tilesX: 2, tilesY: 2 } } },
      ])
      const sketch = generatePlayerSketch(gridCfg)
      expect(sketch).toContain('#include <ESP32-HUB75-VirtualMatrixPanel_T.hpp>')
      expect(sketch).toContain('HUB75_I2S_CFG _hub75Cfg(8, 8, 4, _hub75Pins);')
      expect(sketch).toContain('hub75Virtual = new VirtualMatrixPanel_T<CHAIN_TOP_LEFT_DOWN>(2, 2, 8, 8);')
      // Brightness has no VirtualMatrixPanel_T passthrough (confirmed against
      // the vendored header — it exposes no setBrightness8 of its own), so it
      // always targets the underlying real display, virtual grid or not.
      expect(sketch).toContain('case CMD_SET_BRIGHTNESS: dma_display->setBrightness8((uint8_t)ev.params[0]); break;')
      expect(sketch).toContain('hub75Virtual->drawPixelRGB888(_x, _y, _c.r, _c.g, _c.b);')
    })

    it('remaps rotated tiles before drawing into a folded 2D HUB75 virtual grid', () => {
      const gridCfg = playerConfigFromGraph([
        { data: { nodeType: 'MatrixOutput', properties: { width: 16, height: 16, chipset: 'HUB75', layout: 'panels', tilesX: 2, tilesY: 2, tileRotations: '0,90,180,270' } } },
      ])
      const sketch = generatePlayerSketch(gridCfg)
      expect(sketch).toContain('const uint16_t _hub75CoordMap[NUM_LEDS] PROGMEM = {')
      expect(sketch).toContain('hub75Virtual->drawPixelRGB888(_hub75XY & 0xFF, _hub75XY >> 8, _c.r, _c.g, _c.b);')
    })
  })
})
