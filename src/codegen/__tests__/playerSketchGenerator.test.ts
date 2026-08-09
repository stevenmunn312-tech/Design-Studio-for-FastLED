import { describe, it, expect } from 'vitest'
import { generatePlayerSketch, playerConfigFromGraph } from '../playerSketchGenerator'

describe('playerSketchGenerator', () => {
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
  })
})
