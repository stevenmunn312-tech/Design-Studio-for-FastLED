import { describe, expect, it } from 'vitest'
import { generateCpp } from '../cppGenerator'
import { generateShowSketch } from '../showGenerator'
import { generatePlayerSketch, playerConfigFromGraph } from '../playerSketchGenerator'
import { withLedDriver } from '../output/ledDriverCpp'
import { selectableLedDrivers } from '../../build/ledDrivers'
import { NODE_LIBRARY, libraryDefaults } from '../../state/nodeLibrary'
import type { GroupRegistry } from '../../state/graphEvaluator'
import type { StudioEdge, StudioNode } from '../../state/graphStore'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: {
      label: definition?.label ?? nodeType, nodeType, category: definition?.category ?? 'output',
      properties: { ...libraryDefaults(nodeType), ...properties },
      inputs: definition?.inputs ?? [], outputs: definition?.outputs ?? [],
    },
  } as StudioNode
}
const edge = (id: string, source: string, sourceHandle: string, target: string, targetHandle: string) =>
  ({ id, source, sourceHandle, target, targetHandle }) as StudioEdge

const S3 = 'espressif-esp32-s3-devkitc-1'
const ESP32 = 'esp32-generic-devkit-38pin'
const C6 = 'esp32-c6-devkitc-1'
const lcd = selectableLedDrivers('esp32-s3')[0]

function sketch(profileId: string, ledDriver: string, outputs: StudioNode[] = [node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5 })]): string {
  return generateCpp(
    [node('board', 'Board', { profileId, ledDriver }), node('fill', 'SolidColor'), ...outputs],
    outputs.map((output) => edge(`f-${output.id}`, 'fill', 'frame', output.id, 'frame')),
  )
}

describe('withLedDriver', () => {
  const plain = [
    '#include <FastLED.h>',
    'void setup() {',
    '  FastLED.addLeds<WS2812B, DATA_PIN, GRB>(leds, NUM_LEDS);',
    '  CLEDController& controller_b = FastLED.addLeds<SK6812, DATA_PIN_b, RGB>(leds_b, 40, 60).setRgbw(RgbwDefault());',
    '  FastLED.addLeds<NEOPIXEL, VU_LEFT_PIN_vu>(_vuLeft_vu, VU_LEDS_vu);',
    '  FastLED.addLeds<APA102, DATA_PIN_c, CLOCK_PIN_c, BGR>(leds_c, 30);',
    '  FastLED.addLeds<WS2816, DATA_PIN_d, GRB>(leds_d, 10);',
    '}',
  ].join('\n')

  it('leaves a sketch untouched for auto', () => {
    expect(withLedDriver(plain, null)).toBe(plain)
  })

  it('includes the traits header, selects the bus before the first output and rebuilds clockless outputs on it', () => {
    const out = withLedDriver(plain, lcd).split('\n')
    expect(out[1]).toBe('#include "platforms/esp/32/drivers/lcd_spi/bus_traits.h"  // BusTraits<fl::Bus::FLEX_IO, 0>, the Board\'s LED driver')
    const exclusive = out.indexOf('  FastLED.setExclusiveDriver<fl::Bus::FLEX_IO, 0>();')
    expect(exclusive).toBeGreaterThan(out.indexOf('void setup() {'))
    expect(out.findIndex((line) => line.includes('_ledChannel0'))).toBeGreaterThan(exclusive)
    expect(out).toContain('  _ledDriverOptions.mBus = fl::Bus::FLEX_IO;')
    expect(out).toContain('  _ledDriverOptions.mBusWhich = 0;')
    expect(out).toContain('  fl::ChannelPtr _ledChannel0 = fl::TypedChannel<fl::Bus::FLEX_IO, fl::ClocklessChipset, 0>::create(fl::ChannelConfig(fl::makeClockless<fl::TIMING_WS2812_800KHZ>(DATA_PIN), fl::span<CRGB>(leds, NUM_LEDS), GRB, _ledDriverOptions));')
    expect(out).toContain('  FastLED.add(_ledChannel0);')
    // Offset form, RGBW and a named controller keep their meaning.
    expect(out).toContain('  fl::ChannelPtr _ledChannel1 = fl::TypedChannel<fl::Bus::FLEX_IO, fl::ClocklessChipset, 0>::create(fl::ChannelConfig(fl::makeClockless<fl::TIMING_SK6812>(DATA_PIN_b), fl::span<CRGB>(leds_b + (40), 60), RGB, _ledDriverOptions));')
    expect(out).toContain('  _ledChannel1->setRgbw(RgbwDefault());')
    expect(out).toContain('  CLEDController& controller_b = *_ledChannel1;')
    // NEOPIXEL is GRB with no order argument.
    expect(out.join('\n')).toContain('fl::makeClockless<fl::TIMING_WS2812_800KHZ>(VU_LEFT_PIN_vu), fl::span<CRGB>(_vuLeft_vu, VU_LEDS_vu), GRB,')
    // Clocked and 16-bit outputs keep their addLeds line.
    expect(out).toContain('  FastLED.addLeds<APA102, DATA_PIN_c, CLOCK_PIN_c, BGR>(leds_c, 30);')
    expect(out).toContain('  FastLED.addLeds<WS2816, DATA_PIN_d, GRB>(leds_d, 10);')
    expect(out.filter((line) => line.includes('setExclusiveDriver'))).toHaveLength(1)
  })

  it('rebuilds every data lane, selecting the bus before the first lane', () => {
    const lanes = [
      '#include <FastLED.h>',
      'void setup() {',
      '  FastLED.addLeds<WS2812B, DATA_PIN, GRB>(leds, 0, NUM_LEDS / 2);  // lane 1',
      '  FastLED.addLeds<WS2812B, 5, GRB>(leds, 1 * (NUM_LEDS / 2), NUM_LEDS / 2);  // lane 2',
      '}',
    ].join('\n')
    const out = withLedDriver(lanes, lcd).split('\n')
    expect(out.indexOf('  FastLED.setExclusiveDriver<fl::Bus::FLEX_IO, 0>();')).toBe(4)
    expect(out).toContain('  fl::ChannelPtr _ledChannel1 = fl::TypedChannel<fl::Bus::FLEX_IO, fl::ClocklessChipset, 0>::create(fl::ChannelConfig(fl::makeClockless<fl::TIMING_WS2812_800KHZ>(5), fl::span<CRGB>(leds + (1 * (NUM_LEDS / 2)), NUM_LEDS / 2), GRB, _ledDriverOptions));  // lane 2')
    expect(out.join('\n')).not.toContain('FastLED.addLeds<')
  })

  it('rebuilds the lanes the generator emits for a split output', () => {
    const source = sketch(S3, 'LCD_CLOCKLESS', [node('out', 'MatrixOutput', { form: 'strip', ledCount: 400, dataPin: 4, dataLanes: 4, lanePins: [5, 6, 7] })])
    expect(source.match(/FastLED\.add\(_ledChannel\d\);/g)).toHaveLength(4)
    expect(source).not.toContain('FastLED.addLeds<')
    expect(source.indexOf('setExclusiveDriver')).toBeLessThan(source.indexOf('_ledChannel0'))
  })

  it('adds nothing to a sketch with no clockless output for the driver', () => {
    const clocked = '#include <FastLED.h>\nvoid setup() {\n  FastLED.addLeds<APA102, DATA_PIN, CLOCK_PIN, BGR>(leds, 30);\n}'
    expect(withLedDriver(clocked, lcd)).toBe(clocked)
    expect(withLedDriver('#include <FastLED.h>\nvoid setup() {}', lcd)).toBe('#include <FastLED.h>\nvoid setup() {}')
  })

  it('selects the classic ESP32 I2S engine as FLEX_IO 0, not the define 3.10.8 removed', () => {
    const out = withLedDriver(plain, selectableLedDrivers('esp32')[0]).split('\n')
    expect(out[1]).toBe('#include "platforms/esp/32/drivers/i2s_spi/bus_traits.h"  // BusTraits<fl::Bus::FLEX_IO, 0>, the Board\'s LED driver')
    expect(out).toContain('  FastLED.setExclusiveDriver<fl::Bus::FLEX_IO, 0>();')
    expect(out.join('\n')).not.toContain('FASTLED_ESP32_I2S')
    expect(out.join('\n')).not.toContain('FastLED.addLeds<WS2812B')
  })
})

describe('the Board LED driver in every generator', () => {
  it('emits nothing for auto in a normal sketch', () => {
    const source = sketch(S3, 'auto')
    expect(source).not.toContain('setExclusiveDriver')
    expect(source).not.toContain('FASTLED_ESP32_I2S')
    expect(source).toBe(sketch(S3, ''))
  })

  it('emits the chosen driver in a normal sketch, multi-output included', () => {
    const one = sketch(S3, 'LCD_CLOCKLESS')
    expect(one).toContain('FastLED.setExclusiveDriver<fl::Bus::FLEX_IO, 0>();')
    expect(one).not.toMatch(/FastLED\.addLeds<WS2812B/)
    const two = sketch(S3, 'LCD_CLOCKLESS', [
      node('a', 'MatrixOutput', { form: 'strip', ledCount: 100, dataPin: 5 }),
      node('b', 'MatrixOutput', { form: 'strip', ledCount: 100, dataPin: 6 }),
    ])
    expect(two.match(/FastLED\.add\(_ledChannel\d\);/g)).toHaveLength(2)
    expect(two.match(/setExclusiveDriver/g)).toHaveLength(1)
    expect(sketch(C6, 'RMT')).toContain('#include "platforms/esp/32/drivers/rmt/rmt_5/bus_traits.h"')
    expect(sketch(C6, 'RMT')).toContain('FastLED.setExclusiveDriver<fl::Bus::RMT, 0>();')
    expect(sketch(ESP32, 'I2S')).toContain('#include "platforms/esp/32/drivers/i2s_spi/bus_traits.h"')
  })

  it('never lets a driver the board does not offer reach C++', () => {
    expect(sketch(ESP32, 'LCD_CLOCKLESS')).not.toContain('fl::Bus::')
    expect(sketch(S3, 'PARLIO')).not.toContain('fl::Bus::')
    expect(sketch(S3, 'RMT>(); evil(); //')).not.toContain('evil')
  })

  it('emits the chosen driver in a show sketch', () => {
    const solid = { nodes: [node('c', 'SolidColor'), Object.assign(node('go', 'GroupOutput'), {})], edges: [edge('f', 'c', 'frame', 'go', 'frame')] }
    solid.nodes[1].data.inputs = [{ id: 'frame', label: 'Frame', dataType: 'frame' }]
    const groups = { solid } as unknown as GroupRegistry
    const show = generateShowSketch([
      node('board', 'Board', { profileId: S3, ledDriver: 'LCD_CLOCKLESS' }),
      node('pc', 'PatternCollection', { patternIds: ['solid'] }),
      node('master', 'PatternMaster'),
      node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5 }),
    ], [
      edge('set', 'pc', 'patternset', 'master', 'patternset'),
      edge('frame', 'master', 'frame', 'out', 'frame'),
    ], groups)
    expect(show).toContain('FastLED.setExclusiveDriver<fl::Bus::FLEX_IO, 0>();')
    expect(show).toContain('FastLED.add(_ledChannel0);')
  })

  it('emits the chosen driver in a player sketch, from the graph', () => {
    const nodes = [
      node('board', 'Board', { profileId: S3, ledDriver: 'LCD_CLOCKLESS' }),
      node('master', 'PatternMaster'),
      node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5 }),
    ]
    const config = playerConfigFromGraph(nodes, [edge('frame', 'master', 'frame', 'out', 'frame')], 'esp32:esp32:esp32s3')
    expect(config.ledDriver?.bus).toBe('LCD_CLOCKLESS')
    const player = generatePlayerSketch(config)
    expect(player).toContain('FastLED.setExclusiveDriver<fl::Bus::FLEX_IO, 0>();')
    expect(player).toContain('#include "platforms/esp/32/drivers/lcd_spi/bus_traits.h"')
    expect(generatePlayerSketch({ ...config, ledDriver: null })).not.toContain('setExclusiveDriver')
  })
})
