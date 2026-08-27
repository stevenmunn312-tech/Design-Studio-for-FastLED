import { describe, it, expect } from 'vitest'
import { generatePlayerSketch } from '../playerSketchGenerator'
import { playerDisplaysFromGraph } from '../playerDisplays'

const master = { id: 'master', data: { nodeType: 'PatternMaster', properties: {} } }
const oled = {
  id: 'oled',
  data: {
    nodeType: 'InfoDisplay',
    properties: {
      partId: 'sh1106-oled-128x64', infoLayout: 'Now Playing', oledRotation: '0',
      csPin: 1, dcPin: 2, resetPin: 5, sckPin: 6, mosiPin: 7,
    },
  },
}
const wire = (source: string, sourceHandle: string, target: string, targetHandle: string) =>
  ({ source, target, sourceHandle, targetHandle })

describe('displays in the player sketch', () => {
  /*
   * The scenario the whole feature exists for: a finished build, a card of
   * music the app has never seen, and a panel showing what is playing. Before
   * this the display was simply absent from the player sketch.
   */
  const nodes = [master, oled]
  const edges = [
    wire('master', 'title', 'oled', 'title'),
    wire('master', 'artist', 'oled', 'line2'),
    wire('master', 'elapsed', 'oled', 'value'),
    wire('master', 'progress', 'oled', 'progress'),
    wire('master', 'playing', 'oled', 'playing'),
    wire('master', 'volume', 'oled', 'volume'),
  ]

  it('resolves each wire to what the player reads on device', () => {
    const displays = playerDisplaysFromGraph(nodes, edges)
    expect(displays.info).toHaveLength(1)
    expect(displays.info[0].sources).toMatchObject({
      title: 'songTitle',
      line2: 'songArtist',
      value: 'songElapsedSec()',
      progress: 'songProgress()',
      playing: 'songPlaying()',
    })
    expect(displays.unresolved).toEqual([])
  })

  it('emits the driver, the setup and the loop', () => {
    const displays = playerDisplaysFromGraph(nodes, edges)
    const sketch = generatePlayerSketch({}, undefined, { displays })
    expect(sketch).toContain('static OledPanel _oled_oled;')
    expect(sketch).toContain('_oledBeginSpi(_oled_oled, 1, 2, 5, 6, 7, 2, 0xa0, 0xc0);')
    expect(sketch).toContain('_oledFlush(_oled_oled,')
  })

  /*
   * The player sketch draws displays too, and it had no I2C bus at all — so a
   * 4-pin panel here would have emitted a call to a Wire nothing included and
   * nothing started. Teaching one generator and not the other is the mistake
   * this build has already made once.
   */
  describe('a 4-pin panel', () => {
    const bus = {
      id: 'oled',
      data: {
        nodeType: 'InfoDisplay',
        properties: {
          partId: 'ssd1306-oled-128x64', infoLayout: 'Now Playing', oledRotation: '0',
          sdaPin: 21, sclPin: 22, i2cAddress: '0x3D',
        },
      },
    }
    const sketch = () => generatePlayerSketch({}, undefined, {
      displays: playerDisplaysFromGraph([master, bus], edges),
    })

    it('resolves as I2C rather than as four wires', () => {
      const displays = playerDisplaysFromGraph([master, bus], edges)
      expect(displays.info[0]).toMatchObject({ transport: 'i2c', address: 0x3d, sdaPin: 21, sclPin: 22 })
    })

    it('brings in Wire, starts it, and begins the panel on it', () => {
      const src = sketch()
      expect(src).toContain('#include <Wire.h>')
      expect(src).toContain('Wire.begin(21, 22);')
      expect(src).toContain('_oledBeginI2c(_oled_oled, 0x3d, 0, 0xa0, 0xc0);')
      // The call, not the driver's definition of it, which sits far above.
      expect(src.indexOf('Wire.begin(21, 22);'))
        .toBeLessThan(src.indexOf('_oledBeginI2c(_oled_oled'))
    })

    // Declared, not started — see the matching note in infoDisplayCpp.test.ts.
    // The player generator had the same gating and the same latent failure.
    it('declares Wire but does not start it for an SPI panel', () => {
      const src = generatePlayerSketch({}, undefined, {
        displays: playerDisplaysFromGraph(nodes, edges),
      })
      expect(src).toContain('#include <Wire.h>')
      // The call, not the driver comment that mentions it.
      expect(src).not.toMatch(/^\s*Wire\.begin\(/m)
    })
  })

  it('reads the track tags the file carried', () => {
    const displays = playerDisplaysFromGraph(nodes, edges)
    const sketch = generatePlayerSketch({}, undefined, { displays })
    expect(sketch).toContain('void audio_id3data(const char *info)')
    expect(sketch).toContain('void audio_bitrate(const char *info)')
    expect(sketch).toContain('_oledFit(_oledBuf_oled, sizeof(_oledBuf_oled), songTitle,')
    expect(sketch).toContain('songArtist')
  })

  // A file with no artist tag never calls back, and without the reset it would
  // wear the previous track's artist.
  it('clears the tags when a track opens', () => {
    const sketch = generatePlayerSketch({}, undefined, { displays: playerDisplaysFromGraph(nodes, edges) })
    expect(sketch).toContain('static void songReset(const char *fallbackTitle)')
    /*
     * The invariant, rather than a count: every path that opens a track clears
     * the tags first. Which paths a given sketch contains depends on its
     * options, so counting call sites would just track the template.
     */
    const opens = sketch.split('audio.connecttoFS(').length - 1
    const resets = sketch.split('songResetFromFile(').length - 2   // less the definition
    expect(opens).toBeGreaterThan(0)
    expect(resets).toBe(opens)
  })

  // A file with no tags still has a name, and a name beats a blank row.
  it('falls back to the filename without its extension', () => {
    const sketch = generatePlayerSketch({}, undefined, { displays: playerDisplaysFromGraph(nodes, edges) })
    expect(sketch).toContain("char *dot = strrchr(base, '.');")
  })

  it('does not call the reset when there is no display to show it', () => {
    const sketch = generatePlayerSketch({}, undefined, {})
    expect(sketch).not.toContain('songResetFromFile')
  })

  it('leaves the driver out of a player sketch with no display', () => {
    const sketch = generatePlayerSketch({}, undefined, {})
    expect(sketch).not.toContain('OledPanel')
    expect(sketch).not.toContain('audio_id3data')
  })

  it('drives a segment display from the player too', () => {
    const seg = {
      id: 'seg',
      data: {
        nodeType: 'SegmentDisplay',
        properties: { partId: 'tm1637-4digit-display', segmentMode: 'Number', clkPin: 18, dioPin: 19 },
      },
    }
    const displays = playerDisplaysFromGraph([master, seg], [wire('master', 'elapsed', 'seg', 'value')])
    const sketch = generatePlayerSketch({}, undefined, { displays })
    expect(sketch).toContain('static SegDisplay _seg_seg;')
    expect(sketch).toContain('_segNumber(_segBuf_seg, 4, songElapsedSec()')
  })

  /*
   * The player runs a fixed template, so a display fed from a Wave has nothing
   * to read here. Naming it is what stops the sketch building successfully with
   * a panel wired to something it will never show.
   */
  it('reports a port it cannot honour rather than emitting a blank', () => {
    const wave = { id: 'w', data: { nodeType: 'Wave', properties: {} } }
    const displays = playerDisplaysFromGraph([master, oled, wave], [wire('w', 'result', 'oled', 'progress')])
    expect(displays.unresolved).toEqual([{ display: 'oled', port: 'progress', source: 'Wave' }])
  })

  it('honours the mounted rotation', () => {
    const turned = { ...oled, data: { ...oled.data, properties: { ...oled.data.properties, oledRotation: '180' } } }
    const displays = playerDisplaysFromGraph([master, turned], [])
    const sketch = generatePlayerSketch({}, undefined, { displays })
    expect(sketch).toContain('0xa1, 0xc8);')
  })
})
