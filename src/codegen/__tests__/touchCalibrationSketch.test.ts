import { describe, it, expect } from 'vitest'
import {
  generateTouchCalibrationSketch,
  touchCalibrationTargetFor,
} from '../touchCalibrationSketch'
import { CYD_TOUCH_DISPLAY } from '../../state/integratedBoardHardware'
import { tftControllerForProps } from '../../state/nodeLibrary'
import { asTftRotation, TFT_CONTROLLERS } from '../../state/tftSurface'
import { NO_PIN } from '../../state/boardGpio'

const CYD = CYD_TOUCH_DISPLAY.panelProperties

function sketchFor(properties: Record<string, unknown>): string {
  return generateTouchCalibrationSketch(touchCalibrationTargetFor(
    properties,
    tftControllerForProps(properties),
    asTftRotation(properties.tftRotation),
  ))
}

describe('the touch calibration sketch', () => {
  // Built from the panel, so a graph that cannot be deployed calibrates the
  // same as one that can. Nothing here may depend on the rest of the graph.
  it('drives the panel on its own pins', () => {
    const sketch = sketchFor(CYD)
    // Display bus, then the digitiser's separate one — the CYD wires them to
    // different pins, which is exactly the case a shared-bus assumption breaks.
    expect(sketch).toContain(`_tftBegin(_calPanel, ${CYD.csPin}, ${CYD.dcPin}, ${CYD.resetPin}, ${CYD.sckPin}, ${CYD.mosiPin}, ${CYD.backlightPin},`)
    expect(sketch).toContain(`_xptPoint(${CYD.touchCsPin}, ${CYD.touchIrqPin}, ${CYD.touchSckPin}, ${CYD.touchMosiPin}, ${CYD.touchMisoPin},`)
  })

  // GPIO34-39 are input-only on a classic ESP32 and the core logs
  // gpio_pullup_en error 85 for INPUT_PULLUP, which is how the CYD's IRQ on
  // GPIO36 read nothing. Same helper the real generators use, not a copy.
  it('sets the IRQ pin up the way the panel generator does', () => {
    expect(sketchFor(CYD)).toContain('pinMode(36, INPUT);  // classic ESP32 GPIO34-39 have no internal pull-up')
  })

  // A tied reset is 255 all the way through: the emitted helper guards on it,
  // so it must reach the sketch as the sentinel rather than as a GPIO.
  it('passes a tied reset through as the no-pin sentinel', () => {
    expect(CYD.resetPin).toBe(NO_PIN)
    expect(sketchFor(CYD)).toContain(`, ${NO_PIN}, `)
  })

  it('reports raw readings rather than mapped pixels', () => {
    const sketch = sketchFor(CYD)
    expect(sketch).toContain('touchx=%u touchy=%u')
    // Mapped with the full ADC range, never the stored bounds: calibrating
    // against the value being measured would make the result self-confirming.
    expect(sketch).toContain('0, 4095, 0, 4095,')
    expect(sketch).not.toContain(`${CYD.touchCsPin}, 200, 3900`)
  })

  /*
   * The `.ino` preprocessor hoists a prototype for every function above all
   * type definitions, so a function taking a generated struct by reference
   * fails to compile on a line no generator wrote. This sketch sidesteps it by
   * defining its one helper before its caller and passing nothing by
   * reference — asserted here rather than assumed, since the trap has caught
   * four separate structs already.
   */
  it('defines its helper before the entry points that call it', () => {
    const sketch = sketchFor(CYD)
    expect(sketch.indexOf('static void _calBegin()')).toBeLessThan(sketch.indexOf('void setup()'))
    expect(sketch.indexOf('void setup()')).toBeLessThan(sketch.indexOf('void loop()'))
  })

  // Every symbol it uses, it declares: the helper blocks are pulled from the
  // real generators rather than restated, so a rename there cannot leave this
  // sketch calling something that no longer exists.
  it('declares every helper it calls', () => {
    const sketch = sketchFor(CYD)
    for (const symbol of ['_tftBegin', '_tftBacklight', '_tftRect', '_tftFillRect', '_tftText', '_xptPoint']) {
      expect(sketch, symbol).toContain(`static `)
      expect(sketch.indexOf(`${symbol}(`), symbol).toBeGreaterThan(-1)
      // The definition, not just a call.
      expect(new RegExp(`static [A-Za-z0-9_ *]+${symbol}\\(`).test(sketch), symbol).toBe(true)
    }
  })

  // A square 240x240 module and a 240x320 one put their corner targets in
  // different places, and the numbers have to match the wizard's corner map.
  it('places four numbered targets at the corners of this panel', () => {
    const square = sketchFor({ ...CYD, partId: 'st7789-tft-240x240' })
    const controller = TFT_CONTROLLERS.ST7789
    expect(square).toContain('_tftRect(_calPanel, 0, 0, 28, 28, TFT_C_ACCENT);')
    expect(square).toContain(`_tftRect(_calPanel, ${controller.width - 28}, 0, 28, 28, TFT_C_ACCENT);`)
    expect(square).toContain(`_tftRect(_calPanel, ${controller.width - 28}, ${controller.height - 28}, 28, 28, TFT_C_ACCENT);`)
    expect(square).toContain(`_tftRect(_calPanel, 0, ${controller.height - 28}, 28, 28, TFT_C_ACCENT);`)
    for (const label of ['1', '2', '3', '4']) {
      expect(square, label).toContain(`"${label}", TFT_C_TEXT,`)
    }
  })

  /*
   * The 3x5 font at scale 1 is five pixels tall. This message is read off the
   * glass at arm's length, not in a screenshot, and — unlike every other fixed
   * field, which carries a stranger's title and must truncate — its text is
   * known ahead of time, so it can be sized to fit. Same exemption
   * `waitingMessageScale` already takes.
   */
  it('sizes its own instruction to the glass', () => {
    const sketch = sketchFor(CYD)
    const scales = [...sketch.matchAll(/"(?:TOUCH THE|NUMBERED BOX)", TFT_C_DIM, (\d+)\)/g)]
      .map((match) => Number(match[1]))
    expect(scales).toHaveLength(2)
    expect(scales[0]).toBeGreaterThan(1)
    // One scale for both lines: two sizes in one message reads as emphasis.
    expect(new Set(scales).size).toBe(1)
  })

  // Rotation is the panel's, and the touch mapping has to use the same one or
  // the targets drawn and the coordinates reported disagree.
  it('follows the panel rotation', () => {
    expect(sketchFor({ ...CYD, tftRotation: '90' })).toContain(', 1, x, y, rawX, rawY);')
    expect(sketchFor({ ...CYD, tftRotation: '0' })).toContain(', 0, x, y, rawX, rawY);')
  })

  // Nothing here renders pixels, so the largest library in the build has no
  // reason to be compiled — arduino-cli builds every file in a library folder
  // whether the sketch uses it or not.
  it('carries no FastLED', () => {
    const sketch = sketchFor(CYD)
    expect(sketch).not.toContain('#include <FastLED.h>')
    expect(sketch).not.toContain('CRGB')
  })
})
